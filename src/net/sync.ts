import * as THREE from 'three';
import type { LevelSession, MirrorDriver, SessionState } from '../game/LevelSession';
import { RAPIER } from '../physics/rapier';
import { tuning } from '../config/tuning';
import type { GameEvents } from '../game/events';
import type { BurstOptions, ParticleKind } from '../render/Effects';
import type { PlayerState } from '../entities/Player';

/**
 * "Light" online play: instead of a video of the host's screen, the host sends
 * where everything is (about 20 times a second, a kilobyte or two) and the
 * guest's laptop draws the same level itself. It works over any connection,
 * including a relay when the network won't let the laptops talk directly.
 *
 * Both laptops build the level from the same description, so every moving body
 * with a visual is made in the same order: a snapshot is just their poses by
 * index, plus the few numbers bodies don't show (cargo wobble and water, who's
 * holding what, the score). Game events and particle bursts go along too, so
 * banners, cracks and confetti happen on both screens.
 */

const SNAP_VERSION = 2;
const STATES: SessionState[] = ['playing', 'delivered', 'failed'];
const ACTOR_STATES: PlayerState[] = ['active', 'knocked', 'gettingUp'];
/** Moved less than this (m, or quaternion dot) since the last snapshot: not sent (except in keyframes). */
const MOVE_EPS = 0.0015;
const TURN_EPS = 0.99999;
/** A full snapshot this often (s), so anything a lost packet missed gets put right. */
const KEYFRAME_EVERY = 1;
/** Further than this between two snapshots: it was teleported, don't slide it across. */
const TELEPORT = 3;

/** Events worth showing on the other laptop. */
type EvName = keyof GameEvents;

export interface NetEvent {
  /** Host physics time when it happened. */
  t: number;
  /** A game event… */
  e?: EvName;
  p?: unknown;
  /** …or a particle burst. */
  fx?: ParticleKind;
  at?: [number, number, number];
  o?: BurstOptions;
}

// ---------------------------------------------------------------- JSON with vectors

/** Plain JSON for event payloads: vectors become {$v:[x,y,z]}. */
export function pack(v: unknown): unknown {
  if (v instanceof THREE.Vector3) return { $v: [r4(v.x), r4(v.y), r4(v.z)] };
  if (Array.isArray(v)) return v.map(pack);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = pack(x);
    return o;
  }
  return typeof v === 'number' ? r4(v) : v;
}

export function unpack(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(unpack);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.$v)) return new THREE.Vector3(...(o.$v as [number, number, number]));
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = unpack(x);
    return out;
  }
  return v;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

// ---------------------------------------------------------------- bytes

class Writer {
  private buf = new ArrayBuffer(4096);
  private dv = new DataView(this.buf);
  n = 0;
  private room(k: number) {
    if (this.n + k <= this.buf.byteLength) return;
    const b = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.n + k));
    new Uint8Array(b).set(new Uint8Array(this.buf, 0, this.n));
    this.buf = b;
    this.dv = new DataView(b);
  }
  u8(v: number) {
    this.room(1);
    this.dv.setUint8(this.n, v);
    this.n += 1;
  }
  i8(v: number) {
    this.room(1);
    this.dv.setInt8(this.n, v);
    this.n += 1;
  }
  u16(v: number) {
    this.room(2);
    this.dv.setUint16(this.n, v, true);
    this.n += 2;
  }
  i16(v: number) {
    this.room(2);
    this.dv.setInt16(this.n, v, true);
    this.n += 2;
  }
  u32(v: number) {
    this.room(4);
    this.dv.setUint32(this.n, v, true);
    this.n += 4;
  }
  f32(v: number) {
    this.room(4);
    this.dv.setFloat32(this.n, v, true);
    this.n += 4;
  }
  f64(v: number) {
    this.room(8);
    this.dv.setFloat64(this.n, v, true);
    this.n += 8;
  }
  str(s: string) {
    const b = new TextEncoder().encode(s.slice(0, 120));
    this.u8(b.length);
    this.room(b.length);
    new Uint8Array(this.buf, this.n, b.length).set(b);
    this.n += b.length;
  }
  done() {
    return this.buf.slice(0, this.n);
  }
}

