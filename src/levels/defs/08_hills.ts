import type { LevelDef, LevelObject, Vec3 } from '../types';
import { railing, ramp, wall } from '../helpers';
import { bush, counter, island, picture, rug } from '../props';
import { UprightPiano } from '../../entities/cargo/UprightPiano';

/**
 * JOB 8 — Hill Street Blues (an upright piano on castors)
 * The music shop at the top of the hill → straight down the steep street
 * (hold it back!) → wait for the cable car → down the crooked street, round
 * the hedges → along the waterfront → into the jazz club and up onto the stage.
 */
const TOP = 9; // the shop, at the top of the hill
const MID = 4; // the cable car crossing
const HILL = [12, -28] as const; // hill street: from z 12 (TOP) down to z -28 (MID)
const CROOKED = [-40, -66] as const; // crooked street: from z -40 (MID) down to z -66 (0)
const RIDE = UprightPiano.rideHeight;
const DEG = 180 / Math.PI;

const hillY = (z: number) => MID + ((z - HILL[1]) * (TOP - MID)) / (HILL[0] - HILL[1]);
const crookedY = (z: number) => (MID * (z - CROOKED[1])) / (CROOKED[0] - CROOKED[1]);
const HILL_DEG = Math.atan((TOP - MID) / (HILL[0] - HILL[1])) * DEG;
const CROOKED_DEG = Math.atan(MID / (CROOKED[0] - CROOKED[1])) * DEG;

/** A box standing on a slope (its base follows the slope at its own z). */
function onSlope(x: number, z: number, size: Vec3, slopeY: (z: number) => number, deg: number, extra: Partial<LevelObject> = {}): LevelObject {
  const a = deg / DEG;
  // the base centre sits on the surface; tilt the box with the slope
  const y = slopeY(z) + (size[1] / 2) * Math.cos(a);
  return { type: 'box', pos: [x, y, z + (size[1] / 2) * Math.sin(a) * 0], size, rot: [-deg, 0, 0], ...extra } as LevelObject;
}

/** A painted-lady house front beside the hill, stepping down with it. */
function house(x: number, z: number, color: number, side: 1 | -1): LevelObject[] {
  const y0 = hillY(z) - 0.6;
  const w = 5.6;
  const out: LevelObject[] = [
    { type: 'box', pos: [x, y0 + 3.4, z], size: [5, 6.8, w], color, radius: 0.08 },
    { type: 'box', pos: [x - side * 2.6, y0 + 3.6, z], size: [0.7, 4.2, 2.4], color: 0xfbfaf6, radius: 0.06, collide: false },
    { type: 'box', pos: [x, y0 + 7.0, z], size: [5.4, 0.4, w + 0.4], color: 0x5b3a22, radius: 0.06, collide: false },
  ];
  for (const dz of [-1.6, 1.6]) out.push({ type: 'box', pos: [x - side * 2.52, y0 + 4.8, z + dz], size: [0.05, 1.1, 0.8], color: 0x9fd6ee, collide: false, radius: 0.01 });
  return out;
}

/** A parked car on the hill, nose downhill. */
const parked = (x: number, z: number, model: string): LevelObject => ({
  type: 'model',
  model,
  pos: [x, hillY(z) - 0.02, z],
  rot: [HILL_DEG, 180, 0],
});

/** A hedge across part of the crooked street, from x0 to x1 at z. */
const hedge = (x0: number, x1: number, z: number): LevelObject[] => [
  onSlope((x0 + x1) / 2, z, [Math.abs(x1 - x0), 0.95, 0.9], crookedY, CROOKED_DEG, { color: 0x3f7f3a, radius: 0.3 } as Partial<LevelObject>),
  ...[0.2, 0.5, 0.8].map((t) => ({ type: 'ball' as const, pos: [x0 + (x1 - x0) * t, crookedY(z) + 1.0, z] as Vec3, radius: 0.22, color: [0xff8fab, 0xffd23f, 0xb085f5][Math.round(t * 3) % 3], collide: false })),
];

