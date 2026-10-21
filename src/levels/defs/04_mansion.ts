import type { LevelDef, LevelObject } from '../types';
import { railing, stairs, wall } from '../helpers';
import { bush, counter, island, movingTruck, picture, rug, table } from '../props';
import { PALETTE } from '../../render/materials';

/**
 * JOB 4 — Time to Go (grandfather clock, laid on its back)
 * Upstairs study → the long gallery (suits of armour, a low chandelier) →
 * the grand staircase → across the great hall (piano, butler) → out of the
 * front doors → up the ramp into the antiques van.
 */
const F = 4.5; // upper floor
const WALL = 0xe9dcc3;
const PAPER = { surface: 'wallpaper' as const, color: 0xb9cfa8 };
const CLOCK_Y = F + 0.21; // a clock lying on its back
const LYING: [number, number, number] = [-90, 90, 0]; // on its back, top pointing west

const van = movingTruck([6, 0, 13.4], 0, { color: 0x2f5d4a, rampWidth: 2.2, rampLength: 4.8, rampRails: true, logo: 'ANTIQUES R US\nhandle with care' });

const knight = (x: number, y: number, z: number, yaw = 0): LevelObject => ({
  type: 'model',
  model: 'knight',
  pos: [x, y, z],
  rot: [0, yaw, 0],
  collider: { size: [0.5, 1.9, 0.5] },
  dynamic: { mass: 38 },
});

const vase = (x: number, y: number, z: number, color = 0x3d6fb0): LevelObject[] => [
  { type: 'cylinder', pos: [x, y + 0.2, z], radius: 0.11, radiusTop: 0.07, height: 0.4, color, dynamic: { mass: 2 } },
];

// the grand staircase runs down the back wall of the hall, straight on from the gallery
const STAIR_TOP = 3.0; // x where the gallery meets the top step
const STAIR_FOOT = 13.0; // x of the bottom step's front edge
const stairY = (x: number) => (F * (STAIR_FOOT - x)) / (STAIR_FOOT - STAIR_TOP);