class Reader {
  private dv: DataView;
  n = 0;
  constructor(private buf: ArrayBuffer) {
    this.dv = new DataView(buf);
  }
  u8() {
    return this.dv.getUint8(this.n++);
  }
  i8() {
    return this.dv.getInt8(this.n++);
  }
  u16() {
    const v = this.dv.getUint16(this.n, true);
    this.n += 2;
    return v;
  }
  i16() {
    const v = this.dv.getInt16(this.n, true);
    this.n += 2;
    return v;
  }
  u32() {
    const v = this.dv.getUint32(this.n, true);
    this.n += 4;
    return v;
  }
  f32() {
    const v = this.dv.getFloat32(this.n, true);
    this.n += 4;
    return v;
  }
  f64() {
    const v = this.dv.getFloat64(this.n, true);
    this.n += 8;
    return v;
  }
  str() {
    const k = this.u8();
    const s = new TextDecoder().decode(new Uint8Array(this.buf, this.n, k));
    this.n += k;
    return s;
  }
}

// ---------------------------------------------------------------- what a snapshot holds

interface ActorLook {
  state: PlayerState;
  grab: boolean;
  grip: [boolean, boolean];
  reach: [boolean, boolean];
  air: number;
  stretch: number;
  held: number;
  /** Walking right now: top speed (m/s) and push (m/s²). */
  cap: number;
  accel: number;
}

interface Extras {
  time: number;
  state: SessionState;
  checkpoint: number;
  falls: number;
  goal: number;
  goalHeld: boolean;
  health: number;
  destroyed: boolean;
  status: string;
  cargo: number[];
  actors: ActorLook[];
  hazards: Map<number, number[]>;
}

/** A whole-level picture at one moment (the guest keeps a few to blend between). */
interface Frame {
  t: number;
  seq: number;
  pos: Float32Array;
  quat: Float32Array;
  x: Extras;
}

// ---------------------------------------------------------------- host side

export class HostSync {
  private lastPos: Float32Array;
  private lastQuat: Float32Array;
  private sinceKey = KEYFRAME_EVERY;
  private seq = 0;
  private pending: NetEvent[] = [];

  constructor(private s: LevelSession) {
    const n = s.physics.linkCount;
    this.lastPos = new Float32Array(n * 3).fill(NaN);
    this.lastQuat = new Float32Array(n * 4).fill(NaN);
    s.events.tap = (type, payload) => {
      if (s.inVisuals) return;
      this.pending.push({ t: s.physics.time, e: type, p: pack(payload) });
    };
    s.effects.tap = (kind, at, o) => {
      if (s.inVisuals) return;
      this.pending.push({ t: s.physics.time, fx: kind, at: [r4(at.x), r4(at.y), r4(at.z)], o: pack(o) as BurstOptions });
    };
  }

  /** Events since the last call (send them reliably). */
  takeEvents() {
    const e = this.pending;
    this.pending = [];
    return e;
  }

  /** Ask for a full snapshot next time (a guest just arrived, or packets went missing). */
  keyframeSoon() {
    this.sinceKey = KEYFRAME_EVERY;
  }

