import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { Player } from '../../Player';
import { ON, PartyGame } from './base';
import { mesh, pack2, parkSpot, prop, showLive, spawnProp, unpack2, type Prop } from './kit';

/** The court's half-size (inside the walls). */
export const DODGE_HX = 8;
export const DODGE_HZ = 5;
const N = 5;
const R = 0.27;
/** How fast a throw goes (m/s), and how long it stays dangerous (s). */
const SPEED = 13;
const HOT = 1.4;
/** Catching: grab has to go down this close to the ball arriving (s). */
const CATCH = 0.4;

interface Ball {
  prop: Prop;
  mat: THREE.MeshStandardMaterial;
  home: THREE.Vector3;
  /** Who threw it, while it's dangerous (-1: it's just a ball). */
  hot: number;
  hotUntil: number;
  /** Out of the court since (s; 0: it's in). */
  out: number;
  /** The computer's luck at catching this throw (0..1, rolled when it's thrown). */
  luck: number;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * Dodgeball: five balls on the middle line. Hold grab to pick one up, let go
 * to throw it the way you're facing (it bends a little toward the other mover
 * if you're near enough on target). Hit them and the round is yours; a ball
 * that has bounced about for a moment is just a ball again. Press grab as one
 * arrives, hands empty and facing it, and you catch it instead.
 */
export class Dodgeball extends PartyGame {
  readonly title = 'Dodgeball';
  private balls: Ball[] = [];
  /** When each mover's grab last went down, and whether it was down last frame. */
  private grabAt = [-9, -9];
  private wasGrab = [false, false];
  /** How long each has had a ball in hand. */
  private heldFor = [0, 0];
  private hots = new Uint8Array(N);
  private how = '';

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    const geo = new THREE.SphereGeometry(R, 20, 14);
    const band = new THREE.TorusGeometry(R * 0.99, 0.022, 6, 28);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    for (let i = 0; i < N; i++) {
      // (each its own material: a thrown one glows in the thrower's colour)
      const mat = new THREE.MeshStandardMaterial({ color: 0xe8413a, roughness: 0.55, emissive: 0x000000 });
      const obj = new THREE.Group();
      obj.add(mesh(geo, mat), mesh(band, white, false));
      const p = prop(this.sim, this.root, RAPIER.ColliderDesc.ball(R).setMass(1.2).setRestitution(0.55), obj, parkSpot(i), { material: 'rubber', friction: 0.6, damping: 0.25, angDamping: 0.6, ccd: true });
      this.balls.push({ prop: p, mat, home: new THREE.Vector3(0, R + 0.03, (i - (N - 1) / 2) * 1.7), hot: -1, hotUntil: 0, out: 0, luck: 1 });
    }
  }

  protected setup() {
    this.place(0, -5.6, 0, 0, Math.PI / 2);
    this.place(1, 5.6, 0, 0, -Math.PI / 2);
    for (const p of this.players) p.releaseAll();
    for (const b of this.balls) {
      spawnProp(b.prop, b.home);
      b.hot = -1;
      b.out = 0;
    }
    this.heldFor = [0, 0];
    this.how = '';
  }

  line() {
    return this.phase === 'play' ? 'Hold grab to pick up, let go to throw. Grab as one arrives to catch it!' : 'Hit them with a ball to win the round.';
  }
  protected roundText(w: number) {
    return w < 0 ? 'DRAW!' : `${this.how || 'HIT!'} ${this.name(w)} WINS THE ROUND`;
  }

  private inHand(p: Player) {
    return this.balls.findIndex((b) => p.hands.some((h) => h.grip?.body?.handle === b.prop.body.handle));
  }

  /** Each frame, after the keys: grab let go with a ball in hand is a throw. */
  protected frameHook(dt: number) {
    const now = this.sim.time();
    this.players.forEach((p, i) => {
      const g = p.intent.grab;
      if (g && !this.wasGrab[i]) this.grabAt[i] = now;
      this.wasGrab[i] = g;
      const k = p.state === 'active' ? this.inHand(p) : -1;
      this.heldFor[i] = k >= 0 ? this.heldFor[i] + dt : 0;
      if (k >= 0 && !g) this.throwBall(i, this.balls[k]);
    });
  }

