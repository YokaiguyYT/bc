import type { LevelDef, LevelObject, Vec3 } from '../types';
import { railing, wall } from '../helpers';
import { bush, counter, fence, island } from '../props';

/**
 * JOB 12 — Mind the Bees (a beehive, bees and all, to the new orchard)
 * The honey shed → the farmyard (chickens, a dog in its pen going bonkers)
 * → through the gate → over the footbridge → the orchard, where the
 * sprinklers are on → onto the stand by the other hives. Every jolt makes
 * the bees crosser; get them angry and they come out to sting.
 */
const STAND = 0.45;
const HY = STAND + 0.44 + 0.02; // the hive's middle, sitting on a stand
const DIRT = 0xb08a5a;
const WOOD = 0x9c6b3e;

/** A sturdy wooden stand for a hive. */
const stand = (x: number, y: number, z: number): LevelObject[] => [
  { type: 'box', pos: [x, y + STAND - 0.04, z], size: [0.9, 0.08, 0.7], color: WOOD, radius: 0.02 },
  ...([[-0.36, -0.26], [0.36, -0.26], [-0.36, 0.26], [0.36, 0.26]] as const).map(([dx, dz]) => ({ type: 'box' as const, pos: [x + dx, y + (STAND - 0.08) / 2, z + dz] as Vec3, size: [0.08, STAND - 0.08, 0.08] as Vec3, color: 0x6e4a2c, radius: 0.01 })),
  { type: 'box', pos: [x, y + (STAND - 0.08) / 2, z], size: [0.8, STAND - 0.08, 0.6], visible: false },
];

/** A beehive (decor): white boxes, a lid and a landing board, like the one being moved. */
const hive = (x: number, y: number, z: number, s = 0.85): LevelObject[] => [
  { type: 'box', pos: [x, y + 0.2 * s, z], size: [0.68 * s, 0.4 * s, 0.48 * s], color: 0xfbfaf6, radius: 0.02 },
  { type: 'box', pos: [x, y + 0.6 * s, z], size: [0.68 * s, 0.38 * s, 0.48 * s], color: 0xf5e6b8, radius: 0.02 },
  { type: 'box', pos: [x, y + 0.84 * s, z], size: [0.76 * s, 0.1 * s, 0.56 * s], color: 0xd9a93f, radius: 0.02 },
  { type: 'box', pos: [x, y + 0.04 * s, z + 0.3 * s], size: [0.5 * s, 0.03, 0.14 * s], color: 0x9c6b3e, collide: false },
];

/** A little apple tree (decor that stands in the way). */
const appleTree = (x: number, z: number, s = 1): LevelObject[] => [
  { type: 'cylinder', pos: [x, 0.7 * s, z], radius: 0.13 * s, height: 1.4 * s, color: 0x6e4a2c, segments: 10 },
  { type: 'ball', pos: [x, 1.75 * s, z], radius: 0.85 * s, color: 0x4f9a46, collide: false },
  { type: 'ball', pos: [x + 0.45 * s, 1.55 * s, z + 0.2 * s], radius: 0.55 * s, color: 0x5fae52, collide: false },
  ...([[0.5, 1.9, 0.5], [-0.6, 1.6, 0.3], [0.1, 1.5, -0.75], [-0.2, 2.2, -0.3]] as const).map(([dx, dy, dz]) => ({ type: 'ball' as const, pos: [x + dx * s, dy * s, z + dz * s] as Vec3, radius: 0.09, color: 0xd93a2b, collide: false })),
];

/** A bale of hay. */
const bale = (x: number, z: number, y = 0, yaw = 0): LevelObject => ({ type: 'box', pos: [x, y + 0.3, z], size: [1.1, 0.6, 0.6], rot: [0, yaw, 0], color: 0xe8c55a, radius: 0.08 });

