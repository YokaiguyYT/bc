import type { LevelDef, LevelObject, Vec3 } from '../types';
import { railing, ramp, wall } from '../helpers';
import { counter, island, picture, rug, table } from '../props';
import { PALETTE } from '../../render/materials';

/**
 * JOB 7 — Jurassic Lark (a dinosaur egg, after hours)
 * The palaeontology lab → the fossil hall (a T-Rex, a guard on his rounds and
 * a Foucault pendulum swinging across the way) → the gem gallery's blinking
 * laser gates → down the ramp to the nursery, into the incubator.
 */
const LOW = -2.2; // the nursery, downstairs
const EGG_Y = 0.42 + 0.387 + 0.02; // egg centre when it stands on a pedestal
const BONE = 0xeee3c8;
const MARBLE = 0xf1ede6;
const WALL = 0xd9d2c3;
const W = { surface: 'plaster' as const, color: WALL, fade: true };

/** A display pedestal with a straw nest on top: the egg stands in it. */
const pedestal = (x: number, y: number, z: number): LevelObject[] => [
  { type: 'cylinder', pos: [x, y + 0.19, z], radius: 0.2, height: 0.38, color: 0x5b3a22, segments: 18 },
  // a flat square cap: the egg stands steady on a box (on a cylinder's top it rocks)
  { type: 'box', pos: [x, y + 0.4, z], size: [0.44, 0.04, 0.44], color: 0x3b2616, radius: 0.012 },
  { type: 'cylinder', pos: [x, y + 0.02, z], radius: 0.36, height: 0.04, color: 0x3b2616, segments: 20 },
  // a snug ring of straw: a bump tips the egg against it instead of off the edge
  ...nest(x, y + 0.46, z, 0.28, 0.06, 11),
];

/** A ring of straw balls (solid) at height y. */
function nest(x: number, y: number, z: number, r: number, ball: number, n: number): LevelObject[] {
  return Array.from({ length: n }, (_, i): LevelObject => {
    const a = (i / n) * Math.PI * 2;
    return { type: 'ball', pos: [x + Math.cos(a) * r, y, z + Math.sin(a) * r], radius: ball, color: i % 2 ? 0xd9b25a : 0xc99a3f };
  });
}

/** A T-Rex skeleton on its platform, facing +X. Only the platform and legs are solid. */
function trex(cx: number, cz: number): LevelObject[] {
  const out: LevelObject[] = [
    { type: 'box', pos: [cx, 0.125, cz], size: [8.4, 0.25, 3.8], color: 0x5c5f68, surface: 'concrete', radius: 0.05 },
    { type: 'sign', pos: [cx + 3.6, 0.55, cz + 1.95], size: [1.4, 0.4, 0.05], text: 'T. REX', color: 0x2f5d4a, rot: [-20, 0, 0] },
  ];
  const bone = (o: LevelObject): LevelObject => ({ ...o, color: BONE }) as LevelObject;
  // spine: tail tip → hips → neck
  const spine: [number, number, number][] = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const x = cx - 4.0 + t * 6.4;
    const y = 1.0 + Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) * 1.7 + (t > 0.8 ? (t - 0.8) * 3 : 0);
    spine.push([x, y, cz]);
    out.push(bone({ type: 'ball', pos: [x, y, cz], radius: 0.07 + 0.08 * Math.min(1, t * 1.6) * (t > 0.85 ? 0.7 : 1), collide: false }));
  }
  // ribs hanging from the chest
  for (let i = 0; i < 6; i++) {
    const x = cx + 0.3 + i * 0.32;
    const sp = spine.reduce((a, b) => (Math.abs(b[0] - x) < Math.abs(a[0] - x) ? b : a));
    const len = 1.15 - Math.abs(i - 2.5) * 0.12;
    for (const s of [-1, 1]) out.push(bone({ type: 'box', pos: [x, sp[1] - len / 2 + 0.05, cz + s * 0.24], size: [0.07, len, 0.07], rot: [s * 22, 0, 0], collide: false, radius: 0.03 }));
  }
  // pelvis, legs and feet (the legs are solid: don't walk through a T-Rex)
  out.push(bone({ type: 'box', pos: [cx - 0.3, 2.45, cz], size: [0.9, 0.45, 0.8], collide: false, radius: 0.12 }));
  for (const s of [-1, 1]) {
    out.push(bone({ type: 'cylinder', pos: [cx - 0.15, 1.85, cz + s * 0.42], radius: 0.13, height: 1.3, rot: [0, 0, -18], segments: 10 }));
    out.push(bone({ type: 'cylinder', pos: [cx - 0.25, 0.85, cz + s * 0.45], radius: 0.1, height: 1.2, rot: [0, 0, 14], segments: 10 }));
    out.push(bone({ type: 'box', pos: [cx + 0.05, 0.33, cz + s * 0.45], size: [0.75, 0.14, 0.32], collide: false, radius: 0.05 }));
    // tiny arms
    out.push(bone({ type: 'cylinder', pos: [cx + 1.7, 2.6, cz + s * 0.3], radius: 0.035, height: 0.45, rot: [0, 0, 55], collide: false, segments: 8 }));
  }
  // skull and jaw, with teeth
  const head = spine[spine.length - 1];
  const hx = head[0] + 0.55;
  const hy = head[1] + 0.1;
  out.push(bone({ type: 'box', pos: [hx, hy, cz], size: [1.2, 0.55, 0.52], collide: false, radius: 0.14 }));
  out.push(bone({ type: 'box', pos: [hx + 0.05, hy - 0.42, cz], size: [1.05, 0.14, 0.44], rot: [0, 0, -12], collide: false, radius: 0.05 }));
  for (let i = 0; i < 5; i++) out.push(bone({ type: 'cylinder', pos: [hx - 0.25 + i * 0.17, hy - 0.3, cz + 0.2], radius: 0.025, radiusTop: 0.004, height: 0.14, rot: [180, 0, 0], collide: false, segments: 6 }));
  out.push({ type: 'ball', pos: [hx - 0.15, hy + 0.08, cz + 0.27], radius: 0.08, color: 0x2b2420, collide: false });
  // the armature that holds it all up
  for (const x of [cx - 2.6, cx - 0.3, cx + 1.6]) out.push({ type: 'cylinder', pos: [x, 1.25, cz], radius: 0.03, height: 2.0, color: 0x2b2b33, collide: false, segments: 6 });
  return out;
}

