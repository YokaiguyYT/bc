import type { LevelDef, LevelObject, Vec3 } from '../types';
import { floor, ramp, railing, wall } from '../helpers';
import { picture, rug, table, windowPane } from '../props';

/**
 * JOB 11 — Swing Time (a crystal chandelier for the Grand Ballroom)
 * The antiques storeroom → swing doors → the ballroom, where couples waltz
 * round and across → the grand staircase up to the gallery → onto the stand
 * on the stage, under the hook. The crystals swing with every start and stop.
 */
const UP = 2.0; // the gallery and the stage
const STAND = 0.45; // a plinth's height
const CY = STAND + 0.55 + 0.02; // the chandelier's middle, standing on a plinth
const GOLD = 0xd9a93f;
const CREAM = 0xf3e6cf;

/** A round velvet plinth. */
const plinth = (x: number, y: number, z: number, color = 0x8e2b3a): LevelObject[] => [
  { type: 'cylinder', pos: [x, y + STAND / 2, z], radius: 0.36, height: STAND, color, segments: 24 },
  { type: 'cylinder', pos: [x, y + STAND - 0.02, z], radius: 0.4, height: 0.04, color: GOLD, segments: 24 },
];

/** A marble column with a gold cap. */
const column = (x: number, z: number, y = 0, h = 3.4): LevelObject[] => [
  { type: 'cylinder', pos: [x, y + h / 2, z], radius: 0.28, height: h, color: 0xf4efe6, segments: 18 },
  { type: 'cylinder', pos: [x, y + h - 0.08, z], radius: 0.38, height: 0.16, color: GOLD, segments: 18, collide: false },
  { type: 'cylinder', pos: [x, y + 0.08, z], radius: 0.38, height: 0.16, color: 0xe6dccb, segments: 18, collide: false },
];

/** One of the ballroom's own chandeliers, high up (decor). */
const hanging = (x: number, z: number): LevelObject[] => [
  { type: 'model', model: 'chandelier', pos: [x, 3.3, z], size: [1.0, 1.4, 1.0], collider: 'none', align: 'center' },
];