const objects: LevelObject[] = [
  // ---- grounds
  ...island([0, 0, 3], [36, 50], 'grass'),
  { type: 'box', pos: [6, 0.006, 11.2], size: [3.2, 0.012, 6.4], surface: 'concrete', color: 0xd9cfbf, collide: false, castShadow: false, radius: 0.004 }, // drive
  { type: 'box', pos: [6, 0.008, 9.0], size: [5.0, 0.016, 2.0], surface: 'tiles', color: 0xe8e0d0, collide: false, castShadow: false, radius: 0.004 }, // porch
  ...bush([2.4, 0, 10.5], 0.6),
  ...bush([9.6, 0, 10.5], 0.6),
  ...bush([2.4, 0, 13.0], 0.55),
  ...bush([9.6, 0, 13.0], 0.55),
  { type: 'model', model: 'tree', pos: [-14, 0, 18] },
  { type: 'model', model: 'tree', pos: [15, 0, 21] },
  { type: 'model', model: 'tree', pos: [15.5, 0, -14] },
  { type: 'model', model: 'streetLamp', pos: [9.4, 0, 16.5], rot: [0, -90, 0] },
  // fountain
  { type: 'cylinder', pos: [-5, 0.3, 15], radius: 2.0, height: 0.6, color: 0xd8d4cc, segments: 32 },
  { type: 'cylinder', pos: [-5, 0.58, 15], radius: 1.8, height: 0.06, color: 0x7fc8e8, segments: 32, collide: false },
  { type: 'cylinder', pos: [-5, 1.0, 15], radius: 0.25, height: 1.4, color: 0xd8d4cc },
  { type: 'cylinder', pos: [-5, 1.75, 15], radius: 0.8, radiusTop: 0.5, height: 0.2, color: 0xd8d4cc, segments: 24 },
  ...bush([-10, 0, 12], 0.7),

  // ---- the van
  ...van.objs,

  // ---- mansion: back wing (solid up to the upper floor) + the gallery's footing
  { type: 'box', pos: [0, F / 2, -14], size: [28, F, 8], surface: 'brick', color: 0xc9b8a0 },
  { type: 'box', pos: [-5.5, F / 2, -8.8], size: [17, F, 2.4], surface: 'brick', color: 0xc9b8a0 },
  // great hall walls (x -14..14, z -7.6..8)
  ...wall([-14, 0, -7.6], [-14, 0, 8], 6.5, { surface: 'plaster', color: WALL }),
  ...wall([14, 0, -10], [14, 0, 8], 6.5, { surface: 'plaster', color: WALL }),
  ...wall([-14, 0, 8], [14, 0, 8], 3.2, { surface: 'plaster', color: WALL, fade: true, doors: [[(14 + 6) / 28, 2.6, 2.6]] }),
  // the front doors stand wide open for the movers
  ...[4.66, 7.34].map((x) => ({ type: 'box' as const, pos: [x, 1.275, 8.68] as [number, number, number], size: [0.07, 2.55, 1.3] as [number, number, number], surface: 'woodDark' as const, color: 0x5b3a22, radius: 0.02 })),
  ...[4.4, 7.6].map((x) => ({ type: 'cylinder' as const, pos: [x, 1.6, 8.45] as [number, number, number], radius: 0.18, height: 3.2, color: 0xf4efe6, segments: 16 })),
  { type: 'sign', pos: [6, 3.0, 8.2], size: [2.6, 0.5, 0.05], text: 'WAYNSCOTT MANOR', color: 0x2f5d4a },

  // hall floor + a runner carpet from the foot of the stairs to the door
  { type: 'box', pos: [0, 0.006, 0.2], size: [28, 0.012, 15.6], surface: 'checker', color: 0xf3efe6, collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [13.5, 0.006, -8.8], size: [1.0, 0.012, 2.4], surface: 'checker', color: 0xf3efe6, collide: false, castShadow: false, radius: 0.003 },
  rug([11.6, 0, -1.6], [1.8, 11.4], 0xb03a3a),
  rug([8.9, 0, 4.9], [7.2, 1.8], 0xb03a3a),
  rug([6, 0, 6.6], [1.8, 2.4], 0xb03a3a),
  rug([-6.5, 0, -2.0], [6.0, 4.0], 0x7a5c99),
  // piano corner
  { type: 'model', model: 'piano', pos: [-8.5, 0, -2.5], rot: [0, 25, 0] },
  { type: 'box', pos: [-7.4, 0.25, -0.6], size: [0.9, 0.5, 0.4], color: 0x2a1c12, radius: 0.04 }, // piano stool
  { type: 'model', model: 'armchair', pos: [-4.5, 0, -3.6], rot: [0, -30, 0] },
  { type: 'model', model: 'armchair', pos: [-4.0, 0, -0.6], rot: [0, -110, 0] },
  ...table([-11.5, 0, 4.5], [1.6, 0.75, 0.9], PALETTE.woodDark),
  ...vase(-11.8, 0.75, 4.4, 0x3d6fb0),
  ...vase(-11.1, 0.75, 4.6, 0xd9a93f),
  ...counter([-2.5, 0, 6.9], [2.4, 0.9, 0.6], 0x5b3a22, 0x3b2616),
  ...vase(-3.0, 0.9, 6.9, 0xb03a3a),
  ...vase(-2.0, 0.9, 6.9, 0x3d6fb0),
  { type: 'model', model: 'plant', pos: [-13.3, 0, 7.3] },
  { type: 'model', model: 'plant', pos: [13.3, 0, 7.3] },
  { type: 'model', model: 'plant', pos: [2.4, 0, 7.3] },
  knight(-10.5, 0, -6.95),
  knight(-1.5, 0, -6.95),
  knight(13.35, 0, 6.6, -90),
  knight(-13.35, 0, 1.8, 90),
  ...picture([-13.88, 2.6, -1.0], 90, 1.4, 1.0, 0x8fb7d9),
  ...picture([13.88, 3.4, 0.5], -90, 1.4, 1.0, 0xe8b07a),
  { type: 'hazard', kind: 'chandelier', pos: [5, 7.4, 0.5], params: { length: 1.2 } },
  // the butler does his rounds, right across the route
  { type: 'hazard', kind: 'pedestrian', pos: [3.0, 0, 1.2], params: { points: [[0, 0, 0], [10, 0, 0], [10, 0, -5]], speed: 0.45, color: 0x2b2b33 } },

  // ---- grand staircase: down the back wall from the gallery (x 3) to the hall (x 13)
  ...stairs([STAIR_FOOT, 0, -8.8], -90, 25, F / 25, (STAIR_FOOT - STAIR_TOP) / 25, 2.4, { surface: 'woodDark', color: 0x6e3f22 }),
  // balustrade on the open side; it stops short of the bottom so a long load can swing round
  ...railing([STAIR_TOP, F, -7.65], [10.4, stairY(10.4), -7.65], { color: 0xf4efe6 }),
  ...picture([5.5, F + 0.6, -9.88], 0, 1.0, 0.8, 0x8a6f4d),
  ...picture([9.0, 2.6, -9.88], 0, 1.0, 0.8, 0x4d6f8a),

  // ---- upper floor: the gallery (x -6..3, z -10..-7.6)
  { type: 'box', pos: [-1.5, F + 0.006, -8.8], size: [9, 0.012, 2.4], surface: 'carpet', color: 0xb03a3a, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-6, F, -10], [14, F, -10], 2.8, PAPER),
  ...railing([-5.9, F, -7.65], [STAIR_TOP, F, -7.65], { color: 0xf4efe6 }),
  { type: 'box', pos: [-1.45, F + 0.5, -7.62], size: [8.9, 1.0, 0.1], visible: false }, // keep things on the balcony
  knight(-3.2, F, -9.6),
  knight(0.8, F, -9.6),
  ...picture([-4.6, F + 1.5, -9.88], 0, 0.9, 1.1, 0x8a6f4d),
  ...picture([-1.2, F + 1.5, -9.88], 0, 0.9, 1.1, 0x6f8a4d),
  { type: 'sign', pos: [2.2, F + 2.2, -9.87], size: [1.6, 0.4, 0.04], text: 'STAIRS →', color: 0x2f5d4a },
  { type: 'hazard', kind: 'chandelier', pos: [-1.0, F + 3.9, -8.8], params: { length: 1.6 } },
  // roof over the rooms behind the gallery
  { type: 'box', pos: [4, F + 2.95, -14], size: [20, 0.3, 8.4], surface: 'concrete', color: 0x8d6e63 },

  // ---- the study (x -14..-6, z -18..-7.6)
  { type: 'box', pos: [-10, F + 0.006, -12.8], size: [8, 0.012, 10.4], surface: 'woodDark', collide: false, castShadow: false, radius: 0.003 },
  ...wall([-14, F, -18], [-6, F, -18], 2.8, PAPER),
  ...wall([-14, F, -18], [-14, F, -7.6], 2.8, PAPER),
  ...wall([-6, F, -18], [-6, F, -7.6], 2.8, { ...PAPER, doors: [[(18 - 8.8) / 10.4, 1.6, 2.3]] }),
  ...wall([-14, F, -7.6], [-6, F, -7.6], 1.0, PAPER), // cutaway so the camera sees in
  ...[-12.6, -11.4, -8.6, -7.4].map((x) => ({ type: 'model' as const, model: 'bookshelf', pos: [x, F, -17.75] as [number, number, number] })),
  { type: 'model', model: 'desk', pos: [-10, F, -15.6] },
  { type: 'model', model: 'officeChair', pos: [-10, F, -16.5], dynamic: { mass: 8 } },
  // fireplace
  { type: 'box', pos: [-13.75, F + 0.65, -13.2], size: [0.5, 1.3, 2.0], surface: 'brick', color: 0xa0522d },
  { type: 'box', pos: [-13.45, F + 0.4, -13.2], size: [0.2, 0.7, 1.0], color: 0x2a1c12, collide: false },
  { type: 'box', pos: [-13.6, F + 1.35, -13.2], size: [0.8, 0.12, 2.3], color: 0x5b3a22, radius: 0.02 },
  { type: 'model', model: 'armchair', pos: [-12.4, F, -11.0], rot: [0, 120, 0] },
  { type: 'model', model: 'floorLamp', pos: [-13.3, F, -10.6], dynamic: { mass: 6 } },
  { type: 'model', model: 'plant', pos: [-6.6, F, -17.3] },
  { type: 'cylinder', pos: [-7.2, F + 0.45, -12.6], radius: 0.06, height: 0.9, color: 0x5b3a22 },
  { type: 'ball', pos: [-7.2, F + 1.05, -12.6], radius: 0.25, color: 0x5b8def },
  // the clock, laid on its back on a moving blanket
  rug([-10.2, F, -8.8], [2.8, 1.3], 0x3d6fb0),
  { type: 'sign', pos: [-10, F + 2.2, -17.84], size: [2.6, 0.5, 0.04], text: 'MIND THE CLOCK', color: 0x6e3f22 },
];

