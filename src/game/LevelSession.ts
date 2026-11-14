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
import { disposeTree } from '../render/dispose';
import { CameraRig } from '../render/CameraRig';
import type { Renderer } from '../render/Renderer';
import { DEFAULT_THEME } from '../render/Renderer';
import { activeOutfits, ITEMS, type Outfit } from './outfits';
import { danceIntent, dressCargo, trailBurst } from './flair';
import { GhostRecorder, GhostView } from './ghost';
import type { RivalCrew } from './rival';
import { mergeMoves, type Keyboard, type MoveState } from '../input/Keyboard';
import { Buddy } from './Buddy';
import type { Touch } from '../input/Touch';
import { tuning } from '../config/tuning';
import { createHazard, Hazard } from '../entities/hazards';
import { Zone } from '../render/Zone';
import { Effects } from '../render/Effects';
import type { PartyGame } from '../entities/hazards/party/base';

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
  /** Cash tips pocketed on the way (paid on delivery), and how many. */
  tips: number;
  tipCount: number;
  /** Stretches without a scratch (their bonus is part of `tips`). */
  cleans?: number;
  /** Extra pay (a chaos job's multiplier). */
  bonus: number;
  cargoName: string;
  /** Stacking Tower: boxes standing on the pallet at the drop-off. */
  tower?: number;
  /** Little end-of-job awards (who slipped most, who jumped about…). */
  awards?: string[];
  /** A party game: who won, and the score. */
  party?: { game: string; title: string; winner: number; score: [number, number]; names: [string, string]; cpu: number; line: string };
}

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const _a = new THREE.Vector3();
const DEG = Math.PI / 180;

/** A spawn set resolved to world space (it may ride on a moving hazard). */
interface SpawnPose {
  p: [THREE.Vector3, THREE.Vector3];
  yaw: [number, number];
  cargo: THREE.Vector3;
  cargoRot: THREE.Quaternion;
  vel: THREE.Vector3;
}

/** Online play swaps in keys from elsewhere. */
export interface NetInput {
  player(i: number): MoveState | null;
  cam(): number;
}

/**
 * Online guest: the host runs the level; this sets poses, the clock and the
 * score each frame in place of reading keys and stepping physics.
 */
export interface MirrorDriver {
  frame(s: LevelSession, dt: number): void;
  /** After the per-frame looks have run (put back anything they guessed wrong). */
  afterVisuals?(s: LevelSession): void;
}

