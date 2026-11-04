import type { LevelDef, LevelObject, Vec3 } from '../types';
import { floor, ramp, wall } from '../helpers';
import { counter, rug, table } from '../props';

/**
 * JOB 13 — Wibble Wobble (a giant jelly for a birthday party)
 * The hotel kitchen (chefs dashing about) → through the swing doors → the
 * restaurant, waiters crossing with trays, soup spilled on the floor → up
 * onto the party room's dais → onto the cake stand at the head of the
 * table. Every start, stop and bump sets the jelly wobbling.
 */
const STAND = 0.8; // a cake stand's height
const JY = STAND + 0.03 + 0.01; // the platter's middle, sitting on a stand
const DAIS = 0.3;
const TILE = 0xf2f2ee;

/** A pedestal cake stand: thin enough for the movers to stand either side. */
const cakeStand = (x: number, y: number, z: number, top = 0xfbfaf6): LevelObject[] => [
  { type: 'cylinder', pos: [x, y + 0.03, z], radius: 0.32, height: 0.06, color: 0xd9dde3, segments: 24 },
  { type: 'cylinder', pos: [x, y + STAND / 2, z], radius: 0.09, height: STAND, color: 0xd9dde3, segments: 14 },
  { type: 'cylinder', pos: [x, y + STAND - 0.02, z], radius: 0.4, height: 0.04, color: top, segments: 28 },
];

/** A round dining table with two chairs (and the diners' plates). */
const diner = (x: number, z: number): LevelObject[] => [
  { type: 'cylinder', pos: [x, 0.74, z], radius: 0.6, height: 0.04, color: 0xfbfaf6, segments: 24 },
  { type: 'cylinder', pos: [x, 0.37, z], radius: 0.07, height: 0.74, color: 0x5b3a22, segments: 10 },
  { type: 'cylinder', pos: [x, 0.77, z - 0.3], radius: 0.13, height: 0.02, color: 0xffffff, collide: false },
  { type: 'cylinder', pos: [x, 0.77, z + 0.3], radius: 0.13, height: 0.02, color: 0xffffff, collide: false },
  { type: 'cylinder', pos: [x + 0.05, 0.86, z], radius: 0.04, height: 0.16, color: 0xd94a3d, collide: false },
  { type: 'box', pos: [x, 0.25, z - 0.85], size: [0.45, 0.5, 0.45], color: 0x8a5a36, radius: 0.04 },
  { type: 'box', pos: [x, 0.25, z + 0.85], size: [0.45, 0.5, 0.45], color: 0x8a5a36, radius: 0.04 },
];

