import * as THREE from 'three';
import type { BoxObj, CylinderObj, LevelObject, SignObj, TriggerZone, Vec3 } from './types';
import { eulerDeg, railing, ramp } from './helpers';
import { PALETTE } from '../render/materials';
import { Balloons } from '../entities/cargo/Balloons';

/**
 * Prefabs: little bundles of level objects (a truck, a table, windows...).
 * Positions are given in the prefab's own frame and rotated by `yaw` (deg).
 */

function frame(origin: Vec3, yawDeg: number) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (yawDeg * Math.PI) / 180);
  const o = new THREE.Vector3(...origin);
  return {
    p: (x: number, y: number, z: number): Vec3 => {
      const v = new THREE.Vector3(x, y, z).applyQuaternion(q).add(o);
      return [v.x, v.y, v.z];
    },
    yaw: yawDeg,
  };
}

/**
 * A moving truck with an open back and a ramp. `back` = centre of the ramp's
 * foot on the street; the truck points along `yawDeg` (0 = +Z).
 * Returns the objects plus the goal zone inside the cargo box.
 */
export function movingTruck(
  back: Vec3,
  yawDeg: number,
  opts: { color?: number; ramp?: boolean; rampWidth?: number; rampLength?: number; rampRails?: boolean; logo?: string } = {},
) {
  const f = frame(back, yawDeg);
  const y = yawDeg;
  const white = 0xf6f3ec;
  const color = opts.color ?? 0xff7a3d;
  const rampLen = opts.rampLength ?? 3.4;
  const z0 = rampLen; // back edge of the cargo floor
  const L = 5;
  const floorY = 1.1;
  const objs: LevelObject[] = [];
  const box = (pos: Vec3, size: Vec3, c: number, extra: Partial<BoxObj> = {}) =>
    objs.push({ type: 'box', pos: f.p(...pos), size, rot: [0, y, 0], color: c, ...extra } as BoxObj);
  box([0, 0.7, z0 + 3.6], [2.3, 0.5, 7.4], 0x3b3f4a, { surface: 'metal' });
  box([0, floorY - 0.06, z0 + L / 2], [2.4, 0.12, L], 0xc9c6c0, { surface: 'metal' });
  box([-1.18, floorY + 1.1, z0 + L / 2], [0.12, 2.2, L], white, { surface: 'paint' });
  box([1.18, floorY + 1.1, z0 + L / 2], [0.12, 2.2, L], white, { surface: 'paint' });
  box([0, floorY + 1.1, z0 + L - 0.06], [2.4, 2.2, 0.12], white, { surface: 'paint' });
  // stripe + cab
  box([-1.25, floorY + 0.35, z0 + L / 2], [0.03, 0.3, L], color, { collide: false, radius: 0.01 });
  box([1.25, floorY + 0.35, z0 + L / 2], [0.03, 0.3, L], color, { collide: false, radius: 0.01 });
  box([0, 1.85, z0 + L + 1.05], [2.3, 1.7, 2.0], color, { radius: 0.18 });
  box([0, 2.25, z0 + L + 2.06], [2.0, 0.65, 0.04], 0x9fdcf2, { collide: false, radius: 0.02 });
  box([-1.16, 2.25, z0 + L + 1.1], [0.04, 0.6, 1.2], 0x9fdcf2, { collide: false, radius: 0.02 });
  box([1.16, 2.25, z0 + L + 1.1], [0.04, 0.6, 1.2], 0x9fdcf2, { collide: false, radius: 0.02 });
  box([0, 0.7, z0 + L + 2.1], [2.4, 0.3, 0.2], 0xd8d8d8, { surface: 'metal' });
  for (const sx of [-0.8, 0.8]) box([sx, 1.15, z0 + L + 2.06], [0.35, 0.18, 0.05], 0xfff3b0, { collide: false, radius: 0.03 });
  // wheels
  for (const wz of [z0 + 1.0, z0 + 2.3, z0 + L + 1.2])
    for (const sx of [-1.15, 1.15])
      objs.push({ type: 'cylinder', pos: f.p(sx, 0.45, wz), radius: 0.45, height: 0.35, rot: [0, y, 90], color: 0x24242c, collide: false } as CylinderObj);
  // logo on both sides
  const logo = opts.logo ?? 'FRAGILE FREIGHT CO.\nwe try our best';
  for (const s of [-1, 1])
    objs.push({
      type: 'sign',
      pos: f.p(s * 1.26, floorY + 1.35, z0 + L / 2),
      size: [3.6, 1.0, 0.02],
      rot: [0, y + s * 90, 0],
      text: logo,
      color: white,
      textColor: '#ff6b2c',
    } as SignObj);
  const rw = opts.rampWidth ?? 1.7;
  if (opts.ramp !== false) objs.push(ramp(f.p(0, 0, 0.05), f.p(0, floorY, z0 + 0.05), rw, { surface: 'metal', thickness: 0.12 }));
  if (opts.ramp !== false && opts.rampRails)
    for (const sx of [-1, 1]) objs.push(...railing(f.p(sx * (rw / 2 - 0.04), 0, 0.3), f.p(sx * (rw / 2 - 0.04), floorY * ((z0 - 0.2) / z0), z0 - 0.2), { height: 0.95, color: 0xd8d8d8, spacing: 1.1 }));
  const c = f.p(0, floorY + 1.0, z0 + L / 2);
  const goal: TriggerZone = { pos: c, size: yawDeg % 180 === 0 ? [2.1, 2, L - 0.4] : [L - 0.4, 2, 2.1] };
  return { objs, goal };
}