/** A gem on a lit pedestal (decor that you can still bump into). */
const gem = (x: number, z: number, color: number): LevelObject[] => [
  { type: 'box', pos: [x, 0.5, z], size: [0.5, 1.0, 0.5], color: 0x2b2e36, radius: 0.03 },
  { type: 'ball', pos: [x, 1.13, z], radius: 0.11, color, collide: false },
];

const objects: LevelObject[] = [
  // ---- grounds: the museum on its island, and the nursery's lower slab out back
  ...island([0, 0, -2], [34, 66], 'concrete'),
  { type: 'box', pos: [0, LOW - 0.25, -41.5], size: [16, 0.5, 22], surface: 'concrete', color: 0x9a9893 },
  { type: 'box', pos: [0, LOW - 1.5, -41.5], size: [15.4, 2.0, 21.4], color: 0xb8a48e, surface: 'concrete', collide: false, radius: 0.3 },

  // ---- the lab (x -6..6, z 14..22)
  { type: 'box', pos: [0, 0.006, 18], size: [12, 0.012, 8], surface: 'tiles', color: 0xe8edf0, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-6, 0, 22], [6, 0, 22], 0.9, { surface: 'plaster', color: WALL }),
  ...wall([-6, 0, 14], [-6, 0, 22], 2.8, W),
  ...wall([6, 0, 14], [6, 0, 22], 2.8, W),
  ...wall([-13, 0, 14], [13, 0, 14], 3.4, { ...W, doors: [[0.5, 3.2, 2.6]] }),
  ...pedestal(0, 0, 18),
  rug([0, 0, 18], [2.6, 1.8], 0x3d6fb0),
  ...counter([-4.6, 0, 18], [1.0, 0.9, 5.2], 0xf2ede4, 0x5b3a22, 90),
  { type: 'box', pos: [-4.6, 1.02, 17.2], size: [0.25, 0.25, 0.25], color: 0x2b2b33, collide: false, radius: 0.03 },
  { type: 'cylinder', pos: [-4.6, 1.2, 17.2], radius: 0.04, height: 0.35, color: 0x9aa3ad, collide: false },
  { type: 'box', pos: [-4.5, 0.95, 19.4], size: [0.6, 0.1, 0.25], color: BONE, collide: false, radius: 0.04 },
  ...([[4.2, 20.6], [4.9, 20.9], [4.5, 20.2]] as const).map(([x, z], i) => ({ type: 'box' as const, pos: [x, 0.3 + (i === 2 ? 0.6 : 0), z] as Vec3, size: [0.6, 0.6, 0.6] as Vec3, surface: 'cardboard' as const, dynamic: { mass: 6 } })),
  { type: 'sign', pos: [3.2, 1.7, 21.88], size: [2.6, 0.6, 0.05], text: 'EGG: DO NOT DROP', color: 0x2f5d4a, rot: [0, 180, 0] },
  { type: 'hazard', kind: 'light', pos: [0, 2.6, 18], params: { color: 0xfff0d0, intensity: 6, distance: 9, style: 'pendant' } },

  // ---- the fossil hall (x -13..13, z -14..14)
  { type: 'box', pos: [0, 0.006, 0], size: [26, 0.012, 28], surface: 'checker', color: MARBLE, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-13, 0, -14], [-13, 0, 14], 3.4, W),
  ...wall([13, 0, -14], [13, 0, 14], 3.4, W),
  ...wall([-13, 0, -14], [13, 0, -14], 3.4, { surface: 'plaster', color: WALL, doors: [[0.5, 3.2, 2.6]] }),
  ...trex(-6.6, 1.5),
  // velvet ropes round the T-Rex
  ...([[-10.9, 4], [-2.3, 4], [-2.3, -1], [-10.9, -1]] as const).map(([x, z]) => ({ type: 'cylinder' as const, pos: [x, 0.45, z] as Vec3, radius: 0.05, height: 0.9, color: 0xd9a93f })),
  { type: 'box', pos: [-6.6, 0.82, 4], size: [8.6, 0.05, 0.05], color: 0xb03a3a, collide: false },
  { type: 'box', pos: [-2.3, 0.82, 1.5], size: [0.05, 0.05, 5.0], color: 0xb03a3a, collide: false },
  { type: 'box', pos: [-6.6, 0.82, -1], size: [8.6, 0.05, 0.05], color: 0xb03a3a, collide: false },
  // a triceratops skull on a plinth
  { type: 'box', pos: [8, 0.45, 7], size: [2.2, 0.9, 1.6], color: 0x5c5f68, radius: 0.05 },
  { type: 'box', pos: [8, 1.35, 7], size: [1.0, 0.7, 0.8], color: BONE, collide: false, radius: 0.18 },
  { type: 'box', pos: [7.55, 1.75, 7], size: [0.15, 1.2, 1.5], color: BONE, collide: false, radius: 0.07 },
  ...([[8.4, 1.95, 6.8], [8.4, 1.95, 7.2], [8.75, 1.4, 7]] as const).map(([x, y, z], i) => ({ type: 'cylinder' as const, pos: [x, y, z] as Vec3, radius: i === 2 ? 0.07 : 0.06, radiusTop: 0.01, height: i === 2 ? 0.35 : 0.7, rot: [0, 0, -70] as Vec3, color: 0xe2d4b0, collide: false, segments: 8 })),
  { type: 'sign', pos: [8, 0.6, 7.85], size: [1.6, 0.35, 0.05], text: 'TRICERATOPS', color: 0x2f5d4a },
  // the Foucault pendulum swings right across the way
  { type: 'cylinder', pos: [0.5, 0.012, -5], radius: 3.9, height: 0.012, color: 0xd9c49a, collide: false, segments: 48 },
  { type: 'cylinder', pos: [0.5, 0.018, -5], radius: 3.5, height: 0.012, color: MARBLE, collide: false, segments: 48 },
  { type: 'hazard', kind: 'wreckingBall', pos: [0.5, 10.2, -5], params: { style: 'pendulum', length: 9.5, amp: 21, period: 7, yaw: 90, radius: 0.42 } },
  { type: 'sign', pos: [-4.4, 1.6, -5], size: [2.2, 0.5, 0.06], text: 'FOUCAULT PENDULUM', color: 0x2f5d4a, post: true, rot: [0, 90, 0] },
  // the night guard paces the long way round (dodge him, or time the pendulum)
  { type: 'hazard', kind: 'pedestrian', pos: [3.8, 0, -0.6], params: { points: [[0, 0, 0], [6.4, 0, 0], [6.4, 0, -6.4], [6.4, 0, 0]], speed: 0.45, color: 0x2a3550 } },
  // columns, benches, plants
  ...[-9, -3, 3, 9].flatMap((z) => [-12.2, 12.2].map((x) => ({ type: 'cylinder' as const, pos: [x, 1.7, z] as Vec3, radius: 0.32, height: 3.4, color: 0xe9e4da, segments: 16 }))),
  { type: 'model', model: 'bench', pos: [8.5, 0, -2], rot: [0, -90, 0] },
  { type: 'model', model: 'bench', pos: [8.5, 0, -9], rot: [0, -90, 0] },
  { type: 'model', model: 'plant', pos: [12, 0, 13] },
  { type: 'model', model: 'plant', pos: [-12, 0, 13] },
  ...picture([12.88, 2.2, 3], -90, 1.6, 1.0, 0x8fb7d9),
  ...picture([-12.88, 2.2, -8], 90, 1.6, 1.0, 0xe8b07a),
  { type: 'sign', pos: [0, 3.0, -13.87], size: [3.4, 0.55, 0.05], text: 'GEMS & MINERALS', color: 0x5b3a8a },
  { type: 'hazard', kind: 'light', pos: [-5, 6, 1], params: { color: 0xffe2b0, intensity: 9, distance: 16 } },
  { type: 'hazard', kind: 'light', pos: [5, 6, -6], params: { color: 0xffe2b0, intensity: 9, distance: 16 } },

  // ---- the gem gallery and its laser gates (x -3.5..3.5, z -30..-14)
  { type: 'box', pos: [0, 0.006, -22], size: [7, 0.012, 16], surface: 'carpet', color: 0x3b2f5a, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-3.5, 0, -30], [-3.5, 0, -14], 3.0, W),
  ...wall([3.5, 0, -30], [3.5, 0, -14], 3.0, W),
  ...wall([-3.5, 0, -30], [3.5, 0, -30], 3.0, { ...W, doors: [[0.5, 3.2, 2.6]] }),
  ...gem(-3.0, -16, 0xff3a6a), ...gem(3.0, -16.4, 0x3ad0ff),
  ...gem(-3.0, -20.2, 0x9b5aff), ...gem(3.0, -20.4, 0x52d39a),
  ...gem(-3.0, -24.8, 0xffd23f), ...gem(3.0, -25, 0xff7a3d),
  ...gem(-3.0, -28.6, 0xff8fab), ...gem(3.0, -28.6, 0xa0e0ff),
  { type: 'hazard', kind: 'laser', pos: [0, 0, -18.2], params: { width: 7, beams: 4, on: 2.2, off: 3.2, phase: 0 } },
  { type: 'hazard', kind: 'laser', pos: [0, 0, -22.6], params: { width: 7, beams: 4, on: 2.2, off: 3.2, phase: 1.8 } },
  { type: 'hazard', kind: 'laser', pos: [0, 0, -27.0], params: { width: 7, beams: 4, on: 2.2, off: 3.2, phase: 3.6 } },
  { type: 'hazard', kind: 'light', pos: [0, 3.2, -22], params: { color: 0xc8b0ff, intensity: 6, distance: 12 } },

  // ---- down the ramp to the nursery
  { type: 'box', pos: [0, 0.006, -32.6], size: [7, 0.012, 5.2], surface: 'tiles', color: 0xe8edf0, collide: false, castShadow: false, radius: 0.003 },
  ...railing([-3.4, 0, -35.15], [-1.95, 0, -35.15]),
  ...railing([1.95, 0, -35.15], [3.4, 0, -35.15]),
  ramp([0, 0, -35.2], [0, LOW, -44.2], 3.6, { surface: 'woodLight', color: 0xd9b07a }),
  ...railing([-1.85, 0, -35.2], [-1.85, LOW, -44.2]),
  ...railing([1.85, 0, -35.2], [1.85, LOW, -44.2]),
  { type: 'sign', pos: [2.9, 1.9, -34.6], size: [2.2, 0.5, 0.05], text: 'NURSERY ↓ SHHH!', color: 0x2f5d4a, post: true },

  // ---- the nursery (x -6..6, z -52..-44, downstairs)
  { type: 'box', pos: [0, LOW + 0.006, -48.2], size: [12, 0.012, 8], surface: 'carpet', color: 0xf0c8a0, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-6, LOW, -52.4], [6, LOW, -52.4], 2.8, { surface: 'wallpaper', color: 0xf3d6a8 }),
  ...wall([-6, LOW, -52.4], [-6, LOW, -44.2], 2.8, { surface: 'wallpaper', color: 0xf3d6a8, fade: true }),
  ...wall([6, LOW, -52.4], [6, LOW, -44.2], 2.8, { surface: 'wallpaper', color: 0xf3d6a8, fade: true }),
  // the incubator: a warm pad under a glass dome on a stand
  { type: 'cylinder', pos: [0, LOW + 0.23, -49.2], radius: 0.5, height: 0.46, color: 0xd9a93f, segments: 24 },
  { type: 'box', pos: [0, LOW + 0.48, -49.2], size: [0.9, 0.04, 0.9], color: 0xff9a4a, radius: 0.015 },
  // a low ring of straw round the edge: catches an egg that tips, never snags one coming in
  ...nest(0, LOW + 0.52, -49.2, 0.5, 0.05, 18),
  { type: 'box', pos: [0, LOW + 1.0, -50.75], size: [0.12, 2.0, 0.12], color: 0x9aa3ad, radius: 0.03 },
  { type: 'box', pos: [0, LOW + 1.95, -49.95], size: [0.1, 0.1, 1.6], color: 0x9aa3ad, collide: false, radius: 0.03 },
  { type: 'cylinder', pos: [0, LOW + 1.85, -49.2], radius: 0.25, radiusTop: 0.1, height: 0.2, color: 0xff6a2a, collide: false, segments: 16 },
  ...table([-3.8, LOW, -50.6], [1.6, 0.7, 0.8], PALETTE.woodLight),
  ...table([3.8, LOW, -50.6], [1.6, 0.7, 0.8], PALETTE.woodLight),
  ...([[-4.2, 0x7cc36a], [-3.4, 0x6ab0c3], [3.4, 0xc36a9a], [4.2, 0xc3a66a]] as const).map(([x, color]) => ({ type: 'ball' as const, pos: [x, LOW + 0.85, -50.6] as Vec3, radius: 0.14, color, collide: false })),
  { type: 'sign', pos: [0, LOW + 2.3, -52.27], size: [3.6, 0.55, 0.05], text: 'WELCOME, LITTLE ONE', color: 0xff8fab },
  { type: 'hazard', kind: 'light', pos: [0, LOW + 2.4, -48.4], params: { color: 0xffb070, intensity: 7, distance: 10 } },
];

