import * as THREE from 'three';
import type { Player } from '../../Player';
import { glossy, matte } from '../../../render/materials';
import { ON, PartyGame } from './base';
import { mesh, pack2, unpack2 } from './kit';

/** Tiles along each side (1 m each), centred on the middle. */
export const PAINT_N = 14;
const HALF = PAINT_N / 2;
const BLANK = new THREE.Color(0xe9e4da);

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _v = new THREE.Vector3();

/**
 * Paint the Floor: every tile you walk on turns your colour. Paint buckets
 * turn up now and then: grab one (walk into it) for a big splash. When the
 * clock runs out, whoever has more of the floor wins the round.
 */
export class Paint extends PartyGame {
  readonly title = 'Paint the Floor';
  /** Who owns each tile: 0 nobody, 1 P1, 2 P2. */
  private owner = new Uint8Array(PAINT_N * PAINT_N);
  private tiles: THREE.InstancedMesh;
  private dirty = true;
  private cols: THREE.Color[] = [];
  /** The paint bucket: where, and whether it's out. */
  private bucket = { x: 0, z: 0, on: false, next: 6 };
  private bucketObj = new THREE.Group();
  private bucketPaint: THREE.MeshStandardMaterial;
  private t = 0;

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    this.tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.94, 0.04, 0.94), matte(0xffffff), PAINT_N * PAINT_N);
    this.tiles.receiveShadow = true;
    for (let i = 0; i < PAINT_N * PAINT_N; i++) {
      const [x, z] = this.centre(i);
      _m.makeTranslation(x, 0.02, z);
      this.tiles.setMatrixAt(i, _m);
      this.tiles.setColorAt(i, BLANK);
    }
    this.root.add(this.tiles);
    // a bucket of paint, sloshing
    const tin = mesh(new THREE.CylinderGeometry(0.32, 0.27, 0.5, 18), glossy(0xc8ccd4, 0.35, 0.7));
    tin.position.y = 0.25;
    this.bucketPaint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const paint = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 18), this.bucketPaint, false);
    paint.position.y = 0.49;
    const handle = mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 20, Math.PI), glossy(0x8a8a96, 0.3, 0.6), false);
    handle.position.y = 0.5;
    const drip = mesh(new THREE.SphereGeometry(0.09, 10, 8), this.bucketPaint, false);
    drip.scale.set(1, 1.6, 0.5);
    drip.position.set(0.3, 0.38, 0);
    this.bucketObj.add(tin, paint, handle, drip);
    this.bucketObj.visible = false;
    this.root.add(this.bucketObj);
  }

  private centre(i: number): [number, number] {
    return [(i % PAINT_N) - HALF + 0.5, Math.floor(i / PAINT_N) - HALF + 0.5];
  }
  private tileAt(x: number, z: number) {
    const ix = Math.floor(x + HALF);
    const iz = Math.floor(z + HALF);
    return ix < 0 || iz < 0 || ix >= PAINT_N || iz >= PAINT_N ? -1 : iz * PAINT_N + ix;
  }

  protected setup() {
    this.owner.fill(0);
    this.dirty = true;
    this.t = 0;
    this.bucket.on = false;
    this.bucket.next = 7;
    this.place(0, -3, 0, 0, Math.PI / 2);
    this.place(1, 3, 0, 0, -Math.PI / 2);
  }

  private count() {
    let a = 0;
    let b = 0;
    for (const o of this.owner) {
      if (o === 1) a++;
      else if (o === 2) b++;
    }
    this.tally = [a, b];
  }

  protected step(dt: number) {
    this.t += dt;
    let changed = false;
    this.players.forEach((p, i) => {
      if (p.state === 'knocked' || p.bodyPos.y > 1.6) return;
      const k = this.tileAt(p.bodyPos.x, p.bodyPos.z);
      if (k >= 0 && this.owner[k] !== i + 1) {
        this.owner[k] = i + 1;
        changed = true;
      }
      // the bucket: a splash all round
      const b = this.bucket;
      if (b.on && Math.hypot(p.bodyPos.x - b.x, p.bodyPos.z - b.z) < 0.85) {
        b.on = false;
        b.next = this.t + 7 + Math.random() * 4;
        for (let j = 0; j < this.owner.length; j++) {
          const [x, z] = this.centre(j);
          if (Math.hypot(x - b.x, z - b.z) < 2.4) this.owner[j] = i + 1;
        }
        changed = true;
        this.say('SPLASH!', true, i);
        this.sim.fx?.burst('confetti', _v.set(b.x, 0.6, b.z), { count: 40, speed: 4, up: 3, size: 0.1, life: 1.1, gravity: 7, colors: [p.color, p.color, 0xffffff], ground: 0.05 });
      }
    });
    // a new bucket somewhere away from both of them
    const b = this.bucket;
    if (!b.on && this.t > b.next && this.clock > 4) {
      for (let tries = 0; tries < 12; tries++) {
        const x = (Math.random() - 0.5) * (PAINT_N - 3);
        const z = (Math.random() - 0.5) * (PAINT_N - 3);
        if (this.players.every((p) => Math.hypot(p.bodyPos.x - x, p.bodyPos.z - z) > 3)) {
          b.x = x;
          b.z = z;
          b.on = true;
          this.say('🪣 PAINT BUCKET!', true);
          break;
        }
      }
    }
    if (changed) {
      this.dirty = true;
      this.count();
    }
    return ON;
  }

  finalLine() {
    return `🎨 last round: ${this.tally[0]} tiles vs ${this.tally[1]}`;
  }
  showTally() {
    return `${this.tally[0]}|${this.tally[1]}`;
  }
  line() {
    const n = PAINT_N * PAINT_N;
    return this.phase === 'play' ? `tiles: ${Math.round((this.tally[0] / n) * 100)}% – ${Math.round((this.tally[1] / n) * 100)}%` : 'Walk on tiles to paint them. Most floor wins!';
  }
  protected roundText(w: number) {
    return w < 0 ? 'DEAD HEAT!' : `${this.name(w)} PAINTED MORE!`;
  }

  protected netExtra() {
    return [this.bucket.x, this.bucket.z, this.bucket.on ? 1 : 0, ...pack2(this.owner)];
  }
  protected applyExtra(v: number[]) {
    this.bucket.x = v[0] ?? 0;
    this.bucket.z = v[1] ?? 0;
    this.bucket.on = v[2] === 1;
    const before = this.owner.join();
    unpack2(v.slice(3), this.owner);
    if (this.owner.join() !== before) this.dirty = true;
  }

  protected looks(_dt: number, time: number) {
    if (!this.cols.length && this.players.length === 2) {
      // the movers' own colours, a touch lighter so the movers stand out on them
      this.cols = this.players.map((p) => new THREE.Color(p.color).lerp(new THREE.Color(0xffffff), 0.18));
      this.dirty = true;
    }
    if (this.dirty && this.cols.length) {
      this.dirty = false;
      for (let i = 0; i < this.owner.length; i++) this.tiles.setColorAt(i, this.owner[i] ? this.cols[this.owner[i] - 1] : _c.copy(BLANK));
      if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    }
    const b = this.bucket;
    this.bucketObj.visible = b.on;
    if (b.on) {
      this.bucketObj.position.set(b.x, 0.04 + Math.abs(Math.sin(time * 3)) * 0.15, b.z);
      this.bucketObj.rotation.y = time;
      this.bucketPaint.color.setHSL((time * 0.4) % 1, 0.75, 0.55);
    }
  }

  private plan = { x: 0, z: 0, at: -9 };
  protected cpuMove(me: Player) {
    const now = this.sim.time();
    if (now - this.plan.at > 0.4 - 0.25 * this.skill) {
      this.plan.at = now;
      const m = me.bodyPos;
      const v = me.bodyVel;
      const sp = Math.hypot(v.x, v.z) || 1;
      let best = -1e9;
      const b = this.bucket;
      if (b.on && Math.hypot(b.x - m.x, b.z - m.z) < 4 + 4 * this.skill) {
        this.plan.x = b.x;
        this.plan.z = b.z;
      } else {
        // the best tile nearby: theirs most, then blank ones; keep going the way it's going
        for (let i = 0; i < this.owner.length; i++) {
          const o = this.owner[i];
          if (o === 2) continue;
          const [x, z] = this.centre(i);
          const d = Math.hypot(x - m.x, z - m.z);
          if (d > 5 || d < 0.6) continue;
          const along = ((x - m.x) * v.x + (z - m.z) * v.z) / (d * sp);
          const score = (o === 1 ? 2.3 : 1.6) - d * 0.35 + along * 0.35 + Math.random() * (1 - this.skill) * 0.8;
          if (score > best) {
            best = score;
            this.plan.x = x;
            this.plan.z = z;
          }
        }
        if (best === -1e9) {
          // all ours round here: head for the middle of theirs
          this.plan.x = -m.x * 0.5;
          this.plan.z = -m.z * 0.5;
        }
      }
    }
    this.steer(me, this.plan.x, this.plan.z);
  }
}