/** A window on a wall: glass + white frame. `center` on the wall surface, facing `yaw`. */
export function windowPane(center: Vec3, yawDeg: number, w = 1.2, h = 1.4): LevelObject[] {
  const f = frame(center, yawDeg);
  const out: LevelObject[] = [];
  out.push({ type: 'box', pos: f.p(0, 0, 0), size: [w, h, 0.04], rot: [0, yawDeg, 0], color: 0x9fd6ee, collide: false, radius: 0.01 });
  for (const [x, yy, ww, hh] of [
    [0, h / 2, w + 0.12, 0.1],
    [0, -h / 2, w + 0.2, 0.12],
    [-w / 2, 0, 0.1, h],
    [w / 2, 0, 0.1, h],
    [0, 0, 0.06, h],
  ])
    out.push({ type: 'box', pos: f.p(x, yy, 0.03), size: [ww, hh, 0.08], rot: [0, yawDeg, 0], color: 0xfbfaf6, collide: false, radius: 0.015 });
  return out;
}

/** A picture frame on a wall (decor). */
export function picture(center: Vec3, yawDeg: number, w = 0.7, h = 0.5, color = 0x7cc4a4): LevelObject[] {
  const f = frame(center, yawDeg);
  return [
    { type: 'box', pos: f.p(0, 0, 0.02), size: [w + 0.08, h + 0.08, 0.04], rot: [0, yawDeg, 0], color: 0x8a5a36, collide: false, radius: 0.01 },
    { type: 'box', pos: f.p(0, 0, 0.045), size: [w, h, 0.01], rot: [0, yawDeg, 0], color, collide: false, radius: 0.005 },
    { type: 'ball', pos: f.p(w * 0.15, h * 0.1, 0.05), radius: Math.min(w, h) * 0.18, color: 0xffd36b, collide: false },
  ];
}

/** Table: top + 4 legs. pos = floor centre. */
export function table(pos: Vec3, size: [number, number, number], color = PALETTE.woodDark, yawDeg = 0): LevelObject[] {
  const [w, h, d] = size;
  const f = frame(pos, yawDeg);
  const out: LevelObject[] = [{ type: 'box', pos: f.p(0, h - 0.04, 0), size: [w, 0.08, d], rot: [0, yawDeg, 0], color, surface: 'wood', radius: 0.03 }];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      out.push({ type: 'box', pos: f.p(sx * (w / 2 - 0.07), (h - 0.08) / 2, sz * (d / 2 - 0.07)), size: [0.08, h - 0.08, 0.08], rot: [0, yawDeg, 0], color, radius: 0.02 });
  return out;
}