const objects: LevelObject[] = [
  // ---- the whole building's floor (and a lawn outside so nobody falls forever)
  { type: 'box', pos: [0, -0.6, 0], size: [60, 1, 90], surface: 'grass', color: 0x6fae55 },

  // ---- the antiques storeroom (x -5..5, z 14..22)
  floor([0, 18], 0.01, [10, 8], 'woodDark', { thickness: 0.05 }),
  ...wall([-5, 0, 22], [5, 0, 22], 1.0, { surface: 'brick', color: 0xb5654a }),
  ...wall([-5, 0, 14], [-5, 0, 22], 3, { surface: 'brick', color: 0xb5654a, fade: true }),
  ...wall([5, 0, 14], [5, 0, 22], 3, { surface: 'brick', color: 0xb5654a, fade: true }),
  { type: 'sign', pos: [0, 2.45, 13.9], size: [3.4, 0.45, 0.05], text: 'ANTIQUES · HANDLE WITH CARE', color: 0x5b3a22, rot: [0, 180, 0] },
  ...plinth(0, 0, 18.5),
  rug([0, 0, 18.5], [2.8, 1.8], 0x6b2f3a),
  { type: 'model', model: 'bookshelf', pos: [-4.6, 0, 19.5], rot: [0, 90, 0] },
  { type: 'model', model: 'bookshelf', pos: [-4.6, 0, 17.4], rot: [0, 90, 0] },
  { type: 'model', model: 'knight', pos: [4.3, 0, 20.8], rot: [0, -120, 0] },
  { type: 'model', model: 'armchair', pos: [3.9, 0, 16.2], rot: [0, -70, 0] },
  { type: 'model', model: 'crate', pos: [-3.6, 0, 21.2] },
  { type: 'model', model: 'crate', pos: [-2.7, 0, 21.4], size: [0.6, 0.6, 0.6] },
  { type: 'model', model: 'floorLamp', pos: [3.9, 0, 21.3] },
  ...picture([-1.8, 1.6, 21.85], 180, 0.9, 0.6, 0x7cc4a4),
  ...picture([1.8, 1.6, 21.85], 180, 0.6, 0.8, 0xd98a6c),

  // ---- the wall between, with swing doors into the ballroom
  ...wall([-10, 0, 14], [10, 0, 14], 3.4, { surface: 'wallpaper', color: CREAM, fade: true, doors: [[0.5, 3.2, 2.7]] }),
  { type: 'hazard', kind: 'swingDoor', pos: [-1.56, 0.02, 14.0], params: { width: 1.5, height: 2.5, side: 1, open: 85, spring: 3, color: 0xffffff } },
  { type: 'hazard', kind: 'swingDoor', pos: [1.56, 0.02, 14.0], params: { width: 1.5, height: 2.5, side: -1, open: 85, spring: 3, color: 0xffffff } },

  // ---- the ballroom (x -10..10, z -10..14)
  floor([0, 2], 0.01, [20, 24], 'woodLight', { thickness: 0.05 }),
  { type: 'box', pos: [0, 0.03, 2], size: [11, 0.01, 17], color: 0xf7f0e2, surface: 'checker', collide: false, castShadow: false, radius: 0.003, tile: 1.4 },
  ...wall([-10, 0, -10], [-10, 0, 14], 3.4, { surface: 'wallpaper', color: CREAM, fade: true }),
  ...wall([10, 0, -10], [10, 0, 14], 3.4, { surface: 'wallpaper', color: CREAM, fade: true }),
  ...[-6, 0, 6].flatMap((z) => [...windowPane([-9.88, 1.7, z], 90, 1.6, 2.0), ...windowPane([9.88, 1.7, z], -90, 1.6, 2.0)]),
  ...[10, 4, -2, -8].flatMap((z) => [...column(-7.6, z), ...column(7.6, z)]),
  ...hanging(-3.5, 6),
  ...hanging(3.5, 6),
  ...hanging(-3.5, -3),
  ...hanging(3.5, -3),
  // the band (a piano) and the drinks tables round the edge
  { type: 'model', model: 'piano', pos: [-8.6, 0, -4.8], rot: [0, 90, 0] },
  { type: 'box', pos: [-8.6, 0.12, -4.8], size: [2.6, 0.24, 3.6], color: 0x5b3a22, radius: 0.04 },
  ...table([8.6, 0, 8.5], [1.0, 0.75, 2.6], 0xfbfaf6, 90),
  ...table([8.6, 0, 0.5], [1.0, 0.75, 2.6], 0xfbfaf6, 90),
  ...([[8.5, 9.2], [8.7, 8.0], [8.5, 1.0], [8.7, -0.2]] as const).map(([x, z]) => ({ type: 'cylinder' as const, pos: [x, 0.85, z] as Vec3, radius: 0.05, height: 0.2, color: 0xffe9a0, collide: false })),
  // waltzing couples: two round the edges, two right across the middle
  { type: 'hazard', kind: 'pedestrian', pos: [-6.2, 0.02, 10.5], params: { points: [[0, 0, 0], [2.6, 0, 0], [2.6, 0, -3], [0, 0, -3]], speed: 0.55, color: 0xff8fab } },
  { type: 'hazard', kind: 'pedestrian', pos: [-3.6, 0.02, 7.5], params: { points: [[0, 0, 0], [-2.6, 0, 0], [-2.6, 0, 3], [0, 0, 3]], speed: 0.55, color: 0x2b2b33 } },
  { type: 'hazard', kind: 'pedestrian', pos: [6.2, 0.02, -5.5], params: { points: [[0, 0, 0], [-2.6, 0, 0], [-2.6, 0, -3], [0, 0, -3]], speed: 0.55, color: 0x8fd3ff } },
  { type: 'hazard', kind: 'pedestrian', pos: [-4.5, 0.02, 3.0], params: { points: [[0, 0, 0], [9, 0, 0]], speed: 0.6, color: 0xb388ff } },
  { type: 'hazard', kind: 'pedestrian', pos: [4.5, 0.02, -2.0], params: { points: [[0, 0, 0], [-9, 0, 0]], speed: 0.6, color: 0xffd23f } },
  { type: 'sign', pos: [-2.8, 1.9, 11.4], size: [2.6, 0.5, 0.06], text: 'MIND THE WALTZERS', color: 0x8e2b3a, post: true },

  // ---- the grand staircase (a carpeted slope) up to the gallery
  ramp([0, 0, -9.9], [0, UP, -16.9], 3.8, { surface: 'carpet', color: 0x8e2b3a }),
  ...railing([-2.0, 0, -9.9], [-2.0, UP, -16.9], { color: GOLD }),
  ...railing([2.0, 0, -9.9], [2.0, UP, -16.9], { color: GOLD }),
  { type: 'box', pos: [-6.1, UP / 2, -13.4], size: [8.2, UP, 7], surface: 'plaster', color: 0xe6dccb, radius: 0.05 },
  { type: 'box', pos: [6.1, UP / 2, -13.4], size: [8.2, UP, 7], surface: 'plaster', color: 0xe6dccb, radius: 0.05 },
  // the gallery
  floor([0, -19.5], UP, [20, 5.2], 'woodLight'),
  { type: 'box', pos: [0, UP / 2, -19.5], size: [20, UP - 0.05, 5.2], surface: 'plaster', color: 0xe6dccb, radius: 0.05 },
  ...railing([-10, UP, -16.95], [-2.0, UP, -16.95], { color: GOLD }),
  ...railing([2.0, UP, -16.95], [10, UP, -16.95], { color: GOLD }),
  { type: 'model', model: 'plant', pos: [-2.6, UP, -17.6] },
  { type: 'model', model: 'plant', pos: [2.6, UP, -17.6] },
  // a photographer pacing the gallery
  { type: 'hazard', kind: 'pedestrian', pos: [-5, UP + 0.02, -19.6], params: { points: [[0, 0, 0], [10, 0, 0]], speed: 0.5, color: 0x52d39a } },

  // ---- the stage (z -22..-28): curtains, footlights, the hook and the plinth
  floor([0, -25], UP, [12, 6], 'woodDark'),
  { type: 'box', pos: [0, UP / 2, -25], size: [12, UP - 0.05, 6], surface: 'plaster', color: 0x5b3a22, radius: 0.05 },
  ...wall([-6, UP, -28], [6, UP, -28], 3.6, { surface: 'plain', color: 0x8e2b3a }),
  { type: 'box', pos: [-5.2, UP + 1.8, -24.4], size: [1.4, 3.6, 0.25], color: 0xa3283b, radius: 0.08 },
  { type: 'box', pos: [5.2, UP + 1.8, -24.4], size: [1.4, 3.6, 0.25], color: 0xa3283b, radius: 0.08 },
  { type: 'sign', pos: [0, UP + 3.0, -27.85], size: [4.2, 0.6, 0.05], text: 'THE GRAND BALL', color: 0x8e2b3a },
  { type: 'cylinder', pos: [0, UP + 3.0, -24.6], radius: 0.02, height: 1.3, color: 0x2b2b33, collide: false },
  { type: 'box', pos: [0, UP + 2.35, -24.6], size: [0.12, 0.12, 0.04], color: 0x9aa3ad, collide: false },
  ...plinth(0, UP, -24.6, 0x5b3a22),
  ...([-4, -2, 2, 4] as const).map((x) => ({ type: 'cylinder' as const, pos: [x, UP + 0.06, -22.3] as Vec3, radius: 0.1, height: 0.12, color: 0xffe9a0, collide: false })),
  { type: 'hazard', kind: 'light', pos: [0, UP + 3.2, -23.0], params: { color: 0xffe6b0, intensity: 6, distance: 9, style: 'none' } },
];

