import * as THREE from 'three';
import type { EventBus } from '../game/events';

export type ParticleKind = 'dust' | 'shard' | 'spark' | 'drop' | 'blob' | 'chunk' | 'confetti' | 'gear' | 'star' | 'smoke';

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
  ground: number;
  gravity: number;
  drag: number;
  grow: number;
}

interface Pool {
  mesh: THREE.InstancedMesh;
  parts: P[];
  cursor: number;
  shrink: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export interface BurstOptions {
  count: number;
  speed?: number;
  /** Upward bias for velocities. */
  up?: number;
  spread?: number;
  size?: number;
  sizeVar?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  colors?: number[];
  /** Height of the floor under the burst (particles bounce on it). */
  ground?: number;
  dir?: THREE.Vector3;
  grow?: number;
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 });
  g.center();
  return g;
}

function gearGeometry() {
  const g = new THREE.TorusGeometry(0.7, 0.28, 6, 12);
  return g;
}

/** Cheap instanced particles for dust, shards, splashes, confetti... */
export class Effects {
  readonly root = new THREE.Group();
  private pools = new Map<ParticleKind, Pool>();
  /** Optional floor finder supplied by the session. */
  groundAt: ((x: number, y: number, z: number) => number) | null = null;
  private offs: (() => void)[] = [];

  /** Online host: sees bursts the game makes directly (not ones made in reaction to an event). */
  tap: ((kind: ParticleKind, at: THREE.Vector3, o: BurstOptions) => void) | null = null;
  /** Online guest: ignore bursts for a moment (the host's copies are on their way). */
  muted = false;
  private bus: EventBus;