const objects: LevelObject[] = [
  // ---- the ground: bay-side island at sea level, the hill and its crossing on top
  ...island([0, 0, -50], [80, 70], 'concrete'),
  { type: 'box', pos: [0, (TOP - 0.2) / 2, 21], size: [24, TOP - 0.2, 18], surface: 'concrete', color: 0xb9b4ab, radius: 0.2 },
  { type: 'box', pos: [0, TOP - 0.1, 21], size: [24.2, 0.2, 18.2], surface: 'concrete', color: 0xcfc9bf, radius: 0.05 },
  ramp([0, TOP, HILL[0] + 0.05], [0, MID, HILL[1] - 0.05], 16, { surface: 'asphalt', thickness: 9 }),
  { type: 'box', pos: [0, (MID - 0.2) / 2, -34], size: [76, MID - 0.2, 12], surface: 'concrete', color: 0xb9b4ab, radius: 0.2 },
  { type: 'box', pos: [0, MID - 0.1, -34], size: [76.2, 0.2, 12.2], surface: 'asphalt', radius: 0.05 },
  ramp([0, MID, CROOKED[0] + 0.05], [0, 0, CROOKED[1] - 0.05], 16, { surface: 'concrete', color: 0xd9cfbf, thickness: 6 }),
  // sidewalks down the hill (paint only)
  ...[-6.5, 6.5].map((x) => ramp([x, TOP + 0.012, HILL[0]], [x, MID + 0.012, HILL[1]], 3, { surface: 'concrete', color: 0xd9d4cc, collide: false, thickness: 0.02 })),

  // ---- the music shop (x -7..7, z 16..27, at the top)
  { type: 'box', pos: [0, TOP + 0.006, 21.5], size: [14, 0.012, 11], surface: 'woodLight', color: 0xd7a46c, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-7, TOP, 27], [7, TOP, 27], 0.9, { surface: 'brick', color: 0xb5654a }),
  ...wall([-7, TOP, 16], [-7, TOP, 27], 3, { surface: 'brick', color: 0xb5654a, fade: true }),
  ...wall([7, TOP, 16], [7, TOP, 27], 3, { surface: 'brick', color: 0xb5654a, fade: true }),
  ...wall([-7, TOP, 16], [7, TOP, 16], 3, { surface: 'brick', color: 0xb5654a, fade: true, doors: [[0.5, 3.2, 2.6]] }),
  { type: 'sign', pos: [0, TOP + 2.75, 15.85], size: [3.6, 0.5, 0.06], text: 'KEYS & CO. PIANOS', color: 0x2f5d4a },
  { type: 'model', model: 'piano', pos: [-4, TOP, 23.5], rot: [0, 30, 0] },
  ...counter([4.6, TOP, 25.6], [3.0, 0.95, 0.7], 0x5b3a22, 0x3b2616),
  ...picture([6.88, TOP + 1.8, 21], -90, 1.2, 0.8, 0xffd23f),
  ...picture([-6.88, TOP + 1.8, 19], 90, 1.2, 0.8, 0x3d9bff),
  rug([0, TOP, 22], [3.4, 2.4], 0xb03a3a),
  { type: 'sign', pos: [3.4, TOP + 1.3, 15.4], size: [1.8, 0.45, 0.05], text: 'SALE: 1 PIANO', color: 0xd94a3d, post: true },

  // ---- hill street: houses either side, parked cars, bins that roll
  ...house(-11, 6, 0x9fd8c4, 1),
  ...house(-11, -1, 0xf5c16c, 1),
  ...house(-11, -8, 0xff8fab, 1),
  ...house(-11, -15, 0xb7a6ef, 1),
  ...house(-11, -22, 0x9fd6ee, 1),
  ...house(11, 4, 0xffd36b, -1),
  ...house(11, -3, 0xa8d8a0, -1),
  ...house(11, -10, 0xf2a07b, -1),
  ...house(11, -17, 0xc8b0e8, -1),
  ...house(11, -24, 0xf5c16c, -1),
  parked(5.6, 2, 'redCar'),
  parked(5.6, -10, 'taxi'),
  parked(-5.6, -4, 'minivan'),
  parked(-5.6, -19, 'muscleCar'),
  ...([[7.2, 8], [-7.2, -12], [7.2, -21]] as const).map(([x, z]) => ({ type: 'model' as const, model: 'trashCan', pos: [x, hillY(z) + 0.05, z] as Vec3, dynamic: { mass: 7 } })),
  ...([[-7.4, 9], [7.4, -6], [-7.4, -26], [7.4, -26]] as const).map(([x, z]) => ({ type: 'model' as const, model: 'streetLamp', pos: [x, hillY(z), z] as Vec3, rot: [0, x < 0 ? -90 : 90, 0] as Vec3 })),
  { type: 'sign', pos: [-5.2, TOP + 1.6, 11], size: [1.7, 0.6, 0.05], text: 'STEEP HILL!', color: 0xffd23f, textColor: '#2b2b33', post: true },
  { type: 'hazard', kind: 'pedestrian', pos: [-6.6, hillY(-24), -24], params: { points: [[0, 0, 0], [0, hillY(8) - hillY(-24), 32]], speed: 0.9, color: 0xff7a3d } },

  // ---- the crossing: cable car tracks along x at z -34
  ...[-34.75, -33.25].map((z) => ({ type: 'box' as const, pos: [0, MID + 0.01, z] as Vec3, size: [76, 0.02, 0.12] as Vec3, color: 0x8d9aa6, collide: false, castShadow: false })),
  { type: 'box', pos: [0, MID + 0.008, -34], size: [76, 0.012, 0.06], color: 0x2b2b33, collide: false, castShadow: false },
  { type: 'hazard', kind: 'riders', pos: [-38, MID, -34], params: { style: 'cablecar', dirYaw: 90, length: 76, speed: 4.5, count: 2, spacing: [0, 0.5], wiggle: 0 } },
  { type: 'sign', pos: [-4.6, MID + 2.0, -30.6], size: [2.6, 0.55, 0.06], text: 'CABLE CARS! LOOK LEFT', color: 0xd94a3d, post: true },
  ...house(-15, -40, 0x9fd8c4, 1).map((o) => ({ ...o, pos: [o.pos[0], o.pos[1] + MID - hillY(-40) + 0.6, o.pos[2]] as Vec3 })),
  ...house(15, -40, 0xffd36b, -1).map((o) => ({ ...o, pos: [o.pos[0], o.pos[1] + MID - hillY(-40) + 0.6, o.pos[2]] as Vec3 })),

  // ---- the crooked street: hedges from alternate sides make it zig-zag down
  ...hedge(-8, 3, -44),
  ...hedge(8, -3, -49),
  ...hedge(-8, 3, -54),
  ...hedge(8, -3, -59),
  ...[-8.2, 8.2].map((x) => onSlope(x, -53, [0.4, 0.9, 26.5], crookedY, CROOKED_DEG, { color: 0x3f7f3a, radius: 0.15 } as Partial<LevelObject>)),
  { type: 'sign', pos: [4.4, MID + 1.9, -38.8], size: [2.4, 0.55, 0.06], text: 'CROOKED STREET', color: 0x2f5d4a, post: true },

  // ---- the waterfront and the jazz club (x -8..8, z -84..-70)
  { type: 'box', pos: [0, 0.008, -68], size: [40, 0.012, 4], surface: 'woodLight', color: 0xc9a06b, collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [0, -1.4, -96], size: [120, 0.1, 24], color: 0x3d7fb0, collide: false },
  { type: 'model', model: 'trawler', pos: [-22, -1.4, -92], rot: [0, 70, 0] },
  ...railing([-20, 0, -85.8], [20, 0, -85.8]),
  ...wall([-8, 0, -70], [8, 0, -70], 3.2, { surface: 'brick', color: 0x3d4a6e, fade: true, doors: [[0.5, 3.4, 2.7]] }),
  ...wall([-8, 0, -84], [-8, 0, -70], 3.2, { surface: 'brick', color: 0x3d4a6e, fade: true }),
  ...wall([8, 0, -84], [8, 0, -70], 3.2, { surface: 'brick', color: 0x3d4a6e, fade: true }),
  ...wall([-8, 0, -84], [8, 0, -84], 3.2, { surface: 'brick', color: 0x3d4a6e }),
  { type: 'sign', pos: [0, 2.95, -69.85], size: [3.4, 0.55, 0.06], text: 'THE BLUE NOTE', color: 0x2a3550, textColor: '#9fd6ee' },
  { type: 'box', pos: [0, 0.006, -77], size: [16, 0.012, 14], surface: 'checker', color: 0xe8e0d0, collide: false, castShadow: false, radius: 0.003 },
  // the stage, with a ramp up the middle
  { type: 'box', pos: [0, 0.3, -81.6], size: [10, 0.6, 4.6], surface: 'woodDark', color: 0x6e3f22 },
  ramp([0, 0, -72.4], [0, 0.6, -79.3], 3.4, { surface: 'woodDark', color: 0x6e3f22 }),
  ...railing([-1.8, 0, -72.4], [-1.8, 0.6, -79.3], { color: 0xd9a93f }),
  ...railing([1.8, 0, -72.4], [1.8, 0.6, -79.3], { color: 0xd9a93f }),
  { type: 'box', pos: [0, 0.62, -82.4], size: [2.6, 0.02, 2.0], color: 0x2a3550, collide: false },
  { type: 'hazard', kind: 'light', pos: [0, 3.0, -81.6], params: { color: 0xffd59a, intensity: 8, distance: 9 } },
  ...([[-5, -74], [5, -74], [-5.4, -77.6], [5.4, -77.6]] as const).flatMap(([x, z]) => [
    { type: 'cylinder' as const, pos: [x, 0.38, z] as Vec3, radius: 0.45, height: 0.06, color: 0xfbfaf6 },
    { type: 'cylinder' as const, pos: [x, 0.18, z] as Vec3, radius: 0.06, height: 0.36, color: 0x2b2b33 },
  ]),
  ...counter([-6.9, 0, -77], [0.8, 1.05, 6], 0x3b2616, 0x5b3a22, 90),
  { type: 'hazard', kind: 'pedestrian', pos: [-5.6, 0, -73.2], params: { points: [[0, 0, 0], [0, 0, -7]], speed: 0.35, color: 0x2b2b33 } },
  ...bush([-10, 0, -68.5], 0.6),
  ...bush([10, 0, -68.5], 0.6),
];

