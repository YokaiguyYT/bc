import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import { G, groups, SOLID } from '../../physics/groups';
import { Player } from '../Player';
import type { Vec3 } from '../../levels/types';

export const v3 = (a: Vec3 | undefined, d: Vec3 = [0, 0, 0]) => new THREE.Vector3(...(a ?? d));
export const DEG = Math.PI / 180;

export function num(p: Record<string, unknown> | undefined, key: string, d: number) {
  const v = p?.[key];
  return typeof v === 'number' ? v : d;
}
export function vec(p: Record<string, unknown> | undefined, key: string, d: Vec3): Vec3 {
  const v = p?.[key];
  return Array.isArray(v) && v.length === 3 ? (v as Vec3) : d;
}
export function str<T extends string>(p: Record<string, unknown> | undefined, key: string, d: T): T {
  const v = p?.[key];
  return typeof v === 'string' ? (v as T) : d;
}

/** A kinematic body you move by setting a pose every physics step. */
export function kinematicBody(sim: Sim, pos: THREE.Vector3, q = new THREE.Quaternion()) {
  return sim.physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
}

export function hazardCollider(sim: Sim, body: RigidBody, desc: InstanceType<typeof RAPIER.ColliderDesc>, kind: 'hazard' | 'static' = 'hazard', friction = 0.8) {
  desc.setCollisionGroups(groups(kind === 'hazard' ? G.HAZARD : G.STATIC, SOLID | G.DEBRIS)).setFriction(friction);
  const c = sim.physics.world.createCollider(desc, body);
  sim.physics.setInfo(c, { kind: kind === 'hazard' ? 'hazard' : 'static', material: 'metal', friction });
  return c;
}

/**
 * Knock over any mover touching `collider` if the hazard hits them fast enough.
 * Returns true if someone got bonked.
 */
export function bonkPlayers(sim: Sim, collider: Collider, hazardVel: THREE.Vector3, minSpeed: number, power: number, cooldowns: Map<Player, number>, now: number) {
  let hit = false;
  if (hazardVel.length() < minSpeed) return false;
  sim.physics.world.contactPairsWith(collider, (other) => {
    const info = sim.physics.info(other);
    const p = info?.owner;
    if (!(p instanceof Player)) return;
    if ((cooldowns.get(p) ?? -9) > now - 1.2) return;
    cooldowns.set(p, now);
    const push = hazardVel.clone().setY(Math.max(1.5, hazardVel.y)).normalize().multiplyScalar(power * p.totalMass);
    p.applyBlast(push);
    p.knock(power);
    hit = true;
  });
  return hit;
}
