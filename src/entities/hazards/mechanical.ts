import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { registerHazard, Hazard } from './registry';
import { bonkPlayers, DEG, hazardCollider, kinematicBody, num, str, v3, vec } from './common';
import { glossy, matte } from '../../render/materials';
import { roundedBox } from '../../levels/LevelBuilder';
import { surfaceTexture } from '../../render/textures';
import { G, groups, SOLID } from '../../physics/groups';
import { Player } from '../Player';
import { models } from '../../render/models';

// ------------------------------------------------------------------ wrecking ball

/**
 * A wrecking ball on a pendulum arc. params: length, amp (deg), period (s),
 * phase (0..1), yaw (deg: swing direction), radius, style 'pendulum' for a
 * brass bob on a wire hung from the ceiling instead of a crane.
 */
class WreckingBall implements Hazard {
  private body: RigidBody;
  private col: Collider;
  private mesh = new THREE.Group();
  private chain: THREE.Mesh;
  private pivot: THREE.Vector3;
  private L: number;
  private amp: number;
  private period: number;
  private phase: number;
  private dir: THREE.Vector3;
  private vel = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private cool = new Map<Player, number>();
  private whooshT = 0;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    this.pivot = v3(o.pos);
    this.L = num(p, 'length', 7);
    this.amp = num(p, 'amp', 55) * DEG;
    this.period = num(p, 'period', 4.2);
    this.phase = num(p, 'phase', 0);
    const yaw = num(p, 'yaw', 0) * DEG;
    this.dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const r = num(p, 'radius', 0.65);
    const start = this.posAt(0);
    this.body = kinematicBody(sim, start);
    this.col = hazardCollider(sim, this.body, RAPIER.ColliderDesc.ball(r).setRestitution(0.3));
    this.prev.copy(start);
    const brass = p?.style === 'pendulum';
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), brass ? glossy(0xd9a93f, 0.25, 0.85) : glossy(0x3b3f4a, 0.35, 0.6));
    ball.castShadow = true;
    if (brass) {
      // a pointed bob, like the real thing
      const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, r * 0.9, 18), ball.material);
      tip.rotation.x = Math.PI;
      tip.position.y = -r * 1.1;
      this.mesh.add(tip);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 8, 16), glossy(0x2b2e36, 0.4, 0.6));
    ring.position.y = r + 0.08;
    this.mesh.add(ball, ring);
    sim.scene.add(this.mesh);
    sim.physics.link(this.body, this.mesh);
    this.chain = new THREE.Mesh(new THREE.CylinderGeometry(brass ? 0.012 : 0.04, brass ? 0.012 : 0.04, 1, 6), glossy(0x5a5f69, 0.5, 0.7));
    this.chain.castShadow = true;
    sim.scene.add(this.chain);
    if (brass) {
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.25, 20), glossy(0xd9a93f, 0.3, 0.8));
      mount.position.copy(this.pivot).add(new THREE.Vector3(0, 0.12, 0));
      sim.scene.add(mount);
      this.extras.push(mount);
      return;
    }
    // the crane arm it hangs from
    const arm = new THREE.Mesh(roundedBox([0.5, 0.5, 4], 0.05, 1), matte(0xf2b134));
    arm.position.copy(this.pivot).add(new THREE.Vector3(0, 0.25, 0));
    arm.rotation.y = yaw + Math.PI / 2;
    arm.castShadow = true;
    sim.scene.add(arm);
    this.extras.push(arm);
  }
  private extras: THREE.Object3D[] = [];

  private posAt(t: number) {
    const a = this.amp * Math.sin(((t / this.period + this.phase) * Math.PI * 2));
    return new THREE.Vector3().copy(this.pivot).addScaledVector(this.dir, Math.sin(a) * this.L).add(new THREE.Vector3(0, -Math.cos(a) * this.L, 0));
  }

  preStep(dt: number) {
    const t = this.sim.time() + dt;
    const p = this.posAt(t);
    this.vel.copy(p).sub(this.prev).multiplyScalar(1 / dt);
    this.prev.copy(p);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    if (bonkPlayers(this.sim, this.col, this.vel, 2, 7, this.cool, this.sim.time())) {
      this.sim.events.emit('hazard', { pos: p.clone(), kind: 'wreck' });
    }
    this.whooshT -= dt;
    if (this.whooshT <= 0 && this.vel.length() > this.L * this.amp * 0.8 * (2 * Math.PI / this.period) * 0.85) {
      this.whooshT = this.period / 2 - 0.2;
      this.sim.events.emit('hazard', { pos: p.clone(), kind: 'whoosh' });
    }
  }

  update() {
    const b = this.mesh.position;
    const mid = b.clone().add(this.pivot).multiplyScalar(0.5);
    this.chain.position.copy(mid);
    const d = this.pivot.clone().sub(b);
    this.chain.scale.set(1, d.length(), 1);
    this.chain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  dispose() {
    this.chain.removeFromParent();
    this.mesh.removeFromParent();
    for (const e of this.extras) e.removeFromParent();
  }
}
registerHazard('wreckingBall', (o, sim) => new WreckingBall(o, sim));

// ------------------------------------------------------------------ see-saw

