import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { glossy, jelly } from '../../render/materials';
import { clamp } from '../../util/math';
import { Wobble } from '../../util/wobble';

/** The silver platter (body origin = its middle) and the jelly on it. */
const PLATE_R = 0.52;
const PLATE_H = 0.06;
const JELLY_R = 0.38;
const JELLY_H = 0.58;
/** Wobbling harder than this tears it. */
const TEAR = 0.62;

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _s = new THREE.Matrix4();

/** A fluted castle-mould jelly: a lathe with ripples round it. */
function mouldGeometry() {
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [
    [0.0, 0],
    [JELLY_R, 0],
    [JELLY_R * 0.98, 0.16],
    [JELLY_R * 0.86, 0.2],
    [JELLY_R * 0.84, 0.34],
    [JELLY_R * 0.68, 0.39],
    [JELLY_R * 0.64, 0.5],
    [JELLY_R * 0.5, JELLY_H - 0.02],
    [JELLY_R * 0.3, JELLY_H],
    [0.0, JELLY_H],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 48);
  // flutes: push the surface in and out round the mould
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.06 * Math.cos(a * 10);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A giant wobbly jelly on a silver platter. It really wibbles: every start,
 * stop and bump sets it going, and if the wobble gets too wild it tears and
 * flicks bits everywhere.
 */
export class Jelly extends Cargo {
  readonly kind = 'jelly' as const;
  readonly displayName = 'Giant Jelly';
  readonly value = 1000;
  readonly tip = 'Hold the platter level and move smoothly: let the wobble die down before you set off again.';
  readonly fragility: Fragility = { safeShock: 1.6, perShock: 0.12, maxPerHit: 0.3, spinLimit: 3.0, spinDamage: 0.06 };
  readonly care = 0.8;

  private wob = new Wobble(2.2, 0.045, 1.6);
  /** Up-down squish (a spring of its own). */
  private sq = new Wobble(3.4, 0.08, 0.5);
  private jelly!: THREE.Group;
  /** Permanent sag from damage. */
  private sag = 0;
  private tearT = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.45;
    this.material = 'cake';
    this.init(opts);
  }

  protected buildColliders() {
    this.addCollider(RAPIER.ColliderDesc.cylinder(PLATE_H / 2, PLATE_R).setMass(3), 0.85);
    // the jelly itself: nobody picks a jelly up by the jelly
    const c = this.addCollider(RAPIER.ColliderDesc.cylinder(JELLY_H * 0.45, JELLY_R * 0.92).setTranslation(0, PLATE_H / 2 + JELLY_H * 0.45, 0).setMass(9), 0.9);
    this.sim.physics.info(c)!.grabbable = false;
  }

  protected buildVisual() {
    const silver = glossy(0xd9dde3, 0.22, 0.85);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R * 0.92, PLATE_H, 40), silver);
    plate.castShadow = plate.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(PLATE_R - 0.01, 0.018, 8, 40), silver);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = PLATE_H / 2;
    this.visual.add(plate, rim);
    this.jelly = new THREE.Group();
    this.jelly.position.y = PLATE_H / 2;
    this.jelly.matrixAutoUpdate = false;
    const mat = jelly(0xff2d55, 0.6).clone();
    mat.transparent = true;
    mat.opacity = 0.86;
    const mould = new THREE.Mesh(mouldGeometry(), mat);
    mould.castShadow = true;
    this.jelly.add(mould);
    // fruit set inside it, and a cherry on top
    const fruit = [0xffd23f, 0x8bc34a, 0xff8a3d, 0xfff3e0];
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39;
      const r = 0.08 + (i % 3) * 0.07;
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.035 + (i % 2) * 0.015, 10, 8), glossy(fruit[i % fruit.length], 0.4, 0));
      f.position.set(Math.cos(a) * r, 0.08 + (i / 9) * 0.38, Math.sin(a) * r);
      this.jelly.add(f);
    }
    const cherry = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), glossy(0xc8102e, 0.2, 0));
    cherry.position.y = JELLY_H + 0.04;
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), glossy(0x3f7a2a, 0.5, 0));
    stalk.position.set(0.02, JELLY_H + 0.11, 0);
    stalk.rotation.z = -0.4;
    this.jelly.add(cherry, stalk);
    this.visual.add(this.jelly);
    this.shape();
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    // the top lags behind: it leans the way "felt gravity" leans, and bounces back
    const g = this.gEff;
    const gy = Math.max(3, -g.y);
    this.wob.step(dt, clamp((g.x / gy) * 2.4, -1.6, 1.6), clamp((g.z / gy) * 2.4, -1.6, 1.6));
    this.sq.step(dt, clamp((-g.y - 9.8) / 9.8, -0.5, 0.5), 0);
    const amp = Math.hypot(this.wob.x, this.wob.y);
    if (amp > TEAR) {
      this.damage((amp - TEAR) * 0.45 * dt);
      this.tearT -= dt;
      if (this.tearT <= 0) {
        this.tearT = 0.15;
        this.flick(amp);
      }
    } else this.tearT = 0;
  }

  /** Bits of jelly flying off the top. */
  private flick(amp: number) {
    const p = this.visual.localToWorld(_v.set(this.wob.x * 0.25, PLATE_H + JELLY_H * 0.85, this.wob.y * 0.25));
    this.sim.fx?.burst('blob', p, { count: 2 + Math.round(amp * 2), speed: 1.4 * amp, up: 0.8, size: 0.05, life: 1.2, gravity: 10, colors: [0xff2d55, 0xff5c7a] });
  }

  /** Lean, shear and squash the jelly to match its wobble. */
  private shape() {
    const k = this.destroyed ? 0 : 1;
    const q = clamp(this.sq.x * 0.35 * k, -0.2, 0.2) + this.sag;
    const sx = this.wob.x * 0.42 * k;
    const sz = this.wob.y * 0.42 * k;
    _m.makeScale(1 + q * 0.5, Math.max(0.15, 1 - q), 1 + q * 0.5);
    _s.makeShear(0, 0, sx, sz, 0, 0);
    _m.premultiply(_s);
    _s.makeTranslation(0, PLATE_H / 2, 0);
    _m.premultiply(_s);
    this.jelly.matrix.copy(_m);
    this.jelly.matrixWorldNeedsUpdate = true;
  }

  netState() {
    return [this.wob.x, this.wob.y, this.sq.x, this.sag];
  }

  applyNetState(s: number[]) {
    [this.wob.x, this.wob.y, this.sq.x, this.sag] = [s[0] ?? 0, s[1] ?? 0, s[2] ?? 0, s[3] ?? 0];
  }

  update() {
    this.shape();
    const amp = Math.hypot(this.wob.x, this.wob.y);
    this.status = this.destroyed ? null : amp > TEAR ? '🍮 WIBBLE WOBBLE! It’s tearing!' : amp > TEAR * 0.65 ? '🍮 Wibble wobble… steady!' : null;
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    this.sag = Math.min(0.35, this.sag + amount * 0.6);
    this.sim.fx?.burst('blob', point, { count: Math.min(10, 2 + Math.floor(amount * 30)), speed: 1.6, up: 1, size: 0.05, life: 1.2, gravity: 10, colors: [0xff2d55, 0xff5c7a] });
    this.wob.kick((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  }

  protected onBreak() {
    // splat: a red puddle on the platter and jelly everywhere
    const p = this.visual.localToWorld(new THREE.Vector3(0, PLATE_H + 0.2, 0));
    this.sim.fx?.burst('blob', p, { count: 50, speed: 3, up: 1.6, size: 0.07, sizeVar: 0.6, life: 2.2, gravity: 10, spread: 0.4, colors: [0xff2d55, 0xff5c7a, 0xc8102e] });
    this.sag = 0.8;
    this.jelly.matrix.makeScale(1.35, 0.18, 1.35).premultiply(_s.makeTranslation(0, PLATE_H / 2, 0));
    this.jelly.matrixWorldNeedsUpdate = true;
  }
}
