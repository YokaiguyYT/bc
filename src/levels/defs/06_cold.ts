import type { LevelDef, LevelObject, Vec3 } from '../types';
import { railing, ramp, wall } from '../helpers';
import { counter, island, picture, rug, table } from '../props';
import { PALETTE } from '../../render/materials';

/**
 * JOB 6 — Cold Feet (an ice swan for a wedding buffet)
 * The ice-carving shed (freezing: no melting) → the snowy yard and the
 * sledge run → the frozen pond (slippery shortcut) or the long way round past
 * the cocoa stand's heater → the ski run (wait for the skiers) → the gondola
 * up the cliff → the summit lodge: heaters, swing doors, a roaring fire →
 * onto the buffet, under the heat lamps. It melts the whole way.
 */
const TOP = 9.3; // the summit plateau
const DECK = 0.35; // gondola base station deck
const CLIFF = -42.75; // front face of the plateau
const SWAN_Y = 0.5 + 0.11 + 0.02; // swan block centre when it sits on a carving stand
const PATH = 0xe2eaf3;

/** A sculptor's stand: a slim post under the middle of the ice block, so hands get at its ends. */
const stand = (x: number, y: number, z: number): LevelObject[] => [
  { type: 'cylinder', pos: [x, y + 0.25, z], radius: 0.2, height: 0.5, color: 0x8a5a36, segments: 16 },
  { type: 'cylinder', pos: [x, y + 0.03, z], radius: 0.34, height: 0.06, color: 0x6e4a2c, segments: 20 },
];

const pine = (x: number, z: number, s = 1, y = 0): LevelObject => ({ type: 'model', model: 'snowyPine', pos: [x, y, z], size: [2.6 * s, 3.6 * s, 2.6 * s], collider: { size: [0.5, 3.6 * s, 0.5] } });

/** A rounded heap of snow (decor that also steers people). */
const drift = (x: number, z: number, w: number, d: number, h = 0.45, y = 0): LevelObject => ({ type: 'box', pos: [x, y + h / 2 - 0.05, z], size: [w, h, d], surface: 'snow', radius: Math.min(h, w, d) * 0.45 });

/** Orange safety netting along a ski run, from x0 to x1 at z. */
const netting = (x0: number, x1: number, z: number): LevelObject[] => {
  const out: LevelObject[] = [];
  const L = x1 - x0;
  for (let i = 0; i <= Math.round(L / 2.5); i++) out.push({ type: 'cylinder', pos: [x0 + (L * i) / Math.round(L / 2.5), 0.55, z], radius: 0.04, height: 1.1, color: 0x2b2b33, collide: false });
  out.push({ type: 'box', pos: [(x0 + x1) / 2, 0.6, z], size: [L, 0.8, 0.04], color: 0xff7a1a, radius: 0.01 });
  return out;
};

