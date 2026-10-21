import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { glossy, jelly, matte } from '../../render/materials';
import { Player } from '../Player';
import { registerHazard, Hazard } from './registry';
import { bonkPlayers, DEG, hazardCollider, kinematicBody, num, str, v3 } from './common';

interface Rider {
  body: RigidBody;
  col: Collider;
  visual: THREE.Group;
  /** Distance along the lane (m). */
  s: number;
  speed: number;
  len: number;
}

const JACKETS = [0xff5a5a, 0x3d9bff, 0xffd23f, 0x52d39a, 0xb085f5, 0xff8fab];

/** A skier in a puffy jacket, crouched, poles tucked back. Faces local +Z. */
function skier(color: number) {
  const g = new THREE.Group();
  const skin = jelly(0xffd9b8, 0.3);
  const pants = jelly(0x2b2a33, 0.3);
  for (const x of [-0.12, 0.12]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 1.5), glossy(color, 0.3, 0.1));
    ski.position.set(x, 0.02, 0.1);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.35, 4, 8), pants);
    leg.position.set(x, 0.3, 0);
    leg.rotation.x = 0.35;
    g.add(ski, leg);
  }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.36, 4, 10), jelly(color, 0.4));
  body.position.set(0, 0.78, 0.08);
  body.rotation.x = 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin);
  head.position.set(0, 1.18, 0.24);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), jelly(0xffffff, 0.3));
  hat.position.set(0, 1.2, 0.24);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), jelly(color, 0.3));
  pom.position.set(0, 1.37, 0.22);
  const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.06), glossy(0x30343c, 0.2, 0.4));
  goggles.position.set(0, 1.2, 0.38);
  g.add(body, head, hat, pom, goggles);
  for (const x of [-0.3, 0.3]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 6), matte(0x9aa3ad));
    pole.position.set(x, 0.6, -0.25);
    pole.rotation.x = -0.9;
    g.add(pole);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** A kid on a red toboggan, scarf flying. Faces local +Z. */
function sledder(color: number) {
  const g = new THREE.Group();
  const red = glossy(0xd94a3d, 0.4, 0.1);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 1.1), red);
  deck.position.y = 0.12;
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.3), red);
  nose.position.set(0, 0.22, 0.62);
  nose.rotation.x = -0.9;
  for (const x of [-0.24, 0.24]) {
    const runner = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 1.2), matte(0x9aa3ad));
    runner.position.set(x, 0.03, 0.05);
    g.add(runner);
  }
  const kid = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.22, 4, 10), jelly(color, 0.4));
  kid.position.set(0, 0.45, -0.1);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), jelly(0xffd9b8, 0.3));
  head.position.set(0, 0.78, -0.08);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 12), jelly(0xffffff, 0.3));
  hat.position.set(0, 0.95, -0.12);
  hat.rotation.x = -0.4;
  const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.35), jelly(0xffd23f, 0.3));
  scarf.position.set(0.1, 0.62, -0.35);
  g.add(deck, nose, kid, head, hat, scarf);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/** A San Francisco cable car with folk hanging off the running boards. Faces local +Z. */
function cableCar() {
  const g = new THREE.Group();
  const red = glossy(0xc8342b, 0.4, 0.1);
  const cream = glossy(0xeee2c4, 0.45, 0.05);
  const dark = glossy(0x5a1f1b, 0.4, 0.1);
  const box = (size: [number, number, number], mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  box([2.3, 0.9, 6.4], red, 0, 0.75, 0);
  for (const x of [-1.25, 1.25]) box([0.25, 0.08, 6.2], cream, x, 0.36, 0);
  box([2.0, 1.3, 2.6], cream, 0, 1.85, 0);
  for (const x of [-1.01, 1.01]) for (const z of [-0.8, 0, 0.8]) box([0.02, 0.6, 0.6], glossy(0x9fd6ee, 0.1, 0.1), x, 2.0, z);
  for (const x of [-1.08, 1.08]) for (const z of [-2.9, -2.1, -1.4, 1.4, 2.1, 2.9]) box([0.08, 1.3, 0.08], cream, x, 1.85, z);
  box([2.4, 0.16, 6.7], dark, 0, 2.58, 0);
  box([1.3, 0.22, 4.6], dark, 0, 2.75, 0);
  for (const x of [-1.16, 1.16])
    for (const z of [-2.2, 2.2]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), matte(0x24242c));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.32, z);
      g.add(wheel);
    }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff1b0, emissive: 0xffe08a, emissiveIntensity: 1.4 }));
  lamp.position.set(0, 1.3, 3.22);
  g.add(lamp);
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 12), glossy(0xd9a93f, 0.3, 0.8));
  bell.position.set(0, 2.85, 2.9);
  g.add(bell);
  // riders hanging on
  [
    [1.3, -1.9, 0x3d9bff],
    [1.3, 1.7, 0xffd23f],
    [-1.3, 0.5, 0x52d39a],
  ].forEach(([x, z, color]) => {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.4, 4, 10), jelly(color, 0.4));
    body.position.set(x, 0.86, z);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), jelly(0xffd9b8, 0.3));
    head.position.set(x * 1.03, 1.32, z);
    g.add(body, head);
  });
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

