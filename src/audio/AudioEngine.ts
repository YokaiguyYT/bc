import * as THREE from 'three';
import type { LevelSession } from '../game/LevelSession';
import { Music, type Track } from './music';
import { Synth, type ImpactMaterial } from './synth';

export type UiSound = 'move' | 'select' | 'back' | 'pause' | 'toggle' | 'tick' | 'pop' | 'whoosh' | 'stamp' | 'star' | 'buy' | 'error';
export type Sfx = 'payout' | 'fail' | 'goal' | 'fanfare' | 'count' | 'go';
export type { Track };

type Pos = { x: number; y: number; z: number };

const _r = new THREE.Vector3();
/** How far ahead of the clock the music is lined up (s), and how often (ms). */
const AHEAD = 0.35;
const EVERY = 90;

/**
 * All the sound: effects for the game's events and the menus, and the music.
 * Everything is synthesized (see synth.ts and music.ts). Nothing outside
 * src/audio/ knows how: gameplay raises events on the session's bus, the
 * menus call ui() and sfx(), and this turns them into sound.
 *
 * Browsers only allow sound after a tap or a key press, so nothing is made
 * until unlock() is first called from one (the app calls it on every key and
 * pointer press). With the tab in the background the sound is paused.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private tunes: Music | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private vol = { master: 0.8, music: 0.55, sfx: 0.9 };
  private want: Track = 'none';
  private s: LevelSession | null = null;
  private last = new Map<string, number>();
  private busy = 0;
  private busyFrom = -9;
  /** How many of each sound have been played (tests). */
  readonly played: Record<string, number> = {};

  /** Make (or wake) the sound, from a key press or a tap. */
  unlock() {
    if (this.ctx) {
      // (iPhones also "interrupt" the sound, after a call say: any tap brings it back)
      if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      // everything goes through one limiter, so a pile-up of sounds can't clip
      const limit = ctx.createDynamicsCompressor();
      limit.threshold.value = -12;
      limit.knee.value = 10;
      limit.ratio.value = 12;
      limit.attack.value = 0.003;
      limit.release.value = 0.2;
      limit.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(limit);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.synth = new Synth(ctx, this.sfxBus);
      this.tunes = new Music(ctx, this.musicBus);
      this.applyVolumes();
      this.tunes.play(this.want);
      window.setInterval(() => this.tunes?.schedule(ctx.currentTime + AHEAD), EVERY);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      });
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Is there sound (has a key or a tap unlocked it)? */
  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const t = this.ctx.currentTime;
    // (sliders are 0..1; squared, so the low end of each is properly quiet)
    this.master.gain.setTargetAtTime(this.vol.master ** 2 * 1.2, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx ** 2, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.vol.music ** 2 * 0.9, t, 0.03);
  }

  music(t: Track) {
    this.want = t;
    this.tunes?.play(t);
  }

  /** Can this sound play now? (Not while silent, not more often than `gap` seconds, and only so many at once.) */
  private ok(name: string, gap = 0, minor = false): Synth | null {
    const ctx = this.ctx;
    if (!ctx || !this.synth || ctx.state !== 'running' || this.vol.master <= 0 || this.vol.sfx <= 0) return null;
    const now = ctx.currentTime;
    if (gap && now - (this.last.get(name) ?? -9) < gap) return null;
    // a flood (a box avalanche, a pile-up): a handful at a time, footsteps and the like giving way first
    if (now - this.busyFrom > 0.03) {
      this.busyFrom = now;
      this.busy = 0;
    }
    if (++this.busy > (minor ? 2 : 6)) return null;
    this.last.set(name, now);
    this.played[name] = (this.played[name] ?? 0) + 1;
    return this.synth;
  }

  ui(s: UiSound) {
    this.ok(`ui:${s}`, s === 'tick' ? 0.03 : 0)?.ui(s);
  }

  sfx(s: Sfx) {
    const y = this.ok(s);
    if (!y) return;
    if (s === 'payout') y.payout();
    else if (s === 'fail') y.fail();
    else if (s === 'goal') y.goal();
    else if (s === 'fanfare') y.fanfare(1, true);
    else y.count(s === 'go');
  }

  /** How loud and where between the speakers something at `pos` is, from where the camera's looking. */
  private place(pos?: Pos): [number, number] {
    const s = this.s;
    if (!pos || !s) return [1, 0];
    const f = s.cameraRig.focusPoint;
    const r = s.cameraRig.right(_r);
    const dx = pos.x - f.x;
    const dz = pos.z - f.z;
    const dist = Math.hypot(dx, pos.y - f.y, dz);
    return [1 / (1 + (dist / 13) ** 2), Math.max(-0.8, Math.min(0.8, (dx * r.x + dz * r.z) / 9))];
  }

  /** Listen to a job's events. (Its bus is cleared when the job ends.) */
  attach(s: LevelSession) {
    this.s = s;
    const live = () => this.s === s && !s.attractMode;
    const on = s.events.on.bind(s.events);
    // each mover a little different in pitch, so you can tell whose feet those are
    const who = (i: number) => (i === 1 ? 1.14 : i === 0 ? 1 : 0.9);
    on('step', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok(`step${e.player}`, 0.09, true)?.step(v * Math.min(1, 0.45 + e.speed / 6), p, who(e.player));
    });
    on('jump', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok(`jump${e.player}`, 0.08)?.jump(v, p, who(e.player));
    });
    on('land', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok(`land${e.player}`, 0.08)?.land(v * Math.min(1, 0.35 + e.speed / 9), p, who(e.player));
    });
    on('grab', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok(`grab${e.player}`, 0.05)?.grab(v, p, who(e.player) * (e.kind === 'cargo' ? 1.2 : 1));
    });
    on('release', (e) => live() && this.ok(`release${e.player}`, 0.08)?.release(0.8, 0, who(e.player)));
    on('slip', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok('slip', 0.25)?.slip(v, p);
    });
    on('knock', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok(`knock${e.player}`, 0.3)?.knock(v, p, who(e.player));
    });
    on('getup', (e) => live() && this.ok(`getup${e.player}`, 0.3)?.getup(0.8, 0, who(e.player)));
    on('emote', (e) => live() && this.ok(`emote${e.player}`, 0.2)?.emote(1, 0, who(e.player) * 1.2, e.kind));
    on('impact', (e) => {
      if (!live() || e.speed < 0.6) return;
      const [v, p] = this.place(e.pos);
      this.ok(`impact:${e.material}`, 0.06, true)?.impact(e.material as ImpactMaterial, v * Math.min(1, 0.25 + e.speed / 8), p);
    });
    on('cargoDamage', (e) => {
      if (!live() || e.amount < 0.004) return;
      const [v, p] = this.place(e.pos);
      this.ok('damage', 0.12)?.damage(e.amount, v, p);
    });
    on('cargoBreak', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok('smash')?.smash(Math.max(0.6, v), p);
    });
    on('cargoWobble', (e) => live() && this.ok('wobble', 0.5)?.wobble(Math.min(1, 0.4 + e.amount)));
    on('checkpoint', () => live() && this.ok('checkpoint')?.checkpoint());
    on('goal', () => live() && this.ok('goal')?.goal());
    on('respawn', () => live() && this.ok('respawn', 0.4)?.respawn());
    on('tip', (e) => {
      if (!live()) return;
      const [, p] = this.place(e.pos);
      this.ok('tip', 0.05)?.tip(1, p);
    });
    on('hazard', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      if (v > 0.05) this.ok(`hazard:${e.kind}`, 0.12)?.hazard(e.kind, v, p);
    });
    on('bark', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok('bark', 0.3)?.bark(v, p);
    });
    on('honk', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok('honk', 0.5)?.honk(v, p);
    });
    on('splash', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok('splash', 0.15)?.splash(v * Math.min(1, 0.4 + e.amount), p);
    });
    on('chime', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok('chime', 0.4)?.chime(v, p);
    });
    on('tick', (e) => {
      if (!live()) return;
      const [v, p] = this.place(e.pos);
      this.ok('tick', 0.1)?.tick(e.tock, v, p);
    });
    on('chaos', (e) => {
      if (!live()) return;
      if (e.kind === 'warn') this.ok('siren', 0.6)?.siren();
      else this.ok('sting', 0.3)?.sting();
    });
    // party games: the countdown, points, and the little announcements
    on('party', (e) => {
      if (!live()) return;
      if (/^[0-9]$/.test(e.text)) this.ok('count')?.count(false);
      else if (e.text === 'GO!') this.ok('go')?.count(true);
      else if (/BOOM/.test(e.text)) this.ok('boom')?.boom();
      else if (e.small) this.ok('pop', 0.08)?.pop(1, /^[−-]/.test(e.text) ? 0.7 : 1);
    });
    on('partyPoint', () => live() && this.ok('fanfare', 0.5)?.fanfare());
  }

  /** Each frame: the job's tune fills out while the load's being carried. */
  update(dt: number, s: LevelSession | null) {
    const m = this.tunes;
    if (!m) return;
    let want = 0.6;
    if (s && !s.attractMode && m.track === 'level') {
      const hands = s.players.filter((p) => p.handLook(0) === 'grip' || p.handLook(1) === 'grip').length;
      want = s.state !== 'playing' ? 0.9 : hands >= 2 ? 1 : hands === 1 ? 0.75 : 0.45;
    } else if (m.track === 'party') want = 1;
    m.intensity += (want - m.intensity) * Math.min(1, dt * 1.5);
    // the drop-off filling up
    if (s && !s.attractMode && s.state === 'playing' && s.goalProgress > 0.02) this.ok('charge', 0.11)?.charge(s.goalProgress / s.goalNeeded);
  }

  /** Tests: render a sound (or eight seconds of a tune) off-line and measure it. */
  async measure(what: string): Promise<{ peak: number; rms: number; seconds: number }> {
    const rate = 22050;
    const secs = what.startsWith('music:') ? 8 : 2;
    const ctx = new OfflineAudioContext(1, rate * secs, rate);
    if (what.startsWith('music:')) {
      const m = new Music(ctx, ctx.destination);
      m.intensity = 1;
      m.play(what.slice(6) as Track);
      m.schedule(secs);
    } else {
      const y = new Synth(ctx, ctx.destination) as unknown as Record<string, (...a: unknown[]) => void>;
      const [name, arg] = what.split(':');
      if (name === 'ui' || name === 'hazard' || name === 'impact') y[name](arg);
      else y[name]();
    }
    const buf = (await ctx.startRendering()).getChannelData(0);
    let peak = 0;
    let sum = 0;
    let lastLoud = 0;
    for (let i = 0; i < buf.length; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
      sum += a * a;
      if (a > 0.003) lastLoud = i;
    }
    return { peak, rms: Math.sqrt(sum / buf.length), seconds: lastLoud / rate };
  }

  /** Tests: every sound there is. */
  static readonly ALL = [
    ...['move', 'select', 'back', 'pause', 'toggle', 'tick', 'pop', 'whoosh', 'stamp', 'star', 'buy', 'error'].map((u) => `ui:${u}`),
    ...['step', 'jump', 'land', 'grab', 'release', 'slip', 'knock', 'getup', 'emote', 'damage', 'smash', 'wobble', 'splash', 'tip', 'checkpoint', 'goal', 'respawn', 'payout', 'fail', 'bark', 'honk', 'chime', 'tick', 'siren', 'sting', 'count', 'fanfare', 'pop', 'boom'],
    ...['wood', 'metal', 'glass', 'soft', 'concrete', 'body', 'cardboard', 'cake', 'water', 'ice', 'shell', 'rubber'].map((m) => `impact:${m}`),
    ...['ding', 'arrive', 'zap', 'whoosh', 'clunk', 'wreck', 'cannon', 'bumper', 'flap', 'hiccup', 'lava'].map((h) => `hazard:${h}`),
    'music:menu',
    'music:level',
    'music:party',
  ];
}
