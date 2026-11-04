import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { G, groups, SOLID } from '../../physics/groups';
import { glossy, matte } from '../../render/materials';
import { Player } from '../Player';
import { registerHazard, Hazard } from './registry';
import { bonkPlayers, kinematicBody, num, v3 } from './common';

/**
 * Random-course hazards: a bridge whose planks fall away behind you, a train
 * crossing, a crane sliding a steel beam across the path, and sprinklers.
 */

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

/** Turn a direction (yaw in degrees, 0 = +Z) into a vector on the floor. */
const dirOf = (yaw: number) => new THREE.Vector3(Math.sin(yaw * DEG), 0, Math.cos(yaw * DEG));

// ---------------------------------------------------------------- collapsing bridge

/**
 * A plank bridge over a drop: each plank shakes once someone's on it and
 * falls away a moment later (and is back a few seconds after, for another
 * try). pos = the middle of the bridge at floor height. params: length,
 * width, planks, yaw (degrees: the way across), delay (s before a plank goes).
 */
class Collapse implements Hazard {
  private planks: { body: RigidBody; col: Collider; obj: THREE.Object3D; home: THREE.Vector3; state: 'up' | 'shake' | 'fall' | 'gone'; t: number }[] = [];
  private delay: number;
  private q: THREE.Quaternion;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const pos = v3(o.pos);
    const L = num(o.params, 'length', 9);
    const w = num(o.params, 'width', 3.4);
    const n = Math.max(2, Math.round(num(o.params, 'planks', 7)));
    const yaw = num(o.params, 'yaw', 0);
    this.delay = num(o.params, 'delay', 1.2);
    this.q = new THREE.Quaternion().setFromAxisAngle(UP, yaw * DEG);
    const fwd = dirOf(yaw);
    const seg = L / n;
    const woods = [matte(0x8a5a36), matte(0x7a4e2e), matte(0x96643c)];
    for (let i = 0; i < n; i++) {
      const home = pos.clone().addScaledVector(fwd, -L / 2 + (i + 0.5) * seg).add(new THREE.Vector3(0, -0.09, 0));
      const body = kinematicBody(sim, home, this.q);
      const col = sim.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(w / 2, 0.09, seg / 2 - 0.03).setFriction(0.9).setCollisionGroups(groups(G.STATIC, SOLID | G.DEBRIS)),
        body,
      );
      sim.physics.setInfo(col, { kind: 'static', material: 'wood', friction: 0.9 });
      const obj = new THREE.Group();
      obj.add(mesh(new THREE.BoxGeometry(w, 0.18, seg - 0.06), woods[i % 3]));
      // a couple of nails' worth of rope at each end
      for (const s of [-1, 1]) {
        const rope = mesh(new THREE.BoxGeometry(0.06, 0.2, seg - 0.04), matte(0xcaa66a), false);
        rope.position.x = s * (w / 2 - 0.12);
        obj.add(rope);
      }
      obj.position.copy(home);
      obj.quaternion.copy(this.q);
      sim.scene.add(obj);
      sim.physics.link(body, obj);
      this.planks.push({ body, col, obj, home, state: 'up', t: 0 });
    }
  }

  preStep() {
    const now = this.sim.time();
    const ps = this.sim.players ?? [];
    const cargo = this.sim.cargo;
    for (const p of this.planks) {
      if (p.state === 'up') {
        // someone (or the load) on it: it starts to go
        let on = ps.some((q) => q.grounded && q.groundCollider === p.col);
        if (!on && cargo) this.sim.physics.world.contactPairsWith(p.col, (other) => (on ||= other.parent() === cargo.body));
        if (on) {
          p.state = 'shake';
          p.t = now;
        }
        continue;
      }
      const dt = now - p.t;
      if (p.state === 'shake') {
        const j = Math.sin(now * 60) * 0.025;
        p.body.setNextKinematicTranslation({ x: p.home.x + j, y: p.home.y - Math.abs(j), z: p.home.z });
        if (dt > this.delay) {
          p.state = 'fall';
          p.t = now;
        }
      } else if (p.state === 'fall') {
        const y = p.home.y - 0.5 * 12 * dt * dt;
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dt * 1.4);
        p.body.setNextKinematicTranslation({ x: p.home.x, y, z: p.home.z });
        p.body.setNextKinematicRotation(this.q.clone().multiply(tilt));
        if (dt > 2.2) {
          p.state = 'gone';
          p.t = now;
          p.body.setNextKinematicTranslation({ x: p.home.x, y: p.home.y - 80, z: p.home.z });
        }
      } else if (p.state === 'gone' && dt > 6) {
        // back again, for the next try
        p.state = 'up';
        p.body.setNextKinematicTranslation({ x: p.home.x, y: p.home.y, z: p.home.z });
        p.body.setNextKinematicRotation(this.q);
      }
    }
  }

  update() {
    for (const p of this.planks) p.obj.visible = p.obj.position.y > p.home.y - 40;
  }

  dispose() {
    for (const p of this.planks) p.obj.removeFromParent();
  }
}