const objects: LevelObject[] = [
  // ---- the ground: one big snowfield, the summit plateau on top at the back
  ...island([0, 0, -22], [68, 104], 'snow'),
  { type: 'box', pos: [0, (TOP - 0.15) / 2, (CLIFF - 72) / 2], size: [34, TOP - 0.15, CLIFF + 72], surface: 'concrete', color: 0x8d97a5, radius: 0.3 },
  { type: 'box', pos: [0, TOP - 0.15, (CLIFF - 72) / 2], size: [34.2, 0.3, CLIFF + 72 + 0.2], surface: 'snow', radius: 0.12 },
  // far-off peaks (scenery)
  ...([[-30, -95, 26], [6, -110, 34], [38, -92, 22], [-50, -60, 18]] as const).map(([x, z, h]) => ({ type: 'cylinder' as const, pos: [x, h / 2 - 4, z] as Vec3, radius: h * 0.75, radiusTop: 0.6, height: h, color: 0xf2f6fb, segments: 7, collide: false })),

  // ---- the ice-carving shed (x -4.5..4.5, z 15.5..23.5): freezing inside
  { type: 'box', pos: [0, 0.006, 19.5], size: [9, 0.012, 8], surface: 'woodLight', collide: false, castShadow: false, radius: 0.003 },
  ...wall([-4.5, 0, 23.5], [4.5, 0, 23.5], 0.9, { surface: 'woodDark', color: 0x8a5a36 }),
  ...wall([-4.5, 0, 15.5], [-4.5, 0, 23.5], 2.6, { surface: 'woodDark', color: 0x8a5a36, fade: true }),
  ...wall([4.5, 0, 15.5], [4.5, 0, 23.5], 2.6, { surface: 'woodDark', color: 0x8a5a36, fade: true }),
  ...wall([-4.5, 0, 15.5], [4.5, 0, 15.5], 2.6, { surface: 'woodDark', color: 0x8a5a36, fade: true, doors: [[0.5, 3.2, 2.3]] }),
  { type: 'sign', pos: [0, 2.45, 15.4], size: [3.0, 0.42, 0.05], text: 'ICE SCULPTURE CO.', color: 0x3d6fb0 },
  { type: 'hazard', kind: 'heater', pos: [0, 1, 19.5], params: { style: 'none', radius: 6.5, power: -2 } },
  ...counter([-3.7, 0, 19.5], [1.0, 0.9, 5.0], 0x9aa3ad, 0x5b3a22, 90),
  // ice blocks waiting their turn (slippery!)
  ...([[-3.6, 22.4], [-2.9, 22.6], [-3.3, 21.7]] as const).map(([x, z], i) => ({ type: 'box' as const, pos: [x, 0.26 + (i === 2 ? 0.5 : 0), z] as Vec3, size: [0.6, 0.5, 0.5] as Vec3, surface: 'ice' as const, color: 0xcdeeff, dynamic: { mass: 14 } })),
  { type: 'box', pos: [3.6, 0.26, 22.2], size: [0.6, 0.5, 0.5], surface: 'ice', color: 0xcdeeff, dynamic: { mass: 14 } },
  ...stand(0, 0, 19.5),
  rug([0, 0, 19.5], [2.6, 1.6], 0x3d6fb0),
  { type: 'sign', pos: [2.6, 1.6, 23.4], size: [2.2, 0.5, 0.05], text: 'KEEP FROZEN', color: 0xd94a3d, rot: [0, 180, 0] },

  // ---- the yard and the sledge run (lane along x at z 8)
  { type: 'box', pos: [0, 0.004, 9], size: [3.4, 0.008, 13], color: PATH, surface: 'snow', collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [0, 0.006, 8], size: [56, 0.01, 2.6], color: 0xd2e6f2, surface: 'ice', collide: false, castShadow: false, radius: 0.003 },
  drift(-14.5, 6.3, 25, 0.9),
  drift(14.5, 6.3, 25, 0.9),
  drift(-14.5, 9.7, 25, 0.9),
  drift(14.5, 9.7, 25, 0.9),
  { type: 'hazard', kind: 'skiers', pos: [-28, 0, 8], params: { style: 'sled', dirYaw: 90, length: 56, speed: 5.5, count: 2, spacing: [0, 0.45], wiggle: 0.25 } },
  { type: 'sign', pos: [-2.6, 1.9, 10.6], size: [2.4, 0.5, 0.06], text: 'SLEDGES! LOOK LEFT', color: 0xd94a3d, post: true },
  { type: 'model', model: 'snowman', pos: [-6, 0, 12.5] },
  { type: 'model', model: 'snowman', pos: [6.5, 0, 3.5], rot: [0, -40, 0] },
  pine(-9, 14), pine(-12, 18, 1.2), pine(9, 13), pine(12.5, 17, 1.3), pine(-18, 2, 1.4), pine(18, 1, 1.2),
  pine(-24, 12, 1.5), pine(24, 14, 1.4), pine(-24, -6, 1.3), pine(24, -8, 1.5),

  // ---- the frozen pond (x -6.5..6.5, z -11..1) and the long way round on the left
  { type: 'box', pos: [0, 0.0, -5], size: [13, 0.04, 12], surface: 'ice', color: 0xbfe6f5, radius: 0.02 },
  drift(4.2, 1.4, 4.6, 0.8, 0.4),
  drift(-4.2, 1.4, 4.6, 0.8, 0.4),
  drift(4.2, -11.4, 4.6, 0.8, 0.4),
  drift(-4.2, -11.4, 4.6, 0.8, 0.4),
  drift(-6.9, -5, 0.8, 12.8, 0.4),
  drift(6.9, -5, 0.8, 12.8, 0.4),
  { type: 'hazard', kind: 'pedestrian', pos: [-3.5, 0.02, -2], params: { points: [[0, 0, 0], [7, 0, 0], [7, 0, -6], [0, 0, -6]], speed: 0.8, color: 0xff8fab } },
  { type: 'hazard', kind: 'pedestrian', pos: [3.0, 0.02, -9.5], params: { points: [[0, 0, 0], [-6, 0, 0], [-6, 0, 5]], speed: 0.7, color: 0x52d39a } },
  { type: 'sign', pos: [2.6, 1.8, 2.6], size: [2.3, 0.5, 0.06], text: 'THIN ICE? NAH. SLIPPY.', color: 0x3d6fb0, post: true },
  // the long way: a cleared path with a cocoa stand (and its heater)
  { type: 'box', pos: [-4.8, 0.004, 2.2], size: [7.2, 0.008, 2.0], color: PATH, surface: 'snow', collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [-8.8, 0.004, -5], size: [3.0, 0.008, 15.4], color: PATH, surface: 'snow', collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [-4.8, 0.004, -12.6], size: [7.2, 0.008, 2.0], color: PATH, surface: 'snow', collide: false, castShadow: false, radius: 0.003 },
  { type: 'model', model: 'hotdogCart', pos: [-11.9, 0, -4.4], rot: [0, 90, 0] },
  { type: 'sign', pos: [-11.9, 2.7, -4.4], size: [1.8, 0.4, 0.05], text: 'HOT COCOA', color: 0x8a5a36, rot: [0, 90, 0] },
  { type: 'hazard', kind: 'heater', pos: [-10.9, 0, -2.0], params: { style: 'patio', radius: 3.2, power: 7 } },
  pine(-13, -10, 1.1), pine(-14, 2, 0.9), pine(11, -6, 1.2), pine(10, -12, 1),

  // ---- the ski run (skiers along x at z -18.5), netting both sides with a gap
  { type: 'box', pos: [0, 0.006, -18.5], size: [60, 0.01, 5.0], color: 0xf7fbff, surface: 'snow', collide: false, castShadow: false, radius: 0.003 },
  { type: 'box', pos: [0, 0.004, -13.8], size: [3.4, 0.008, 4.4], color: PATH, surface: 'snow', collide: false, castShadow: false, radius: 0.003 },
  ...netting(-29, -1.8, -15.9),
  ...netting(1.8, 29, -15.9),
  ...netting(-29, -1.8, -21.1),
  ...netting(1.8, 29, -21.1),
  { type: 'hazard', kind: 'skiers', pos: [-31, 0, -18.5], params: { style: 'ski', dirYaw: 90, length: 62, speed: 7, count: 3, spacing: [0, 0.16, 0.32], wiggle: 0.9 } },
  { type: 'sign', pos: [-2.8, 2.0, -14.8], size: [2.6, 0.5, 0.06], text: 'SKIERS! WAIT FOR A GAP', color: 0xd94a3d, post: true },

  // ---- gondola base station (cabin waits at z -25)
  ramp([0, 0, -21.4], [0, DECK, -22.6], 3.4, { surface: 'woodDark', color: 0x8a5a36 }),
  { type: 'box', pos: [0, DECK - 0.2, -23.2], size: [5.2, 0.4, 1.2], surface: 'woodDark', color: 0x8a5a36 },
  { type: 'box', pos: [-2.25, DECK - 0.2, -25.1], size: [0.7, 0.4, 2.6], surface: 'woodDark', color: 0x8a5a36 },
  { type: 'box', pos: [2.25, DECK - 0.2, -25.1], size: [0.7, 0.4, 2.6], surface: 'woodDark', color: 0x8a5a36 },
  ...[-2.45, 2.45].flatMap((x) => [-22.7, -26.3].map((z) => ({ type: 'box' as const, pos: [x, DECK + 2.3, z] as Vec3, size: [0.2, 4.6, 0.2] as Vec3, color: 0x6e4a2c, radius: 0.03 }))),
  { type: 'box', pos: [0, DECK + 4.75, -23.4], size: [5.6, 0.25, 2.4], color: 0xd94a3d, collide: false, radius: 0.05, fade: true },
  { type: 'sign', pos: [-3.6, 2.3, -22.2], size: [2.8, 0.55, 0.06], text: 'GONDOLA → SUMMIT', color: 0x2f5d4a, post: true },
  { type: 'hazard', kind: 'elevator', tag: 'gondola', pos: [0, DECK, -25], params: { style: 'gondola', size: [3.2, 2.6], travel: [0, TOP - DECK, -16.5], speed: 1.3, wall: 1.1, walls: ['+x', '-x'], landing: 4.2 } },

  // ---- summit: top station deck, terrace with heaters, the lodge
  { type: 'box', pos: [0, TOP + 0.006, -45], size: [5.2, 0.012, 4.4], surface: 'woodDark', color: 0x8a5a36, collide: false, castShadow: false, radius: 0.003 },
  ...railing([-16, TOP, CLIFF - 0.1], [-1.9, TOP, CLIFF - 0.1]),
  ...railing([1.9, TOP, CLIFF - 0.1], [16, TOP, CLIFF - 0.1]),
  ...[-2.45, 2.45].flatMap((x) => [-43.2, -46.8].map((z) => ({ type: 'box' as const, pos: [x, TOP + 2.3, z] as Vec3, size: [0.2, 4.6, 0.2] as Vec3, color: 0x6e4a2c, radius: 0.03 }))),
  { type: 'box', pos: [0, TOP + 4.75, -45.6], size: [5.6, 0.25, 2.6], color: 0xd94a3d, collide: false, radius: 0.05, fade: true },
  { type: 'sign', pos: [-3.9, TOP + 2.3, -44.2], size: [2.6, 0.55, 0.06], text: 'SUMMIT LODGE ↑', color: 0x2f5d4a, post: true },
  ...stand(3.6, TOP, -45.6),
  // terrace
  { type: 'box', pos: [0, TOP + 0.006, -49.6], size: [12, 0.012, 5.2], surface: 'woodLight', collide: false, castShadow: false, radius: 0.003 },
  { type: 'hazard', kind: 'heater', pos: [-2.7, TOP, -49.6], params: { style: 'patio', radius: 3.4, power: 5 } },
  { type: 'hazard', kind: 'heater', pos: [2.7, TOP, -49.6], params: { style: 'patio', radius: 3.4, power: 5 } },
  { type: 'model', model: 'gardenTable', pos: [-5.2, TOP, -48.8] },
  { type: 'model', model: 'gardenTable', pos: [5.4, TOP, -50.4] },
  { type: 'model', model: 'parasol', pos: [-5.2, TOP + 0.75, -48.8], collider: 'none' },
  pine(-11, -48, 1.2, TOP), pine(11, -47, 1.1, TOP), pine(-13, -60, 1.3, TOP), pine(13, -61, 1.2, TOP),
  { type: 'model', model: 'snowman', pos: [8.5, TOP, -44.8], rot: [0, -30, 0] },
  // the lodge (x -7..7, z -64..-52)
  { type: 'box', pos: [0, TOP + 0.008, -58], size: [14, 0.016, 12], surface: 'woodLight', color: 0xdcae78, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-7, TOP, -52], [7, TOP, -52], 2.6, { surface: 'woodLight', color: 0xc99566, fade: true, doors: [[0.5, 3.2, 2.4]] }),
  ...wall([-7, TOP, -64], [-7, TOP, -52], 2.6, { surface: 'woodLight', color: 0xc99566, fade: true }),
  ...wall([7, TOP, -64], [7, TOP, -52], 2.6, { surface: 'woodLight', color: 0xc99566, fade: true }),
  ...wall([-7, TOP, -64], [7, TOP, -64], 2.6, { surface: 'woodLight', color: 0xc99566 }),
  // swing doors, propped wide open for the party (they flap when bumped)
  // (hinges just behind the wall and off the floor, so the leaves never rub on either)
  { type: 'hazard', kind: 'swingDoor', pos: [-1.56, TOP + 0.02, -52.16], params: { width: 1.5, height: 2.3, side: 1, open: 85, spring: 3, color: 0xc98f5a } },
  { type: 'hazard', kind: 'swingDoor', pos: [1.56, TOP + 0.02, -52.16], params: { width: 1.5, height: 2.3, side: -1, open: 85, spring: 3, color: 0xc98f5a } },
  { type: 'hazard', kind: 'heater', pos: [-6.62, TOP, -57.6], rot: [0, 90, 0], params: { style: 'fireplace', radius: 3.8, power: 8 } },
  rug([-4.2, TOP, -57.6], [2.6, 3.0], 0xb03a3a),
  { type: 'model', model: 'armchair', pos: [-4.4, TOP, -59.6], rot: [0, 60, 0] },
  ...table([3.8, TOP, -55.6], [3.0, 0.75, 1.0], PALETTE.woodDark),
  ...table([3.8, TOP, -58.8], [3.0, 0.75, 1.0], PALETTE.woodDark),
  ...[-55.6, -58.8].flatMap((z) => [-0.75, 0.75].map((dz) => ({ type: 'box' as const, pos: [3.8, TOP + 0.23, z + dz] as Vec3, size: [2.8, 0.46, 0.3] as Vec3, surface: 'woodDark' as const, radius: 0.03 }))),
  { type: 'hazard', kind: 'pedestrian', pos: [-2.4, TOP, -55.2], params: { points: [[0, 0, 0], [0, 0, -3.4]], speed: 0.35, color: 0x2b2b33 } },
  ...picture([-0.2, TOP + 2.0, -63.88], 0, 1.4, 0.9, 0x8fb7d9),
  { type: 'sign', pos: [3.6, TOP + 2.2, -63.87], size: [2.6, 0.5, 0.04], text: 'CONGRATULATIONS!', color: 0xff8fab },
  // the buffet: a display table for the swan (room to stand either side), under its heat lamps
  ...table([0, TOP, -61.7], [0.9, 0.75, 0.8], 0xfbfaf6),
  { type: 'box', pos: [0, TOP + 0.76, -61.7], size: [0.98, 0.02, 0.88], color: 0xfbfaf6, collide: false, radius: 0.005 },
  ...[-3.4, 3.4].flatMap((x) => table([x, TOP, -62.3], [2.6, 0.75, 1.0], 0xfbfaf6)),
  ...([[-3.9, 0xf5c16c], [-2.9, 0x8bc34a], [2.9, 0xe9554b], [3.9, 0xff8fab]] as const).map(([x, color]) => ({ type: 'cylinder' as const, pos: [x, TOP + 0.8, -62.3] as Vec3, radius: 0.18, height: 0.1, color, collide: false })),
  { type: 'hazard', kind: 'heater', pos: [0, TOP + 2.05, -61.8], params: { style: 'lamp', radius: 2.0, power: 3 } },
];