/** A plank balanced on a fulcrum. params: length, width, maxAngle (deg), mass. */
class SeeSaw implements Hazard {
  private plank: RigidBody;
  private mesh: THREE.Mesh;
  constructor(o: HazardObj, sim: Sim) {
    const p = o.params;
    const L = num(p, 'length', 6);
    const W = num(p, 'width', 1.4);
    const maxA = num(p, 'maxAngle', 16) * DEG;
    const yaw = (o.rot?.[1] ?? 0) * DEG;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const pos = v3(o.pos);
    const world = sim.physics.world;
    const base = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    hazardCollider(sim, base, RAPIER.ColliderDesc.cuboid(0.15, 0.35, W / 2 - 0.1).setTranslation(0, -0.35, 0), 'static');
    this.plank = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y + 0.12, pos.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setAngularDamping(1.5)
        .setCanSleep(false),
    );
    const pc = world.createCollider(
      RAPIER.ColliderDesc.cuboid(L / 2, 0.1, W / 2).setMass(num(p, 'mass', 45)).setFriction(0.9).setCollisionGroups(groups(G.PROP, SOLID)),
      this.plank,
    );
    sim.physics.setInfo(pc, { kind: 'static', material: 'wood', grabbable: true });
    const j = world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.12, z: 0 }, { x: 0, y: 0, z: 1 }), base, this.plank, true);
    (j as unknown as { setLimits(a: number, b: number): void }).setLimits(-maxA, maxA);
    this.mesh = new THREE.Mesh(roundedBox([L, 0.2, W], 0.04, 2.4), matte(0xd9a066, { map: surfaceTexture('planks'), key: 'seesaw' }));
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    sim.scene.add(this.mesh);
    sim.physics.link(this.plank, this.mesh);
    const fulcrum = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.45, 0.7, 3), matte(0xe9554b));
    fulcrum.rotation.set(Math.PI / 2, 0, 0);
    fulcrum.rotation.z = 0;
    const f = new THREE.Group();
    f.position.copy(pos).add(new THREE.Vector3(0, -0.35, 0));
    f.quaternion.copy(q);
    const tri = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.5, 0.7, 3, 1), matte(0xe9554b));
    tri.scale.set(1, 1, W * 0.9);
    tri.rotation.set(0, Math.PI / 6, 0);
    tri.castShadow = true;
    f.add(tri);
    sim.scene.add(f);
    this.extra = f;
  }
  private extra: THREE.Object3D;
  preStep() {}
  update() {}
  dispose() {
    this.mesh.removeFromParent();
    this.extra.removeFromParent();
  }
}
registerHazard('seesaw', (o, sim) => new SeeSaw(o, sim));

// ------------------------------------------------------------------ mover (platforms, trucks, cars)

/**
 * Something kinematic that follows a path. params:
 *   points: Vec3[] (offsets from pos), speed (m/s), mode 'loop'|'pingpong'|'once',
 *   wait (s at ends), size (box), model, modelSize, faceTravel (bool),
 *   startDelay (s), trigger 'players' (wait until both movers are on it),
 *   bob (m height of road bumps), bumpEvery (s between bumps), shake (vibration),
 *   accel (m/s², eases in/out; 0 = instant), colliders: [{size, offset, color, texture, invisible}],
 *   decor: [{size, offset, color, wheel}], bonk (knock players it hits).
 */
