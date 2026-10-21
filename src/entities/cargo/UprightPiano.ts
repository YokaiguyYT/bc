import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { roundedBox } from '../../levels/LevelBuilder';
import { glossy, matte } from '../../render/materials';

/** Cabinet: W wide (x), H tall, D deep (z); the keyboard sticks out at +Z. */
const W = 1.5;
const H = 1.24;
const D = 0.6;
/** Castor balls under the four corners: the cabinet rides this high. */
const CASTOR_R = 0.05;
const RIDE = H / 2 + 2 * CASTOR_R - 0.01;
const KEYS_Y = -0.02;
const MASS = 100;

const _v = new THREE.Vector3();

/** Piano keys, seen from above: 52 white keys with the black ones in twos and threes. */
function keysTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fbf8ef';
  ctx.fillRect(0, 0, 1024, 128);
  const n = 52;
  const kw = 1024 / n;
  ctx.strokeStyle = 'rgba(60,50,40,0.5)';
  ctx.lineWidth = 2;
  for (let i = 1; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(i * kw, 0);
    ctx.lineTo(i * kw, 128);
    ctx.stroke();
  }
  ctx.fillStyle = '#1d1a1f';
  for (let i = 0; i < n - 1; i++) {
    const inOctave = (i + 5) % 7; // start the pattern on A, like a real piano
    if (inOctave === 2 || inOctave === 6) continue; // no black key between B-C and E-F
    ctx.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, 78);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { tex: t, ctx, kw };
}

/**
 * An upright piano on castors. It's far too heavy to lift: movers push and
 * pull it, and it rolls by itself wherever the floor slopes. Knocks pop keys
 * out, a bad one flips the lid open, and at 0% it falls to bits.
 */
export class UprightPiano extends Cargo {
  readonly kind = 'piano' as const;
  readonly displayName = 'Upright Piano';
  readonly value = 1800;
  readonly tip = 'Too heavy to lift: push it, and hold it back on hills. Let go on a slope and it’s off!';
  readonly fragility: Fragility = { safeShock: 1.6, perShock: 0.12, maxPerHit: 0.3, spinLimit: 2.2, spinDamage: 0.08 };
  readonly liftable = false;

