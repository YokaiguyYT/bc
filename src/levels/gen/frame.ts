import * as THREE from 'three';
import type { LevelObject, Vec3 } from '../types';
import { eulerDeg } from '../helpers';

const DEG = Math.PI / 180;

/**
 * Where a course piece sits: pieces are written in their own little frame
 * (entry at the origin, floor at y 0, heading toward -Z, +X on the right) and
 * this turns that into level coordinates. Courses head north (-Z), west (-X)
 * or east (+X), never back toward the camera.
 */
export class Frame {
  readonly c: number;
  readonly s: number;
  constructor(
    readonly origin: Vec3,
    /** Degrees: 0 = north (-Z), 90 = west (-X), -90 = east (+X). */
    readonly heading: number,
  ) {
    this.c = Math.cos(heading * DEG);
    this.s = Math.sin(heading * DEG);
  }

  /** A point. */
  p(x: number, y: number, z: number): Vec3 {
    const [ox, oy, oz] = this.origin;
    return [r3(ox + x * this.c + z * this.s), r3(oy + y), r3(oz - x * this.s + z * this.c)];
  }

  /** A direction or an offset (no translation). */
  v(x: number, y: number, z: number): Vec3 {
    return [r3(x * this.c + z * this.s), y, r3(-x * this.s + z * this.c)];
  }

  /** A yaw (degrees). */
  yaw(local: number) {
    return local + this.heading;
  }

  /** The yaw (degrees, 0 = +Z) of a local direction, as stairs() and spawns want it. */
  yawOf(x: number, z: number) {
    const [wx, , wz] = this.v(x, 0, z);
    return (Math.atan2(wx, wz) * 180) / Math.PI;
  }

  /** A whole object written in local coordinates (position and rotation; hazard params are the piece's job). */
  obj<T extends LevelObject>(o: T): T {
    const out = { ...o, pos: this.p(o.pos[0], o.pos[1], o.pos[2]) };
    if (this.heading === 0) return out;
    const local = o.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rot[0] * DEG, o.rot[1] * DEG, o.rot[2] * DEG, 'XYZ')) : new THREE.Quaternion();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading * DEG).multiply(local);
    out.rot = eulerDeg(q);
    return out;
  }

  /** The frame `length` metres ahead, shifted `dx` sideways and `dy` up, turned by `turn` degrees. */
  next(length: number, dx = 0, dy = 0, turn = 0) {
    return new Frame(this.p(dx, dy, -length), this.heading + turn);
  }
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
