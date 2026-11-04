import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { matte } from '../../render/materials';
import { models } from '../../render/models';
import { clamp } from '../../util/math';

/** The hive's box (body origin = its centre). */
const W = 0.7;
const H = 0.88;
const D = 0.5;
/** Bees get cross past these. */
const BUZZ = 0.35;
const ANGRY = 0.7;
const SWARM = 36;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _a = new THREE.Vector3();

/**
 * A beehive full of bees and honey. Every jolt makes the bees crosser; get
 * them angry and a swarm pours out and chases the movers, stinging them off
 * their feet, until things calm down again. Hold still and they settle.
 */
export class Beehive extends Cargo {
  readonly kind = 'beehive' as const;
  readonly displayName = 'Beehive';
  readonly value = 1300;
  readonly tip = 'Jolts make the bees cross. Too many and they come out to sting you! Smooth and steady.';
  readonly fragility: Fragility = { safeShock: 2.3, perShock: 0.07, maxPerHit: 0.22, spinLimit: 3.5, spinDamage: 0.04 };

  /** 0..1: how cross the bees are. */
  anger = 0;
  /** Where the swarm is (null: at home in the hive). */
  private swarm: THREE.Vector3 | null = null;
  private target = 0;
  private stingCool = 0;
  private stings = 0;
  private swarmObj: THREE.Points;
  /** A few bees always about the entrance (more of them the crosser they are). */
  private guards: THREE.Points;
  private time = 0;
  /** The crossest they've been (tests). */
  peak = 0;
  private lastV = new THREE.Vector3();
  private acc = new THREE.Vector3();

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.5;
    this.material = 'wood';
    const beeGeo = (n: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const c = new THREE.Color(i % 3 === 0 ? 0x222222 : 0xffc21a);
        col.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    };
    this.swarmObj = new THREE.Points(beeGeo(SWARM), new THREE.PointsMaterial({ size: 0.11, vertexColors: true }));
    this.swarmObj.visible = false;
    this.swarmObj.frustumCulled = false;
    sim.scene.add(this.swarmObj);
    this.guards = new THREE.Points(beeGeo(10), new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
    this.guards.frustumCulled = false;
    this.init(opts);
    this.visual.add(this.guards);
  }

  protected buildColliders() {
    this.addCollider(RAPIER.ColliderDesc.cuboid(W / 2, H / 2, D / 2).setMass(24), 0.75);
  }

