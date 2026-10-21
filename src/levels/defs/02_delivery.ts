import type { LevelDef, LevelObject } from '../types';
import { railing, stairs, wall } from '../helpers';
import { bush, counter, island, picture, roadLine, rug, table, windowPane } from '../props';
import { PALETTE } from '../../render/materials';

/**
 * JOB 2 — Fish Out of Water (aquarium, full of water and one very calm fish)
 * Ride in the back of the truck → unload at the dock → push through the
 * revolving door → wet lobby floor → shaky elevator → the third-floor walkway
 * (neighbour Gary, and a dog) → set it down on its stand in the apartment.
 */
const DOCK = 1.1; // dock + lobby floor
const TOP = 7.3; // third-floor walkway
const ORANGE = 0xff7a3d;

// ---- the delivery truck: a stake-bed you ride in. Local frame: +Z = forward.
const truck: LevelObject = {
  type: 'hazard',
  kind: 'truck',
  tag: 'truck',
  pos: [-1.25, 0, 0],
  rot: [0, 180, 0],
  params: {
    points: [
      [0, 0, 4],
      [0, 0, -35.7],
    ],
    mode: 'once',
    speed: 6,
    accel: 1.3,
    startDelay: 3.2,
    bob: 0.035,
    bumpEvery: 1.7,
    friction: 0.9,
    colliders: [
      { size: [2.4, 0.2, 4.6], offset: [0, 1.0, -1.0], color: 0x9a6b45, texture: 'planks' }, // bed
      { size: [0.12, 0.8, 4.6], offset: [1.14, 1.5, -1.0], color: ORANGE, texture: 'none' }, // side board
      { size: [2.4, 0.8, 0.12], offset: [0, 1.5, -3.24], color: ORANGE, texture: 'none' }, // tailgate
      { size: [2.3, 1.7, 1.6], offset: [0, 1.75, 2.15], color: ORANGE, texture: 'none' }, // cab
      { size: [2.3, 0.9, 0.95], offset: [0, 1.2, 3.42], color: ORANGE, texture: 'none' }, // hood
      { size: [2.0, 0.45, 7.3], offset: [0, 0.65, 0.3], color: 0x3b3f4a, texture: 'metal' }, // chassis
    ],
    decor: [
      ...[-2.3, -1.2, 3.0].flatMap((z) => [1.08, -1.08].map((x) => ({ size: [0.45, 0.32, 0], offset: [x, 0.45, z], color: 0x24242c, wheel: true }))),
      { size: [2.0, 0.6, 0.04], offset: [0, 2.2, 2.96], color: 0x9fdcf2 }, // windscreen
      { size: [0.04, 0.55, 1.1], offset: [1.16, 2.2, 2.1], color: 0x9fdcf2 },
      { size: [0.04, 0.55, 1.1], offset: [-1.16, 2.2, 2.1], color: 0x9fdcf2 },
      { size: [0.35, 0.18, 0.05], offset: [0.8, 1.35, 3.9], color: 0xfff3b0 },
      { size: [0.35, 0.18, 0.05], offset: [-0.8, 1.35, 3.9], color: 0xfff3b0 },
      { size: [2.4, 0.25, 0.18], offset: [0, 0.8, 3.92], color: 0xd8d8d8 }, // bumper
      { size: [0.03, 0.16, 4.6], offset: [1.21, 1.45, -1.0], color: 0xffffff }, // stripe
      { size: [2.42, 0.16, 0.03], offset: [0, 1.45, -3.31], color: 0xffffff },
      { size: [0.5, 0.12, 0.3], offset: [0.5, 2.66, 2.0], color: 0xffd23f }, // roof light
    ],
  },
};

// apartment doors along the walkway (decor), x positions
const doorXs = [4.6, 11.4];

