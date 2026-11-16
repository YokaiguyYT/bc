import * as THREE from 'three';
import type { Player } from '../../Player';
import { ON, PartyGame } from './base';
import { mesh } from './kit';

/** The pen's half-size (inside the walls), and the blocks to jump off: [x, z, half-width, half-depth, height]. */
export const STOMP_HALF = 6.5;
export const STOMP_BLOCKS: [number, number, number, number, number][] = [
  [-3.4, -3.2, 1.0, 1.0, 0.7],
  [3.4, 3.2, 1.0, 1.0, 0.7],
  [3.6, -3.4, 0.8, 0.8, 0.45],
  [-3.6, 3.4, 0.8, 0.8, 0.45],
];
const LIVES = 3;
/** Springy boots: how much higher everybody jumps here. */
const SPRING = 1.42;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * Balloon Stomp: three balloons each, tied on over your head, and springy
 * boots. Come down on the other mover from above and one of theirs pops (and
 * you bounce off for another go). Out of balloons, out of the round; if the
 * clock runs out, whoever has more left wins it.
 */
export class Stomp extends PartyGame {
  readonly title = 'Balloon Stomp';
  private lives: [number, number] = [LIVES, LIVES];
  /** Just stomped: can't be again for this long (s). */
  private safe = [0, 0];
  private looksOf: { group: THREE.Group; balloons: THREE.Group[]; mat: THREE.MeshStandardMaterial; at: THREE.Vector3 }[] = [];
  private coloured = false;

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    const geo = new THREE.SphereGeometry(0.22, 16, 12).scale(1, 1.22, 1);
    const knot = new THREE.ConeGeometry(0.04, 0.07, 6);
    const line = new THREE.CylinderGeometry(0.006, 0.006, 1, 4).translate(0, -0.5, 0);
    const thread = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = 0; i < 2; i++) {
      // (its own material: it takes the mover's colour, and blinks)
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.92 });
      const group = new THREE.Group();
      const balloons: THREE.Group[] = [];
      for (let k = 0; k < LIVES; k++) {
        const b = new THREE.Group();
        b.add(mesh(geo, mat, false));
        const kn = mesh(knot, mat, false);
        kn.position.y = -0.29;
        b.add(kn);
        const s = mesh(line, thread, false);
        s.position.y = -0.32;
        s.scale.y = 0.55;
        b.add(s);
        b.position.set((k - (LIVES - 1) / 2) * 0.34, 0.95 + (k % 2) * 0.16, 0);
        b.rotation.z = -(k - (LIVES - 1) / 2) * 0.28;
        group.add(b);
        balloons.push(b);
      }
      group.visible = false;
      this.root.add(group);
      this.looksOf.push({ group, balloons, mat, at: new THREE.Vector3() });
    }
  }

  protected setup() {
    this.place(0, -4.6, 0, 0, Math.PI / 2);
    this.place(1, 4.6, 0, 0, -Math.PI / 2);
    this.lives = [LIVES, LIVES];
    this.tally = [LIVES, LIVES];
    this.safe = [0, 0];
    for (const p of this.players) p.jumpScale = SPRING;
  }

  line() {
    return this.phase === 'play' ? 'Springy boots! Jump on their head to pop a balloon' : 'Pop all three of their balloons.';
  }
  showTally() {
    return `🎈${this.tally[0]}|🎈${this.tally[1]}`;
  }
  finalLine() {
    return `🎈 ${this.tally[0]} vs ${this.tally[1]} balloons left`;
  }
  protected roundText(w: number) {
    return w < 0 ? 'DRAW!' : `POP! ${this.name(w)} WINS THE ROUND`;
  }

  protected step(dt: number) {
    const ps = this.players;
    for (let i = 0; i < 2; i++) this.safe[i] = Math.max(0, this.safe[i] - dt);
    for (let a = 0; a < 2; a++) {
      const A = ps[a];
      const B = ps[1 - a];
      if (A.state !== 'active' || this.safe[1 - a] > 0) continue;
      const dy = A.bodyPos.y - B.bodyPos.y;
      const d = Math.hypot(A.bodyPos.x - B.bodyPos.x, A.bodyPos.z - B.bodyPos.z);
      // coming down on them from above
      if (dy > 0.8 && dy < 2 && d < 0.78 && A.bodyVel.y < -0.8) {
        this.pop(A, B);
        if (this.lives[1 - a] <= 0) return a;
      }
    }
    this.tally = [this.lives[0], this.lives[1]];
    return ON;
  }

  /** `a` has landed on `b`: one of b's balloons goes, and a bounces off. */
  private pop(a: Player, b: Player) {
    const v = b.index;
    this.lives[v] = Math.max(0, this.lives[v] - 1);
    this.tally = [this.lives[0], this.lives[1]];
    this.safe[v] = 1.3;
    // (neither is knocked flat by the jolt)
    a.respawnProtect = Math.max(a.respawnProtect, 0.4);
    b.respawnProtect = Math.max(b.respawnProtect, 0.4);
    let ax = a.bodyPos.x - b.bodyPos.x;
    let az = a.bodyPos.z - b.bodyPos.z;
    const l = Math.hypot(ax, az);
    if (l < 0.05) {
      const r = Math.random() * Math.PI * 2;
      ax = Math.cos(r);
      az = Math.sin(r);
    } else {
      ax /= l;
      az /= l;
    }
    a.applyBlast(_v.set(ax * 1.6, 5.6 - a.bodyVel.y, az * 1.6).multiplyScalar(a.totalMass));
    b.applyBlast(_v.set(-ax * 2.2, -1, -az * 2.2).multiplyScalar(b.totalMass));
    this.say('POP!', true, a.index);
    this.sim.shake?.(0.25);
    const at = _w.copy(b.bodyPos).setY(b.bodyPos.y + 1.7);
    this.sim.fx?.burst('star', at, { count: 16, speed: 4, up: 2, size: 0.1, life: 0.8, gravity: 7, colors: [b.color, 0xffffff, 0xffe14a] });
    this.sim.events.emit('impact', { pos: at.clone(), speed: 6, material: 'rubber' });
  }

  protected netExtra() {
    return [this.safe[0], this.safe[1]];
  }
  protected applyExtra(v: number[]) {
    this.safe = [v[0] ?? 0, v[1] ?? 0];
    this.lives = [this.tally[0], this.tally[1]];
  }

  protected looks(dt: number, time: number) {
    const ps = this.players;
    if (!this.coloured && ps.length === 2) {
      this.coloured = true;
      this.looksOf.forEach((l, i) => l.mat.color.setHex(ps[i].color).lerp(new THREE.Color(0xffffff), 0.25));
    }
    this.looksOf.forEach((l, i) => {
      const p = ps[i];
      if (!p) return;
      l.group.visible = this.round > 0 && this.phase !== 'over';
      // tied on over the head; they trail a little behind as the mover moves
      this.sim.physics.interpolatedPosition(p.parts.head, _v);
      if (l.at.distanceToSquared(_v) > 9) l.at.copy(_v);
      l.at.lerp(_v, Math.min(1, dt * 9));
      l.group.position.set(l.at.x, _v.y, l.at.z);
      l.group.rotation.set((l.at.z - _v.z) * -0.9, 0, (l.at.x - _v.x) * 0.9);
      const left = this.phase === 'ready' ? LIVES : this.tally[i];
      // just stomped: the ones left blink
      const blink = this.safe[i] > 0 && Math.sin(time * 30) > 0;
      l.balloons.forEach((b, k) => {
        b.visible = k < left && !blink;
        b.position.y = 0.95 + (k % 2) * 0.16 + Math.sin(time * 2.2 + k * 1.7 + i) * 0.04;
      });
    });
  }

  dispose() {
    for (const p of this.players) p.jumpScale = 1;
    super.dispose();
  }

  // ---------------------------------------------------------------- the computer

  private jumpAt = -9;
  /** This try's timing slip (a share of the right distance; rolled anew after each jump). */
  private slip = 0;
  private dodge = { until: 0, x: 0, z: 0 };
  private back = { until: 0, x: 0, z: 0 };
  protected cpuMove(me: Player, foe: Player, dt: number) {
    const now = this.sim.time();
    // 0 easy .. 1 hard
    const lvl = Math.max(0, Math.min(1, (this.skill - 0.62) / 0.38));
    const m = me.bodyPos;
    const f = foe.bodyPos;
    const d = Math.hypot(f.x - m.x, f.z - m.z);
    // they're in the air and coming our way: out from under (if it's quick enough to see it)
    if (now < this.dodge.until) return this.steer(me, this.dodge.x, this.dodge.z);
    if (!foe.grounded && f.y > m.y + 0.5 && d < 2.6 && this.safe[1] <= 0 && Math.random() < dt * (0.4 + 4.6 * lvl * lvl)) {
      const vx = foe.bodyVel.x;
      const vz = foe.bodyVel.z;
      const l = Math.hypot(vx, vz) || 1;
      // sideways to the way they're going
      const s = (m.x - f.x) * (-vz / l) + (m.z - f.z) * (vx / l) >= 0 ? 1 : -1;
      this.dodge.until = now + 0.45;
      this.dodge.x = clampTo(m.x + (-vz / l) * s * 2.4);
      this.dodge.z = clampTo(m.z + (vx / l) * s * 2.4);
      return this.steer(me, this.dodge.x, this.dodge.z);
    }
    // too close for a jump to come down on them: back off a few steps first
    if (now < this.back.until) return this.steer(me, this.back.x, this.back.z);
    if (me.grounded && d < 1.35) {
      const l = d || 1;
      let bx = m.x + ((m.x - f.x) / l) * 3;
      let bz = m.z + ((m.z - f.z) / l) * 3;
      // (backed into a wall: off to the side instead)
      if (Math.abs(bx) > STOMP_HALF - 0.8 || Math.abs(bz) > STOMP_HALF - 0.8) {
        bx = m.x - ((m.z - f.z) / l) * 3;
        bz = m.z + ((m.x - f.x) / l) * 3;
      }
      this.back.until = now + 0.55;
      this.back.x = clampTo(bx);
      this.back.z = clampTo(bz);
      return this.steer(me, this.back.x, this.back.z);
    }
    // after them: at where they'll be when we come down, at the pace a jump from here would carry us onto them
    // (a jump is in the air about 0.75 s before it's coming down at head height)
    // between tries (longer on easy) it keeps its distance instead of hounding them
    const wait = 3.4 - 2.5 * lvl;
    if (me.grounded && now - this.jumpAt < wait - 0.9 && d < 3.2) {
      const l = d || 1;
      return this.steer(me, clampTo(m.x + ((m.x - f.x) / l) * 2 - ((m.z - f.z) / l) * 1.5), clampTo(m.z + ((m.z - f.z) / l) * 2 + ((m.x - f.x) / l) * 1.5), 0.7);
    }
    const lead = 0.2 + 0.4 * lvl;
    const top = 4.3 * (0.55 + 0.45 * this.skill);
    this.steer(me, f.x + foe.bodyVel.x * lead, f.z + foe.bodyVel.z * lead, Math.max(0.5, Math.min(1, d / 0.75 / top)));
    const v = Math.hypot(me.bodyVel.x, me.bodyVel.z);
    const on = v > 0.1 ? ((f.x - m.x) * me.bodyVel.x + (f.z - m.z) * me.bodyVel.z) / (d * v || 1) : 0;
    const right = v * (0.75 + this.slip);
    if (me.grounded && this.safe[0] <= 0.3 && v > 1.9 && on > 0.85 && d > right - v * 0.11 && d < right + v * 0.11 && now - this.jumpAt > wait) {
      this.jumpAt = now;
      // (the next try's timing: easy misjudges it by up to a quarter either way)
      this.slip = (Math.random() - 0.5) * 0.5 * (1 - lvl);
      me.intent.jumpPressed = true;
    }
  }
}

function clampTo(v: number) {
  return Math.max(-STOMP_HALF + 0.8, Math.min(STOMP_HALF - 0.8, v));
}
