import * as THREE from 'three';
import type { LevelDef, LevelObject, Surface, Vec3 } from '../types';
import { eulerDeg, railing, ramp, wall } from '../helpers';
import { bush, counter, picture, rug, table, windowPane } from '../props';

/**
 * JOB 9 — Gone With the Wind (a big gilt-framed painting)
 * The painter's rooftop studio → across the roof past the extractor fans →
 * the gangway over the gully (too narrow to go side by side: cross in a lull)
 * → the village square → along the cliff path in the sea breeze → up onto the
 * headland → over the causeway (a wind tunnel) → onto the easel in the
 * lighthouse keeper's cottage. The wind always blows in from the sea (+X).
 */
const SEA = -10; // the sea, far below everything
const HEAD = 1.2; // the headland, the causeway and the lighthouse rock
const DEG = Math.PI / 180;
const ROCK = 0x8d8275;
const STONE = 0xa59a8a;
const WIND: Vec3 = [1, 0, 0];

// the painting waits in a padded slot on a low stand, leaning back a little: its
// middle is below the movers' hands, so they hold it above its middle and it hangs
// steady; nothing stands behind it, so it can be carried off in any direction
const TILT = 8;
const LEDGE = 0.1; // the slot's floor
const SLOT = 0.105; // the slot's width (the frame is 0.09 deep)
const RAIL = 0.1; // the slot's sides (a pick-up lifts it well clear of them)
const PH = 1.25;
const PD = 0.09;
const PAINT_Y = LEDGE + (PH / 2) * Math.cos(TILT * DEG) + (PD / 2) * Math.sin(TILT * DEG) + 0.01;
/** The painting's centre sits this far back (-Z) of the slot it stands in (it leans back). */
const PAINT_DZ = -(PH / 2) * Math.sin(TILT * DEG);

/** A box from a to b (legs, masts, struts). */
function beam(a: Vec3, b: Vec3, t: number, color: number, extra: Partial<LevelObject> = {}): LevelObject {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  const m = A.clone().add(B).multiplyScalar(0.5);
  return { type: 'box', pos: [m.x, m.y, m.z], size: [t, A.distanceTo(B), t], rot: eulerDeg(q), color, radius: t * 0.3, collide: false, ...extra } as LevelObject;
}

/**
 * A painting stand at floor point (x, y, z): a low board with a padded slot that
 * the painting (facing +Z) stands in, and a knob at each end. The painting's
 * centre goes at [x, y + PAINT_Y, z + PAINT_DZ], tilted back TILT degrees.
 */
function stand(x: number, y: number, z: number, color = 0x8a5a36): LevelObject[] {
  const felt = 0x3d6fb0;
  const top = y + LEDGE;
  return [
    { type: 'box', pos: [x, y + LEDGE / 2, z], size: [1.3, LEDGE, 0.46], color, radius: 0.02 },
    ...[-1, 1].map((s): LevelObject => ({ type: 'box', pos: [x, top + RAIL / 2, z + s * (SLOT / 2 + 0.025)], size: [1.2, RAIL, 0.05], color: felt, radius: 0.02, grabbable: false })),
    ...[-1, 1].map((s): LevelObject => ({ type: 'ball', pos: [x + s * 0.62, top + RAIL + 0.04, z], radius: 0.05, color: 0xd9a93f, collide: false })),
  ];
}

/**
 * The gallery easel in the keeper's cottage (floor point x, y, z; the painting
 * faces +Z): a deep padded ledge in front of a padded backboard, so a painting
 * set down anywhere on it, even skewed, falls back and leans there.
 */
