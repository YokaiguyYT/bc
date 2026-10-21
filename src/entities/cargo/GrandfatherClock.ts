import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { CrackLayer, drawGlassBase } from '../../render/cracks';
import { roundedBox } from '../../levels/LevelBuilder';
import { glossy, matte } from '../../render/materials';
import { surfaceTexture } from '../../render/textures';
import { clamp } from '../../util/math';

const H = 2.05;
const W = 0.56;
const D = 0.36;
const WAIST_W = 0.46;
const PIVOT_Y = 0.36;
const PEND_L = 0.66;
const FACE_Y = 0.7;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function drawFace(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f7efdc';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2a1c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 104, 0, Math.PI * 2);
  ctx.stroke();
  const numerals = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = '#3a2a1c';
  ctx.font = '700 22px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  numerals.forEach((n, i) => {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(128 + Math.cos(a) * 88, 128 + Math.sin(a) * 88);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(n, 0, 0);
    ctx.restore();
  });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 5 ? 112 : 108;
    ctx.beginPath();
    ctx.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0);
    ctx.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118);
    ctx.lineWidth = i % 5 ? 1.5 : 3;
    ctx.stroke();
  }
  ctx.font = '600 13px Georgia, serif';
  ctx.fillText('FREIGHT & SONS', 128, 168);
  return c;
}

/**
 * A tall, heavy grandfather clock. It doesn't fit through doors standing up.
 * The pendulum really swings with the clock's motion and bongs against the
 * case when you jostle it.
 */
export class GrandfatherClock extends Cargo {
  readonly kind = 'clock' as const;
  readonly displayName = 'Grandfather Clock';
  readonly value = 1500;
  readonly tip = 'It is long and heavy: carry it end to end, and swing wide round corners.';
  readonly fragility: Fragility = { safeShock: 1.9, perShock: 0.085, maxPerHit: 0.28, spinLimit: 3.5, spinDamage: 0.05 };