class Mover implements Hazard {
  private body: RigidBody;
  private cols: Collider[] = [];
  private visual = new THREE.Group();
  private pts: THREE.Vector3[];
  private seg = 0;
  private s = 0;
  private dirSign = 1;
  private wait = 0;
  private speed: number;
  private mode: string;
  private faceTravel: boolean;
  private yaw = 0;
  private startDelay: number;
  private trigger: string;
  private started = false;
  private bob: number;
  private bumpEvery: number;
  private bumpT = 0;
  private vel = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private cool = new Map<Player, number>();
  private bonk: boolean;
  private bounds: THREE.Box3;
  private shake: number;
  private finished = false;
  readonly tag?: string;
  private accel = 0;
  private curSpeed = 0;
  private wheels: THREE.Mesh[] = [];
  /** Current pose and velocity (for spawns attached to this mover). */
  get bodyRef() {
    return this.body;
  }
  get bodyVel() {
    return this.vel;
  }

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    const base = v3(o.pos);
    const raw = (p?.points as [number, number, number][] | undefined) ?? [
      [0, 0, 0],
      [0, 0, -6],
    ];
    this.pts = raw.map((r) => base.clone().add(new THREE.Vector3(...r)));
    this.speed = num(p, 'speed', 2);
    this.mode = str(p, 'mode', 'pingpong');
    this.faceTravel = !!p?.faceTravel;
    this.startDelay = num(p, 'startDelay', 0);
    this.trigger = str(p, 'trigger', 'none');
    this.bob = num(p, 'bob', 0);
    this.bumpEvery = num(p, 'bumpEvery', 1.8);
    this.shake = num(p, 'shake', 0);
    this.bonk = !!p?.bonk;
    this.tag = o.tag;
    this.yaw = (o.rot?.[1] ?? 0) * DEG;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body = kinematicBody(sim, this.pts[0], q);
    this.prev.copy(this.pts[0]);
    const cols = (p?.colliders as { size: [number, number, number]; offset?: [number, number, number]; color?: number; texture?: string; invisible?: boolean }[] | undefined) ?? [
      { size: vec(p, 'size', [3, 0.4, 3]) },
    ];
    const surfaceFriction = num(p, 'friction', 0.9);
    for (const c of cols) {
      const off = c.offset ?? [0, 0, 0];
      this.cols.push(
        hazardCollider(sim, this.body, RAPIER.ColliderDesc.cuboid(c.size[0] / 2, c.size[1] / 2, c.size[2] / 2).setTranslation(off[0], off[1], off[2]), this.bonk ? 'hazard' : 'static', surfaceFriction),
      );
      if ((!p?.model || p?.showColliders) && !c.invisible) {
        const tex = c.texture ?? (p?.texture as string | undefined) ?? 'metal';
        const m = new THREE.Mesh(
          roundedBox(c.size, 0.04, 1.5),
          matte(c.color ?? (p?.color as number) ?? 0xc9c6c0, { map: tex === 'none' ? null : surfaceTexture(tex as 'metal'), key: 'mover_' + tex }),
        );
        m.position.set(off[0], off[1], off[2]);
        m.castShadow = m.receiveShadow = true;
        this.visual.add(m);
      }
    }
    // visual-only parts (wheels, windows, stripes)
    const decor = (p?.decor as { size: [number, number, number]; offset: [number, number, number]; color: number; wheel?: boolean }[] | undefined) ?? [];
    for (const d of decor) {
      const geo = d.wheel ? new THREE.CylinderGeometry(d.size[0], d.size[0], d.size[1], 18).rotateZ(Math.PI / 2) : roundedBox(d.size, Math.min(0.05, Math.min(...d.size) / 3), 1);
      const m = new THREE.Mesh(geo, d.wheel ? matte(0x24242c) : matte(d.color));
      m.position.set(...d.offset);
      m.castShadow = true;
      this.visual.add(m);
      if (d.wheel) this.wheels.push(m);
    }
    this.accel = num(p, 'accel', 0);
    this.curSpeed = this.accel > 0 ? 0 : this.speed;
    if (p?.model) {
      const inst = models.instance(p.model as string, p.modelSize as [number, number, number] | undefined);
      const mo = vec(p, 'modelOffset', [0, 0, 0]);
      inst.object.position.set(...mo);
      inst.object.rotation.y = num(p, 'modelYaw', 0) * DEG;
      this.visual.add(inst.object);
    }
    sim.scene.add(this.visual);
    sim.physics.link(this.body, this.visual);
    this.bounds = new THREE.Box3();
    for (const c of cols) {
      const off = new THREE.Vector3(...(c.offset ?? [0, 0, 0]));
      const half = new THREE.Vector3(...c.size).multiplyScalar(0.5);
      this.bounds.union(new THREE.Box3(off.clone().sub(half), off.clone().add(half)));
    }
  }

  /** Are both players standing on (inside the footprint of) this mover? */
  private playersAboard() {
    const t = this.body.translation();
    const q = this.body.rotation();
    const inv = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
    const players = this.sim.players ?? [];
    if (!players.length) return false;
    return players.every((pl) => {
      const lp = pl.bodyPos.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(inv);
      return lp.x > this.bounds.min.x - 0.2 && lp.x < this.bounds.max.x + 0.2 && lp.z > this.bounds.min.z - 0.2 && lp.z < this.bounds.max.z + 0.2 && lp.y > this.bounds.min.y - 0.5;
    });
  }

  preStep(dt: number) {
    const time = this.sim.time();
    if (!this.started) {
      if (this.trigger === 'players') {
        if (this.playersAboard()) this.startDelay -= dt;
        else this.startDelay = Math.max(this.startDelay, 1.0);
        if (this.startDelay <= 0) {
          this.started = true;
          this.sim.events.emit('hazard', { pos: this.prev.clone(), kind: 'ding' });
        }
      } else if (time >= this.startDelay) this.started = true;
    }
    let pos = this.prev.clone();
    if (this.started && !this.finished) {
      if (this.wait > 0) this.wait -= dt;
      else {
        // ease in/out: accelerate to speed, brake before the end of a 'once' path
        if (this.accel > 0) {
          let want = this.speed;
          if (this.mode === 'once') {
            let left = -this.s;
            for (let i = this.seg; i < this.pts.length - 1; i++) left += this.pts[i].distanceTo(this.pts[i + 1]);
            want = Math.min(want, Math.sqrt(Math.max(0, 2 * this.accel * left)) + 0.05);
          }
          this.curSpeed += Math.max(-this.accel * dt, Math.min(this.accel * dt, want - this.curSpeed));
        } else this.curSpeed = this.speed;
        let remaining = this.curSpeed * dt;
        while (remaining > 0) {
          const a = this.pts[this.seg];
          const b = this.pts[this.seg + this.dirSign] ?? a;
          const len = a.distanceTo(b);
          if (len < 1e-4) break;
          const left = len - this.s;
          if (remaining < left) {
            this.s += remaining;
            remaining = 0;
          } else {
            remaining -= left;
            this.s = 0;
            this.seg += this.dirSign;
            const atEnd = this.seg === (this.dirSign > 0 ? this.pts.length - 1 : 0);
            if (atEnd) {
              if (this.mode === 'loop') {
                this.seg = 0;
                this.dirSign = 1;
                this.wait = 0;
                pos = this.pts[0].clone();
                this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
                this.prev.copy(pos);
                break;
              } else if (this.mode === 'pingpong') {
                this.dirSign *= -1;
                this.wait = 1.5;
              } else {
                this.finished = true;
                this.sim.events.emit('hazard', { pos: this.pts[this.seg].clone(), kind: 'arrive' });
              }
              break;
            }
          }
        }
        const a = this.pts[this.seg];
        const b = this.pts[this.seg + this.dirSign] ?? a;
        const len = Math.max(1e-4, a.distanceTo(b));
        pos = a.clone().lerp(b, Math.min(1, this.s / len));
        if (this.faceTravel && b.distanceTo(a) > 0.01) {
          const d = b.clone().sub(a);
          const targetYaw = Math.atan2(d.x, d.z);
          let dy = targetYaw - this.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          this.yaw += dy * Math.min(1, dt * 2.5);
        }
      }
    }
    // bumps and shakes ride on top of the path. Both are smooth (no velocity
    // jumps) so cargo riding along gets rocked, not hammered.
    const moving = this.started && !this.finished && this.wait <= 0;
    const pace = this.speed > 0 ? Math.min(1, this.curSpeed / this.speed) : 0;
    if (moving && this.bob > 0) {
      this.bumpT += dt * pace;
      const dur = 0.34;
      const ph = this.bumpT % this.bumpEvery;
      if (ph < dur) pos.y += this.bob * pace * 0.5 * (1 - Math.cos((ph / dur) * Math.PI * 2));
    }
    let roll = 0;
    if (moving && this.shake > 0) {
      pos.y += Math.sin(time * 23) * this.shake * 0.004;
      roll = Math.sin(time * 17) * this.shake * 0.008;
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, this.yaw, roll * 0.7));
    this.body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    this.vel.copy(pos).sub(this.prev).multiplyScalar(1 / dt);
    this.prev.copy(pos);
    if (this.bonk) {
      for (const c of this.cols) {
        if (bonkPlayers(this.sim, c, this.vel, 2.5, 8, this.cool, time)) this.sim.events.emit('honk', { pos: pos.clone() });
      }
    }
  }

  update(dt: number) {
    const sp = this.vel.length();
    for (const w of this.wheels) w.rotateX(sp * dt / 0.45);
  }
  dispose() {
    this.visual.removeFromParent();
  }
}
registerHazard('mover', (o, sim) => new Mover(o, sim));
registerHazard('truck', (o, sim) => new Mover(o, sim));
export { Mover };