// ---------------------------------------------------------------- train crossing

/**
 * A level crossing: a train runs along `yaw` through pos every `period`
 * seconds (at `phase` of the way through); the barriers are down and the
 * lights flash while it's near. params: yaw, period, phase, speed, cars,
 * gap (half the path's width: where the barriers stand).
 */
class Train implements Hazard {
  readonly pos: THREE.Vector3;
  readonly period: number;
  readonly phase: number;
  readonly speed: number;
  /** Barriers down (the train's coming or crossing). */
  down = false;
  private dir: THREE.Vector3;
  private side: THREE.Vector3;
  private cars: { body: RigidBody; cols: Collider[]; obj: THREE.Object3D; off: number }[] = [];
  private trainLen: number;
  private gap: number;
  private barriers: THREE.Object3D[] = [];
  private lamps: THREE.MeshStandardMaterial[] = [];
  private cool = new Map<Player, number>();
  private span = 40;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.pos = v3(o.pos);
    const yaw = num(o.params, 'yaw', 90);
    this.dir = dirOf(yaw);
    this.side = new THREE.Vector3().crossVectors(UP, this.dir);
    this.period = num(o.params, 'period', 16);
    this.phase = num(o.params, 'phase', 0);
    this.speed = num(o.params, 'speed', 10);
    this.gap = num(o.params, 'gap', 3.6);
    const n = Math.max(1, Math.round(num(o.params, 'cars', 3)));
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw * DEG);
    const carLen = 5.6;
    this.trainLen = n * (carLen + 0.5);

    // the track: two rails and sleepers along the line
    const track = new THREE.Group();
    const railMat = glossy(0x9aa3ad, 0.3, 0.8);
    for (const s of [-0.72, 0.72]) {
      const rail = mesh(new THREE.BoxGeometry(0.1, 0.12, this.span * 2), railMat, false);
      rail.position.set(s, 0.06, 0);
      track.add(rail);
    }
    const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 0.08, 0.26), matte(0x6b4a32), Math.floor((this.span * 2) / 0.9));
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < sleepers.count; i++) sleepers.setMatrixAt(i, m4.makeTranslation(0, 0.03, -this.span + i * 0.9));
    sleepers.receiveShadow = true;
    track.add(sleepers);
    track.position.copy(this.pos);
    track.quaternion.copy(q);
    sim.scene.add(track);
    this.barriers.push(track);

    // the train: a locomotive and carriages (kinematic: it shoves whatever's on the line)
    for (let i = 0; i < n; i++) {
      const loco = i === 0;
      const off = -i * (carLen + 0.5);
      const body = kinematicBody(sim, this.at(-this.span * 2), q);
      const col = sim.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(1.2, 1.3, carLen / 2).setTranslation(0, 1.6, 0).setCollisionGroups(groups(G.HAZARD, SOLID | G.DEBRIS)),
        body,
      );
      sim.physics.setInfo(col, { kind: 'hazard', material: 'metal', grabbable: false });
      const obj = new THREE.Group();
      const paint = glossy(loco ? 0xd63c2f : 0x2f6fb8, 0.35, 0.3);
      const box = mesh(new THREE.BoxGeometry(2.4, 2.4, carLen), paint);
      box.position.y = 1.65;
      const roof = mesh(new THREE.BoxGeometry(2.3, 0.2, carLen - 0.2), glossy(0x3a3a46, 0.4, 0.4), false);
      roof.position.y = 2.95;
      const strip = mesh(new THREE.BoxGeometry(2.42, 0.5, carLen - 0.6), new THREE.MeshStandardMaterial({ color: 0xbfe3ff, roughness: 0.15, metalness: 0.2 }), false);
      strip.position.y = 2.1;
      obj.add(box, roof, strip);
      for (const z of [-carLen / 2 + 0.9, carLen / 2 - 0.9])
        for (const x of [-0.85, 0.85]) {
          const wheel = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 14).rotateZ(Math.PI / 2), matte(0x222228), false);
          wheel.position.set(x, 0.38, z);
          obj.add(wheel);
        }
      if (loco) {
        const nose = mesh(new THREE.BoxGeometry(2.3, 1.4, 0.8), glossy(0xffd23f, 0.3, 0.2));
        nose.position.set(0, 1.2, carLen / 2 + 0.3);
        const lamp = mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6cc }), false);
        lamp.position.set(0, 2.2, carLen / 2 + 0.02);
        obj.add(nose, lamp);
      }
      obj.quaternion.copy(q);
      sim.scene.add(obj);
      sim.physics.link(body, obj);
      this.cars.push({ body, cols: [col], obj, off });
    }

    // barriers either side of the line, and a pair of flashing lamps on each
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.3, 10), matte(0xfbfaf6));
      post.position.y = 0.65;
      const arm = new THREE.Group();
      arm.position.y = 1.05;
      arm.name = 'arm';
      for (let k = 0; k < 6; k++) {
        const bar = mesh(new THREE.BoxGeometry(0.12, 0.12, this.gap * 2 * 0.17), matte(k % 2 ? 0xfbfaf6 : 0xe8433b), false);
        bar.position.z = (k + 0.5) * this.gap * 2 * 0.17;
        arm.add(bar);
      }
      for (const x of [-0.22, 0.22]) {
        const lm = new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0xff2a1a, emissiveIntensity: 0 });
        const lamp = mesh(new THREE.SphereGeometry(0.11, 10, 8), lm, false);
        lamp.position.set(x, 1.45, 0);
        g.add(lamp);
        this.lamps.push(lm);
      }
      g.add(post, arm);
      // on the near side of the line (coming up to it) for one, the far side for the other
      g.position.copy(this.pos).addScaledVector(this.side, s * 1.9).addScaledVector(this.dir, -s * this.gap);
      // the arm reaches across the path from its post
      g.quaternion.setFromAxisAngle(UP, (s > 0 ? yaw : yaw + 180) * DEG);
      sim.scene.add(g);
      this.barriers.push(g);
    }
  }

  /** A point along the line, `s` metres from the crossing. */
  private at(s: number) {
    return this.pos.clone().addScaledVector(this.dir, s);
  }

  /** Where the front of the train is (metres along the line from the crossing) at time t. */
  private front(t: number) {
    const f = (t / this.period + this.phase) % 1;
    const tc = (f < 0 ? f + 1 : f) * this.period;
    return -this.span + this.speed * tc;
  }

  preStep() {
    const now = this.sim.time();
    const s = this.front(now);
    for (const c of this.cars) {
      const p = this.at(Math.min(s + c.off, this.span * 2));
      c.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
      for (const col of c.cols) bonkPlayers(this.sim, col, this.dir.clone().multiplyScalar(this.speed), 2, 7, this.cool, now);
    }
  }

  update(_dt: number, time: number) {
    // (from where the cars are drawn, so the guest's copy lowers its barriers too)
    const lead = this.cars[0].obj.position.clone().sub(this.pos).dot(this.dir);
    const rear = lead - this.trainLen;
    this.down = lead > -this.gap - 22 && rear < this.gap + 2;
    for (const c of this.cars) c.obj.visible = Math.abs(c.obj.position.clone().sub(this.pos).dot(this.dir)) < this.span + 6;
    for (const b of this.barriers) {
      const arm = b.getObjectByName('arm');
      if (!arm) continue;
      const want = this.down ? 0 : -Math.PI / 2 + 0.05;
      arm.rotation.x += (want - arm.rotation.x) * Math.min(1, _dt * 3);
    }
    const blink = this.down && Math.sin(time * 9) > 0;
    this.lamps.forEach((l, i) => (l.emissiveIntensity = this.down ? ((i % 2 === 0) === blink ? 2.4 : 0.1) : 0));
  }

  dispose() {
    for (const b of this.barriers) b.removeFromParent();
    for (const c of this.cars) c.obj.removeFromParent();
  }
}