/**
 * Skiers (or kids on sledges, or cable cars) going across one after another,
 * then round again from the top. They slow down for movers standing right in
 * front of them, but bowl over anyone who steps out at the wrong moment.
 * params: dirYaw (deg), length, speed, count, phase (0..1), style 'ski' |
 * 'sled' | 'cablecar', wiggle (m, side to side), spacing [fractions of the
 * lane, one per rider] for uneven gaps.
 */
class Skiers implements Hazard {
  /** Named like the car lanes' so the test bot's "wait for a gap" works here too. */
  private cars: Rider[] = [];
  private start: THREE.Vector3;
  private dir: THREE.Vector3;
  private side: THREE.Vector3;
  private yaw: number;
  private length: number;
  private maxSpeed: number;
  private wiggle: number;
  private cool = new Map<Player, number>();

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    this.start = v3(o.pos);
    this.yaw = num(p, 'dirYaw', 90) * DEG;
    this.dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.side = new THREE.Vector3(this.dir.z, 0, -this.dir.x);
    this.length = num(p, 'length', 40);
    this.maxSpeed = num(p, 'speed', 7);
    this.wiggle = num(p, 'wiggle', 0.8);
    const style = str<'ski' | 'sled' | 'cablecar'>(p, 'style', 'ski');
    const count = num(p, 'count', 3);
    const spacing = p?.spacing as number[] | undefined;
    for (let i = 0; i < count; i++) {
      const s = ((spacing?.[i] ?? i / count) + num(p, 'phase', 0)) * this.length;
      const color = JACKETS[(i * 3 + (style === 'sled' ? 1 : 0)) % JACKETS.length];
      const visual = new THREE.Group();
      visual.add(style === 'cablecar' ? cableCar() : style === 'sled' ? sledder(color) : skier(color));
      const half: [number, number, number] = style === 'cablecar' ? [1.15, 1.45, 3.2] : style === 'sled' ? [0.3, 0.45, 0.65] : [0.35, 0.7, 0.75];
      const pos = this.posAt(s % this.length);
      const body = kinematicBody(sim, pos.clone().setY(pos.y + half[1]));
      const col = hazardCollider(sim, body, RAPIER.ColliderDesc.cuboid(...half), 'hazard', 0.3);
      visual.children[0].position.y = -half[1];
      sim.scene.add(visual);
      sim.physics.link(body, visual);
      this.cars.push({ body, col, visual, s: s % this.length, speed: this.maxSpeed, len: half[2] * 2 });
    }
  }

  private posAt(s: number) {
    return this.start.clone().addScaledVector(this.dir, s).addScaledVector(this.side, this.wiggle * Math.sin((s / 7) * Math.PI * 2));
  }

  preStep(dt: number) {
    const now = this.sim.time();
    for (const r of this.cars) {
      let want = this.maxSpeed;
      // snowplough to a crawl for a mover standing right in the way
      for (const p of this.sim.players ?? []) {
        const rel = p.bodyPos.clone().sub(this.posAt(r.s));
        const along = rel.dot(this.dir);
        const off = Math.abs(rel.dot(this.side));
        if (off < 1.4 && along > r.len / 2 && along < r.len / 2 + 4) want = Math.min(want, Math.max(1.0, (along - r.len / 2 - 0.8) * 1.5));
      }
      const acc = want > r.speed ? 3 : 10;
      r.speed += Math.max(-acc * dt, Math.min(acc * dt, want - r.speed));
      r.s += r.speed * dt;
      const t = r.body.translation();
      if (r.s > this.length) {
        r.s -= this.length;
        const p = this.posAt(r.s);
        r.body.setTranslation({ x: p.x, y: t.y, z: p.z }, true);
        this.sim.physics.snapLinks();
      }
      const p = this.posAt(r.s);
      // face along the slalom line
      const ahead = this.posAt(r.s + 0.5).sub(p);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(ahead.x, ahead.z));
      r.body.setNextKinematicTranslation({ x: p.x, y: t.y, z: p.z });
      r.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      bonkPlayers(this.sim, r.col, this.dir.clone().multiplyScalar(r.speed), 2.0, 5 + r.speed * 0.6, this.cool, now);
    }
  }

  update() {}

  dispose() {
    for (const r of this.cars) r.visual.removeFromParent();
  }
}
registerHazard('skiers', (o, sim) => new Skiers(o, sim));
registerHazard('riders', (o, sim) => new Skiers(o, sim));