/**
 * A shaky two-floor lift. Goes to the other floor once both movers have been
 * aboard for a moment (step off and on again to send it back), and comes when
 * called — both movers waiting at the other floor's landing.
 * params: size [w, d], height, speed, wall (height), walls: sides with a wall
 * (default ['+x', '-z', '+z']; the rest are open), landing (call radius m).
 * travel [x, y, z] (world) instead of height makes it ride a slope, and
 * style 'gondola' hangs it from a cable instead of running it up a shaft.
 */
class Elevator implements Hazard {
  private body: RigidBody;
  private visual = new THREE.Group();
  private base: THREE.Vector3;
  /** Unit direction of travel from the bottom stop to the top stop. */
  private along: THREE.Vector3;
  /** Distance travelled from the bottom stop (m). */
  private y = 0;
  private state: 'bottom' | 'up' | 'top' | 'down' = 'bottom';
  private timer = 0;
  private callTimer = 0;
  /** Becomes true once someone has stepped off since the last arrival. */
  private armed = true;
  private empty = false;
  private height: number;
  private speed: number;
  private w: number;
  private d: number;
  private yaw: number;
  private landing: number;
  private jolt = 0.8;
  private joltY = 0;
  private joltV = 0;
  private vel = new THREE.Vector3();
  get bodyRef() {
    return this.body;
  }
  get bodyVel() {
    return this.vel;
  }
  readonly tag?: string;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    this.tag = o.tag;
    this.base = v3(o.pos);
    const size = (p?.size as [number, number] | undefined) ?? [2.6, 2.6];
    this.w = size[0];
    this.d = size[1];
    const travel = v3(vec(p, 'travel', [0, num(p, 'height', 6), 0]));
    this.height = travel.length();
    this.along = travel.clone().normalize();
    this.speed = num(p, 'speed', 1.0);
    this.landing = num(p, 'landing', 4.5);
    this.yaw = (o.rot?.[1] ?? 0) * DEG;
    const gondola = p?.style === 'gondola';
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body = kinematicBody(sim, this.base, q);
    const wallH = num(p, 'wall', 1.1);
    const sides = (p?.walls as string[] | undefined) ?? ['+x', '-z', '+z'];
    const W = this.w;
    const D = this.d;
    const wallDefs: Record<string, { size: [number, number, number]; off: [number, number, number] }> = {
      '+x': { size: [0.12, wallH, D], off: [W / 2 - 0.06, wallH / 2, 0] },
      '-x': { size: [0.12, wallH, D], off: [-W / 2 + 0.06, wallH / 2, 0] },
      '+z': { size: [W, wallH, 0.12], off: [0, wallH / 2, D / 2 - 0.06] },
      '-z': { size: [W, wallH, 0.12], off: [0, wallH / 2, -D / 2 + 0.06] },
    };
    const parts: { size: [number, number, number]; off: [number, number, number]; color: number }[] = [
      { size: [W, 0.2, D], off: [0, -0.1, 0], color: 0x9aa3ad },
      ...sides.filter((k) => wallDefs[k]).map((k) => ({ ...wallDefs[k], color: 0xd8c7a0 })),
    ];
    for (const part of parts) {
      hazardCollider(sim, this.body, RAPIER.ColliderDesc.cuboid(part.size[0] / 2, part.size[1] / 2, part.size[2] / 2).setTranslation(...part.off), 'static', 0.9);
      const m = new THREE.Mesh(roundedBox(part.size, 0.03, 1.5), matte(part.color, { map: surfaceTexture('metal'), key: 'elev' }));
      m.position.set(...part.off);
      m.castShadow = m.receiveShadow = true;
      this.visual.add(m);
    }
    // yellow-black edge stripes on the open sides
    for (const k of Object.keys(wallDefs)) {
      if (sides.includes(k)) continue;
      const along = k.endsWith('x') ? [0.16, 0.02, D] : [W, 0.02, 0.16];
      const off = wallDefs[k].off;
      const m = new THREE.Mesh(roundedBox(along as [number, number, number], 0.005, 1), matte(0xffd23f, { map: surfaceTexture('hazard'), key: 'elevStripe' }));
      m.position.set(off[0] * 0.94, 0.012, off[2] * 0.94);
      this.visual.add(m);
    }
    // a little lamp that shows when it's moving
    this.lamp = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xffc94d, emissiveIntensity: 0.1 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), this.lamp);
    const lampSide = sides.includes('+x') ? wallDefs['+x'].off : [0, wallH, 0];
    lamp.position.set(lampSide[0], wallH + 0.1, lampSide[2]);
    this.visual.add(lamp);
    if (gondola) {
      // hanger: two posts up from the corners to a yoke, and a cable overhead
      const steel = glossy(0x5a5f69, 0.5, 0.6);
      const top = 3.1;
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, top, 0.09), steel);
        post.position.set(sx * (this.w / 2 - 0.06), top / 2, 0);
        post.castShadow = true;
        this.visual.add(post);
      }
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(this.w, 0.12, 0.12), steel);
      yoke.position.y = top;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 0.25), steel);
      grip.position.y = top + 0.3;
      const roof = new THREE.Mesh(roundedBox([this.w + 0.2, 0.08, this.d * 0.5], 0.03, 1.5), matte(0xd94a3d));
      roof.position.y = top - 0.25;
      roof.castShadow = true;
      this.visual.add(yoke, grip, roof);
      const a = this.base.clone().setY(this.base.y + top + 0.55);
      const b = a.clone().addScaledVector(this.along, this.height);
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), matte(0x2b2b33));
      cable.position.copy(a).add(b).multiplyScalar(0.5);
      cable.scale.y = this.height + 8; // runs on past both stations
      cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.along);
      sim.scene.add(cable);
      this.rails.push(cable);
    }
    sim.scene.add(this.visual);
    sim.physics.link(this.body, this.visual);
    // shaft rails
    if (!gondola)
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, this.height + 2.6, 0.12), glossy(0x5a5f69, 0.5, 0.6));
          const off = new THREE.Vector3(sx * (this.w / 2 + 0.1), (this.height + 2.6) / 2 - 0.2, sz * (this.d / 2 + 0.1)).applyQuaternion(q);
          rail.position.copy(this.base).add(off);
          rail.castShadow = true;
          sim.scene.add(rail);
          this.rails.push(rail);
        }
  }
  private lamp: THREE.MeshStandardMaterial;
  private rails: THREE.Mesh[] = [];

  /** Players aboard, and players waiting at the landing of the other floor. */
  private census() {
    const players = this.sim.players ?? [];
    const t = this.body.translation();
    const inv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    const other = this.base.clone().addScaledVector(this.along, this.state === 'bottom' ? this.height : 0);
    let aboard = 0;
    let waiting = 0;
    for (const pl of players) {
      const lp = pl.bodyPos.clone().sub(new THREE.Vector3(t.x, t.y, t.z)).applyQuaternion(inv);
      if (Math.abs(lp.x) < this.w / 2 + 0.1 && Math.abs(lp.z) < this.d / 2 + 0.1 && lp.y > -0.3 && lp.y < 2.5) aboard++;
      const dy = pl.bodyPos.y - other.y;
      const dh = Math.hypot(pl.bodyPos.x - other.x, pl.bodyPos.z - other.z);
      if (dy > -0.3 && dy < 2.5 && dh < this.landing) waiting++;
    }
    return { aboard, waiting, total: players.length };
  }

  private depart(empty: boolean) {
    this.state = this.state === 'bottom' ? 'up' : 'down';
    this.empty = empty;
    this.armed = false;
    this.timer = 0;
    this.callTimer = 0;
    this.sim.events.emit('hazard', { pos: this.base.clone().addScaledVector(this.along, this.y), kind: 'ding' });
  }

  preStep(dt: number) {
    const { aboard, waiting, total } = this.census();
    if (this.state === 'bottom' || this.state === 'top') {
      if (aboard < total) this.armed = true;
      // everyone aboard (after someone stepped on fresh) -> go
      this.timer = this.armed && total > 0 && aboard === total ? this.timer + dt : 0;
      if (this.timer > 1.3) this.depart(false);
      // called from the other floor
      this.callTimer = aboard === 0 && total > 0 && waiting === total ? this.callTimer + dt : 0;
      if (this.callTimer > 0.8) this.depart(true);
    } else {
      const v = this.speed * (this.empty ? 1.6 : 1);
      this.y += (this.state === 'up' ? v : -v) * dt;
      if (this.y >= this.height || this.y <= 0) {
        this.y = this.state === 'up' ? this.height : 0;
        this.state = this.state === 'up' ? 'top' : 'bottom';
        this.timer = 0;
        this.sim.events.emit('hazard', { pos: this.base.clone().addScaledVector(this.along, this.y), kind: 'ding' });
      }
    }
    const moving = this.state === 'up' || this.state === 'down';
    let shakeY = 0;
    let rx = 0;
    let rz = 0;
    if (moving) {
      const t = this.sim.time();
      shakeY = Math.sin(t * 29) * 0.004 + Math.sin(t * 11) * 0.006;
      rx = Math.sin(t * 7.3) * 0.01;
      rz = Math.sin(t * 5.1) * 0.01;
      this.jolt -= dt;
      if (this.jolt <= 0) {
        this.jolt = 1.4 + Math.random() * 1.8;
        this.joltV = -0.55;
        this.sim.events.emit('hazard', { pos: this.base.clone().addScaledVector(this.along, this.y), kind: 'clunk' });
      }
    }
    // jolts are a sprung dip, so cargo feels a clunk instead of a hammer blow
    this.joltV += (-this.joltY * 380 - this.joltV * 24) * dt;
    this.joltY += this.joltV * dt;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, this.yaw, rz));
    const cur = this.body.translation();
    const np = this.base.clone().addScaledVector(this.along, this.y);
    np.y += shakeY + this.joltY;
    this.vel.set((np.x - cur.x) / dt, (np.y - cur.y) / dt, (np.z - cur.z) / dt);
    this.body.setNextKinematicTranslation({ x: np.x, y: np.y, z: np.z });
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    this.lamp.emissiveIntensity = moving ? 2 + Math.sin(this.sim.time() * 12) : 0.1;
  }
  update() {}
  dispose() {
    this.visual.removeFromParent();
    for (const r of this.rails) r.removeFromParent();
  }
}
registerHazard('elevator', (o, sim) => new Elevator(o, sim));

