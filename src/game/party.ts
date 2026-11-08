import { loadJSON, saveJSON } from '../util/storage';

/** The party games (1v1), for the menus. Each is an arena level `party-<id>` (levels/defs/p*_*.ts). */
export interface PartyInfo {
  id: string;
  name: string;
  icon: string;
  /** What it is, in a line. */
  blurb: string;
  /** How to win, in a line (on the tile and the HUD's hints). */
  how: string;
  /** How long a game is: the score to reach (or rounds) for quick / normal / long. */
  targets: [number, number, number];
  /** Timed games: seconds per round for quick / normal / long. */
  times?: [number, number, number];
  /** Football: one clock for the whole game. */
  gameTimes?: [number, number, number];
}

export const PARTY_GAMES: PartyInfo[] = [
  { id: 'sumo', name: 'Belly-Bump Sumo', icon: '🤼', blurb: 'Shove each other off a round mat. Later on, the mat shrinks.', how: 'Run into them to shove, grab to drag. Last one on the mat wins the round.', targets: [2, 3, 5] },
  { id: 'tug', name: 'Tug of War', icon: '🪢', blurb: 'One big sofa, two trucks. Drag it into yours.', how: 'Grab an end and pull it into your own truck. Let go and they run off with it.', targets: [2, 3, 5], times: [45, 45, 45] },
  { id: 'king', name: 'King of the Truck', icon: '👑', blurb: 'Loot rains down. Pile the most value into your truck.', how: 'Carry things into your truck before the clock runs out. Stealing is allowed.', targets: [1, 1, 2], times: [60, 90, 75] },
  { id: 'football', name: 'Mover Football', icon: '⚽', blurb: 'A giant ball, two goals, no rules about shoving.', how: 'Run into the ball to kick it into their goal.', targets: [2, 3, 5], gameTimes: [90, 150, 240] },
  { id: 'potato', name: 'Hot Potato', icon: '💣', blurb: 'Tag with a bomb on a fuse. Pass it on by touching them.', how: 'Holding the bomb? Tag them before it goes off. Not? Run!', targets: [2, 3, 5] },
  { id: 'paint', name: 'Paint the Floor', icon: '🎨', blurb: 'Every tile you walk on turns your colour.', how: 'Cover more floor than them before time runs out. Grab the paint buckets.', targets: [1, 2, 3], times: [40, 45, 45] },
  { id: 'lava', name: 'The Floor is Lava', icon: '🌋', blurb: 'Tiles over lava keep falling away.', how: 'Stay on the tiles. Last one standing wins the round.', targets: [2, 3, 4] },
];

export const partyInfo = (id: string) => PARTY_GAMES.find((g) => g.id === id);

export type PartyLength = 0 | 1 | 2;
export const LENGTH_NAMES = ['Quick', 'Normal', 'Long'];
export const CPU_NAMES = ['', 'Easy', 'Normal', 'Hard'];
/** Beating the computer pays a little into the company wallet. */
export const CPU_PRIZE = [0, 25, 50, 100];

/** How you've done: wins and losses against the computer by difficulty, and games played. */
export interface PartyRecord {
  won: [number, number, number, number];
  lost: [number, number, number, number];
  played: number;
}
type Records = Record<string, PartyRecord>;
const KEY = 'ff.party.v1';

export function partyRecord(id: string): PartyRecord {
  const r = loadJSON<Records>(KEY)?.[id];
  return { won: r?.won ?? [0, 0, 0, 0], lost: r?.lost ?? [0, 0, 0, 0], played: r?.played ?? 0 };
}

/** Count a finished game (`cpu` 0 = two people). */
export function recordParty(id: string, winner: number, cpu: number) {
  const all = loadJSON<Records>(KEY) ?? {};
  const r = partyRecord(id);
  r.played++;
  if (cpu) {
    if (winner === 0) r.won[cpu]++;
    else if (winner === 1) r.lost[cpu]++;
  }
  all[id] = r;
  saveJSON(KEY, all);
  return r;
}

/** The best computer you've beaten at this game (0 none). */
export function bestBeaten(id: string) {
  const r = partyRecord(id);
  return r.won[3] ? 3 : r.won[2] ? 2 : r.won[1] ? 1 : 0;
}
