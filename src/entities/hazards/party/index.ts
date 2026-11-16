import { registerHazard } from '../registry';
import type { PartyGame } from './base';
import { str } from '../common';
import { Sumo } from './sumo';
import { Football } from './football';
import { Potato } from './potato';
import { Paint } from './paint';
import { Lava } from './lava';
import { Tug } from './tug';
import { King } from './king';
import { KeepAway } from './keep';
import { Dodgeball } from './dodge';
import { Stomp } from './stomp';

type Make = new (...a: ConstructorParameters<typeof Sumo>) => PartyGame;

/** Every party game, by the name in the arena's hazard params (`mode`). */
const GAMES: Record<string, Make> = {
  sumo: Sumo,
  football: Football,
  potato: Potato,
  paint: Paint,
  lava: Lava,
  tug: Tug,
  king: King,
  keep: KeepAway,
  dodge: Dodgeball,
  stomp: Stomp,
};

registerHazard('party', (o, sim, level) => {
  const G = GAMES[str(o.params, 'mode', 'sumo')] ?? Sumo;
  return new G(o, sim, level);
});
