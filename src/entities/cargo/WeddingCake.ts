import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { glossy, jelly } from '../../render/materials';
import { clamp } from '../../util/math';
import { Wobble } from '../../util/wobble';

const BOARD_R = 0.37;
const BOARD_H = 0.035;
const TIERS: { r: number; h: number }[] = [
  { r: 0.3, h: 0.2 },
  { r: 0.22, h: 0.17 },
  { r: 0.145, h: 0.15 },
];

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

interface Tier {
  group: THREE.Group;
  baseY: number;
  wobble: Wobble;
  /** permanent smush from damage */
  offset: THREE.Vector2;
  squash: number;
  r: number;
  h: number;
}

/**
 * Three tiers of extremely nervous frosting on a silver board. Jiggles when
 * moved, squishes and slides with damage, and hates being tilted.
 */
export class WeddingCake extends Cargo {
  readonly kind = 'cake' as const;
  readonly displayName = 'Wedding Cake';
  readonly value = 1200;
  readonly tip = 'Super fragile! Keep the cake LEVEL and never let it bump anything.';
  readonly fragility: Fragility = { safeShock: 0.95, perShock: 0.22, maxPerHit: 0.35, spinLimit: 2.4, spinDamage: 0.12 };
  /** Light, but nobody sprints off with a wedding cake: keyboard starts and stops would slide the frosting. */
  readonly care = 1;

