import * as THREE from 'three';
import { RAPIER } from './rapier';
import type { RigidBody, Collider, World } from './rapier';
import { tuning } from '../config/tuning';

export type ColliderKind = 'static' | 'prop' | 'cargo' | 'player' | 'hazard' | 'npc' | 'sensor' | 'debris';

/** Extra info we hang off every collider (Rapier only gives us numeric handles). */
export interface ColliderInfo {
  kind: ColliderKind;
  /** Whatever game object owns this collider (Player, Cargo, Prop...). */
  owner?: unknown;
  /** Conveyor belts: things touching this surface get dragged at this velocity. */
  surfaceVelocity?: THREE.Vector3;
  /** Can a hand latch onto it? (defaults to true for solid things) */
  grabbable?: boolean;
  /** Sound material for impacts. */
  material?: 'wood' | 'metal' | 'glass' | 'soft' | 'concrete' | 'body' | 'cardboard' | 'cake' | 'water' | 'ice' | 'shell' | 'rubber';
  /** Pointy: pops balloons. */
  sharp?: boolean;
  /** Friction used for "slippery" checks. */
  friction?: number;
}

interface Link {
  body: RigidBody;
  obj: THREE.Object3D;
  prevPos: THREE.Vector3;
  prevQuat: THREE.Quaternion;
  currPos: THREE.Vector3;
  currQuat: THREE.Quaternion;
}

const _v = new THREE.Vector3();

export class PhysicsWorld {
  world: World;
  events: InstanceType<typeof RAPIER.EventQueue>;
  readonly dt: number;
  private accumulator = 0;
  /** 0..1 fraction between the last two physics states, for render interpolation. */
  alpha = 0;
  /** Physics time in seconds. */
  time = 0;
  stepCount = 0;
  private links: Link[] = [];
  private infos = new Map<number, ColliderInfo>();
  /** Called before every fixed step (apply forces here). */
  preStep: ((dt: number) => void)[] = [];
  /** Called after every fixed step (read results here). */
  postStep: ((dt: number) => void)[] = [];
  /** Collision start/stop callbacks, keyed by collider handle pairs. */
  onCollision: ((h1: number, h2: number, started: boolean) => void)[] = [];

  constructor() {
    this.dt = 1 / tuning.physics.hz;
    this.world = new RAPIER.World({ x: 0, y: -tuning.physics.gravity, z: 0 });
    this.world.timestep = this.dt;
    this.world.numSolverIterations = tuning.physics.solverIterations;
    this.events = new RAPIER.EventQueue(true);
  }

