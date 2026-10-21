import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import { G, groups, SOLID } from '../../physics/groups';
import type { Sim } from '../../game/Sim';
import { tuning } from '../../config/tuning';
import type { CargoKind } from '../../levels/types';
import type { ColliderInfo } from '../../physics/PhysicsWorld';
import { clamp } from '../../util/math';

export interface Fragility {
  /** Shock (sudden non-gravity velocity change, m/s) below this does nothing. */
  safeShock: number;
  /** Health lost per m/s of shock above safe (health is 0..1). */
  perShock: number;
  /** Max health lost by one hit (keeps one bad bump from always ending the run). */
  maxPerHit: number;
  /** Spinning faster than this (rad/s) slowly damages it. 0 = off. */
  spinLimit: number;
  spinDamage: number;
}

export interface CargoOptions {
  pos: THREE.Vector3;
  yaw: number;
  /** Full rotation; overrides yaw (e.g. a clock laid on its back). */
  rot?: THREE.Quaternion;
  /** Starting velocity (spawning on something that moves). */
  vel?: THREE.Vector3;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Base class for everything players deliver. Subclasses build colliders + a
 * visual and react to damage; the base class detects shocks (hard bumps, drops,
 * sudden swings) and turns them into damage.
 */
export abstract class Cargo {
  abstract readonly kind: CargoKind;
  abstract readonly displayName: string;
  /** Full payout in dollars. */
  abstract readonly value: number;
  abstract readonly fragility: Fragility;
  /** Short handling tip shown at the start. */
  abstract readonly tip: string;
  /**
   * 0..1: how much the movers treat this like a heavy load (speeding up and
   * slowing down gently) whatever it weighs. Light but delicate things want 1.
   */
  readonly care: number = 0;
  /**
   * Hands hold it exactly where they grip it, re-settling each time a hand
   * latches. Round loads need it: a hand that latched while still swinging out
   * wide, or before its mover turned to face the load, would keep pulling it
   * sideways. (Older cargo is tuned without it.)
   */
  readonly snug: boolean = false;
  /** false: it rolls on its own wheels; movers push and pull it but never try to lift it. */
  readonly liftable: boolean = true;
  /** A line about the cargo's state for the HUD ("💧 melting!"), or null. */
  status: string | null = null;

  body!: RigidBody;
  colliders: Collider[] = [];
  readonly visual = new THREE.Group();
  /** 0..1 */
  health = 1;
  destroyed = false;
  /** Rough radius for converting spin into rim speed. */
  protected radius = 0.5;
  protected grace = 0;
  private vPrev = new THREE.Vector3();
  private wPrev = new THREE.Vector3();
  /** Smoothed recent shock (for creaks / wobble audio). */
  recentShock = 0;
  lastHitPos = new THREE.Vector3();
  /** Damage taken in the current frame (for HUD flash). */
  hitFlash = 0;
  /**
   * What gravity "feels like" inside the cargo, in its local frame (m/s²):
   * real gravity minus the cargo's own acceleration, lightly smoothed. Water,
   * pendulums and wobbly bits all hang along this.
   */
  readonly gEff = new THREE.Vector3(0, -9.8, 0);
  private gEffRaw = new THREE.Vector3();
  protected material: ColliderInfo['material'] = 'wood';

  constructor(protected sim: Sim) {}

  /** Subclasses call this from their constructor. */
  protected init(opts: CargoOptions) {
    this.createBody(opts.pos, opts.rot ?? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.yaw));
    if (opts.vel) this.body.setLinvel({ x: opts.vel.x, y: opts.vel.y, z: opts.vel.z }, true);
    this.buildColliders();
    this.buildVisual();
    this.sim.physics.link(this.body, this.visual);
    this.sim.scene.add(this.visual);
    this.grace = tuning.damage.spawnGrace;
    this.snapshotVelocity();
  }

  private createBody(pos: THREE.Vector3, rot: THREE.Quaternion) {
    _q.copy(rot);
    this.body = this.sim.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
        .setLinearDamping(0.08)
        .setAngularDamping(0.35)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
  }

  /** Helper for subclasses: attach a collider with the cargo's groups and info. */
  protected addCollider(desc: InstanceType<typeof RAPIER.ColliderDesc>, friction = 0.7) {
    desc
      .setCollisionGroups(groups(G.CARGO, SOLID | G.DEBRIS))
      .setFriction(friction)
      .setRestitution(0.05)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const c = this.sim.physics.world.createCollider(desc, this.body);
    this.sim.physics.setInfo(c, { kind: 'cargo', owner: this, material: this.material });
    this.colliders.push(c);
    return c;
  }

  protected abstract buildColliders(): void;
  protected abstract buildVisual(): void;

  /**
   * How hard wind blowing along `dir` (world, unit) pushes this, as a multiple
   * of the push it gives anything else of the same mass. Big light flat things
   * catch the wind (sails); the default is plain.
   */
  windScale(_dir: THREE.Vector3) {
    return 1;
  }

