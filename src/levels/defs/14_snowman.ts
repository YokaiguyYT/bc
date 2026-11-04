import type { LevelDef, LevelObject, Vec3 } from '../types';
import { ramp, wall } from '../helpers';
import { bush, fence, island } from '../props';

/**
 * JOB 14 — Snow Business (a snowman for the summer fair's Winter Wonderland)
 * The ice-cream depot's walk-in freezer → out into the hot park: shade
 * under the parasols and trees, barbecues to keep away from, picnickers and
 * a kid on a scooter → over the little hump bridge → into the Winter
 * Wonderland tent (lovely and cold) → onto the plinth among the fake snow.
 * It melts the whole time it's in the sun.
 */
const BOARD = 0.06; // the snowman's board, half its thickness
const PLINTH = 0.4;
const SY = PLINTH + BOARD + 0.02; // the board's middle, sitting on a plinth
const PATH = 0xd8c08a;

/** A plinth for a snowman to stand on. */
const plinth = (x: number, y: number, z: number, color = 0x9aa3ad): LevelObject[] => [
  { type: 'box', pos: [x, y + PLINTH / 2, z], size: [0.7, PLINTH, 0.5], color, radius: 0.04 },
];

/** A big parasol beside the path; its cool shade reaches over the path. */
const shade = (x: number, z: number): LevelObject[] => [
  { type: 'model', model: 'parasol', pos: [x, 0, z], size: [3.4, 2.7, 3.4], collider: { size: [0.12, 2.4, 0.12] } },
  { type: 'hazard', kind: 'heater', pos: [x * 0.25, 0, z], params: { style: 'none', radius: 2.8, power: -2.6 } },
];

/** A shady tree beside the path (a trunk in the way, shade over the path). */
const shadyTree = (x: number, z: number, s = 1): LevelObject[] => [
  { type: 'model', model: 'tree', pos: [x, 0, z], size: [4.4 * s, 6 * s, 4.4 * s], collider: { size: [0.5, 6 * s, 0.5] } },
  { type: 'hazard', kind: 'heater', pos: [x * 0.25, 0, z], params: { style: 'none', radius: 3.0, power: -2.6 } },
];

/** A picnic blanket with a basket. */
const picnic = (x: number, z: number, color: number): LevelObject[] => [
  { type: 'box', pos: [x, 0.01, z], size: [1.6, 0.02, 1.3], color, collide: false, castShadow: false, radius: 0.005 },
  { type: 'box', pos: [x + 0.4, 0.15, z - 0.2], size: [0.4, 0.3, 0.3], color: 0xb08a5a, radius: 0.04 },
];