function displayEasel(x: number, y: number, z: number): LevelObject[] {
  const velvet = 0x7a2a3a;
  const gold = 0xd9a93f;
  const back = 12 * DEG;
  // the backboard's foot is just behind the ledge's low back edge
  const fy = y + 0.1;
  const fz = z - 0.41;
  const by = fy + 0.72 * Math.cos(back) - 0.04 * Math.sin(back);
  const bz = fz - 0.72 * Math.sin(back) - 0.04 * Math.cos(back);
  return [
    { type: 'box', pos: [x, y + 0.075, z + 0.15], size: [1.5, 0.15, 1.1], color: 0x5b3a22, surface: 'woodDark', radius: 0.03 },
    { type: 'box', pos: [x, y + 0.16, z + 0.15], size: [1.5, 0.06, 1.12], rot: [-8, 0, 0], color: velvet, surface: 'carpet', friction: 0.4, radius: 0.02 },
    { type: 'box', pos: [x, by, bz], size: [1.5, 1.5, 0.08], rot: [-back / DEG, 0, 0], color: velvet, surface: 'carpet', friction: 0.3, radius: 0.03, grabbable: false },
    beam([x - 0.79, y, z - 0.42], [x - 0.79, y + 1.62, z - 0.75], 0.07, gold),
    beam([x + 0.79, y, z - 0.42], [x + 0.79, y + 1.62, z - 0.75], 0.07, gold),
    beam([x - 0.79, y + 1.6, z - 0.75], [x + 0.79, y + 1.6, z - 0.75], 0.06, gold),
    { type: 'sign', pos: [x, y + 0.08, z + 0.71], size: [1.1, 0.12, 0.02], text: 'LIGHTHOUSE AT DUSK · M. GALE', color: 0xb8892e, textColor: '#2b1d14' },
    // a potted plant each side, level with the backboard: whoever sets it down stops beside it, not behind it
    ...[-1, 1].map((s): LevelObject => ({ type: 'model', model: 'plant', pos: [x + s * 1.3, y, z - 0.8] })),
  ];
}

/** The rock (or house) a piece of ground stands on, from its top down into the sea. */
const body = (x0: number, x1: number, z0: number, z1: number, top: number, color = ROCK): LevelObject => ({
  type: 'box',
  pos: [(x0 + x1) / 2, (top + SEA - 1) / 2, (z0 + z1) / 2],
  size: [x1 - x0, top - SEA + 1, z1 - z0],
  color,
  surface: 'concrete',
  collide: false,
  radius: 0.2,
});

/** A slab of walkable ground with its top at y. */
const ground = (x0: number, x1: number, z0: number, z1: number, y: number, surface: Surface, color?: number): LevelObject => ({
  type: 'box',
  pos: [(x0 + x1) / 2, y - 0.25, (z0 + z1) / 2],
  size: [x1 - x0, 0.5, z1 - z0],
  surface,
  color,
  radius: 0.06,
});

/** A chimney stack with pots (and sometimes a gull on it). */
const chimney = (x: number, z: number, h = 1.6, gull = false): LevelObject[] => [
  { type: 'box', pos: [x, h / 2, z], size: [0.9, h, 0.7], surface: 'brick', color: 0xb5654a, radius: 0.04 },
  { type: 'cylinder', pos: [x - 0.2, h + 0.15, z], radius: 0.11, height: 0.3, color: 0xc97a4a, segments: 10, collide: false },
  { type: 'cylinder', pos: [x + 0.2, h + 0.15, z], radius: 0.11, height: 0.3, color: 0xc97a4a, segments: 10, collide: false },
  ...(gull ? [{ type: 'model' as const, model: 'seagull', pos: [x - 0.2, h + 0.3, z] as Vec3, rot: [0, 70, 0] as Vec3, collider: 'none' as const }] : []),
];

/** A rooftop extractor fan blowing +X, on the west parapet: zone z0..z1, its duct behind. */
const extractor = (z0: number, z1: number, phase: number): LevelObject[] => [
  { type: 'hazard', kind: 'fan', pos: [0.5, 1.4, (z0 + z1) / 2], params: { size: [13, 2.8, z1 - z0], dir: WIND, force: 4.5, gust: [3, 3.6], phase } },
  { type: 'box', pos: [-6.75, 1.4, (z0 + z1) / 2], size: [0.7, 2.7, 2.7], surface: 'metal', color: 0x8d9aa6, radius: 0.08 },
  { type: 'box', pos: [-6.75, 0.25, (z0 + z1) / 2], size: [0.9, 0.5, 3.0], surface: 'metal', color: 0x6c7480, radius: 0.04 },
];