/** One attempt at one level. */
export class LevelSession {
  readonly sim: Sim;
  readonly events = new EventBus();
  readonly physics = new PhysicsWorld();
  readonly players: Player[] = [];
  readonly rigs: PlayerRig[] = [];
  /** What the movers wear (online, the guest builds the job with the same pair). */
  readonly outfits: [Outfit, Outfit];
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
  /** Cash tips pocketed so far (on the online guest too: it hears the same events). */
  tips = 0;
  tipCount = 0;
  /** Stretches done without a scratch (their bonuses are in `tips`). */
  cleans = 0;
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
  /** Versus: the other crew (AI, or another laptop's), shown as see-through movers. */
  rival: RivalCrew | null = null;
  /** What each mover got up to (for the awards on the results card). */
  readonly stats = [0, 1].map(() => ({ jumps: 0, slips: 0, knocks: 0, steps: 0, falls: 0, carry: 0 }));
  /** The load's condition at the last checkpoint (a stretch without a scratch earns a bonus). */
  private cleanFrom = 1;
  /** A beat of slow motion for a big moment: real seconds left, and how slow. */
  private slowT = 0;
  private slowK = 1;
  /** Solo: the second mover is a robot that helps (the app sets this). */
  buddy: Buddy | null = null;
  /** A party arena's game (1v1: rounds and a score instead of a delivery). */
  party: PartyGame | null = null;
  /** Online play: where each mover's keys come from instead (null = this keyboard as usual). */
  input: NetInput | null = null;
  /** Phones and tablets: the on-screen controls, for this device's player (P1, here or hosting online) and the camera. */
  touch: Touch | null = null;
  /** Online guest: the host runs this level and we only show it. */
  mirror: MirrorDriver | null = null;
  /** True while the per-frame looks run (online: what happens then isn't sent to the guest). */
  inVisuals = false;
  /** Sparkles round the cargo (a Locker skin), or null. */
  private cargoSkin: ((dt: number, time: number) => void) | null = null;
  /** Hand-made jobs: show the ghost of your best run (the app sets this from Settings). */
  ghostOn = false;
  private ghostRec: GhostRecorder | null = null;
  private ghostView: GhostView | null = null;
  private ghostTried = false;
  /** This delivery was your fastest: it's the new ghost. */
  ghostSaved = false;

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
      heat: [],
      actors: [],
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
    const outfits = (this.outfits = activeOutfits());
    for (let i = 0; i < 2; i++) {
      const p = new Player(this.sim, {
        index: i,
        name: PLAYER_NAMES[i],
        color: ITEMS.color[outfits[i].color]?.hex ?? PLAYER_COLORS[i],
        position: s.p[i],
        yaw: s.yaw[i],
      });
      this.players.push(p);
      const rig = new PlayerRig(p, this.physics);
      rig.applyOutfit(outfits[i]);
      this.rigs.push(rig);
      this.root.add(rig.root);
    }
    this.cargo = createCargo(def.cargo, this.sim, { pos: s.cargo, yaw: 0, rot: s.cargoRot, vel: s.vel });
    // a party arena has no load to deliver: put it away (made all the same, so both laptops have the same bodies)
    this.party = (this.hazards.find((h) => (h as PartyGame).isParty) as PartyGame | undefined) ?? null;
    if (def.party) {
      this.cargo.body.setTranslation({ x: 0, y: -400, z: 0 }, false);
      this.cargo.body.setEnabled(false);
      this.cargo.visual.visible = false;
      this.goalZone.object.visible = false;
    }
    // the company's cargo skin (Player 1's pick in the Locker)
    this.cargoSkin = dressCargo(this.cargo, outfits[0].skin);
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
    this.sim.shake = (a) => this.cameraRig.addShake(a);
    this.sim.live = () => this.state === 'playing' && !this.attractMode;
    this.sim.wet = def.weather === 'rain';
    this.sim.damageScale = def.damageScale ?? 1;
    const exposure = renderer.theme.exposure;
    this.sim.exposure = (k) => (renderer.renderer.toneMappingExposure = exposure * k);
    this.cameraRig.reset(def.cameraYaw, this.focusPoints());