  /** Advance by a real frame delta, running as many fixed steps as needed. */
  advance(frameDt: number, maxSteps = 8) {
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < maxSteps) {
      this.stepOnce();
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps >= maxSteps) this.accumulator = 0; // we're behind; drop time rather than spiral
    this.alpha = this.accumulator / this.dt;
    return steps;
  }

  stepOnce() {
    const dt = this.dt;
    this.world.gravity = { x: 0, y: -tuning.physics.gravity, z: 0 };
    if (this.world.numSolverIterations !== tuning.physics.solverIterations) {
      this.world.numSolverIterations = tuning.physics.solverIterations;
    }
    for (const l of this.links) {
      l.prevPos.copy(l.currPos);
      l.prevQuat.copy(l.currQuat);
    }
    for (const f of this.preStep) f(dt);
    this.world.step(this.events);
    this.time += dt;
    this.stepCount++;
    if (this.onCollision.length) {
      this.events.drainCollisionEvents((h1, h2, started) => {
        for (const f of this.onCollision) f(h1, h2, started);
      });
    } else {
      this.events.clear();
    }
    for (const l of this.links) {
      const t = l.body.translation();
      const r = l.body.rotation();
      l.currPos.set(t.x, t.y, t.z);
      l.currQuat.set(r.x, r.y, r.z, r.w);
    }
    for (const f of this.postStep) f(dt);
  }

  /** Make a mesh follow a rigid body (with interpolation). */
  link(body: RigidBody, obj: THREE.Object3D) {
    const t = body.translation();
    const r = body.rotation();
    const p = new THREE.Vector3(t.x, t.y, t.z);
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    this.links.push({ body, obj, prevPos: p.clone(), prevQuat: q.clone(), currPos: p, currQuat: q });
    obj.position.copy(p);
    obj.quaternion.copy(q);
  }

  unlinkBody(body: RigidBody) {
    this.links = this.links.filter((l) => l.body !== body);
  }

  unlinkObject(obj: THREE.Object3D) {
    this.links = this.links.filter((l) => l.obj !== obj);
  }

  /** After teleporting bodies, call this so they don't smear across the screen. */
  snapLinks() {
    for (const l of this.links) {
      if (!l.body.isValid()) continue;
      const t = l.body.translation();
      const r = l.body.rotation();
      l.currPos.set(t.x, t.y, t.z);
      l.currQuat.set(r.x, r.y, r.z, r.w);
      l.prevPos.copy(l.currPos);
      l.prevQuat.copy(l.currQuat);
    }
  }

  /** Apply interpolated transforms to linked meshes. Call once per rendered frame. */
  syncVisuals() {
    const a = this.alpha;
    for (const l of this.links) {
      l.obj.position.lerpVectors(l.prevPos, l.currPos, a);
      l.obj.quaternion.slerpQuaternions(l.prevQuat, l.currQuat, a);
    }
  }

  /** Online: how many moving bodies have a visual (made in the same order on both laptops). */
  get linkCount() {
    return this.links.length;
  }

  /** Online host: link i's pose after the last step. */
  linkPose(i: number) {
    const l = this.links[i];
    return { pos: l.currPos, quat: l.currQuat, body: l.body };
  }

  /** Online guest: put link i (and its body) exactly here, no smoothing. */
  setLinkPose(i: number, p: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3) {
    const l = this.links[i];
    if (!l || !l.body.isValid()) return;
    l.currPos.copy(p);
    l.prevPos.copy(p);
    l.currQuat.copy(q);
    l.prevQuat.copy(q);
    l.body.setTranslation({ x: p.x, y: p.y, z: p.z }, false);
    l.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, false);
    l.body.setLinvel({ x: v.x, y: v.y, z: v.z }, false);
  }

  /** Interpolated position of a body (for things that aren't linked meshes). */
  interpolatedPosition(body: RigidBody, out: THREE.Vector3) {
    const l = this.links.find((x) => x.body === body);
    if (l) return out.lerpVectors(l.prevPos, l.currPos, this.alpha);
    const t = body.translation();
    return out.set(t.x, t.y, t.z);
  }

  setInfo(collider: Collider, info: ColliderInfo) {
    this.infos.set(collider.handle, info);
    if (info.friction !== undefined) collider.setFriction(info.friction);
  }

  info(handleOrCollider: number | Collider): ColliderInfo | undefined {
    const h = typeof handleOrCollider === 'number' ? handleOrCollider : handleOrCollider.handle;
    return this.infos.get(h);
  }

  removeBody(body: RigidBody) {
    if (!body.isValid()) return;
    for (let i = 0; i < body.numColliders(); i++) this.infos.delete(body.collider(i).handle);
    this.unlinkBody(body);
    this.world.removeRigidBody(body);
  }

  dispose() {
    this.links = [];
    this.infos.clear();
    this.preStep = [];
    this.postStep = [];
    this.onCollision = [];
    this.events.free();
    this.world.free();
  }
}

/** Small conversion helpers between Rapier {x,y,z} and three.js. */
export const toV3 = (v: { x: number; y: number; z: number }, out = new THREE.Vector3()) => out.set(v.x, v.y, v.z);
export const toQ = (q: { x: number; y: number; z: number; w: number }, out = new THREE.Quaternion()) =>
  out.set(q.x, q.y, q.z, q.w);
export const vec = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });
export const quat = (q: THREE.Quaternion) => ({ x: q.x, y: q.y, z: q.z, w: q.w });

/** Linear velocity of a body at a world point, into a three.js vector. */
export function velAt(body: RigidBody, p: THREE.Vector3, out: THREE.Vector3) {
  const v = body.velocityAtPoint({ x: p.x, y: p.y, z: p.z });
  return out.set(v.x, v.y, v.z);
}

export { _v as _scratchV };
