import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { registerHazard, Hazard } from './registry';
import { bonkPlayers, DEG, hazardCollider, kinematicBody, num, str, v3 } from './common';
import { glossy, matte } from '../../render/materials';
import { roundedBox } from '../../levels/LevelBuilder';
import { Player } from '../Player';
import { models } from '../../render/models';

// ------------------------------------------------------------------ traffic light

/**
 * Cycles green → yellow → red for cars on its tag; the pedestrian lamp shows
 * WALK while cars are red. params: tag, green, yellow, red, offset (s).
 */
class TrafficLight implements Hazard {
  private group = new THREE.Group();
  private lamps: THREE.MeshStandardMaterial[] = [];
  private walk: THREE.MeshStandardMaterial;
  private signalTag: string;
  private cycle: [number, number, number];
  private offset: number;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    this.signalTag = str(p, 'tag', o.tag ?? 'light');
    this.cycle = [num(p, 'green', 7), num(p, 'yellow', 1.6), num(p, 'red', 7)];
    this.offset = num(p, 'offset', 0);
    this.group.position.copy(v3(o.pos));
    this.group.rotation.y = (o.rot?.[1] ?? 0) * DEG;
    const metal = glossy(0x3b3f4a, 0.45, 0.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.4, 10), metal);
    pole.position.y = 1.7;
    pole.castShadow = true;
    const box = new THREE.Mesh(roundedBox([0.36, 0.95, 0.3], 0.06, 1), metal);
    box.position.y = 3.2;
    box.castShadow = true;
    this.group.add(pole, box);
    const colors = [0xff3b30, 0xffcc00, 0x34c759];
    colors.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0.05, roughness: 0.3 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), m);
      lamp.position.set(0, 3.5 - i * 0.29, 0.13);
      this.group.add(lamp);
      this.lamps.push(m);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 14, 1, true, 0, Math.PI), metal);
      visor.rotation.set(Math.PI / 2, 0, 0);
      visor.position.set(0, 3.5 - i * 0.29 + 0.03, 0.18);
      this.group.add(visor);
    });
    // pedestrian signal on the side
    this.walk = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 0.1 });
    const ped = new THREE.Mesh(roundedBox([0.28, 0.32, 0.18], 0.04, 1), metal);
    ped.position.set(0.22, 2.3, 0);
    const pedLamp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.24), this.walk);
    pedLamp.position.set(0.32, 2.3, 0);
    pedLamp.rotation.y = Math.PI / 2;
    this.group.add(ped, pedLamp);
    sim.scene.add(this.group);
  }

  state(): 'green' | 'yellow' | 'red' {
    const [g, y, r] = this.cycle;
    const t = (this.sim.time() + this.offset) % (g + y + r);
    return t < g ? 'green' : t < g + y ? 'yellow' : 'red';
  }

  preStep() {
    this.sim.signals?.set(this.signalTag, this.state());
  }

  update() {
    const s = this.state();
    const idx = s === 'red' ? 0 : s === 'yellow' ? 1 : 2;
    this.lamps.forEach((m, i) => (m.emissiveIntensity = i === idx ? 2.2 : 0.05));
    this.walk.emissive.set(s === 'red' ? 0x9cf7a3 : 0xff6b5b);
    this.walk.emissiveIntensity = 1.6;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
registerHazard('trafficLight', (o, sim) => new TrafficLight(o, sim));

// ------------------------------------------------------------------ car lane

interface Car {
  body: RigidBody;
  col: Collider;
  visual: THREE.Group;
  s: number;
  speed: number;
  len: number;
}

/**
 * A lane of cars driving from `pos` along `dir` for `length` metres, then
 * wrapping around. Cars stop at `stopAt` when the light `signal` isn't green,
 * keep their distance, and bonk movers who don't look both ways.
 * params: dirYaw (deg), length, speed, count, models[], stopAt, signal.
 */
class CarLane implements Hazard {
  private cars: Car[] = [];
  private start: THREE.Vector3;
  private dir: THREE.Vector3;
  private yaw: number;
  private length: number;
  private maxSpeed: number;
  private stopAt: number;
  private signal: string;
  private cool = new Map<Player, number>();
  private honkT = 0;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    this.start = v3(o.pos);
    this.yaw = num(p, 'dirYaw', 0) * DEG;
    this.dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.length = num(p, 'length', 40);
    this.maxSpeed = num(p, 'speed', 7);
    this.stopAt = num(p, 'stopAt', -1);
    this.signal = str(p, 'signal', '');
    const names = (p?.models as string[] | undefined) ?? ['muscleCar', 'redCar', 'taxi', 'minivan'];
    const count = num(p, 'count', 3);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    for (let i = 0; i < count; i++) {
      const name = names[i % names.length];
      const inst = models.instance(name);
      const [w, h, l] = inst.size;
      const s = (this.length / count) * i + num(p, 'phase', 0) * this.length;
      const pos = this.posAt(s % this.length, h);
      const body = kinematicBody(sim, pos, q);
      const col = hazardCollider(sim, body, RAPIER.ColliderDesc.cuboid(w / 2, h / 2, l / 2), 'hazard', 0.5);
      const visual = new THREE.Group();
      visual.add(inst.object);
      sim.scene.add(visual);
      sim.physics.link(body, visual);
      this.cars.push({ body, col, visual, s: s % this.length, speed: this.maxSpeed, len: l });
    }
    // lane is drawn by the level; we just add a faint stop line if needed
    if (this.stopAt > 0) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(3, 0.012, 0.28), matte(0xffffff));
      const lp = this.posAt(this.stopAt, 0);
      line.position.set(lp.x, this.start.y + 0.008, lp.z);
      line.rotation.y = this.yaw;
      line.receiveShadow = true;
      sim.scene.add(line);
      this.extra = line;
    }
  }
  private extra?: THREE.Object3D;

  private posAt(s: number, h: number) {
    return this.start.clone().addScaledVector(this.dir, s).add(new THREE.Vector3(0, h / 2, 0));
  }

  preStep(dt: number) {
    const light = this.signal ? this.sim.signals?.get(this.signal) ?? 'green' : 'green';
    const sorted = [...this.cars].sort((a, b) => a.s - b.s);
    const now = this.sim.time();
    for (let i = 0; i < sorted.length; i++) {
      const car = sorted[i];
      const ahead = sorted[(i + 1) % sorted.length];
      let gap = ahead.s - car.s;
      if (gap <= 0) gap += this.length;
      let want = this.maxSpeed;
      if (sorted.length > 1) {
        const free = gap - (car.len + ahead.len) / 2 - 1.8;
        want = Math.min(want, Math.max(0, free * 1.6));
      }
      if (light !== 'green' && this.stopAt > 0) {
        const nose = car.s + car.len / 2;
        const toLine = this.stopAt - 0.6 - nose;
        if (toLine > -0.5 && toLine < 14) want = Math.min(want, Math.max(0, toLine * 1.4));
      }
      // don't run people over: slow for movers standing in the lane right ahead
      for (const p of this.sim.players ?? []) {
        const rel = p.bodyPos.clone().sub(this.posAt(car.s, 0));
        const along = rel.dot(this.dir);
        const side = Math.abs(rel.x * this.dir.z - rel.z * this.dir.x);
        if (side < 1.6 && along > car.len / 2 && along < car.len / 2 + 5) {
          want = Math.min(want, Math.max(1.2, (along - car.len / 2 - 1.2) * 1.2));
          this.honkT -= dt;
          if (this.honkT <= 0) {
            this.honkT = 2.5;
            this.sim.events.emit('honk', { pos: p.bodyPos.clone() });
          }
        }
      }
      const acc = want > car.speed ? 4 : 12;
      car.speed += Math.max(-acc * dt, Math.min(acc * dt, want - car.speed));
      car.s += car.speed * dt;
      if (car.s > this.length) {
        car.s -= this.length;
        const p = this.posAt(car.s, car.visual.children[0] ? 0 : 0);
        const t = car.body.translation();
        car.body.setTranslation({ x: p.x, y: t.y, z: p.z }, true);
        this.sim.physics.snapLinks();
      }
      const pos = this.posAt(car.s, 0);
      const t = car.body.translation();
      car.body.setNextKinematicTranslation({ x: pos.x, y: t.y, z: pos.z });
      bonkPlayers(this.sim, car.col, this.dir.clone().multiplyScalar(car.speed), 2.2, 6 + car.speed * 0.6, this.cool, now);
    }
  }

  update() {}

  dispose() {
    for (const c of this.cars) c.visual.removeFromParent();
    this.extra?.removeFromParent();
  }
}
registerHazard('car', (o, sim) => new CarLane(o, sim));