/** A bench facing the sea. */
const bench = (x: number, y: number, z: number, yaw = 90): LevelObject => ({ type: 'model', model: 'bench', pos: [x, y, z], rot: [0, yaw, 0] });

/** A little flock of gulls (they scatter when you come close). */
const gulls = (x: number, y: number, z: number, count = 4, radius = 1.2): LevelObject => ({
  type: 'hazard',
  kind: 'pigeons',
  pos: [x, y, z],
  params: { count, radius, model: 'seagull', size: [0.62, 0.22, 0.42] },
});

const objects: LevelObject[] = [
  // ---- the sea, far below
  { type: 'box', pos: [-40, SEA - 0.5, -30], size: [260, 1, 240], color: 0x2f6f9f, collide: false, castShadow: false },
  // rocky buttresses down the cliffs, and boulders in the surf
  ...([[-8.9, -15, 5], [-9.0, -24.5, 3.5], [-8.8, -35, 6], [-8.9, -51, 4], [-35.4, -45, 5], [-35.3, -59, 3.5]] as const).map(([x, z, h], i) => ({ type: 'box' as const, pos: [x, SEA + (h - 1) / 2 + 2, z] as Vec3, size: [2.2, h + 3, 3.2 + (i % 3)] as Vec3, rot: [0, 18 - i * 11, 0] as Vec3, color: i % 2 ? STONE : ROCK, collide: false, radius: 0.4 })),
  ...([[-11.5, -29, 1.3], [-10.2, -18, 0.9], [-24, -36.4, 1.5], [-37.2, -50, 1.2], [-10.6, -56, 1.4], [-30, -67.6, 1.1]] as const).map(([x, z, r]) => ({ type: 'ball' as const, pos: [x, SEA + r * 0.3, z] as Vec3, radius: r, color: ROCK, collide: false })),
  // surf along the foot of the cliffs
  ...([[-8.7, -14, 1.2, 84], [-35.7, -52, 1.2, 28], [-28, -37.3, 14, 1.2], [-28, -66.7, 14, 1.2]] as const).map(([x, z, w, d]) => ({ type: 'box' as const, pos: [x, SEA + 0.02, z] as Vec3, size: [w, 0.08, d] as Vec3, color: 0xe6f3f8, collide: false, castShadow: false, radius: 0.03 })),

  // ---- roof A: the painter's studio (x -7..7, z 8..28)
  ground(-7, 7, 8, 28, 0, 'concrete', 0x8e8a84),
  body(-7, 7, 8.2, 28, -0.5, 0xf0e6d6),
  ...wall([-7, 0, 28], [7, 0, 28], 0.6, { surface: 'plaster', color: 0xf0e6d6 }),
  ...wall([-7, 0, 8], [-7, 0, 28], 0.6, { surface: 'plaster', color: 0xf0e6d6 }),
  ...wall([7, 0, 8], [7, 0, 28], 0.6, { surface: 'plaster', color: 0xf0e6d6 }),
  ...wall([-7, 0, 8], [7, 0, 8], 0.6, { surface: 'plaster', color: 0xf0e6d6, doors: [[0.5, 2.6, 0.6]], lintel: false }),
  // the studio (x -4.5..4.5, z 20..27)
  { type: 'box', pos: [0, 0.006, 23.5], size: [9, 0.012, 7], surface: 'woodLight', collide: false, castShadow: false, radius: 0.003 },
  ...wall([-4.5, 0, 27], [4.5, 0, 27], 0.9, { surface: 'plaster', color: 0xd9e4ea }),
  ...wall([-4.5, 0, 20], [-4.5, 0, 27], 2.6, { surface: 'plaster', color: 0xd9e4ea, fade: true }),
  ...wall([4.5, 0, 20], [4.5, 0, 27], 2.6, { surface: 'plaster', color: 0xd9e4ea, fade: true }),
  ...wall([-4.5, 0, 20], [4.5, 0, 20], 2.6, { surface: 'plaster', color: 0xd9e4ea, fade: true, doors: [[0.5, 3.8, 2.3]] }),
  { type: 'sign', pos: [0, 2.45, 19.86], size: [3.2, 0.42, 0.05], text: 'M. GALE · PAINTER', color: 0x3d6fb0 },
  ...stand(0, 0, 23.6),
  rug([0, 0, 23.4], [3.4, 2.2], 0xc8648a),
  ...table([-3.4, 0, 25.6], [1.6, 0.8, 0.8], 0x8a5a36),
  ...([[-3.9, 0xd6453a], [-3.55, 0x3d6fb0], [-3.2, 0xffd23f], [-2.85, 0x52d39a]] as const).map(([x, color]) => ({ type: 'cylinder' as const, pos: [x, 0.86, 25.5] as Vec3, radius: 0.07, height: 0.12, color, collide: false })),
  { type: 'box', pos: [-3.4, 0.82, 25.8], size: [0.5, 0.02, 0.35], color: 0xf4ecd6, collide: false, radius: 0.005 },
  // finished canvases leaning on the wall, and a stool
  ...([[3.0, 26.7, 0.9, 0.7, 0x9fd6ee], [3.7, 26.6, 0.7, 0.9, 0xffd36b], [-1.6, 26.75, 0.8, 0.6, 0x7cc4a4]] as const).map(([x, z, w, h, color]) => ({ type: 'box' as const, pos: [x, h / 2 + 0.02, z] as Vec3, size: [w, h, 0.05] as Vec3, rot: [12, 0, 0] as Vec3, color, collide: false, radius: 0.01 })),
  { type: 'cylinder', pos: [2.4, 0.3, 22.8], radius: 0.22, height: 0.6, color: 0x8a5a36, segments: 14, dynamic: { mass: 4 } },
  ...picture([4.38, 1.7, 23.5], -90, 1.0, 0.7, 0x9fd6ee),
  ...picture([-4.38, 1.7, 22.5], 90, 0.8, 1.0, 0xffa35c),
  // the roof: chimneys, a skylight, a water tank and the extractor fans (gusting across, from the sea)
  ...chimney(5.6, 25.5, 1.6, true),
  ...chimney(-5.8, 21.5, 1.4),
  { type: 'box', pos: [4.9, 0.35, 15.6], size: [1.6, 0.7, 2.6], color: 0x9fd6ee, radius: 0.06 },
  { type: 'box', pos: [4.9, 0.71, 15.6], size: [1.7, 0.04, 2.7], color: 0xfbfaf6, collide: false, radius: 0.02 },
  { type: 'cylinder', pos: [5.5, 1.0, 10.4], radius: 0.8, height: 2.0, color: 0x6c7480, segments: 16 },
  { type: 'cylinder', pos: [5.5, 2.05, 10.4], radius: 0.85, radiusTop: 0.2, height: 0.3, color: 0x5b636e, segments: 16, collide: false },
  ...extractor(15.8, 19.2, 0),
  ...extractor(12.2, 15.6, 3.3),
  { type: 'sign', pos: [-3.7, 1.9, 19.5], size: [2.2, 0.5, 0.06], text: 'FANS! MIND THE WIND', color: 0xd94a3d, post: true },

  // ---- the gully between the houses, and the gangway over it (x -1.2..1.2, z 0..8)
  { type: 'box', pos: [0, -0.07, 4], size: [2.4, 0.14, 8.3], surface: 'wood', color: 0x9a7048, radius: 0.02 },
  ...railing([-1.15, 0, 8], [-1.15, 0, 0], { color: 0xd8c8a0, spacing: 1.35 }),
  ...railing([1.15, 0, 8], [1.15, 0, 0], { color: 0xd8c8a0, spacing: 1.35 }),
  ...[-1.15, 1.15].flatMap((x) => [2, 6].map((z) => beam([x, -0.1, z], [x, -1.6, z + (z < 4 ? -2 : 2)], 0.12, 0x8a6a48))),
  // the sea wind funnels up the gully in gusts; the windsocks fill a second before each one
  { type: 'hazard', kind: 'fan', pos: [0, 1.5, 4], params: { size: [9, 3, 6.4], dir: WIND, force: 4.5, gust: [3, 9], phase: 1.5, housing: false, socks: [[-1.9, 0, 9.0], [1.8, 0, -0.9]] } },
  // house fronts down the gully, and a washing line across it
  ...[-4.6, -1.6, 2.6, 5.4].flatMap((x) => windowPane([x, -2.4, 0.04], 0, 1.0, 1.2)),
  ...[-4.6, 2.6].flatMap((x) => windowPane([x, -5.6, 0.04], 0, 1.0, 1.2)),
  { type: 'box', pos: [-4.2, -1.0, 4], size: [0.03, 0.03, 8], color: 0xfbfaf6, collide: false, castShadow: false },
  ...([[3.2, 0xff8fab], [4.4, 0x9fd6ee], [5.4, 0xffd36b]] as const).map(([z, color]) => ({ type: 'box' as const, pos: [-4.2, -1.35, z] as Vec3, size: [0.02, 0.6, 0.6] as Vec3, color, collide: false })),
  { type: 'sign', pos: [3.0, 1.8, 9.2], size: [2.4, 0.55, 0.06], text: 'GANGWAY: SINGLE FILE!', color: 0x2f5d4a, post: true },

  // ---- roof B: the village square (x -8..8, z -12..0)
  ground(-8, 8, -12, 0, 0, 'concrete', 0xc8bfae),
  body(-8, 8, -12, -0.2, -0.5, 0xf2c4b8),
  ...railing([-7.9, 0, -0.3], [-7.9, 0, -12]),
  ...wall([1.2, 0, -0.1], [8, 0, -0.1], 0.6, { surface: 'plaster', color: 0xf2c4b8 }),
  ...wall([-8, 0, -0.1], [-1.2, 0, -0.1], 0.6, { surface: 'plaster', color: 0xf2c4b8 }),
  ...wall([8, 0, -12], [8, 0, 0], 2.8, { surface: 'brick', color: 0x9a5a44 }),
  { type: 'sign', pos: [7.86, 2.2, -5], size: [3.0, 0.6, 0.06], text: 'FISH & CHIPS', color: 0x3d6fb0, rot: [0, -90, 0] },
  { type: 'model', model: 'streetLamp', pos: [-7.2, 0, -10.5], rot: [0, -90, 0], collider: { size: [0.3, 4.5, 0.3] } },
  { type: 'model', model: 'mailbox', pos: [7.4, 0, -1.4], rot: [0, -90, 0] },
  bench(7.3, 0, -8.4, -90),
  ...([[6.2, -11.2], [6.9, -11.3], [6.55, -10.6]] as const).map(([x, z], i) => ({ type: 'cylinder' as const, pos: [x, 0.25 + (i === 2 ? 0.5 : 0), z] as Vec3, radius: 0.3, height: 0.5, color: 0xc97a4a, segments: 10 })),
  gulls(2.4, 0, -9.4, 5, 1.3),
  ...stand(4.6, 0, -5.6),
  { type: 'sign', pos: [-1.8, 1.9, -11.2], size: [2.4, 0.55, 0.06], text: 'CLIFF PATH · LIGHTHOUSE', color: 0x2f5d4a, post: true },

  // ---- the cliff path (x -8..-3, z -40..-12): railing on the sea side, a stone wall inland
  ground(-8, -3, -32, -12, 0, 'concrete', 0xd2c4a8),
  body(-8, -3, -32, -12, -0.5),
  ground(-3, 6, -40, -12, 0.4, 'grass'),
  body(-3, 6, -40, -12, -0.1),
  ...railing([-7.9, 0, -12], [-7.9, 0, -32]),
  ...wall([-3, 0, -12.2], [-3, 0, -32], 0.85, { surface: 'concrete', color: STONE }),
  // the sea breeze, in gusts, with a sheltered spot behind the old lookout in between
  { type: 'hazard', kind: 'fan', pos: [-5.5, 1.5, -19.8], params: { size: [6, 3, 15.4], dir: WIND, force: 4.5, gust: [3.4, 4.2], phase: 0.6, housing: false, socks: [[-7.4, 0, -12.6], [-7.4, 0, -25.6]] } },
  { type: 'hazard', kind: 'fan', pos: [-5.5, 1.5 + HEAD / 2, -35.4], params: { size: [6, 3 + HEAD, 11.2], dir: WIND, force: 4.5, gust: [3.4, 4.2], phase: 2.4, housing: false, socks: [[-7.4, HEAD, -40.6]] } },
  { type: 'box', pos: [-7.45, 1.1, -28.6], size: [0.9, 2.2, 2.4], surface: 'brick', color: STONE, radius: 0.08 },
  { type: 'box', pos: [-7.45, 2.3, -28.6], size: [1.2, 0.2, 2.8], color: 0x5b636e, collide: false, radius: 0.04 },
  { type: 'sign', pos: [-6.98, 1.4, -28.6], size: [1.2, 0.36, 0.05], text: 'LOOKOUT', color: 0x2f5d4a, rot: [0, 90, 0] },
  bench(-3.55, 0, -16.5, 90),
  { type: 'cylinder', pos: [-7.45, 0.55, -21.5], radius: 0.07, height: 1.1, color: 0x6c7480, segments: 10 },
  { type: 'box', pos: [-7.45, 1.2, -21.5], size: [0.5, 0.22, 0.22], color: 0x3d6fb0, rot: [0, 0, 12], collide: false, radius: 0.06 },
  gulls(-5.2, 0, -24.0, 4, 1.0),
  { type: 'sign', pos: [-3.35, 1.8, -13.6], size: [2.6, 0.55, 0.06], text: 'SEA BREEZE! EDGE TO THE SEA', color: 0xd94a3d, post: true, rot: [0, -30, 0] },
  ...bush([0, 0.4, -18], 0.7),
  ...bush([2.5, 0.4, -27], 0.8),
  ...bush([-1.4, 0.4, -34], 0.6),
  // up the slope onto the headland
  ramp([-5.5, 0, -32], [-5.5, HEAD, -40], 5, { surface: 'concrete', color: 0xd2c4a8, thickness: 1 }),
  body(-8, -3, -40, -32, -0.6),
  ...railing([-7.9, 0, -32], [-7.9, HEAD, -40]),
  ...railing([-3.1, 0, -32], [-3.1, HEAD, -40]),
  ...railing([6, 0.4, -12], [6, 0.4, -40]),

  // ---- the headland (x -8..6, z -54..-40)
  ground(-8, 6, -54, -40, HEAD, 'grass'),
  body(-8, 6, -54, -40, HEAD - 0.5),
  { type: 'box', pos: [-4.6, HEAD + 0.005, -47], size: [7, 0.01, 3.6], surface: 'concrete', color: 0xd2c4a8, collide: false, castShadow: false, radius: 0.003 },
  ...railing([-7.9, HEAD, -40], [-7.9, HEAD, -45.1]),
  ...railing([-7.9, HEAD, -48.9], [-7.9, HEAD, -54]),
  ...railing([-7.9, HEAD, -54], [6, HEAD, -54]),
  ...railing([6, HEAD, -54], [6, HEAD, -40]),
  ...stand(-1.4, HEAD, -43.2),
  bench(3.6, HEAD, -51.8, 180),
  gulls(1.4, HEAD, -49.6, 4, 1.1),
  ...bush([4.8, HEAD, -42], 0.7),
  ...bush([-5.4, HEAD, -52.6], 0.6),
  { type: 'sign', pos: [-5.6, HEAD + 1.9, -50.2], size: [2.6, 0.55, 0.06], text: 'CAUSEWAY: VERY WINDY', color: 0xd94a3d, post: true },

  // ---- the causeway out to the lighthouse rock (x -21..-8, z -48.9..-45.1): the wind straight down it
  ground(-21.2, -7.8, -48.9, -45.1, HEAD, 'concrete', 0xb9b0a2),
  ...[-11, -15, -19].map((x) => ({ type: 'box' as const, pos: [x, (HEAD + SEA) / 2 - 0.4, -47] as Vec3, size: [1.6, HEAD - SEA - 0.8, 3.2] as Vec3, color: ROCK, collide: false, radius: 0.3 })),
  ...railing([-21.2, HEAD, -45.15], [-7.9, HEAD, -45.15], { color: 0xf2f2ee }),
  ...railing([-21.2, HEAD, -48.85], [-7.9, HEAD, -48.85], { color: 0xf2f2ee }),
  { type: 'hazard', kind: 'fan', pos: [-14.5, HEAD + 1.5, -47], params: { size: [14.6, 3, 4.2], dir: WIND, force: 4.5, gust: [5, 2.5], phase: 0, housing: false, socks: [[-7.3, HEAD, -49.6], [-22.0, HEAD, -44.4]] } },

  // ---- the lighthouse rock (x -35..-21, z -66..-38)
  ground(-35, -21, -66, -38, HEAD, 'grass', 0x8fb86a),
  body(-35, -21, -66, -38, HEAD - 0.5),
  ...railing([-35, HEAD, -38.1], [-21.1, HEAD, -38.1]),
  ...railing([-21.1, HEAD, -38.1], [-21.1, HEAD, -45.1]),
  ...railing([-21.1, HEAD, -48.9], [-21.1, HEAD, -66]),
  ...railing([-34.9, HEAD, -38.1], [-34.9, HEAD, -66]),
  { type: 'model', model: 'lighthouse', pos: [-27.5, HEAD, -60.5], size: [4.4, 12.5, 4.4] },
  { type: 'box', pos: [-27.5, HEAD + 0.01, -56.2], size: [1.6, 0.012, 4.2], surface: 'concrete', color: 0xd2c4a8, collide: false, castShadow: false, radius: 0.003 },
  gulls(-31.5, HEAD, -41.5, 5, 1.3),
  { type: 'model', model: 'seagull', pos: [-21.1, HEAD + 1.06, -41.0], rot: [0, -60, 0], collider: 'none' },
  ...bush([-33.4, HEAD, -40], 0.7),
  ...bush([-22.8, HEAD, -40.2], 0.6),
  // the keeper's cottage (x -32..-23, z -54..-44), door on the causeway side
  { type: 'box', pos: [-27.5, HEAD + 0.008, -49], size: [9, 0.016, 10], surface: 'woodLight', color: 0xdcae78, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-32, HEAD, -44], [-23, HEAD, -44], 0.9, { surface: 'plaster', color: 0xf6f1e4 }),
  ...wall([-32, HEAD, -54], [-32, HEAD, -44], 2.7, { surface: 'plaster', color: 0xf6f1e4, fade: true }),
  ...wall([-23, HEAD, -54], [-23, HEAD, -44], 2.7, { surface: 'plaster', color: 0xf6f1e4, fade: true, doors: [[0.7, 3.4, 2.4]] }),
  ...wall([-32, HEAD, -54], [-23, HEAD, -54], 2.7, { surface: 'plaster', color: 0xf6f1e4 }),
  { type: 'sign', pos: [-22.86, HEAD + 2.5, -47], size: [3.0, 0.42, 0.05], text: 'KEEPER’S COTTAGE', color: 0x2a3550, rot: [0, 90, 0] },
  ...displayEasel(-27.5, HEAD, -52.6),
  rug([-27.5, HEAD, -50.4], [3.6, 2.4], 0x3d6fb0),
  { type: 'model', model: 'armchair', pos: [-30.6, HEAD, -46.4], rot: [0, 120, 0] },
  ...table([-30.4, HEAD, -51.6], [1.4, 0.75, 0.8], 0x8a5a36),
  ...counter([-24.2, HEAD, -52.9], [1.4, 0.95, 0.7], 0xf2ede4, 0x5b3a22),
  { type: 'model', model: 'bookshelf', pos: [-31.5, HEAD, -49.5], rot: [0, 90, 0] },
  ...windowPane([-27.5, HEAD + 1.7, -53.88], 0, 1.0, 0.6).map((o) => ({ ...o, pos: [o.pos[0] - 2.6, o.pos[1], o.pos[2]] as Vec3 })),
  ...windowPane([-27.5, HEAD + 1.7, -53.88], 0, 1.0, 0.6).map((o) => ({ ...o, pos: [o.pos[0] + 2.6, o.pos[1], o.pos[2]] as Vec3 })),
  { type: 'sign', pos: [-27.5, HEAD + 2.35, -53.87], size: [3.2, 0.36, 0.04], text: 'GALLERY OPENING TONIGHT!', color: 0xff8fab },

  // ---- out at sea: the fishing boat
  { type: 'model', model: 'trawler', pos: [-14, SEA, -64], rot: [0, 35, 0], size: [4.3, 5.4, 13.2], collider: 'none' },
];