// ---------------------------------------------------------------- crane beam

/**
 * A crane slides a steel beam to and fro across the path at chest height:
 * it waits off one side, swings across, waits off the other, comes back.
 * pos = where it crosses the path, at floor height. params: yaw (the way the
 * beam slides), reach (how far either side it waits), period, phase.
 */
class CraneBeam implements Hazard {
  readonly pos: THREE.Vector3;
  readonly period: number;
  readonly phase: number;
  /** Seconds it waits at each side (the rest of each half is the slide). */
  readonly dwell: number;
  private dir: THREE.Vector3;
  private reach: number;
  private body: RigidBody;
  private col: Collider;
  private obj = new THREE.Group();
  private trolley = new THREE.Group();
  private cable: THREE.Mesh;
  private cool = new Map<Player, number>();
  private last = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private jibY = 8.5;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.pos = v3(o.pos);
    const yaw = num(o.params, 'yaw', 90);
    this.dir = dirOf(yaw);
    this.reach = num(o.params, 'reach', 6);
    this.period = num(o.params, 'period', 12);
    this.phase = num(o.params, 'phase', 0);
    this.dwell = this.period * 0.3;
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw * DEG);
    const y = this.pos.y + 1.15;
    this.body = kinematicBody(sim, new THREE.Vector3(this.pos.x, y, this.pos.z), q);
    this.col = sim.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 0.2, 2.1).setCollisionGroups(groups(G.HAZARD, SOLID | G.DEBRIS)), this.body);
    sim.physics.setInfo(this.col, { kind: 'hazard', material: 'metal', grabbable: false });
    // an I-beam (along the way it slides)
    const steel = glossy(0xe2702a, 0.45, 0.5);
    for (const dy of [-0.17, 0.17]) {
      const f = mesh(new THREE.BoxGeometry(0.4, 0.06, 4.2), steel);
      f.position.y = dy;
      this.obj.add(f);
    }
    this.obj.add(mesh(new THREE.BoxGeometry(0.08, 0.34, 4.2), steel));
    this.obj.quaternion.copy(q);
    sim.scene.add(this.obj);
    sim.physics.link(this.body, this.obj);
    // the crane: a lattice tower off to one side, a jib over the path, a trolley and its cable
    const yellow = glossy(0xffc93a, 0.4, 0.3);
    const towerAt = this.pos.clone().addScaledVector(this.dir, this.reach + 1.4);
    const tower = new THREE.Group();
    for (const [x, z] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
    ]) {
      const leg = mesh(new THREE.BoxGeometry(0.12, this.jibY + 0.6, 0.12), yellow);
      leg.position.set(x, (this.jibY + 0.6) / 2, z);
      tower.add(leg);
    }
    for (let h = 1; h < this.jibY; h += 1.2) {
      const brace = mesh(new THREE.BoxGeometry(1.1, 0.08, 0.08), yellow, false);
      brace.position.set(0, h, 0.5);
      tower.add(brace);
    }
    tower.position.copy(towerAt);
    sim.scene.add(tower);
    const jib = mesh(new THREE.BoxGeometry(0.4, 0.4, this.reach * 2 + 3), yellow);
    jib.position.copy(this.pos).add(new THREE.Vector3(0, this.jibY, 0)).addScaledVector(this.dir, 0.7);
    jib.quaternion.copy(q);
    sim.scene.add(jib);
    this.trolley.add(mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), glossy(0x3a3a46, 0.4, 0.4), false));
    this.cable = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), matte(0x222222), false);
    sim.scene.add(this.trolley, this.cable);
    this.extras.push(tower, jib);
  }
  private extras: THREE.Object3D[] = [];

  /** Seconds into the cycle at time t. */
  cycle(t: number) {
    const f = (t / this.period + this.phase) % 1;
    return (f < 0 ? f + 1 : f) * this.period;
  }

  /** Where along its run the beam is at time t (-reach .. +reach). */
  private x(t: number) {
    const tc = this.cycle(t);
    const half = this.period / 2;
    const move = half - this.dwell;
    const ease = (u: number) => u * u * (3 - 2 * u);
    if (tc < this.dwell) return -this.reach;
    if (tc < half) return -this.reach + 2 * this.reach * ease((tc - this.dwell) / move);
    if (tc < half + this.dwell) return this.reach;
    return this.reach - 2 * this.reach * ease((tc - half - this.dwell) / move);
  }

  preStep(dt: number) {
    const now = this.sim.time();
    const p = this.pos.clone().addScaledVector(this.dir, this.x(now)).setY(this.pos.y + 1.15);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    this.vel.copy(p).sub(this.last).multiplyScalar(1 / Math.max(dt, 1e-3));
    this.last.copy(p);
    bonkPlayers(this.sim, this.col, this.vel, 1.5, 6, this.cool, now);
  }

  update() {
    const b = this.obj.position;
    this.trolley.position.set(b.x, this.pos.y + this.jibY - 0.35, b.z);
    const len = this.jibY - 0.5 - 1.3;
    this.cable.scale.y = len;
    this.cable.position.set(b.x, b.y + 0.2 + len / 2, b.z);
  }

  dispose() {
    this.obj.removeFromParent();
    this.trolley.removeFromParent();
    this.cable.removeFromParent();
    for (const e of this.extras) e.removeFromParent();
  }
}