const level: LevelDef = {
  id: 'cold',
  name: 'Cold Feet',
  tagline: 'An ice swan for a mountaintop wedding. It’s melting. Hurry. Carefully. Hurry!',
  order: 6,
  cargo: 'swan',
  cameraYaw: 0,
  spawn: { p1: [-1.05, 0, 19.5], p2: [1.05, 0, 19.5], cargo: [0, SWAN_Y, 19.5], yaw: 180 },
  goal: { pos: [0, TOP + 1.2, -61.7], size: [1.2, 0.9, 1.0], label: 'ON THE BUFFET' },
  checkpoints: [
    // past the pond, before the ski run: the swan waits on a stand off to the side
    { pos: [0, 1, -13.8], size: [6, 2, 2.4], spawn: { p1: [3.25, 0, -13.2], p2: [5.35, 0, -13.2], cargo: [4.3, SWAN_Y, -13.2], yaw: 180 } },
    { pos: [0, TOP + 1, -45.2], size: [4.6, 2, 3.0], spawn: { p1: [2.55, TOP, -45.6], p2: [4.65, TOP, -45.6], cargo: [3.6, TOP + SWAN_Y, -45.6], yaw: 180 } },
  ],
  killY: -6,
  parTime: 160,
  objects: [...objects, ...stand(4.3, 0, -13.2)],
  hints: ['Lift it by the block: an end each'],
  tips: [
    { pos: [0, 0, 10.5], radius: 2.0, text: 'Sledges come from the left. Cross between them.' },
    { pos: [0, 0, 2.6], radius: 2.0, text: 'Across the ice is quick but slippy. The path round is warm.' },
    { pos: [0, 0, -15.2], radius: 1.8, text: 'Let the skiers pass, then cross together.' },
    { pos: [0, DECK, -24.2], radius: 2.4, text: 'Both of you in the gondola, then wait: it goes by itself.' },
    { pos: [0, TOP, -51.2], radius: 2.2, text: 'Warm in there! Don’t stop by the fire.' },
  ],
  theme: {
    sunDir: [-0.45, 0.75, 0.45],
    skyTop: 0x7fb0e6,
    skyHorizon: 0xf6eef0,
    fog: 0xeef0f6,
    sun: 0xffe6cc,
    hemiSky: 0xdce9ff,
    hemiGround: 0xe6eef6,
    hemiIntensity: 1.4,
  },
};

export default level;
