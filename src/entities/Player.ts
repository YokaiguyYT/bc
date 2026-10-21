import * as THREE from 'three';
import { RAPIER } from '../physics/rapier';
import type { RigidBody, Collider, ImpulseJoint } from '../physics/rapier';
import { G, groups, playerArmBit, playerBodyBit, SOLID, STANDABLE } from '../physics/groups';
import { driveSpherical, setMotorMaxForce, setMotorModelAccel } from '../physics/motors';
import { tuning } from '../config/tuning';
import type { Sim } from '../game/Sim';
import {
  ARM_LOWER,
  ARM_REACH,
  ARM_UPPER,
  HAND_LOCAL,
  JointName,
  PART_NAMES,
  PartName,
  RIG,
  partRestCenter,
} from './rig';
import { clamp, DOWN, quatToRotVec, smoothstep, wrapAngle, X_AXIS, Y_AXIS, Z_AXIS } from '../util/math';

export interface Intent {
  /** World-space XZ move direction, length 0..1 (camera-relative already). */
  moveX: number;
  moveZ: number;
  jump: boolean;
  jumpPressed: boolean;
  grab: boolean;
}

export interface Grip {
  side: 0 | 1;
  collider: Collider;
  /** null for colliders with no parent (static world). */
  body: RigidBody | null;
  isStatic: boolean;
  /** Grip point in the target body's local frame (world frame if static). */
  local: THREE.Vector3;
  /** Torso-local anchor the grip spring pulls toward, animated start -> goal. */
  anchorStart: THREE.Vector3;
  anchorGoal: THREE.Vector3;
  anchor: THREE.Vector3;
  t: number;
  slip: number;
  owner: unknown;
  kind: string;
  /** Stretch of the grip spring last step (m). */
  stretch: number;
}

interface Hand {
  side: 0 | 1;
  grip: Grip | null;
  /** World point the hand is reaching for (null = not reaching). */
  reach: THREE.Vector3 | null;
  reachVel: THREE.Vector3;
}

export type PlayerState = 'active' | 'knocked' | 'gettingUp';

const PROBE_R = 0.16;
const IDQ = { x: 0, y: 0, z: 0, w: 1 };
const DOWN_V = { x: 0, y: -1, z: 0 };
const SHOULDER_FRAME = new THREE.Quaternion().setFromAxisAngle(X_AXIS, -Math.PI / 3);

// scratch
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _g = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _qx = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _qg = new THREE.Quaternion();
const _hv = new THREE.Vector3();

export interface PlayerOptions {
  index: number;
  name: string;
  color: number;
  /** Feet position. */
  position: THREE.Vector3;
  yaw?: number;
  /** NPCs are wobblier and can't grab. */
  npc?: boolean;
}

export class Player {
  readonly index: number;
  readonly name: string;
  readonly color: number;
  readonly npc: boolean;
  readonly bodyBit: number;
  readonly armBit: number;
  parts = {} as Record<PartName, RigidBody>;
  joints = {} as Record<JointName, ImpulseJoint>;
  private frameInv = {} as Record<JointName, THREE.Quaternion>;
  ownColliders = new Set<number>();
  totalMass = 0;

  state: PlayerState = 'active';
  stateTime = 0;
  intent: Intent = { moveX: 0, moveZ: 0, jump: false, jumpPressed: false, grab: false };
  /** Multiplier for balance gains (NPC drunk guy uses < 1). */
  balanceScale = 1;
  speedScale = 1;

  // ground
  grounded = false;
  groundDist = 99;
  groundBody: RigidBody | null = null;
  groundCollider: Collider | null = null;
  groundPoint = new THREE.Vector3();
  groundNormal = new THREE.Vector3(0, 1, 0);
  groundVel = new THREE.Vector3();
  groundFriction = 0.8;
  airTime = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpCooldown = 0;
  private springOff = 0;
  private fallTimer = 0;
  private stepAccum = 0;
  facingYaw = 0;
  gaitPhase = 0;
  speedNorm = 0;
  /** How low the current reach target is (0..1) — makes the mover bend down. */
  private reachLow = 0;
  private flail = 0;

  hands: [Hand, Hand] = [
    { side: 0, grip: null, reach: null, reachVel: new THREE.Vector3() },
    { side: 1, grip: null, reach: null, reachVel: new THREE.Vector3() },
  ];
  /** Rotation of each held body relative to our torso at grab time (body handle -> quat). */
  /** Held body orientation relative to our heading (yaw only — not our lean or waddle). */
  private holdRel = new Map<number, THREE.Quaternion>();
  /** Bodies we let go of that still overlap us: collisions stay off until we separate. */
  private ghosts: { body: RigidBody; t: number }[] = [];

  // impact detection
  private vPre = new THREE.Vector3();
  private vyPre = 0;
  lastImpact = 0;
  /** Landing squash amount for visuals (set on landing, decays in the rig). */
  landSquash = 0;
  respawnProtect = 0;
  /** Keeps the cached motor max-force in sync with the dev panel. */
  private motorCache = { arms: -1, legs: -1, head: -1 };

  // cached per-step transforms
  readonly bodyPos = new THREE.Vector3();
  readonly bodyQ = new THREE.Quaternion();
  private bodyQInv = new THREE.Quaternion();
  readonly bodyVel = new THREE.Vector3();

  constructor(
    private sim: Sim,
    opts: PlayerOptions,
  ) {
    this.index = opts.index;
    this.name = opts.name;
    this.color = opts.color;
    this.npc = !!opts.npc;
    this.bodyBit = playerBodyBit(opts.index);
    this.armBit = playerArmBit(opts.index);
    this.facingYaw = opts.yaw ?? 0;
    this.build(opts.position, this.facingYaw);
  }

  // ---------------------------------------------------------------- building

