import type { LevelDef, LevelObject } from '../types';
import { railing, ramp } from '../helpers';
import { bush, island } from '../props';

/**
 * JOB 4 — Glass Act (pane of glass)
 * Construction site: rack → cone slalom → two-plank trench → scaffold ramp →
 * see-saw over the sky → sideways conveyor → wrecking ball → install it upstairs.
 */
const DIRT = 0xd8c39f;
const S = 3; // scaffold deck height
const TOP = 6; // building floor with the window frame

const scaffoldPipes = (x0: number, x1: number, z0: number, z1: number, h: number): LevelObject[] => {
  const out: LevelObject[] = [];
  for (const x of [x0, x1])
    for (const z of [z0, z1]) out.push({ type: 'cylinder', pos: [x, h / 2, z], radius: 0.07, height: h, color: 0xf2b134, segments: 10 });
  for (const yy of [h * 0.5]) {
    out.push({ type: 'box', pos: [(x0 + x1) / 2, yy, z0], size: [Math.abs(x1 - x0), 0.1, 0.1], color: 0xf2b134, collide: false, radius: 0.04 });
    out.push({ type: 'box', pos: [(x0 + x1) / 2, yy, z1], size: [Math.abs(x1 - x0), 0.1, 0.1], color: 0xf2b134, collide: false, radius: 0.04 });
  }
  return out;
};

const cone = (x: number, z: number): LevelObject => ({ type: 'model', model: 'cone', pos: [x, 0, z], dynamic: { mass: 2 } });

/**
 * A padded glazier's rack: the pane stands on the base board and leans on the
 * bar (which hands can't grab). `lean` is the side the bar is on: +1 → +z.
 */
const glassRack = (x: number, y: number, z: number, lean: 1 | -1): LevelObject[] => [
  { type: 'box', pos: [x, y + 0.06, z], size: [2.6, 0.12, 0.8], surface: 'wood', color: 0x8a5a36 },
  { type: 'box', pos: [x, y + 0.135, z - lean * 0.14], size: [2.0, 0.03, 0.03], color: 0x2a2a30, radius: 0.01 }, // rubber stop
  ...[-1.08, 1.08].map((dx) => ({ type: 'box' as const, pos: [x + dx, y + 0.6, z + lean * 0.12] as [number, number, number], size: [0.08, 0.96, 0.08] as [number, number, number], color: 0x8a5a36, radius: 0.035, grabbable: false })),
  { type: 'box', pos: [x, y + 1.0, z + lean * 0.104], size: [2.3, 0.06, 0.06], color: 0x3d6fb0, radius: 0.028, grabbable: false, friction: 0.05 }, // padded bar
];

