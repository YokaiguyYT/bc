import RAPIER from '@dimforge/rapier3d-compat';

let ready: Promise<void> | null = null;

/** Rapier ships its WASM inlined as base64 (the -compat build), so this works from file:// too. */
export function initRapier(): Promise<void> {
  if (!ready) ready = RAPIER.init();
  return ready;
}

export { RAPIER };
export type { World, RigidBody, Collider, ImpulseJoint } from '@dimforge/rapier3d-compat';