const objects: LevelObject[] = [
  // ---- the farm: north field (shed, yard) and south field (orchard), a stream between
  ...island([0, 0, 10.65], [44, 26.7], 'grass'),
  ...island([0, 0, -19.15], [44, 27.7], 'grass'),
  // the stream (fall in and you're out)
  { type: 'box', pos: [0, -0.55, -4], size: [44, 0.04, 2.7], color: 0x4fa3d9, collide: false, castShadow: false, radius: 0.01 },
  { type: 'box', pos: [0, -2.2, -4], size: [44, 0.4, 2.7], color: 0x7a6040, collide: false, castShadow: false },
  // the footbridge
  { type: 'box', pos: [0, -0.08, -4], size: [3.4, 0.16, 3.6], color: WOOD, surface: 'wood', radius: 0.03 },
  ...railing([-1.7, 0, -2.3], [-1.7, 0, -5.7], { color: 0x6e4a2c, height: 0.8 }),
  ...railing([1.7, 0, -2.3], [1.7, 0, -5.7], { color: 0x6e4a2c, height: 0.8 }),
  // the dirt track all the way
  { type: 'box', pos: [0, 0.006, 6], size: [3.4, 0.01, 22], color: DIRT, collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [0, 0.006, -16], size: [3.4, 0.01, 17], color: DIRT, collide: false, castShadow: false, radius: 0.003 },

  // ---- the honey shed (x -4..4, z 13..20)
  { type: 'box', pos: [0, 0.006, 16.5], size: [8, 0.012, 7], surface: 'woodLight', collide: false, castShadow: false, radius: 0.003 },
  ...wall([-4, 0, 20], [4, 0, 20], 1.0, { surface: 'woodDark', color: 0x8a5a36 }),
  ...wall([-4, 0, 13], [-4, 0, 20], 2.6, { surface: 'woodDark', color: 0x8a5a36, fade: true }),
  ...wall([4, 0, 13], [4, 0, 20], 2.6, { surface: 'woodDark', color: 0x8a5a36, fade: true }),
  ...wall([-4, 0, 13], [4, 0, 13], 2.6, { surface: 'woodDark', color: 0x8a5a36, fade: true, doors: [[0.5, 3.2, 2.3]] }),
  { type: 'sign', pos: [0, 2.4, 12.9], size: [3.0, 0.42, 0.05], text: 'BUZZ FARM HONEY', color: 0xe9a23b, rot: [0, 180, 0] },
  ...stand(0, 0, 16.5),
  ...counter([-3.4, 0, 16.5], [1.0, 0.9, 4.6], 0xf2ede4, WOOD),
  // honey jars on the counter
  ...Array.from({ length: 8 }, (_, i): LevelObject => ({ type: 'cylinder', pos: [-3.35 + (i % 2) * 0.25, 1.0, 14.8 + Math.floor(i / 2) * 0.9], radius: 0.08, height: 0.18, color: 0xf2a81a, collide: false })),
  ...hive(3.3, 0, 18.9),
  ...hive(3.3, 0, 14.1),

  // ---- the farmyard: chickens on the left, the dog's pen on the right, a barn
  { type: 'hazard', kind: 'pigeons', pos: [-3.2, 0, 8.2], params: { count: 5, radius: 1.3, model: 'chicken', size: [0.3, 0.5, 0.5] } },
  { type: 'hazard', kind: 'pigeons', pos: [3.0, 0, 3.6], params: { count: 4, radius: 1.1, model: 'chicken', size: [0.3, 0.5, 0.5] } },
  ...fence([4.6, 0, 9.6], [9.4, 0, 9.6], 0x8a5a36, 1.1),
  ...fence([4.6, 0, 5.4], [9.4, 0, 5.4], 0x8a5a36, 1.1),
  ...fence([4.6, 0, 5.4], [4.6, 0, 9.6], 0x8a5a36, 1.1),
  ...fence([9.4, 0, 5.4], [9.4, 0, 9.6], 0x8a5a36, 1.1),
  { type: 'hazard', kind: 'dog', pos: [7, 0, 7.5], params: { radius: 1.6, area: [3.6, 3.2] } },
  { type: 'box', pos: [8.5, 0.4, 8.8], size: [0.8, 0.8, 0.7], color: 0xd94a3d, radius: 0.08 },
  { type: 'sign', pos: [7, 1.6, 9.7], size: [1.6, 0.4, 0.05], text: 'BEWARE OF DOG', color: 0xd94a3d, rot: [0, 180, 0] },
  { type: 'box', pos: [-11, 2.2, 6], size: [6, 4.4, 8], color: 0xb5463a, surface: 'woodDark', radius: 0.1 },
  { type: 'box', pos: [-11, 4.6, 6], size: [6.4, 0.4, 8.4], color: 0x6b2f2a, radius: 0.1, rot: [0, 0, 0] },
  bale(-7.2, 9.2),
  bale(-7.2, 8.4),
  bale(-7.2, 8.8, 0.6, 10),
  { type: 'model', model: 'wheelbarrow', pos: [-2.9, 0, 11.4], rot: [0, 30, 0] },
  { type: 'model', model: 'oilBarrel', pos: [3.3, 0, 11.8] },

  // ---- the gate (a field fence with a swing gate in the middle)
  ...fence([-21, 0, 0.2], [-1.6, 0, 0.2], 0x8a5a36, 1.1),
  ...fence([1.6, 0, 0.2], [21, 0, 0.2], 0x8a5a36, 1.1),
  { type: 'hazard', kind: 'swingDoor', pos: [-1.56, 0.02, 0.2], params: { width: 1.5, height: 1.1, side: 1, open: 85, spring: 2, color: 0x9c6b3e } },
  { type: 'hazard', kind: 'swingDoor', pos: [1.56, 0.02, 0.2], params: { width: 1.5, height: 1.1, side: -1, open: 85, spring: 2, color: 0x9c6b3e } },
  { type: 'sign', pos: [-2.6, 1.6, 0.3], size: [2.2, 0.45, 0.05], text: 'PLEASE SHUT THE GATE', color: 0x3f7a2a, post: true },

  // ---- the orchard: rows of apple trees, sprinklers going round
  ...[-8.5, -13.5, -18.5, -23.5].flatMap((z, i) => [...appleTree(-4.2, z, 1 + (i % 2) * 0.15), ...appleTree(4.2, z - 1, 1.1 - (i % 2) * 0.1), ...appleTree(-9, z - 1.5, 1.2), ...appleTree(9.5, z + 0.5, 1.1)]),
  { type: 'hazard', kind: 'sprinkler', pos: [-1.9, 0.01, -11], params: { radius: 4, speed: 1.2, push: 6, phase: 0.4 } },
  { type: 'hazard', kind: 'sprinkler', pos: [1.9, 0.01, -16.5], params: { radius: 4, speed: 1.4, push: 6, phase: 2.2 } },
  ...bush([-2.4, 0, -7.2], 0.5, 0x5fae52),
  ...bush([2.6, 0, -21.2], 0.5, 0x5fae52),
  ...([[-1.9, -7.6], [2.1, -8.4], [-2.2, -20.4], [2.0, -12.4]] as const).map(([x, z]) => ({ type: 'cylinder' as const, pos: [x, 0.15, z] as Vec3, radius: 0.2, height: 0.3, color: [0xff8fab, 0xffd23f, 0xb388ff, 0xffffff][Math.abs(Math.round(x * z)) % 4], collide: false })),

  // ---- the apiary at the far end: the new hive's stand among the others
  { type: 'box', pos: [0, 0.006, -27.5], size: [9, 0.012, 4], color: 0xd8c08a, collide: false, castShadow: false, radius: 0.003 },
  ...([-4.4, -2.7, 2.7, 4.4] as const).flatMap((x) => [...stand(x, 0, -28.4), ...hive(x, STAND, -28.4)]),
  ...stand(0, 0, -28.4),
  { type: 'sign', pos: [0, 1.9, -30.2], size: [2.4, 0.5, 0.05], text: 'NEW HIVE HERE', color: 0xe9a23b, post: true },
  ...fence([-5.5, 0, -30.6], [5.5, 0, -30.6], 0x8a5a36, 1.0),
];

