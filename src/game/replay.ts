import * as THREE from 'three';
import type { LevelSession } from './LevelSession';
import type { GameEvents } from './events';
import { GuestSync, HostSync, pack, type NetEvent } from '../net/sync';

/**
 * The instant replay: the run's biggest moment (the worst knock the cargo took,
 * or the smash that ended it), kept as a few seconds of the same snapshots and
 * events that an online friend's screen is drawn from, and played back on a
 * freshly built copy of the job, slowly through the moment itself.
 *
 * Recording only looks: nothing in the game changes for it.
 */

/** Seconds kept before the moment, and after. */
const BEFORE = 2.6;
const AFTER = 2.0;
/** Snapshots a second. */
const RATE = 20;

/** Events worth showing again (not the ones that pay, score or save anything). */
const SHOWN: (keyof GameEvents)[] = ['jump', 'land', 'step', 'grab', 'release', 'slip', 'knock', 'getup', 'impact', 'cargoDamage', 'cargoBreak', 'cargoWobble', 'splash', 'hazard', 'bark', 'honk', 'emote'];

export interface Clip {
  /** When it happened (the job's clock, s), how big it was, and what to call it. */
  at: number;
  score: number;
  label: string;
  where: THREE.Vector3;
  frames: { t: number; buf: ArrayBuffer }[];
  events: NetEvent[];
  /** Still being filled in until the clock gets here. */
  until: number;
}

export class ReplayRecorder {
  private snap: HostSync;
  private ring: { t: number; buf: ArrayBuffer }[] = [];
  private events: NetEvent[] = [];
  private owed = 0;
  /** The best moment so far. */
  clip: Clip | null = null;

  constructor(private s: LevelSession) {
    // (its own snapshot-maker: every one a full picture, so a clip can start anywhere)
    this.snap = new HostSync(s, false);
    s.events.rec = (type, payload) => {
      if (s.inVisuals || !SHOWN.includes(type)) return;
      this.note({ t: s.physics.time, e: type, p: pack(payload) });
    };
    s.effects.rec = (kind, at, o) => {
      if (s.inVisuals) return;
      this.note({ t: s.physics.time, fx: kind, at: [at.x, at.y, at.z], o: pack(o) as NetEvent['o'] });
    };
    // the moments worth a second look: the bigger the dent, the better; the smash beats them all
    s.events.on('cargoDamage', (e) => {
      if (e.amount >= 0.03) this.moment(e.amount * 100, `−${Math.round(e.amount * 100)}% in one go`, e.pos);
    });
    s.events.on('cargoBreak', () => this.moment(1000, 'the end of it', s.cargo.position(new THREE.Vector3())));
  }

  private note(e: NetEvent) {
    this.events.push(e);
    const c = this.clip;
    if (c && e.t <= c.until) c.events.push(e);
  }

  private moment(score: number, label: string, where: THREE.Vector3) {
    const t = this.s.physics.time;
    const c = this.clip;
    // (a second dent inside a clip that's still running: the clip runs on, and takes the bigger name)
    if (c && t <= c.until && t - c.at < 1.2) {
      c.until = Math.max(c.until, t + AFTER * 0.7);
      if (score > c.score) {
        c.score = score;
        c.label = label;
        c.at = t;
        c.where = where.clone();
      }
      return;
    }
    if (c && score <= c.score) return;
    this.clip = { at: t, score, label, where: where.clone(), frames: this.ring.filter((f) => f.t >= t - BEFORE), events: this.events.filter((e) => e.t >= t - BEFORE), until: t + AFTER };
  }

  /** Each frame while the job's on. */
  update(dt: number) {
    const s = this.s;
    if (s.mirror || dt <= 0) return;
    this.owed += dt;
    if (this.owed < 1 / RATE) return;
    this.snap.keyframeSoon();
    const f = { t: s.physics.time, buf: this.snap.snapshot(this.owed) };
    this.owed = 0;
    this.ring.push(f);
    const old = f.t - BEFORE - 0.5;
    while (this.ring.length && this.ring[0].t < old) this.ring.shift();
    while (this.events.length && this.events[0].t < old) this.events.shift();
    const c = this.clip;
    if (c && f.t <= c.until + 0.2) c.frames.push(f);
  }

  /** The clip to show, if there's one with enough in it. */
  get best(): Clip | null {
    const c = this.clip;
    return c && c.frames.length >= 12 ? c : null;
  }

  dispose() {
    this.s.events.rec = null;
    this.s.effects.rec = null;
  }
}

/** Plays a clip on a session built for it (the same job, nothing simulated: it is shown, like an online friend's copy). */
export class ReplayPlayer {
  private sync: GuestSync;
  private next = 0;
  /** Where the playback has got to (the job's clock), and whether it's over. */
  t: number;
  done = false;
  private hold = 0;

  constructor(
    s: LevelSession,
    readonly clip: Clip,
  ) {
    this.sync = new GuestSync(s);
    this.sync.predictOwn = false;
    s.mirror = this.sync;
    this.t = clip.frames[0].t;
    this.sync.playhead = this.t;
    this.sync.pushEvents(clip.events.filter((e) => e.t >= this.t));
    this.feed();
  }

  private feed() {
    const fr = this.clip.frames;
    while (this.next < fr.length && fr[this.next].t <= this.t + 0.6) this.sync.push(fr[this.next++].buf);
  }

  /** How fast the clock runs right now: slowly through the moment. */
  get speed() {
    const d = this.t - this.clip.at;
    return d > -0.45 && d < 0.75 ? 0.28 : d >= 0.75 && d < 1.1 ? 0.6 : 1;
  }

  /** Each frame, before the session's own update. */
  update(dt: number) {
    if (this.done) return;
    const end = this.clip.frames[this.clip.frames.length - 1].t;
    if (this.t >= end) {
      // a moment on the last picture, then that's it
      this.hold += dt;
      if (this.hold > 0.7) this.done = true;
      return;
    }
    this.t = Math.min(end, this.t + dt * this.speed);
    this.sync.playhead = this.t;
    this.feed();
  }
}
