import type * as THREE from 'three';
import type { Sim } from '../../game/Sim';
import type { CargoKind } from '../../levels/types';
import type { Cargo } from './Cargo';
import { Crate } from './Crate';

type Factory = (sim: Sim, opts: { pos: THREE.Vector3; yaw: number }) => Cargo;

const registry: Partial<Record<CargoKind, Factory>> = {
  crate: (sim, o) => new Crate(sim, o),
};

export function registerCargo(kind: CargoKind, f: Factory) {
  registry[kind] = f;
}

export function createCargo(kind: CargoKind, sim: Sim, opts: { pos: THREE.Vector3; yaw: number }): Cargo {
  const f = registry[kind] ?? registry.crate!;
  return f(sim, opts);
}
