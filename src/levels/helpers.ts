import * as THREE from 'three';
import type { BoxObj, CylinderObj, LevelObject, Surface, Vec3 } from './types';

/**
 * Small builders that expand into plain level data (boxes, cylinders...). Level
 * files call these so they read like a floor plan instead of a list of
 * hundreds of boxes.
 */

const DEG = 180 / Math.PI;

export function eulerDeg(q: THREE.Quaternion): Vec3 {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x * DEG, e.y * DEG, e.z * DEG];
}

type BoxExtra = Partial<Omit<BoxObj, 'type' | 'pos' | 'size' | 'rot'>>;

/**
 * A ramp whose TOP surface runs from `a` to `b` (each the centre of the top
 * edge). Always sits flush with whatever is at `a` and `b` — no lips.
 */
export function ramp(a: Vec3, b: Vec3, width: number, opts: BoxExtra & { thickness?: number } = {}): BoxObj {
  const { thickness = 0.4, ...rest } = opts;
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const L = d.length();
  const elev = Math.atan2(d.y, Math.hypot(d.x, d.z));
  const yaw = Math.atan2(d.x, d.z);
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -elev));
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  // extend a hair past both ends so it overlaps neighbouring floors
  const center = mid.addScaledVector(up, -thickness / 2);
  return { type: 'box', pos: [center.x, center.y, center.z], size: [width, thickness, L + 0.08], rot: eulerDeg(q), surface: 'wood', ...rest };
}

/** Direction (unit XZ) from a yaw in degrees (0 = +Z, 90 = +X). */
export function dirOf(yawDeg: number): [number, number] {
  const r = yawDeg / DEG;
  return [Math.sin(r), Math.cos(r)];
}

/**
 * Solid stairs. `start` = centre of the bottom step's front edge at floor
 * height; climbs toward `yawDeg`.
 */
export function stairs(start: Vec3, yawDeg: number, steps: number, rise: number, run: number, width: number, opts: BoxExtra = {}): BoxObj[] {
  const [dx, dz] = dirOf(yawDeg);
  const out: BoxObj[] = [];
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) * rise;
    const dist = (i + 0.5) * run;
    out.push({
      type: 'box',
      pos: [start[0] + dx * dist, start[1] + h / 2, start[2] + dz * dist],
      size: [width, h, run + 0.01],
      rot: [0, yawDeg, 0],
      radius: 0.025,
      surface: 'wood',
      ...opts,
    });
  }
  return out;
}

/**
 * A straight wall from a to b (floor level points) with optional door gaps.
 * doors: [centre fraction along the wall, width, height].
 */
export function wall(
  a: Vec3,
  b: Vec3,
  height: number,
  opts: BoxExtra & { thickness?: number; doors?: [number, number, number][]; lintel?: boolean } = {},
): BoxObj[] {
  const { thickness = 0.2, doors = [], lintel = true, ...rest } = opts;
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  d.y = 0;
  const L = d.length();
  const dir = d.clone().normalize();
  const yaw = Math.atan2(dir.x, dir.z) * DEG - 90; // box X runs along the wall
  const seg = (from: number, to: number, y0: number, y1: number): BoxObj | null => {
    if (to - from < 0.02 || y1 - y0 < 0.02) return null;
    const mid = A.clone().addScaledVector(dir, (from + to) / 2);
    return {
      type: 'box',
      pos: [mid.x, A.y + (y0 + y1) / 2, mid.z],
      size: [to - from, y1 - y0, thickness],
      rot: [0, yaw, 0],
      radius: 0.03,
      surface: 'plaster',
      ...rest,
    };
  };
  const out: BoxObj[] = [];
  const sorted = [...doors].sort((p, q) => p[0] - q[0]);
  let cursor = 0;
  for (const [f, w, h] of sorted) {
    const c = f * L;
    const s = seg(cursor, c - w / 2, 0, height);
    if (s) out.push(s);
    if (lintel) {
      const top = seg(c - w / 2, c + w / 2, h, height);
      if (top) out.push(top);
    }
    cursor = c + w / 2;
  }
  const last = seg(cursor, L, 0, height);
  if (last) out.push(last);
  return out;
}

/** A floor slab whose top is at y. */
export function floor(center: [number, number], y: number, size: [number, number], surface: Surface = 'wood', opts: BoxExtra & { thickness?: number } = {}): BoxObj {
  const { thickness = 0.4, ...rest } = opts;
  return { type: 'box', pos: [center[0], y - thickness / 2, center[1]], size: [size[0], thickness, size[1]], surface, ...rest };
}

/** A railing from a to b (floor-level points): posts + a top rail. */
export function railing(a: Vec3, b: Vec3, opts: { height?: number; color?: number; spacing?: number } = {}): LevelObject[] {
  const { height = 1.0, color = 0xf2f2ee, spacing = 1.2 } = opts;
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const L = A.distanceTo(B);
  const n = Math.max(1, Math.round(L / spacing));
  const out: LevelObject[] = [];
  for (let i = 0; i <= n; i++) {
    const p = A.clone().lerp(B, i / n);
    out.push({ type: 'cylinder', pos: [p.x, p.y + height / 2, p.z], radius: 0.045, height, color, segments: 10 } satisfies CylinderObj);
  }
  const d = B.clone().sub(A);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  // turn to face along the rail, then tilt with the slope (as one rotation, so it works in any direction)
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.x, d.z))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan2(d.y, Math.hypot(d.x, d.z))));
  out.push({ type: 'box', pos: [mid.x, mid.y + height, mid.z], size: [0.09, 0.09, L + 0.09], rot: eulerDeg(q), color, radius: 0.04 });
  return out;
}

/** Shift a list of objects by an offset (handy for re-using chunks). */
export function offset(objs: LevelObject[], by: Vec3): LevelObject[] {
  return objs.map((o) => ({ ...o, pos: [o.pos[0] + by[0], o.pos[1] + by[1], o.pos[2] + by[2]] as Vec3 }));
}

/** Scatter helper with a deterministic seed. */
export function scatter<T>(n: number, seed: number, fn: (r: () => number, i: number) => T): T[] {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: n }, (_, i) => fn(r, i));
}