  private tiers: Tier[] = [];
  private topper!: THREE.Group;
  private topperWobble = new Wobble(2.0, 0.07, 1.2);
  private topperFree: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; ground: number; t: number } | null = null;
  private splats: THREE.Group;
  private frosting!: THREE.Material;
  private pink!: THREE.Material;
  private tiltTimer = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.4;
    this.material = 'cake';
    this.splats = new THREE.Group();
    this.init(opts);
  }

  protected buildColliders() {
    this.addCollider(RAPIER.ColliderDesc.cylinder(BOARD_H / 2, BOARD_R).setMass(1.2), 0.8);
    let y = BOARD_H / 2;
    for (const t of TIERS) {
      this.addCollider(RAPIER.ColliderDesc.cylinder(t.h / 2, t.r).setTranslation(0, y + t.h / 2, 0).setMass(2.2), 0.9);
      y += t.h;
    }
  }

  protected buildVisual() {
    const silver = glossy(0xd9dde3, 0.25, 0.8);
    this.frosting = jelly(0xfff8ef, 0.35);
    this.pink = jelly(0xff9fb8, 0.4);
    const pearl = glossy(0xfffdf6, 0.2, 0.1);
    const board = new THREE.Mesh(new THREE.CylinderGeometry(BOARD_R, BOARD_R, BOARD_H, 40), silver);
    board.castShadow = board.receiveShadow = true;
    this.visual.add(board);
    // doily edge
    const doily = new THREE.Mesh(new THREE.TorusGeometry(BOARD_R - 0.01, 0.012, 6, 40), pearl);
    doily.rotation.x = Math.PI / 2;
    doily.position.y = BOARD_H / 2;
    this.visual.add(doily);

    let y = BOARD_H / 2;
    TIERS.forEach((t, i) => {
      const g = new THREE.Group();
      g.position.y = y;
      const cake = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r * 1.01, t.h, 36), this.frosting);
      cake.position.y = t.h / 2;
      cake.castShadow = cake.receiveShadow = true;
      g.add(cake);
      // piped border at the bottom
      const piping = new THREE.Mesh(new THREE.TorusGeometry(t.r, 0.02, 8, 36), this.frosting);
      piping.rotation.x = Math.PI / 2;
      piping.position.y = 0.012;
      g.add(piping);
      // pink drip band
      const band = new THREE.Mesh(new THREE.TorusGeometry(t.r + 0.003, 0.012, 6, 36), this.pink);
      band.rotation.x = Math.PI / 2;
      band.position.y = t.h - 0.02;
      g.add(band);
      // pearls along the top edge
      const n = Math.round(t.r * 60);
      const pg = new THREE.SphereGeometry(0.011, 8, 6);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const p = new THREE.Mesh(pg, pearl);
        p.position.set(Math.cos(a) * (t.r - 0.012), t.h + 0.004, Math.sin(a) * (t.r - 0.012));
        g.add(p);
      }
      // roses
      const rg = new THREE.SphereGeometry(0.03, 10, 8);
      for (let k = 0; k < 3 + i; k++) {
        const a = (k / (3 + i)) * Math.PI * 2 + i;
        const rose = new THREE.Mesh(rg, this.pink);
        rose.position.set(Math.cos(a) * (t.r + 0.01), t.h * 0.55, Math.sin(a) * (t.r + 0.01));
        rose.scale.set(1, 0.8, 1);
        g.add(rose);
      }
      this.visual.add(g);
      this.tiers.push({ group: g, baseY: y, wobble: new Wobble(3.2 - i * 0.7, 0.09, 0.9), offset: new THREE.Vector2(), squash: 0, r: t.r, h: t.h });
      y += t.h;
    });

    // topper: tiny bride and groom beans
    this.topper = new THREE.Group();
    const topTier = this.tiers[2];
    topTier.group.add(this.topper);
    this.topper.position.y = topTier.h;
    const bride = new THREE.Group();
    const dress = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 14), jelly(0xffffff, 0.3));
    dress.position.y = 0.04;
    const bHead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), jelly(0xffd9b8, 0.3));
    bHead.position.y = 0.095;
    const veil = new THREE.Mesh(new THREE.SphereGeometry(0.023, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), jelly(0xf4f8ff, 0.3));
    veil.position.y = 0.097;
    bride.add(dress, bHead, veil);
    bride.position.x = -0.03;
    const groom = new THREE.Group();
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.05, 4, 10), jelly(0x2b2a33, 0.3));
    suit.position.y = 0.05;
    const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 10), jelly(0xffd9b8, 0.3));
    gHead.position.y = 0.105;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), jelly(0x2b2a33, 0.3));
    hat.position.y = 0.13;
    groom.add(suit, gHead, hat);
    groom.position.x = 0.03;
    this.topper.add(bride, groom);
    this.topper.traverse((o) => ((o as THREE.Mesh).castShadow = true));

    this.visual.add(this.splats);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    const g = this.gEff;
    const gy = Math.max(3, -g.y);
    const fx = clamp(-g.x / gy, -1, 1);
    const fz = clamp(-g.z / gy, -1, 1);
    this.tiers.forEach((t, i) => t.wobble.step(dt, fx * (0.4 + i * 0.3), fz * (0.4 + i * 0.3)));
    this.topperWobble.step(dt, fx * 1.2, fz * 1.2);
    // tilted cake = frosting sliding off
    const tilt = Math.acos(clamp(-g.y / Math.max(0.1, g.length()), -1, 1));
    if (tilt > 0.38 && g.length() > 6) {
      this.tiltTimer += dt;
      if (this.tiltTimer > 0.15) this.damage((tilt - 0.38) * 0.35 * dt);
    } else this.tiltTimer = 0;
  }

  netState() {
    const s: number[] = [];
    for (const t of this.tiers) s.push(t.wobble.x, t.wobble.y);
    s.push(this.topperWobble.x, this.topperWobble.y);
    return s;
  }

  applyNetState(s: number[]) {
    this.tiers.forEach((t, i) => {
      t.wobble.x = s[i * 2] ?? 0;
      t.wobble.y = s[i * 2 + 1] ?? 0;
    });
    const n = this.tiers.length * 2;
    this.topperWobble.x = s[n] ?? 0;
    this.topperWobble.y = s[n + 1] ?? 0;
  }

  update(dt: number) {
    const k = this.destroyed ? 0 : 1;
    this.tiers.forEach((t, i) => {
      const wx = t.wobble.x * 0.05 * k + t.offset.x;
      const wz = t.wobble.y * 0.05 * k + t.offset.y;
      t.group.position.set(wx, t.baseY * (1 - (this.destroyed ? 0.55 : t.squash * 0.5)), wz);
      t.group.rotation.set(t.wobble.y * 0.12 * k + t.offset.y * 0.8, 0, -t.wobble.x * 0.12 * k - t.offset.x * 0.8);
      const sq = this.destroyed ? 0.45 : 1 - t.squash;
      t.group.scale.set(1 + (1 - sq) * 0.35, sq, 1 + (1 - sq) * 0.35);
      void i;
    });
    if (this.topperFree) {
      const f = this.topperFree;
      f.t += dt;
      f.vel.y -= 11 * dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < f.ground + 0.02) {
        f.pos.y = f.ground + 0.02;
        f.vel.multiplyScalar(0.3);
        f.vel.y = Math.abs(f.vel.y) * 0.3;
        f.spin.multiplyScalar(0.5);
      }
      f.rot.x += f.spin.x * dt;
      f.rot.z += f.spin.z * dt;
      this.topper.position.copy(f.pos);
      this.topper.rotation.copy(f.rot);
    } else {
      this.topper.rotation.set(this.topperWobble.y * 0.35, 0, -this.topperWobble.x * 0.35);
    }
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    // smush toward the side that got hit
    const t = this.body.translation();
    const r = this.body.rotation();
    const local = point.clone().sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert());
    const dir = new THREE.Vector2(-local.x, -local.z);
    if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, Math.random() - 0.5);
    dir.normalize();
    this.tiers.forEach((tier, i) => {
      tier.offset.addScaledVector(dir, amount * (0.05 + i * 0.04));
      tier.offset.clampLength(0, tier.r * 0.4);
      tier.squash = Math.min(0.45, tier.squash + amount * (0.25 + i * 0.1));
      tier.wobble.kick(dir.x * amount * 30, dir.y * amount * 30);
    });
    this.topperWobble.kick(dir.x * amount * 40, dir.y * amount * 40);
    // frosting splat stuck to the side
    const tier = this.tiers[Math.floor(Math.random() * 3)];
    const a = Math.random() * Math.PI * 2;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.min(amount, 0.35) * 0.08, 10, 8), Math.random() < 0.5 ? this.frosting : this.pink);
    blob.position.set(Math.cos(a) * tier.r, tier.h * Math.random(), Math.sin(a) * tier.r);
    blob.scale.set(1, 0.7, 1);
    tier.group.add(blob);
    this.sim.fx?.burst('blob', point, { count: Math.min(10, 2 + Math.floor(amount * 25)), speed: 1.8, up: 1, size: 0.025, life: 1.6, gravity: 11, colors: [0xfff8ef, 0xff9fb8] });
    if (this.health < 0.45 && !this.topperFree) this.dropTopper();
  }

  private dropTopper() {
    const wp = this.topper.getWorldPosition(new THREE.Vector3());
    this.topper.removeFromParent();
    this.sim.scene.add(this.topper);
    const ground = this.sim.fx?.groundAt ? this.sim.fx.groundAt(wp.x, wp.y, wp.z) : wp.y - 0.7;
    this.topperFree = {
      pos: wp,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2),
      rot: new THREE.Euler(),
      spin: new THREE.Vector3(6, 0, 4),
      ground,
      t: 0,
    };
  }

  protected onBreak() {
    if (!this.topperFree) this.dropTopper();
    const p = this.visual.localToWorld(new THREE.Vector3(0, 0.3, 0));
    this.sim.fx?.burst('blob', p, { count: 60, speed: 3.5, up: 1.4, size: 0.04, sizeVar: 0.6, life: 3, gravity: 11, spread: 0.3, colors: [0xfff8ef, 0xff9fb8, 0xffe4c7] });
  }

  dispose() {
    this.topper.removeFromParent();
    super.dispose();
  }
}