const level: LevelDef = {
  id: 'wind',
  name: 'Gone With the Wind',
  tagline: 'A priceless seascape, the windiest cliffs on the coast, and a lighthouse at the end. Hold on tight!',
  order: 9,
  cargo: 'painting',
  cameraYaw: 0,
  // one of you at each side of the frame, the picture facing you
  spawn: { p1: [-1.35, 0, 23.55], p2: [1.35, 0, 23.55], cargo: [0, PAINT_Y, 23.6 + PAINT_DZ], cargoRot: [-TILT, 0, 0], yaw: 180 },
  goal: { pos: [-27.5, HEAD + 0.85, -52.6], size: [2.4, 1.7, 1.8], label: 'ON THE EASEL' },
  checkpoints: [
    // over the gangway: it waits on a stand by the fish & chip shop
    { pos: [0, 1, -2.6], size: [5, 2, 3], spawn: { p1: [3.25, 0, -5.65], p2: [5.95, 0, -5.65], cargo: [4.6, PAINT_Y, -5.6 + PAINT_DZ], cargoRot: [-TILT, 0, 0], yaw: 180 } },
    // on the headland, before the causeway
    { pos: [-5.5, HEAD + 1, -42.2], size: [5, 2, 3.2], spawn: { p1: [-2.75, HEAD, -43.25], p2: [-0.05, HEAD, -43.25], cargo: [-1.4, HEAD + PAINT_Y, -43.2 + PAINT_DZ], cargoRot: [-TILT, 0, 0], yaw: 180 } },
  ],
  killY: -6,
  parTime: 200,
  objects,
  hints: ['Lift it off its stand together: one of you at each side'],
  tips: [
    { pos: [0, 0, 18.2], radius: 2.2, text: 'Fans! Side by side, its edge cuts through the wind' },
    { pos: [0, 0, 9.6], radius: 2.0, text: 'Too narrow for side by side. Wait till the windsocks droop, then cross!' },
    { pos: [-3.0, 0, -9.6], radius: 2.4, text: 'Sea breeze: turn it so its thin edge points at the sea' },
    { pos: [-5.5, 0, -27.6], radius: 1.8, text: 'Out of the wind behind the lookout: a good spot to turn it' },
    { pos: [-6.6, HEAD, -47], radius: 2.2, text: 'The wind blows straight down the causeway: one in front, one behind' },
    { pos: [-25, HEAD, -47], radius: 2.0, text: 'Onto the easel by the far wall, picture facing out' },
  ],
  theme: {
    sunDir: [-0.7, 0.5, 0.35],
    skyTop: 0x4f7fc8,
    skyHorizon: 0xffd6b0,
    fog: 0xf0dccb,
    sun: 0xffdcb0,
    sunIntensity: 2.6,
    hemiSky: 0xdce8ff,
    hemiGround: 0x9a8a78,
    cloudY: -40,
  },
};

export default level;
