import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import { Sim, warmthAt } from '../../game/Sim';
import { glossy, matte } from '../../render/materials';
import { models } from '../../render/models';
import { clamp } from '../../util/math';

/** Standing up: long axis Y, nose at +Y (body origin = its middle). */
const LEN = 2.3;
const R = 0.3;
/** How long the engine fires when it overheats (s). */
const BURN = 1.4;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A space rocket, carried lying down, end to end, through a hangar full of
 * welders. Sparks and heat warm it up; let it get too hot and the engine
 * lights: it lurches off nose-first, dragging the movers with it, and gets
 * scorched. It cools down again away from the heat.
 */
export class Rocket extends Cargo {
  readonly kind = 'rocket' as const;
  readonly displayName = 'Space Rocket';
  readonly value = 2600;
  readonly tip = 'Carry it end to end, and give the welders’ sparks a wide berth: if it overheats, the engine lights!';
  readonly fragility: Fragility = { safeShock: 2.0, perShock: 0.08, maxPerHit: 0.25, spinLimit: 3.0, spinDamage: 0.05 };

  /** 0..1: how hot it is (1 = lift-off!). */
  heat = 0;
  /** Seconds of engine burn left. */
  private burn = 0;
  private fired = 0;
  private flame = new THREE.Group();
  private skin: THREE.MeshStandardMaterial[] = [];
  private puffT = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.9;
    this.material = 'metal';
    this.init(opts);
  }

  protected buildColliders() {
    this.addCollider(RAPIER.ColliderDesc.capsule(LEN / 2 - R - 0.1, R).setMass(26), 0.7);
    // fins in an X: lying down it rests on two of them, so it doesn't roll
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const q = new THREE.Quaternion().setFromAxisAngle(UP, a);
      this.addCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 0.2, 0.03)
          .setTranslation(0, -LEN / 2 + 0.3, 0)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setMass(3),
        0.7,
      );
    }
  }

  protected buildVisual() {
    if (models.has('rocket')) {
      const m = models.instance('rocket', [1.0, LEN, 1.0]);
      // its fins turned into an X, to match the colliders
      m.object.rotation.y = Math.PI / 4;
      this.visual.add(m.object);
      m.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
          this.skin.push(mesh.material as THREE.MeshStandardMaterial);
        }
      });
    } else {
      const white = glossy(0xf4f4f0, 0.35, 0.2).clone() as THREE.MeshStandardMaterial;
      const red = glossy(0xd94a3d, 0.35, 0.2).clone() as THREE.MeshStandardMaterial;
      this.skin.push(white, red);
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y;
        m.castShadow = m.receiveShadow = true;
        this.visual.add(m);
        return m;
      };
      add(new THREE.CylinderGeometry(R, R * 0.92, LEN - 0.75, 24), white, -0.12);
      add(new THREE.ConeGeometry(R, 0.62, 24), red, LEN / 2 - 0.31);
      add(new THREE.CylinderGeometry(R * 0.7, R * 0.85, 0.16, 20), matte(0x3a3f47), -LEN / 2 + 0.08);
      const port = add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 18), glossy(0x7fd3ff, 0.1, 0.3), 0.45);
      port.rotation.x = Math.PI / 2;
      port.position.z = R - 0.005;
      for (const a of [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.04), red);
        fin.position.set(Math.cos(a) * (R + 0.11), -LEN / 2 + 0.3, Math.sin(a) * (R + 0.11));
        fin.rotation.y = -a;
        fin.castShadow = true;
        this.visual.add(fin);
      }
      add(new THREE.CylinderGeometry(R + 0.005, R + 0.005, 0.08, 24), red, 0.2);
    }
    // the engine's flame (hidden until it lights)
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 14), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1a, emissiveIntensity: 2.4, transparent: true, opacity: 0.85 }));
    fl.rotation.x = Math.PI;
    fl.position.y = -0.45;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0b0, emissiveIntensity: 3 }));
    core.rotation.x = Math.PI;
    core.position.y = -0.28;
    this.flame.add(fl, core);
    this.flame.position.y = -LEN / 2;
    this.flame.visible = false;
    this.visual.add(this.flame);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    const w = warmthAt(this.sim, this.position(_v));
    if (this.burn > 0) {
      // the engine pushes it nose-first
      this.burn -= dt;
      const r = this.body.rotation();
      _v.copy(UP).applyQuaternion(_q.set(r.x, r.y, r.z, r.w));
      const f = this.body.mass() * 13;
      this.body.addForce({ x: _v.x * f, y: _v.y * f * 0.3, z: _v.z * f }, true);
      if (this.burn <= 0) this.body.resetForces(true);
      return;
    }
    if (w > 0.3) this.heat += (w - 0.3) * 0.16 * dt;
    else this.heat -= (w < -0.3 ? 0.2 : 0.05) * dt;
    // being bashed about doesn't help either
    if (this.recentShock > 2.5) this.heat += (this.recentShock - 2.5) * 0.05 * dt;
    this.heat = clamp(this.heat, 0, 1);
    if (this.heat >= 1 && this.sim.live?.() !== false) this.ignite();
  }

  private ignite() {
    this.burn = BURN;
    this.fired++;
    this.heat = 0.35;
    this.damage(0.1);
    this.sim.shake?.(0.5);
  }

  netState() {
    return [this.heat, this.burn];
  }

  applyNetState(s: number[]) {
    this.heat = s[0] ?? 0;
    this.burn = s[1] ?? 0;
  }

  update(dt: number, time: number) {
    const on = this.burn > 0 && !this.destroyed;
    this.flame.visible = on;
    if (on) {
      const k = 1 + 0.25 * Math.sin(time * 40) + 0.1 * Math.sin(time * 77);
      this.flame.scale.set(1, k, 1);
      this.puffT -= dt;
      if (this.puffT <= 0) {
        this.puffT = 0.05;
        const p = this.visual.localToWorld(_v.set(0, -LEN / 2 - 0.5, 0));
        this.sim.fx?.burst('smoke', p, { count: 2, speed: 0.6, up: 0.4, size: 0.3, life: 1.4, gravity: -0.3, drag: 1.5, colors: [0xe6e6e6, 0xbfbfbf] });
        this.sim.fx?.burst('spark', p, { count: 2, speed: 2, up: 0.5, size: 0.03, life: 0.4, gravity: 4, colors: [0xffd27a, 0xff8a3d] });
      }
    } else if (!this.destroyed && this.heat > 0.6) {
      // it steams as it gets hot
      this.puffT -= dt * this.heat;
      if (this.puffT <= 0) {
        this.puffT = 0.3;
        const p = this.visual.localToWorld(_v.set(0, -LEN / 2 + 0.2, 0));
        this.sim.fx?.burst('smoke', p, { count: 1, speed: 0.3, up: 0.6, size: 0.15, life: 1.2, gravity: -0.5, drag: 1, colors: [0xffffff] });
      }
    }
    for (const m of this.skin) {
      m.emissive.setRGB(1, 0.25, 0.05);
      m.emissiveIntensity = this.destroyed ? 0 : Math.max(0, this.heat - 0.3) * 0.9;
    }
    const pct = Math.round(this.heat * 100);
    this.status = this.destroyed ? null : on ? '🚀 WHOOOSH! Hang on!' : this.heat > 0.75 ? `🔥 ${pct}% hot! Get away from the sparks!` : this.heat > 0.3 ? `🌡️ ${pct}% hot… keep clear of the sparks` : null;
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    this.sim.fx?.burst('spark', point, { count: Math.min(10, 2 + Math.floor(amount * 30)), speed: 2.2, up: 1, size: 0.03, life: 0.5, gravity: 9, colors: [0xffe28a, 0xffb347] });
  }

  protected onBreak() {
    const p = this.visual.localToWorld(new THREE.Vector3(0, 0, 0));
    this.sim.fx?.burst('smoke', p, { count: 24, speed: 1.6, up: 1, size: 0.4, life: 2.4, gravity: -0.4, drag: 1, colors: [0x6b6b6b, 0x9a9a9a] });
    this.sim.fx?.burst('chunk', p, { count: 30, speed: 3.4, up: 1.6, size: 0.06, life: 2, gravity: 10, colors: [0xf4f4f0, 0xd94a3d, 0x3a3f47] });
    this.flame.visible = false;
  }

  /** How many times the engine has gone off (tests). */
  get launches() {
    return this.fired;
  }
}