    this.events.on('knock', (e) => this.cameraRig.addShake(Math.min(0.5, e.strength * 0.03)));
    // footprints (a Locker trail)
    this.events.on('step', (e) => trailBurst(this.effects, this.outfits[e.player]?.trail, e.pos));
    this.events.on('cargoBreak', () => this.cameraRig.addShake(0.5));
    this.events.on('tip', (e) => {
      this.tips += e.amount;
      if (e.clean) this.cleans++;
      else this.tipCount++;
    });
    // a little celebration: confetti for a delivery, a puff of stars for a checkpoint
    const confetti = [0xff7a3d, 0x3d9bff, 0xffd23f, 0x52d39a, 0xff8fab, 0xffffff];
    this.events.on('goal', () => {
      const g = v3(def.goal.pos);
      const top = g.y + def.goal.size[1] / 2;
      for (const dx of [-0.6, 0, 0.6])
        this.effects.burst('confetti', g.clone().setY(top + 0.3).add(_a.set(dx * def.goal.size[0] * 0.5, 0, 0)), {
          count: 40,
          speed: 3.2,
          up: 4.5,
          size: 0.07,
          sizeVar: 0.4,
          life: 2.6,
          gravity: 4,
          drag: 1.2,
          colors: confetti,
          ground: g.y - def.goal.size[1] / 2,
        });
    });
    this.events.on('checkpoint', (e) =>
      this.effects.burst('star', e.pos.clone().setY(e.pos.y + 0.6), { count: 10, speed: 2.2, up: 3, size: 0.1, life: 1.1, gravity: 6, colors: [0xffd84d, 0xffffff, 0xffe9a0] }),
    );
    this.events.on('cargoDamage', (e) => {
      this.cameraRig.addShake(Math.min(0.35, e.amount * 3));
      for (const r of this.rigs) r.worriedTime = 1.4;
    });
    // big moments get a beat of slow motion and a push in from the camera
    this.events.on('cargoDamage', (e) => {
      if (e.amount >= 0.05) {
        this.slowMo(0.05 + Math.min(0.09, e.amount * 0.4), 0.12);
        this.cameraRig.punch(Math.min(0.6, e.amount * 3));
      }
    });
    this.events.on('cargoBreak', () => {
      this.slowMo(0.3, 0.12);
      this.cameraRig.punch(1);
    });
    this.events.on('knock', (e) => e.strength >= 9 && this.slowMo(0.05, 0.2));
    this.events.on('goal', () => {
      this.slowMo(0.8, 0.4);
      this.cameraRig.punch(1);
    });
    this.events.on('partyPoint', () => this.slowMo(0.14, 0.25));
    // who did what (for the awards)
    this.events.on('jump', (e) => this.stats[e.player] && this.stats[e.player].jumps++);
    this.events.on('slip', (e) => this.stats[e.player] && this.stats[e.player].slips++);
    this.events.on('knock', (e) => this.stats[e.player] && this.stats[e.player].knocks++);
    this.events.on('step', (e) => this.stats[e.player] && this.stats[e.player].steps++);
    // a party point: confetti in the winner's colour
    this.events.on('partyPoint', (e) => {
      const col = this.players[e.who]?.color ?? 0xffffff;
      this.effects.burst('confetti', e.pos.clone().setY(e.pos.y + 1.2), { count: 50, speed: 3.4, up: 5, size: 0.07, sizeVar: 0.4, life: 2.4, gravity: 4, drag: 1.2, colors: [col, col, 0xffffff, 0xffd23f] });
      this.cameraRig.addShake(0.25);
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
    if (this.party) {
      for (const f of this.party.focus()) pts.push(f);
      return pts;
    }
    const c = this.physics.interpolatedPosition(this.cargo.body, new THREE.Vector3());
    // …or cargo floating away into the sky
    if (c.y > this.def.killY + 2 && c.y < (this.def.ceilingY ?? Infinity) - 4) pts.push(c, c.clone());
    return pts;
  }

  /** Per rendered frame. */
  update(frameDt: number) {
    const kb = this.keyboard;
    const b = kb.bindings;
    const camF = this.cameraRig.forward(new THREE.Vector3());
    const camR = this.cameraRig.right(new THREE.Vector3());
    const playing = this.state === 'playing' || this.state === 'delivered';

    if (this.mirror) {
      this.mirror.frame(this, frameDt);
    }

    // input -> intents
    if (!this.mirror && !this.paused && !this.attractMode && !this.scriptedInput) {
      const binds = [b.p1, b.p2];
      this.players.forEach((p, i) => {
        // solo: the robot drives the second mover, and either set of keys drives the first
        if (i === 1 && this.buddy) return;
        let m = this.input?.player(i) ?? kb.readPlayer(binds[i]);
        // (against the computer, too: it plays P2)
        if (i === 0 && (this.buddy || this.party?.cpu) && !this.input) m = mergeMoves(m, kb.readPlayer(binds[1]));
        if (i === 0 && this.touch) m = this.touch.merge(m);
        const ctl = playing && this.state !== 'delivered';
        let mx = !ctl ? 0 : m.world ? m.x : camR.x * m.x + camF.x * m.y;
        let mz = !ctl ? 0 : m.world ? m.y : camR.z * m.x + camF.z * m.y;
        // chaos: mirror controls (left and right swap, seen from this camera)
        if (this.sim.flipControls) {
          const along = mx * camR.x + mz * camR.z;
          mx -= 2 * along * camR.x;
          mz -= 2 * along * camR.z;
        }
        p.intent.moveX = mx;
        p.intent.moveZ = mz;
        p.intent.jump = ctl && m.jump;
        if (ctl && m.jumpPressed) p.intent.jumpPressed = true;
        p.intent.grab = (ctl || this.state === 'delivered') && m.grab;
      });
    }

    if (this.buddy && !this.mirror && !this.paused && !this.attractMode) {
      // solo: Z / C (or , and .) turn the load
      if (!this.scriptedInput) this.buddy.turn = Math.max(-1, Math.min(1, (kb.isDown(['KeyC', 'Period']) ? 1 : 0) - (kb.isDown(['KeyZ', 'Comma']) ? 1 : 0) + (this.touch?.turn() ?? 0)));
      this.buddy.update(frameDt);
    }
    // a party game: everybody waits for the countdown; the computer plays P2
    if (this.party && !this.mirror && !this.paused && !this.attractMode) this.party.drive(frameDt);
    // (chaos can slow the clock down or speed it up)
    // delivered: everybody does their victory dance (from the Locker)
    if (this.state === 'delivered' && !this.mirror && !this.attractMode && !this.scriptedInput && !this.paused)
      this.players.forEach((p, i) => danceIntent(p, this.outfits[i]?.dance ?? 'wave', this.stateTime, frameDt, i, v3(this.def.goal.pos)));
    // (a beat of slow motion runs on the real clock)
    const slow = this.slowT > 0 ? this.slowK : 1;
    if (this.slowT > 0 && !this.paused) this.slowT -= frameDt;
    const dt = this.paused || this.mirror ? 0 : frameDt * (this.sim.timeScale ?? 1) * slow;
    if (dt > 0 && this.state === 'playing') for (const p of this.players) if (p.hands.some((h) => h.grip?.kind === 'cargo')) this.stats[p.index].carry += dt;
    if (dt > 0) {
      this.physics.advance(dt);
      this.time += this.state === 'playing' ? dt : 0;
      this.stateTime += dt;
      this.checkZones(dt);
    }
    this.ghosts();
    this.rival?.update(this.time);
    this.inVisuals = true;
    this.physics.syncVisuals();
    for (const r of this.rigs) r.update(frameDt);
    this.cargo.update(frameDt, this.physics.time);
    for (const h of this.hazards) h.update(frameDt, this.physics.time);
    this.goalZone.update(frameDt, this.goalProgress / this.goalNeeded);
    this.cpZones.forEach((z, i) => z.update(frameDt, i <= this.checkpoint ? 1 : 0));
    if (this.def.weather) this.rain(frameDt);
    this.cargoSkin?.(frameDt, this.physics.time);
    this.effects.update(frameDt);
    this.inVisuals = false;
    this.mirror?.afterVisuals?.(this);

    let rot = 0;
    if (!this.paused) {
      if (kb.isDown(b.camLeft)) rot -= 1;
      if (kb.isDown(b.camRight)) rot += 1;
      rot = Math.max(-1, Math.min(1, rot + (this.input?.cam() ?? 0) + (this.touch?.cam() ?? 0)));
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
    if (def.party) {
      // a party game keeps its own score; someone who falls right out comes back
      for (const p of this.players) if (p.body.translation().y < def.killY) this.respawnPlayer(p);
      if (this.party?.finished && !this.result) this.finishParty();
      return;
    }
    const cargoPos = this.cargo.position(new THREE.Vector3());

    // checkpoints: reached when the cargo (or both players) gets there
    def.checkpoints.forEach((cp, i) => {
      if (i <= this.checkpoint) return;
      const cargoIn = this.inZone(cargoPos, cp.pos, cp.size, 0.2);
      if (cargoIn) {
        this.checkpoint = i;
        this.spawn = cp.spawn;
        this.events.emit('checkpoint', { index: i, pos: v3(cp.pos) });
        this.cleanStretch(v3(cp.pos));
      }
    });

    // cargo that floats off into the sky is as lost as cargo that falls
    const lost = cargoPos.y < def.killY || (def.ceilingY !== undefined && cargoPos.y > def.ceilingY);
    if (this.attractMode) {
      for (const p of this.players) if (p.body.translation().y < def.killY) this.respawnPlayer(p);
      if (lost) this.respawnAll(false);
      this.cargo.health = 1;
      return;
    }
    if (this.state === 'playing') {
      // out of bounds
      for (const p of this.players) {
        if (p.body.translation().y < def.killY) this.respawnPlayer(p);
      }
      if (lost && !this.cargo.destroyed) this.respawnAll(true);

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
        if (def.checkpoints.length) this.cleanStretch(v3(def.goal.pos));
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
    // cargoRot: tilt (X) and roll (Z) first, then turn (Y) — reads like "lay it down, then face it"
    const local = s.cargoRot
      ? new THREE.Quaternion().setFromEuler(new THREE.Euler(s.cargoRot[0] * DEG, s.cargoRot[1] * DEG, s.cargoRot[2] * DEG, 'YXZ'))
      : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s.cargoYaw ?? 0) * DEG);
    return {
      p: [world(s.p1), world(s.p2)],
      yaw: [(s.yaws?.[0] ?? s.yaw) * DEG + yawOff, (s.yaws?.[1] ?? s.yaw) * DEG + yawOff],
      cargo: world(s.cargo),
      cargoRot: rot.clone().multiply(local),
      vel: carrier?.bodyVel?.clone() ?? new THREE.Vector3(),
    };
  }

  /** A beat of slow motion (`k` of normal speed, for `seconds` of real time): the slowest asked for wins. */
  slowMo(seconds: number, k: number) {
    if (this.attractMode || this.mirror) return;
    if (this.slowT <= 0 || k <= this.slowK) {
      this.slowT = Math.max(this.slowT, seconds);
      this.slowK = k;
    }
  }

  /** A stretch of the course done without a scratch on the load: a little bonus (paid like a tip). */
  private cleanStretch(at: THREE.Vector3) {
    if (this.attractMode || this.cargo.destroyed) return;
    const clean = this.cargo.health >= this.cleanFrom - 0.002;
    this.cleanFrom = this.cargo.health;
    if (!clean || this.cargo.kind === 'pallet') return;
    const amount = Math.max(10, Math.round((this.cargo.value * 0.02) / 5) * 5);
    this.events.emit('tip', { amount, pos: at.clone().setY(at.y + 0.4), clean: true });
  }

  respawnPlayer(p: Player) {
    this.stats[p.index] && this.stats[p.index].falls++;
    const s = this.spawnPose(this.spawn);
    const pos = s.p[p.index];
    p.teleport(pos.clone().add(_a.set(0, 0.3, 0)), s.yaw[p.index], s.vel);
    this.physics.snapLinks();
    this.falls++;
    this.events.emit('respawn', { pos: pos.clone() });
  }

  /** Put players and cargo back at the last checkpoint. */
  respawnAll(cargoFell: boolean) {
    const s = this.spawnPose(this.spawn);
    for (const p of this.players) p.teleport(s.p[p.index].clone().add(_a.set(0, 0.3, 0)), s.yaw[p.index], s.vel);
    this.cargo.reset(s.cargo.clone().add(_a.set(0, 0.25, 0)), s.cargoRot, s.vel);
    this.physics.snapLinks();
    if (cargoFell) this.falls += 2;
    this.events.emit('respawn', { pos: s.cargo.clone() });
  }

  /** Hand-made jobs: record this run, and play back your best one alongside it. */
  private ghosts() {
    if (this.def.generated || this.def.party || this.attractMode || this.mirror || this.state !== 'playing') return;
    this.ghostRec ??= new GhostRecorder();
    this.ghostRec.sample(this.time, [this.players[0].bodyPos, this.players[1].bodyPos, this.cargo.position(new THREE.Vector3())]);
    if (this.ghostOn && !this.ghostTried) {
      this.ghostTried = true;
      const size = new THREE.Box3().setFromObject(this.cargo.visual).getSize(new THREE.Vector3());
      this.ghostView = GhostView.load(this.def.id, size);
      if (this.ghostView) this.root.add(this.ghostView.root);
    }
    this.ghostView?.update(this.time);
  }

  /** Versus: race this crew (null: no race). */
  setRival(r: RivalCrew | null) {
    this.rival?.root.removeFromParent();
    this.rival = r;
    if (r) this.root.add(r.root);
  }

  /** The load's size, roughly (for ghosts). */
  cargoSize() {
    return new THREE.Box3().setFromObject(this.cargo.visual).getSize(new THREE.Vector3());
  }

  private finish(success: boolean) {
    if (success && this.ghostRec && !this.def.generated && !this.attractMode) this.ghostSaved = this.ghostRec.save(this.def.id, this.time);
    const condition = this.cargo.destroyed ? 0 : this.cargo.health;
    const value = this.cargo.value;
    const base = success ? value * condition : 0;
    const penalty = success ? Math.min(base, value * 0.05 * this.falls) : 0;
    const timeBonus = success && this.time < this.def.parTime ? Math.round(value * 0.1 * condition) : 0;
    const tips = success ? this.tips : 0;
    // chaos jobs pay extra for the trouble
    const bonus = success ? Math.round(Math.max(0, base - penalty + timeBonus) * ((this.def.payScale ?? 1) - 1)) : 0;
    const payout = Math.max(0, Math.round(base - penalty + timeBonus + tips + bonus));
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
      tips,
      tipCount: this.tipCount,
      cleans: this.cleans,
      bonus,
      cargoName: this.cargo.displayName,
      awards: this.awards(),
      tower: this.cargo.kind === 'pallet' ? (this.cargo as unknown as { boxes: number }).boxes : undefined,
    };
    if (!success) this.state = 'failed';
  }

