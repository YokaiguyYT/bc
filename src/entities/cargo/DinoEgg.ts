import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { CrackLayer } from '../../render/cracks';
import { jelly } from '../../render/materials';
import { rng } from '../../util/math';

/** Egg shape: the full egg would be FULL tall; its bottom is sliced off at T0 so it can stand. */
const FULL = 0.86;
const WIDTH = 0.66;
const T0 = 0.1;
const HEIGHT = FULL * (1 - T0);
const RINGS = 14;
const SEGS = 18;

function eggRadius(t: number) {
  // t 0 (bottom) .. 1 (top): fuller at the bottom, pointier at the top
  const s = Math.sin(Math.PI * t);
  return (WIDTH / 2) * Math.pow(s, 0.85) * (1 - 0.18 * t);
}
/** Righting torque while carried: N·m per radian of tilt, its cap, and damping (N·m·s). */
const UPRIGHT_K = 70;
const UPRIGHT_MAX = 26;
const UPRIGHT_DAMP = 5;
const _up = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _wy = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/** Height above the egg's middle (body origin) for profile parameter t. */
const yOf = (t: number) => (t - T0) * FULL - HEIGHT / 2;

/** Cream shell with brown and green speckles. */
function drawShell(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#f3e7cf';
  ctx.fillRect(0, 0, w, h);
  const r = rng(77);
  for (let i = 0; i < 260; i++) {
    const big = r() < 0.15;
    ctx.fillStyle = r() < 0.6 ? `rgba(120,86,50,${0.25 + r() * 0.35})` : `rgba(96,128,80,${0.2 + r() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, big ? 6 + r() * 7 : 1.5 + r() * 3, big ? 4 + r() * 5 : 1.5 + r() * 2.5, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * A dinosaur egg: priceless, paper-thin, and round enough to roll away. It
 * cracks where it gets knocked, and every so often whatever is inside gives
 * it a kick.
 */
export class DinoEgg extends Cargo {
  readonly kind = 'egg' as const;
  readonly displayName = 'Dinosaur Egg';
  readonly value = 2000;
  readonly tip = 'Paper-thin and it rolls. Something inside kicks now and then: hold on!';
  readonly fragility: Fragility = { safeShock: 0.95, perShock: 0.24, maxPerHit: 0.4, spinLimit: 2.6, spinDamage: 0.1 };
  /** Nobody jogs with a priceless egg. */
  readonly care = 1;
  readonly snug = true;

  private cracks!: CrackLayer;
  private shell!: THREE.Mesh;
  private peek!: THREE.Group;
  private kickT = 6 + Math.random() * 4;
  private wobble = 0;
  private wobbleV = 0;
  private baby: THREE.Group | null = null;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.38;
    this.material = 'shell';
    this.init(opts);
  }

  /** Lathe profile, bottom to top: a small flat base, then the curve of the shell. */
  private profile() {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, yOf(T0))];
    for (let i = 0; i <= RINGS; i++) {
      const t = T0 + ((1 - T0) * i) / RINGS;
      pts.push(new THREE.Vector2(Math.max(0.001, eggRadius(t)), yOf(t)));
    }
    return pts;
  }

  protected buildColliders() {
    const verts: number[] = [];
    for (const p of this.profile())
      for (let k = 0; k < SEGS; k++) {
        const a = (k / SEGS) * Math.PI * 2;
        verts.push(Math.cos(a) * p.x, p.y, Math.sin(a) * p.x);
      }
    const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(verts));
    this.addCollider((hull ?? RAPIER.ColliderDesc.capsule(HEIGHT / 2 - WIDTH / 2, WIDTH / 2)).setMass(21.5), 0.55);
    // a square foot a hair below the flat base: contacts on an 18-sided face
    // come out as a single wobbly point, so standing up it would rock and fall
    const r = eggRadius(T0) * 0.7;
    this.addCollider(RAPIER.ColliderDesc.cuboid(r, 0.01, r).setTranslation(0, yOf(T0) + 0.009, 0).setMass(0.5), 0.55);
  }

  protected buildVisual() {
    this.cracks = new CrackLayer(512, 512, drawShell, 'rgba(70,45,25,0.9)', 'rgba(255,240,210,0.6)');
    const geo = new THREE.LatheGeometry(this.profile(), 40);
    this.shell = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.cracks.texture, roughness: 0.55 }));
    this.shell.castShadow = this.shell.receiveShadow = true;
    this.visual.add(this.shell);
    // a beady eye that shows through the shell once it's badly cracked
    this.peek = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: 0x1d1410 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
    eye.position.z = 0.012;
    this.peek.add(hole, eye);
    this.peek.position.set(0, 0.12, eggRadius((0.12 + HEIGHT / 2) / FULL + T0) + 0.004);
    this.peek.visible = false;
    this.visual.add(this.peek);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    // mittens on a round shell grip wherever they land, and lifting from low
    // down would tip it right over: whoever holds an egg keeps it upright
    if (this.sim.grips.isHeld(this.body)) {
      const r = this.body.rotation();
      const up = _up.set(0, 1, 0).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
      const axis = _ax.crossVectors(up, _wy);
      const s = axis.length();
      const w = this.body.angvel();
      const tau = s > 1e-4 ? axis.multiplyScalar((Math.min(UPRIGHT_MAX, Math.asin(Math.min(1, s)) * UPRIGHT_K)) / s) : axis.set(0, 0, 0);
      tau.x -= w.x * UPRIGHT_DAMP;
      tau.z -= w.z * UPRIGHT_DAMP;
      this.body.applyTorqueImpulse({ x: tau.x * dt, y: 0, z: tau.z * dt }, true);
    }
    // every so often, whatever is inside gives it a kick (only while carried:
    // it shouldn't kick itself off a stand)
    this.kickT -= dt;
    if (this.kickT <= 0 && this.sim.grips.isHeld(this.body)) {
      this.kickT = 7 + Math.random() * 6;
      const a = Math.random() * Math.PI * 2;
      const I = 0.6;
      this.body.applyTorqueImpulse({ x: Math.cos(a) * I, y: (Math.random() - 0.5) * I, z: Math.sin(a) * I }, true);
      this.wobbleV += 9;
      this.sim.events.emit('cargoWobble', { amount: 0.6, kind: this.kind });
    }
  }

  netState() {
    return [this.wobble, this.wobbleV];
  }

  applyNetState(s: number[]) {
    [this.wobble, this.wobbleV] = s;
  }

  update(dt: number) {
    // the shell twitches after a kick (purely visual)
    this.wobbleV += (-this.wobble * 160 - this.wobbleV * 9) * dt;
    this.wobble += this.wobbleV * dt;
    this.shell.rotation.z = this.wobble * 0.06;
    this.shell.rotation.x = this.wobble * 0.04;
    this.status = this.destroyed ? null : this.health < 0.6 ? '👀 Something is peeking out…' : null;
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    const local = this.visual.worldToLocal(point.clone());
    // LatheGeometry wraps u from +Z (0) round through +X
    const u = (Math.atan2(local.x, local.z) / (Math.PI * 2) + 1) % 1;
    const v = THREE.MathUtils.clamp((local.y + HEIGHT / 2) / HEIGHT, 0.05, 0.95);
    this.cracks.crack(u, v, Math.min(1, amount * 3));
    this.sim.fx?.burst('shard', point, { count: Math.min(8, 1 + Math.floor(amount * 20)), speed: 1.2, up: 1, size: 0.025, life: 1, gravity: 10, colors: [0xf3e7cf, 0xe0cfa8] });
    if (this.health < 0.6) this.peek.visible = true;
  }

  protected onBreak() {
    const p = this.position(new THREE.Vector3());
    this.sim.fx?.burst('shard', p, { count: 40, speed: 2.6, up: 1.4, size: 0.05, sizeVar: 0.6, life: 2.5, gravity: 10, spread: 0.3, colors: [0xf3e7cf, 0xe0cfa8, 0xd9c49a] });
    this.shell.visible = false;
    this.peek.visible = false;
    // surprise: a very small, very confused dinosaur
    const baby = new THREE.Group();
    const green = jelly(0x7cc36a, 0.45);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.16, 4, 10), green);
    body.rotation.x = Math.PI / 2.6;
    body.position.y = 0.16;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), green);
    head.position.set(0, 0.36, 0.1);
    for (const x of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), jelly(0xffffff, 0.2));
      eye.position.set(x, 0.4, 0.19);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), jelly(0x1d1410, 0.1));
      pupil.position.set(x, 0.4, 0.21);
      baby.add(eye, pupil);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), green);
    tail.rotation.x = -Math.PI / 2.4;
    tail.position.set(0, 0.1, -0.22);
    baby.add(body, head, tail);
    baby.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    const ground = this.sim.fx?.groundAt ? this.sim.fx.groundAt(p.x, p.y + 0.3, p.z) : p.y - HEIGHT / 2;
    baby.position.set(p.x, ground, p.z);
    this.sim.scene.add(baby);
    this.baby = baby;
  }

  dispose() {
    this.baby?.removeFromParent();
    super.dispose();
  }
}