const level: LevelDef = {
  id: 'bees',
  name: 'Mind the Bees',
  tagline: 'Move a beehive across the farm. With the bees still in it. Don’t annoy them.',
  order: 12,
  cargo: 'beehive',
  cameraYaw: 0,
  spawn: { p1: [-1.1, 0, 16.5], p2: [1.1, 0, 16.5], cargo: [0, HY, 16.5], yaw: 180, yaws: [90, -90] },
  goal: { pos: [0, HY, -28.4], size: [1.2, 1.0, 1.0], label: 'ON THE STAND' },
  checkpoints: [
    { pos: [0, 1, -0.9], size: [5, 2, 2.0], spawn: { p1: [-5.1, 0, -1.1], p2: [-2.9, 0, -1.1], cargo: [-4.0, HY, -1.1], yaw: 180, yaws: [90, -90] } },
    { pos: [0, 1, -19.0], size: [4.4, 2, 2.4], spawn: { p1: [-7.3, 0, -19.6], p2: [-5.1, 0, -19.6], cargo: [-6.2, HY, -19.6], yaw: 180, yaws: [90, -90] } },
  ],
  killY: -1.5,
  parTime: 95,
  variety: { times: ['day', 'sunset'], weather: ['rain'] },
  goals: [{ kind: 'nofalls' }, { kind: 'under', s: 90 }],
  objects: [...objects, ...stand(-4.0, 0, -1.1), ...stand(-6.2, 0, -19.6)],
  hints: ['One each side. Smooth starts, smooth stops!'],
  tips: [
    { pos: [0, 0, 11.6], radius: 2.0, text: 'If the bees get angry, stand still till they calm down.' },
    { pos: [0, 0, 1.6], radius: 1.8, text: 'Push the gate open with the hive. Gently!' },
    { pos: [0, 0, -9.0], radius: 2.2, text: 'Sprinklers! Wait for the jet to go round.' },
  ],
  theme: {
    sunDir: [-0.4, 0.8, 0.3],
    skyTop: 0x7fb6ea,
    skyHorizon: 0xf3f0de,
    fog: 0xeef0e2,
    hemiIntensity: 1.3,
  },
};

export default level;