  private keys!: ReturnType<typeof keysTexture>;
  private lid!: THREE.Group;
  private lidOpen = 0;
  private lidV = 0;
  private gone = new Set<number>();

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.8;
    this.material = 'wood';
    this.init(opts);
    this.body.setLinearDamping(0.25);
    this.body.setAngularDamping(1.2);
  }

  protected buildColliders() {
    // the cabinet carries the weight, low down (the iron frame), so it doesn't tip at a touch
    const m = MASS - 4;
    this.addCollider(
      RAPIER.ColliderDesc.cuboid(W / 2, H / 2, D / 2).setMassProperties(
        m,
        { x: 0, y: -0.28, z: -0.04 },
        { x: (m / 12) * (H * H + D * D), y: (m / 12) * (W * W + D * D), z: (m / 12) * (W * W + H * H) },
        { x: 0, y: 0, z: 0, w: 1 },
      ),
      0.6,
    );
    // the keyboard shelf: something to bump into and to grab
    this.addCollider(RAPIER.ColliderDesc.cuboid(W / 2 - 0.04, 0.05, 0.15).setTranslation(0, KEYS_Y, D / 2 + 0.15).setMass(2), 0.6);
    // swivel castors: almost no friction, in any direction (Rapier averages two
    // surfaces' friction unless told otherwise: take the castor's, the lower)
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const c = this.addCollider(RAPIER.ColliderDesc.ball(CASTOR_R).setTranslation(x * (W / 2 - 0.1), -H / 2 - CASTOR_R + 0.01, z * (D / 2 - 0.08)).setMass(0.5), 0.015);
        c.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
      }
  }

  protected buildVisual() {
    const wood = glossy(0x6e3a22, 0.35, 0.05);
    const trim = glossy(0xd9a93f, 0.3, 0.8);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.visual.add(m);
      return m;
    };
    add(roundedBox([W, H, D], 0.03, 1), wood, 0, 0, 0);
    // front panel insets with brass trim
    for (const x of [-0.4, 0.4]) {
      add(roundedBox([0.6, 0.42, 0.02], 0.01, 1), glossy(0x84492a, 0.3, 0.05), x, 0.33, D / 2 + 0.005);
      add(new THREE.BoxGeometry(0.62, 0.015, 0.025), trim, x, 0.55, D / 2 + 0.01);
    }
    // keybed and keys
    add(roundedBox([W - 0.02, 0.09, 0.32], 0.02, 1), wood, 0, KEYS_Y - 0.01, D / 2 + 0.15);
    this.keys = keysTexture();
    const keyTop = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, 0.2), new THREE.MeshStandardMaterial({ map: this.keys.tex, roughness: 0.4 }));
    keyTop.rotation.x = -Math.PI / 2;
    keyTop.position.set(0, KEYS_Y + 0.037, D / 2 + 0.17);
    this.visual.add(keyTop);
    // cheek pillars and toe blocks
    for (const x of [-1, 1]) {
      add(roundedBox([0.07, 0.12, 0.34], 0.02, 1), wood, x * (W / 2 - 0.035), KEYS_Y + 0.03, D / 2 + 0.15);
      add(roundedBox([0.07, 0.5, 0.07], 0.02, 1), wood, x * (W / 2 - 0.08), -H / 2 + 0.27, D / 2 + 0.24);
      add(roundedBox([0.1, 0.06, 0.12], 0.02, 1), wood, x * (W / 2 - 0.08), -H / 2 + 0.03, D / 2 + 0.24);
    }
    // music stand, pedals, castors
    const stand = add(roundedBox([0.7, 0.24, 0.025], 0.01, 1), glossy(0x84492a, 0.3, 0.05), 0, 0.24, D / 2 + 0.05);
    stand.rotation.x = -0.25;
    for (const x of [-0.08, 0.08]) add(new THREE.BoxGeometry(0.05, 0.02, 0.12), trim, x, -H / 2 + 0.1, D / 2 + 0.07);
    for (const x of [-1, 1]) for (const z of [-1, 1]) add(new THREE.SphereGeometry(CASTOR_R, 10, 8), matte(0x1d1a1f), x * (W / 2 - 0.1), -H / 2 - CASTOR_R + 0.01, z * (D / 2 - 0.08));
    // the lid hinges at the back of the top
    this.lid = new THREE.Group();
    this.lid.position.set(0, H / 2, -D / 2);
    const lidBoard = new THREE.Mesh(roundedBox([W + 0.02, 0.04, D + 0.02], 0.015, 1), wood);
    lidBoard.position.set(0, 0.02, D / 2);
    lidBoard.castShadow = true;
    this.lid.add(lidBoard);
    this.visual.add(this.lid);
  }

  /** The castors' height: a piano spawned at y sits with its cabinet centre this far up. */
  static readonly rideHeight = RIDE;

  update(dt: number) {
    // the lid flaps when knocked open, and settles back
    this.lidV += (-this.lidOpen * (this.lidOpen > 0.9 ? 0 : 30) - this.lidV * 5) * dt;
    this.lidOpen = Math.max(0, Math.min(1.9, this.lidOpen + this.lidV * dt));
    this.lid.rotation.x = -this.lidOpen;
    if (this.destroyed) {
      this.status = null;
      return;
    }
    const v = this.body.linvel();
    const runaway = Math.hypot(v.x, v.z) > 2.2 && !this.sim.grips.isHeld(this.body);
    this.status = runaway ? '🎹 Runaway piano!' : null;
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    // keys pop out
    const n = Math.min(6, 1 + Math.floor(amount * 25));
    const ctx = this.keys.ctx;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(Math.random() * 52);
      if (this.gone.has(k)) continue;
      this.gone.add(k);
      ctx.fillStyle = '#2a1c14';
      ctx.fillRect(k * this.keys.kw + 2, 0, this.keys.kw - 4, 128);
    }
    this.keys.tex.needsUpdate = true;
    this.sim.fx?.burst('chunk', point, { count: n + 2, speed: 2, up: 1.4, size: 0.04, life: 1.8, gravity: 11, colors: [0xfbf8ef, 0x1d1a1f, 0x6e3a22] });
    // a big knock throws the lid open
    if (amount > 0.08) this.lidV += 6 + amount * 20;
  }

  protected onBreak() {
    const p = this.position(_v);
    this.sim.fx?.burst('chunk', p, { count: 60, speed: 3.4, up: 1.6, size: 0.08, sizeVar: 0.6, life: 3, gravity: 11, spread: 0.6, colors: [0x6e3a22, 0x84492a, 0xfbf8ef, 0x1d1a1f, 0xd9a93f] });
    // every last key goes
    const ctx = this.keys.ctx;
    ctx.fillStyle = '#2a1c14';
    ctx.fillRect(0, 0, 1024, 128);
    this.keys.tex.needsUpdate = true;
    this.lidV += 12;
  }
}