const level: LevelDef = {
  id: 'ballroom',
  name: 'Swing Time',
  tagline: 'A crystal chandelier for the Grand Ball. Mind the waltzers. Mind the crystals.',
  order: 11,
  cargo: 'chandelier',
  cameraYaw: 0,
  spawn: { p1: [-1.1, 0, 18.5], p2: [1.1, 0, 18.5], cargo: [0, CY, 18.5], yaw: 180, yaws: [90, -90] },
  goal: { pos: [0, UP + CY, -24.6], size: [1.3, 1.0, 1.3], label: 'ON THE STAGE' },
  checkpoints: [
    { pos: [0, 1, 11.2], size: [6, 2, 2.4], spawn: { p1: [3.9, 0, 11.6], p2: [6.1, 0, 11.6], cargo: [5.0, CY, 11.6], yaw: 180, yaws: [90, -90] } },
    { pos: [0, UP + 1, -19.0], size: [4.4, 2, 2.6], spawn: { p1: [-6.1, UP, -19.6], p2: [-3.9, UP, -19.6], cargo: [-5.0, UP + CY, -19.6], yaw: 180, yaws: [90, -90] } },
  ],
  killY: -6,
  parTime: 110,
  variety: { times: ['day', 'sunset', 'night'] },
  goals: [{ kind: 'mint', c: 0.9 }, { kind: 'nofalls' }],
  objects: [...objects, ...plinth(5.0, 0, 11.6), ...plinth(-5.0, UP, -19.6)],
  hints: ['Hold it by the ring of arms, one each side'],
  tips: [
    { pos: [0, 0, 12.6], radius: 2.0, text: 'Waltzers cross the floor. Let them pass, then go.' },
    { pos: [0, 0, -9.0], radius: 2.2, text: 'Up the stairs together, nice and slow.' },
    { pos: [0, UP, -21.6], radius: 2.0, text: 'Set it down on the plinth, under the hook.' },
  ],
  theme: {
    sunDir: [0.4, 0.8, 0.35],
    skyTop: 0x9cc6ea,
    skyHorizon: 0xf8efe4,
    fog: 0xf4ece2,
    hemiIntensity: 1.3,
  },
};

export default level;