// ------------------------------------------------------------------ spinner (turnstiles, revolving doors, sweeping arms)

/** params: arms (count), length, height, thickness, speed (rad/s), color. */
class Spinner implements Hazard {
  private body: RigidBody;
  private visual = new THREE.Group();
  private angle = 0;
  private speed: number;
  private pos: THREE.Vector3;
  private cols: Collider[] = [];
  private cool = new Map<Player, number>();
  private bonk: boolean;
  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    this.pos = v3(o.pos);
    this.speed = num(p, 'speed', 0.8);
    this.bonk = !!p?.bonk;
    const arms = num(p, 'arms', 4);
    const L = num(p, 'length', 1.6);
    const H = num(p, 'height', 2.2);
    const T = num(p, 'thickness', 0.08);
    this.body = kinematicBody(sim, this.pos);
    const color = (p?.color as number) ?? 0xb9dcef;
    const glassy = !!p?.glass;
    const mat = glassy
      ? new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false })
      : matte(color);
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2;
      const off = new THREE.Vector3(Math.cos(a) * L / 2, 0, Math.sin(a) * L / 2);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      this.cols.push(
        hazardCollider(
          sim,
          this.body,
          RAPIER.ColliderDesc.cuboid(L / 2, H / 2, T / 2)
            .setTranslation(off.x, 0, off.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
          this.bonk ? 'hazard' : 'static',
        ),
      );
      const m = new THREE.Mesh(roundedBox([L, H, T], 0.02, 1), mat);
      m.position.copy(off);
      m.quaternion.copy(q);
      m.castShadow = !glassy;
      this.visual.add(m);
      const frame = new THREE.Mesh(roundedBox([L, 0.06, T + 0.02], 0.01, 1), glossy(0x8d9aa6, 0.3, 0.6));
      frame.position.copy(off).add(new THREE.Vector3(0, H / 2, 0));
      frame.quaternion.copy(q);
      this.visual.add(frame);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, H, 12), glossy(0x8d9aa6, 0.3, 0.6));
    this.visual.add(post);
    sim.scene.add(this.visual);
    sim.physics.link(this.body, this.visual);
  }
  preStep(dt: number) {
    this.angle += this.speed * dt;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.angle);
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (this.bonk) for (const c of this.cols) bonkPlayers(this.sim, c, new THREE.Vector3(this.speed * 2, 0, 0), 1, 6, this.cool, this.sim.time());
  }
  update() {}
  dispose() {
    this.visual.removeFromParent();
  }
}
registerHazard('spinner', (o, sim) => new Spinner(o, sim));

