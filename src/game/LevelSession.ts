import * as THREE from 'three';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { RAPIER } from '../physics/rapier';
import { EventBus } from './events';
import { GripRegistry, Sim } from './Sim';
import type { LevelDef, SpawnSet, Vec3 } from '../levels/types';
import { BuiltLevel, LevelBuilder } from '../levels/LevelBuilder';
import { Player } from '../entities/Player';
import { PlayerRig } from '../entities/PlayerRig';
import type { Cargo } from '../entities/cargo/Cargo';
import { createCargo } from '../entities/cargo';
import { CameraRig } from '../render/CameraRig';
import type { Renderer } from '../render/Renderer';
import { DEFAULT_THEME } from '../render/Renderer';
import type { Keyboard } from '../input/Keyboard';
import { tuning } from '../config/tuning';
import { createHazard, Hazard } from '../entities/hazards';
import { Zone } from '../render/Zone';
import { Effects } from '../render/Effects';

export const PLAYER_COLORS = [0xff7a3d, 0x3d9bff];
export const PLAYER_NAMES = ['P1', 'P2'];

export type SessionState = 'playing' | 'delivered' | 'failed';

export interface SessionResult {
  levelId: string;
  success: boolean;
  time: number;
  condition: number;
  value: number;
  falls: number;
  payout: number;
  timeBonus: number;
  penalty: number;
  cargoName: string;
}

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const _a = new THREE.Vector3();
const DEG = Math.PI / 180;

/** A spawn set resolved to world space (it may ride on a moving hazard). */
interface SpawnPose {
  p: [THREE.Vector3, THREE.Vector3];
  yaw: number;
  cargo: THREE.Vector3;
  cargoRot: THREE.Quaternion;
  vel: THREE.Vector3;
}

/** One attempt at one level. */
export class LevelSession {
  readonly sim: Sim;
  readonly events = new EventBus();
  readonly physics = new PhysicsWorld();
  readonly players: Player[] = [];
  readonly rigs: PlayerRig[] = [];
  cargo!: Cargo;
  hazards: Hazard[] = [];
  level: BuiltLevel;
  readonly root = new THREE.Group();
  readonly cameraRig: CameraRig;
  readonly effects: Effects;
  state: SessionState = 'playing';
  stateTime = 0;
  time = 0;
  falls = 0;
  checkpoint = -1;
  private spawn: SpawnSet;
  private goalZone: Zone;
  private cpZones: Zone[] = [];
  private goalTimer = 0;
  /** Seconds the cargo has been in the goal and settled (0..needed). */
  goalProgress = 0;
  /** The cargo is in the goal but someone is still holding it. */
  goalHeld = false;
  readonly goalNeeded = 1.2;
  result: SessionResult | null = null;
  paused = false;
  /** Menu background mode: intents come from Attract, not the keyboard; nothing is scored. */
  attractMode = false;
  /** Tests: intents are set directly, the keyboard is ignored, everything else is real. */
  scriptedInput = false;

  constructor(
    readonly def: LevelDef,
    private renderer: Renderer,
    private keyboard: Keyboard,
  ) {
    this.sim = {
      physics: this.physics,
      scene: this.root,
      events: this.events,
      grips: new GripRegistry(),
      time: () => this.physics.time,
      signals: new Map(),
    };
    renderer.scene.add(this.root);
    renderer.applyTheme({ ...DEFAULT_THEME, ...(def.theme ?? {}) });
    this.effects = new Effects(this.root, this.events);
    this.sim.fx = this.effects;
    this.effects.groundAt = (x, y, z) => {
      const hit = this.physics.world.castRay(new RAPIER.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }), 30, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
      return hit ? y - hit.timeOfImpact : y - 30;
    };

    // world
    this.level = new LevelBuilder(this.sim).build(def);
    this.root.add(this.level.root);
    for (const o of def.objects) if (o.type === 'hazard') {
      const h = createHazard(o, this.sim, this.level);
      if (h) this.hazards.push(h);
    }

    // zones
    this.goalZone = new Zone(v3(def.goal.pos), v3(def.goal.size), 0x52d39a, def.goal.label ?? 'DELIVER HERE');
    this.root.add(this.goalZone.object);
    def.checkpoints.forEach((c, i) => {
      const z = new Zone(v3(c.pos), v3(c.size), 0xffc94d, `CHECKPOINT ${i + 1}`, true);
      this.cpZones.push(z);
      this.root.add(z.object);
    });