const objects: LevelObject[] = [
  { type: 'box', pos: [0, -0.6, -2], size: [50, 1, 60], surface: 'grass', color: 0x6fae55 },

  // ---- the hotel kitchen (x -6..6, z 10..20)
  floor([0, 15], 0.01, [12, 10], 'tiles', { thickness: 0.05, color: TILE }),
  ...wall([-6, 0, 20], [6, 0, 20], 1.0, { surface: 'tiles', color: 0xffffff }),
  ...wall([-6, 0, 10], [-6, 0, 20], 3, { surface: 'tiles', color: 0xffffff, fade: true }),
  ...wall([6, 0, 10], [6, 0, 20], 3, { surface: 'tiles', color: 0xffffff, fade: true }),
  ...counter([-5.4, 0, 15], [1.0, 0.92, 8.6], 0xc9ced6, 0x9aa3ad),
  ...counter([5.4, 0, 15], [1.0, 0.92, 8.6], 0xc9ced6, 0x9aa3ad),
  // pans steaming on the hobs
  ...([[-5.4, 17.4], [-5.4, 16.2], [5.4, 13.0]] as const).map(([x, z]) => ({ type: 'cylinder' as const, pos: [x, 1.02, z] as Vec3, radius: 0.22, height: 0.18, color: 0x3a3f47, collide: false })),
  { type: 'model', model: 'fridge', pos: [5.4, 0, 19.2], rot: [0, -90, 0] },
  { type: 'model', model: 'fridge', pos: [-5.4, 0, 19.2], rot: [0, 90, 0] },
  ...cakeStand(0, 0, 15.5),
  rug([0, 0, 15.5], [2.6, 1.6], 0xd94a3d),
  { type: 'sign', pos: [0, 2.4, 19.9], size: [3.0, 0.42, 0.05], text: 'PASTRY SECTION', color: 0xff2d55, rot: [0, 180, 0] },
  // chefs dashing across
  { type: 'hazard', kind: 'pedestrian', pos: [-4.2, 0.02, 12.2], params: { points: [[0, 0, 0], [8.4, 0, 0]], speed: 0.85, color: 0xffffff } },
  { type: 'hazard', kind: 'pedestrian', pos: [4.4, 0.02, 18.6], params: { points: [[0, 0, 0], [-2, 0, 0], [-2, 0, -1.2], [0, 0, -1.2]], speed: 0.6, color: 0xffffff } },

  // ---- swing doors into the restaurant
  ...wall([-12, 0, 10], [12, 0, 10], 3.2, { surface: 'wallpaper', color: 0xf3e6cf, fade: true, doors: [[0.5, 3.2, 2.5]] }),
  { type: 'hazard', kind: 'swingDoor', pos: [-1.56, 0.02, 10.0], params: { width: 1.5, height: 2.3, side: 1, open: 85, spring: 3, color: 0xc98f5a } },
  { type: 'hazard', kind: 'swingDoor', pos: [1.56, 0.02, 10.0], params: { width: 1.5, height: 2.3, side: -1, open: 85, spring: 3, color: 0xc98f5a } },
  { type: 'sign', pos: [-1.0, 2.75, 9.9], size: [0.9, 0.3, 0.05], text: 'IN', color: 0x3f7a2a, rot: [0, 180, 0] },
  { type: 'sign', pos: [1.0, 2.75, 9.9], size: [0.9, 0.3, 0.05], text: 'OUT', color: 0xd94a3d, rot: [0, 180, 0] },

  // ---- the restaurant (x -12..12, z -10..10)
  floor([0, 0], 0.01, [24, 20], 'woodLight', { thickness: 0.05 }),
  { type: 'box', pos: [0, 0.03, 0], size: [3.0, 0.01, 19.6], color: 0x8e2b3a, surface: 'carpet', collide: false, castShadow: false, radius: 0.003 },
  ...wall([-12, 0, -10], [-12, 0, 10], 3.2, { surface: 'wallpaper', color: 0xf3e6cf, fade: true }),
  ...wall([12, 0, -10], [12, 0, 10], 3.2, { surface: 'wallpaper', color: 0xf3e6cf, fade: true }),
  ...[-5, -9].flatMap((x) => [6, 1, -4].flatMap((z) => diner(x, z))),
  ...[5, 9].flatMap((x) => [6, 1, -4].flatMap((z) => diner(x, z + 0.6))),
  // waiters crossing the aisle
  { type: 'hazard', kind: 'pedestrian', pos: [-4.2, 0.02, 3.6], params: { points: [[0, 0, 0], [8.4, 0, 0]], speed: 0.75, color: 0x2b2b33 } },
  { type: 'hazard', kind: 'pedestrian', pos: [4.2, 0.02, -1.6], params: { points: [[0, 0, 0], [-8.4, 0, 0]], speed: 0.75, color: 0x2b2b33 } },
  // spilled soup (slippery!) and its sign
  { type: 'box', pos: [2.4, 0.03, -6.6], size: [1.6, 0.02, 1.4], color: 0xe9a23b, surface: 'ice', radius: 0.01, castShadow: false },
  { type: 'model', model: 'wetFloorSign', pos: [3.6, 0, -7.4] },
  { type: 'model', model: 'plant', pos: [-11.3, 0, 9.3] },
  { type: 'model', model: 'plant', pos: [11.3, 0, 9.3] },

  // ---- the party room: a dais at the far end, the long table and the cake stand
  ramp([0, 0, -10.0], [0, DAIS, -11.6], 4, { surface: 'carpet', color: 0x8e2b3a }),
  { type: 'box', pos: [0, DAIS / 2, -16.6], size: [14, DAIS, 10], surface: 'woodDark', radius: 0.03 },
  ...wall([-7, DAIS, -21.6], [7, DAIS, -21.6], 3.0, { surface: 'wallpaper', color: 0xffe0ea }),
  ...wall([-7, 0, -11.6], [-7, 0, -21.6], 3.3, { surface: 'wallpaper', color: 0xffe0ea, fade: true }),
  ...wall([7, 0, -11.6], [7, 0, -21.6], 3.3, { surface: 'wallpaper', color: 0xffe0ea, fade: true }),
  ...cakeStand(0, DAIS, -15.6, 0xffd23f),
  ...table([0, DAIS, -18.4], [1.2, 0.76, 3.6], 0xfbfaf6),
  ...([-0.3, 0.3] as const).flatMap((dx) => [-17.2, -18.4, -19.6].map((z): LevelObject => ({ type: 'cylinder', pos: [dx, DAIS + 0.78, z], radius: 0.12, height: 0.02, color: 0xffffff, collide: false }))),
  { type: 'sign', pos: [0, DAIS + 2.3, -21.45], size: [3.6, 0.6, 0.05], text: 'HAPPY BIRTHDAY!', color: 0xff2d55 },
  ...([[-4, 0xff8fab], [-2.2, 0x8fd3ff], [2.2, 0xffd23f], [4, 0x8be39a]] as const).map(([x, color]): LevelObject => ({ type: 'ball', pos: [x, DAIS + 2.5, -21.2], radius: 0.28, color, collide: false })),
  { type: 'hazard', kind: 'pedestrian', pos: [-3.4, DAIS + 0.02, -19.6], params: { points: [[0, 0, 0], [-2, 0, 1.4]], speed: 0.4, color: 0xff8fab } },
  { type: 'hazard', kind: 'pedestrian', pos: [3.4, DAIS + 0.02, -18.8], params: { points: [[0, 0, 0], [2, 0, -1.4]], speed: 0.4, color: 0x52d39a } },
];