/** A solid counter/cabinet block with a contrasting top. pos = floor centre. */
export function counter(pos: Vec3, size: [number, number, number], color = 0xf2ede4, top = 0x8a5a36, yawDeg = 0): LevelObject[] {
  const [w, h, d] = size;
  const f = frame(pos, yawDeg);
  return [
    { type: 'box', pos: f.p(0, (h - 0.05) / 2, 0), size: [w, h - 0.05, d], rot: [0, yawDeg, 0], color, radius: 0.03 },
    { type: 'box', pos: f.p(0, h - 0.025, 0), size: [w + 0.06, 0.05, d + 0.06], rot: [0, yawDeg, 0], color: top, surface: 'wood', radius: 0.02 },
  ];
}

/** A rug lying on the floor (visual only). */
export function rug(pos: Vec3, size: [number, number], color = PALETTE.carpet, yawDeg = 0): BoxObj {
  return { type: 'box', pos: [pos[0], pos[1] + 0.012, pos[2]], size: [size[0], 0.02, size[1]], rot: [0, yawDeg, 0], color, surface: 'carpet', collide: false, radius: 0.01, castShadow: false };
}

/** A cartoony bush: a few overlapping balls. */
export function bush(pos: Vec3, r = 0.6, color = PALETTE.grassDark): LevelObject[] {
  return [
    { type: 'ball', pos: [pos[0], pos[1] + r * 0.7, pos[2]], radius: r, color },
    { type: 'ball', pos: [pos[0] + r * 0.6, pos[1] + r * 0.5, pos[2] + r * 0.2], radius: r * 0.7, color, collide: false },
    { type: 'ball', pos: [pos[0] - r * 0.5, pos[1] + r * 0.45, pos[2] - r * 0.3], radius: r * 0.65, color, collide: false },
  ];
}

/** A simple picket fence between two floor points. */
export function fence(a: Vec3, b: Vec3, color = 0xfbfaf6, h = 0.9): LevelObject[] {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const n = Math.max(1, Math.round(L / 0.35));
  const yaw = (Math.atan2(B.x - A.x, B.z - A.z) * 180) / Math.PI;
  const out: LevelObject[] = [];
  for (let i = 0; i <= n; i++) {
    const p = A.clone().lerp(B, i / n);
    out.push({ type: 'box', pos: [p.x, p.y + h / 2, p.z], size: [0.08, h, 0.05], rot: [0, yaw, 0], color, collide: false, radius: 0.02 });
  }
  const mid = A.clone().add(B).multiplyScalar(0.5);
  for (const yy of [0.3, 0.7]) out.push({ type: 'box', pos: [mid.x, mid.y + yy * h, mid.z], size: [0.04, 0.07, L], rot: [0, yaw, 0], color, radius: 0.015 });
  // one invisible collider for the whole fence
  out.push({ type: 'box', pos: [mid.x, mid.y + h / 2, mid.z], size: [0.12, h, L], rot: [0, yaw, 0], visible: false });
  return out;
}

/** Zebra crossing stripes across a road. `center` on the road surface; stripes run along `yawDeg`. */
export function crosswalk(center: Vec3, yawDeg: number, roadWidth: number, depth = 3): LevelObject[] {
  const f = frame(center, yawDeg);
  const out: LevelObject[] = [];
  const n = Math.floor(roadWidth / 0.9);
  for (let i = 0; i < n; i++) {
    const x = -roadWidth / 2 + 0.45 + i * 0.9;
    out.push({ type: 'box', pos: f.p(x, 0.006, 0), size: [0.5, 0.012, depth], rot: [0, yawDeg, 0], color: 0xf6f6f2, collide: false, radius: 0.004, castShadow: false });
  }
  return out;
}

/** Dashed centre line along a road. */
export function roadLine(a: Vec3, b: Vec3, color = 0xffd23f): LevelObject[] {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const yaw = (Math.atan2(B.x - A.x, B.z - A.z) * 180) / Math.PI;
  const out: LevelObject[] = [];
  for (let s = 0.5; s < L; s += 3) {
    const p = A.clone().lerp(B, s / L);
    out.push({ type: 'box', pos: [p.x, p.y + 0.006, p.z], size: [0.18, 0.012, 1.5], rot: [0, yaw, 0], color, collide: false, radius: 0.004, castShadow: false });
  }
  return out;
}