const objects: LevelObject[] = [
  // ---- island, road and sidewalk
  ...island([5, 0, -20], [38, 62], 'concrete'),
  { type: 'box', pos: [-3.2, 0.005, -15.5], size: [6.4, 0.01, 49], surface: 'asphalt', collide: false, radius: 0.005, castShadow: false },
  ...roadLine([-3.4, 0, 8.5], [-3.4, 0, -39.5], 0xffffff),
  { type: 'box', pos: [0.15, 0.06, -8], size: [0.3, 0.12, 34], color: 0xd8d4cc, radius: 0.03 }, // kerb
  { type: 'box', pos: [-6.55, 0.06, -15.5], size: [0.3, 0.12, 49], color: 0xd8d4cc, radius: 0.03 },
  { type: 'model', model: 'streetLamp', pos: [0.9, 0, -4], rot: [0, -90, 0] },
  { type: 'model', model: 'streetLamp', pos: [0.9, 0, -20], rot: [0, -90, 0] },
  { type: 'model', model: 'hydrant', pos: [1.0, 0, -12] },
  { type: 'model', model: 'mailbox', pos: [1.2, 0, 2], rot: [0, -90, 0] },
  { type: 'model', model: 'tree', pos: [-10, 0, -6] },
  { type: 'model', model: 'tree', pos: [-10, 0, -24] },
  { type: 'model', model: 'bench', pos: [-8.2, 0, -15], rot: [0, 90, 0] },
  ...bush([-9, 0, 4], 0.8),
  ...bush([4, 0, -20], 0.7),
  ...bush([7, 0, -24], 0.6),
  { type: 'model', model: 'muscleCar', pos: [-4.8, 0, -8], rot: [0, 0, 0] },
  { type: 'model', model: 'dumpster', pos: [3.5, 0, -24.5], rot: [0, 0, 0] },
  { type: 'model', model: 'trashCan', pos: [5.6, 0, -24.8], dynamic: { mass: 8 } },
  { type: 'sign', pos: [1.6, 2.6, 4.5], size: [2.6, 0.7, 0.08], text: 'AQUARIUM\nDELIVERY ↑', color: 0x3d9bff, post: true, rot: [0, 0, 0] },

  truck,

  // ---- loading dock + lobby plinth (top at DOCK)
  { type: 'box', pos: [10, DOCK / 2, -34.05], size: [20, DOCK, 12.1], surface: 'concrete', color: 0xcfc9bf, radius: 0.04 },
  { type: 'box', pos: [0.2, DOCK + 0.004, -35], size: [0.4, 0.01, 10], surface: 'hazard', collide: false, castShadow: false, radius: 0.003 },
  ...[-38.4, -35, -31.6].map((z) => ({ type: 'box' as const, pos: [-0.08, DOCK - 0.3, z] as [number, number, number], size: [0.16, 0.35, 0.6] as [number, number, number], color: 0x2a2a30, radius: 0.05 })),
  // steps down to the street at the south end of the dock
  ...stairs([1.9, 0, -25.84], 180, 6, DOCK / 6, 0.36, 1.8, { surface: 'concrete', color: 0xc4beb4 }),
  ...railing([0.95, 0, -25.84], [0.95, DOCK, -28.0], { color: 0x6b7480 }),
  { type: 'model', model: 'pallet', pos: [5.6, DOCK, -38.6] },
  { type: 'box', pos: [5.6, DOCK + 0.5, -38.6], size: [1.0, 0.85, 0.85], surface: 'cardboard', dynamic: { mass: 10 } },
  { type: 'box', pos: [6.8, DOCK + 0.32, -31.2], size: [0.6, 0.6, 0.6], surface: 'cardboard', dynamic: { mass: 4 } },
  { type: 'box', pos: [6.4, DOCK + 0.92, -31.3], size: [0.5, 0.5, 0.5], surface: 'cardboard', dynamic: { mass: 3 } },
  { type: 'model', model: 'forklift', pos: [6.2, DOCK, -29.4], rot: [0, -90, 0] },
  { type: 'sign', pos: [7.85, DOCK + 2.7, -35], size: [2.4, 0.5, 0.06], text: 'PUSH ↻', color: 0x2f7a5b, rot: [0, -90, 0] },

  // ---- lobby (x 8..20, z -40..-28)
  { type: 'box', pos: [14, DOCK + 0.006, -34], size: [12, 0.012, 12], surface: 'checker', color: 0xf3efe6, collide: false, radius: 0.003, castShadow: false },
  ...wall([8, DOCK, -40], [8, DOCK, -28], 3.0, { surface: 'plaster', color: 0xf2e6d0, doors: [[(40 - 35) / 12, 5.3, 3.0]], lintel: false }),
  ...wall([8, DOCK, -28], [20, DOCK, -28], 3.0, { surface: 'plaster', color: 0xf2e6d0, fade: true }),
  ...wall([20, DOCK, -40], [20, DOCK, -28], 3.0, { surface: 'plaster', color: 0xf2e6d0 }),
  ...wall([17.4, DOCK, -40], [20, DOCK, -40], 3.0, { surface: 'plaster', color: 0xf2e6d0 }),
  { type: 'hazard', kind: 'revolvingDoor', pos: [8, DOCK, -35], rot: [0, 90, 0], params: { wings: 3, radius: 2.4, height: 2.4, mass: 44, damping: 2.2 } },
  // the wet floor (and its signs)
  { type: 'box', pos: [12.9, DOCK + 0.012, -35.2], size: [3.6, 0.016, 9.2], surface: 'ice', radius: 0.005, castShadow: false },
  ...([
    [11.0, -31.0],
    [14.9, -31.3],
    [11.0, -39.4],
    [14.9, -37.0],
  ] as [number, number][]).map(([x, z]) => ({ type: 'model' as const, model: 'wetFloorSign', pos: [x, DOCK, z] as [number, number, number], rot: [0, 20, 0] as [number, number, number], dynamic: { mass: 1.5 } })),
  // reception
  ...counter([17.6, DOCK, -30.4], [2.6, 1.05, 0.7], 0x9a6b45, 0xf3efe6),
  { type: 'model', model: 'officeChair', pos: [17.6, DOCK, -29.4], rot: [0, 180, 0], dynamic: { mass: 8 } },
  { type: 'model', model: 'plantSmall', pos: [18.6, DOCK + 1.05, -30.4] },
  { type: 'sign', pos: [17.6, DOCK + 2.35, -28.15], size: [2.4, 0.5, 0.05], text: 'RECEPTION', color: 0x3d5a80, rot: [0, 180, 0] },
  { type: 'model', model: 'vendingMachine', pos: [19.45, DOCK, -36.6], rot: [0, -90, 0] },
  { type: 'model', model: 'waterCooler', pos: [19.6, DOCK, -34.8], dynamic: { mass: 16 } },
  { type: 'model', model: 'plant', pos: [8.6, DOCK, -39.4] },
  { type: 'model', model: 'plant', pos: [19.4, DOCK, -39.4] },
  { type: 'model', model: 'bench', pos: [19.45, DOCK, -31.7], rot: [0, -90, 0] },
  ...[9.2, 9.9, 10.6].map((x) => ({ type: 'box' as const, pos: [x, DOCK + 1.6, -39.85] as [number, number, number], size: [0.55, 0.4, 0.12] as [number, number, number], color: 0xc9a227, collide: false, radius: 0.02 })),
  { type: 'sign', pos: [16.1, DOCK + 2.75, -39.85], size: [2.2, 0.45, 0.05], text: 'LIFT ↑', color: 0x2f7a5b },
  // a janitor patrols the dry way round
  { type: 'hazard', kind: 'pedestrian', pos: [9.5, DOCK, -29.3], params: { points: [[0, 0, 0], [5.5, 0, 0], [5.5, 0, -1.4]], speed: 0.5, color: 0x5e8c6a } },

  // ---- the lift and its shaft (tower)
  { type: 'hazard', kind: 'elevator', tag: 'lift', pos: [16.05, DOCK, -41.45], params: { size: [2.6, 2.6], height: TOP - DOCK, speed: 0.95, wall: 1.1, walls: ['+x', '-z'], landing: 4.5 } },
  { type: 'box', pos: [17.55, 4.95, -41.5], size: [0.2, 9.9, 3.1], surface: 'brick', color: 0xb6624a },
  { type: 'box', pos: [16.1, 4.95, -43.0], size: [3.1, 9.9, 0.2], surface: 'brick', color: 0xb6624a },
  { type: 'box', pos: [16.1, 6.55, -39.95], size: [3.1, 6.3, 0.2], surface: 'brick', color: 0xb6624a, fade: true },
  { type: 'box', pos: [16.1, 0.42, -41.45], size: [2.9, 0.84, 3.0], surface: 'concrete', color: 0x8d8a85 }, // pit floor
  // threshold: the walkway stops at x 14.6 and the lift floor starts at 14.75; don't let feet (or the tank) catch in the gap
  { type: 'box', pos: [14.67, TOP - 0.1, -41.35], size: [0.14, 0.2, 2.5], surface: 'metal', color: 0x9aa3ad },

  // ---- apartment block (solid up to TOP), walkway on top
  { type: 'box', pos: [4.3, TOP / 2, -44.5], size: [20.6, TOP, 9], surface: 'brick', color: 0xd27a5c },
  ...windowPane([-3.5, 3.0, -39.97], 0, 1.3, 1.3),
  ...windowPane([-0.5, 3.0, -39.97], 0, 1.3, 1.3),
  ...windowPane([-3.5, 5.6, -39.97], 0, 1.3, 1.3),
  ...windowPane([-0.5, 5.6, -39.97], 0, 1.3, 1.3),
  ...windowPane([3.0, 5.6, -39.97], 0, 1.3, 1.3),
  ...windowPane([6.0, 5.6, -39.97], 0, 1.3, 1.3),
  ...windowPane([9.6, 5.6, -39.97], 0, 1.3, 1.3),
  ...windowPane([12.6, 5.6, -39.97], 0, 1.3, 1.3),
  { type: 'box', pos: [8.3, TOP + 0.006, -41.3], size: [12.6, 0.012, 2.6], surface: 'tiles', color: 0xe8dccb, collide: false, radius: 0.003, castShadow: false },
  ...railing([2.1, TOP, -40.05], [14.6, TOP, -40.05], { color: 0x6b7480 }),
  { type: 'box', pos: [8.3, TOP + 0.5, -40.05], size: [12.5, 1.0, 0.1], visible: false }, // keep things on the walkway
  ...wall([2, TOP, -42.6], [14.6, TOP, -42.6], 2.8, { surface: 'plaster', color: 0xf2e6d0, doors: [[(8 - 2) / 12.6, 1.2, 2.2]] }),
  ...doorXs.flatMap((x) => [
    { type: 'box' as const, pos: [x, TOP + 1.05, -42.48] as [number, number, number], size: [1.0, 2.1, 0.06] as [number, number, number], color: 0x3d5a80, collide: false, radius: 0.02 },
    { type: 'ball' as const, pos: [x + 0.35, TOP + 1.0, -42.43] as [number, number, number], radius: 0.04, color: 0xd9a93f, collide: false },
    { type: 'box' as const, pos: [x, TOP + 0.01, -42.0] as [number, number, number], size: [0.9, 0.02, 0.55] as [number, number, number], color: 0x8a5a36, collide: false, castShadow: false, radius: 0.01 },
  ]),
  { type: 'sign', pos: [4.6, TOP + 2.35, -42.47], size: [0.5, 0.3, 0.03], text: '3A', color: 0xfbfaf6, textColor: '#3d5a80' },
  { type: 'sign', pos: [8, TOP + 2.35, -42.47], size: [0.5, 0.3, 0.03], text: '3B', color: 0xfbfaf6, textColor: '#3d5a80' },
  { type: 'sign', pos: [11.4, TOP + 2.35, -42.47], size: [0.5, 0.3, 0.03], text: '3C', color: 0xfbfaf6, textColor: '#3d5a80' },
  { type: 'model', model: 'flowerPot', pos: [3.0, TOP, -42.2], dynamic: { mass: 6 } },
  { type: 'model', model: 'flowerPot', pos: [13.6, TOP, -42.2], dynamic: { mass: 6 } },
  { type: 'model', model: 'bicycle', pos: [6.0, TOP, -42.2], rot: [0, 90, 0] },
  { type: 'box', pos: [9.6, TOP + 0.2, -42.15], size: [0.55, 0.4, 0.4], surface: 'cardboard', dynamic: { mass: 3 } },
  // 3B: the dog's flat (door open...)
  ...wall([6.6, TOP, -46], [6.6, TOP, -42.6], 2.8, { surface: 'plaster', color: 0xf2e6d0 }),
  ...wall([9.4, TOP, -46], [9.4, TOP, -42.6], 2.8, { surface: 'plaster', color: 0xf2e6d0 }),
  ...wall([6.6, TOP, -46], [9.4, TOP, -46], 2.8, { surface: 'plaster', color: 0xf2e6d0 }),
  { type: 'box', pos: [8, TOP + 0.006, -44.3], size: [2.8, 0.012, 3.4], surface: 'carpet', color: 0xb7a6ef, collide: false, castShadow: false, radius: 0.003 },
  { type: 'hazard', kind: 'dog', pos: [8, TOP, -44.4], params: { radius: 3, area: [2.0, 2.4] } },
  // roof over the flats behind the walkway
  { type: 'box', pos: [8.3, TOP + 2.95, -45.8], size: [12.8, 0.3, 6.6], surface: 'concrete', color: 0xb9b4ab },
  { type: 'box', pos: [8.3, TOP + 2.95, -42.6], size: [12.8, 0.34, 0.3], color: 0xf2e6d0 },
  // neighbour Gary has had a few
  // Gary hangs about by the flat doors, leaving a lane along the railing
  { type: 'hazard', kind: 'drunk', pos: [9.4, TOP, -42.0], params: { radius: 3, area: [5, 0.35] } },

  // ---- the customer's flat (x -6..2, z -49..-40) — goal: the aquarium stand
  { type: 'box', pos: [-2, TOP + 0.006, -44.5], size: [8, 0.012, 9], surface: 'wood', collide: false, radius: 0.003, castShadow: false },
  ...wall([2, TOP, -49], [2, TOP, -40], 2.8, { surface: 'wallpaper', color: 0xd9ecd0, doors: [[(49 - 41.3) / 9, 1.6, 2.2]] }),
  ...wall([-6, TOP, -49], [2, TOP, -49], 2.8, { surface: 'wallpaper', color: 0xd9ecd0 }),
  ...wall([-6, TOP, -49], [-6, TOP, -40], 2.8, { surface: 'wallpaper', color: 0xd9ecd0, fade: true }),
  ...wall([-6, TOP, -40], [2, TOP, -40], 0.9, { surface: 'wallpaper', color: 0xd9ecd0 }),
  // seating against the west wall, leaving a clear run from the door to the stand
  rug([-4.4, TOP, -45.2], [2.8, 3.2], 0x5b8def),
  { type: 'model', model: 'sofa', pos: [-5.45, TOP, -45.2], rot: [0, 90, 0] },
  ...table([-4.45, TOP, -45.2], [1.1, 0.42, 0.6], PALETTE.woodDark, 90),
  { type: 'model', model: 'armchair', pos: [-4.7, TOP, -41.4], rot: [0, 140, 0] },
  { type: 'model', model: 'floorLamp', pos: [-5.4, TOP, -48.4], dynamic: { mass: 6 } },
  { type: 'model', model: 'bookshelf', pos: [0.8, TOP, -48.75] },
  { type: 'model', model: 'plant', pos: [1.4, TOP, -40.6] },
  { type: 'model', model: 'plantSmall', pos: [-5.5, TOP, -40.5] },
  // the stand: a touch longer than the tank, so the movers either side of it clear it
  ...counter([-2.0, TOP, -48.45], [1.12, 0.28, 0.62], 0x5b3a22, 0x3b2616),
  { type: 'sign', pos: [-2.0, TOP + 2.1, -48.88], size: [2.4, 0.5, 0.04], text: 'FISHY GOES HERE', color: 0x3d9bff },
  ...picture([-2.0, TOP + 1.35, -48.88], 0, 0.5, 0.35, 0xffd36b),
];