  /** Up to two little awards for the results card: whoever stood out, for better or worse. */
  private awards(): string[] {
    const [a, b] = this.stats;
    const name = (i: number) => (i === 1 && this.buddy ? '🤖 The robot' : `P${i + 1}`);
    const out: [number, string][] = [];
    const most = (key: 'jumps' | 'slips' | 'knocks' | 'falls' | 'steps') => (a[key] >= b[key] ? 0 : 1);
    const top = (key: 'jumps' | 'slips' | 'knocks' | 'falls' | 'steps') => Math.max(a[key], b[key]);
    if (top('slips') >= 3) out.push([top('slips') * 3, `🧈 Butterfingers: ${name(most('slips'))} (${top('slips')} slips)`]);
    if (top('knocks') >= 2) out.push([top('knocks') * 5, `😵 Crash test dummy: ${name(most('knocks'))} (knocked over ${top('knocks')}×)`]);
    if (top('falls') >= 2) out.push([top('falls') * 6, `🪂 Sky diver: ${name(most('falls'))} (fell off ${top('falls')}×)`]);
    if (top('jumps') >= 10) out.push([top('jumps'), `🦘 Kangaroo: ${name(most('jumps'))} (${top('jumps')} jumps)`]);
    const lift = a.carry >= b.carry ? 0 : 1;
    const [hi, lo] = lift === 0 ? [a.carry, b.carry] : [b.carry, a.carry];
    if (hi > 12 && hi > lo * 1.5) out.push([8, `💪 Did the heavy lifting: ${name(lift)}`]);
    if (a.jumps + b.jumps === 0 && this.time > 25) out.push([6, '🧘 Feet on the ground: nobody jumped once']);
    if (Math.max(a.steps, b.steps) > 60 && Math.max(a.steps, b.steps) > Math.min(a.steps, b.steps) * 1.6) out.push([4, `🏃 Busy feet: ${name(most('steps'))}`]);
    return out
      .sort((x, y) => y[0] - x[0])
      .slice(0, 2)
      .map((x) => x[1]);
  }