const objects: LevelObject[] = [
  // ---- ground: south slab, trench, north slab
  ...island([0, 0, 4], [26, 16], 'concrete').map((o) => (o.type === 'box' && o.surface === 'concrete' && o.pos[1] === -0.25 ? { ...o, color: DIRT } : o)),
  ...island([-3, 0, -13], [32, 13], 'concrete').map((o) => (o.type === 'box' && o.surface === 'concrete' && o.pos[1] === -0.25 ? { ...o, color: DIRT } : o)),
  // two planks over the trench (one mover each!)
  { type: 'box', pos: [-1.25, 0.04, -5.25], size: [0.75, 0.14, 3.6], surface: 'woodLight' },
  { type: 'box', pos: [1.25, 0.04, -5.25], size: [0.75, 0.14, 3.6], surface: 'woodLight' },
  { type: 'sign', pos: [3.6, 1.6, -3.4], size: [1.8, 0.6, 0.06], text: 'ONE PLANK\nEACH!', color: 0xe9554b, post: true },

  // ---- start: the pane leans on a padded glazier's rack by the delivery truck
  ...glassRack(0, 0, 8.5, 1),
  // and a spare rack where it respawns at checkpoint 1, off to the side of the ramp foot
  // (the strip between the trench and the ramp is the way through)
  ...glassRack(-6.2, 0, -7.6, 1),
  { type: 'model', model: 'forklift', pos: [-5.5, 0, 9], rot: [0, 120, 0] },
  { type: 'model', model: 'pallet', pos: [4.6, 0, 9.2] },
  { type: 'box', pos: [4.6, 0.45, 9.2], size: [0.9, 0.6, 0.7], surface: 'brick', color: 0xc9694e, dynamic: { mass: 30 } },
  { type: 'model', model: 'portaPotty', pos: [9.5, 0, 9.5], rot: [0, -90, 0] },
  { type: 'model', model: 'cementMixer', pos: [-8.5, 0, 3.5], rot: [0, 60, 0] },
  { type: 'model', model: 'excavator', pos: [8.5, 0, 2], rot: [0, -150, 0] },

  // ---- cone + barrier slalom (z 5 → -1): weave left, right, left — wide enough to carry it broadside
  { type: 'model', model: 'barrier', pos: [1.8, 0, 4.4], dynamic: { mass: 20 } },
  cone(-0.2, 4.4), cone(3.6, 4.4), cone(4.6, 4.4),
  { type: 'model', model: 'barrier', pos: [-1.8, 0, 1.6], dynamic: { mass: 20 } },
  cone(0.2, 1.6), cone(-3.6, 1.6), cone(-4.6, 1.6),
  { type: 'model', model: 'barrier', pos: [2.6, 0, -1.2], dynamic: { mass: 20 } },
  cone(4.4, -1.2), cone(5.4, -1.2),
  { type: 'model', model: 'wheelbarrow', pos: [5.2, 0, -1.5], rot: [0, 30, 0], dynamic: { mass: 12 } },

  // ---- north slab: scaffold ramp up to the deck
  { type: 'model', model: 'cone', pos: [-3.2, 0, -8.2] },
  { type: 'model', model: 'cone', pos: [3.2, 0, -8.2] },
  ramp([0, 0, -9.0], [0, S, -14.6], 3.4, { surface: 'woodLight', thickness: 0.18 }),
  ...railing([1.75, 0, -9.0], [1.75, S, -14.6], { color: 0xf2b134 }),
  ...railing([-1.75, 0, -9.0], [-1.75, S, -14.6], { color: 0xf2b134 }),
  // deck 1 (x -8..2, z -18..-14.6)
  { type: 'box', pos: [-3, S - 0.1, -16.3], size: [10, 0.2, 3.4], surface: 'woodLight' },
  ...scaffoldPipes(-7.9, 1.9, -14.7, -17.9, S),
  ...railing([1.95, S, -18], [1.95, S, -14.6], { color: 0xf2b134 }),
  ...railing([-7.9, S, -14.65], [-1.8, S, -14.65], { color: 0xf2b134 }),
  ...railing([-7.9, S, -18.0], [1.9, S, -18.0], { color: 0xf2b134 }),
  { type: 'model', model: 'cone', pos: [-7.2, S, -14.9] },
  { type: 'sign', pos: [-7.6, S + 1.9, -18.0], size: [1.8, 0.55, 0.06], text: 'SEE-SAW →', color: 0x3d5a80 },

  // see-saw over the gap (x -13..-8)
  { type: 'hazard', kind: 'seesaw', pos: [-10.5, S + 0.05, -16.3], params: { length: 6.6, width: 2.0, maxAngle: 15, mass: 55 } },
  { type: 'box', pos: [-10.5, S - 3.4, -16.3], size: [0.4, 6.4, 0.4], color: 0xf2b134, radius: 0.06 },

  // deck 2 + conveyor run (x -17..-13, z -18 .. 1)
  { type: 'box', pos: [-15.2, S - 0.1, -16.3], size: [4.4, 0.2, 3.4], surface: 'woodLight' },
  ...scaffoldPipes(-17.3, -13.1, -14.7, -17.9, S),
  ...railing([-17.35, S, -18], [-13.1, S, -18], { color: 0xf2b134 }),
  // belt runs north-south (8.2 m) and drags everything sideways toward the east rail
  { type: 'hazard', kind: 'conveyor', pos: [-15.2, S - 0.15, -10.4], params: { size: [8.2, 0.3, 4.0], speed: 1.3 }, rot: [0, 90, 0] },
  { type: 'box', pos: [-13.05, S + 0.15, -10.4], size: [0.18, 0.3, 8.4], color: 0xffd23f, surface: 'hazard', radius: 0.03 },
  ...railing([-13.05, S + 0.3, -14.5], [-13.05, S + 0.3, -6.3], { color: 0xf2b134, height: 0.75 }),
  ...railing([-13.05, S, -15.25], [-13.05, S, -14.5], { color: 0xf2b134, spacing: 0.7 }), // close the corner by the see-saw
  { type: 'sign', pos: [-12.6, S + 1.2, -10.4], size: [1.6, 0.5, 0.06], text: '← CONVEYOR', color: 0xe9554b, rot: [0, -90, 0], post: false },
  // wrecking ball run
  { type: 'box', pos: [-15.2, S - 0.1, -2.2], size: [4.4, 0.2, 8.2], surface: 'woodLight' },
  ...scaffoldPipes(-17.3, -13.1, -6.2, 1.8, S),
  ...railing([-13.05, S, -6.3], [-13.05, S, 1.8], { color: 0xf2b134 }),
  { type: 'hazard', kind: 'wreckingBall', pos: [-15.2, S + 8.4, -2.4], params: { length: 7.2, amp: 52, period: 5.2, yaw: 90, radius: 0.62 } },
  { type: 'box', pos: [-15.2, S + 0.005, -2.4], size: [4.2, 0.012, 1.4], surface: 'hazard', collide: false, castShadow: false, radius: 0.004 },

  // checkpoint 2 deck + final ramp up into the building
  { type: 'box', pos: [-15.2, S - 0.1, 3.4], size: [4.4, 0.2, 3.2], surface: 'woodLight' },
  ...scaffoldPipes(-17.3, -13.1, 1.9, 4.9, S),
  ramp([-15.2, S, 4.9], [-15.2, TOP, 10.2], 3.4, { surface: 'woodLight', thickness: 0.18 }),
  ...railing([-13.45, S, 4.9], [-13.45, TOP, 10.2], { color: 0xf2b134 }),
  ...railing([-16.95, S, 4.9], [-16.95, TOP, 10.2], { color: 0xf2b134 }),

  // building under construction (floor at TOP)
  { type: 'box', pos: [-15.2, TOP - 0.2, 13.0], size: [9, 0.4, 5.6], surface: 'concrete' },
  ...[-19.4, -11.0].flatMap((x) => [10.4, 15.6].map((z) => ({ type: 'box' as const, pos: [x, TOP / 2, z] as [number, number, number], size: [0.5, TOP, 0.5] as [number, number, number], surface: 'concrete' as const, color: 0xb9b4ab }))),
  ...[-19.4, -11.0].flatMap((x) => [10.4, 15.6].map((z) => ({ type: 'box' as const, pos: [x, TOP + 1.6, z] as [number, number, number], size: [0.4, 3.2, 0.4] as [number, number, number], surface: 'concrete' as const, color: 0xc9c6c0 }))),
  { type: 'box', pos: [-15.2, TOP + 3.3, 13.0], size: [9, 0.3, 5.6], surface: 'concrete', color: 0xc9c6c0, collide: false },
  // back wall with the empty window frame
  { type: 'box', pos: [-18.1, TOP + 1.5, 15.6], size: [3.2, 3, 0.3], surface: 'brick' },
  { type: 'box', pos: [-12.3, TOP + 1.5, 15.6], size: [2.9, 3, 0.3], surface: 'brick' },
  { type: 'box', pos: [-15.2, TOP + 0.35, 15.6], size: [2.7, 0.7, 0.3], surface: 'brick' },
  { type: 'box', pos: [-15.2, TOP + 2.75, 15.6], size: [2.7, 0.5, 0.3], surface: 'brick' },
  { type: 'box', pos: [-15.2, TOP + 1.55, 15.62], size: [2.5, 1.7, 0.12], color: 0xfbfaf6, collide: false, radius: 0.02 },
  { type: 'sign', pos: [-15.2, TOP + 3.0, 15.35], size: [2.6, 0.45, 0.06], text: 'INSTALL HERE ↓', color: 0x2f7a5b, rot: [0, 180, 0] },
  ...railing([-19.6, TOP, 10.25], [-16.95, TOP, 10.25], { color: 0xf2b134 }),
  ...railing([-13.45, TOP, 10.25], [-10.8, TOP, 10.25], { color: 0xf2b134 }),

  // ---- background dressing
  { type: 'model', model: 'crane', pos: [8, 0, -12], rot: [0, -40, 0], collider: 'none' },
  { type: 'model', model: 'portaPotty', pos: [9.0, 0, -9], rot: [0, -60, 0] },
  { type: 'model', model: 'pallet', pos: [6.5, 0, -15] },
  { type: 'box', pos: [6.5, 0.5, -15], size: [1.0, 0.8, 0.8], surface: 'brick', color: 0xc9694e },
  { type: 'model', model: 'ladder', pos: [2.5, 0, -13.9], rot: [-12, 0, 0], collider: 'none' },
  ...bush([-11, 0, 8], 0.8),
  ...bush([11.2, 0, -3], 0.7),
];