const level: LevelDef = {
  id: 'jelly',
  name: 'Wibble Wobble',
  tagline: 'A giant jelly for a birthday party. It wobbles. A lot. Too much and it tears.',
  order: 13,
  cargo: 'jelly',
  cameraYaw: 0,
  spawn: { p1: [-1.1, 0, 15.5], p2: [1.1, 0, 15.5], cargo: [0, JY, 15.5], yaw: 180, yaws: [90, -90] },
  goal: { pos: [0, DAIS + JY + 0.1, -15.6], size: [1.1, 0.8, 1.1], label: 'ON THE CAKE STAND' },
  checkpoints: [
    { pos: [0, 1, 7.6], size: [5, 2, 2.4], spawn: { p1: [-4.6, 0, 8.4], p2: [-2.4, 0, 8.4], cargo: [-3.5, JY, 8.4], yaw: 180, yaws: [90, -90] } },
    { pos: [0, 1, -8.4], size: [5, 2, 2.4], spawn: { p1: [-5.6, 0, -8.6], p2: [-3.4, 0, -8.6], cargo: [-4.5, JY, -8.6], yaw: 180, yaws: [90, -90] } },
  ],
  killY: -6,
  parTime: 95,
  variety: { times: ['day', 'sunset', 'night'] },
  goals: [{ kind: 'mint', c: 0.85 }, { kind: 'under', s: 90 }],
  objects: [...objects, ...cakeStand(-3.5, 0, 8.4), ...cakeStand(-4.5, 0, -8.6)],
  hints: ['Hold the platter, one each side. Let the wobble settle!'],
  tips: [
    { pos: [0, 0, 12.4], radius: 2.0, text: 'Chefs coming through! Wait, then go.' },
    { pos: [0, 0, 5.4], radius: 2.0, text: 'Waiters cross the aisle. Smooth stops, or it wobbles!' },
    { pos: [0, 0, -9.6], radius: 2.0, text: 'Up onto the dais, slowly.' },
  ],
  theme: {
    sunDir: [0.35, 0.8, 0.4],
    skyTop: 0x9cc6ea,
    skyHorizon: 0xfbeee4,
    fog: 0xf6ece4,
    hemiIntensity: 1.3,
  },
};

export default level;
