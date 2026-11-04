import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { G, groups, SOLID } from '../../physics/groups';
import { glossy, jelly, matte } from '../../render/materials';
import { Player } from '../Player';
import { registerHazard, Hazard } from './registry';
import { bonkPlayers, kinematicBody, num, v3 } from './common';

/**
 * Funfair pieces for chaos courses: a turntable to walk across, pinball
 * bumpers, trampolines and cannons firing rubber balls across the path.
 */

const DEG = Math.PI / 180;

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

// ---------------------------------------------------------------- turntable

/**
 * A big slowly turning disc set into the floor: walk across and it carries
 * you round. params: radius, speed (rad/s, + = anticlockwise from above).
 */
class Turntable implements Hazard {
  readonly bodyRef: RigidBody;
  private visual = new THREE.Group();
  private pos: THREE.Vector3;
  private speed: number;
  private angle = 0;

  constructor(o: HazardObj, sim: Sim) {
    this.pos = v3(o.pos);
    const r = num(o.params, 'radius', 3.2);
    this.speed = num(o.params, 'speed', 0.5);
    this.bodyRef = kinematicBody(sim, this.pos);
    const c = sim.physics.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.08, r).setFriction(1).setCollisionGroups(groups(G.STATIC, SOLID | G.DEBRIS)),
      this.bodyRef,
    );
    sim.physics.setInfo(c, { kind: 'static', material: 'wood', friction: 1 });
    // a striped disc with a rim, so you can see it turn
    const n = 12;
    for (let i = 0; i < n; i++) {
      const seg = mesh(new THREE.CylinderGeometry(r, r, 0.16, 6, 1, false, (i / n) * Math.PI * 2, (Math.PI * 2) / n), matte(i % 2 ? 0xffd23f : 0xff5a4f), false);
      this.visual.add(seg);
    }
    const hub = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 20), glossy(0xfbfaf6, 0.3, 0.1), false);
    this.visual.add(hub);
    this.visual.position.copy(this.pos);
    sim.scene.add(this.visual);
    sim.physics.link(this.bodyRef, this.visual);
  }

  preStep(dt: number) {
    this.angle += this.speed * dt;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.angle);
    this.bodyRef.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.bodyRef.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }

  update() {}

  dispose() {
    this.visual.removeFromParent();
  }
}

// ---------------------------------------------------------------- bumper

/** A pinball bumper: anything that touches it is kicked away, with a flash. params: radius, kick (m/s). */
class Bumper implements Hazard {
  private visual = new THREE.Group();
  private col: Collider;
  private pos: THREE.Vector3;
  private kick: number;
  private cool = new Map<number, number>();
  private flash = 0;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshStandardMaterial;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.pos = v3(o.pos);
    const r = num(o.params, 'radius', 0.45);
    this.kick = num(o.params, 'kick', 5);
    const body = sim.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pos.x, this.pos.y + 0.5, this.pos.z));
    this.col = sim.physics.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.5, r).setRestitution(0.6).setCollisionGroups(groups(G.STATIC, SOLID | G.DEBRIS)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    sim.physics.setInfo(this.col, { kind: 'static', material: 'rubber', grabbable: false });
    const base = mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.15, 0.25, 24), glossy(0x3d5bd6, 0.3, 0.3));
    base.position.y = 0.12;
    const top = mesh(new THREE.CylinderGeometry(r, r, 0.6, 24), glossy(0xfbfaf6, 0.25, 0.1));
    top.position.y = 0.55;
    const cap = mesh(new THREE.CylinderGeometry(r * 1.08, r * 1.0, 0.12, 24), glossy(0xff5a4f, 0.25, 0.2));
    cap.position.y = 0.92;
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffc93a, emissiveIntensity: 0.2 });
    this.ring = mesh(new THREE.TorusGeometry(r * 1.02, 0.05, 8, 28).rotateX(Math.PI / 2), this.ringMat, false);
    this.ring.position.y = 0.4;
    this.visual.add(base, top, cap, this.ring);
    this.visual.position.copy(this.pos);
    sim.scene.add(this.visual);
  }

  preStep() {
    const now = this.sim.time();
    const world = this.sim.physics.world;
    const hit: RigidBody[] = [];
    world.contactPairsWith(this.col, (other) => {
      const b = other.parent();
      if (b && b.isDynamic() && !hit.includes(b)) hit.push(b);
    });
    for (const b of hit) {
      const info = this.sim.physics.info(b.collider(0));
      const owner = info?.owner;
      const key = owner instanceof Player ? -1 - owner.index : b.handle;
      if ((this.cool.get(key) ?? -9) > now - 0.45) continue;
      this.cool.set(key, now);
      const p = b.translation();
      const d = new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z);
      if (d.lengthSq() < 1e-4) d.set(1, 0, 0);
      d.normalize().multiplyScalar(this.kick).setY(1.2);
      if (owner instanceof Player) owner.applyBlast(d.multiplyScalar(owner.totalMass));
      else b.applyImpulse({ x: d.x * b.mass(), y: d.y * b.mass(), z: d.z * b.mass() }, true);
      this.flash = now + 0.25;
      this.sim.events.emit('hazard', { pos: this.pos.clone().setY(this.pos.y + 0.6), kind: 'bumper' });
    }
  }

  update(_dt: number, time: number) {
    const on = time < this.flash;
    this.ringMat.emissiveIntensity = on ? 2.5 : 0.2;
    this.ring.scale.setScalar(on ? 1.12 : 1);
  }

  netState() {
    return [this.flash];
  }

  applyNetState(s: number[]) {
    this.flash = s[0] ?? 0;
  }

  dispose() {
    this.visual.removeFromParent();
  }
}