  /** The next snapshot, `dt` seconds after the last one. */
  snapshot(dt: number): ArrayBuffer {
    const s = this.s;
    const ph = s.physics;
    const w = new Writer();
    this.sinceKey += dt;
    const key = this.sinceKey >= KEYFRAME_EVERY;
    if (key) this.sinceKey = 0;
    w.u8(SNAP_VERSION);
    w.u8(key ? 1 : 0);
    w.u32(++this.seq);
    w.f64(ph.time);
    // the score and the clock
    w.f32(s.time);
    w.u8(Math.max(0, STATES.indexOf(s.state)));
    w.i8(s.checkpoint);
    w.u16(Math.min(65535, s.falls));
    w.f32(s.goalProgress);
    w.u8(s.goalHeld ? 1 : 0);
    // the cargo
    w.f32(s.cargo.health);
    w.u8(s.cargo.destroyed ? 1 : 0);
    w.str(s.cargo.status ?? '');
    const cs = s.cargo.netState();
    w.u8(cs.length);
    for (const v of cs) w.f32(v);
    // everyone with arms and legs
    const actors = s.sim.actors ?? [];
    w.u8(actors.length);
    for (const a of actors) {
      w.u8(Math.max(0, ACTOR_STATES.indexOf(a.state)));
      const g0 = a.handLook(0);
      const g1 = a.handLook(1);
      w.u8((a.intent.grab ? 1 : 0) | (g0 === 'grip' ? 2 : 0) | (g1 === 'grip' ? 4 : 0) | (g0 === 'reach' ? 8 : 0) | (g1 === 'reach' ? 16 : 0));
      w.f32(a.airTime);
      w.f32(a.maxGripStretch());
      w.f32(a.heldMass());
      w.u8(Math.min(255, Math.round(a.moveCap * 20)));
      w.u8(Math.min(255, Math.round(a.moveAccel * 4)));
    }
    // hazards with looks of their own
    const hz: [number, number[]][] = [];
    s.hazards.forEach((h, i) => {
      const v = h.netState?.();
      if (v?.length) hz.push([i, v]);
    });
    w.u8(hz.length);
    for (const [i, v] of hz) {
      w.u16(i);
      w.u8(v.length);
      for (const x of v) w.f32(x);
    }
    // the bodies: all of them in a keyframe, otherwise the ones that moved
    const n = ph.linkCount;
    w.u16(n);
    const moved: number[] = [];
    for (let i = 0; i < n; i++) {
      const { pos, quat } = ph.linkPose(i);
      const lp = this.lastPos;
      const lq = this.lastQuat;
      const dot = Math.abs(quat.x * lq[i * 4] + quat.y * lq[i * 4 + 1] + quat.z * lq[i * 4 + 2] + quat.w * lq[i * 4 + 3]);
      const far = Math.abs(pos.x - lp[i * 3]) > MOVE_EPS || Math.abs(pos.y - lp[i * 3 + 1]) > MOVE_EPS || Math.abs(pos.z - lp[i * 3 + 2]) > MOVE_EPS;
      if (key || far || !(dot > TURN_EPS)) moved.push(i);
    }
    w.u16(moved.length);
    for (const i of moved) {
      const { pos, quat } = ph.linkPose(i);
      w.u16(i);
      w.f32(pos.x);
      w.f32(pos.y);
      w.f32(pos.z);
      const sgn = quat.w < 0 ? -1 : 1;
      w.i16(Math.round(quat.x * sgn * 32767));
      w.i16(Math.round(quat.y * sgn * 32767));
      w.i16(Math.round(quat.z * sgn * 32767));
      w.i16(Math.round(quat.w * sgn * 32767));
      this.lastPos.set([pos.x, pos.y, pos.z], i * 3);
      this.lastQuat.set([quat.x, quat.y, quat.z, quat.w], i * 4);
    }
    return w.done();
  }

  dispose() {
    if (this.s.events.tap) this.s.events.tap = null;
    if (this.s.effects.tap) this.s.effects.tap = null;
  }
}

// ---------------------------------------------------------------- guest side

const _p = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const IDQ = { x: 0, y: 0, z: 0, w: 1 };
let BALL: InstanceType<typeof RAPIER.Ball> | null = null;

export class GuestSync implements MirrorDriver {
  private frames: Frame[] = [];
  private renderT = -1;
  private events: NetEvent[] = [];
  /** Smoothed gap between snapshots, and how unevenly they arrive (s of host time). */
  private gap = 0.05;
  private jitter = 0.02;
  /** Host seconds per second here (below 1 when the host's laptop can't keep up). */
  private rate = 1;
  private lastArrival = 0;
  private lastHostT = 0;
  /** Snapshots received / applied (tests and the connection readout). */
  received = 0;
  /** The level on this laptop doesn't match the host's (shouldn't happen). */
  mismatch = false;
  private status = '';