  /** A party game's over. */
  private finishParty() {
    const g = this.party!;
    this.result = {
      levelId: this.def.id,
      success: g.winner === 0 || (g.winner === 1 && !g.cpu),
      time: this.time,
      condition: 1,
      value: 0,
      falls: 0,
      payout: 0,
      timeBonus: 0,
      penalty: 0,
      tips: 0,
      tipCount: 0,
      bonus: 0,
      cargoName: '',
      party: { game: this.def.party!, title: g.title, winner: g.winner, score: [g.score[0], g.score[1]], names: [g.name(0), g.name(1)], cpu: g.cpu, line: g.finalLine() },
    };
  }

  private rainT = 0;
  /** Rain falling round the camera's view (looks only). */
  private rain(dt: number) {
    this.rainT += dt;
    const c = this.cameraRig.focusPoint;
    if (this.def.weather === 'snow') {
      // big soft flakes drifting down
      while (this.rainT > 1 / 40) {
        this.rainT -= 1 / 40;
        const at = new THREE.Vector3(c.x + (Math.random() - 0.5) * 22, c.y + 5 + Math.random() * 4, c.z + (Math.random() - 0.5) * 22);
        this.effects.burst('star', at, { count: 1, speed: 0.6, spread: 1, size: 0.06, life: 4, gravity: 0.5, drag: 1.2, colors: [0xffffff, 0xeef6ff], ground: c.y - 1.2 });
      }
      return;
    }
    const down = new THREE.Vector3(0.12, -1, 0.05);
    while (this.rainT > 1 / 90) {
      this.rainT -= 1 / 90;
      for (let i = 0; i < 5; i++) {
        const at = new THREE.Vector3(c.x + (Math.random() - 0.5) * 20, c.y + 6 + Math.random() * 4, c.z + (Math.random() - 0.5) * 20);
        this.effects.burst('drop', at, { count: 1, speed: 15, spread: 0.02, dir: down, size: 0.034, life: 0.75, gravity: 6, drag: 0, colors: [0xa8c8e8, 0xd0e4f6], ground: c.y - 1.2 });
      }
    }
  }

  /** Live payout estimate for the HUD. */
  currentPayout() {
    if (this.cargo.destroyed) return 0;
    const v = this.cargo.value * this.cargo.health;
    return Math.max(0, v - this.cargo.value * 0.05 * this.falls) * (this.def.payScale ?? 1) + this.tips;
  }

  dispose() {
    // free the level's GPU memory first (hazards detach their own visuals when
    // disposed), or every restart would leave a copy behind
    this.root.removeFromParent();
    disposeTree(this.root);
    for (const h of this.hazards) h.dispose();
    for (const r of this.rigs) r.dispose();
    this.effects.dispose();
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