  protected buildVisual() {
    if (models.has('beehive')) {
      const m = models.instance('beehive', [W, H, D]);
      this.visual.add(m.object);
      return;
    }
    // stacked boxes with a lid and a landing board
    const colors = [0xf5c16c, 0xe9a23b, 0xf5c16c, 0xe9a23b];
    const bh = (H - 0.08) / colors.length;
    colors.forEach((c, i) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, bh - 0.01, D - 0.02), matte(c));
      box.position.y = -H / 2 + bh * (i + 0.5);
      box.castShadow = box.receiveShadow = true;
      this.visual.add(box);
    });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.08, D + 0.04), matte(0xfbfaf6));
    lid.position.y = H / 2 - 0.04;
    lid.castShadow = true;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.02), matte(0x2b1d10));
    slot.position.set(0, -H / 2 + 0.06, D / 2);
    this.visual.add(lid, slot);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    this.time += dt;
    // jolts and jerky starts and stops make them cross; smooth carrying (and above
    // all standing still) calms them
    const v = this.body.linvel();
    _a.set(v.x, v.y, v.z);
    this.acc.lerp(_w.copy(_a).sub(this.lastV).divideScalar(dt), 1 - Math.exp(-dt / 0.06));
    this.lastV.copy(_a);
    const still = _a.length() < 0.3;
    this.anger += Math.max(0, this.acc.length() - 2.5) * 0.045 * dt;
    this.anger += Math.max(0, this.recentShock - 0.9) * 0.9 * dt;
    this.anger -= (still ? 0.07 : 0.012) * dt;
    this.anger = clamp(this.anger, 0, 1);
    this.peak = Math.max(this.peak, this.anger);
    const ps = this.sim.players ?? [];
    const home = this.position(_v);
    if (!this.swarm && this.anger >= ANGRY && ps.length) {
      this.swarm = home.clone().add(new THREE.Vector3(0, 0.3, 0));
      this.target = this.stings % ps.length;
      this.stingCool = 0.8;
    }
    const s = this.swarm;
    if (!s) return;
    if (this.anger < BUZZ * 0.8) {
      // calmed down: back into the hive
      _w.copy(home).sub(s);
      if (_w.length() < 0.4) this.swarm = null;
      else s.addScaledVector(_w.normalize(), Math.min(_w.length(), 4 * dt));
      return;
    }
    const p = ps[this.target % ps.length];
    _w.copy(p.bodyPos).add(new THREE.Vector3(0, 0.4, 0)).sub(s);
    const dist = _w.length();
    s.addScaledVector(_w.normalize(), Math.min(dist, (2.6 + this.anger) * dt));
    this.stingCool -= dt;
    if (dist < 0.8 && this.stingCool <= 0 && this.sim.live?.() !== false) {
      // stung! off their feet, and the swarm turns on the other one
      this.stingCool = 2.4;
      this.stings++;
      p.knock(1.4);
      const a = Math.random() * Math.PI * 2;
      p.applyBlast(new THREE.Vector3(Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5).multiplyScalar(p.totalMass));
      this.sim.fx?.burst('star', p.bodyPos, { count: 6, speed: 1.6, up: 1.2, size: 0.07, life: 0.7, gravity: 3, colors: [0xffc21a, 0xffffff] });
      this.target++;
    }
  }

  netState() {
    const s = this.swarm;
    return [this.anger, s ? 1 : 0, s?.x ?? 0, s?.y ?? 0, s?.z ?? 0];
  }

  applyNetState(s: number[]) {
    this.anger = s[0] ?? 0;
    if (s[1]) (this.swarm ??= new THREE.Vector3()).set(s[2], s[3], s[4]);
    else this.swarm = null;
  }

  update(dt: number, time: number) {
    void dt;
    // guards buzz round the entrance; more and wilder the crosser they are
    const g = this.guards.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = this.destroyed ? 0 : 2 + Math.round(this.anger * 8);
    for (let i = 0; i < g.count; i++) {
      if (i >= n) {
        g.setXYZ(i, 0, -999, 0);
        continue;
      }
      const a = time * (2 + (i % 4) + this.anger * 4) + i * 2.4;
      const r = 0.12 + (i % 3) * 0.08 + this.anger * 0.2;
      g.setXYZ(i, Math.cos(a) * r, -H / 2 + 0.1 + Math.abs(Math.sin(a * 1.7 + i)) * (0.2 + this.anger * 0.5), D / 2 + 0.08 + Math.sin(a) * r * 0.7);
    }
    g.needsUpdate = true;
    // the swarm buzzes about its middle
    const s = this.swarm;
    this.swarmObj.visible = !!s;
    if (s) {
      const pos = this.swarmObj.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const a = time * (3 + (i % 5)) + i * 2.3;
        const r = 0.25 + ((i * 37) % 10) * 0.05;
        pos.setXYZ(i, s.x + Math.cos(a) * r, s.y + Math.sin(a * 1.3 + i) * r * 0.6, s.z + Math.sin(a) * r);
      }
      pos.needsUpdate = true;
    }
    this.status = this.destroyed ? null : s ? '🐝🐝 ANGRY BEES! Calm down… hold still!' : this.anger >= BUZZ ? '🐝 Buzzing… gently now!' : null;
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    // a knock really winds them up
    this.anger = clamp(this.anger + amount * 3, 0, 1);
    this.sim.fx?.burst('chunk', point, { count: Math.min(8, 2 + Math.floor(amount * 25)), speed: 1.4, up: 0.8, size: 0.04, life: 1, gravity: 10, colors: [0xf5c16c, 0xe9a23b] });
  }

  protected onBreak() {
    const p = this.visual.localToWorld(new THREE.Vector3(0, 0, 0));
    this.sim.fx?.burst('blob', p, { count: 26, speed: 2.4, up: 1.2, size: 0.07, life: 2, gravity: 10, colors: [0xffb21a, 0xe98a1a, 0xffd84d] });
    this.sim.fx?.burst('chunk', p, { count: 20, speed: 3, up: 1.4, size: 0.06, life: 2, gravity: 10, colors: [0xf5c16c, 0xe9a23b, 0xfbfaf6] });
    this.anger = 1;
    this.swarm ??= p.clone();
  }

  dispose() {
    this.swarmObj.removeFromParent();
    this.swarmObj.geometry.dispose();
    super.dispose();
  }
}
