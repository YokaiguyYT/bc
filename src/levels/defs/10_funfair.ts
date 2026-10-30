import * as THREE from 'three';
import type { LevelDef, LevelObject, Vec3 } from '../types';
import { eulerDeg, wall } from '../helpers';
import { bush, counter, fence, island, rug } from '../props';

/**
 * JOB 10 — Up, Up and Away (a balloon bouquet for a birthday party)
 * The balloon stall at the funfair gate → the midway: giant darts sticking
 * out of the darts stall, potted cacti to weave between → the Tunnel of Love,
 * its ceiling studded with pins and spiky glitter balls hanging low → between
 * the big top and the big wheel, past the topiary hedgehogs inside the
 * spear-topped railings → onto the birthday party table. Let go anywhere but
 * a balloon stand or the party table and the bouquet floats off.
 */
const STAND = 0.86; // top of a balloon stand
const BOUQUET_Y = STAND + 0.13 + 0.005; // the bouquet's present, sitting on a stand
const PATH = 0xeadcc2;
const TUNNEL: [number, number] = [-7, -25]; // z: in, out
const TW = 2.4; // tunnel wall line (x = ±TW)
const TH = 3.5; // tunnel ceiling
const RAIL_X = 3.3; // the hedgehog garden's railings
const TABLE_Z = -56.2; // the party table's middle
const TABLE_TOP = 0.73;
const CP1_STAND: [number, number] = [3.7, -4.4];
const CP2_STAND: [number, number] = [-3.7, -28.4];
const UP = new THREE.Vector3(0, 1, 0);

/** A balloon stand: a slim post with a little plate the bouquet's present gets tied to. */
const stand = (x: number, z: number): LevelObject[] => [
  { type: 'cylinder', pos: [x, 0.03, z], radius: 0.28, height: 0.06, color: 0x5b3a22, segments: 18 },
  { type: 'cylinder', pos: [x, STAND / 2, z], radius: 0.05, height: STAND, color: 0xe9e4da, segments: 10 },
  { type: 'box', pos: [x, STAND - 0.02, z], size: [0.48, 0.04, 0.38], color: 0xff8fab, radius: 0.012, tie: true },
];

/** A thin pointy cone from `base` toward `dir` (decor). */
function spike(base: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, color: number): LevelObject {
  const d = dir.clone().normalize();
  const mid = base.clone().addScaledVector(d, len / 2);
  return { type: 'cylinder', pos: [mid.x, mid.y, mid.z], radius: r, radiusTop: 0.002, height: len, rot: eulerDeg(new THREE.Quaternion().setFromUnitVectors(UP, d)), color, collide: false, segments: 5 };
}

/** Spike directions spread evenly over a sphere (above `minY` only). */
function sphereDirs(n: number, minY = -1) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    if (y < minY) continue;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    out.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
}

