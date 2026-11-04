import * as THREE from 'three';
import { loadJSON, saveJSON } from '../util/storage';

/**
 * The ghost of your best run in a hand-made job: where the two movers and
 * the load were, 8 times a second, on your fastest delivery. Next time it
 * plays back alongside you as see-through shapes (it touches nothing).
 */

const HZ = 8;
const key = (level: string) => `ff.ghost.${level}`;

interface Saved {
  /** The job's time when delivered (s). */
  time: number;
  /** Frames of 9 numbers each (P1, P2, load: x y z), in centimetres. */
  f: number[];
}

export class GhostRecorder {
  private f: number[] = [];
  private next = 0;

  /** Note where everyone is (call every frame with the job's clock). */
  sample(t: number, pts: THREE.Vector3[]) {
    if (t < this.next) return;
    this.next = t + 1 / HZ;
    for (const p of pts) this.f.push(Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100));
  }

  /** Keep this run if it's the fastest delivery so far. Returns true if it was kept. */
  save(level: string, time: number) {
    const old = loadJSON<Saved>(key(level));
    if (old && old.time <= time) return false;
    saveJSON(key(level), { time, f: this.f } satisfies Saved);
    return true;
  }
}

export class GhostView {
  readonly root = new THREE.Group();
  private parts: THREE.Object3D[] = [];
  private frames: number;

  private constructor(
    private saved: Saved,
    cargoSize: THREE.Vector3,
  ) {
    this.frames = Math.floor(saved.f.length / 9);
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.32, depthWrite: false });
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 10), mat);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat);
      head.position.y = 0.62;
      g.add(body, head);
      this.parts.push(g);
    }
    const load = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, cargoSize.x), Math.max(0.3, cargoSize.y), Math.max(0.3, cargoSize.z)), mat);
    this.parts.push(load);
    this.root.add(...this.parts);
    this.root.renderOrder = 3;
  }

  /** Your best run in this job, if there is one. */
  static load(level: string, cargoSize: THREE.Vector3) {
    const s = loadJSON<Saved>(key(level));
    if (!s || !Array.isArray(s.f) || s.f.length < 18) return null;
    return new GhostView(s, cargoSize);
  }

  /** Where everyone was `t` seconds into the job (between samples, in a straight line). */
  update(t: number) {
    const k = Math.min(this.frames - 1, Math.max(0, t * HZ));
    const i = Math.floor(k);
    const j = Math.min(this.frames - 1, i + 1);
    const u = k - i;
    const f = this.saved.f;
    this.root.visible = t <= this.saved.time + 1.5;
    this.parts.forEach((o, n) => {
      const a = i * 9 + n * 3;
      const b = j * 9 + n * 3;
      o.position.set((f[a] + (f[b] - f[a]) * u) / 100, (f[a + 1] + (f[b + 1] - f[a + 1]) * u) / 100, (f[a + 2] + (f[b + 2] - f[a + 2]) * u) / 100);
    });
  }

  get time() {
    return this.saved.time;
  }
}
