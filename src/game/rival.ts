import * as THREE from 'three';
import { RIVAL_RUNS } from '../levels/rivals';

/**
 * Versus: the other crew, shown as see-through movers and a load in their
 * company colour with a name tag over them. They never touch anything: each
 * crew carries its own copy of the load on its own copy of the job, and it's
 * a race to deliver.
 *
 * - An AI rival crew replays a recorded delivery of the job (the test bot's),
 *   slower or quicker for Easy / Normal / Hard.
 * - Online, the other laptop's crew: where their movers and load are, sent
 *   about ten times a second.
 */

export type RivalPace = 'easy' | 'normal' | 'hard';
export const RIVAL_PACES: Record<RivalPace, { name: string; speed: number; icon: string }> = {
  easy: { name: 'Easy', speed: 0.7, icon: '🐢' },
  normal: { name: 'Normal', speed: 0.9, icon: '🚚' },
  hard: { name: 'Hard', speed: 1.1, icon: '🏎️' },
};

const HZ = 8;

/** The hand-made jobs that have a rival crew. */
export function hasRival(level: string) {
  return !!RIVAL_RUNS[level];
}

/** A recorded run: frames of 9 numbers (P1, P2, load: x y z, in cm), stored as deltas. */
function decode(s: string): number[] {
  const d = s.split(',').map(Number);
  const out: number[] = [];
  for (let i = 0; i < d.length; i++) out.push((i >= 9 ? out[i - 9] : 0) + d[i]);
  return out;
}

function label(text: string, color: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '800 56px "Fredoka", ui-rounded, system-ui, sans-serif';
  const w = Math.min(500, ctx.measureText(text).width + 60);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect((512 - w) / 2, 14, w, 96, 40);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = '#2b2b33';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.4, 0.6, 1);
  sp.renderOrder = 10;
  return sp;
}

export class RivalCrew {
  readonly root = new THREE.Group();
  private parts: THREE.Object3D[] = [];
  private tag: THREE.Sprite;
  /** AI: the recorded run. */
  private frames: number[] = [];
  private speed = 1;
  /** Online: the latest frames heard (time, 9 numbers). */
  private live: { t: number; f: number[] }[] = [];
  /** When they delivered (their job clock, s), once they have. */
  finish: number | null = null;
  /** Online: they gave up, broke it, or left. */
  out = false;

  constructor(
    readonly name: string,
    color: number,
    cargoSize: THREE.Vector3,
  ) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false });
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
    this.tag = label(name, '#' + color.toString(16).padStart(6, '0'));
    this.root.add(...this.parts, this.tag);
    this.root.renderOrder = 3;
    this.root.visible = false;
  }

  /** An AI crew replaying a recorded delivery of this job (null if there isn't one). */
  static ai(level: string, pace: RivalPace, cargoSize: THREE.Vector3) {
    const run = RIVAL_RUNS[level];
    if (!run) return null;
    const p = RIVAL_PACES[pace];
    const r = new RivalCrew(`${p.icon} Rival Movers`, 0xe0457b, cargoSize);
    r.frames = decode(run.f);
    r.speed = p.speed;
    r.finish = run.time / p.speed;
    return r;
  }

  /** Online: the other crew, whose positions arrive with `push`. */
  static online(name: string, cargoSize: THREE.Vector3) {
    return new RivalCrew(`⚔️ ${name}`, 0x8a5cff, cargoSize);
  }

  push(t: number, f: number[]) {
    if (f.length !== 9 || f.some((n) => !Number.isFinite(n))) return;
    this.live.push({ t, f });
    if (this.live.length > 40) this.live.shift();
  }

  /** Where everyone is `t` seconds into the job. */
  update(t: number) {
    let f: number[] | null = null;
    if (this.frames.length >= 9) {
      const n = Math.floor(this.frames.length / 9);
      const k = Math.min(n - 1, Math.max(0, t * this.speed * HZ));
      const i = Math.floor(k);
      const j = Math.min(n - 1, i + 1);
      const u = k - i;
      f = [];
      for (let m = 0; m < 9; m++) f.push(this.frames[i * 9 + m] + (this.frames[j * 9 + m] - this.frames[i * 9 + m]) * u);
    } else if (this.live.length) {
      // a little behind real time, so there's a frame either side to blend between
      const want = t - 0.25;
      const L = this.live;
      let a = L[0];
      let b = L[L.length - 1];
      for (let i = 0; i < L.length - 1; i++)
        if (L[i].t <= want && L[i + 1].t >= want) {
          a = L[i];
          b = L[i + 1];
          break;
        }
      const u = b.t > a.t ? Math.min(1, Math.max(0, (want - a.t) / (b.t - a.t))) : 1;
      f = a.f.map((v, m) => v + (b.f[m] - v) * u);
    }
    this.root.visible = !!f && !this.out;
    if (!f) return;
    this.parts.forEach((o, n) => o.position.set(f![n * 3] / 100, f![n * 3 + 1] / 100, f![n * 3 + 2] / 100));
    this.tag.position.set(f[6] / 100, f[7] / 100 + 1.6, f[8] / 100);
  }
}