/** A potted cactus a head taller than a mover: every prickly bit of it pops balloons. */
function cactus(x: number, z: number, h = 2.4, flip = 1): LevelObject[] {
  const G = 0x4f9a4a;
  const out: LevelObject[] = [
    { type: 'cylinder', pos: [x, 0.25, z], radius: 0.34, radiusTop: 0.4, height: 0.5, color: 0xd9733f, segments: 14 },
    { type: 'cylinder', pos: [x, 0.51, z], radius: 0.37, height: 0.03, color: 0x6e4a2c, collide: false, segments: 14 },
    { type: 'cylinder', pos: [x, 0.5 + (h - 0.7) / 2, z], radius: 0.2, height: h - 0.7, color: G, collide: false, segments: 10 },
    { type: 'ball', pos: [x, h - 0.2, z], radius: 0.2, color: G, collide: false },
    // an arm out and up each side
    { type: 'cylinder', pos: [x - flip * 0.3, 1.35, z], radius: 0.11, height: 0.32, rot: [0, 0, 90], color: G, collide: false, segments: 8 },
    { type: 'cylinder', pos: [x - flip * 0.42, 1.62, z], radius: 0.11, height: 0.55, color: G, collide: false, segments: 8 },
    { type: 'ball', pos: [x - flip * 0.42, 1.9, z], radius: 0.11, color: G, collide: false },
    { type: 'cylinder', pos: [x + flip * 0.3, 1.72, z], radius: 0.1, height: 0.3, rot: [0, 0, 90], color: G, collide: false, segments: 8 },
    { type: 'cylinder', pos: [x + flip * 0.41, 1.95, z], radius: 0.1, height: 0.46, color: G, collide: false, segments: 8 },
    { type: 'ball', pos: [x + flip * 0.41, 2.18, z], radius: 0.1, color: G, collide: false },
    { type: 'ball', pos: [x, h + 0.02, z], radius: 0.07, color: 0xff6b9a, collide: false },
    // the prickly parts, a little fatter than they look (that's the spines)
    { type: 'cylinder', pos: [x, 0.5 + (h - 0.5) / 2, z], radius: 0.27, height: h - 0.5, visible: false, sharp: true },
    { type: 'box', pos: [x, 1.76, z], size: [1.12, 0.96, 0.32], visible: false, sharp: true },
  ];
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996;
    const y = 0.75 + ((i * 0.37) % 1) * (h - 1.1);
    out.push(spike(new THREE.Vector3(x + Math.cos(a) * 0.18, y, z + Math.sin(a) * 0.18), new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a)), 0.12, 0.012, 0xf4f0d8));
  }
  return out;
}

/** A giant dart stuck in the darts stall, jutting out over the path at balloon height (its point pops them). */
function giantDart(x: number, y: number, z: number): LevelObject[] {
  // flights at x, point toward +x
  return [
    { type: 'box', pos: [x + 0.1, y, z], size: [0.4, 0.36, 0.03], color: 0xd94a3d, collide: false, radius: 0.01 },
    { type: 'box', pos: [x + 0.1, y, z], size: [0.4, 0.03, 0.36], color: 0xd94a3d, collide: false, radius: 0.01 },
    { type: 'cylinder', pos: [x + 0.55, y, z], radius: 0.04, height: 0.7, rot: [0, 0, 90], color: 0x2b2b33, collide: false, segments: 8 },
    { type: 'cylinder', pos: [x + 1.05, y, z], radius: 0.075, height: 0.4, rot: [0, 0, 90], color: 0xd9a93f, collide: false, segments: 10 },
    spike(new THREE.Vector3(x + 1.25, y, z), new THREE.Vector3(1, 0, 0), 0.6, 0.05, 0xc8ced6),
    { type: 'cylinder', pos: [x + 1.45, y, z], radius: 0.13, height: 0.8, rot: [0, 0, 90], visible: false, sharp: true },
    // hung from the edge of the stall's roof
    { type: 'cylinder', pos: [x + 0.62, (y + 3.3) / 2, z], radius: 0.015, height: 3.3 - y, color: 0x9aa3ad, collide: false, segments: 5 },
  ];
}

/** A glitter ball covered in spikes, hanging from the tunnel roof down to balloon height. */
function spikyBall(x: number, z: number): LevelObject[] {
  const y = 2.5;
  const out: LevelObject[] = [
    { type: 'ball', pos: [x, y, z], radius: 0.22, color: 0xe7d3ff, collide: false },
    { type: 'cylinder', pos: [x, (y + TH) / 2 + 0.1, z], radius: 0.015, height: TH - y - 0.2, color: 0x9aa3ad, collide: false, segments: 5 },
    { type: 'cylinder', pos: [x, y, z], radius: 0.42, height: 0.84, visible: false, sharp: true },
  ];
  for (const d of sphereDirs(16)) out.push(spike(new THREE.Vector3(x, y, z).addScaledVector(d, 0.18), d, 0.22, 0.045, 0xd9e0ea));
  return out;
}