    // movers
    this.spawn = def.spawn;
    const s = this.spawnPose(def.spawn);
    for (let i = 0; i < 2; i++) {
      const p = new Player(this.sim, {
        index: i,
        name: PLAYER_NAMES[i],
        color: PLAYER_COLORS[i],
        position: s.p[i],
        yaw: s.yaw,
      });
      this.players.push(p);
      const rig = new PlayerRig(p, this.physics);
      this.rigs.push(rig);
      this.root.add(rig.root);
    }
    this.cargo = createCargo(def.cargo, this.sim, { pos: s.cargo, yaw: 0, rot: s.cargoRot, vel: s.vel });
    this.sim.players = this.players;
    this.sim.cargo = this.cargo;

    // physics hooks
    this.physics.preStep.push((dt) => {
      for (const h of this.hazards) h.preStep(dt);
      for (const p of this.players) p.preStep(dt);
      this.cargo.preStep(dt);
    });
    this.physics.postStep.push((dt) => {
      for (const p of this.players) p.postStep(dt);
      this.cargo.postStep(dt);
      for (const h of this.hazards) h.postStep?.(dt);
    });

    this.cameraRig = new CameraRig(renderer.camera);
    this.cameraRig.reset(def.cameraYaw, this.focusPoints());

    this.events.on('knock', (e) => this.cameraRig.addShake(Math.min(0.5, e.strength * 0.03)));
    this.events.on('cargoBreak', () => this.cameraRig.addShake(0.5));
    this.events.on('cargoDamage', (e) => {
      this.cameraRig.addShake(Math.min(0.35, e.amount * 3));
      for (const r of this.rigs) r.worriedTime = 1.4;
    });
  }

  /** Dev/test hook: replace what the camera frames. */
  focusOverride: (() => THREE.Vector3[]) | null = null;

  private focusPoints(): THREE.Vector3[] {
    if (this.focusOverride) return this.focusOverride();
    const pts: THREE.Vector3[] = [];
    for (const p of this.players) {
      const v = this.physics.interpolatedPosition(p.body, new THREE.Vector3());
      // ignore a player who is far below (falling off) so the camera doesn't dive
      if (v.y > this.def.killY + 2) pts.push(v);
    }
    const c = this.physics.interpolatedPosition(this.cargo.body, new THREE.Vector3());
    if (c.y > this.def.killY + 2) pts.push(c, c.clone());
    return pts;
  }

  /** Per rendered frame. */
  update(frameDt: number) {
    const kb = this.keyboard;
    const b = kb.bindings;
    const camF = this.cameraRig.forward(new THREE.Vector3());
    const camR = this.cameraRig.right(new THREE.Vector3());
    const playing = this.state === 'playing' || this.state === 'delivered';

    // input -> intents
    if (!this.paused && !this.attractMode && !this.scriptedInput) {
      const binds = [b.p1, b.p2];
      this.players.forEach((p, i) => {
        const m = kb.readPlayer(binds[i]);
        const ctl = playing && this.state !== 'delivered';
        p.intent.moveX = ctl ? camR.x * m.x + camF.x * m.y : 0;
        p.intent.moveZ = ctl ? camR.z * m.x + camF.z * m.y : 0;
        p.intent.jump = ctl && m.jump;
        if (ctl && m.jumpPressed) p.intent.jumpPressed = true;
        p.intent.grab = (ctl || this.state === 'delivered') && m.grab;
      });
    }

    const dt = this.paused ? 0 : frameDt;
    if (dt > 0) {
      this.physics.advance(dt);
      this.time += this.state === 'playing' ? dt : 0;
      this.stateTime += dt;
      this.checkZones(dt);
    }
    this.physics.syncVisuals();
    for (const r of this.rigs) r.update(frameDt);
    this.cargo.update(frameDt, this.physics.time);
    for (const h of this.hazards) h.update(frameDt, this.physics.time);
    this.goalZone.update(frameDt, this.goalProgress / this.goalNeeded);
    this.cpZones.forEach((z, i) => z.update(frameDt, i <= this.checkpoint ? 1 : 0));
    this.effects.update(frameDt);

    let rot = 0;
    if (!this.paused) {
      if (kb.isDown(b.camLeft)) rot -= 1;
      if (kb.isDown(b.camRight)) rot += 1;
    }
    const pts = this.focusPoints();
    this.cameraRig.update(frameDt, pts.length ? pts : [this.cameraRig.focusPoint.clone()], rot);
    this.fadeOccluders(frameDt, pts);
    this.renderer.setShadowFocus(this.cameraRig.focusPoint, this.cameraRig.currentDistance * 0.9 + 6);
  }

  private ray = new THREE.Raycaster();
  /** Walls marked `fade` go see-through when they hide a mover or the cargo. */
  private fadeOccluders(dt: number, pts: THREE.Vector3[]) {
    const faders = this.level.faders;
    if (!faders.length) return;
    const cam = this.renderer.camera.position;
    const hidden = new Set<THREE.Object3D>();
    for (const p of pts) {
      const dir = p.clone().sub(cam);
      const dist = dir.length();
      this.ray.set(cam, dir.normalize());
      this.ray.far = dist - 0.3;
      for (const hit of this.ray.intersectObjects(faders, false)) hidden.add(hit.object);
    }
    for (const m of faders) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const target = hidden.has(m) ? 0.18 : 1;
      const o = mat.opacity + (target - mat.opacity) * Math.min(1, dt * 8);
      mat.opacity = o;
      const fading = o < 0.98;
      if (mat.transparent !== fading) {
        mat.transparent = fading;
        mat.depthWrite = !fading;
        mat.needsUpdate = true;
      }
      m.castShadow = true;
    }
  }

  private inZone(p: THREE.Vector3, pos: Vec3, size: Vec3, pad = 0) {
    return (
      Math.abs(p.x - pos[0]) <= size[0] / 2 + pad &&
      Math.abs(p.y - pos[1]) <= size[1] / 2 + pad &&
      Math.abs(p.z - pos[2]) <= size[2] / 2 + pad
    );
  }

  private checkZones(dt: number) {
    const def = this.def;
    const cargoPos = this.cargo.position(new THREE.Vector3());

    // checkpoints: reached when the cargo (or both players) gets there
    def.checkpoints.forEach((cp, i) => {
      if (i <= this.checkpoint) return;
      const cargoIn = this.inZone(cargoPos, cp.pos, cp.size, 0.2);
      if (cargoIn) {
        this.checkpoint = i;
        this.spawn = cp.spawn;
        this.events.emit('checkpoint', { index: i, pos: v3(cp.pos) });
      }
    });

    if (this.attractMode) {
      for (const p of this.players) if (p.body.translation().y < def.killY) this.respawnPlayer(p);
      if (cargoPos.y < def.killY) this.respawnAll(false);
      this.cargo.health = 1;
      return;
    }
    if (this.state === 'playing') {
      // out of bounds
      for (const p of this.players) {
        if (p.body.translation().y < def.killY) this.respawnPlayer(p);
      }
      if (cargoPos.y < def.killY && !this.cargo.destroyed) this.respawnAll(true);

      // fail
      if (this.cargo.destroyed) {
        this.goalTimer += dt;
        if (this.goalTimer > 2.2) this.finish(false);
        return;
      }

      // goal: cargo set down inside it (not still in someone's hands) and settled
      const inGoal = this.inZone(cargoPos, def.goal.pos, def.goal.size, 0.05);
      const v = this.cargo.body.linvel();
      const slow = Math.hypot(v.x, v.y, v.z) < 1.2;
      const held = this.sim.grips.isHeld(this.cargo.body);
      this.goalHeld = inGoal && held;
      if (inGoal && slow && !held) this.goalProgress = Math.min(this.goalNeeded, this.goalProgress + dt);
      else this.goalProgress = Math.max(0, this.goalProgress - dt * 2);
      if (this.goalProgress >= this.goalNeeded) {
        this.state = 'delivered';
        this.stateTime = 0;
        this.events.emit('goal', {});
        for (const r of this.rigs) r.happyTime = 4;
      }
    } else if (this.state === 'delivered' && this.stateTime > 2.0 && !this.result) {
      this.finish(true);
    }
  }

  /**
   * Resolve a spawn set to world space. Attached spawns are relative to a
   * moving hazard's current pose and inherit its velocity.
   */
  private spawnPose(s: SpawnSet): SpawnPose {
    const carrier = s.attach ? this.hazards.find((h) => h.tag === s.attach && h.bodyRef) : undefined;
    const pos = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    if (carrier?.bodyRef) {
      const t = carrier.bodyRef.translation();
      const r = carrier.bodyRef.rotation();
      pos.set(t.x, t.y, t.z);
      rot.set(r.x, r.y, r.z, r.w);
    }
    const yawOff = new THREE.Euler().setFromQuaternion(rot, 'YXZ').y;
    const world = (a: Vec3) => v3(a).applyQuaternion(rot).add(pos);
    const local = s.cargoRot
      ? new THREE.Quaternion().setFromEuler(new THREE.Euler(s.cargoRot[0] * DEG, s.cargoRot[1] * DEG, s.cargoRot[2] * DEG))
      : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s.cargoYaw ?? 0) * DEG);
    return {
      p: [world(s.p1), world(s.p2)],
      yaw: s.yaw * DEG + yawOff,
      cargo: world(s.cargo),
      cargoRot: rot.clone().multiply(local),
      vel: carrier?.bodyVel?.clone() ?? new THREE.Vector3(),
    };
  }

  respawnPlayer(p: Player) {
    const s = this.spawnPose(this.spawn);
    const pos = s.p[p.index];
    p.teleport(pos.clone().add(_a.set(0, 0.3, 0)), s.yaw, s.vel);
    this.physics.snapLinks();
    this.falls++;
    this.events.emit('respawn', { pos: pos.clone() });
  }

  /** Put players and cargo back at the last checkpoint. */
  respawnAll(cargoFell: boolean) {
    const s = this.spawnPose(this.spawn);
    for (const p of this.players) p.teleport(s.p[p.index].clone().add(_a.set(0, 0.3, 0)), s.yaw, s.vel);
    this.cargo.reset(s.cargo.clone().add(_a.set(0, 0.25, 0)), s.cargoRot, s.vel);
    this.physics.snapLinks();
    if (cargoFell) this.falls += 2;
    this.events.emit('respawn', { pos: s.cargo.clone() });
  }

  private finish(success: boolean) {
    const condition = this.cargo.destroyed ? 0 : this.cargo.health;
    const value = this.cargo.value;
    const base = success ? value * condition : 0;
    const penalty = success ? Math.min(base, value * 0.05 * this.falls) : 0;
    const timeBonus = success && this.time < this.def.parTime ? Math.round(value * 0.1 * condition) : 0;
    const payout = Math.max(0, Math.round(base - penalty + timeBonus));
    this.result = {
      levelId: this.def.id,
      success,
      time: this.time,
      condition,
      value,
      falls: this.falls,
      payout,
      timeBonus,
      penalty: Math.round(penalty),
      cargoName: this.cargo.displayName,
    };
    if (!success) this.state = 'failed';
  }

  /** Live payout estimate for the HUD. */
  currentPayout() {
    if (this.cargo.destroyed) return 0;
    const v = this.cargo.value * this.cargo.health;
    return Math.max(0, v - this.cargo.value * 0.05 * this.falls);
  }

  dispose() {
    for (const h of this.hazards) h.dispose();
    for (const r of this.rigs) r.dispose();
    this.effects.dispose();
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && m.name === 'static_batch') m.geometry.dispose();
    });
    this.physics.dispose();
    this.events.clear();
  }

  /** Debug summary used by automated tests. */
  debugState() {
    const r = (v: { x: number; y: number; z: number }) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    return {
      state: this.state,
      time: +this.time.toFixed(2),
      falls: this.falls,
      checkpoint: this.checkpoint,
      goalProgress: +this.goalProgress.toFixed(2),
      cargo: { pos: r(this.cargo.body.translation()), health: +this.cargo.health.toFixed(3), destroyed: this.cargo.destroyed },
      players: this.players.map((p) => ({
        pos: r(p.body.translation()),
        state: p.state,
        grounded: p.grounded,
        grips: p.hands.map((h) => (h.grip ? h.grip.kind : null)),
      })),
      tuningHz: tuning.physics.hz,
    };
  }
}
