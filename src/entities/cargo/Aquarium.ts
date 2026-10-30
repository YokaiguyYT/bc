import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { CrackLayer } from '../../render/cracks';
import { roundedBox } from '../../levels/LevelBuilder';
import { glossy, jelly, matte } from '../../render/materials';
import { surfaceTexture } from '../../render/textures';
import { clamp } from '../../util/math';
import { Wobble } from '../../util/wobble';

const W = 0.9;
const H = 0.55;
const D = 0.42;
const WALL = 0.015;
const IW = W - WALL * 2;
const ID = D - WALL * 2;
const BOTTOM = -H / 2 + 0.06; // inner floor (top of the gravel)
const RIM = H / 2 - 0.02; // water spills over this height
const INNER_H = RIM - BOTTOM;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
/** PlaneGeometry faces +Z; this lays it flat facing +Y. */
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

interface Fish {
  mesh: THREE.Group;
  phase: number;
  speed: number;
  radius: number;
  height: number;
  // after the tank breaks
  free?: { pos: THREE.Vector3; vel: THREE.Vector3; ground: number; t: number };
}

/**
 * A fish tank. The water surface tilts with whatever the tank is doing (a
 * tilting plane driven by a damped spring); if it rises past the rim, water
 * spills out — and spilled water is lost money.
 */
export class Aquarium extends Cargo {
  readonly kind = 'aquarium' as const;
  readonly displayName = 'Aquarium';
  readonly value = 900;
  readonly tip = 'Water sloshes! Start and stop gently or it spills (and spills cost money).';
  readonly fragility: Fragility = { safeShock: 1.9, perShock: 0.1, maxPerHit: 0.3, spinLimit: 0, spinDamage: 0 };