const level: LevelDef = {
  id: 'glass',
  name: 'Glass Act',
  tagline: 'One very large, very fragile pane. One construction site. Zero safety rails (almost).',
  order: 4,
  cargo: 'glass',
  cameraYaw: 0,
  spawn: { p1: [-1.4, 0, 8.45], p2: [1.4, 0, 8.45], cargo: [0, 0.73, 8.5], cargoRot: [8, 0, 0], yaw: 180 },
  goal: { pos: [-15.2, TOP + 1.0, 13.6], size: [4.4, 2, 3.4], label: 'INSTALL HERE' },
  checkpoints: [
    // respawn on the flat ground just before the ramp (on the ramp, the pane was out of reach behind its side)
    { pos: [0, 1, -10.5], size: [8, 2, 3.4], spawn: { p1: [-7.6, 0, -7.6], p2: [-4.8, 0, -7.6], cargo: [-6.2, 0.73, -7.6], cargoRot: [8, 0, 0], yaw: 180 } },
    { pos: [-15.2, S + 1, 3.4], size: [4.4, 2, 3.2], spawn: { p1: [-16.5, S, 3.6], p2: [-13.9, S, 3.6], cargo: [-15.2, S + 0.75, 3.0], yaw: 0, cargoYaw: 0 } },
  ],
  killY: -7,
  parTime: 180,
  hints: ['Lift the glass off the rack together', 'Weave through the cones: sidestep, don’t turn'],
  tips: [
    { pos: [0, 0, -2.4], radius: 1.8, text: 'One plank each! Walk side by side' },
    { pos: [-6.2, S, -16.3], radius: 1.8, text: 'See-saw! It tips as you cross: keep going' },
    { pos: [-15.4, S, -15.6], radius: 1.5, text: 'The belt drags you sideways: steer against it' },
    { pos: [-15.3, S, -5.4], radius: 1.6, text: 'Wrecking ball! Wait till it swings away, then go' },
  ],
  theme: { sunDir: [0.35, 0.85, 0.45] },
  objects,
};

export default level;