// ---------------------------------------------------------------- trampoline

/** A round trampoline: step on it and you're bounced up high. params: radius, bounce (m/s). */
class Trampoline implements Hazard {
  private visual = new THREE.Group();
  private col: Collider;
  private pos: THREE.Vector3;
  private bounce: number;
  private cool = new Map<Player, number>();
  private mat: THREE.Mesh;
  private squash = 0;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.pos = v3(o.pos);
    const r = num(o.params, 'radius', 0.95);
    this.bounce = num(o.params, 'bounce', 8);
    const body = sim.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pos.x, this.pos.y + 0.12, this.pos.z));
    this.col = sim.physics.world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.12, r).setRestitution(0.95).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max).setCollisionGroups(groups(G.STATIC, SOLID | G.DEBRIS)),
      body,
    );
    sim.physics.setInfo(this.col, { kind: 'static', material: 'rubber', grabbable: false });
    const frame = mesh(new THREE.TorusGeometry(r, 0.09, 8, 28).rotateX(Math.PI / 2), glossy(0x3d9bff, 0.3, 0.2));
    frame.position.y = 0.2;
    this.mat = mesh(new THREE.CircleGeometry(r * 0.94, 28).rotateX(-Math.PI / 2), matte(0x22222a), false);
    this.mat.position.y = 0.21;
    const legs = matte(0x3a3a46);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const leg = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), legs, false);
      leg.position.set(Math.cos(a) * r * 0.9, 0.1, Math.sin(a) * r * 0.9);
      this.visual.add(leg);
    }
    this.visual.add(frame, this.mat);
    this.visual.position.copy(this.pos);
    sim.scene.add(this.visual);
  }

  preStep() {
    const now = this.sim.time();
    for (const p of this.sim.players ?? []) {
      if (p.groundCollider !== this.col || !p.grounded) continue;
      if ((this.cool.get(p) ?? -9) > now - 0.5) continue;
      this.cool.set(p, now);
      const v = p.body.linvel();
      p.applyBlast(new THREE.Vector3(v.x * 0.2, this.bounce, v.z * 0.2).multiplyScalar(p.totalMass));
      this.squash = now + 0.2;
      this.sim.events.emit('jump', { player: p.index, pos: p.bodyPos.clone() });
    }
  }

  update(_dt: number, time: number) {
    this.mat.position.y = time < this.squash ? 0.12 : 0.21;
  }

  dispose() {
    this.visual.removeFromParent();
  }
}

// ---------------------------------------------------------------- cannon

/**
 * A cannon at the side of the path that fires a rubber ball across it every
 * `period` seconds (at `phase` of the way through). params: yaw (where it
 * points, degrees), period, phase, speed (m/s).
 */