const objects: LevelObject[] = [
  ...island([0, 0, -6], [44, 62], 'grass'),

  // ---- the ice-cream depot's walk-in freezer (x -4..4, z 17..23): freezing inside
  { type: 'box', pos: [0, 0.006, 20], size: [8, 0.012, 6], surface: 'metal', color: 0xcfd8e2, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-4, 0, 23], [4, 0, 23], 1.0, { surface: 'metal', color: 0xdfe6ee }),
  ...wall([-4, 0, 17], [-4, 0, 23], 2.6, { surface: 'metal', color: 0xdfe6ee, fade: true }),
  ...wall([4, 0, 17], [4, 0, 23], 2.6, { surface: 'metal', color: 0xdfe6ee, fade: true }),
  ...wall([-4, 0, 17], [4, 0, 17], 2.6, { surface: 'metal', color: 0xdfe6ee, fade: true, doors: [[0.5, 3.2, 2.3]] }),
  { type: 'sign', pos: [0, 2.4, 16.9], size: [3.2, 0.42, 0.05], text: 'FROSTY’S ICE CREAM', color: 0xff8fab, rot: [0, 180, 0] },
  { type: 'hazard', kind: 'heater', pos: [0, 0, 20], params: { style: 'none', radius: 5.5, power: -3 } },
  ...plinth(0, 0, 20.2),
  ...([[-3.3, 22.2], [-3.3, 21.2], [3.3, 22.2]] as const).map(([x, z]): LevelObject => ({ type: 'box', pos: [x, 0.45, z], size: [0.8, 0.9, 0.7], color: 0xffffff, radius: 0.06 })),
  { type: 'model', model: 'van', pos: [8, 0, 19], rot: [0, 180, 0] },

  // ---- the park: a sandy path, shade and barbecues
  { type: 'box', pos: [0, 0.006, -4], size: [3.6, 0.01, 42], color: PATH, collide: false, castShadow: false, radius: 0.003 },
  ...shade(-2.4, 13.0),
  ...shadyTree(3.4, 9.4, 0.9),
  ...shade(-2.4, 1.6),
  ...shadyTree(3.6, -8.4, 1),
  ...shade(-2.4, -15.4),
  // barbecues (hot!) right by the path
  { type: 'hazard', kind: 'heater', pos: [2.5, 0, 5.0], params: { style: 'grill', radius: 3.4, power: 7 } },
  { type: 'hazard', kind: 'heater', pos: [-2.5, 0, -3.2], params: { style: 'grill', radius: 3.4, power: 7 } },
  { type: 'hazard', kind: 'heater', pos: [2.5, 0, -13.0], params: { style: 'grill', radius: 3.4, power: 7 } },
  { type: 'sign', pos: [-3.6, 1.8, 15.2], size: [2.6, 0.5, 0.06], text: 'HOT! STAY IN THE SHADE', color: 0xd94a3d, post: true },
  ...picnic(-6.4, 9.0, 0xd94a3d),
  ...picnic(6.6, 2.0, 0x3d6fb0),
  ...picnic(-6.0, -6.6, 0xffd23f),
  ...picnic(6.4, -12.6, 0x8be39a),
  // picnickers and a kid zooming about
  { type: 'hazard', kind: 'pedestrian', pos: [-6.4, 0.02, 7.6], params: { points: [[0, 0, 0], [12.8, 0, 0]], speed: 0.55, color: 0xff8fab } },
  { type: 'hazard', kind: 'pedestrian', pos: [6.0, 0.02, -10.6], params: { points: [[0, 0, 0], [-12, 0, 0]], speed: 0.95, color: 0xffd23f } },
  { type: 'model', model: 'hotdogCart', pos: [-8.4, 0, 0.6], rot: [0, 90, 0] },
  { type: 'model', model: 'bench', pos: [7.0, 0, 6.8], rot: [0, -90, 0] },
  { type: 'model', model: 'bench', pos: [-7.0, 0, -2.4], rot: [0, 90, 0] },
  ...bush([-4.8, 0, 15.2], 0.6), ...bush([5.2, 0, 13.4], 0.7), ...bush([-5.4, 0, -11.8], 0.6), ...bush([5.6, 0, -17.6], 0.7),
  ...[-17.6, -6, 7].map((z): LevelObject => ({ type: 'model', model: 'flowerPot', pos: [-4.2, 0, z] as Vec3, size: [0.4, 0.55, 0.4] })),

  // ---- the little hump bridge over the pond
  { type: 'box', pos: [0, -0.3, -21.5], size: [16, 0.04, 4.4], color: 0x4fa3d9, collide: false, castShadow: false, radius: 0.01 },
  { type: 'box', pos: [-5.5, -0.15, -21.5], size: [5, 0.3, 4.4], color: 0x6fae55, collide: false },
  ramp([0, 0, -19.4], [0, 0.45, -21.0], 3.2, { surface: 'wood', color: 0x9c6b3e }),
  ramp([0, 0.45, -22.0], [0, 0, -23.6], 3.2, { surface: 'wood', color: 0x9c6b3e }),
  { type: 'box', pos: [0, 0.25, -21.5], size: [3.2, 0.4, 1.06], surface: 'wood', color: 0x9c6b3e, radius: 0.02 },
  ...fence([-1.65, 0.1, -19.6], [-1.65, 0.1, -23.4], 0x9c6b3e, 0.9),
  ...fence([1.65, 0.1, -19.6], [1.65, 0.1, -23.4], 0x9c6b3e, 0.9),

  // ---- the Winter Wonderland tent (x -6..6, z -26..-36): cold inside, fake snow
  { type: 'box', pos: [0, 0.01, -31], size: [12, 0.02, 10], surface: 'snow', color: 0xf7fbff, radius: 0.005 },
  ...wall([-6, 0, -36], [6, 0, -36], 3.4, { surface: 'plain', color: 0xd9ecff }),
  ...wall([-6, 0, -26], [-6, 0, -36], 3.4, { surface: 'plain', color: 0xd9ecff, fade: true }),
  ...wall([6, 0, -26], [6, 0, -36], 3.4, { surface: 'plain', color: 0xd9ecff, fade: true }),
  ...wall([-6, 0, -26], [6, 0, -26], 3.4, { surface: 'plain', color: 0xd9ecff, fade: true, doors: [[0.5, 3.4, 2.8]] }),
  { type: 'sign', pos: [0, 3.0, -25.9], size: [4.4, 0.6, 0.05], text: '❄ WINTER WONDERLAND ❄', color: 0x3d6fb0, rot: [0, 180, 0] },
  { type: 'hazard', kind: 'heater', pos: [0, 0, -31], params: { style: 'none', radius: 7, power: -3 } },
  { type: 'model', model: 'snowyPine', pos: [-4.4, 0, -33.6], size: [2.2, 3.2, 2.2] },
  { type: 'model', model: 'snowyPine', pos: [4.4, 0, -33.6], size: [2.2, 3.2, 2.2] },
  { type: 'model', model: 'snowyPine', pos: [-4.6, 0, -28.4], size: [1.8, 2.6, 1.8] },
  { type: 'model', model: 'snowman', pos: [3.4, 0, -28.6], size: [0.8, 1.3, 1.2], rot: [0, -40, 0] },
  ...plinth(0, 0, -32.4, 0xd9ecff),
  { type: 'sign', pos: [0, 2.2, -35.85], size: [2.6, 0.5, 0.05], text: 'SNOWMAN GOES HERE', color: 0x3d6fb0 },
];