const level: LevelDef = {
  id: 'mansion',
  name: 'Time to Go',
  tagline: 'Grandad’s clock is going to the antiques dealer. It is long, heavy and very, very old.',
  order: 4,
  cargo: 'clock',
  cameraYaw: 0,
  spawn: { p1: [-11.85, F, -8.8], p2: [-8.55, F, -8.8], cargo: [-10.2, CLOCK_Y, -8.8], cargoRot: LYING, yaw: 90 },
  goal: { ...van.goal, label: 'INTO THE VAN' },
  checkpoints: [
    { pos: [1.4, F + 1, -8.8], size: [3.2, 2, 2.4], spawn: { p1: [-1.25, F, -8.8], p2: [2.05, F, -8.8], cargo: [0.4, CLOCK_Y, -8.8], cargoRot: LYING, yaw: 90 } },
    { pos: [11.6, 1, -5.6], size: [3.6, 2, 3.6], spawn: { p1: [11.6, 0, -6.75], p2: [11.6, 0, -3.35], cargo: [11.6, 0.21, -5.05], cargoRot: [-90, 0, 0], yaw: 0 } },
  ],
  killY: -6,
  parTime: 210,
  hints: ['Pick it up: an end each', 'Suits of armour fall over. Onto clocks.', 'The stairs are long. Slow and steady', 'At the bottom, one of you swings wide'],
  theme: { sunDir: [-0.4, 0.85, 0.35], skyTop: 0x7aa6e0, skyHorizon: 0xe8e4f0, fog: 0xe4e0ec },
  objects,
};

export default level;
