import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { glossy } from '../../render/materials';
import { clamp } from '../../util/math';
import { Wobble } from '../../util/wobble';

/** The ring of arms (body origin = its middle); the foot sits FOOT below it. */
const RING_R = 0.5;
const FOOT = 0.55;
const ARMS = 6;
const DROPS = 12;
/** Crystals swinging further than this (radians) clink together (and chip). */
const CLINK = 0.75;
/** How hard speeding up and slowing down swings the crystals (1 = like real pendulums). */
const GAIN = 0.4;

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * A crystal chandelier: brass arms, candles and a dozen crystal drops that
 * really swing as it's carried. Swing it about (or spin it) and the crystals
 * clink, chip and fall off.
 */
export class Chandelier extends Cargo {
  readonly kind = 'chandelier' as const;
  readonly displayName = 'Crystal Chandelier';
  readonly value = 2400;
  readonly tip = 'Hold it by the ring of arms. Start, stop and turn gently: the crystals swing!';
  readonly fragility: Fragility = { safeShock: 1.45, perShock: 0.14, maxPerHit: 0.25, spinLimit: 1.7, spinDamage: 0.14 };
  readonly care = 0.7;

  /** The drops' swing, in the world (x: toward +X, y: toward +Z): they hang straight down however it's tilted. */
  private swing = new Wobble(1.15, 0.1, 1.3);
  private lastV = new THREE.Vector3();
  private acc = new THREE.Vector3();
  private drops: { g: THREE.Group; phase: number; gone: boolean }[] = [];
  private crystal!: THREE.MeshPhysicalMaterial;
  private clinking = false;
  private glow: THREE.Mesh[] = [];
  /** Health lost to the crystals clinking (the rest is bumps and spinning). */
  clinkLoss = 0;
  /** The widest the crystals have swung. */
  maxSwing = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.5;
    this.material = 'glass';
    this.init(opts);
  }

  protected buildColliders() {
    // the ring of arms (what the movers hold), the stem, and a flat foot to stand on
    this.addCollider(RAPIER.ColliderDesc.cylinder(0.07, RING_R + 0.03).setTranslation(0, 0.02, 0).setMass(10), 0.8);
    this.addCollider(RAPIER.ColliderDesc.cylinder(0.45, 0.08).setTranslation(0, 0.08, 0).setMass(6), 0.6);
    this.addCollider(RAPIER.ColliderDesc.cylinder(0.05, 0.22).setTranslation(0, -FOOT + 0.05, 0).setMass(4), 0.8);
  }

  protected buildVisual() {
    const brass = glossy(0xd9a93f, 0.28, 0.85);
    this.crystal = new THREE.MeshPhysicalMaterial({ color: 0xf2fbff, roughness: 0.05, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.78, emissive: 0xbfe8ff, emissiveIntensity: 0.25 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.visual.add(m);
      return m;
    };
    // stem with knops, crown and hanging loop
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.95, 12), brass, 0, 0.05, 0);
    for (const y of [-0.22, 0.12, 0.34]) add(new THREE.SphereGeometry(0.075, 14, 10), brass, 0, y, 0).scale.set(1, 0.75, 1);
    add(new THREE.CylinderGeometry(0.14, 0.07, 0.1, 16), brass, 0, 0.5, 0);
    const loop = add(new THREE.TorusGeometry(0.06, 0.015, 8, 16), brass, 0, 0.6, 0);
    loop.rotation.y = Math.PI / 2;
    // the arms: S-curves out to candle cups, tied by a ring
    for (let i = 0; i < ARMS; i++) {
      const a = (i / ARMS) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(c * 0.05, -0.1, s * 0.05),
        new THREE.Vector3(c * 0.22, -0.13, s * 0.22),
        new THREE.Vector3(c * 0.4, -0.04, s * 0.4),
        new THREE.Vector3(c * RING_R, 0.08, s * RING_R),
      ]);
      const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.018, 8, false), brass);
      arm.castShadow = true;
      this.visual.add(arm);
      add(new THREE.CylinderGeometry(0.06, 0.035, 0.05, 14), brass, c * RING_R, 0.1, s * RING_R);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 10), glossy(0xfffbf0, 0.4, 0), c * RING_R, 0.19, s * RING_R);
      this.glow.push(add(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb43a, emissiveIntensity: 2 }), c * RING_R, 0.28, s * RING_R));
    }
    const ring = add(new THREE.TorusGeometry(RING_R - 0.02, 0.016, 8, 48), brass, 0, 0.03, 0);
    ring.rotation.x = Math.PI / 2;
    // a crystal bowl underneath on a brass foot, and a drop off the bottom
    const bowl = add(new THREE.SphereGeometry(0.2, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.crystal, 0, -0.2, 0);
    bowl.scale.set(1, 0.9, 1);
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 20), brass, 0, -FOOT + 0.03, 0);
    add(new THREE.CylinderGeometry(0.04, 0.09, 0.2, 12), brass, 0, -FOOT + 0.16, 0);
    // crystal drops hanging off the ring, each on a little chain
    const dropGeo = new THREE.OctahedronGeometry(0.045, 0);
    dropGeo.scale(1, 1.8, 1);
    const chainGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4);
    for (let i = 0; i < DROPS; i++) {
      const a = ((i + 0.5) / DROPS) * Math.PI * 2;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * (RING_R - 0.02), 0.01, Math.sin(a) * (RING_R - 0.02));
      const chain = new THREE.Mesh(chainGeo, brass);
      chain.position.y = -0.045;
      const drop = new THREE.Mesh(dropGeo, this.crystal);
      drop.position.y = -0.17;
      drop.castShadow = true;
      g.add(chain, drop);
      this.visual.add(g);
      this.drops.push({ g, phase: i * 1.7, gone: false });
    }
    // swags of little beads between the arms
    for (let i = 0; i < ARMS; i++) {
      const a0 = (i / ARMS) * Math.PI * 2;
      const a1 = ((i + 1) / ARMS) * Math.PI * 2;
      for (let k = 1; k < 6; k++) {
        const u = k / 6;
        const a = a0 + (a1 - a0) * u;
        const sag = Math.sin(u * Math.PI) * 0.12;
        add(new THREE.SphereGeometry(0.014, 6, 4), this.crystal, Math.cos(a) * (RING_R - 0.03), 0.06 - sag, Math.sin(a) * (RING_R - 0.03));
      }
    }
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    // the drops lag behind: they swing out when it speeds up, stops or turns
    const v = this.body.linvel();
    _v.set(v.x, v.y, v.z);
    this.acc.lerp(_d.copy(_v).sub(this.lastV).divideScalar(dt), 1 - Math.exp(-dt / 0.06));
    this.lastV.copy(_v);
    this.swing.step(dt, clamp((-this.acc.x / 9.8) * GAIN, -1.2, 1.2), clamp((-this.acc.z / 9.8) * GAIN, -1.2, 1.2));
    const amp = Math.hypot(this.swing.x, this.swing.y);
    this.maxSwing = Math.max(this.maxSwing, amp);
    if (amp > CLINK) {
      // crystals knocking together: chips off, a little at a time
      if (!this.clinking) this.clinkFx();
      this.clinking = true;
      const h = this.health;
      this.damage((amp - CLINK) * 0.12 * dt);
      this.clinkLoss += h - this.health;
    } else if (amp < CLINK * 0.8) this.clinking = false;
  }

  private clinkFx() {
    const d = this.drops[Math.floor(Math.random() * this.drops.length)];
    const p = d.g.getWorldPosition(_v);
    this.sim.fx?.burst('star', p, { count: 3, speed: 0.6, up: 0.4, size: 0.04, life: 0.4, gravity: 1, colors: [0xffffff, 0xdff4ff] });
  }

  netState() {
    return [this.swing.x, this.swing.y];
  }

  applyNetState(s: number[]) {
    this.swing.x = s[0] ?? 0;
    this.swing.y = s[1] ?? 0;
  }

  update(dt: number, time: number) {
    const sx = this.swing.x;
    const sz = this.swing.y;
    // which way "down" is for the drops, in the chandelier's own frame
    const r = this.body.rotation();
    _d.set(Math.tan(clamp(sx, -1.3, 1.3)), -1, Math.tan(clamp(sz, -1.3, 1.3))).normalize().applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert());
    const j = 0.08 * Math.hypot(sx, sz);
    for (const d of this.drops) {
      if (d.gone) continue;
      // each drop with its own little jiggle on top of the common swing
      _v.set(_d.x + Math.sin(time * 7 + d.phase) * j, _d.y, _d.z + Math.cos(time * 6 + d.phase) * j).normalize();
      d.g.quaternion.setFromUnitVectors(DOWN, _v);
    }
    for (const [i, b] of this.glow.entries()) b.scale.setScalar(this.destroyed ? 0 : 1 + 0.12 * Math.sin(time * 11 + i * 1.3));
    const spin = this.destroyed ? 0 : Math.hypot(this.body.angvel().x, this.body.angvel().y, this.body.angvel().z);
    const amp = Math.hypot(sx, sz);
    this.status = this.destroyed ? null : spin > 1.3 ? '🌀 Don’t spin it!' : amp > CLINK * 0.85 ? '💎 Crystals clinking! Steady…' : null;
    void dt;
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    this.sim.fx?.burst('shard', point, { count: Math.min(10, 2 + Math.floor(amount * 30)), speed: 1.4, up: 0.8, size: 0.025, life: 1, gravity: 10, colors: [0xffffff, 0xdff4ff, 0xffe9a0] });
    // a crystal drops off for every real knock (and as it gets battered)
    const left = this.drops.filter((d) => !d.gone);
    const want = Math.round((1 - this.health) * DROPS * 0.9);
    let lose = Math.max(amount > 0.04 ? 1 : 0, DROPS - left.length < want ? want - (DROPS - left.length) : 0);
    while (lose-- > 0 && left.length) {
      const d = left.splice(Math.floor(Math.random() * left.length), 1)[0];
      d.gone = true;
      d.g.visible = false;
      this.sim.fx?.burst('shard', d.g.getWorldPosition(_v), { count: 4, speed: 0.8, up: 0.2, size: 0.035, life: 1.2, gravity: 10, colors: [0xf2fbff, 0xffffff] });
    }
  }

  protected onBreak() {
    const p = this.visual.localToWorld(new THREE.Vector3(0, 0, 0));
    this.sim.fx?.burst('shard', p, { count: 60, speed: 3, up: 1.4, size: 0.04, sizeVar: 0.6, life: 2.2, gravity: 10, spread: 0.5, colors: [0xf2fbff, 0xffffff, 0xd9a93f] });
    for (const d of this.drops) d.g.visible = false;
    this.crystal.opacity = 0.3;
  }
}