const level: LevelDef = {
  id: 'museum',
  name: 'Jurassic Lark',
  tagline: 'One priceless dinosaur egg, a museum after dark, and something inside that kicks.',
  order: 7,
  cargo: 'egg',
  cameraYaw: 0,
  spawn: { p1: [-1.0, 0, 18], p2: [1.0, 0, 18], cargo: [0, EGG_Y, 18], yaw: 180 },
  goal: { pos: [0, LOW + 0.5 + 0.4, -49.2], size: [1.0, 0.9, 1.0], label: 'INTO THE INCUBATOR' },
  checkpoints: [
    // before the lasers; after them, at the top of the ramp
    { pos: [0, 1, -15.3], size: [6.4, 2, 2.2], spawn: { p1: [-1.0, 0, -15.6], p2: [1.0, 0, -15.6], cargo: [0, EGG_Y, -15.6], yaw: 180 } },
    { pos: [0, 1, -32.2], size: [6.4, 2, 2.6], spawn: { p1: [-1.0, 0, -32.4], p2: [1.0, 0, -32.4], cargo: [0, EGG_Y, -32.4], yaw: 180 } },
  ],
  killY: -8,
  parTime: 160,
  objects: [...objects, ...pedestal(0, 0, -15.6), ...pedestal(0, 0, -32.4)],
  hints: ['Lift it from both sides, gently'],
  tips: [
    { pos: [0.5, 0, -2.4], radius: 2.0, text: 'Cross behind the pendulum, right after it swings past' },
    { pos: [0, 0, -16.6], radius: 1.6, text: 'Lasers knock you flat. Go when they blink off.' },
    { pos: [0, 0, -34.8], radius: 1.6, text: 'Down the ramp slowly. Eggs roll!' },
  ],
  theme: {
    skyTop: 0x16203a,
    skyHorizon: 0x3a4670,
    fog: 0x2a3358,
    sun: 0xc8d6ff,
    sunIntensity: 1.6,
    sunDir: [0.3, 0.85, 0.45],
    hemiSky: 0xa8b4e0,
    hemiGround: 0x5a5068,
    hemiIntensity: 1.1,
    cloudColor: 0x5a6488,
    exposure: 1.08,
  },
};

export default level;
