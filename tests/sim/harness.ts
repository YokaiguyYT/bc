import * as THREE from 'three';
import { initRapier, RAPIER } from '../../src/physics/rapier';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld';
import { EventBus } from '../../src/game/events';
import { GripRegistry, Sim } from '../../src/game/Sim';
import { G, groups, SOLID } from '../../src/physics/groups';

export async function makeSim() {
  await initRapier();
  const physics = new PhysicsWorld();
  const events = new EventBus();
  const sim: Sim = { physics, scene: new THREE.Scene(), events, grips: new GripRegistry(), time: () => physics.time };
  return sim;
}

export function addStaticBox(sim: Sim, pos: [number, number, number], half: [number, number, number], rotY = 0, rotX = 0, friction = 0.8) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0));
  const desc = RAPIER.ColliderDesc.cuboid(...half)
    .setTranslation(...pos)
    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    .setFriction(friction)
    .setCollisionGroups(groups(G.STATIC, 0xffff));
  const c = sim.physics.world.createCollider(desc);
  sim.physics.setInfo(c, { kind: 'static' });
  return c;
}

export function addCrate(sim: Sim, pos: [number, number, number], half: [number, number, number], mass: number, kind: 'cargo' | 'prop' = 'cargo') {
  const body = sim.physics.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(...pos).setCanSleep(false));
  const c = sim.physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(...half).setMass(mass).setFriction(0.6).setCollisionGroups(groups(kind === 'cargo' ? G.CARGO : G.PROP, SOLID)),
    body,
  );
  sim.physics.setInfo(c, { kind, owner: { name: 'crate' } });
  return body;
}

export const fmt = (v: { x: number; y: number; z: number }) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
