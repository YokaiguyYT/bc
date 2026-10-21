import type { LevelDef, LevelObject } from '../types';
import { railing, stairs, wall } from '../helpers';
import { bush, counter, island, movingTruck, picture, roadLine, rug, table, windowPane } from '../props';
import { PALETTE } from '../../render/materials';

/**
 * JOB 1 — Move-Out Day (CRT TV)
 * Living room → narrow hallway with a corner → tight door → open fire escape
 * → sidewalk → up the ramp into the truck.
 */
const F = 3.0; // apartment floor height
const H = 2.4; // wall height
const W = { fade: true, surface: 'wallpaper' as const };

const truck = movingTruck([12, 0, 11.2], 180, { color: 0xff7a3d });

const objects: LevelObject[] = [
  // ---- the island + street
  ...island([5, 0, 1], [32, 30], 'concrete'),
  { type: 'box', pos: [12, 0.005, 1], size: [6.5, 0.01, 30], surface: 'asphalt', collide: false, radius: 0.005, castShadow: false },
  ...roadLine([12, 0, -13.5], [12, 0, 15.5], 0xffffff),
  { type: 'box', pos: [8.6, 0.06, 1], size: [0.3, 0.12, 30], color: 0xd8d4cc, radius: 0.03 },

  // ---- the building (solid ground floor, brick)
  { type: 'box', pos: [-1.5, F - 2.25, -1.25], size: [11, 4.5, 16.5], surface: 'brick', color: 0xd27a5c },
  ...windowPane([-4.5, 1.4, 7.03], 0),
  ...windowPane([-1.5, 1.4, 7.03], 0),
  ...windowPane([1.5, 1.4, 7.03], 0),
  ...windowPane([4.03, 1.4, 3], 90),
  ...windowPane([4.03, 1.4, -1.5], 90),
  ...windowPane([4.03, 1.4, -5.5], 90),
  // front door of the building (decor)
  { type: 'box', pos: [-6.0, 1.05, 7.04], size: [1.2, 2.1, 0.06], color: 0x3d5a80, collide: false, radius: 0.02 },

  // ---- living room (x -7..4, z 0..7)
  { type: 'box', pos: [-1.5, F + 0.006, 3.5], size: [11, 0.012, 7], surface: 'wood', collide: false, radius: 0.003, castShadow: false },
  ...wall([-7, F, 7], [4, F, 7], 0.9, { surface: 'wallpaper' }),
  ...wall([-7, F, 0], [-7, F, 7], H, W),
  ...wall([4, F, 0], [4, F, 7], H, W),
  ...wall([-7, F, 0], [4, F, 0], H, { ...W, doors: [[0.227, 1.5, 2.1]] }),
  rug([1.2, F, 4.2], [3.4, 2.6], 0xc0675f),
  ...counter([1.2, F, 5.9], [1.3, 0.55, 0.5], 0x8a5a36, 0x5b3a22),
  ...table([1.2, F, 4.3], [1.1, 0.42, 0.6], PALETTE.woodDark),
  { type: 'model', model: 'sofa', pos: [1.2, F, 2.55] },
  { type: 'model', model: 'armchair', pos: [-2.2, F, 4.4], rot: [0, 90, 0] },
  { type: 'model', model: 'floorLamp', pos: [-3.3, F, 6.3], dynamic: { mass: 6 } },
  { type: 'model', model: 'bookshelf', pos: [-6.7, F, 3.6], rot: [0, 90, 0] },
  { type: 'model', model: 'plant', pos: [3.4, F, 6.4] },
  { type: 'model', model: 'plantSmall', pos: [-6.3, F, 6.3] },
  ...counter([2.3, F, 0.45], [2.6, 0.95, 0.6], 0xf2ede4, 0x5b3a22),
  { type: 'model', model: 'fridge', pos: [3.55, F, 0.5] },
  { type: 'model', model: 'washer', pos: [-0.5, F, 0.5] },
  ...picture([-6.88, F + 1.5, 1.6], 90, 0.8, 0.55, 0x7cc4a4),
  ...picture([-6.88, F + 1.6, 5.4], 90, 0.6, 0.8, 0xf5a65b),
  // moving boxes in the way
  { type: 'box', pos: [-5.6, F + 0.3, 1.0], size: [0.6, 0.6, 0.6], surface: 'cardboard', dynamic: { mass: 5 } },
  { type: 'box', pos: [-4.95, F + 0.28, 1.15], size: [0.55, 0.55, 0.55], surface: 'cardboard', dynamic: { mass: 4 } },
  { type: 'box', pos: [-5.35, F + 0.86, 1.05], size: [0.5, 0.5, 0.5], surface: 'cardboard', dynamic: { mass: 3 } },
  { type: 'box', pos: [2.9, F + 0.25, 2.1], size: [0.5, 0.5, 0.5], surface: 'cardboard', dynamic: { mass: 3 } },
  { type: 'box', pos: [-1.6, F + 0.22, 1.4], size: [0.7, 0.44, 0.5], surface: 'cardboard', dynamic: { mass: 4 } },

  // ---- hallway (x -5.6..-3.4, z -7..0)
  { type: 'box', pos: [-4.5, F + 0.006, -4.6], size: [2.2, 0.012, 9.2], surface: 'woodDark', collide: false, radius: 0.003, castShadow: false },
  ...wall([-5.6, F, -9.2], [-5.6, F, 0], H, W),
  ...wall([-3.4, F, -7], [-3.4, F, 0], H, W),
  ...counter([-5.3, F, -3.4], [0.45, 0.8, 1.2], 0x8a5a36, 0x5b3a22, 90),
  { type: 'model', model: 'coatRack', pos: [-3.75, F, -5.6] },
  rug([-4.5, F, -1.8], [1.2, 2.4], 0x5b8def),
  ...picture([-5.48, F + 1.5, -1.5], 90, 0.6, 0.45, 0xb7a6ef),
  ...picture([-3.52, F + 1.5, -2.8], -90, 0.5, 0.65, 0xff9fb2),

  // ---- east corridor (x -5.6..4, z -9.2..-7) ending in the tight door
  { type: 'box', pos: [-0.8, F + 0.006, -8.1], size: [9.6, 0.012, 2.2], surface: 'woodDark', collide: false, radius: 0.003, castShadow: false },
  ...wall([-5.6, F, -9.2], [4, F, -9.2], H, W),
  ...wall([-3.4, F, -7], [4, F, -7], H, W),
  ...wall([4, F, -9.2], [4, F, -7], H, { ...W, doors: [[0.5, 1.15, 2.1]] }),
  ...counter([0.2, F, -8.95], [1.2, 0.45, 0.35], 0xf2ede4, 0x8a5a36),
  { type: 'model', model: 'plantSmall', pos: [2.6, F, -8.85] },
  ...picture([-1.5, F + 1.5, -9.08], 0, 0.9, 0.5, 0x9fe3c4),
  { type: 'sign', pos: [3.2, F + 2.0, -9.06], size: [1.0, 0.3, 0.04], text: 'EXIT →', color: 0x2f7a5b },

  // ---- rooftop nook behind the hallway (not walkable: parapet)
  { type: 'box', pos: [0.25, F + 0.006, -3.5], size: [7.3, 0.012, 7], color: 0xb9b4ab, surface: 'concrete', collide: false, radius: 0.003, castShadow: false },
  ...wall([3.9, F, -7], [3.9, F, 0], 1.0, { surface: 'concrete', color: 0xcfc9bf }),
  { type: 'box', pos: [1.2, F + 0.45, -3.2], size: [1.2, 0.9, 0.9], surface: 'metal', color: 0xd8dde3 },
  { type: 'cylinder', pos: [-1.5, F + 0.6, -5.2], radius: 0.18, height: 1.2, color: 0x9aa3ad },
  { type: 'box', pos: [-2.0, F + 0.35, -1.6], size: [0.8, 0.7, 1.2], surface: 'metal', color: 0xc4ccd4 },

  // ---- fire escape (outside, x 4..7)
  { type: 'box', pos: [5.5, F - 0.1, -7.45], size: [3, 0.2, 3.9], surface: 'metal' },
  ...stairs([5.0, 1.5, -0.5], 180, 9, 0.167, 0.55, 1.6, { surface: 'metal', color: 0x8d9aa6 }).map((s) => ({ ...s, size: [s.size[0], 0.14, s.size[2]] as [number, number, number], pos: [s.pos[0], s.pos[1] + s.size[1] / 2 - 0.07, s.pos[2]] as [number, number, number] })),
  { type: 'box', pos: [5.5, 1.4, 1.0], size: [3, 0.2, 3], surface: 'metal' },
  ...stairs([5.0, 0, 7.45], 180, 9, 0.167, 0.55, 1.6, { surface: 'metal', color: 0x8d9aa6 }).map((s) => ({ ...s, size: [s.size[0], 0.14, s.size[2]] as [number, number, number], pos: [s.pos[0], s.pos[1] + s.size[1] / 2 - 0.07, s.pos[2]] as [number, number, number] })),
  // support posts
  ...[-9.3, -5.6, -0.4, 2.4].map((z) => ({ type: 'box' as const, pos: [6.9, (F - 0.2) / 2, z] as [number, number, number], size: [0.12, F - 0.2, 0.12] as [number, number, number], color: 0x6b7480, radius: 0.03 })),
  ...railing([7, F, -9.4], [7, F, -5.5]),
  ...railing([5.85, F, -5.5], [5.85, 1.5, -0.5]),
  ...railing([7, 1.5, -0.5], [7, 1.5, 2.5]),
  ...railing([5.85, 1.5, 2.5], [5.85, 0, 7.45]),

  // ---- street dressing
  { type: 'model', model: 'hydrant', pos: [8.0, 0, 6.2] },
  { type: 'model', model: 'mailbox', pos: [7.9, 0, -3.5], rot: [0, -90, 0] },
  { type: 'model', model: 'trashCan', pos: [-8.0, 0, 9.5], dynamic: { mass: 8 } },
  { type: 'model', model: 'dumpster', pos: [-8.6, 0, -4], rot: [0, 90, 0] },
  { type: 'model', model: 'streetLamp', pos: [8.2, 0, 0.5], rot: [0, 90, 0] },
  { type: 'model', model: 'streetLamp', pos: [8.2, 0, 12.5], rot: [0, 90, 0] },
  { type: 'model', model: 'muscleCar', pos: [12.3, 0, -8], rot: [0, 180, 0] },
  { type: 'model', model: 'tree', pos: [-7.5, 0, 12.5] },
  { type: 'model', model: 'tree', pos: [18.5, 0, -10] },
  ...bush([-3.5, 0, 9.3], 0.7),
  ...bush([1.0, 0, 9.0], 0.55),
  { type: 'model', model: 'movingTruck', pos: [18, 0, 4], rot: [0, 180, 0] },
  ...truck.objs,
  { type: 'sign', pos: [9.0, 2.8, 14.5], size: [2.2, 0.7, 0.08], text: 'LOAD HERE ↑', color: 0xff7a3d, post: true, rot: [0, 0, 0] },
];

