import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import type { BuiltLevel } from '../../levels/LevelBuilder';

/** Anything in a level that moves on its own. */
export interface Hazard {
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