  constructor(parent: THREE.Object3D, events: EventBus) {
    this.bus = events;
    parent.add(this.root);
    const lambert = (c: number, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });
    this.pool('dust', new THREE.IcosahedronGeometry(1, 0), lambert(0xf3ece2), 160, true);
    this.pool('smoke', new THREE.IcosahedronGeometry(1, 1), lambert(0x8d8890, { transparent: true, opacity: 0.55, depthWrite: false }), 80, true);
    this.pool(
      'shard',
      new THREE.TetrahedronGeometry(1, 0).scale(1, 0.18, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.75 }),
      220,
      false,
    );
    this.pool('spark', new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 120, true);
    this.pool('drop', new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }), 260, true);
    this.pool('blob', new THREE.SphereGeometry(1, 10, 8), lambert(0xffffff), 160, false);
    this.pool('chunk', new THREE.BoxGeometry(1, 1, 1), lambert(0xffffff), 120, false);
    this.pool('confetti', new THREE.PlaneGeometry(1, 0.6), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 260, false);
    this.pool('gear', gearGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.7 }), 40, false);
    this.pool('star', starGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), 40, true);

    const D = (x: number) => x;
    this.offs.push(
      events.on('land', (e) => this.burst('dust', e.pos, { count: Math.min(10, 3 + Math.floor(e.speed)), speed: 1.4, up: 0.4, size: 0.12, life: 0.7, gravity: -0.3, drag: 3, ground: e.pos.y })),
      events.on('jump', (e) => this.burst('dust', e.pos.clone().setY(e.pos.y - 0.8), { count: 3, speed: 1, up: 0.2, size: 0.09, life: 0.5, gravity: -0.2, drag: 3 })),
      events.on('step', (e) => {
        if (e.speed > 3.6) this.burst('dust', e.pos, { count: 1, speed: 0.5, up: 0.3, size: 0.07, life: 0.45, gravity: -0.2, drag: 3 });
      }),
      events.on('knock', (e) => {
        this.burst('star', e.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), { count: 5, speed: 2.4, up: 2, size: 0.09, life: 0.9, gravity: 4, colors: [0xffd84d, 0xffffff, 0xffe9a0] });
        this.burst('dust', e.pos, { count: 6, speed: 1.6, size: 0.12, life: 0.6, gravity: -0.2, drag: 3 });
      }),
      events.on('impact', (e) => {
        if (e.speed < 2.2) return;
        const n = Math.min(8, Math.floor(e.speed * 1.5));
        if (e.material === 'metal') this.burst('spark', e.pos, { count: n, speed: 3, up: 1.5, size: 0.025, life: 0.35, gravity: 9, colors: [0xffe28a, 0xffb347] });
        else this.burst('dust', e.pos, { count: n, speed: 1.2, up: 0.4, size: 0.08, life: 0.5, gravity: -0.2, drag: 3 });
      }),
      events.on('splash', (e) => this.burst('drop', e.pos, { count: Math.min(30, 4 + Math.floor(e.amount * 60)), speed: 2.2, up: 2.2, size: 0.022, sizeVar: 0.5, life: 1.2, gravity: 11, colors: [0x7fd6ff, 0xbfeaff] })),
    );
    void D;
  }

  private pool(kind: ParticleKind, geo: THREE.BufferGeometry, mat: THREE.Material, max: number, shrink: boolean) {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = kind === 'chunk' || kind === 'blob' || kind === 'gear' || kind === 'shard';
    const parts: P[] = [];
    for (let i = 0; i < max; i++) {
      parts.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        scale: 0,
        life: 0,
        maxLife: 1,
        ground: -1e9,
        gravity: 9.8,
        drag: 0,
        grow: 0,
      });
      mesh.setColorAt(i, _c.set(0xffffff));
    }
    this.root.add(mesh);
    this.pools.set(kind, { mesh, parts, cursor: 0, shrink });
  }

  burst(kind: ParticleKind, at: THREE.Vector3, o: BurstOptions) {
    if (this.muted) return;
    if (this.tap && this.bus.dispatching === 0) this.tap(kind, at, o);
    const pool = this.pools.get(kind);
    if (!pool) return;
    const ground = o.ground ?? (this.groundAt ? this.groundAt(at.x, at.y + 0.2, at.z) : at.y - 2);
    for (let i = 0; i < o.count; i++) {
      const p = pool.parts[pool.cursor];
      const idx = pool.cursor;
      pool.cursor = (pool.cursor + 1) % pool.parts.length;
      p.alive = true;
      const sp = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 + (o.up ?? 0.5), Math.random() - 0.5).normalize();
      if (o.dir) dir.lerp(o.dir, 0.6).normalize();
      const spread = o.spread ?? 0.05;
      p.pos.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread);
      p.vel.copy(dir).multiplyScalar(sp);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      p.scale = (o.size ?? 0.08) * (1 - (o.sizeVar ?? 0.4) * Math.random());
      p.maxLife = p.life = (o.life ?? 1) * (0.7 + Math.random() * 0.6);
      p.ground = ground;
      p.gravity = o.gravity ?? 9.8;
      p.drag = o.drag ?? 0.4;
      p.grow = o.grow ?? (kind === 'dust' || kind === 'smoke' ? 1.6 : 0);
      if (o.colors) pool.mesh.setColorAt(idx, _c.set(o.colors[Math.floor(Math.random() * o.colors.length)]));
      else pool.mesh.setColorAt(idx, _c.set(0xffffff));
    }
    if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    for (const [, pool] of this.pools) {
      let maxIdx = -1;
      const parts = pool.parts;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p.alive) {
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          p.alive = false;
          _m.makeScale(0, 0, 0);
          pool.mesh.setMatrixAt(i, _m);
          continue;
        }
        maxIdx = i;
        p.vel.y -= p.gravity * dt;
        const d = Math.exp(-p.drag * dt);
        p.vel.multiplyScalar(d);
        p.pos.addScaledVector(p.vel, dt);
        if (p.pos.y < p.ground + p.scale * 0.5) {
          p.pos.y = p.ground + p.scale * 0.5;
          if (p.vel.y < 0) p.vel.y *= -0.3;
          p.vel.x *= 0.7;
          p.vel.z *= 0.7;
          p.spin.multiplyScalar(0.6);
        }
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        const t = p.life / p.maxLife;
        let s = p.scale;
        if (p.grow) s *= 1 + p.grow * (1 - t);
        if (pool.shrink) s *= Math.min(1, t * 3);
        else s *= Math.min(1, t * 6);
        _q.setFromEuler(p.rot);
        _m.compose(p.pos, _q, _s.set(s, s, s));
        pool.mesh.setMatrixAt(i, _m);
      }
      pool.mesh.count = maxIdx + 1;
      pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const off of this.offs) off();
    for (const [, pool] of this.pools) {
      pool.mesh.geometry.dispose();
      (pool.mesh.material as THREE.Material).dispose();
    }
    this.root.removeFromParent();
  }
}
