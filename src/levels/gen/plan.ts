import type { CargoKind } from '../types';

/**
 * Build-a-job: a course you put together yourself (the cargo, the place, the
 * time of day, and the pieces in order), as a short code to share, like
 * "B3K1-4F2A-Q". The generator makes the very same course from the code on
 * any laptop or phone. The lists here only ever get new things added at the
 * end: reordering them would change what old codes mean.
 */

/** Every piece a built job can use, in code order (append only). */
export const BUILD_PIECES = [
  'flat', 'ramp', 'stairs', 'door', 'slalom', 'ball', 'traffic', 'lasers', 'ice', 'people',
  'corner', 'conveyor', 'lift', 'swing', 'bridge', 'ferry', 'seesaw', 'turntable', 'bumpers', 'trampolines',
  'cannons', 'collapse', 'train', 'crane', 'sprinklers', 'escalator', 'ledge', 'stones', 'mud', 'spinners',
] as const;

/** What each piece is called, and its picture, in the builder. */
export const PIECE_INFO: Record<string, { icon: string; name: string }> = {
  flat: { icon: '🛣️', name: 'Straight' },
  ramp: { icon: '⛰️', name: 'Ramp' },
  stairs: { icon: '🪜', name: 'Stairs' },
  door: { icon: '🚪', name: 'Doorway' },
  slalom: { icon: '🚧', name: 'Slalom' },
  ball: { icon: '⚫', name: 'Wrecking ball' },
  traffic: { icon: '🚗', name: 'Road crossing' },
  lasers: { icon: '🔴', name: 'Lasers' },
  ice: { icon: '🧊', name: 'Ice patch' },
  people: { icon: '🚶', name: 'Zebra crossing' },
  corner: { icon: '↪️', name: 'Corner' },
  conveyor: { icon: '➡️', name: 'Conveyor belts' },
  lift: { icon: '🛗', name: 'Lift' },
  swing: { icon: '↔️', name: 'Swing doors' },
  bridge: { icon: '🌉', name: 'Narrow bridge' },
  ferry: { icon: '⛴️', name: 'Moving platform' },
  seesaw: { icon: '⚖️', name: 'Seesaw' },
  turntable: { icon: '🎠', name: 'Turntable' },
  bumpers: { icon: '🔵', name: 'Bumpers' },
  trampolines: { icon: '🤸', name: 'Trampolines' },
  cannons: { icon: '💥', name: 'Ball cannons' },
  collapse: { icon: '🧱', name: 'Crumbling floor' },
  train: { icon: '🚂', name: 'Level crossing' },
  crane: { icon: '🏗️', name: 'Swinging crane' },
  sprinklers: { icon: '💦', name: 'Sprinklers' },
  escalator: { icon: '🛤️', name: 'Escalator' },
  ledge: { icon: '🧗', name: 'Narrow ledge' },
  stones: { icon: '🪨', name: 'Stepping stones' },
  mud: { icon: '🟫', name: 'Mud' },
  spinners: { icon: '🌀', name: 'Spinners' },
};

/** The loads a built job can carry, in code order (append only). */
export const BUILD_CARGO: CargoKind[] = ['crate', 'tv', 'aquarium', 'clock', 'glass', 'cake', 'swan', 'egg', 'piano', 'painting', 'balloons'];

export const BUILD_TIMES = ['day', 'sunset', 'night'] as const;
export const BUILD_DIFF = [0.2, 0.5, 0.85];
export const BUILD_DIFF_NAMES = ['Gentle', 'Normal', 'Nasty'];
export const MAX_PIECES = 12;

export interface Plan {
  cargo: CargoKind;
  /** Index into THEMES. */
  theme: number;
  time: (typeof BUILD_TIMES)[number];
  rain: boolean;
  /** Index into BUILD_DIFF. */
  diff: number;
  pieces: string[];
}

// Crockford's base 32: no I, L, O or U to misread
const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const VERSION = 1;

/** A plan as a code: B, then a character each for the version, cargo, place, and options, one per piece, and a check character. */
export function encodePlan(p: Plan): string {
  const v = [VERSION, Math.max(0, BUILD_CARGO.indexOf(p.cargo)), p.theme & 31, (BUILD_TIMES.indexOf(p.time) & 3) | (p.rain ? 4 : 0) | ((p.diff & 3) << 3)];
  for (const id of p.pieces.slice(0, MAX_PIECES)) {
    const i = (BUILD_PIECES as readonly string[]).indexOf(id);
    if (i >= 0) v.push(i);
  }
  v.push(check(v));
  const s = v.map((n) => ABC[n & 31]).join('');
  // grouped in fours, for reading out loud
  return ('B' + s).replace(/(.{4})(?=.)/g, '$1-');
}

function check(v: number[]) {
  let h = 7;
  for (const n of v) h = (h * 31 + n + 1) % 32749;
  return h % 32;
}

/** Tidy up what someone typed: case, dashes and spaces, and the letters people mix up. */
export function cleanCode(text: string) {
  return text
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
}

/** A code back into a plan (null if it isn't one, or a character's wrong). */
export function decodePlan(code: string, themes: number): Plan | null {
  const s = cleanCode(code);
  if (!s.startsWith('B') || s.length < 6) return null;
  const v = [...s.slice(1)].map((c) => ABC.indexOf(c));
  if (v.some((n) => n < 0)) return null;
  const sum = v.pop()!;
  if (check(v) !== sum || v[0] !== VERSION) return null;
  const cargo = BUILD_CARGO[v[1]];
  if (!cargo || v[2] >= themes) return null;
  const pieces = v.slice(4).map((i) => BUILD_PIECES[i]).filter(Boolean) as string[];
  if (!pieces.length || pieces.length > MAX_PIECES) return null;
  return { cargo, theme: v[2], time: BUILD_TIMES[v[3] & 3] ?? 'day', rain: !!(v[3] & 4), diff: Math.min(2, (v[3] >> 3) & 3), pieces };
}

/** Is this a built job's code (rather than a job number)? */
export const isPlanCode = (text: string) => /^B/.test(cleanCode(text));