/** A hedgehog clipped out of hedge, up on a hedge plinth at balloon height: spines and all, it pops them. */
function hedgehog(x: number, z: number): LevelObject[] {
  const G = 0x3f7f3a;
  const y = 1.45; // the middle of its body
  const out: LevelObject[] = [
    { type: 'box', pos: [x, 0.45, z], size: [1.4, 0.9, 1.4], color: 0x2f6a2c, radius: 0.12 },
    { type: 'ball', pos: [x, y, z - 0.08], radius: 0.6, color: G, collide: false },
    // a long pointy snout with a button nose, and two beady eyes, looking at the camera
    { type: 'cylinder', pos: [x, y - 0.12, z + 0.62], radius: 0.3, radiusTop: 0.06, height: 0.5, rot: [90, 0, 0], color: 0x6f9f4a, collide: false, segments: 12 },
    { type: 'ball', pos: [x, y - 0.12, z + 0.9], radius: 0.08, color: 0x2b2420, collide: false },
    { type: 'ball', pos: [x - 0.17, y + 0.06, z + 0.55], radius: 0.06, color: 0x2b2420, collide: false },
    { type: 'ball', pos: [x + 0.17, y + 0.06, z + 0.55], radius: 0.06, color: 0x2b2420, collide: false },
    { type: 'cylinder', pos: [x, y + 0.2, z], radius: 0.95, height: 1.5, visible: false, sharp: true },
  ];
  // clipped spines all over its back, swept back
  for (const d of sphereDirs(34, -0.35)) {
    if (d.z > 0.35) continue; // its face
    out.push(spike(new THREE.Vector3(x, y, z - 0.08).addScaledVector(d, 0.52), d.clone().add(new THREE.Vector3(0, 0.15, -0.35)), 0.42, 0.075, 0x2f6a2c));
  }
  return out;
}

/** Iron railings with spear tips along x = `x` from z0 to z1: the tips pop balloons. */
function spearRailings(x: number, z0: number, z1: number, h = 2.3): LevelObject[] {
  const L = Math.abs(z1 - z0);
  const zc = (z0 + z1) / 2;
  const n = Math.round(L / 0.32);
  const out: LevelObject[] = [
    { type: 'box', pos: [x, 0.25, zc], size: [0.05, 0.05, L], color: 0x2b2b33, collide: false, radius: 0.015 },
    { type: 'box', pos: [x, h - 0.32, zc], size: [0.05, 0.05, L], color: 0x2b2b33, collide: false, radius: 0.015 },
    { type: 'box', pos: [x, h / 2, zc], size: [0.14, h, L], visible: false },
    { type: 'box', pos: [x, h - 0.12, zc], size: [0.26, 0.34, L], visible: false, sharp: true },
  ];
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    out.push({ type: 'cylinder', pos: [x, (h - 0.15) / 2, z], radius: 0.018, height: h - 0.15, color: 0x2b2b33, collide: false, segments: 6 });
    out.push(spike(new THREE.Vector3(x, h - 0.17, z), UP, 0.19, 0.04, 0xd9a93f));
  }
  return out;
}

/** A display balloon (decor) on a string down to y0. */
const decorBalloon = (x: number, y: number, z: number, y0: number, color: number): LevelObject[] => [
  { type: 'ball', pos: [x, y, z], radius: 0.17, color, collide: false },
  { type: 'cylinder', pos: [x, (y0 + y - 0.17) / 2, z], radius: 0.006, height: y - 0.17 - y0, color: 0xf4f4f4, collide: false, segments: 4 },
];

const BRIGHT = [0xff4d5e, 0xffd23f, 0x3d9bff, 0x52d39a, 0xff8fab, 0xb085f5];