/** A floating-island chunk: a slab with a chunky rocky underside (HFF style). */
export function island(center: Vec3, size: [number, number], surface: BoxObj['surface'] = 'grass', depth = 3): LevelObject[] {
  const [w, d] = size;
  const [x, y, z] = center;
  return [
    { type: 'box', pos: [x, y - 0.25, z], size: [w, 0.5, d], surface, radius: 0.12 },
    { type: 'box', pos: [x, y - 0.5 - depth / 2, z], size: [w - 0.6, depth, d - 0.6], color: 0xb8a48e, surface: 'concrete', radius: 0.4, collide: false },
    { type: 'box', pos: [x, y - 0.5 - depth - 0.8, z], size: [w * 0.6, 1.6, d * 0.6], color: 0xa8937d, surface: 'concrete', radius: 0.5, collide: false },
  ];
}

// ---------------------------------------------------------------- the painting (job 9, random jobs)

const DEG = Math.PI / 180;

// the painting waits in a padded slot on a low stand, leaning back a little: its
// middle is below the movers' hands, so they hold it above its middle and it hangs
// steady; nothing stands behind it, so it can be carried off in any direction
export const PAINT_TILT = 8;
const LEDGE = 0.1; // the slot's floor
const SLOT = 0.105; // the slot's width (the frame is 0.09 deep)
const RAIL = 0.1; // the slot's sides (a pick-up lifts it well clear of them)
const PH = 1.25;
const PD = 0.09;
export const PAINT_Y = LEDGE + (PH / 2) * Math.cos(PAINT_TILT * DEG) + (PD / 2) * Math.sin(PAINT_TILT * DEG) + 0.01;
/** The painting's centre sits this far back (-Z) of the slot it stands in (it leans back). */
export const PAINT_DZ = -(PH / 2) * Math.sin(PAINT_TILT * DEG);

/** A box from a to b (legs, masts, struts). */
export function beam(a: Vec3, b: Vec3, t: number, color: number, extra: Partial<LevelObject> = {}): LevelObject {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  const m = A.clone().add(B).multiplyScalar(0.5);
  return { type: 'box', pos: [m.x, m.y, m.z], size: [t, A.distanceTo(B), t], rot: eulerDeg(q), color, radius: t * 0.3, collide: false, ...extra } as LevelObject;
}

/**
 * A painting stand at floor point (x, y, z): a low board with a padded slot that
 * the painting (facing +Z) stands in, and a knob at each end. The painting's
 * centre goes at [x, y + PAINT_Y, z + PAINT_DZ], tilted back PAINT_TILT degrees.
 */
export function paintingStand(x: number, y: number, z: number, color = 0x8a5a36): LevelObject[] {
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
export function galleryEasel(x: number, y: number, z: number): LevelObject[] {
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

// ---------------------------------------------------------------- the balloons (job 10, random jobs)

/** Top of a balloon stand. */
export const BALLOON_STAND = 0.86;
/** The bouquet's present, sitting on a stand. */
export const BOUQUET_Y = BALLOON_STAND + Balloons.sitHeight + 0.005;

/** A balloon stand at floor point (x, y, z): a slim post with a little plate the bouquet's present gets tied to. */
export function balloonStand(x: number, y: number, z: number): LevelObject[] {
  return [
    { type: 'cylinder', pos: [x, y + 0.03, z], radius: 0.28, height: 0.06, color: 0x5b3a22, segments: 18 },
    { type: 'cylinder', pos: [x, y + BALLOON_STAND / 2, z], radius: 0.05, height: BALLOON_STAND, color: 0xe9e4da, segments: 10 },
    { type: 'box', pos: [x, y + BALLOON_STAND - 0.02, z], size: [0.44, 0.04, 0.38], color: 0xff8fab, radius: 0.012, tie: true },
  ];
}
