import * as THREE from 'three';
import type { RigidBody } from '../physics/rapier';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { EventBus } from './events';
import { playerBodyBit } from '../physics/groups';
import type { Effects } from '../render/Effects';
import type { Player } from '../entities/Player';
import type { Cargo } from '../entities/cargo/Cargo';

/**
 * Tracks who is holding what. When a player grabs a dynamic body, that body
 * stops colliding with the holder (otherwise the held object and the holder's
 * torso shove each other forever).
 */
export class GripRegistry {
  /** body handle -> (player index -> number of hands) */
  private holders = new Map<number, Map<number, number>>();
  private bodies = new Map<number, RigidBody>();
  /** body handle -> players who just let go and are still overlapping it */
  private ghosts = new Map<number, Set<number>>();
  /** collider handle -> original collision groups */
  private baseGroups = new Map<number, number>();

  add(body: RigidBody, player: number) {
    let m = this.holders.get(body.handle);
    if (!m) this.holders.set(body.handle, (m = new Map()));
    m.set(player, (m.get(player) ?? 0) + 1);
    this.bodies.set(body.handle, body);
    this.apply(body);
  }

  remove(body: RigidBody, player: number) {
    const m = this.holders.get(body.handle);
    if (!m) return;
    const n = (m.get(player) ?? 0) - 1;
    if (n <= 0) m.delete(player);
    else m.set(player, n);
    if (m.size === 0) this.holders.delete(body.handle);
    if (body.isValid()) this.apply(body);
  }

  /** Keep ignoring collisions between `player` and `body` until unghost() (avoids pops on release). */
  ghost(body: RigidBody, player: number) {
    let s = this.ghosts.get(body.handle);
    if (!s) this.ghosts.set(body.handle, (s = new Set()));
    s.add(player);
    this.bodies.set(body.handle, body);
    if (body.isValid()) this.apply(body);
  }

  unghost(body: RigidBody, player: number) {
    const s = this.ghosts.get(body.handle);
    if (!s) return;
    s.delete(player);
    if (!s.size) this.ghosts.delete(body.handle);
    if (body.isValid()) this.apply(body);
  }

  holdersOf(body: RigidBody): number[] {
    const m = this.holders.get(body.handle);
    return m ? [...m.keys()] : [];
  }

  isHeldBy(body: RigidBody, player: number) {
    return !!this.holders.get(body.handle)?.has(player);
  }

  isHeld(body: RigidBody) {
    return this.holders.has(body.handle);
  }

  private apply(body: RigidBody) {
    const m = this.holders.get(body.handle);
    let mask = 0;
    if (m) for (const p of m.keys()) mask |= playerBodyBit(p);
    const gs = this.ghosts.get(body.handle);
    if (gs) for (const p of gs) mask |= playerBodyBit(p);
    for (let i = 0; i < body.numColliders(); i++) {
      const c = body.collider(i);
      let base = this.baseGroups.get(c.handle);
      if (base === undefined) {
        base = c.collisionGroups();
        this.baseGroups.set(c.handle, base);
      }
      const membership = (base >>> 16) & 0xffff;
      const filter = base & 0xffff & ~mask;
      c.setCollisionGroups(((membership << 16) | filter) >>> 0);
    }
  }

  clear() {
    this.holders.clear();
    this.ghosts.clear();
    this.bodies.clear();
    this.baseGroups.clear();
  }
}

/** Everything gameplay code needs to reach the shared world. */
export interface Sim {
  physics: PhysicsWorld;
  scene: THREE.Object3D;
  events: EventBus;
  grips: GripRegistry;
  /** Seconds since the level started (physics time). */
  time(): number;
  /** Particle effects (absent in headless tests). */
  fx?: Effects;
  /** The two movers (for hazards that react to them). */
  players?: Player[];
  cargo?: Cargo;
  /** Traffic light states by tag: 'green' | 'yellow' | 'red' (for cars). */
  signals?: Map<string, 'green' | 'yellow' | 'red'>;
}