  private pendulum!: THREE.Group;
  private phi = 0.12;
  private phiVel = 0;
  private hourHand!: THREE.Mesh;
  private minuteHand!: THREE.Mesh;
  private clockMinutes = 10 * 60 + 10;
  private handSpin = 0;
  private faceGroup!: THREE.Group;
  private doorCracks!: CrackLayer;
  private lastTickSide = 1;
  private bongCooldown = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 1.0;
    this.material = 'wood';
    this.init(opts);
  }

  protected buildColliders() {
    // heavy, and heavier at the base end — but one mover can still lift either end
    const m = 26;
    const inertia = { x: (m / 12) * (H * H + D * D), y: (m / 12) * (W * W + D * D), z: (m / 12) * (W * W + H * H) };
    this.addCollider(
      RAPIER.ColliderDesc.cuboid(W / 2, H / 2, D / 2).setMassProperties(m, { x: 0, y: -0.2, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 }),
      0.7,
    );
  }

  protected buildVisual() {
    const wood = matte(0x6e3f22, { map: surfaceTexture('planks'), key: 'clockwood' });
    const trim = matte(0x4a2814, { roughness: 0.7 });
    const brass = glossy(0xd9a93f, 0.3, 0.85);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.visual) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const baseH = 0.43;
    const hoodH = 0.58;
    const waistH = H - baseH - hoodH - 0.04;
    const yBase = -H / 2 + baseH / 2;
    const yWaist = -H / 2 + baseH + waistH / 2;
    const yHood = -H / 2 + baseH + waistH + hoodH / 2;
    add(roundedBox([W, baseH, D], 0.03, 0.8), wood, 0, yBase, 0);
    add(roundedBox([W + 0.04, 0.05, D + 0.04], 0.015, 1), trim, 0, -H / 2 + 0.025, 0);
    add(roundedBox([WAIST_W, waistH, D - 0.04], 0.025, 0.8), wood, 0, yWaist, -0.01);
    add(roundedBox([W + 0.02, 0.05, D + 0.02], 0.015, 1), trim, 0, -H / 2 + baseH, 0);
    add(roundedBox([W, hoodH, D], 0.03, 0.8), wood, 0, yHood, 0);
    add(roundedBox([W + 0.04, 0.05, D + 0.04], 0.015, 1), trim, 0, yHood - hoodH / 2, 0);
    // crown: a little arched pediment and brass finials
    const crown = add(new THREE.CylinderGeometry(W / 2, W / 2, D - 0.02, 24, 1, false, -Math.PI / 2, Math.PI), trim, 0, H / 2 - 0.04, 0);
    crown.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    crown.scale.set(1, 1, 0.35);
    for (const x of [-W / 2 + 0.04, 0, W / 2 - 0.04]) add(new THREE.SphereGeometry(0.035, 10, 8), brass, x, H / 2 + (x === 0 ? 0.08 : 0.01), 0);

    // face
    this.faceGroup = new THREE.Group();
    this.faceGroup.position.set(0, FACE_Y, D / 2 + 0.006);
    this.visual.add(this.faceGroup);
    const faceTex = new THREE.CanvasTexture(drawFace());
    faceTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.19, 40), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.6 }));
    this.faceGroup.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.014, 8, 40), brass);
    this.faceGroup.add(ring);
    const handMat = matte(0x1d1612, { roughness: 0.5 });
    const hg = new THREE.BoxGeometry(0.018, 0.1, 0.006);
    hg.translate(0, 0.045, 0);
    const mg = new THREE.BoxGeometry(0.012, 0.15, 0.006);
    mg.translate(0, 0.065, 0);
    this.hourHand = add(hg, handMat, 0, 0, 0.008, this.faceGroup);
    this.minuteHand = add(mg, handMat, 0, 0, 0.013, this.faceGroup);
    add(new THREE.SphereGeometry(0.014, 8, 6), brass, 0, 0, 0.016, this.faceGroup);

    // pendulum behind a glass door
    this.pendulum = new THREE.Group();
    this.pendulum.position.set(0, PIVOT_Y, D / 2 - 0.065);
    this.visual.add(this.pendulum);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.014, PEND_L, 0.008), brass);
    rod.position.y = -PEND_L / 2;
    this.pendulum.add(rod);
    const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.018, 24), brass);
    bob.rotation.x = Math.PI / 2;
    bob.position.y = -PEND_L;
    this.pendulum.add(bob);
    // dark interior so the pendulum reads
    add(new THREE.PlaneGeometry(WAIST_W - 0.12, waistH - 0.14), matte(0x2a1a10), 0, yWaist, D / 2 - 0.09);
    this.doorCracks = new CrackLayer(192, 384, drawGlassBase);
    const door = new THREE.Mesh(
      new THREE.PlaneGeometry(WAIST_W - 0.1, waistH - 0.12),
      new THREE.MeshStandardMaterial({ map: this.doorCracks.texture, transparent: true, roughness: 0.1, depthWrite: false }),
    );
    door.position.set(0, yWaist, D / 2 - 0.018);
    door.renderOrder = 3;
    this.visual.add(door);
    // door frame
    const fw = 0.03;
    for (const [w, h, x, y] of [
      [WAIST_W - 0.06, fw, 0, yWaist + (waistH - 0.1) / 2],
      [WAIST_W - 0.06, fw, 0, yWaist - (waistH - 0.1) / 2],
      [fw, waistH - 0.1, (WAIST_W - 0.08) / 2, yWaist],
      [fw, waistH - 0.1, -(WAIST_W - 0.08) / 2, yWaist],
    ])
      add(roundedBox([w, h, 0.02], 0.006, 1), trim, x, y, D / 2 - 0.012);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    // pendulum swinging in the clock's own X-Y plane under the felt gravity
    const g = this.gEff;
    const acc = (g.x * Math.cos(this.phi) + g.y * Math.sin(this.phi)) / PEND_L;
    this.phiVel += (acc - this.phiVel * 0.15) * dt;
    // escapement: a tiny push each swing keeps it ticking
    if (Math.abs(this.phi) < 0.03 && Math.abs(this.phiVel) < 1.2) this.phiVel += Math.sign(this.phiVel || 1) * 0.6 * dt * 30 * 0.05;
    this.phi += this.phiVel * dt;
    const lim = 0.36;
    this.bongCooldown -= dt;
    if (Math.abs(this.phi) > lim) {
      const hit = Math.abs(this.phiVel);
      this.phi = Math.sign(this.phi) * lim;
      this.phiVel *= -0.35;
      if (hit > 1.6 && this.bongCooldown <= 0) {
        this.bongCooldown = 0.35;
        this.sim.events.emit('chime', { pos: this.position(new THREE.Vector3()) });
      }
    }
    const side = Math.sign(this.phi);
    if (side !== this.lastTickSide && side !== 0) {
      this.lastTickSide = side;
      this.sim.events.emit('tick', { pos: this.position(new THREE.Vector3()), tock: side > 0 });
    }
  }

  update(dt: number) {
    this.pendulum.rotation.z = this.phi;
    // the clock runs very fast; damage makes the hands go haywire
    const h = this.destroyed ? 0 : this.health;
    this.handSpin = this.handSpin * Math.exp(-dt * 0.8);
    const speed = 1 + (h < 0.4 ? (0.4 - h) * 200 : 0) + this.handSpin;
    this.clockMinutes += dt * speed;
    this.minuteHand.rotation.z = -(this.clockMinutes / 60) * Math.PI * 2;
    this.hourHand.rotation.z = -(this.clockMinutes / 720) * Math.PI * 2;
  }

  protected onDamage(amount: number, point: THREE.Vector3, shock: number) {
    this.handSpin += amount * 400;
    this.phiVel += (Math.random() - 0.5) * 4 * Math.min(1, shock / 3);
    const t = this.body.translation();
    const r = this.body.rotation();
    const local = point.clone().sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert());
    this.doorCracks.crack(clamp(local.x / WAIST_W + 0.5, 0.1, 0.9), clamp((local.y + 0.15) / 1.0 + 0.5, 0.1, 0.9), clamp(amount * 3, 0.15, 0.9));
    if (shock > 2.2) this.sim.events.emit('chime', { pos: point.clone() });
    if (this.health < 0.5) this.faceGroup.rotation.z = (Math.random() - 0.5) * 0.4 * (1 - this.health);
  }

  protected onBreak() {
    const fx = this.sim.fx;
    const p = this.visual.localToWorld(new THREE.Vector3(0, FACE_Y, D / 2));
    this.faceGroup.visible = false;
    this.pendulum.visible = false;
    this.doorCracks.crack(0.5, 0.5, 1);
    this.sim.events.emit('chime', { pos: p.clone() });
    if (!fx) return;
    fx.burst('gear', p, { count: 14, speed: 3.5, up: 1.5, size: 0.06, sizeVar: 0.5, life: 2.5, gravity: 11, colors: [0xd9a93f, 0xc0c0c8, 0xb8862f] });
    fx.burst('chunk', p, { count: 12, speed: 2.5, up: 1, size: 0.07, life: 2.5, gravity: 11, colors: [0x6e3f22, 0x4a2814] });
    fx.burst('shard', p, { count: 20, speed: 2, up: 0.8, size: 0.05, life: 2, gravity: 11, colors: [0xd6f4ff, 0xffffff] });
  }
}