// ------------------------------------------------------------------ swinging door

/**
 * A door on a spring hinge you push through. params: width, height, side
 * (hinge side ±1), open (deg it rests at, + swings it away from the camera
 * side, i.e. toward the rotation's -Z), spring (1/s², how hard it swings back).
 */
class SwingDoor implements Hazard {
  private door: RigidBody;
  private visual: THREE.Mesh;
  private yaw: number;
  private rest: number;
  private k: number;
  private inertia: number;
  constructor(o: HazardObj, sim: Sim) {
    const p = o.params;
    const W = num(p, 'width', 1.2);
    const H = num(p, 'height', 2.1);
    const side = num(p, 'side', 1);
    this.yaw = (o.rot?.[1] ?? 0) * DEG;
    // a door hinged on the left (+1) opening away from us turns +Y; hinged on the right, -Y
    this.rest = num(p, 'open', 0) * DEG * side;
    this.k = num(p, 'spring', 6);
    const hinge = v3(o.pos);
    const world = sim.physics.world;
    const qHinge = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const anchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(hinge.x, hinge.y, hinge.z).setRotation({ x: qHinge.x, y: qHinge.y, z: qHinge.z, w: qHinge.w }));
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw + this.rest);
    const center = new THREE.Vector3((side * W) / 2, H / 2, 0).applyQuaternion(q).add(hinge);
    this.door = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setAngularDamping(2.5)
        .setCanSleep(false),
    );
    const mass = 18;
    const c = world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2 - 0.02, H / 2, 0.035).setMass(mass).setCollisionGroups(groups(G.PROP, SOLID)), this.door);
    sim.physics.setInfo(c, { kind: 'prop', material: 'wood', grabbable: true });
    // hinge pin; the spring is ours (see preStep), so the rest angle is exactly what we asked for
    world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 0, y: H / 2, z: 0 }, { x: (-side * W) / 2, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }),
      anchor,
      this.door,
      true,
    );
    this.inertia = (mass * W * W) / 3; // a slab turning about its edge
    this.visual = new THREE.Mesh(roundedBox([W - 0.04, H, 0.07], 0.02, 1), matte((p?.color as number) ?? 0xc98f5a, { map: surfaceTexture('planks'), key: 'door' }));
    this.visual.castShadow = true;
    sim.scene.add(this.visual);
    sim.physics.link(this.door, this.visual);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), glossy(0xd9a93f, 0.3, 0.8));
    knob.position.set(side * (W / 2 - 0.15), 0, 0.06);
    this.visual.add(knob);
  }
  preStep(dt: number) {
    const r = this.door.rotation();
    let a = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.z * r.z)) - this.yaw - this.rest;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    const w = this.door.angvel().y;
    const tau = this.inertia * (-this.k * a - 2 * Math.sqrt(this.k) * 0.6 * w);
    this.door.applyTorqueImpulse({ x: 0, y: tau * dt, z: 0 }, true);
  }
  update() {}
  dispose() {
    this.visual.removeFromParent();
  }
}
registerHazard('swingDoor', (o, sim) => new SwingDoor(o, sim));

/**
 * A push-around revolving door: glass wings on a free-spinning (damped) hub
 * inside a drum. pos = hub at floor level. params: wings (3), radius (1.6),
 * height (2.2), mass, damping, drumSpan (deg of drum wall each side), passage
 * yaw = rot[1] (the direction you walk through).
 */
