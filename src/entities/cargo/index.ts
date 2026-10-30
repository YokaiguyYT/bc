import type { Sim } from '../../game/Sim';
import type { CargoKind } from '../../levels/types';
import type { Cargo, CargoOptions } from './Cargo';
import { Crate } from './Crate';
import { GlassPane } from './GlassPane';
import { CrtTv } from './CrtTv';
import { Aquarium } from './Aquarium';
import { GrandfatherClock } from './GrandfatherClock';
import { WeddingCake } from './WeddingCake';
import { IceSwan } from './IceSwan';
import { DinoEgg } from './DinoEgg';
import { UprightPiano } from './UprightPiano';
import { Balloons } from './Balloons';

type Factory = (sim: Sim, opts: CargoOptions) => Cargo;

const registry: Partial<Record<CargoKind, Factory>> = {
  crate: (sim, o) => new Crate(sim, o),
  glass: (sim, o) => new GlassPane(sim, o),
  tv: (sim, o) => new CrtTv(sim, o),
  aquarium: (sim, o) => new Aquarium(sim, o),
  clock: (sim, o) => new GrandfatherClock(sim, o),
  cake: (sim, o) => new WeddingCake(sim, o),
  swan: (sim, o) => new IceSwan(sim, o),
  egg: (sim, o) => new DinoEgg(sim, o),
  piano: (sim, o) => new UprightPiano(sim, o),
  balloons: (sim, o) => new Balloons(sim, o),
};

export function registerCargo(kind: CargoKind, f: Factory) {
  registry[kind] = f;
}

export function createCargo(kind: CargoKind, sim: Sim, opts: CargoOptions): Cargo {
  const f = registry[kind] ?? registry.crate!;
  return f(sim, opts);
}