  /** `who` throws this ball: the way they face, bent toward the other mover when that's nearly the same way. */
  private throwBall(who: number, ball: Ball) {
    const p = this.players[who];
    const foe = this.players[1 - who];
    p.releaseAll();
    let dx = Math.sin(p.facingYaw);
    let dz = Math.cos(p.facingYaw);
    const y0 = p.bodyPos.y + 0.2;
    let tx = foe.bodyPos.x - p.bodyPos.x;
    let tz = foe.bodyPos.z - p.bodyPos.z;
    let dist = Math.hypot(tx, tz);
    // (a little ahead of where they're going)
    const lead = (dist / SPEED) * 0.6;
    tx += foe.bodyVel.x * lead;
    tz += foe.bodyVel.z * lead;
    const tl = Math.hypot(tx, tz) || 1;
    let dy = 0;
    if (dist > 0.6 && (tx * dx + tz * dz) / tl > 0.74) {
      dx = dx * 0.2 + (tx / tl) * 0.8;
      dz = dz * 0.2 + (tz / tl) * 0.8;
      dy = foe.bodyPos.y + 0.15 - y0;
    } else dist = 6;
    // (the computer's aim is as good as it is)
    if (who === 1 && this.cpu) {
      const off = (Math.random() - 0.5) * 2 * (1 - this.skill) * 0.5;
      const c = Math.cos(off);
      const s = Math.sin(off);
      [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // up enough to get there at chest height
    const t = Math.max(0.2, dist / SPEED);
    const vy = Math.min(5, (dy + 0.5 * 11.5 * t * t) / t);
    const b = ball.prop.body;
    b.setTranslation({ x: p.bodyPos.x + dx * 0.8, y: y0, z: p.bodyPos.z + dz * 0.8 }, true);
    b.setLinvel({ x: dx * SPEED + p.bodyVel.x * 0.25, y: vy, z: dz * SPEED + p.bodyVel.z * 0.25 }, true);
    b.setAngvel({ x: dz * 9, y: 0, z: -dx * 9 }, true);
    ball.hot = who;
    ball.hotUntil = this.sim.time() + HOT;
    ball.luck = Math.random();
    this.sim.events.emit('hazard', { pos: p.bodyPos.clone(), kind: 'whoosh' });
  }

  protected step(_dt: number, now: number) {
    const ps = this.players;
    for (const ball of this.balls) {
      const b = ball.prop.body;
      const at = b.translation();
      // out of the court: back to its spot on the line after a moment
      const outside = at.y < -1.5 || Math.abs(at.x) > DODGE_HX + 0.7 || Math.abs(at.z) > DODGE_HZ + 0.7;
      if (!outside) ball.out = 0;
      else if (!ball.out) ball.out = now;
      else if (now - ball.out > 1.2) {
        spawnProp(ball.prop, ball.home);
        ball.hot = -1;
        ball.out = 0;
        continue;
      }
      if (ball.hot < 0) continue;
      const v = b.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (now > ball.hotUntil || speed < 3.5) {
        ball.hot = -1;
        continue;
      }
      const who = ball.hot;
      const victim = ps[1 - who];
      const dx = at.x - victim.bodyPos.x;
      const dz = at.z - victim.bodyPos.z;
      const dy = at.y - victim.bodyPos.y;
      if (Math.hypot(dx, dz) > 0.66 || dy < -1.0 || dy > 0.95) continue;
      // a catch: hands empty, facing it, and grab pressed just as it arrives (the computer: when it's lucky)
      const fl = Math.hypot(dx, dz) || 1;
      const facing = (Math.sin(victim.facingYaw) * dx + Math.cos(victim.facingYaw) * dz) / fl > 0.2;
      const empty = victim.state === 'active' && this.inHand(victim) < 0;
      const timed = victim.index === 1 && this.cpu ? ball.luck < [0, 0.06, 0.2, 0.36][this.cpu] : victim.intent.grab && now - this.grabAt[victim.index] < CATCH;
      if (empty && facing && timed) {
        ball.hot = -1;
        victim.releaseAll();
        const fx = Math.sin(victim.facingYaw);
        const fz = Math.cos(victim.facingYaw);
        b.setTranslation({ x: victim.bodyPos.x + fx * 0.5, y: victim.bodyPos.y + 0.15, z: victim.bodyPos.z + fz * 0.5 }, true);
        b.setLinvel({ x: victim.bodyVel.x, y: 0, z: victim.bodyVel.z }, true);
        this.say('CAUGHT!', true, victim.index);
        this.sim.fx?.burst('star', _v.set(at.x, at.y, at.z), { count: 8, speed: 2, up: 2, size: 0.09, life: 0.7, gravity: 5, colors: [0xffffff, 0xffe14a] });
        continue;
      }
      // a hit
      ball.hot = -1;
      const sp = Math.hypot(v.x, v.z) || 1;
      victim.applyBlast(_v.set((v.x / sp) * 5.5, 3.2, (v.z / sp) * 5.5).multiplyScalar(victim.totalMass));
      victim.knock(11);
      b.setLinvel({ x: -v.x * 0.3, y: 4, z: -v.z * 0.3 }, true);
      this.sim.shake?.(0.45);
      this.sim.fx?.burst('star', _v.set(at.x, at.y, at.z), { count: 18, speed: 5, up: 3, size: 0.13, life: 0.9, gravity: 6, colors: [0xffffff, 0xffe14a, ps[who].color] });
      this.sim.events.emit('impact', { pos: _w.set(at.x, at.y, at.z).clone(), speed: 9, material: 'rubber' });
      this.how = ['SMACK!', 'BONK!', 'GOT YOU!', 'BULLSEYE!'][Math.floor(Math.random() * 4)];
      return who;
    }
    return ON;
  }

  protected netExtra() {
    this.balls.forEach((b, i) => (this.hots[i] = b.hot + 1));
    return pack2(this.hots);
  }
  protected applyExtra(v: number[]) {
    unpack2(v, this.hots);
    this.balls.forEach((b, i) => (b.hot = this.hots[i] - 1));
  }

  protected looks(_dt: number, time: number) {
    showLive(this.balls.map((b) => b.prop));
    for (const b of this.balls) {
      const who = b.hot >= 0 ? this.players[b.hot] : null;
      b.mat.emissive.setHex(who ? who.color : 0x000000);
      b.mat.emissiveIntensity = who ? 0.7 + Math.sin(time * 30) * 0.3 : 0;
    }
  }

  // ---------------------------------------------------------------- the computer

  private aim = 0;
  private side = 1;
  private sideAt = -9;
  protected cpuMove(me: Player, foe: Player, dt: number) {
    const now = this.sim.time();
    const m = me.bodyPos;
    const f = foe.bodyPos;
    const mine = this.inHand(me);
    // one of theirs on its way: step out of its line (if it sees it in time)
    const threat = this.balls.find((b) => {
      if (b.hot !== 0) return false;
      const at = b.prop.body.translation();
      const v = b.prop.body.linvel();
      const d = Math.hypot(at.x - m.x, at.z - m.z);
      return d < 3 + 5 * this.skill && (m.x - at.x) * v.x + (m.z - at.z) * v.z > 0;
    });
    if (threat && threat.luck < 0.35 + 0.6 * this.skill) {
      const v = threat.prop.body.linvel();
      const at = threat.prop.body.translation();
      const l = Math.hypot(v.x, v.z) || 1;
      // which side of its line we're on already
      const sx = -v.z / l;
      const sz = v.x / l;
      const s = (m.x - at.x) * sx + (m.z - at.z) * sz >= 0 ? 1 : -1;
      me.intent.grab = mine >= 0;
      return this.steer(me, m.x + sx * s * 2.5, m.z + sz * s * 2.5);
    }
    if (mine >= 0) {
      // armed: walk at them (that turns us to face them) and let fly when it's lined up
      const d = Math.hypot(f.x - m.x, f.z - m.z);
      const on = (Math.sin(me.facingYaw) * (f.x - m.x) + Math.cos(me.facingYaw) * (f.z - m.z)) / (d || 1);
      this.aim = on > 0.9 ? this.aim + dt : 0;
      const range = 5 + 3.5 * this.skill;
      me.intent.grab = !(this.heldFor[1] > 0.35 && d < range && this.aim > 0.25 - 0.15 * this.skill);
      return this.steer(me, f.x, f.z, d < 3.2 ? 0.25 : 1);
    }
    this.aim = 0;
    // unarmed: the nearest ball nobody's using (theirs in hand: keep moving while we go)
    let best: Ball | null = null;
    let bd = Infinity;
    for (const b of this.balls) {
      if (b.hot >= 0 || !b.prop.live) continue;
      if (foe.hands.some((h) => h.grip?.body?.handle === b.prop.body.handle)) continue;
      const at = b.prop.body.translation();
      if (at.y > 1.6) continue;
      const d = Math.hypot(at.x - m.x, at.z - m.z) + Math.max(0, 3 - Math.hypot(at.x - f.x, at.z - f.z));
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (!best) {
      // nothing to pick up: keep out of their line, side to side
      if (now - this.sideAt > 1.2) {
        this.sideAt = now;
        this.side = m.z > 0 ? -1 : 1;
      }
      me.intent.grab = false;
      return this.steer(me, Math.max(1.5, m.x), this.side * (DODGE_HZ - 1.2));
    }
    const at = best.prop.body.translation();
    const d = Math.hypot(at.x - m.x, at.z - m.z);
    this.steer(me, at.x, at.z, d < 1.1 ? 0.45 : 1);
    me.intent.grab = d < 1.2;
  }
}