  constructor(private s: LevelSession) {
    // until the first snapshot: the level as it was built (the same as the host's start)
    const n = s.physics.linkCount;
    const pos = new Float32Array(n * 3);
    const quat = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const { pos: p, quat: q } = s.physics.linkPose(i);
      pos.set([p.x, p.y, p.z], i * 3);
      quat.set([q.x, q.y, q.z, q.w], i * 4);
    }
    this.base = { t: -1, seq: 0, pos, quat, x: null as unknown as Extras };
    s.events.on('goal', () => {
      for (const r of s.rigs) r.happyTime = 4;
    });
  }
  private base: Frame;

  /** How far behind the host we show things (s): enough to always have a snapshot either side. */
  get delay() {
    return Math.min(0.5, Math.max(0.045, this.gap * 1.6 + this.jitter * 2.5));
  }

  // ---- our own mover, drawn where our keys say it will be
  //
  // Everything on this screen is the host's picture, a moment old; by the time the
  // host has heard a key press, moved our mover and sent the picture back, a round
  // trip and more has gone by, and that wait is what online lag feels like. So a
  // pretend mover is driven here by our keys, by the same rules as the real one
  // (the host says how fast ours may go and how hard it may push), and ours is
  // drawn ahead of the host's picture by as far as the pretend one has gone in
  // the time the picture is behind. Standing still, the two are the same place.
  // Only the drawing moves: the host still decides where everyone really is.

  /** Our mover (the guest is P2). */
  private readonly me = 1;
  private own: number[] | null = null;
  private ownBody = -1;
  /** What our keys ask for now: a world direction, length up to 1. */
  private ask = { x: 0, z: 0 };
  /** The pretend mover's velocity, and what it has been frame by frame (on `clock`, s). */
  private vel = { x: 0, z: 0 };
  private trail: { t: number; dt: number; x: number; z: number }[] = [];
  private clock = 0;
  /** How far behind our keys the picture is (s), smoothed. */
  private behind = 0.15;
  private lead = new THREE.Vector3();
  private ownVel = new THREE.Vector3();
  /** How well the host's mover is answering the keys, 0..1 (against a wall: not at all). */
  private mobility = 1;
  /** Round trip to the host (s); the connection keeps it up to date. */
  rtt = 0.1;
  /** Off: our mover is shown only where the host's picture has it (tests, and for comparing). */
  predictOwn = true;

  /** How far ahead of the host's picture our mover is drawn (m). */
  get leadDistance() {
    return this.lead.length();
  }

  /** The direction our keys ask for now (world x, z). */
  noteInput(x: number, z: number) {
    const l = Math.hypot(x, z);
    this.ask.x = l > 1 ? x / l : x;
    this.ask.z = l > 1 ? z / l : z;
  }

  private predict(s: LevelSession, dt: number, renderT: number, latest: number) {
    const ph = s.physics;
    const p = s.players[this.me];
    if (!p) return;
    if (!this.own) {
      // which of the level's moving parts are our mover's
      const mine = new Set(Object.values(p.parts).map((b) => b.handle));
      this.own = [];
      for (let i = 0; i < ph.linkCount; i++) {
        const b = ph.linkPose(i).body;
        if (mine.has(b.handle)) {
          this.own.push(i);
          if (b.handle === p.parts.body.handle) this.ownBody = i;
        }
      }
      // (the walls have to be findable; this copy of the world is never stepped otherwise)
      try {
        ph.world.step();
      } catch {
        /* never mind: the lead just isn't stopped by walls */
      }
    }
    const m = p.mirror;
    const cap = m?.cap || tuning.move.maxSpeed;
    const accel = m?.accel || tuning.move.accel;
    const party = s.party;
    const live = this.predictOwn && dt > 0 && s.state === 'playing' && p.state === 'active' && this.rate > 0.4 && !(party && party.phase === 'ready');
    // the pretend mover: pushed toward what the keys ask for, as hard as the real one may be
    const v = this.vel;
    const ax = live ? this.ask.x : 0;
    const az = live ? this.ask.z : 0;
    if (!live) v.x = v.z = 0;
    else if (Math.hypot(ax, az) > 0.1 || p.airTime < 0.05) {
      // (in the air with the keys let go, a mover keeps going as it was)
      let nx = ax * cap - v.x;
      let nz = az * cap - v.z;
      const nl = Math.hypot(nx, nz);
      const most = accel * dt;
      if (nl > most) {
        nx *= most / nl;
        nz *= most / nl;
      }
      v.x += nx;
      v.z += nz;
    }
    this.clock += dt;
    const now = this.clock;
    const trail = this.trail;
    if (dt > 0) trail.push({ t: now, dt, x: v.x, z: v.z });
    while (trail.length > 2 && trail[0].t < now - 1) trail.shift();
    // how old the picture is: the round trip, how far behind the newest snapshot we draw, and how long ago that came
    // (and about half a frame that a snapshot waits to be read)
    const real = performance.now() / 1000;
    const w = Math.min(0.6, Math.max(0, this.rtt + (latest - renderT) + Math.min(0.3, real - this.lastArrival) + Math.min(0.1, dt) * 0.5));
    this.behind += (w - this.behind) * Math.min(1, dt * 3);
    const from = now - this.behind;
    // how far the pretend mover has gone in that time
    let tx = 0;
    let tz = 0;
    let then: { x: number; z: number } | null = null;
    for (let i = trail.length - 1; i >= 0; i--) {
      const f = trail[i];
      if (f.t <= from) {
        then = f;
        break;
      }
      const part = Math.min(1, (f.t - from) / f.dt);
      tx += f.x * f.dt * part;
      tz += f.z * f.dt * part;
    }
    // the picture shows how the real one answered those keys: if it isn't getting anywhere, neither do we.
    // (Judged only while walking steadily one way for a good while around the moment the picture shows:
    //  setting off, stopping and turning are no time to compare, and that moment is only roughly known.)
    let steady = live && !!then && trail[0].t < from - 0.4;
    if (steady && then) {
      const e2 = then.x * then.x + then.z * then.z;
      if (e2 < cap * cap * 0.16) steady = false;
      for (let i = trail.length - 1; i >= 0 && steady; i--) {
        const f = trail[i];
        if (f.t > from + 0.1) continue;
        if (f.t < from - 0.4) break;
        if (f.x * then.x + f.z * then.z < e2 * 0.7) steady = false;
      }
      if (steady) {
        const r = Math.min(1, Math.max(0, (this.ownVel.x * then.x + this.ownVel.z * then.z) / e2));
        this.mobility += (r - this.mobility) * Math.min(1, dt * (r < this.mobility ? 5 : 8));
      }
    }
    if (!steady) this.mobility += (1 - this.mobility) * Math.min(1, dt * 2);
    if (!live) tx = tz = 0;
    else {
      // (hands on something: stay nearer to them, the load has to come too)
      const k = this.mobility * (m && (m.grip[0] || m.grip[1]) ? 0.6 : 1);
      tx *= k;
      tz *= k;
      // not through a wall
      const len = Math.hypot(tx, tz);
      if (len > 0.08 && this.ownBody >= 0) {
        const at = ph.linkPose(this.ownBody).pos;
        try {
          const hit = ph.world.castShape({ x: at.x, y: at.y - 0.2, z: at.z }, IDQ, { x: tx / len, y: 0, z: tz / len }, (BALL ??= new RAPIER.Ball(0.3)), 0, len, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
          if (hit) {
            const ok = Math.max(0, hit.time_of_impact - 0.03) / len;
            tx *= ok;
            tz *= ok;
          }
        } catch {
          /* no walls to be found: go without */
        }
      }
    }
    // (a touch of easing rounds off the corners; knocked over or stopped by the game, it slides back gently)
    const ease = Math.min(1, dt * (live ? 30 : 6));
    this.lead.x += (tx - this.lead.x) * ease;
    this.lead.z += (tz - this.lead.z) * ease;
    if (this.lead.lengthSq() < 1e-6) return;
    for (const i of this.own) ph.shiftLink(i, this.lead);
  }

  /** A snapshot from the host. */
  push(buf: ArrayBuffer) {
    const r = new Reader(buf);
    if (r.u8() !== SNAP_VERSION) return;
    r.u8(); // keyframe flag (every snapshot is applied the same way)
    const seq = r.u32();
    const t = r.f64();
    const prev = this.frames[this.frames.length - 1] ?? this.base;
    if (seq <= prev.seq && prev !== this.base) return; // late: a newer one already arrived
    const x: Extras = {
      time: r.f32(),
      state: STATES[r.u8()] ?? 'playing',
      checkpoint: r.i8(),
      falls: r.u16(),
      goal: r.f32(),
      goalHeld: r.u8() === 1,
      health: r.f32(),
      destroyed: r.u8() === 1,
      status: r.str(),
      cargo: [],
      actors: [],
      hazards: new Map(),
    };
    for (let i = 0, k = r.u8(); i < k; i++) x.cargo.push(r.f32());
    for (let i = 0, k = r.u8(); i < k; i++) {
      const state = ACTOR_STATES[r.u8()] ?? 'active';
      const b = r.u8();
      x.actors.push({ state, grab: !!(b & 1), grip: [!!(b & 2), !!(b & 4)], reach: [!!(b & 8), !!(b & 16)], air: r.f32(), stretch: r.f32(), held: r.f32(), cap: r.u8() / 20, accel: r.u8() / 4 });
    }
    for (let i = 0, k = r.u8(); i < k; i++) {
      const idx = r.u16();
      const v: number[] = [];
      for (let j = 0, m = r.u8(); j < m; j++) v.push(r.f32());
      x.hazards.set(idx, v);
    }
    const n = r.u16();
    if (n !== this.s.physics.linkCount && !this.mismatch) {
      this.mismatch = true;
      console.warn(`online: the host's level has ${n} moving parts, ours has ${this.s.physics.linkCount}`);
    }
    const pos = prev.pos.slice();
    const quat = prev.quat.slice();
    const max = pos.length / 3;
    for (let i = 0, k = r.u16(); i < k; i++) {
      const idx = r.u16();
      const px = r.f32();
      const py = r.f32();
      const pz = r.f32();
      const qx = r.i16() / 32767;
      const qy = r.i16() / 32767;
      const qz = r.i16() / 32767;
      const qw = r.i16() / 32767;
      if (idx >= max) continue;
      pos[idx * 3] = px;
      pos[idx * 3 + 1] = py;
      pos[idx * 3 + 2] = pz;
      const l = Math.hypot(qx, qy, qz, qw) || 1;
      quat[idx * 4] = qx / l;
      quat[idx * 4 + 1] = qy / l;
      quat[idx * 4 + 2] = qz / l;
      quat[idx * 4 + 3] = qw / l;
    }
    // how regularly do they come?
    const now = performance.now() / 1000;
    if (this.lastArrival) {
      const dHost = Math.max(0, t - this.lastHostT);
      const dLocal = now - this.lastArrival;
      if (dHost > 0 && dLocal > 0) {
        this.gap += (dHost - this.gap) * 0.1;
        this.rate += (Math.min(2, Math.max(0.05, dHost / dLocal)) - this.rate) * 0.05;
        this.jitter += (Math.abs(dLocal * this.rate - dHost) - this.jitter) * 0.1;
      }
    }
    this.lastArrival = now;
    this.lastHostT = t;
    this.frames.push({ t, seq, pos, quat, x });
    // a restart or a jump in the host's clock: start over from here
    if (prev !== this.base && t < prev.t) this.frames = [this.frames[this.frames.length - 1]];
    if (this.frames.length > 40) this.frames.splice(0, this.frames.length - 40);
    this.received++;
  }

  /** Game events and particle bursts from the host (shown when our clock gets to them). */
  pushEvents(list: NetEvent[]) {
    for (const e of list) this.events.push(e);
  }

  frame(s: LevelSession, dt: number) {
    const fr = this.frames;
    if (!fr.length) return;
    const latest = fr[fr.length - 1].t;
    const target = latest - this.delay;
    if (this.renderT < 0 || Math.abs(target - this.renderT) > 0.75) this.renderT = target;
    else this.renderT += dt * this.rate + (target - this.renderT) * Math.min(1, dt * 1.5);
    this.renderT = Math.min(this.renderT, latest);
    const t = this.renderT;
    // the two snapshots either side of now
    let a = fr[0];
    let b = fr[0];
    for (let i = fr.length - 1; i >= 0; i--) {
      if (fr[i].t <= t) {
        a = fr[i];
        b = fr[i + 1] ?? fr[i];
        break;
      }
    }
    // forget the ones we're past
    const keep = fr.indexOf(a);
    if (keep > 2) fr.splice(0, keep - 2);
    const span = b.t - a.t;
    const k = span > 1e-6 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1;
    const ph = s.physics;
    const n = Math.min(ph.linkCount, a.pos.length / 3);
    for (let i = 0; i < n; i++) {
      _p.fromArray(a.pos, i * 3);
      _p1.fromArray(b.pos, i * 3);
      _q.fromArray(a.quat, i * 4);
      _q1.fromArray(b.quat, i * 4);
      const jump = _p.distanceTo(_p1) > TELEPORT;
      if (span > 1e-6 && !jump) _v.subVectors(_p1, _p).divideScalar(span);
      else _v.set(0, 0, 0);
      if (jump) {
        _p.copy(_p1);
        _q.copy(_q1);
      } else {
        _p.lerp(_p1, k);
        _q.slerp(_q1, k);
      }
      ph.setLinkPose(i, _p, _q, _v);
      if (i === this.ownBody && span > 1e-6 && !jump) this.ownVel.lerp(_v, Math.min(1, dt * 12));
    }
    this.predict(s, dt, t, latest);
    ph.time = t;
    ph.alpha = 1;
    this.applyExtras(s, b.x, dt);
    // events whose time has come
    if (this.events.length) {
      const due = this.events.filter((e) => e.t <= t + 1e-4);
      if (due.length) {
        this.events = this.events.filter((e) => e.t > t + 1e-4);
        for (const e of due) this.play(s, e);
      }
      // a clock reset (restart) can strand events from before it: don't hold them forever
      if (this.events.length > 400) this.events.splice(0, this.events.length - 400);
    }
    for (const h of s.hazards) h.mirrorFrame?.(t);
  }

  private applyExtras(s: LevelSession, x: Extras, dt: number) {
    s.time = x.time;
    if (s.state !== x.state) {
      s.state = x.state;
      s.stateTime = 0;
    } else s.stateTime += dt;
    s.checkpoint = x.checkpoint;
    s.falls = x.falls;
    s.goalProgress = x.goal;
    s.goalHeld = x.goalHeld;
    const c = s.cargo;
    c.health = x.destroyed ? 0 : x.health;
    if (x.cargo.length) c.applyNetState(x.cargo);
    if (x.destroyed && !c.destroyed) this.quietly(s, () => c.mirrorBreak());
    this.status = x.status;
    const actors = s.sim.actors ?? [];
    x.actors.forEach((l, i) => {
      const p = actors[i];
      if (!p) return;
      p.state = l.state;
      p.intent.grab = l.grab;
      p.airTime = l.air;
      p.mirror = { stretch: l.stretch, held: l.held, grip: l.grip, reach: l.reach, cap: l.cap, accel: l.accel };
    });
    // movers' handy numbers that the steps would have filled in
    for (const p of actors) {
      const t = p.body.translation();
      p.bodyPos.set(t.x, t.y, t.z);
      const v = p.body.linvel();
      p.bodyVel.set(v.x, v.y, v.z);
    }
    x.hazards.forEach((v, i) => s.hazards[i]?.applyNetState?.(v));
  }

  /** Our copy of a hit or a break makes its own cracks, but the bursts come from the host. */
  private quietly(s: LevelSession, fn: () => void) {
    const fx = s.effects;
    fx.muted = true;
    try {
      fn();
    } finally {
      fx.muted = false;
    }
  }

  private play(s: LevelSession, e: NetEvent) {
    if (e.fx && e.at) {
      s.effects.burst(e.fx, new THREE.Vector3(...e.at), e.o ?? { count: 1 });
      return;
    }
    if (!e.e) return;
    const p = unpack(e.p) as Record<string, unknown>;
    if (e.e === 'cargoDamage') {
      const pos = p.pos instanceof THREE.Vector3 ? p.pos : s.cargo.position(new THREE.Vector3());
      this.quietly(s, () => s.cargo.mirrorDamage(Number(p.amount) || 0, pos, Number(p.shock) || 0));
    } else if (e.e === 'cargoBreak') {
      this.quietly(s, () => s.cargo.mirrorBreak());
    } else if (e.e === 'land') {
      const pl = s.players[Number(p.player)];
      if (pl) pl.landSquash = Math.min(0.35, Math.max(0, Number(p.speed) / 9));
    }
    s.events.emit(e.e, p as never);
  }

  afterVisuals(s: LevelSession) {
    // per-frame looks guess the status from things only the host knows (who's holding what)
    s.cargo.status = this.status || null;
  }
}