const level: LevelDef = {
  id: 'hills',
  name: 'Hill Street Blues',
  tagline: 'An upright piano, the steepest street in town, and a jazz club at the bottom.',
  order: 8,
  cargo: 'piano',
  cameraYaw: 0,
  // one of you at each end of the piano, keyboard to the door
  spawn: { p1: [-1.35, TOP, 21.95], p2: [1.35, TOP, 21.95], cargo: [0, TOP + RIDE, 21.95], cargoYaw: 180, yaw: 180 },
  goal: { pos: [0, 0.6 + 0.75, -81.8], size: [2.6, 1.2, 2.2], label: 'ON STAGE' },
  checkpoints: [
    { pos: [0, MID + 1, -30.0], size: [10, 2, 3.2], spawn: { p1: [-1.35, MID, -30.3], p2: [1.35, MID, -30.3], cargo: [0, MID + RIDE, -30.3], cargoYaw: 180, yaw: 180 } },
    { pos: [0, 1, -68.0], size: [10, 2, 3.4], spawn: { p1: [-1.35, 0, -68.0], p2: [1.35, 0, -68.0], cargo: [0, RIDE, -68.0], cargoYaw: 180, yaw: 180 } },
  ],
  killY: -6,
  parTime: 170,
  objects,
  hints: ['Too heavy to lift: push it from the ends'],
  tips: [
    { pos: [0, TOP, 14], radius: 2.2, text: 'Downhill: stay below it and hold it back. Never let go!' },
    { pos: [0, MID, -30], radius: 2.0, text: 'Cable cars! Wait for one to pass, then go.' },
    { pos: [0, MID, -40.5], radius: 2.2, text: 'Crooked street: round the hedges, slowly' },
    { pos: [0, 0, -75], radius: 2.0, text: 'Up the ramp and onto the stage' },
  ],
  theme: {
    sunDir: [-0.75, 0.42, 0.3],
    skyTop: 0x5a78c8,
    skyHorizon: 0xffbe8a,
    fog: 0xffd2a8,
    sun: 0xffc890,
    sunIntensity: 2.5,
    hemiSky: 0xffdcb8,
    hemiGround: 0x8a6a58,
  },
};

export default level;