const objects: LevelObject[] = [
  // ---- the fairground: one grassy island, a sandy path down the middle
  ...island([0, 0, -18], [48, 92], 'grass'),
  { type: 'box', pos: [0, 0.006, -12], size: [6, 0.012, 71], color: PATH, collide: false, castShadow: false, radius: 0.003 },

  // ---- the balloon stall at the gate (start)
  ...stand(0, 21.5),
  // the stall, off to the left (behind the start it would hide the movers from the camera)
  ...counter([-3.8, 0, 21.5], [0.7, 1.0, 3.6], 0xfbfaf6, 0xff6b8b),
  { type: 'box', pos: [-5.6, 1.5, 21.5], size: [0.12, 3.0, 4.0], color: 0xffd6e0 },
  ...[19.6, 23.4].map((z) => ({ type: 'cylinder' as const, pos: [-3.4, 1.6, z] as Vec3, radius: 0.07, height: 3.2, color: 0xfbfaf6, segments: 10 })),
  { type: 'box', pos: [-4.5, 3.1, 21.5], size: [2.6, 0.08, 4.4], rot: [0, 0, -10], surface: 'hazard', color: 0xff8fab, collide: false },
  { type: 'sign', pos: [-4.5, 3.65, 23.65], size: [2.6, 0.6, 0.06], text: 'BALLOONS', color: 0xff6b8b },
  ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) => decorBalloon(-3.8, 2.1 + (i % 2) * 0.35, 20.15 + i * 0.45, 1.0, BRIGHT[i % BRIGHT.length])),
  // the funfair arch
  ...[-3.3, 3.3].map((x) => ({ type: 'cylinder' as const, pos: [x, 2.3, 17.5] as Vec3, radius: 0.16, height: 4.6, color: 0xff6b8b, segments: 14 })),
  { type: 'sign', pos: [0, 4.75, 17.5], size: [7.0, 0.9, 0.12], text: 'FUNFAIR', color: 0xd94a3d, textColor: '#ffe9a0' },
  ...[-3.3, 3.3].flatMap((x, i) => decorBalloon(x, 5.25, 17.5, 4.6, BRIGHT[i + 2])),
  { type: 'model', model: 'bench', pos: [5.2, 0, 21.5], rot: [0, -90, 0] },
  { type: 'model', model: 'trashCan', pos: [4.6, 0, 19.0], dynamic: { mass: 8 } },
  { type: 'model', model: 'tree', pos: [-9, 0, 23] },
  { type: 'model', model: 'tree', pos: [9.5, 0, 22] },

  // ---- the midway: the darts stall (left) and the hot-dog cart (right)
  ...counter([-3.4, 0, 11], [0.6, 1.0, 4.4], 0xfbfaf6, 0xd94a3d),
  { type: 'box', pos: [-5.5, 1.6, 11], size: [0.14, 3.2, 4.8], color: 0x2a3550 },
  ...[8.6, 13.4].map((z) => ({ type: 'box' as const, pos: [-4.3, 1.1, z] as Vec3, size: [2.4, 2.2, 0.1] as Vec3, color: 0xffd23f })),
  ...[8.6, 13.4].map((z) => ({ type: 'cylinder' as const, pos: [-3.05, 1.65, z] as Vec3, radius: 0.07, height: 3.3, color: 0xfbfaf6, segments: 10 })),
  { type: 'box', pos: [-4.3, 3.3, 11], size: [2.8, 0.1, 5.0], surface: 'hazard', color: 0xd94a3d, collide: false },
  { type: 'sign', pos: [-4.3, 3.85, 13.45], size: [2.4, 0.6, 0.06], text: 'DARTS', color: 0x2a3550, textColor: '#ffd23f' },
  ...[9.6, 11, 12.4].flatMap((z) => [
    { type: 'cylinder' as const, pos: [-5.4, 1.75, z] as Vec3, radius: 0.32, height: 0.05, rot: [0, 0, 90] as Vec3, color: 0x2b2b33, collide: false, segments: 20 },
    { type: 'cylinder' as const, pos: [-5.37, 1.75, z] as Vec3, radius: 0.2, height: 0.04, rot: [0, 0, 90] as Vec3, color: 0xd94a3d, collide: false, segments: 20 },
    { type: 'cylinder' as const, pos: [-5.35, 1.75, z] as Vec3, radius: 0.06, height: 0.04, rot: [0, 0, 90] as Vec3, color: 0x52d39a, collide: false, segments: 12 },
  ]),
  ...giantDart(-3.6, 2.5, 9.6),
  ...giantDart(-3.6, 2.6, 12.4),
  { type: 'model', model: 'hotdogCart', pos: [3.9, 0, 11], rot: [0, -90, 0] },
  { type: 'model', model: 'parasol', pos: [8.8, 0, 12], size: [9, 2.2, 9], collider: 'none' },
  { type: 'model', model: 'gardenTable', pos: [8.8, 0, 12] },

  // ---- cactus corner: potted cacti to weave the balloons round
  ...cactus(1.3, 6.4),
  ...cactus(-1.3, 2.8, 2.5, -1),
  ...cactus(1.3, -0.8, 2.3),
  ...cactus(-5.0, 5.6, 2.0, -1),
  ...cactus(5.2, -2.4, 2.1),
  { type: 'sign', pos: [-4.3, 2.0, 1.2], size: [1.9, 0.5, 0.05], text: 'CACTUS CORNER', color: 0x8a5a36, post: true },
  // the coconut shy (right)
  { type: 'box', pos: [5.4, 0.5, 4], size: [2.4, 1.0, 3.2], color: 0x3d9bff, radius: 0.05 },
  { type: 'box', pos: [5.4, 2.9, 4], size: [2.8, 0.1, 3.6], surface: 'hazard', color: 0x3d9bff, collide: false },
  ...[2.4, 5.6].map((z) => ({ type: 'cylinder' as const, pos: [4.3, 1.95, z] as Vec3, radius: 0.06, height: 1.9, color: 0xfbfaf6, collide: false, segments: 8 })),
  ...[3.0, 3.7, 4.4, 5.1].map((z) => ({ type: 'ball' as const, pos: [5.4, 1.16, z] as Vec3, radius: 0.15, color: 0x6e4a2c, collide: false })),
  { type: 'sign', pos: [5.4, 3.35, 5.85], size: [2.6, 0.5, 0.06], text: 'COCONUT SHY', color: 0x3d9bff },
  { type: 'hazard', kind: 'pedestrian', pos: [-7, 0, 4.6], params: { points: [[0, 0, 0], [10.4, 0, 0]], speed: 0.4, color: 0xb085f5, polite: true } },
  { type: 'model', model: 'parasol', pos: [-8.5, 0, -1], size: [9, 2.2, 9], collider: 'none' },
  { type: 'model', model: 'gardenTable', pos: [-8.5, 0, -1] },
  { type: 'model', model: 'trashCan', pos: [-3.7, 0, -2.2], dynamic: { mass: 8 } },
  ...stand(...CP1_STAND),

  // ---- the Tunnel of Love (x -2.4..2.4): pins in the ceiling, spiky glitter balls hanging low
  { type: 'box', pos: [0, 0.012, (TUNNEL[0] + TUNNEL[1]) / 2], size: [2 * TW - 0.1, 0.012, TUNNEL[0] - TUNNEL[1]], color: 0x9a2a4a, collide: false, castShadow: false, radius: 0.003 },
  ...wall([-TW, 0, TUNNEL[0]], [-TW, 0, TUNNEL[1]], TH, { surface: 'wallpaper', color: 0xff9fbf, fade: true }),
  ...wall([TW, 0, TUNNEL[0]], [TW, 0, TUNNEL[1]], TH, { surface: 'wallpaper', color: 0xff9fbf, fade: true }),
  { type: 'box', pos: [0, TH + 0.12, (TUNNEL[0] + TUNNEL[1]) / 2], size: [2 * TW + 0.4, 0.24, TUNNEL[0] - TUNNEL[1]], surface: 'wallpaper', color: 0xe86a8e, fade: true },
  { type: 'box', pos: [0, TH - 0.14, (TUNNEL[0] + TUNNEL[1]) / 2], size: [2 * TW - 0.2, 0.28, TUNNEL[0] - TUNNEL[1]], visible: false, sharp: true },
  ...[-1.8, -0.9, 0, 0.9, 1.8].flatMap((x, i) =>
    Array.from({ length: 14 }, (_, k): LevelObject => spike(new THREE.Vector3(x, TH, TUNNEL[0] - 0.8 - k * 1.25 - (i % 2) * 0.6), UP.clone().negate(), 0.26, 0.03, 0xc8ced6)),
  ),
  ...spikyBall(0.85, -11),
  ...spikyBall(-0.85, -14.6),
  ...spikyBall(0.85, -18.2),
  ...spikyBall(-0.85, -21.8),
  { type: 'hazard', kind: 'light', pos: [0, 2.9, -16], params: { color: 0xff9fc8, intensity: 6, distance: 14 } },
  // the front: a big heart over the way in
  { type: 'box', pos: [-3.5, (TH + 0.9) / 2, TUNNEL[0] + 0.1], size: [2.2, TH + 0.9, 0.3], color: 0xff6b8b, fade: true },
  { type: 'box', pos: [3.5, (TH + 0.9) / 2, TUNNEL[0] + 0.1], size: [2.2, TH + 0.9, 0.3], color: 0xff6b8b, fade: true },
  { type: 'box', pos: [0, TH + 0.45, TUNNEL[0] + 0.1], size: [4.8, 0.9, 0.3], color: 0xff6b8b, fade: true },
  { type: 'sign', pos: [0, TH + 0.45, TUNNEL[0] + 0.28], size: [4.2, 0.6, 0.05], text: 'TUNNEL OF LOVE', color: 0xd94a6e, textColor: '#fff1f5' },
  { type: 'box', pos: [0, TH + 1.25, TUNNEL[0] + 0.1], size: [0.62, 0.62, 0.2], rot: [0, 0, 45], color: 0xd94a3d, collide: false },
  ...[-0.22, 0.22].map((x) => ({ type: 'ball' as const, pos: [x, TH + 1.48, TUNNEL[0] + 0.1] as Vec3, radius: 0.29, color: 0xd94a3d, collide: false })),
  // …and the way out
  { type: 'box', pos: [-3.5, (TH + 0.5) / 2, TUNNEL[1] - 0.1], size: [2.2, TH + 0.5, 0.3], color: 0xff6b8b },
  { type: 'box', pos: [3.5, (TH + 0.5) / 2, TUNNEL[1] - 0.1], size: [2.2, TH + 0.5, 0.3], color: 0xff6b8b },
  { type: 'box', pos: [0, TH + 0.25, TUNNEL[1] - 0.1], size: [4.8, 0.5, 0.3], color: 0xff6b8b, fade: true },
  { type: 'sign', pos: [-3.9, 1.8, TUNNEL[0] + 1.2], size: [1.6, 0.5, 0.05], text: 'NO JUMPING', color: 0xd94a3d, post: true },
  ...stand(...CP2_STAND),

  // ---- the big top (left) and the big wheel (right)
  { type: 'model', model: 'circusTent', pos: [-14, 0, -38.5], collider: { size: [11, 7, 11] } },
  { type: 'model', model: 'ferrisWheel', pos: [12.5, 0, -38.5], rot: [0, 90, 0] },
  { type: 'box', pos: [6.2, 1.1, -32.5], size: [1.6, 2.2, 1.4], color: 0xffd23f, radius: 0.08 },
  { type: 'box', pos: [6.2, 2.32, -32.5], size: [1.9, 0.12, 1.7], surface: 'hazard', color: 0xd94a3d, collide: false },
  { type: 'sign', pos: [6.2, 2.75, -31.75], size: [1.8, 0.45, 0.05], text: 'BIG WHEEL', color: 0x3d5a80 },
  { type: 'sign', pos: [-6.6, 2.4, -31.2], size: [1.8, 0.5, 0.05], text: 'BIG TOP', color: 0xd94a3d, post: true },
  { type: 'hazard', kind: 'pedestrian', pos: [5.4, 0, -36], params: { points: [[0, 0, 0], [0, 0, -8]], speed: 0.35, color: 0x52d39a, polite: true } },

  // ---- hedgehog hollow: spear-topped railings either side, topiary hedgehogs in the way
  { type: 'box', pos: [0, 0.009, -38.8], size: [2 * RAIL_X - 0.2, 0.012, 17.4], surface: 'grass', color: 0x6fbf55, collide: false, castShadow: false, radius: 0.003 },
  ...spearRailings(-RAIL_X, -30.3, -47.3),
  ...spearRailings(RAIL_X, -30.3, -47.3),
  ...hedgehog(-0.95, -33.6),
  ...hedgehog(0.95, -38.6),
  ...hedgehog(-0.95, -43.6),
  { type: 'sign', pos: [-4.6, 1.6, -30.2], size: [1.9, 0.5, 0.05], text: 'HEDGEHOG HOLLOW', color: 0x2f5d4a, post: true },

  // ---- the birthday party (z -48..-60)
  ...[-RAIL_X, RAIL_X].map((x) => ({ type: 'cylinder' as const, pos: [x, 2.1, -47.5] as Vec3, radius: 0.12, height: 4.2, color: 0xfbfaf6, segments: 12 })),
  { type: 'sign', pos: [0, 4.0, -47.5], size: [6.8, 0.7, 0.08], text: 'HAPPY BIRTHDAY, PIP!', color: 0xff8fab, textColor: '#ffffff' },
  ...[-RAIL_X, RAIL_X].flatMap((x, i) => [0, 1, 2].flatMap((k) => decorBalloon(x + (k - 1) * 0.3, 4.6 + (k % 2) * 0.3, -47.5, 4.2, BRIGHT[(i * 3 + k) % BRIGHT.length]))),
  rug([0, 0, -56.4], [3.2, 4.6], 0xff8fab),
  // the party table: long and narrow, so the bouquet can be carried up either side of it
  { type: 'box', pos: [0, (TABLE_TOP - 0.06) / 2, TABLE_Z], size: [0.62, TABLE_TOP - 0.06, 2.56], color: 0xffd6e0, radius: 0.02 },
  { type: 'box', pos: [0, TABLE_TOP - 0.03, TABLE_Z], size: [0.7, 0.06, 2.64], color: 0xfbfaf6, radius: 0.015, tie: true },
  // the cake, hats and plates at the far end
  { type: 'cylinder', pos: [0, TABLE_TOP + 0.11, TABLE_Z - 0.95], radius: 0.2, height: 0.22, color: 0xfff1f5, collide: false, segments: 20 },
  { type: 'cylinder', pos: [0, TABLE_TOP + 0.215, TABLE_Z - 0.95], radius: 0.205, height: 0.02, color: 0xff8fab, collide: false, segments: 20 },
  ...[-0.08, 0, 0.08].flatMap((dx) => [
    { type: 'cylinder' as const, pos: [dx, TABLE_TOP + 0.27, TABLE_Z - 0.95] as Vec3, radius: 0.01, height: 0.1, color: 0x3d9bff, collide: false, segments: 5 },
    { type: 'ball' as const, pos: [dx, TABLE_TOP + 0.335, TABLE_Z - 0.95] as Vec3, radius: 0.018, color: 0xffb347, collide: false },
  ]),
  ...[-0.17, 0.17].flatMap((dx, i): LevelObject[] => [
    { type: 'cylinder', pos: [dx, TABLE_TOP + 0.005, TABLE_Z - 0.6], radius: 0.1, height: 0.01, color: 0xfbfaf6, collide: false, segments: 14 },
    { type: 'cylinder', pos: [dx, TABLE_TOP + 0.1, TABLE_Z - 0.6], radius: 0.07, radiusTop: 0.005, height: 0.18, color: BRIGHT[i + 1], collide: false, segments: 10 },
  ]),
  // presents, a bouncy castle, parasols, a fence round the back
  ...([[1.7, -57.6, 0.5, 0x3d9bff], [2.3, -57.9, 0.4, 0xffd23f], [1.9, -58.4, 0.35, 0x52d39a]] as const).map(([x, z, s, c]) => ({ type: 'box' as const, pos: [x, s / 2, z] as Vec3, size: [s, s, s] as Vec3, color: c, radius: 0.03 })),
  { type: 'box', pos: [-8, 0.35, -56], size: [4.2, 0.7, 4.2], color: 0x3d9bff, radius: 0.25 },
  ...[-1.8, 1.8].flatMap((dx) => [-1.8, 1.8].map((dz) => ({ type: 'cylinder' as const, pos: [-8 + dx, 1.5, -56 + dz] as Vec3, radius: 0.32, height: 1.7, color: dx < 0 === dz < 0 ? 0xff4d5e : 0xffd23f, segments: 14 }))),
  { type: 'box', pos: [-8, 1.3, -57.75], size: [3.4, 1.2, 0.5], color: 0xff4d5e, radius: 0.2 },
  { type: 'box', pos: [-9.75, 1.3, -56], size: [0.5, 1.2, 3.4], color: 0x52d39a, radius: 0.2 },
  { type: 'model', model: 'parasol', pos: [7, 0, -53.5], size: [9, 2.2, 9], collider: 'none' },
  { type: 'model', model: 'gardenTable', pos: [7, 0, -53.5] },
  { type: 'model', model: 'parasol', pos: [7, 0, -58.5], size: [9, 2.2, 9], collider: 'none' },
  { type: 'model', model: 'gardenTable', pos: [7, 0, -58.5] },
  { type: 'hazard', kind: 'pedestrian', pos: [2.6, 0, -59.6], params: { points: [[0, 0, 0], [-5.2, 0, 0]], speed: 0.35, color: 0xffd23f, polite: true } },
  ...fence([-12, 0, -61.5], [12, 0, -61.5]),
  ...bush([-12, 0, -50], 0.7),
  ...bush([12.5, 0, -49.5], 0.6),
  { type: 'model', model: 'tree', pos: [-13, 0, -59] },
  { type: 'model', model: 'tree', pos: [13.5, 0, -60] },
];