const level: LevelDef = {
  id: 'snowman',
  name: 'Snow Business',
  tagline: 'A snowman for the summer fair. It’s a scorcher. Keep to the shade!',
  order: 14,
  cargo: 'snowman',
  cameraYaw: 0,
  spawn: { p1: [-1.1, 0, 20.2], p2: [1.1, 0, 20.2], cargo: [0, SY, 20.2], yaw: 180, yaws: [90, -90] },
  goal: { pos: [0, SY + 0.1, -32.4], size: [1.1, 0.8, 0.9], label: 'ON THE PLINTH' },
  checkpoints: [
    { pos: [0, 1, 0.4], size: [5, 2, 2.4], spawn: { p1: [-5.2, 0, 1.0], p2: [-3.0, 0, 1.0], cargo: [-4.1, SY, 1.0], yaw: 180, yaws: [90, -90] } },
  ],
  killY: -6,
  parTime: 90,
  variety: { times: ['day', 'sunset'] },
  goals: [{ kind: 'mint', c: 0.88 }, { kind: 'nofalls' }],
  objects: [...objects, ...plinth(-4.1, 0, 1.0)],
  hints: ['Lift it by the board, one each side'],
  tips: [
    { pos: [0, 0, 15.6], radius: 2.0, text: 'Out in the sun it melts! The shade is cool.' },
    { pos: [0, 0, 6.6], radius: 2.0, text: 'Barbecue! Hurry past.' },
    { pos: [0, 0, -18.6], radius: 2.0, text: 'Over the bridge and into the cold tent!' },
  ],
  theme: {
    sunDir: [0.3, 0.9, 0.3],
    skyTop: 0x5fa8ee,
    skyHorizon: 0xfff4d6,
    fog: 0xfff0dc,
    sun: 0xfff2c8,
    hemiIntensity: 1.5,
  },
};

export default level;