  private build(feet: THREE.Vector3, yaw: number) {
    const world = this.sim.physics.world;
    const yq = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
    const origin = feet.clone().add(new THREE.Vector3(0, tuning.float.rideHeight, 0));

    const bodyFilter = SOLID & ~(this.bodyBit | this.armBit);
    // Arms skip cargo/props so held things don't fight the hands.
    const armFilter = (G.STATIC | G.P1 | G.P2 | G.P1_ARM | G.P2_ARM | G.NPC | G.HAZARD) & ~(this.bodyBit | this.armBit);
    const bodyGroups = groups(this.bodyBit, bodyFilter);
    const armGroups = groups(this.armBit, armFilter);

    const mk = (name: PartName, colliders: { desc: InstanceType<typeof RAPIER.ColliderDesc>; arm?: boolean }[]) => {
      const p = partRestCenter(name).applyQuaternion(yq).add(origin);
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: yq.x, y: yq.y, z: yq.z, w: yq.w })
        .setLinearDamping(0.05)
        .setAngularDamping(name === 'body' ? 0.6 : 1.2)
        .setCanSleep(false);
      if (name === 'body') desc.setCcdEnabled(true);
      const rb = world.createRigidBody(desc);
      for (const c of colliders) {
        c.desc.setCollisionGroups(c.arm ? armGroups : bodyGroups).setFriction(name.startsWith('shin') ? 0.4 : 0.6);
        const col = world.createCollider(c.desc, rb);
        this.ownColliders.add(col.handle);
        this.sim.physics.setInfo(col, { kind: this.npc ? 'npc' : 'player', owner: this, material: 'body' });
      }
      this.parts[name] = rb;
      this.totalMass += rb.mass();
      return rb;
    };

    const C = RAPIER.ColliderDesc;
    mk('body', [{ desc: C.capsule(RIG.body.hh, RIG.body.r).setMass(RIG.body.mass) }]);
    mk('head', [{ desc: C.ball(RIG.head.r).setMass(RIG.head.mass) }]);
    for (const s of ['L', 'R'] as const) {
      mk(`uArm${s}`, [{ desc: C.capsule(RIG.upperArm.L / 2, RIG.upperArm.r).setMass(RIG.upperArm.mass), arm: true }]);
      mk(`lArm${s}`, [
        { desc: C.capsule(RIG.foreArm.L / 2, RIG.foreArm.r).setMass(RIG.foreArm.mass), arm: true },
        { desc: C.ball(RIG.hand.r).setTranslation(HAND_LOCAL.x, HAND_LOCAL.y, HAND_LOCAL.z).setMass(RIG.hand.mass), arm: true },
      ]);
      mk(`thigh${s}`, [{ desc: C.capsule(RIG.thigh.L / 2, RIG.thigh.r).setMass(RIG.thigh.mass) }]);
      const footY = -RIG.shin.L / 2 - RIG.foot.down;
      mk(`shin${s}`, [
        { desc: C.capsule(RIG.shin.L / 2, RIG.shin.r).setMass(RIG.shin.mass) },
        {
          desc: C.capsule(RIG.foot.len / 2, RIG.foot.r)
            .setTranslation(0, footY, RIG.foot.fwd)
            .setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
            .setMass(0.5),
        },
      ]);
    }

    const joint = (name: JointName, p1: PartName, p2: PartName, anchorRig: THREE.Vector3, frame?: THREE.Quaternion) => {
      const c1 = partRestCenter(p1);
      const c2 = partRestCenter(p2);
      const a1 = anchorRig.clone().sub(c1);
      const a2 = anchorRig.clone().sub(c2);
      const data = RAPIER.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: a2.x, y: a2.y, z: a2.z });
      const j = world.createImpulseJoint(data, this.parts[p1], this.parts[p2], true);
      if (frame) j.setLocalFrame1({ x: a1.x, y: a1.y, z: a1.z }, { x: frame.x, y: frame.y, z: frame.z, w: frame.w });
      j.setContactsEnabled(false);
      setMotorModelAccel(j);
      this.joints[name] = j;
      this.frameInv[name] = frame ? frame.clone().invert() : new THREE.Quaternion();
    };

    joint('neck', 'body', 'head', new THREE.Vector3(0, RIG.neckY, 0));
    for (const s of ['L', 'R'] as const) {
      const sx = s === 'L' ? 1 : -1;
      joint(`shoulder${s}`, 'body', `uArm${s}`, new THREE.Vector3(sx * RIG.shoulder.x, RIG.shoulder.y, 0), SHOULDER_FRAME);
      joint(`elbow${s}`, `uArm${s}`, `lArm${s}`, new THREE.Vector3(sx * RIG.shoulder.x, RIG.shoulder.y - RIG.upperArm.L, 0));
      joint(`hip${s}`, 'body', `thigh${s}`, new THREE.Vector3(sx * RIG.hip.x, RIG.hip.y, 0));
      joint(`knee${s}`, `thigh${s}`, `shin${s}`, new THREE.Vector3(sx * RIG.hip.x, RIG.hip.y - RIG.thigh.L, 0));
    }
    this.syncMotorLimits(true);
    this.readBody();
  }

  private syncMotorLimits(force = false) {
    const T = tuning;
    const mc = this.motorCache;
    if (force || mc.arms !== T.arms.maxTorque) {
      mc.arms = T.arms.maxTorque;
      for (const j of ['shoulderL', 'elbowL', 'shoulderR', 'elbowR'] as const) setMotorMaxForce(this.joints[j], T.arms.maxTorque);
    }
    if (force || mc.legs !== T.legs.maxTorque) {
      mc.legs = T.legs.maxTorque;
      for (const j of ['hipL', 'kneeL', 'hipR', 'kneeR'] as const) setMotorMaxForce(this.joints[j], T.legs.maxTorque);
    }
    if (force || mc.head !== T.head.maxTorque) {
      mc.head = T.head.maxTorque;
      setMotorMaxForce(this.joints.neck, T.head.maxTorque);
    }
  }

  // ---------------------------------------------------------------- queries

  get body() {
    return this.parts.body;
  }

  private readBody() {
    const b = this.parts.body;
    const t = b.translation();
    const r = b.rotation();
    const v = b.linvel();
    this.bodyPos.set(t.x, t.y, t.z);
    this.bodyQ.set(r.x, r.y, r.z, r.w);
    this.bodyQInv.copy(this.bodyQ).invert();
    this.bodyVel.set(v.x, v.y, v.z);
  }

  /** Approximate feet position (for checkpoints, goal zones, camera). */
  feetPosition(out = new THREE.Vector3()) {
    return out.copy(this.bodyPos).add(_a.set(0, -tuning.float.rideHeight, 0));
  }

  isHolding() {
    return !!(this.hands[0].grip || this.hands[1].grip);
  }

  /** Distinct dynamic bodies this player is holding. */
  heldBodies(): RigidBody[] {
    const out: RigidBody[] = [];
    for (const h of this.hands) {
      const g = h.grip;
      if (g && g.body && !g.isStatic && !out.includes(g.body)) out.push(g.body);
    }
    return out;
  }

  heldOwners(): unknown[] {
    const out: unknown[] = [];
    for (const h of this.hands) if (h.grip && !out.includes(h.grip.owner)) out.push(h.grip.owner);
    return out;
  }

  /** How heavy our share of the held stuff is (kg). */
  heldMass() {
    let m = 0;
    for (const b of this.heldBodies()) {
      const holders = Math.max(1, this.sim.grips.holdersOf(b).length);
      m += b.mass() / holders;
    }
    return m;
  }

  maxGripStretch() {
    let s = 0;
    for (const h of this.hands) if (h.grip) s = Math.max(s, h.grip.stretch);
    return s;
  }

  handWorld(side: 0 | 1, out: THREE.Vector3) {
    const fa = this.parts[side === 0 ? 'lArmL' : 'lArmR'];
    const t = fa.translation();
    const r = fa.rotation();
    return out.copy(HAND_LOCAL).applyQuaternion(_qh.set(r.x, r.y, r.z, r.w)).add(_hv.set(t.x, t.y, t.z));
  }

  private shoulderWorld(side: 0 | 1, out: THREE.Vector3) {
    return out.set(side === 0 ? RIG.shoulder.x : -RIG.shoulder.x, RIG.shoulder.y, 0).applyQuaternion(this.bodyQ).add(this.bodyPos);
  }

  // ---------------------------------------------------------------- control

  /** Physics pre-step: everything that pushes the ragdoll around. */
  preStep(dt: number) {
    this.syncMotorLimits();
    this.readBody();
    this.stateTime += dt;
    if (this.respawnProtect > 0) this.respawnProtect -= dt;

    // timers
    this.jumpCooldown -= dt;
    this.springOff -= dt;
    if (this.intent.jumpPressed) this.jumpBuffer = tuning.jump.buffer;
    else this.jumpBuffer -= dt;

    this.updateGhosts(dt);
    this.probeGround();
    if (this.grounded && this.groundDist < tuning.float.rideHeight + 0.14) {
      this.coyote = tuning.jump.coyote;
      if (this.airTime > 0.25) this.onLand();
      this.airTime = 0;
    } else {
      this.coyote -= dt;
      this.airTime += dt;
    }

    this.updateState(dt);

    let strength = 0;
    if (this.state === 'active') strength = 1;
    else if (this.state === 'gettingUp') strength = smoothstep(this.stateTime / tuning.knock.getUp);

    if (strength > 0) this.locomotion(dt, strength);
    if (!this.npc) this.updateGrab(dt);
    this.driveLimbs(dt, strength);

    // remember velocity after our own pushes so postStep sees only external hits
    const v = this.parts.body.linvel();
    this.vPre.set(v.x, v.y, v.z);
    this.vyPre = v.y;
    this.intent.jumpPressed = false;
  }

  /** Physics post-step: detect hard hits (knockdowns). */
  postStep(dt: number) {
    const v = this.parts.body.linvel();
    _a.set(v.x - this.vPre.x, v.y - this.vPre.y + tuning.physics.gravity * dt, v.z - this.vPre.z);
    const hit = _a.length();
    this.lastImpact = hit;
    if (hit > tuning.knock.impact && this.state !== 'knocked' && this.respawnProtect <= 0) {
      this.knock(hit);
    }
    if (this.vyPre < -7 && v.y > -1 && this.state !== 'knocked') {
      // slammed into the ground from a big fall
      if (-this.vyPre > 11) this.knock(-this.vyPre * 0.6);
    }
  }

  private probeGround() {
    const T = tuning.float;
    const world = this.sim.physics.world;
    const p = this.bodyPos;
    const maxToi = T.rideHeight + T.probeExtra - PROBE_R;
    const shape = PROBE_SHAPE ?? (PROBE_SHAPE = new RAPIER.Ball(PROBE_R));
    const hit = world.castShape(
      { x: p.x, y: p.y, z: p.z },
      IDQ,
      DOWN_V,
      shape,
      0,
      maxToi,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      groups(this.bodyBit, STANDABLE & ~(this.bodyBit | this.armBit)),
      undefined,
      undefined,
      (c) => !this.ownColliders.has(c.handle),
    );
    this.grounded = false;
    this.groundBody = null;
    this.groundCollider = null;
    this.groundVel.set(0, 0, 0);
    if (!hit) {
      this.groundDist = 99;
      return;
    }
    const n = hit.normal1;
    this.groundNormal.set(n.x, n.y, n.z);
    if (this.groundNormal.y < Math.cos((T.maxSlope * Math.PI) / 180)) {
      this.groundDist = 99;
      return;
    }
    this.grounded = true;
    this.groundDist = hit.time_of_impact + PROBE_R;
    this.groundCollider = hit.collider;
    this.groundPoint.set(hit.witness1.x, hit.witness1.y, hit.witness1.z);
    const gb = hit.collider.parent();
    this.groundBody = gb;
    if (gb && !gb.isFixed()) {
      const gv = gb.velocityAtPoint(hit.witness1);
      this.groundVel.set(gv.x, gv.y, gv.z);
    }
    const info = this.sim.physics.info(hit.collider);
    if (info?.surfaceVelocity) this.groundVel.add(info.surfaceVelocity);
    this.groundFriction = hit.collider.friction();
  }

  private updateState(dt: number) {
    const T = tuning;
    if (this.state === 'knocked') {
      if (this.intent.jumpPressed) this.stateTime += T.knock.mashBonus;
      if (this.stateTime >= this.knockDuration) {
        this.state = 'gettingUp';
        this.stateTime = 0;
        this.sim.events.emit('getup', { player: this.index });
      }
      return;
    }
    if (this.state === 'gettingUp' && this.stateTime >= T.knock.getUp) {
      this.state = 'active';
      this.stateTime = 0;
    }
    // falling over from tilt
    const upY = _a.set(0, 1, 0).applyQuaternion(this.bodyQ).y;
    const tilt = Math.acos(clamp(upY, -1, 1)) * (180 / Math.PI);
    if (tilt > T.balance.fallAngle && this.state === 'active') {
      this.fallTimer += dt;
      if (this.fallTimer > T.balance.fallTime) this.knock(0, 1.1);
    } else this.fallTimer = Math.max(0, this.fallTimer - dt * 2);
  }

  private knockDuration = 1.6;

  /** Turn into a limp ragdoll for a bit. */
  knock(strength: number, durationScale = 1) {
    if (this.state === 'knocked') return;
    this.releaseAll();
    this.state = 'knocked';
    this.stateTime = 0;
    this.fallTimer = 0;
    this.knockDuration = tuning.knock.duration * durationScale * (strength > 14 ? 1.4 : 1);
    this.sim.events.emit('knock', { player: this.index, pos: this.bodyPos.clone(), strength });
  }

  private onLand() {
    const speed = Math.max(0, -this.vyPre);
    this.landSquash = clamp(speed / 9, 0, 0.35);
    if (speed > 2) this.sim.events.emit('land', { player: this.index, pos: this.groundPoint.clone(), speed });
  }

  private locomotion(dt: number, s: number) {
    const T = tuning;
    const body = this.parts.body;
    const m = this.totalMass;
    const v = this.bodyVel;

    // --- desired move
    const move = _a.set(this.intent.moveX, 0, this.intent.moveZ);
    let mlen = move.length();
    if (mlen > 1) {
      move.multiplyScalar(1 / mlen);
      mlen = 1;
    }
    let speed = T.move.maxSpeed * this.speedScale;
    if (this.isHolding()) {
      const heavy = clamp(this.heldMass() / 40, 0, 1);
      speed *= T.move.carrySpeed * (1 - T.move.heavyCarrySlowdown * heavy);
    }
    const gv = this.groundVel;
    const goal = _b.copy(move).multiplyScalar(speed);
    if (this.isHolding()) {
      goal.add(this.comfortVel);
      this.applyTether(goal);
    }
    if (this.grounded) goal.add(_c.set(gv.x, 0, gv.z));
    else goal.add(_c.set(v.x, 0, v.z).multiplyScalar(mlen < 0.1 ? 1 : 0)); // keep momentum in the air when not steering

    let accel = this.grounded ? T.move.accel : T.move.airAccel;
    // heavy loads have momentum: speed up and slow down gently while carrying
    if (this.isHolding()) {
      const load = clamp(this.heldMass() / 12, 0, 1);
      accel += (Math.min(accel, T.move.carryAccel) - accel) * load;
    }
    if (this.grounded && this.groundFriction < T.move.slipperyFriction) accel *= T.move.slipperyAccelScale;
    const need = _c.set(goal.x - v.x, 0, goal.z - v.z).multiplyScalar(1 / dt);
    const nl = need.length();
    if (nl > accel) need.multiplyScalar(accel / nl);
    const imp = _d.copy(need).multiplyScalar(m * dt * s);
    body.applyImpulse({ x: imp.x, y: 0, z: imp.z }, true);
    if (this.grounded && this.groundBody && this.groundBody.isDynamic()) {
      this.groundBody.applyImpulseAtPoint({ x: -imp.x * 0.5, y: 0, z: -imp.z * 0.5 }, this.groundPoint, true);
    }

    // speed relative to ground drives the gait
    const hv = Math.hypot(v.x - (this.grounded ? gv.x : 0), v.z - (this.grounded ? gv.z : 0));
    this.speedNorm = clamp(hv / T.move.maxSpeed, 0, 1.3);
    if (this.grounded) {
      this.gaitPhase += dt * Math.PI * 2 * T.legs.stepRate * Math.max(this.speedNorm, 0) * (0.65 + 0.35 * this.speedNorm);
      this.stepAccum += dt * T.legs.stepRate * 2 * this.speedNorm;
      if (this.stepAccum >= 1) {
        this.stepAccum -= 1;
        if (this.speedNorm > 0.2) this.sim.events.emit('step', { player: this.index, pos: this.groundPoint.clone(), speed: hv });
      }
    }

    // --- floating spring
    const bob = T.float.bob * Math.abs(Math.sin(this.gaitPhase)) * this.speedNorm;
    const ride = T.float.rideHeight + bob - 0.36 * this.reachLow;
    if (this.grounded && this.springOff <= 0) {
      const err = ride - this.groundDist;
      const vrel = v.y - gv.y;
      if (!(vrel > 1.2 && err < 0)) {
        let a = err * T.float.springK - vrel * T.float.springC;
        a = clamp(a, -T.float.maxDown, T.float.maxUp);
        const jy = (a + T.physics.gravity) * m * dt * s;
        body.applyImpulse({ x: 0, y: jy, z: 0 }, true);
        if (this.groundBody && this.groundBody.isDynamic()) {
          this.groundBody.applyImpulseAtPoint({ x: 0, y: -Math.max(0, jy), z: 0 }, this.groundPoint, true);
        }
      }
    }

    // --- jump
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.jumpCooldown <= 0 && this.state === 'active') {
      const jv = T.jump.velocity;
      for (const name of PART_NAMES) {
        const p = this.parts[name];
        const lv = p.linvel();
        p.setLinvel({ x: lv.x, y: jv + Math.max(0, gv.y), z: lv.z }, true);
      }
      if (this.groundBody && this.groundBody.isDynamic()) {
        this.groundBody.applyImpulseAtPoint({ x: 0, y: -m * jv * 0.5, z: 0 }, this.groundPoint, true);
      }
      this.springOff = T.jump.springOff;
      this.jumpCooldown = T.jump.cooldown;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.sim.events.emit('jump', { player: this.index, pos: this.bodyPos.clone() });
    }

    // --- facing
    const strafe = this.strafeTarget(_e);
    if (strafe) this.facingYaw = Math.atan2(strafe.x, strafe.z);
    else if (mlen > 0.15) this.facingYaw = Math.atan2(move.x, move.z);

    // --- upright + yaw torque
    const q = this.bodyQ;
    const up = _e.set(0, 1, 0).applyQuaternion(q);
    const fwd = _f.set(0, 0, 1).applyQuaternion(q);
    const lean = _d.copy(need).multiplyScalar(T.balance.accelLean);
    if (lean.length() > 0.35) lean.setLength(0.35);
    // waddle: tilt side to side with the gait
    const right = _c.set(-Math.cos(this.facingYaw), 0, Math.sin(this.facingYaw));
    lean.addScaledVector(right, T.balance.waddle * Math.sin(this.gaitPhase) * Math.min(1, this.speedNorm));
    // bend toward low reach targets
    if (this.reachLow > 0) lean.add(_b.set(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw)).multiplyScalar(1.15 * this.reachLow));
    const targetUp = lean.add(Y_AXIS).normalize();

    const axis = _b.crossVectors(up, targetUp);
    const sinA = axis.length();
    const cosA = up.dot(targetUp);
    const angle = Math.atan2(sinA, cosA);
    if (sinA > 1e-6) axis.multiplyScalar(angle / sinA);
    else axis.set(0, 0, 0);

    const w = body.angvel();
    const wv = _c.set(w.x, w.y, w.z);
    const wUp = up.dot(wv);
    const kB = T.balance.uprightK * this.balanceScale;
    const cB = T.balance.uprightC * Math.sqrt(this.balanceScale);
    // tilt: spring on the axis, damping on angular velocity not about "up"
    const torque = axis.multiplyScalar(kB).addScaledVector(wv, -cB).addScaledVector(up, cB * wUp);
    // yaw about our own up axis
    const curYaw = Math.atan2(fwd.x, fwd.z);
    const yawErr = wrapAngle(this.facingYaw - curYaw);
    torque.addScaledVector(up, yawErr * T.balance.yawK - wUp * T.balance.yawC);
    torque.multiplyScalar(T.balance.inertia * s);
    const tl = torque.length();
    const maxT = T.balance.maxTorque * this.balanceScale;
    if (tl > maxT) torque.multiplyScalar(maxT / tl);
    body.applyTorqueImpulse({ x: torque.x * dt, y: torque.y * dt, z: torque.z * dt }, true);
  }

  /**
   * A strained grip holds you back: the part of your walk velocity that pulls
   * away from the held point fades out as the grip spring stretches, so the
   * cargo feels attached instead of slipping out of your mittens.
   */
  private applyTether(goal: THREE.Vector3) {
    const T = tuning.grip;
    for (const h of this.hands) {
      const g = h.grip;
      if (!g || g.stretch < T.tetherStart) continue;
      const A = _f.copy(g.anchor).applyQuaternion(this.bodyQ).add(this.bodyPos);
      const pull = this.gripWorld(g, _e).sub(A);
      pull.y = 0;
      const pl = pull.length();
      if (pl < 1e-4) continue;
      pull.multiplyScalar(1 / pl);
      const away = -goal.dot(pull); // velocity moving away from the grip
      if (away <= 0) continue;
      const k = smoothstep((g.stretch - T.tetherStart) / (T.tetherFull - T.tetherStart));
      goal.addScaledVector(pull, away * k);
    }
  }

  /**
   * When holding something heavy, something someone else also holds, or a
   * ledge, we face what we're holding and strafe. Returns the direction or null.
   */
  private strafeTarget(out: THREE.Vector3): THREE.Vector3 | null {
    let n = 0;
    out.set(0, 0, 0);
    let strafe = false;
    for (const h of this.hands) {
      const g = h.grip;
      if (!g) continue;
      if (g.isStatic) strafe = true;
      else if (g.body) {
        if (this.sim.grips.holdersOf(g.body).length > 1 || g.body.mass() > 14) strafe = true;
      }
      out.add(this.gripWorld(g, _f));
      n++;
    }
    if (!n || !strafe) return null;
    out.multiplyScalar(1 / n).sub(this.bodyPos);
    out.y = 0;
    if (out.lengthSq() < 0.04) return null;
    return out.normalize();
  }

  // ---------------------------------------------------------------- grabbing

  gripWorld(g: Grip, out: THREE.Vector3) {
    if (g.isStatic || !g.body) return out.copy(g.local);
    const t = g.body.translation();
    const r = g.body.rotation();
    return out.copy(g.local).applyQuaternion(_q3.set(r.x, r.y, r.z, r.w)).add(_d.set(t.x, t.y, t.z));
  }

  /** Seconds into a gentle put-down (grab released while carrying something), or -1. */
  private setDownT = -1;

  /** Is any hand carrying a loose object (cargo / prop) we'd rather not drop? */
  private carryingLoad() {
    return this.hands.some((h) => h.grip && h.grip.body && !h.grip.isStatic && (h.grip.kind === 'cargo' || h.grip.kind === 'prop'));
  }

  /** Lower held things toward the floor instead of letting go mid-air. */
  private beginSetDown() {
    this.setDownT = 0;
    for (const h of this.hands) {
      const g = h.grip;
      if (!g) continue;
      g.anchorStart.copy(g.anchor);
      g.anchorGoal.copy(g.anchor);
      g.t = 1;
    }
  }

  /** Held things are sitting on something (not just hanging from our hands). */
  private loadResting() {
    const world = this.sim.physics.world;
    for (const b of this.heldBodies()) {
      const v = b.linvel();
      if (Math.abs(v.y) > 0.3) return false;
      let supported = false;
      for (let i = 0; i < b.numColliders() && !supported; i++) {
        const c = b.collider(i);
        world.contactPairsWith(c, (o) => {
          if (supported) return;
          const kind = this.sim.physics.info(o)?.kind;
          if (kind === 'player' || kind === 'npc') return;
          world.contactPair(c, o, (m) => {
            if (m.numSolverContacts() > 0 && Math.abs(m.normal().y) > 0.5) supported = true;
          });
        });
      }
      if (!supported) return false;
    }
    return true;
  }

  private updateSetDown(dt: number) {
    const T = tuning.grip;
    this.setDownT += dt;
    // squat and lower the hands at a gentle, steady pace
    this.reachLow = Math.min(1, this.reachLow + dt * T.setDownSquat);
    for (const h of this.hands) {
      const g = h.grip;
      if (!g) continue;
      g.anchorGoal.y = Math.max(T.setDownLow, g.anchorGoal.y - T.setDownSpeed * dt);
      const sx = g.side === 0 ? 1 : -1;
      const sh = _a.set(sx * RIG.shoulder.x, RIG.shoulder.y, 0);
      const d = _b.copy(g.anchorGoal).sub(sh);
      if (d.length() > ARM_REACH * 0.95) g.anchorGoal.copy(sh).add(d.setLength(ARM_REACH * 0.95));
      g.anchorStart.copy(g.anchorGoal);
      this.maintainGrip(h, dt);
    }
    this.applyHoldTorques(dt);
    const done = this.setDownT > T.setDownMax || (this.setDownT > 0.2 && this.loadResting()) || this.intent.jumpPressed;
    if (done || !this.isHolding()) {
      this.setDownT = -1;
      if (this.isHolding()) this.releaseAll();
    }
  }

  private updateGrab(dt: number) {
    const want = this.intent.grab && this.state === 'active';
    if (!want) {
      if (this.state === 'active' && this.setDownT < 0 && this.carryingLoad()) this.beginSetDown();
      if (this.setDownT >= 0 && this.state === 'active') {
        this.updateSetDown(dt);
        return;
      }
      this.setDownT = -1;
      if (this.isHolding()) this.releaseAll();
      this.hands[0].reach = null;
      this.hands[1].reach = null;
      this.reachLow = 0;
      return;
    }
    if (this.setDownT >= 0) {
      // grabbed again mid put-down: lift it back up
      this.setDownT = -1;
      this.computeCarryGoals();
    }
    let lowest = 0;
    this.updateComfort();
    for (const h of this.hands) {
      if (h.grip) {
        this.maintainGrip(h, dt);
        continue;
      }
      const tgt = this.findTarget(h.side);
      if (!h.reach) h.reach = new THREE.Vector3();
      if (tgt) {
        h.reach.copy(tgt.point);
        const body = tgt.collider.parent();
        if (body && !body.isFixed()) {
          const vv = body.velocityAtPoint(tgt.point);
          h.reachVel.set(vv.x, vv.y, vv.z);
        } else h.reachVel.set(0, 0, 0);
        this.tryLatch(h, tgt.collider);
      } else {
        // zombie arms: straight ahead
        h.reach.set(h.side === 0 ? 0.2 : -0.2, 0.12, 0.7).applyQuaternion(this.bodyQ).add(this.bodyPos);
        h.reachVel.copy(this.bodyVel);
      }
      // how far below a *standing* shoulder the target is (measuring from the current,
      // already-crouched shoulder would make the crouch cancel itself out)
      const floorY = this.grounded ? this.bodyPos.y - this.groundDist : this.bodyPos.y - tuning.float.rideHeight;
      const standShoulder = floorY + tuning.float.rideHeight + RIG.shoulder.y;
      if (h.reach && !h.grip) lowest = Math.max(lowest, clamp((standShoulder - h.reach.y - 0.25) / 0.5, 0, 1));
    }
    this.reachLow += (lowest - this.reachLow) * Math.min(1, dt * 6);
    if (this.hands[0].grip && this.hands[1].grip) this.reachLow *= 1 - Math.min(1, dt * 3);
    this.applyHoldTorques(dt);
  }

  private candidates: Collider[] = [];
  /** Step-back velocity that keeps held things from sinking into our torso. */
  private comfortVel = new THREE.Vector3();

  private updateComfort() {
    this.comfortVel.set(0, 0, 0);
    const p = this.bodyPos;
    for (const b of this.heldBodies()) {
      for (let i = 0; i < b.numColliders(); i++) {
        const proj = b.collider(i).projectPoint({ x: p.x, y: p.y, z: p.z }, true);
        if (!proj) continue;
        const dx = p.x - proj.point.x;
        const dz = p.z - proj.point.z;
        const dh = Math.hypot(dx, dz);
        const want = RIG.body.r + 0.12;
        if (proj.isInside) {
          // inside it: back away from its centre
          const t = b.translation();
          const ox = p.x - t.x;
          const oz = p.z - t.z;
          const ol = Math.hypot(ox, oz) || 1;
          this.comfortVel.x += (ox / ol) * 2.5;
          this.comfortVel.z += (oz / ol) * 2.5;
        } else if (dh < want && dh > 1e-4) {
          const k = ((want - dh) / want) * 3;
          this.comfortVel.x += (dx / dh) * k;
          this.comfortVel.z += (dz / dh) * k;
        }
      }
    }
  }

  /** Auto-aim: the nearest grabbable point within reach of this shoulder. */
  private findTarget(side: 0 | 1): { collider: Collider; point: THREE.Vector3 } | null {
    const T = tuning.grip;
    const world = this.sim.physics.world;
    const phys = this.sim.physics;
    const S = this.shoulderWorld(side, _b).clone();
    const fwd = _c.set(Math.sin(this.facingYaw), 0, Math.cos(this.facingYaw));
    const center = _d.copy(this.bodyPos).addScaledVector(fwd, 0.35);
    const cands = this.candidates;
    cands.length = 0;
    const ball = REACH_SHAPE ?? (REACH_SHAPE = new RAPIER.Ball(0.95));
    world.intersectionsWithShape(
      { x: center.x, y: center.y - 0.1, z: center.z },
      IDQ,
      ball,
      (c) => {
        cands.push(c);
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      undefined,
      (c) => {
        if (this.ownColliders.has(c.handle)) return false;
        const info = phys.info(c);
        if (!info) return true;
        if (info.grabbable === false) return false;
        return info.kind !== 'sensor' && info.kind !== 'debris';
      },
    );
    let best: Collider | null = null;
    let bestScore = Infinity;
    const bestP = new THREE.Vector3();
    for (const c of cands) {
      const proj = c.projectPoint({ x: S.x, y: S.y, z: S.z }, false);
      if (!proj) continue;
      const P = _e.set(proj.point.x, proj.point.y, proj.point.z);
      // things below the shoulder are easier to reach: we can bend over / crouch
      const below = S.y - P.y;
      const horiz = Math.hypot(P.x - S.x, P.z - S.z);
      const vert = below > 0 ? Math.max(0, below - T.bendReach) : -below;
      const d = proj.isInside ? 0 : Math.hypot(horiz, vert);
      if (d > T.reach) continue;
      const toP = _f.copy(P).sub(this.bodyPos);
      toP.y = 0;
      const fl = toP.length();
      if (fl > 0.05 && toP.dot(fwd) / fl < -0.15) continue; // behind us
      const info = phys.info(c);
      let prio = 0;
      if (info) {
        if (info.kind === 'cargo') prio = 0.45;
        else if (info.kind === 'prop') prio = 0.15;
        else if (info.kind === 'player' || info.kind === 'npc') prio = -0.08;
        else prio = -0.05;
      }
      // prefer points the mitten is already close to
      this.handWorld(side, _f);
      const dHand = _f.distanceTo(P);
      const score = d - prio + 0.35 * dHand;
      if (score < bestScore) {
        bestScore = score;
        best = c;
        bestP.copy(P);
      }
    }
    return best ? { collider: best, point: bestP } : null;
  }

  private tryLatch(h: Hand, collider: Collider) {
    const H = this.handWorld(h.side, _a);
    const proj = collider.projectPoint({ x: H.x, y: H.y, z: H.z }, false);
    if (!proj) return;
    const P = _b.set(proj.point.x, proj.point.y, proj.point.z);
    const dist = proj.isInside ? 0 : P.distanceTo(H);
    if (dist > RIG.hand.r + tuning.grip.latchDistance && !proj.isInside) return;
    // the hand centre rests just outside the surface
    const n = _c.copy(H).sub(P);
    if (proj.isInside) n.negate();
    if (n.lengthSq() < 1e-8) n.copy(this.bodyPos).sub(P);
    n.normalize();
    const gp = P.clone().addScaledVector(n, RIG.hand.r * 0.8);
    const body = collider.parent();
    const isStatic = !body || body.isFixed();
    const info = this.sim.physics.info(collider);
    let local: THREE.Vector3;
    if (isStatic) local = gp.clone();
    else {
      const bt = body!.translation();
      const br = body!.rotation();
      local = gp
        .clone()
        .sub(_d.set(bt.x, bt.y, bt.z))
        .applyQuaternion(_qg.set(br.x, br.y, br.z, br.w).invert());
    }
    const anchorStart = H.clone().sub(this.bodyPos).applyQuaternion(this.bodyQInv);
    h.grip = {
      side: h.side,
      collider,
      body: isStatic ? null : body,
      isStatic,
      local,
      anchorStart,
      anchorGoal: anchorStart.clone(),
      anchor: anchorStart.clone(),
      t: 0,
      slip: 0,
      owner: info?.owner,
      kind: info?.kind ?? 'static',
      stretch: 0,
    };
    if (!isStatic && body) {
      this.sim.grips.add(body, this.index);
      if (!this.holdRel.has(body.handle)) {
        const r = body.rotation();
        this.holdRel.set(body.handle, this.headingQ(new THREE.Quaternion()).invert().multiply(_q2.set(r.x, r.y, r.z, r.w)));
      }
    }
    this.computeCarryGoals();
    this.sim.events.emit('grab', { player: this.index, pos: gp.clone(), kind: info?.kind ?? 'static' });
  }

  /**
   * Where each grip spring pulls to, in torso space. We keep the horizontal
   * offset we grabbed at (so two movers on opposite ends don't squeeze the
   * load) and only lift it to carry height.
   */
  private computeCarryGoals() {
    const T = tuning.grip;
    for (const g of [this.hands[0].grip, this.hands[1].grip]) {
      if (!g) continue;
      const sx = g.side === 0 ? 1 : -1;
      const a = g.anchorStart.copy(g.anchor);
      g.anchorGoal.set(
        clamp(a.x, sx > 0 ? -0.05 : -T.maxSpan / 2, sx > 0 ? T.maxSpan / 2 : 0.05),
        g.isStatic ? Math.max(a.y, T.carryHeight + 0.25) : T.carryHeight,
        clamp(a.z, 0.3, T.carryForward + 0.15),
      );
      // never ask for a pose the arm can't reach
      const sh = _a.set(sx * RIG.shoulder.x, RIG.shoulder.y, 0);
      const d = _b.copy(g.anchorGoal).sub(sh);
      const max = ARM_REACH * 0.95;
      if (d.length() > max) g.anchorGoal.copy(sh).add(d.setLength(max));
      g.t = 0;
    }
  }

  private maintainGrip(h: Hand, dt: number) {
    const T = tuning.grip;
    const g = h.grip!;
    if (!g.collider.isValid() || (g.body && !g.body.isValid())) {
      this.release(h);
      return;
    }
    g.t = Math.min(1, g.t + dt / T.liftTime);
    g.anchor.lerpVectors(g.anchorStart, g.anchorGoal, smoothstep(g.t));

    const A = _a.copy(g.anchor).applyQuaternion(this.bodyQ).add(this.bodyPos);
    const vAr = this.parts.body.velocityAtPoint({ x: A.x, y: A.y, z: A.z });
    const vA = _b.set(vAr.x, vAr.y, vAr.z);
    const Gp = this.gripWorld(g, _c);
    const vG = _d.set(0, 0, 0);
    let mEff = this.totalMass;
    const dynamic = !!(g.body && g.body.isDynamic());
    if (g.body && !g.isStatic) {
      const vv = g.body.velocityAtPoint({ x: Gp.x, y: Gp.y, z: Gp.z });
      vG.set(vv.x, vv.y, vv.z);
      if (dynamic) {
        const mt = g.body.mass();
        mEff = (mt * this.totalMass) / (mt + this.totalMass);
      }
    }
    const F = _e
      .copy(A)
      .sub(Gp)
      .multiplyScalar(T.springK)
      .addScaledVector(_f.copy(vA).sub(vG), T.springC)
      .multiplyScalar(mEff);
    const maxF = g.isStatic || !dynamic ? T.ledgeForce : T.handForce;
    const fl = F.length();
    if (fl > maxF) F.multiplyScalar(maxF / fl);
    if (dynamic) g.body!.applyImpulseAtPoint({ x: F.x * dt, y: F.y * dt, z: F.z * dt }, { x: Gp.x, y: Gp.y, z: Gp.z }, true);
    this.parts.body.applyImpulseAtPoint({ x: -F.x * dt, y: -F.y * dt, z: -F.z * dt }, { x: A.x, y: A.y, z: A.z }, true);

    g.stretch = A.distanceTo(Gp);
    if (g.stretch > T.slipStretch) g.slip += dt;
    else g.slip = Math.max(0, g.slip - dt);
    if (!h.reach) h.reach = new THREE.Vector3();
    h.reach.copy(Gp);
    h.reachVel.copy(vG);
    if (g.slip > T.slipTime) {
      this.sim.events.emit('slip', { player: this.index, pos: Gp.clone() });
      this.release(h);
    }
  }

  /** Damp the held object's spin relative to us and softly keep its orientation. */
  /** Rotation about world up matching the torso's heading. */
  private headingQ(out: THREE.Quaternion) {
    const f = _g.set(0, 0, 1).applyQuaternion(this.bodyQ);
    return out.setFromAxisAngle(Y_AXIS, Math.atan2(f.x, f.z));
  }

  private applyHoldTorques(dt: number) {
    const T = tuning.grip;
    for (const b of this.heldBodies()) {
      if (!b.isDynamic()) continue;
      const rel = this.holdRel.get(b.handle);
      if (!rel) continue;
      const r = b.rotation();
      const qb = _q1.set(r.x, r.y, r.z, r.w);
      // follow where we face, but not our lean or waddle: a tank of water
      // shouldn't rock every time its carrier takes a step
      const goal = this.headingQ(_q2).multiply(rel);
      const err = quatToRotVec(_q3.copy(goal).multiply(qb.invert()), _a);
      const wb = b.angvel();
      const wp = this.parts.body.angvel();
      const wRel = _b.set(wb.x - wp.x, wb.y - wp.y, wb.z - wp.z);
      // scalar inertia estimate of the held body
      const pi = b.principalInertia();
      const I = (pi.x + pi.y + pi.z) / 3;
      const holders = Math.max(1, this.sim.grips.holdersOf(b).length);
      const tau = err.multiplyScalar(T.holdRotK).addScaledVector(wRel, -T.spinDamping).multiplyScalar(I / holders);
      const tl = tau.length();
      if (tl > T.holdRotMax) tau.multiplyScalar(T.holdRotMax / tl);
      b.applyTorqueImpulse({ x: tau.x * dt, y: tau.y * dt, z: tau.z * dt }, true);
      this.parts.body.applyTorqueImpulse({ x: -tau.x * dt * 0.5, y: -tau.y * dt * 0.5, z: -tau.z * dt * 0.5 }, true);
    }
  }

  release(h: Hand) {
    const g = h.grip;
    if (!g) return;
    h.grip = null;
    if (g.body && !g.isStatic && g.body.isValid()) {
      this.sim.grips.ghost(g.body, this.index);
      if (!this.ghosts.some((x) => x.body === g.body)) this.ghosts.push({ body: g.body, t: 0 });
      this.sim.grips.remove(g.body, this.index);
      if (!this.sim.grips.isHeldBy(g.body, this.index)) this.holdRel.delete(g.body.handle);
    }
    this.computeCarryGoals();
    this.sim.events.emit('release', { player: this.index });
  }

  releaseAll() {
    this.release(this.hands[0]);
    this.release(this.hands[1]);
    this.holdRel.clear();
  }

  private updateGhosts(dt: number) {
    if (!this.ghosts.length) return;
    const solid = [this.parts.body, this.parts.thighL, this.parts.thighR, this.parts.shinL, this.parts.shinR, this.parts.head];
    this.ghosts = this.ghosts.filter((gh) => {
      gh.t += dt;
      if (!gh.body.isValid()) return false;
      if (this.sim.grips.isHeldBy(gh.body, this.index)) {
        // grabbed it again: stay ghosted while held, re-check after
        gh.t = 0;
        return true;
      }
      let overlap = false;
      if (gh.t < 3) {
        outer: for (let i = 0; i < gh.body.numColliders(); i++) {
          const oc = gh.body.collider(i);
          for (const part of solid) {
            for (let k = 0; k < part.numColliders(); k++) {
              const ct = oc.contactCollider(part.collider(k), 0.02);
              if (ct && ct.distance < 0.01) {
                overlap = true;
                break outer;
              }
            }
          }
        }
      }
      if (overlap) return true;
      this.sim.grips.unghost(gh.body, this.index);
      return false;
    });
  }

  // ---------------------------------------------------------------- limbs

  private driveLimbs(dt: number, s: number) {
    const T = tuning;
    const limp = this.state === 'knocked';
    const air = !this.grounded && this.airTime > 0.12;
    const falling = air && this.bodyVel.y < -3.5 && this.airTime > 0.45;
    this.flail += dt * (falling ? 14 : 6);

    const legK = limp ? 6 : T.legs.stiffness * (0.15 + 0.85 * s);
    const legC = limp ? 2 : T.legs.damping;
    const armKFree = limp ? 4 : T.arms.stiffness * (0.15 + 0.85 * s);
    const armC = limp ? 1.5 : T.arms.damping;

    // ---- legs
    const sn = Math.min(1, this.speedNorm);
    for (const side of [0, 1] as const) {
      const sx = side === 0 ? 1 : -1;
      const ph = this.gaitPhase + (side === 0 ? 0 : Math.PI);
      let pitch: number;
      let knee: number;
      const spread = sx * 0.06;
      if (limp) {
        pitch = 0;
        knee = 0.2;
      } else if (air) {
        pitch = -0.5 + (falling ? Math.sin(this.flail + side * 2) * 0.5 : 0);
        knee = 0.9 + (falling ? Math.cos(this.flail * 1.3 + side) * 0.4 : 0);
      } else {
        // squat when reaching low: thighs forward, knees bent
        pitch = -T.legs.swing * sn * Math.sin(ph) - 0.75 * this.reachLow;
        knee = T.legs.knee * sn * Math.max(0, Math.cos(ph)) + 0.06 + 1.3 * this.reachLow;
      }
      _qz.setFromAxisAngle(Z_AXIS, spread);
      _qx.setFromAxisAngle(X_AXIS, pitch);
      const hipJ = side === 0 ? 'hipL' : 'hipR';
      const kneeJ = side === 0 ? 'kneeL' : 'kneeR';
      driveSpherical(this.joints[hipJ], _q1.copy(_qz).multiply(_qx), legK, legC);
      driveSpherical(this.joints[kneeJ], _q1.setFromAxisAngle(X_AXIS, knee), legK, legC);
    }

    // ---- arms
    for (const h of this.hands) {
      const sx = h.side === 0 ? 1 : -1;
      const shJ = h.side === 0 ? 'shoulderL' : 'shoulderR';
      const elJ = h.side === 0 ? 'elbowL' : 'elbowR';
      const upper = _q1;
      const fore = _q2;
      let k = armKFree;
      let c = armC;
      if (!limp && h.reach) {
        this.armIK(h.side, h.reach, upper, fore);
        if (h.grip) {
          k = T.arms.holdStiffness;
          c = T.arms.holdDamping;
        } else {
          k = T.arms.reachStiffness;
          c = T.arms.reachDamping;
        }
        this.pullHand(h, dt);
      } else if (limp) {
        upper.setFromAxisAngle(Z_AXIS, sx * 0.3);
        fore.setFromAxisAngle(X_AXIS, -0.3);
      } else if (air) {
        const wig = falling ? Math.sin(this.flail * 1.7 + h.side * 1.9) * 0.6 : 0;
        _qz.setFromAxisAngle(Z_AXIS, sx * (0.9 + wig * 0.5));
        _qx.setFromAxisAngle(X_AXIS, -1.3 + wig);
        upper.copy(_qz).multiply(_qx);
        fore.setFromAxisAngle(X_AXIS, -0.5 - (falling ? Math.abs(wig) : 0));
      } else {
        const swing = T.arms.swing * sn * Math.sin(this.gaitPhase) * (h.side === 0 ? 1 : -1);
        _qz.setFromAxisAngle(Z_AXIS, sx * (0.14 + 0.08 * sn));
        _qx.setFromAxisAngle(X_AXIS, swing);
        upper.copy(_qz).multiply(_qx);
        fore.setFromAxisAngle(X_AXIS, -0.35 - 0.3 * sn);
      }
      driveSpherical(this.joints[shJ], _q3.copy(this.frameInv[shJ]).multiply(upper), k, c);
      driveSpherical(this.joints[elJ], fore, k, c);
    }

    // ---- head: partially cancel the torso tilt so it stays level-ish
    if (limp) {
      driveSpherical(this.joints.neck, _q1.identity(), 3, 1);
    } else {
      const fwd = _a.set(0, 0, 1).applyQuaternion(this.bodyQ);
      const yaw = Math.atan2(fwd.x, fwd.z);
      const yq = _q2.setFromAxisAngle(Y_AXIS, yaw);
      // tilt = yaw^-1 * body ; head relative = slerp(identity, tilt^-1, stabilize)
      const tilt = _q3.copy(yq).invert().multiply(this.bodyQ);
      const rel = _q1.identity().slerp(tilt.invert(), T.head.stabilize);
      driveSpherical(this.joints.neck, rel, T.head.stiffness * (0.2 + 0.8 * s), T.head.damping);
    }
  }

  /** Two-bone IK in torso space; outputs joint-relative rotations. */
  private armIK(side: 0 | 1, targetWorld: THREE.Vector3, outUpper: THREE.Quaternion, outFore: THREE.Quaternion) {
    const sx = side === 0 ? 1 : -1;
    const S = _a.set(sx * RIG.shoulder.x, RIG.shoulder.y, 0);
    const Tl = _b.copy(targetWorld).sub(this.bodyPos).applyQuaternion(this.bodyQInv);
    const d = _c.copy(Tl).sub(S);
    let D = d.length();
    if (D < 1e-5) d.set(0, 0, 1);
    const dn = d.normalize();
    D = clamp(D, 0.12, ARM_REACH * 0.995);
    const L1 = ARM_UPPER;
    const L2 = ARM_LOWER;
    const along = (L1 * L1 - L2 * L2 + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    const pole = _d.set(sx * 0.5, -1, -0.4).normalize();
    pole.addScaledVector(dn, -pole.dot(dn));
    if (pole.lengthSq() < 1e-6) pole.set(0, -1, 0);
    pole.normalize();
    const E = _e.copy(S).addScaledVector(dn, along).addScaledVector(pole, h);
    const u = _f.copy(E).sub(S).normalize();
    outUpper.setFromUnitVectors(DOWN, u);
    const Tc = _b.copy(S).addScaledVector(dn, D);
    const f = Tc.sub(E).normalize();
    _q3.setFromUnitVectors(DOWN, f);
    outFore.copy(outUpper).invert().multiply(_q3);
  }

  /** Extra force that drags the mitten exactly onto its target point. */
  private pullHand(h: Hand, dt: number) {
    if (!h.reach) return;
    const T = tuning.arms;
    const fa = this.parts[h.side === 0 ? 'lArmL' : 'lArmR'];
    const H = this.handWorld(h.side, _a);
    const vh = fa.velocityAtPoint({ x: H.x, y: H.y, z: H.z });
    const m = RIG.foreArm.mass + RIG.hand.mass;
    const F = _b
      .copy(h.reach)
      .sub(H)
      .multiplyScalar(T.handPullK)
      .addScaledVector(_c.set(h.reachVel.x - vh.x, h.reachVel.y - vh.y, h.reachVel.z - vh.z), T.handPullC)
      .multiplyScalar(m);
    const fl = F.length();
    if (fl > T.handPullMax) F.multiplyScalar(T.handPullMax / fl);
    fa.applyImpulseAtPoint({ x: F.x * dt, y: F.y * dt, z: F.z * dt }, { x: H.x, y: H.y, z: H.z }, true);
    const S = this.shoulderWorld(h.side, _d);
    this.parts.body.applyImpulseAtPoint({ x: -F.x * dt, y: -F.y * dt, z: -F.z * dt }, { x: S.x, y: S.y, z: S.z }, true);
  }

  // ---------------------------------------------------------------- utils

  /** Teleport the whole ragdoll, standing, feet at `feet`. */
  teleport(feet: THREE.Vector3, yaw: number, vel?: THREE.Vector3) {
    this.releaseAll();
    const yq = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw);
    const origin = feet.clone().add(new THREE.Vector3(0, tuning.float.rideHeight + 0.05, 0));
    for (const name of PART_NAMES) {
      const p = partRestCenter(name).applyQuaternion(yq).add(origin);
      const b = this.parts[name];
      b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
      b.setRotation({ x: yq.x, y: yq.y, z: yq.z, w: yq.w }, true);
      b.setLinvel({ x: vel?.x ?? 0, y: vel?.y ?? 0, z: vel?.z ?? 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    this.facingYaw = yaw;
    this.state = 'active';
    this.stateTime = 0;
    this.fallTimer = 0;
    this.airTime = 0;
    this.respawnProtect = 0.5;
    this.readBody();
    this.vPre.set(0, 0, 0);
  }

  /** Pushes every part (used by hazards like the wrecking ball). */
  applyBlast(impulse: THREE.Vector3) {
    for (const name of PART_NAMES) {
      const b = this.parts[name];
      const s = b.mass() / this.totalMass;
      b.applyImpulse({ x: impulse.x * s, y: impulse.y * s, z: impulse.z * s }, true);
    }
  }

  dispose() {
    this.releaseAll();
    for (const name of PART_NAMES) this.sim.physics.removeBody(this.parts[name]);
  }
}

let PROBE_SHAPE: InstanceType<typeof RAPIER.Ball> | null = null;
let REACH_SHAPE: InstanceType<typeof RAPIER.Ball> | null = null;