class Cannon implements Hazard {
  readonly pos: THREE.Vector3;
  readonly period: number;
  readonly phase: number;
  private dir: THREE.Vector3;
  private speed: number;
  private visual = new THREE.Group();
  private balls: { body: RigidBody; col: Collider; obj: THREE.Object3D; live: boolean; until: number; park: THREE.Vector3 }[] = [];
  private next = 0;
  private cooldowns = new Map<Player, number>();
  private lastFrac = 1;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.pos = v3(o.pos);
    const yaw = num(o.params, 'yaw', 0) * DEG;
    this.dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    this.period = num(o.params, 'period', 3.8);
    this.phase = num(o.params, 'phase', 0);
    this.speed = num(o.params, 'speed', 9);
    // the cannon: a barrel on a carriage with two wheels
    const black = glossy(0x2a2a32, 0.35, 0.6);
    const barrel = mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.3, 16).rotateX(Math.PI / 2), black);
    barrel.position.set(0, 0.75, 0.15);
    barrel.rotation.x = -0.18;
    const mouth = mesh(new THREE.TorusGeometry(0.23, 0.05, 8, 16), black, false);
    mouth.position.set(0, 0.86, 0.8);
    const wood = matte(0x8a5a36);
    const cart = mesh(new THREE.BoxGeometry(0.6, 0.3, 0.9), wood);
    cart.position.set(0, 0.35, -0.05);
    for (const s of [-1, 1]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 16).rotateZ(Math.PI / 2), wood);
      wheel.position.set(s * 0.38, 0.32, 0);
      this.visual.add(wheel);
    }
    this.visual.add(barrel, mouth, cart);
    this.visual.position.copy(this.pos);
    this.visual.rotation.y = yaw;
    sim.scene.add(this.visual);
    // two rubber balls (made up front: online, the guest's copies move from snapshots)
    const world = sim.physics.world;
    for (let i = 0; i < 2; i++) {
      const park = new THREE.Vector3(this.pos.x + i, -330, this.pos.z);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(park.x, park.y, park.z).setLinearDamping(0.05).setCcdEnabled(true).setEnabled(false));
      const col = world.createCollider(
        RAPIER.ColliderDesc.ball(0.32).setMass(5).setRestitution(0.75).setFriction(0.6).setCollisionGroups(groups(G.HAZARD, SOLID | G.DEBRIS)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body,
      );
      sim.physics.setInfo(col, { kind: 'hazard', material: 'rubber', grabbable: false });
      const obj = mesh(new THREE.SphereGeometry(0.32, 16, 12), jelly(i ? 0xff5a4f : 0x3d9bff, 0.35));
      obj.visible = false;
      sim.scene.add(obj);
      sim.physics.link(body, obj);
      this.balls.push({ body, col, obj, live: false, until: 0, park });
    }
  }

  private frac(t: number) {
    const f = (t / this.period + this.phase) % 1;
    return f < 0 ? f + 1 : f;
  }

  preStep() {
    const now = this.sim.time();
    const f = this.frac(now);
    // fire as the phase wraps round
    if (f < this.lastFrac) this.fire(now);
    this.lastFrac = f;
    for (const b of this.balls) {
      if (!b.live) continue;
      const v = b.body.linvel();
      bonkPlayers(this.sim, b.col, new THREE.Vector3(v.x, v.y, v.z), 2.5, 4, this.cooldowns, now);
      if (now > b.until || b.body.translation().y < -60) {
        b.body.setTranslation({ x: b.park.x, y: b.park.y, z: b.park.z }, false);
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        b.body.setEnabled(false);
        b.live = false;
      }
    }
  }

  private fire(now: number) {
    const b = this.balls[this.next++ % this.balls.length];
    const m = this.pos.clone().addScaledVector(this.dir, 0.9).setY(this.pos.y + 0.9);
    b.body.setEnabled(true);
    b.body.setTranslation({ x: m.x, y: m.y, z: m.z }, true);
    b.body.setLinvel({ x: this.dir.x * this.speed, y: 1.6, z: this.dir.z * this.speed }, true);
    b.live = true;
    b.until = now + 2.6;
    this.sim.fx?.burst('smoke', m, { count: 10, speed: 2.2, up: 0.8, size: 0.25, life: 0.7, gravity: -0.5, drag: 2.5, dir: this.dir, colors: [0xffffff, 0xd8d8d8] });
    this.sim.events.emit('hazard', { pos: m, kind: 'cannon' });
  }

  update() {
    for (const b of this.balls) b.obj.visible = b.obj.position.y > -100;
  }

  dispose() {
    this.visual.removeFromParent();
    for (const b of this.balls) b.obj.removeFromParent();
  }
}

registerHazard('turntable', (o, sim) => new Turntable(o, sim));
registerHazard('bumper', (o, sim) => new Bumper(o, sim));
registerHazard('trampoline', (o, sim) => new Trampoline(o, sim));
registerHazard('cannon', (o, sim) => new Cannon(o, sim));
