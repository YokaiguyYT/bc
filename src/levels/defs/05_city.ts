import type { LevelDef, LevelObject, Vec3 } from '../types';
import { ramp, wall } from '../helpers';
import { bush, counter, crosswalk, fence, island, roadLine } from '../props';

/**
 * JOB 5 — Piece of Cake (a three-tier wedding cake)
 * Out of the bakery → busy sidewalk → cross on the green man (traffic
 * light + two lanes of cars) → through the park (fountain, a dog, pigeons) →
 * a second street with no lights → up the aisle and onto the cake table.
 */
const WALK = 0.12; // sidewalk / park / garden level (streets are at 0)
const STREET1: [number, number] = [3, 11]; // z range
const STREET2: [number, number] = [-22, -14];
const X1 = -2; // first crosswalk
const X2 = 4; // second crosswalk + the aisle

/** A gentle kerb ramp from the street up to the walk at a crosswalk. */
const kerbRamp = (x: number, zStreet: number, zKerb: number): LevelObject =>
  ramp([x, 0, zStreet], [x, WALK, zKerb], 3.0, { surface: 'concrete', color: 0xc9c4bb, thickness: 0.3 });

/** A white folding chair (seat + back), facing -Z (toward the gazebo). */
const chair = (x: number, z: number): LevelObject[] => [
  { type: 'box', pos: [x, WALK + 0.45, z], size: [0.45, 0.06, 0.45], color: 0xfbfaf6, radius: 0.02 },
  { type: 'box', pos: [x, WALK + 0.72, z + 0.2], size: [0.45, 0.5, 0.05], color: 0xfbfaf6, radius: 0.02 },
  { type: 'box', pos: [x, WALK + 0.21, z], size: [0.4, 0.42, 0.4], color: 0xfbfaf6, visible: false },
];

const flowers = (pos: Vec3, n: number, spread: number): LevelObject[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { type: 'ball' as const, pos: [pos[0] + Math.cos(a) * spread, pos[1], pos[2] + Math.sin(a) * spread] as Vec3, radius: 0.09, color: i % 2 ? 0xff9fb2 : 0xfbfaf6, collide: false };
  });

