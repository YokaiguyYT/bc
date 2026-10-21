import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import type { BuiltLevel } from '../../levels/LevelBuilder';

/** Anything in a level that moves on its own. */
export interface Hazard {
  /** Level tag (for spawns that ride on a moving hazard). */
  readonly tag?: string;
  /** Rigid body of hazards that can carry spawns. */
  readonly bodyRef?: import('../../physics/rapier').RigidBody;
  /** Its current velocity (kinematic bodies don't report one reliably). */
  readonly bodyVel?: import('three').Vector3;
  preStep(dt: number): void;
  postStep?(dt: number): void;
  /** Per rendered frame. */
  update(dt: number, time: number): void;
  dispose(): void;
}

export type HazardFactory = (o: HazardObj, sim: Sim, level: BuiltLevel) => Hazard;

const factories = new Map<HazardObj['kind'], HazardFactory>();

export function registerHazard(kind: HazardObj['kind'], f: HazardFactory) {
  factories.set(kind, f);
}

export function createHazard(o: HazardObj, sim: Sim, level: BuiltLevel): Hazard | null {
  const f = factories.get(o.kind);
  if (!f) {
    console.warn(`[hazard] unknown kind ${o.kind}`);
    return null;
  }
  return f(o, sim, level);
}
