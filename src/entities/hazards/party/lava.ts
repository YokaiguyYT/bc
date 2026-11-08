import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { RigidBody } from '../../../physics/rapier';
import type { Player } from '../../Player';
import { ON, PartyGame } from './base';
import { mesh, pack2, platform, unpack2 } from './kit';

/** Tiles along each side, and how big each is (m). */
export const LAVA_N = 7;
export const LAVA_TILE = 1.8;
const HALF = (LAVA_N * LAVA_TILE) / 2;
const WARN = 1.4;

interface Tile {
  body: RigidBody;
  look: THREE.Object3D;
  mat: THREE.MeshStandardMaterial;
  x: number;
  z: number;
  /** 0 up, 1 about to go, 2 gone. */
  state: number;
  /** When it started shaking, and how far it's fallen. */
  t0: number;
  y: number;
  vy: number;
}

const HOT = new THREE.Color(0xff5a2a);

/**
 * The Floor is Lava: a grid of tiles over the lava. One by one (then faster,
 * then two at a time) a tile shakes, glows and drops. Shove, dodge and jump;
 * the last mover still on a tile wins the round.
 */
export class Lava extends PartyGame {
  readonly title = 'The Floor is Lava';
  private tiles: Tile[] = [];
  private t = 0;
  private nextDrop = 0;
  private states = new Uint8Array(LAVA_N * LAVA_N);

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    const geo = new THREE.BoxGeometry(LAVA_TILE - 0.08, 0.5, LAVA_TILE - 0.08);
    for (let i = 0; i < LAVA_N * LAVA_N; i++) {
      const x = (i % LAVA_N) * LAVA_TILE - HALF + LAVA_TILE / 2;
      const z = Math.floor(i / LAVA_N) * LAVA_TILE - HALF + LAVA_TILE / 2;
      // a checker of two creams, each tile its own material (it glows before it goes)
      const mat = new THREE.MeshStandardMaterial({ color: (i + Math.floor(i / LAVA_N)) % 2 ? 0xb9c3d2 : 0x9ea9bb, roughness: 0.85, emissive: 0x000000 });
      const look = new THREE.Group();
      look.add(mesh(geo, mat));
      const { body } = platform(this.sim, this.root, new THREE.Vector3(x, -0.25, z), RAPIER.ColliderDesc.cuboid((LAVA_TILE - 0.08) / 2, 0.25, (LAVA_TILE - 0.08) / 2), look, { moving: true, friction: 0.9, material: 'concrete' });
      this.tiles.push({ body, look, mat, x, z, state: 0, t0: 0, y: -0.25, vy: 0 });
    }
  }

  protected setup() {
    this.t = 0;
    this.nextDrop = 2.5;
    for (const t of this.tiles) {
      t.state = 0;
      t.y = -0.25;
      t.vy = 0;
      t.body.setNextKinematicTranslation({ x: t.x, y: t.y, z: t.z });
      t.body.setTranslation({ x: t.x, y: t.y, z: t.z }, true);
    }
    this.place(0, -LAVA_TILE * 2, 0, 0, Math.PI / 2);
    this.place(1, LAVA_TILE * 2, 0, 0, -Math.PI / 2);
  }

  private tileUnder(p: Player) {
    const ix = Math.floor((p.bodyPos.x + HALF) / LAVA_TILE);
    const iz = Math.floor((p.bodyPos.z + HALF) / LAVA_TILE);
    return ix < 0 || iz < 0 || ix >= LAVA_N || iz >= LAVA_N ? -1 : iz * LAVA_N + ix;
  }

  /** Pick the next tile to go: mostly anywhere, sometimes one somebody's standing on. */
  private drop(now: number) {
    const up = this.tiles.map((t, i) => (t.state === 0 ? i : -1)).filter((i) => i >= 0);
    // (the last tile goes too in the end, or two careful people could share it for ever)
    if (!up.length || (up.length === 1 && this.t < 75)) return;
    let pick = up[Math.floor(Math.random() * up.length)];
    if (Math.random() < 0.4) {
      const p = this.players[Math.floor(Math.random() * 2)];
      const k = p ? this.tileUnder(p) : -1;
      if (k >= 0 && this.tiles[k].state === 0) pick = k;
    }
    const t = this.tiles[pick];
    t.state = 1;
    t.t0 = now;
  }

  protected step(dt: number, now: number) {
    this.t += dt;
    if (this.t >= this.nextDrop) {
      this.drop(now);
      if (this.t > 30) this.drop(now);
      this.nextDrop = this.t + Math.max(0.5, 1.35 - this.t * 0.025);
    }
    this.fall(dt, now);
    const [a, b] = this.players;
    const oa = a.bodyPos.y < -1.4;
    const ob = b.bodyPos.y < -1.4;
    if (oa && ob) return -1;
    if (oa) return 1;
    if (ob) return 0;
    return ON;
  }

  protected idle(dt: number, now: number) {
    this.fall(dt, now);
  }

  private fall(dt: number, now: number) {
    for (const t of this.tiles) {
      if (t.state === 1 && now - t.t0 > WARN) t.state = 2;
      if (t.state !== 2 || t.y < -12) continue;
      t.vy -= 14 * dt;
      t.y += t.vy * dt;
      t.body.setNextKinematicTranslation({ x: t.x, y: t.y, z: t.z });
    }
  }

  line() {
    const left = this.tiles.filter((t) => t.state === 0).length;
    return this.phase === 'play' ? `${left} tiles left · stay off the lava!` : 'Last one standing wins the round.';
  }
  protected roundText(w: number) {
    return w < 0 ? 'BOTH TOASTED!' : `${this.name(w)} SURVIVES!`;
  }

  protected netExtra() {
    this.tiles.forEach((t, i) => (this.states[i] = t.state));
    return [...pack2(this.states)];
  }
  protected applyExtra(v: number[]) {
    unpack2(v, this.states);
    const now = this.sim.time();
    this.tiles.forEach((t, i) => {
      if (this.states[i] === 1 && t.state !== 1) t.t0 = now;
      t.state = this.states[i];
    });
  }

  protected looks(_dt: number, time: number) {
    for (const t of this.tiles) {
      if (t.state === 1) {
        // shaking and glowing hotter
        const k = Math.min(1, (this.sim.time() - t.t0) / WARN);
        t.mat.emissive.copy(HOT).multiplyScalar(0.25 + k * 0.6 * (Math.sin(time * 30) > 0 ? 1 : 0.6));
        t.look.children[0].position.set(Math.sin(time * 61) * 0.04 * k, 0, Math.cos(time * 53) * 0.04 * k);
      } else {
        t.mat.emissive.setHex(t.state === 2 ? 0x661800 : 0x000000);
        t.look.children[0].position.set(0, 0, 0);
      }
    }
  }

  private plan = { x: 0, z: 0, at: -9, jump: false };
  protected cpuMove(me: Player, foe: Player) {
    const now = this.sim.time();
    if (now - this.plan.at > 0.35 - 0.25 * this.skill) {
      this.plan.at = now;
      // the safest tile it can walk to: still up, lots of neighbours up, not too far, away from them
      const here = this.tileUnder(me);
      const N = LAVA_N;
      const up = (i: number) => i >= 0 && this.tiles[i].state === 0;
      const dist = new Map<number, number>();
      const from = new Map<number, number>();
      const q: number[] = [];
      if (here >= 0 && this.tiles[here].state !== 2) {
        dist.set(here, 0);
        q.push(here);
      }
      while (q.length) {
        const c = q.shift()!;
        const cx = c % N;
        const cz = Math.floor(c / N);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const n = nz * N + nx;
          if (!up(n) || dist.has(n)) continue;
          dist.set(n, dist.get(c)! + 1);
          from.set(n, c);
          q.push(n);
        }
      }
      let best = -1;
      let bestScore = -1e9;
      const fx = foe.bodyPos.x;
      const fz = foe.bodyPos.z;
      for (const [i, d] of dist) {
        if (!up(i)) continue;
        const t = this.tiles[i];
        let around = 0;
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++) {
            const nx = (i % N) + dx;
            const nz = Math.floor(i / N) + dz;
            if ((dx || dz) && nx >= 0 && nz >= 0 && nx < N && nz < N && up(nz * N + nx)) around++;
          }
        const away = Math.min(4, Math.hypot(t.x - fx, t.z - fz));
        const score = around * 0.6 - d * 0.35 + away * 0.25 * this.skill - Math.hypot(t.x, t.z) * 0.3 + (i === here ? 0.15 : 0) + Math.random() * (1 - this.skill);
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      this.plan.jump = false;
      if (best >= 0) {
        // walk the first step of the way there
        let step = best;
        while (from.has(step) && from.get(step) !== here) step = from.get(step)!;
        const t = this.tiles[step];
        this.plan.x = t.x;
        this.plan.z = t.z;
      } else {
        // nowhere to walk: jump for the nearest tile still up
        let near = 1e9;
        for (const t of this.tiles)
          if (t.state === 0) {
            const d = Math.hypot(t.x - me.bodyPos.x, t.z - me.bodyPos.z);
            if (d < near) {
              near = d;
              this.plan.x = t.x;
              this.plan.z = t.z;
            }
          }
        this.plan.jump = near < 3.2;
      }
    }
    this.steer(me, this.plan.x, this.plan.z);
    if (this.plan.jump && me.grounded) me.intent.jumpPressed = true;
  }
}