const objects: LevelObject[] = [
  // ---- the ground: asphalt island; walks, park and garden are raised kerb-high blocks
  ...island([0, 0, -9.5], [44, 71], 'asphalt'),
  { type: 'box', pos: [0, WALK / 2, 18.5], size: [44, WALK, 15], surface: 'concrete', color: 0xd9d4ca, radius: 0.02 },
  { type: 'box', pos: [0, WALK / 2, -5.5], size: [44, WALK, 17], surface: 'concrete', color: 0xd9d4ca, radius: 0.02 },
  { type: 'box', pos: [0, WALK / 2, -33.5], size: [44, WALK, 23], surface: 'concrete', color: 0xd9d4ca, radius: 0.02 },
  // streets: lane lines and zebra crossings
  ...roadLine([-21.5, 0, (STREET1[0] + STREET1[1]) / 2], [21.5, 0, (STREET1[0] + STREET1[1]) / 2], 0xffd23f),
  ...roadLine([-21.5, 0, (STREET2[0] + STREET2[1]) / 2], [21.5, 0, (STREET2[0] + STREET2[1]) / 2], 0xffd23f),
  ...crosswalk([X1, 0, (STREET1[0] + STREET1[1]) / 2], 90, 8, 3),
  ...crosswalk([X2, 0, (STREET2[0] + STREET2[1]) / 2], 90, 8, 3),
  kerbRamp(X1, STREET1[1] - 0.6, STREET1[1]),
  kerbRamp(X1, STREET1[0] + 0.6, STREET1[0]),
  kerbRamp(X2, STREET2[1] - 0.6, STREET2[1]),
  kerbRamp(X2, STREET2[0] + 0.6, STREET2[0]),

  // ---- the bakery (x -8..4, z 14..24)
  { type: 'box', pos: [-2, WALK + 0.006, 19], size: [12, 0.012, 10], surface: 'checker', color: 0xfff1f5, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-8, WALK, 14], [4, WALK, 14], 3.0, { surface: 'plaster', color: 0xffd6e0, doors: [[(X1 + 8) / 12, 2.2, 2.4]] }),
  ...wall([-8, WALK, 14], [-8, WALK, 24], 3.0, { surface: 'plaster', color: 0xffd6e0 }),
  ...wall([4, WALK, 14], [4, WALK, 24], 3.0, { surface: 'plaster', color: 0xffd6e0 }),
  ...wall([-8, WALK, 24], [4, WALK, 24], 1.0, { surface: 'plaster', color: 0xffd6e0 }), // cutaway
  // striped awning + sign over the door (outside, facing the street)
  { type: 'box', pos: [X1, WALK + 2.75, 13.4], size: [3.4, 0.08, 1.2], surface: 'hazard', color: 0xff8fab, collide: false, rot: [-12, 0, 0] },
  { type: 'sign', pos: [X1, WALK + 3.3, 13.88], size: [3.6, 0.6, 0.06], text: 'PATISSERIE', color: 0xff6b8b, rot: [0, 180, 0] },
  // display counter + shelves
  ...counter([-6.8, WALK, 19], [0.8, 1.0, 6.0], 0xfbfaf6, 0xff8fab),
  ...[16.8, 18.2, 19.6, 21.0].map((z) => ({ type: 'ball' as const, pos: [-6.8, WALK + 1.12, z] as Vec3, radius: 0.12, color: 0xf5c16c, collide: false })),
  { type: 'box', pos: [3.75, WALK + 1.4, 19], size: [0.4, 0.06, 6.0], color: 0x8a5a36, collide: false },
  { type: 'box', pos: [3.75, WALK + 1.9, 19], size: [0.4, 0.06, 6.0], color: 0x8a5a36, collide: false },
  ...[17, 18.4, 19.8, 21.2].map((z) => ({ type: 'box' as const, pos: [3.7, WALK + 1.55, z] as Vec3, size: [0.3, 0.22, 0.5] as Vec3, color: 0xd9a05b, collide: false, radius: 0.08 })),
  // the cake waits on its pedestal table
  { type: 'cylinder', pos: [X1, WALK + 0.4, 19], radius: 0.5, height: 0.8, color: 0xfbfaf6, segments: 28 },
  { type: 'cylinder', pos: [1.6, WALK + 0.37, 21.8], radius: 0.4, height: 0.74, color: 0xffd6e0 },
  { type: 'cylinder', pos: [-4.8, WALK + 0.37, 22.2], radius: 0.4, height: 0.74, color: 0xffd6e0 },
  { type: 'hazard', kind: 'pedestrian', pos: [-7.55, WALK, 16.5], params: { points: [[0, 0, 0], [0, 0, 5]], speed: 0.3, color: 0xfbfaf6 } }, // the baker

  // ---- sidewalk 1 (z 11..14)
  { type: 'hazard', kind: 'pedestrian', pos: [-16, WALK, 12.4], params: { points: [[0, 0, 0], [32, 0, 0]], speed: 0.5, color: 0x8bc34a } },
  { type: 'hazard', kind: 'pedestrian', pos: [16, WALK, 12.9], params: { points: [[0, 0, 0], [-32, 0, 0]], speed: 0.45, color: 0xb085f5 } },
  { type: 'hazard', kind: 'pigeons', pos: [-5.0, WALK, 12.2], params: { count: 6, radius: 1.2 } },
  { type: 'model', model: 'hotdogCart', pos: [8, WALK, 12.6], rot: [0, 90, 0] },
  { type: 'model', model: 'bench', pos: [-12, WALK, 13.6], rot: [0, 180, 0] },
  { type: 'model', model: 'streetLamp', pos: [-10, WALK, 11.4], rot: [0, 90, 0] },
  { type: 'model', model: 'streetLamp', pos: [6, WALK, 11.4], rot: [0, 90, 0] },
  { type: 'model', model: 'hydrant', pos: [3.0, WALK, 11.5] },
  { type: 'model', model: 'trashCan', pos: [11.5, WALK, 13.5], dynamic: { mass: 8 } },
  { type: 'model', model: 'flowerPot', pos: [-8.6, WALK, 13.6], dynamic: { mass: 6 } },
  { type: 'model', model: 'flowerPot', pos: [4.6, WALK, 13.6], dynamic: { mass: 6 } },

  // ---- street 1: lights at the crossing, two lanes that stop on red
  { type: 'hazard', kind: 'trafficLight', pos: [X1 - 2.1, WALK, 11.4], params: { tag: 'main', green: 7, yellow: 1.6, red: 7.5, offset: 2 } },
  { type: 'hazard', kind: 'trafficLight', pos: [X1 + 2.1, WALK, 2.6], rot: [0, 180, 0], params: { tag: 'main', green: 7, yellow: 1.6, red: 7.5, offset: 2 } },
  { type: 'hazard', kind: 'car', pos: [-22, 0, 9.0], params: { dirYaw: 90, length: 44, speed: 6.5, count: 3, stopAt: X1 - 1.5 + 22 - 1.1, signal: 'main', phase: 0 } },
  { type: 'hazard', kind: 'car', pos: [22, 0, 5.0], params: { dirYaw: -90, length: 44, speed: 6, count: 3, stopAt: 22 - (X1 + 1.5) - 1.1, signal: 'main', phase: 0.4 } },
  { type: 'sign', pos: [X1 - 3.2, WALK + 2.2, 11.6], size: [1.6, 0.5, 0.05], text: 'WAIT FOR\nRED LIGHT', color: 0x3d5a80, post: true },

  // ---- sidewalk 2 + the park (z -14..3)
  { type: 'hazard', kind: 'pigeons', pos: [5, WALK, 1.5], params: { count: 5, radius: 1.0 } },
  { type: 'model', model: 'mailbox', pos: [-8, WALK, 2.4], rot: [0, 180, 0] },
  { type: 'model', model: 'streetLamp', pos: [-12, WALK, 2.6], rot: [0, -90, 0] },
  { type: 'model', model: 'streetLamp', pos: [12, WALK, 2.6], rot: [0, -90, 0] },
  { type: 'box', pos: [0, WALK + 0.006, -5.5], size: [30, 0.012, 11], surface: 'grass', collide: false, castShadow: false, radius: 0.003 },
  // paths: in from the crossing, round the fountain, out to the second crossing
  { type: 'box', pos: [X1, WALK + 0.009, -1.4], size: [2.4, 0.012, 2.8], color: 0xe6dccb, collide: false, castShadow: false, radius: 0.003 },
  { type: 'cylinder', pos: [X1, WALK + 0.008, -5.5], radius: 3.6, height: 0.012, color: 0xe6dccb, collide: false, segments: 48 },
  { type: 'box', pos: [2.0, WALK + 0.009, -9.6], size: [2.4, 0.012, 4.4], rot: [0, -38, 0], color: 0xe6dccb, collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [X2, WALK + 0.009, -12.3], size: [2.4, 0.012, 3.4], color: 0xe6dccb, collide: false, castShadow: false, radius: 0.003 },
  // fountain
  { type: 'cylinder', pos: [X1, WALK + 0.25, -5.5], radius: 2.1, height: 0.5, color: 0xd8d4cc, segments: 40 },
  { type: 'cylinder', pos: [X1, WALK + 0.48, -5.5], radius: 1.9, height: 0.06, color: 0x7fc8e8, segments: 40, collide: false },
  { type: 'cylinder', pos: [X1, WALK + 0.95, -5.5], radius: 0.22, height: 1.4, color: 0xd8d4cc },
  { type: 'cylinder', pos: [X1, WALK + 1.7, -5.5], radius: 0.8, radiusTop: 0.5, height: 0.2, color: 0xd8d4cc, segments: 28 },
  { type: 'model', model: 'bench', pos: [X1 - 4.4, WALK, -5.5], rot: [0, 90, 0] },
  { type: 'model', model: 'bench', pos: [X1 + 4.4, WALK, -3.2], rot: [0, -60, 0] },
  { type: 'model', model: 'tree', pos: [-11, WALK, -2.5] },
  { type: 'model', model: 'tree', pos: [-12, WALK, -9.5] },
  { type: 'model', model: 'tree', pos: [10, WALK, -2] },
  { type: 'model', model: 'tree', pos: [12, WALK, -9] },
  ...bush([-7, WALK, -10], 0.6),
  ...bush([8, WALK, -11], 0.55),
  ...bush([-6.5, WALK, -0.8], 0.5),
  { type: 'hazard', kind: 'dog', pos: [7, WALK, -6], params: { radius: 4, area: [6, 6] } },
  { type: 'hazard', kind: 'pigeons', pos: [X1 + 1.2, WALK, -1.6], params: { count: 7, radius: 1.3 } },
  { type: 'model', model: 'parasol', pos: [-8.5, WALK, -6.5], collider: 'none' },
  { type: 'model', model: 'gardenTable', pos: [-8.5, WALK, -6.5] },

  // ---- street 2: no lights. Look both ways.
  { type: 'hazard', kind: 'car', pos: [-22, 0, -16.0], params: { dirYaw: 90, length: 44, speed: 6.5, count: 2, phase: 0.15 } },
  { type: 'hazard', kind: 'car', pos: [22, 0, -20.0], params: { dirYaw: -90, length: 44, speed: 5.5, count: 2, phase: 0.6 } },
  { type: 'sign', pos: [X2 - 2.6, WALK + 2.2, -13.6], size: [1.8, 0.5, 0.05], text: 'LOOK BOTH\nWAYS', color: 0xe9554b, post: true },

  // ---- the wedding garden (z -45..-22)
  { type: 'box', pos: [0, WALK + 0.006, -35.2], size: [28, 0.012, 19.2], surface: 'grass', collide: false, castShadow: false, radius: 0.003 },
  ...fence([-14, WALK, -25.6], [X2 - 1.6, WALK, -25.6]),
  ...fence([X2 + 1.6, WALK, -25.6], [14, WALK, -25.6]),
  ...fence([-14, WALK, -25.6], [-14, WALK, -44.6]),
  ...fence([14, WALK, -25.6], [14, WALK, -44.6]),
  ...fence([-14, WALK, -44.6], [14, WALK, -44.6]),
  // flower arch over the gate
  ...[X2 - 1.5, X2 + 1.5].map((x) => ({ type: 'cylinder' as const, pos: [x, WALK + 1.25, -25.6] as Vec3, radius: 0.07, height: 2.5, color: 0xfbfaf6 })),
  { type: 'box', pos: [X2, WALK + 2.55, -25.6], size: [3.3, 0.12, 0.2], color: 0xfbfaf6, collide: false, radius: 0.04 },
  ...flowers([X2 - 1.5, WALK + 2.0, -25.6], 6, 0.16),
  ...flowers([X2 + 1.5, WALK + 2.0, -25.6], 6, 0.16),
  ...flowers([X2, WALK + 2.62, -25.6], 8, 0.4),
  { type: 'sign', pos: [X2, WALK + 3.0, -25.5], size: [2.8, 0.5, 0.05], text: 'JUST MARRIED (SOON)', color: 0xff8fab },
  // aisle and chairs
  { type: 'box', pos: [X2, WALK + 0.012, -31.2], size: [1.6, 0.012, 10.4], color: 0xfbfaf6, collide: false, castShadow: false, radius: 0.003 },
  ...[-29, -30.4, -31.8, -33.2].flatMap((z) => [X2 - 4.6, X2 - 3.9, X2 - 3.2, X2 - 2.5, X2 - 1.8, X2 + 1.8, X2 + 2.5, X2 + 3.2, X2 + 3.9, X2 + 4.6].flatMap((x) => chair(x, z))),
  // the gazebo (backdrop) and the cake table in front of it
  { type: 'model', model: 'gazebo', pos: [X2, WALK, -40.5], collider: 'none' },
  { type: 'cylinder', pos: [X2, WALK + 0.37, -36.6], radius: 0.6, height: 0.74, color: 0xfbfaf6, segments: 32 },
  { type: 'cylinder', pos: [X2, WALK + 0.745, -36.6], radius: 0.66, height: 0.02, color: 0xffd6e0, collide: false, segments: 32 },
  ...flowers([X2, WALK + 0.8, -36.6], 10, 0.62),
  // buffet + guests
  ...counter([11, WALK, -34], [1.0, 0.8, 5.0], 0xfbfaf6, 0xfbfaf6),
  ...[-32.5, -33.5, -34.5, -35.5].map((z, i) => ({ type: 'ball' as const, pos: [11, WALK + 0.9, z] as Vec3, radius: 0.12, color: [0xf5c16c, 0xe9554b, 0x8bc34a, 0xff8fab][i], collide: false })),
  { type: 'hazard', kind: 'pedestrian', pos: [9.4, WALK, -32], params: { points: [[0, 0, 0], [0, 0, -4]], speed: 0.3, color: 0x2b2b33 } },
  { type: 'hazard', kind: 'pedestrian', pos: [-4, WALK, -36.5], params: { points: [[0, 0, 0], [3.2, 0, 0.6]], speed: 0.25, color: 0xff8fab } },
  { type: 'hazard', kind: 'pedestrian', pos: [-6, WALK, -28], params: { points: [[0, 0, 0], [0, 0, -6]], speed: 0.3, color: 0x4dd0e1 } },
  ...bush([-12, WALK, -42.5], 0.7),
  ...bush([12, WALK, -42.5], 0.7),
  { type: 'model', model: 'tree', pos: [-11, WALK, -30] },
];