  /** Called when health drops; `amount` is 0..1 health lost. */
  protected onDamage(_amount: number, _point: THREE.Vector3, _shock: number) {}
  /** Called once when health hits 0. */
  protected onBreak() {}
  /** Per rendered frame. */
  update(_dt: number, _time: number) {}
  /** Per physics step, before the solver (for cargo with internal dynamics). */
  preStep(_dt: number) {}

  private snapshotVelocity() {
    const v = this.body.linvel();
    const w = this.body.angvel();
    this.vPrev.set(v.x, v.y, v.z);
    this.wPrev.set(w.x, w.y, w.z);
  }

  /** Physics post-step: measure the shock this step and apply damage. */
  postStep(dt: number) {
    if (this.destroyed) return;
    const v = this.body.linvel();
    const w = this.body.angvel();
    _v.set(v.x - this.vPrev.x, v.y - this.vPrev.y + tuning.physics.gravity * dt, v.z - this.vPrev.z);
    _w.set(w.x - this.wPrev.x, w.y - this.wPrev.y, w.z - this.wPrev.z);
    // effective gravity in local frame: g - a  (a = dv/dt), smoothed
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w).invert();
    this.gEffRaw
      .set(-(v.x - this.vPrev.x) / dt, -tuning.physics.gravity - (v.y - this.vPrev.y) / dt, -(v.z - this.vPrev.z) / dt)
      .clampLength(0, 60)
      .applyQuaternion(_q);
    this.gEff.lerp(this.gEffRaw, 1 - Math.exp(-dt / 0.025));
    const lin = _v.length();
    const ang = _w.length() * this.radius * 0.8;
    const shock = Math.max(lin, ang);
    this.recentShock = Math.max(shock, this.recentShock * Math.exp(-dt * 6));
    this.snapshotVelocity();
    if (this.grace > 0) {
      this.grace -= dt;
      return;
    }
    const F = this.fragility;
    let dmg = 0;
    if (shock > F.safeShock) dmg += Math.min(F.maxPerHit, (shock - F.safeShock) * F.perShock);
    const spin = Math.hypot(w.x, w.y, w.z);
    if (F.spinLimit > 0 && spin > F.spinLimit) dmg += (spin - F.spinLimit) * F.spinDamage * dt;
    if (shock > 1.2) {
      const p = this.contactPoint(this.lastHitPos);
      this.sim.events.emit('impact', { pos: p.clone(), speed: shock, material: this.material ?? 'wood' });
    }
    if (dmg > 0) this.damage(dmg, shock);
  }

  /** Apply damage directly (hazards, spills...). */
  damage(amount: number, shock = 0, at?: THREE.Vector3) {
    if (this.destroyed || this.grace > 0) return;
    amount *= tuning.damage.scale;
    if (amount <= 0) return;
    this.health = clamp(this.health - amount, 0, 1);
    const p = at ? this.lastHitPos.copy(at) : this.contactPoint(this.lastHitPos);
    this.hitFlash = Math.min(1, this.hitFlash + amount * 6 + 0.2);
    this.onDamage(amount, p, shock);
    this.sim.events.emit('cargoDamage', { amount, pos: p.clone(), health: this.health, kind: this.kind });
    if (this.health <= 0) this.break();
  }

  break() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    this.onBreak();
    this.sim.events.emit('cargoBreak', { pos: this.position(new THREE.Vector3()), kind: this.kind });
  }

  /** Best guess at where we're being hit: the deepest current contact point, or our centre. */
  contactPoint(out: THREE.Vector3) {
    const t = this.body.translation();
    out.set(t.x, t.y, t.z);
    let best = Infinity;
    const world = this.sim.physics.world;
    for (const c of this.colliders) {
      world.contactPairsWith(c, (other) => {
        world.contactPair(c, other, (m) => {
          for (let i = 0; i < m.numSolverContacts(); i++) {
            const d = m.solverContactDist(i);
            if (d < best) {
              const p = m.solverContactPoint(i);
              if (!p) continue;
              best = d;
              out.set(p.x, p.y, p.z);
            }
          }
        });
      });
    }
    return out;
  }

  position(out: THREE.Vector3) {
    const t = this.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  /** Teleport (respawn at checkpoint). `rot` is a yaw (radians) or a full rotation. */
  reset(pos: THREE.Vector3, rot: number | THREE.Quaternion, vel?: THREE.Vector3) {
    if (typeof rot === 'number') _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    else _q.copy(rot);
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    this.body.setLinvel({ x: vel?.x ?? 0, y: vel?.y ?? 0, z: vel?.z ?? 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.snapshotVelocity();
    this.grace = tuning.damage.spawnGrace;
  }

  payout() {
    return this.destroyed ? 0 : this.value * this.health;
  }

  dispose() {
    this.sim.physics.removeBody(this.body);
    this.visual.removeFromParent();
  }
}