class RevolvingDoor implements Hazard {
  private hub: RigidBody;
  private visual = new THREE.Group();
  private drum = new THREE.Group();
  constructor(o: HazardObj, sim: Sim) {
    const p = o.params;
    const wings = num(p, 'wings', 3);
    const R = num(p, 'radius', 1.6);
    const H = num(p, 'height', 2.2);
    const base = v3(o.pos);
    const yaw = (o.rot?.[1] ?? 0) * DEG;
    const world = sim.physics.world;
    const center = base.clone().add(new THREE.Vector3(0, H / 2 + 0.03, 0));
    const anchor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    this.hub = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2 + 0.3), z: 0, w: Math.cos(yaw / 2 + 0.3) })
        .setAngularDamping(num(p, 'damping', 2.2))
        .setCanSleep(false),
    );
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.38, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const frameMat = glossy(0x8d9aa6, 0.3, 0.6);
    const mass = num(p, 'mass', 40);
    for (let i = 0; i < wings; i++) {
      const a = (i / wings) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
      const off = new THREE.Vector3(Math.cos(a) * (R / 2 + 0.05), 0, Math.sin(a) * (R / 2 + 0.05));
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(R / 2 - 0.05, H / 2, 0.04)
          .setTranslation(off.x, 0, off.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setMass(mass / wings)
          .setFriction(0.3)
          .setCollisionGroups(groups(G.PROP, SOLID)),
        this.hub,
      );
      sim.physics.setInfo(c, { kind: 'prop', material: 'glass', grabbable: true });
      const pane = new THREE.Mesh(roundedBox([R - 0.1, H - 0.1, 0.03], 0.01, 1), glass);
      pane.position.copy(off);
      pane.quaternion.copy(q);
      this.visual.add(pane);
      for (const [y, h] of [
        [H / 2 - 0.03, 0.06],
        [-H / 2 + 0.06, 0.12],
      ]) {
        const bar = new THREE.Mesh(roundedBox([R - 0.1, h, 0.06], 0.01, 1), frameMat);
        bar.position.copy(off).setY(y);
        bar.quaternion.copy(q);
        bar.castShadow = true;
        this.visual.add(bar);
      }
      const edge = new THREE.Mesh(roundedBox([0.05, H, 0.06], 0.01, 1), frameMat);
      edge.position.set(Math.cos(a) * (R - 0.02), 0, Math.sin(a) * (R - 0.02));
      edge.quaternion.copy(q);
      this.visual.add(edge);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, H, 14), frameMat);
    post.castShadow = true;
    this.visual.add(post);
    world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), anchor, this.hub, true);
    sim.scene.add(this.visual);
    sim.physics.link(this.hub, this.visual);

    // the drum: two curved walls either side of the passage, plus a canopy
    const span = num(p, 'drumSpan', 100) * DEG;
    const segs = 6;
    const wallR = R + 0.14;
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.32, roughness: 0.05, depthWrite: false });
    for (const side of [-1, 1]) {
      const mid = yaw + side * Math.PI / 2;
      for (let i = 0; i < segs; i++) {
        const t = mid - span / 2 + (span * (i + 0.5)) / segs;
        const len = (2 * wallR * Math.sin(span / segs / 2)) + 0.04;
        // direction of travel 0 = +Z; a point at angle t sits at (sin t, cos t)
        const pos = new THREE.Vector3(Math.sin(t) * wallR, H / 2, Math.cos(t) * wallR).add(base);
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t + Math.PI / 2);
        const c = world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.05, H / 2, len / 2)
            .setTranslation(pos.x, pos.y, pos.z)
            .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
            .setCollisionGroups(groups(G.STATIC, SOLID | G.DEBRIS)),
          fixed,
        );
        sim.physics.setInfo(c, { kind: 'static', material: 'glass' });
        const m = new THREE.Mesh(roundedBox([0.05, H, len], 0.01, 1), wallMat);
        m.position.copy(pos);
        m.quaternion.copy(q);
        this.drum.add(m);
      }
    }
    // canopy + floor ring are rings, so the camera can see in from above
    const metal = glossy(0x8d9aa6, 0.35, 0.6);
    const canopy = new THREE.Mesh(new THREE.TorusGeometry(wallR, 0.09, 8, 48), metal);
    canopy.rotation.x = Math.PI / 2;
    canopy.position.copy(base).setY(base.y + H + 0.08);
    canopy.castShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, wallR + 0.06, 48), metal);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(base).setY(base.y + 0.014);
    ring.receiveShadow = true;
    this.drum.add(canopy, ring);
    sim.scene.add(this.drum);
  }
  preStep() {}
  update() {}
  dispose() {
    this.visual.removeFromParent();
    this.drum.removeFromParent();
  }
}
registerHazard('revolvingDoor', (o, sim) => new RevolvingDoor(o, sim));

// ------------------------------------------------------------------ fan (wind zone)

/**
 * Blows dynamic things in a box zone. params: size, force (m/s² accel), dir (Vec3),
 * gust: [on, off] seconds to blow in bursts instead of steadily, phase (s) to
 * offset the bursts, housing: false for wind with no fan (a sea breeze).
 * Cargo can catch more or less wind than its mass suggests (Cargo.windScale).
 */
