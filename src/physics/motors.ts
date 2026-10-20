import * as THREE from 'three';
import { RAPIER } from './rapier';
import type { ImpulseJoint } from './rapier';

/**
 * Rapier builds spherical joints as generic 6-DOF joints, so the JS wrapper
 * class has no motor methods. The raw joint set exposes per-axis motors for any
 * joint, so we call those directly.
 *
 * An angular motor on axis k drives the k-th imaginary component of the joint's
 * relative rotation quaternion toward sin(target/2). Feeding it 2·asin(q.k) of a
 * desired relative rotation q (with q.w >= 0) therefore steers the joint to q.
 */
interface RawJointSet {
  jointConfigureMotorPosition(h: number, axis: number, target: number, stiffness: number, damping: number): void;
  jointConfigureMotorModel(h: number, axis: number, model: number): void;
  jointSetMotorMaxForce(h: number, axis: number, maxForce: number): void;
  jointSetLimits(h: number, axis: number, min: number, max: number): void;
}

const raw = (j: ImpulseJoint) => (j as unknown as { rawSet: RawJointSet }).rawSet;

const ANG = [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ];

export function setMotorMaxForce(j: ImpulseJoint, maxTorque: number) {
  const r = raw(j);
  for (const a of ANG) r.jointSetMotorMaxForce(j.handle, a, maxTorque);
}

export function setMotorModelAccel(j: ImpulseJoint) {
  const r = raw(j);
  for (const a of ANG) r.jointConfigureMotorModel(j.handle, a, RAPIER.MotorModel.AccelerationBased);
}

/** Never ask for more than ~130° from the joint's neutral frame — the motor gets unstable near 180°. */
const MAX_HALF = Math.sin((130 * Math.PI) / 180 / 2);

/**
 * Drive a spherical joint toward relative rotation `q` (child expressed in the
 * parent's joint frame).
 */
export function driveSpherical(j: ImpulseJoint, q: THREE.Quaternion, stiffness: number, damping: number) {
  let { x, y, z, w } = q;
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
  }
  const r = raw(j);
  const h = j.handle;
  r.jointConfigureMotorPosition(h, RAPIER.JointAxis.AngX, 2 * Math.asin(clampHalf(x)), stiffness, damping);
  r.jointConfigureMotorPosition(h, RAPIER.JointAxis.AngY, 2 * Math.asin(clampHalf(y)), stiffness, damping);
  r.jointConfigureMotorPosition(h, RAPIER.JointAxis.AngZ, 2 * Math.asin(clampHalf(z)), stiffness, damping);
}

function clampHalf(v: number) {
  return v > MAX_HALF ? MAX_HALF : v < -MAX_HALF ? -MAX_HALF : v;
}
