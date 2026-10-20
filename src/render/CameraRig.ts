import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { clamp, damp, wrapAngle } from '../util/math';

const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * One shared camera for both movers: it orbits at a fixed pitch, frames every
 * point of interest (players + cargo), zooms out as they spread apart, and can
 * be spun with Q/E.
 */
export class CameraRig {
  yaw = 0;
  private yawVel = 0;
  private focus = new THREE.Vector3();
  private distance = 12;
  private shake = 0;
  private shakeT = 0;
  /** Extra zoom-out the level can request (e.g. big open areas). */
  zoomBias = 0;
  private initialized = false;

  constructor(public camera: THREE.PerspectiveCamera) {}

  /** Snap instantly (on level start / respawn). */
  reset(yawDeg: number, points: THREE.Vector3[]) {
    this.yaw = (yawDeg * Math.PI) / 180;
    this.yawVel = 0;
    this.initialized = false;
    this.update(1 / 60, points, 0, true);
  }

  addShake(amount: number) {
    this.shake = Math.min(0.6, this.shake + amount);
  }

  /** World-space direction for "up on the keyboard" (away from the camera). */
  forward(out: THREE.Vector3) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out: THREE.Vector3) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt: number, points: THREE.Vector3[], rotate: number, snap = false) {
    const T = tuning.camera;
    // yaw: Q/E spin with a little inertia
    const targetVel = rotate * ((T.rotateSpeed * Math.PI) / 180);
    this.yawVel = damp(this.yawVel, targetVel, 10, dt);
    this.yaw = wrapAngle(this.yaw + this.yawVel * dt);

    const pitch = (T.pitch * Math.PI) / 180;
    this.camera.fov = T.fov;
    // camera basis for this yaw/pitch
    _fwd.set(-Math.sin(this.yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(this.yaw) * Math.cos(pitch)); // view dir
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _up.crossVectors(_right, _fwd).normalize();

    // centroid
    const c = _v.set(0, 0, 0);
    if (points.length) {
      for (const p of points) c.add(p);
      c.multiplyScalar(1 / points.length);
    }
    // extents in view space
    let ex = 0;
    let ey = 0;
    let ez = 0;
    for (const p of points) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const dz = p.z - c.z;
      ex = Math.max(ex, Math.abs(dx * _right.x + dy * _right.y + dz * _right.z));
      ey = Math.max(ey, Math.abs(dx * _up.x + dy * _up.y + dz * _up.z));
      ez = Math.max(ez, Math.abs(dx * _fwd.x + dy * _fwd.y + dz * _fwd.z));
    }
    const vfov = (T.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const pad = T.padding;
    const need = Math.max((ex + pad) / Math.tan(hfov / 2), (ey + pad) / Math.tan(vfov / 2)) + ez;
    const dist = clamp(need + this.zoomBias, T.minDistance, T.maxDistance);

    if (snap || !this.initialized) {
      this.focus.copy(c);
      this.distance = dist;
      this.initialized = true;
    } else {
      const k = T.follow;
      this.focus.x = damp(this.focus.x, c.x, k, dt);
      this.focus.y = damp(this.focus.y, c.y, k * 0.7, dt);
      this.focus.z = damp(this.focus.z, c.z, k, dt);
      // zoom out faster than in, so nobody leaves the screen
      this.distance = damp(this.distance, dist, dist > this.distance ? k * 1.4 : k * 0.5, dt);
    }

    const pos = this.camera.position.copy(this.focus).addScaledVector(_fwd, -this.distance);
    if (this.shake > 0.001) {
      this.shakeT += dt * 40;
      const s = this.shake * this.shake;
      pos.x += Math.sin(this.shakeT * 1.3) * s * 0.6;
      pos.y += Math.sin(this.shakeT * 1.7 + 1) * s * 0.6;
      pos.z += Math.sin(this.shakeT * 1.1 + 2) * s * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.6);
    }
    this.camera.lookAt(this.focus);
    this.camera.updateProjectionMatrix();
  }

  get focusPoint() {
    return this.focus;
  }

  get currentDistance() {
    return this.distance;
  }
}
