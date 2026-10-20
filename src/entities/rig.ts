import * as THREE from 'three';

/**
 * Body plan of a mover, in metres, in "rig space": origin at the torso centre,
 * +Y up, +Z forward (facing), +X to the character's LEFT.
 *
 * Proportions are Gang Beasts-ish: a big bean torso, a round head sitting on it
 * with no neck, stubby sausage limbs and mitten hands.
 */
export const RIG = {
  body: { r: 0.27, hh: 0.16, mass: 28 },
  head: { r: 0.22, y: 0.53, mass: 4.5 },
  neckY: 0.4,
  shoulder: { x: 0.3, y: 0.2 },
  upperArm: { L: 0.21, r: 0.075, mass: 2.2 },
  foreArm: { L: 0.19, r: 0.068, mass: 1.6 },
  /** Mitten hand: a ball on the end of the forearm. */
  hand: { r: 0.095, offset: 0.05, mass: 0.45 },
  hip: { x: 0.13, y: -0.3 },
  thigh: { L: 0.2, r: 0.09, mass: 3.5 },
  shin: { L: 0.19, r: 0.085, mass: 2.4 },
  foot: { r: 0.07, len: 0.16, fwd: 0.05, down: 0.05 },
} as const;

export type PartName = 'body' | 'head' | 'uArmL' | 'lArmL' | 'uArmR' | 'lArmR' | 'thighL' | 'shinL' | 'thighR' | 'shinR';
export type JointName = 'neck' | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR' | 'hipL' | 'kneeL' | 'hipR' | 'kneeR';

export const PART_NAMES: PartName[] = ['body', 'head', 'uArmL', 'lArmL', 'uArmR', 'lArmR', 'thighL', 'shinL', 'thighR', 'shinR'];

const R = RIG;
/** Rest-pose centre of every part in rig space. */
export function partRestCenter(name: PartName): THREE.Vector3 {
  const s = name.endsWith('L') ? 1 : -1;
  switch (name) {
    case 'body':
      return new THREE.Vector3(0, 0, 0);
    case 'head':
      return new THREE.Vector3(0, R.head.y, 0);
    case 'uArmL':
    case 'uArmR':
      return new THREE.Vector3(s * R.shoulder.x, R.shoulder.y - R.upperArm.L / 2, 0);
    case 'lArmL':
    case 'lArmR':
      return new THREE.Vector3(s * R.shoulder.x, R.shoulder.y - R.upperArm.L - R.foreArm.L / 2, 0);
    case 'thighL':
    case 'thighR':
      return new THREE.Vector3(s * R.hip.x, R.hip.y - R.thigh.L / 2, 0);
    case 'shinL':
    case 'shinR':
      return new THREE.Vector3(s * R.hip.x, R.hip.y - R.thigh.L - R.shin.L / 2, 0);
  }
}

/** Hand centre in forearm-local space. */
export const HAND_LOCAL = new THREE.Vector3(0, -R.foreArm.L / 2 - R.hand.offset, 0);
/** Arm length from shoulder to hand centre. */
export const ARM_UPPER = R.upperArm.L;
export const ARM_LOWER = R.foreArm.L + R.hand.offset;
export const ARM_REACH = ARM_UPPER + ARM_LOWER;
/** Sole of the foot below the torso centre in the rest pose. */
export const SOLE_DEPTH = -R.hip.y + R.thigh.L + R.shin.L + R.foot.down + R.foot.r;