const level: LevelDef = {
  id: 'city',
  name: 'Piece of Cake',
  tagline: 'Three tiers of wedding cake, two busy streets, one park full of pigeons. Keep it level.',
  order: 5,
  cargo: 'cake',
  cameraYaw: 0,
  spawn: { p1: [X1 - 1.05, WALK, 19], p2: [X1 + 1.05, WALK, 19], cargo: [X1, WALK + 0.8 + 0.03, 19], yaw: 180 },
  goal: { pos: [X2, WALK + 1.15, -36.6], size: [1.3, 0.9, 1.3], label: 'ON THE CAKE TABLE' },
  checkpoints: [
    { pos: [X1, WALK + 1, 0.8], size: [4.4, 2, 3.2], spawn: { p1: [X1 - 1.05, WALK, 0.4], p2: [X1 + 1.05, WALK, 0.4], cargo: [X1, WALK + 0.03, 0.4], yaw: 180 } },
    { pos: [X2, WALK + 1, -23.8], size: [4.4, 2, 3.2], spawn: { p1: [X2 - 1.05, WALK, -24.2], p2: [X2 + 1.05, WALK, -24.2], cargo: [X2, WALK + 0.03, -24.2], yaw: 180 } },
  ],
  killY: -6,
  parTime: 170,
  hints: ['Keep the cake LEVEL. Bumps hurt it.', 'Cross when the cars have a RED light', 'No lights on the second street: look both ways', 'Pigeons scatter. Dogs do not.'],
  theme: { sunDir: [0.3, 0.9, 0.4], skyTop: 0x62a8f0, skyHorizon: 0xe3f0fa },
  objects,
};

export default level;