const level: LevelDef = {
  id: 'moveout',
  name: 'Move-Out Day',
  tagline: 'Get the old CRT out of the apartment, down the fire escape and into the truck.',
  order: 1,
  cargo: 'tv',
  cameraYaw: 0,
  spawn: { p1: [-0.4, F, 4.8], p2: [2.8, F, 4.8], cargo: [1.2, F + 0.92, 5.9], yaw: 0, cargoYaw: 180 },
  goal: { ...truck.goal, label: 'INTO THE TRUCK' },
  checkpoints: [
    // a mover either side of the TV (both behind it made one of them reach past the other)
    { pos: [5.5, F + 1, -7.45], size: [3, 2, 3.9], spawn: { p1: [4.6, F, -6.7], p2: [6.4, F, -6.7], cargo: [5.5, F + 0.45, -6.7], yaw: 0, cargoYaw: 0 } },
    { pos: [6.2, 1, 9.4], size: [3.6, 2, 2.6], spawn: { p1: [5.0, 0, 9.8], p2: [7.4, 0, 9.8], cargo: [6.2, 0.45, 8.9], yaw: 0, cargoYaw: 0 } },
  ],
  killY: -6,
  parTime: 150,
  objects,
  hints: ['Grab the TV from both sides and lift together'],
  tips: [
    { pos: [1.5, F, -8.1], radius: 2.0, text: 'Tight door: one of you goes through first, the TV follows' },
    { pos: [5.2, F, -6.6], radius: 1.4, text: 'No walls on the fire escape. Small steps!' },
    { pos: [12, 0, 13], radius: 2.4, text: 'Up the ramp, all the way in, then let go' },
  ],
  theme: { sunDir: [0.5, 0.9, 0.25] },
};

export default level;