// ---------------------------------------------------------------- sprinkler

/**
 * A lawn sprinkler: its jet goes round and round, shoving whatever it hits
 * (looks drive themselves from the clock, so they match online). params:
 * radius, speed (rad/s), push (m/s²), phase.
 */
class Sprinkler implements Hazard {
  private pos: THREE.Vector3;
  private radius: number;
  private speed: number;
  private push: number;
  private phase: number;
  private head = new THREE.Group();
  private spray = 0;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.pos = v3(o.pos);
    this.radius = num(o.params, 'radius', 4.5);
    this.speed = num(o.params, 'speed', 1.3);
    this.push = num(o.params, 'push', 7);
    this.phase = num(o.params, 'phase', 0);
    const base = mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 12), matte(0x2f7a32), false);
    base.position.y = 0.06;
    const nozzle = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8).rotateZ(Math.PI / 2.6), glossy(0xd8d8d8, 0.3, 0.7), false);
    nozzle.position.set(0.06, 0.2, 0);
    this.head.add(base, nozzle);
    this.head.position.copy(this.pos);
    sim.scene.add(this.head);
  }

  private angle(t: number) {
    return this.phase + this.speed * t;
  }

  preStep(dt: number) {
    const a = this.angle(this.sim.time());
    const jet = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const world = this.sim.physics.world;
    const seen = new Set<number>();
    const bodies: RigidBody[] = [];
    world.collidersWithAabbIntersectingAabb({ x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }, { x: this.radius, y: 2, z: this.radius }, (c) => {
      const b = c.parent();
      if (!b || !b.isDynamic() || seen.has(b.handle)) return true;
      seen.add(b.handle);
      bodies.push(b);
      return true;
    });
    for (const b of bodies) {
      const p = b.translation();
      const d = new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z);
      const dist = d.length();
      if (dist > this.radius || dist < 0.2 || p.y - this.pos.y > 2.2) continue;
      if (d.normalize().dot(jet) < Math.cos(14 * DEG)) continue;
      const m = b.mass();
      const k = this.push * (1 - (dist / this.radius) * 0.5);
      b.applyImpulse({ x: jet.x * k * m * dt, y: 0.25 * k * m * dt, z: jet.z * k * m * dt }, true);
    }
  }

  update(dt: number, time: number) {
    const a = this.angle(time);
    this.head.rotation.y = -a;
    // the jet: drops arcing out along it
    this.spray += dt;
    const jet = new THREE.Vector3(Math.cos(a), 0.55, Math.sin(a)).normalize();
    while (this.spray > 1 / 40) {
      this.spray -= 1 / 40;
      this.sim.fx?.burst('drop', this.pos.clone().add(new THREE.Vector3(0, 0.25, 0)), { count: 2, speed: 7.5, spread: 0.08, dir: jet, size: 0.03, life: 0.9, gravity: 11, drag: 0.4, colors: [0x9fd6ff, 0xd8f0ff], ground: this.pos.y });
    }
  }

  dispose() {
    this.head.removeFromParent();
  }
}

registerHazard('collapse', (o, sim) => new Collapse(o, sim));
registerHazard('train', (o, sim) => new Train(o, sim));
registerHazard('craneBeam', (o, sim) => new CraneBeam(o, sim));
registerHazard('sprinkler', (o, sim) => new Sprinkler(o, sim));