class Fan implements Hazard {
  private zone: THREE.Box3;
  private dir: THREE.Vector3;
  private accel: number;
  private gust: [number, number] | null;
  private phase: number;
  private blades = new THREE.Group();
  private streaks: THREE.InstancedMesh;
  private streakMat: THREE.MeshBasicMaterial;
  private streakT: Float32Array;
  /** 0..1: how hard it is blowing right now. */
  strength = 1;
  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    const pos = v3(o.pos);
    const size = v3(vec(p, 'size', [6, 3, 4]));
    this.zone = new THREE.Box3(pos.clone().sub(size.clone().multiplyScalar(0.5)), pos.clone().add(size.clone().multiplyScalar(0.5)));
    this.dir = v3(vec(p, 'dir', [1, 0, 0])).normalize();
    this.accel = num(p, 'force', 9);
    const g = p?.gust as [number, number] | undefined;
    this.gust = g ? [g[0], g[1]] : null;
    this.phase = num(p, 'phase', 0);
    if (p?.housing !== false) {
      // fan housing at the upwind end
      const fanPos = pos.clone().addScaledVector(this.dir, -size.dot(new THREE.Vector3(Math.abs(this.dir.x), Math.abs(this.dir.y), Math.abs(this.dir.z))) / 2 - 0.3);
      const housing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 10, 32), glossy(0x5b8def, 0.4, 0.3));
      housing.position.copy(fanPos);
      housing.lookAt(fanPos.clone().add(this.dir));
      housing.castShadow = true;
      sim.scene.add(housing);
      this.blades.position.copy(fanPos);
      this.blades.lookAt(fanPos.clone().add(this.dir));
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.0, 0.04), matte(0xf2f2ee));
        b.position.y = 0.5;
        const pivot = new THREE.Group();
        pivot.rotation.z = (i / 4) * Math.PI * 2;
        pivot.add(b);
        this.blades.add(pivot);
      }
      sim.scene.add(this.blades);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, fanPos.y - this.zone.min.y + 0.1, 10), glossy(0x5b8def, 0.4, 0.3));
      stand.position.set(fanPos.x, (fanPos.y + this.zone.min.y) / 2, fanPos.z);
      sim.scene.add(stand);
      this.extras.push(housing, stand);
    }
    // wind streaks
    this.streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.02, 0.02), this.streakMat, 30);
    this.streakT = new Float32Array(30).map(() => Math.random());
    sim.scene.add(this.streaks);
  }
  private extras: THREE.Object3D[] = [];

  /** 0..1 at time t: bursts ease in and out so nothing gets slammed. */
  private level(t: number) {
    if (!this.gust) return 1;
    const [on, off] = this.gust;
    const T = on + off;
    const x = (((t + this.phase) % T) + T) % T;
    if (x >= on) return 0;
    const ramp = Math.min(0.8, on / 2);
    const k = Math.min(1, x / ramp, (on - x) / ramp);
    return k * k * (3 - 2 * k);
  }

  preStep(dt: number) {
    this.strength = this.level(this.sim.time());
    if (this.strength < 0.001) return;
    const world = this.sim.physics.world;
    const c = this.zone.getCenter(new THREE.Vector3());
    const h = this.zone.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const seen = new Set<number>();
    world.collidersWithAabbIntersectingAabb({ x: c.x, y: c.y, z: c.z }, { x: h.x, y: h.y, z: h.z }, (col) => {
      const b = col.parent();
      if (!b || !b.isDynamic() || seen.has(b.handle)) return true;
      seen.add(b.handle);
      const info = this.sim.physics.info(col);
      const scale = info?.kind === 'cargo' ? (info.owner as { windScale(d: THREE.Vector3): number }).windScale(this.dir) : 1;
      const f = this.dir.clone().multiplyScalar(this.accel * b.mass() * dt * this.strength * scale);
      b.applyImpulse({ x: f.x, y: f.y, z: f.z }, true);
      return true;
    });
  }
  update(dt: number) {
    // the blades spool up a second before a gust arrives: that's the warning
    const t = this.sim.time();
    const spin = this.gust ? Math.max(this.strength, this.level(t + 1.0)) : 1;
    this.blades.rotateZ(dt * (1.5 + 13 * spin));
    this.streakMat.opacity = 0.55 * this.strength;
    this.streaks.visible = this.strength > 0.02;
    if (!this.streaks.visible) return;
    const m = new THREE.Matrix4();
    const size = this.zone.getSize(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.dir);
    for (let i = 0; i < 30; i++) {
      this.streakT[i] = (this.streakT[i] + dt * 0.8) % 1;
      const t = this.streakT[i];
      const r = ((i * 7919) % 1000) / 1000;
      const r2 = ((i * 104729) % 1000) / 1000;
      const along = this.dir.x < 0 || this.dir.z < 0 ? 1 - t : t;
      const p = new THREE.Vector3(this.zone.min.x + size.x * (this.dir.x !== 0 ? along : r), this.zone.min.y + size.y * r2 * 0.8 + 0.2, this.zone.min.z + size.z * (this.dir.z !== 0 ? along : r));
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      this.streaks.setMatrixAt(i, m);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.blades.removeFromParent();
    this.streaks.removeFromParent();
    for (const e of this.extras) e.removeFromParent();
  }
}
registerHazard('fan', (o, sim) => new Fan(o, sim));

// ------------------------------------------------------------------ conveyor

/**
 * A belt that drags whatever is on it. params: size, speed (m/s), yaw handled by rot.
 * Movers on it ride along via the surface velocity; dynamic things get pushed.
 */
class Conveyor implements Hazard {
  private col: Collider;
  private vel: THREE.Vector3;
  private tex: THREE.Texture;
  private mesh: THREE.Mesh;
  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    const size = vec(p, 'size', [2, 0.3, 6]);
    const speed = num(p, 'speed', 1.5);
    const yaw = (o.rot?.[1] ?? 0) * DEG;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.vel = new THREE.Vector3(0, 0, speed).applyQuaternion(q);
    const pos = v3(o.pos);
    const desc = RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(1.0)
      .setCollisionGroups(groups(G.STATIC, 0xffff));
    this.col = sim.physics.world.createCollider(desc);
    sim.physics.setInfo(this.col, { kind: 'static', material: 'metal', surfaceVelocity: this.vel.clone() });
    // belt texture: dark rubber with yellow chevrons
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#3a3d44';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(20, 84);
    ctx.lineTo(64, 40);
    ctx.lineTo(108, 84);
    ctx.stroke();
    this.tex = new THREE.CanvasTexture(c);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.repeat.set(1, size[2] / size[0]);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const belt = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.8 });
    const side = glossy(0x8d9aa6, 0.4, 0.5);
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    this.mesh = new THREE.Mesh(geo, [side, side, belt, side, side, side]);
    this.mesh.position.copy(pos);
    this.mesh.quaternion.copy(q);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    sim.scene.add(this.mesh);
    this.speed = speed;
    this.len = size[2];
  }
  private speed: number;
  private len: number;
  preStep(dt: number) {
    const world = this.sim.physics.world;
    world.contactPairsWith(this.col, (other) => {
      const b = other.parent();
      if (!b || !b.isDynamic()) return;
      const info = this.sim.physics.info(other);
      if (info?.kind === 'player' || info?.kind === 'npc') return; // movers handle it themselves
      const v = b.linvel();
      const dv = new THREE.Vector3(this.vel.x - v.x, 0, this.vel.z - v.z);
      const imp = dv.multiplyScalar(Math.min(1, dt * 6) * b.mass());
      b.applyImpulse({ x: imp.x, y: 0, z: imp.z }, true);
    });
  }
  update(dt: number) {
    this.tex.offset.y -= (this.speed * dt) / this.len * this.tex.repeat.y;
  }
  dispose() {
    this.mesh.removeFromParent();
  }
}
registerHazard('conveyor', (o, sim) => new Conveyor(o, sim));
export { Conveyor };