const level: LevelDef = {
  id: 'delivery',
  name: 'Fish Out of Water',
  tagline: 'A full aquarium, a bumpy truck, a wet lobby and a lift that rattles. Spill nothing.',
  order: 2,
  cargo: 'aquarium',
  cameraYaw: 0,
  spawn: { attach: 'truck', p1: [0.6, DOCK, -2.3], p2: [-0.6, DOCK, -2.3], cargo: [0, DOCK + 0.3, -1.0], yaw: 0, cargoYaw: 0 },
  goal: { pos: [-2.0, TOP + 0.9, -48.45], size: [1.3, 1.0, 0.9], label: 'ON THE STAND' },
  checkpoints: [
    { pos: [4, DOCK + 1, -35], size: [7.4, 2, 9.4], spawn: { p1: [4.5, DOCK, -33.9], p2: [4.5, DOCK, -36.1], cargo: [4.5, DOCK + 0.3, -35], yaw: 90, cargoYaw: 90 } },
    { pos: [12.6, TOP + 1, -41.3], size: [3.6, 2, 2.6], spawn: { p1: [10.1, TOP, -41.3], p2: [12.3, TOP, -41.3], cargo: [11.2, TOP + 0.3, -41.3], yaw: -90, cargoYaw: 0 } },
  ],
  killY: -6,
  parTime: 200,
  hints: ['Hold on during the ride — start and stop gently'],
  tips: [
    { pos: [6.2, DOCK, -35], radius: 1.8, text: 'Push the revolving door round together, nice and slow' },
    { pos: [10.8, DOCK, -35], radius: 1.4, text: 'Wet floor! Slippery. Or go round it' },
    { pos: [15.7, DOCK, -38.5], radius: 2.0, text: 'The lift goes up once you are BOTH inside' },
    { pos: [12, TOP, -41.3], radius: 2.0, text: 'The neighbour and his dog wander about. Let them pass' },
    { pos: [-2, TOP, -46], radius: 1.8, text: 'Set it on the stand, then let go of grab' },
  ],
  theme: { sunDir: [0.55, 0.8, 0.3], skyHorizon: 0xf3e6d6, fog: 0xefe2d2, hemiGround: 0xcfae8c },
  objects,
};

export default level;