  /** Water height above the inner floor, fraction of the inner height. */
  water = 0.62;
  private readonly startWater = 0.62;
  private slosh = new Wobble(1.25, 0.18, 1.4);
  private waterMesh!: THREE.Mesh;
  private waterBase!: Float32Array;
  private surface!: THREE.Mesh;
  private cracks!: CrackLayer;
  private fish: Fish[] = [];
  private col!: Collider;
  private splashCooldown = 0;
  private spilledTotal = 0;
  private bubbles!: THREE.InstancedMesh;
  private bubbleT = new Float32Array(10);

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.5;
    this.material = 'glass';
    this.init(opts);
  }

  private massNow() {
    return 9 + 21 * (this.water / this.startWater);
  }

  protected buildColliders() {
    this.col = this.addCollider(RAPIER.ColliderDesc.cuboid(W / 2, H / 2, D / 2).setMass(this.massNow()), 0.65);
  }

  protected buildVisual() {
    const add = (obj: THREE.Mesh, x = 0, y = 0, z = 0) => {
      obj.position.set(x, y, z);
      obj.castShadow = true;
      obj.receiveShadow = true;
      this.visual.add(obj);
      return obj;
    };
    const black = glossy(0x24242c, 0.35, 0.2);
    // base and rim
    add(new THREE.Mesh(roundedBox([W + 0.02, 0.05, D + 0.02], 0.015, 1), black), 0, -H / 2 + 0.025, 0);
    for (const [w, d, x, z] of [
      [W + 0.02, 0.03, 0, D / 2],
      [W + 0.02, 0.03, 0, -D / 2],
      [0.03, D + 0.02, W / 2, 0],
      [0.03, D + 0.02, -W / 2, 0],
    ])
      add(new THREE.Mesh(roundedBox([w, 0.03, d], 0.01, 1), black), x, H / 2 - 0.015, z);
    // gravel, castle, plants
    const gravel = matte(0xd8b98a, { map: surfaceTexture('dots'), key: 'gravel' });
    add(new THREE.Mesh(new THREE.BoxGeometry(IW, 0.035, ID), gravel), 0, BOTTOM - 0.017, 0);
    const stone = matte(0xb8b2a8);
    const castle = new THREE.Group();
    castle.position.set(0.22, BOTTOM, -0.05);
    for (const [x, h] of [
      [-0.05, 0.13],
      [0.05, 0.17],
    ]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, h, 10), stone);
      t.position.set(x, h / 2, 0);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.06, 10), matte(0xd06a5a));
      roof.position.y = h / 2 + 0.03;
      t.add(roof);
      castle.add(t);
    }
    this.visual.add(castle);
    const green = matte(0x4fb36b);
    for (const [x, z, h] of [
      [-0.3, -0.1, 0.22],
      [-0.25, 0.08, 0.16],
      [-0.12, -0.12, 0.26],
      [0.34, 0.1, 0.18],
    ]) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.03, h, 6), green);
      p.position.set(x, BOTTOM + h / 2, z);
      this.visual.add(p);
    }

    // water: a box whose top corners follow the tilted surface plane
    const wg = new THREE.BoxGeometry(IW - 0.004, 1, ID - 0.004, 6, 1, 3);
    wg.translate(0, 0.5, 0);
    this.waterBase = (wg.attributes.position as THREE.BufferAttribute).array.slice() as Float32Array;
    this.waterMesh = new THREE.Mesh(
      wg,
      new THREE.MeshStandardMaterial({ color: 0x48b7e6, transparent: true, opacity: 0.5, roughness: 0.12, depthWrite: false }),
    );
    this.waterMesh.position.y = BOTTOM;
    this.waterMesh.renderOrder = 2;
    this.visual.add(this.waterMesh);
    // brighter surface sheet so the slosh reads from above
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(IW - 0.006, ID - 0.006, 6, 3),
      new THREE.MeshStandardMaterial({ color: 0xa8e8ff, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.surface.quaternion.copy(FLAT);
    this.surface.renderOrder = 2;
    this.visual.add(this.surface);

    // fish
    const fishColors = [0xff8a2a, 0xffd23f, 0xff5b7a];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Group();
      const mat = jelly(fishColors[i], 0.3);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mat);
      body.scale.set(1.5, 1, 0.6);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.04, 4), mat);
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.06;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eye.position.set(0.035, 0.01, 0.018);
      const eye2 = eye.clone();
      eye2.position.z = -0.018;
      f.add(body, tail, eye, eye2);
      this.visual.add(f);
      this.fish.push({ mesh: f, phase: i * 2.1, speed: 0.7 + i * 0.25, radius: 0.16 + i * 0.06, height: 0.25 + i * 0.22 });
    }

    // bubbles
    this.bubbles = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.008, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
      10,
    );
    for (let i = 0; i < 10; i++) this.bubbleT[i] = Math.random();
    this.visual.add(this.bubbles);

    // glass walls (front gets the crack layer)
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdff6ff,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const box = new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.05, D), glassMat);
    box.position.y = 0.0;
    box.renderOrder = 3;
    this.visual.add(box);
    this.cracks = new CrackLayer(384, 256, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.0)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h);
      ctx.lineTo(w * 0.17, h);
      ctx.lineTo(w * 0.42, 0);
      ctx.lineTo(w * 0.35, 0);
      ctx.fill();
    });
    for (const s of [1, -1]) {
      const front = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H - 0.05),
        new THREE.MeshBasicMaterial({ map: this.cracks.texture, transparent: true, depthWrite: false }),
      );
      front.position.z = (s * D) / 2 + s * 0.002;
      if (s < 0) front.rotation.y = Math.PI;
      front.renderOrder = 4;
      this.visual.add(front);
    }
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    const g = this.gEff;
    // surface slope that would be level with the felt gravity
    let tx = this.slosh.x;
    let tz = this.slosh.y;
    if (g.y < -1.5) {
      tx = clamp(-g.x / g.y, -1.4, 1.4);
      tz = clamp(-g.z / g.y, -1.4, 1.4);
    }
    this.slosh.step(dt, tx, tz);
    // upside down: it all pours out
    const pourAll = g.y > 0.5;
    // highest corner vs rim
    const sx = this.slosh.x;
    const sz = this.slosh.y;
    const level = this.water * INNER_H;
    const peak = level + Math.abs(sx) * (IW / 2) + Math.abs(sz) * (ID / 2);
    const over = pourAll ? INNER_H : peak - INNER_H;
    this.splashCooldown -= dt;
    if (over > 0 && this.water > 0.02) {
      const spill = Math.min(this.water, (over / INNER_H) * dt * 0.9 + (pourAll ? dt * 1.5 : 0));
      this.water -= spill;
      this.spilledTotal += spill;
      this.col.setMass(this.massNow());
      // spilled water is lost money (all of it ≈ 70% of the value)
      this.damage((spill / this.startWater) * 0.7, 0, this.cornerWorld(sx, sz));
      if (this.splashCooldown <= 0) {
        this.splashCooldown = 0.12;
        const p = this.cornerWorld(sx, sz);
        this.sim.events.emit('splash', { pos: p, amount: Math.min(1, spill * 30) });
      }
    }
  }

  netState() {
    const w = this.slosh;
    return [this.water, w.x, w.y, w.vx, w.vy];
  }

  applyNetState(s: number[]) {
    [this.water, this.slosh.x, this.slosh.y, this.slosh.vx, this.slosh.vy] = s;
  }

  /** World position of the rim corner the water is piling up against. */
  private cornerWorld(sx: number, sz: number) {
    const local = new THREE.Vector3(Math.sign(sx || 1) * (IW / 2), RIM, Math.sign(sz || 1) * (ID / 2));
    return this.visual.localToWorld(local);
  }

  update(dt: number, time: number) {
    // water mesh
    const pos = (this.waterMesh.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const base = this.waterBase;
    const level = Math.max(0.001, this.water * INNER_H);
    const sx = this.destroyed ? 0 : this.slosh.x;
    const sz = this.destroyed ? 0 : this.slosh.y;
    const ripple = Math.min(0.012, Math.hypot(this.slosh.vx, this.slosh.vy) * 0.004);
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const z = base[i * 3 + 2];
      if (y > 0.5) {
        // surface plane: h = level + sx·x + sz·z (sx = -g.x/g.y, so water piles up away from the push)
        const h = clamp(level + sx * x + sz * z + Math.sin(time * 9 + x * 20) * ripple, 0.002, INNER_H);
        pos.setY(i, h);
      } else pos.setY(i, 0);
    }
    pos.needsUpdate = true;
    this.waterMesh.geometry.computeVertexNormals();
    this.waterMesh.visible = this.water > 0.01 && !this.destroyed;
    this.surface.visible = this.waterMesh.visible;
    // tilt the surface sheet to match
    this.surface.position.set(0, BOTTOM + level, 0);
    const n = _v.set(-sx, 1, -sz).normalize();
    this.surface.quaternion.setFromUnitVectors(UP, n).multiply(FLAT);

    // fish
    for (const f of this.fish) {
      if (f.free) {
        const fr = f.free;
        fr.t += dt;
        fr.vel.y -= 11 * dt;
        fr.pos.addScaledVector(fr.vel, dt);
        if (fr.pos.y < fr.ground + 0.03) {
          fr.pos.y = fr.ground + 0.03;
          // flop!
          fr.vel.set((Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.2).multiplyScalar(fr.t < 6 ? 1 : 0.2);
        }
        f.mesh.position.copy(fr.pos);
        f.mesh.rotation.set(Math.sin(fr.t * 18) * 0.8, fr.t * 3, Math.PI / 2 + Math.sin(fr.t * 11) * 0.5);
        continue;
      }
      f.phase += dt * f.speed;
      const wh = Math.max(0.02, this.water * INNER_H);
      const y = BOTTOM + Math.min(wh * f.height, wh - 0.03) + Math.sin(f.phase * 2.3) * 0.01;
      if (this.water < 0.25) {
        // gasping at the bottom
        f.mesh.position.set(Math.cos(f.phase) * 0.15, BOTTOM + 0.03 + Math.abs(Math.sin(time * 6 + f.phase)) * 0.05, Math.sin(f.phase) * 0.08);
        f.mesh.rotation.set(0, f.phase, Math.sin(time * 14) * 0.6);
      } else {
        f.mesh.position.set(Math.cos(f.phase) * f.radius * 1.4, y, Math.sin(f.phase) * f.radius * 0.6);
        f.mesh.rotation.set(0, -f.phase - Math.PI / 2, Math.sin(time * 8 + f.phase) * 0.15);
      }
    }

    // bubbles from the castle
    const m = new THREE.Matrix4();
    for (let i = 0; i < 10; i++) {
      this.bubbleT[i] = (this.bubbleT[i] + dt * (0.25 + (i % 3) * 0.07)) % 1;
      const t = this.bubbleT[i];
      const wh = this.water * INNER_H;
      const y = BOTTOM + 0.16 + t * Math.max(0, wh - 0.16);
      const vis = !this.destroyed && wh > 0.18;
      m.makeTranslation(0.27 + Math.sin(t * 20 + i) * 0.01, y, -0.05 + (i % 2) * 0.02);
      if (!vis) m.makeScale(0, 0, 0);
      this.bubbles.setMatrixAt(i, m);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  protected onDamage(amount: number, point: THREE.Vector3, shock: number) {
    if (shock <= 0) return; // spills don't crack the glass
    const t = this.body.translation();
    const r = this.body.rotation();
    const local = point.clone().sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert());
    this.cracks.crack(clamp(local.x / W + 0.5, 0.05, 0.95), clamp(local.y / H + 0.5, 0.05, 0.95), clamp(amount * 3, 0.15, 0.9));
    this.slosh.kick((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  }

  protected onBreak() {
    const fx = this.sim.fx;
    const center = this.visual.localToWorld(new THREE.Vector3(0, 0, 0));
    if (fx) {
      fx.burst('shard', center, { count: 50, speed: 3, up: 1, size: 0.06, life: 2.4, gravity: 11, spread: 0.5, colors: [0xd6f4ff, 0xffffff] });
      fx.burst('drop', center, { count: 90, speed: 3.5, up: 1.2, size: 0.025, sizeVar: 0.6, life: 1.4, gravity: 11, spread: 0.5, colors: [0x7fd6ff, 0xbfeaff] });
    }
    this.sim.events.emit('splash', { pos: center, amount: 1 });
    this.water = 0;
    // fish escape (and flop sadly)
    const ground = fx?.groundAt ? fx.groundAt(center.x, center.y, center.z) : center.y - 0.5;
    for (const f of this.fish) {
      const wp = f.mesh.getWorldPosition(new THREE.Vector3());
      this.visual.remove(f.mesh);
      this.sim.scene.add(f.mesh);
      f.free = { pos: wp, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), ground, t: 0 };
    }
  }

  dispose() {
    for (const f of this.fish) f.mesh.removeFromParent();
    super.dispose();
  }
}