const level: LevelDef = {
  id: 'funfair',
  name: 'Up, Up and Away',
  tagline: 'A bouquet of helium balloons, a funfair full of pointy things, and a birthday party waiting.',
  order: 10,
  cargo: 'balloons',
  cameraYaw: 0,
  spawn: { p1: [-0.75, 0, 21.5], p2: [0.75, 0, 21.5], cargo: [0, BOUQUET_Y, 21.5], yaw: 180 },
  goal: { pos: [0, TABLE_TOP + 0.3, TABLE_Z + 0.55], size: [0.72, 0.8, 1.5], label: 'ON THE PARTY TABLE' },
  checkpoints: [
    // after cactus corner; out of the Tunnel of Love
    { pos: [0, 1, -4.2], size: [6, 2, 2.4], spawn: { p1: [CP1_STAND[0] - 0.75, 0, CP1_STAND[1]], p2: [CP1_STAND[0] + 0.75, 0, CP1_STAND[1]], cargo: [CP1_STAND[0], BOUQUET_Y, CP1_STAND[1]], yaw: 180 } },
    { pos: [0, 1, -28.2], size: [6, 2, 2.4], spawn: { p1: [CP2_STAND[0] - 0.75, 0, CP2_STAND[1]], p2: [CP2_STAND[0] + 0.75, 0, CP2_STAND[1]], cargo: [CP2_STAND[0], BOUQUET_Y, CP2_STAND[1]], yaw: 180 } },
  ],
  killY: -6,
  // let go and it's gone: it rises past here (the movers carry it at about 1.1 m)
  ceilingY: 8,
  parTime: 150,
  objects,
  hints: ['Hold on: let go and it floats away!'],
  tips: [
    { pos: [0, 0, 14.5], radius: 2.2, text: 'Giant darts! Keep the balloons right of the stall' },
    { pos: [0, 0, 8.4], radius: 2.0, text: 'Steer the balloons round the cacti, not just your feet' },
    { pos: [0, 0, -5.8], radius: 2.0, text: 'Pins in the ceiling: no letting go (or jumping) in here!' },
    { pos: [0, 0, -30.2], radius: 2.0, text: 'Prickly hedgehogs: give them a wide berth' },
    { pos: [0, 0, -50.5], radius: 2.2, text: 'Set it on the party table: it gets tied on there' },
  ],
  theme: {
    sunDir: [0.4, 0.85, 0.45],
    skyTop: 0x4f9cf0,
    skyHorizon: 0xffe8d0,
    fog: 0xfbe6d6,
    hemiSky: 0xffeedd,
  },
};

export default level;
