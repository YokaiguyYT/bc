/**
 * Every sound in the game, made from oscillators and filtered noise (no audio
 * files, so the one-file build stays one file). Each recipe is short and soft
 * at the edges (a few milliseconds of attack, exponential tails) so nothing
 * clicks, and takes a volume, a stereo position and a pitch rate so repeats
 * never sound quite the same.
 *
 * It only needs a BaseAudioContext, so the test suite can render any sound in
 * an OfflineAudioContext and measure it.
 */

export type ImpactMaterial = 'wood' | 'metal' | 'glass' | 'soft' | 'concrete' | 'body' | 'cardboard' | 'cake' | 'water' | 'ice' | 'shell' | 'rubber';

type Filter = { type: BiquadFilterType; f0: number; f1?: number; q?: number };

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
export { midi };

export class Synth {
  private noise: AudioBuffer;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
  ) {
    const len = Math.floor(ctx.sampleRate * 1.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // ---------------------------------------------------------------- building blocks

  /** Where a sound goes: its own volume and place between the speakers. */
  private dest(vol: number, pan = 0): AudioNode {
    const g = this.ctx.createGain();
    // (one trim for every effect, set so they sit just above the music)
    g.gain.value = vol * 1.8;
    if (pan && 'createStereoPanner' in this.ctx) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.out);
    } else g.connect(this.out);
    return g;
  }

  /** An envelope: up to `peak` in `a` seconds, then dying away over `d`. */
  private env(t: number, peak: number, a: number, d: number, to: AudioNode) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(to);
    return g;
  }

  /** An oscillator from f0, gliding to f1 if given. */
  private osc(type: OscillatorType, t: number, dur: number, f0: number, f1: number | null, to: AudioNode, glide = dur) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + glide);
    o.connect(to);
    o.start(t);
    o.stop(t + dur + 0.03);
    return o;
  }

  /** A stretch of noise, through a filter if given. */
  private hiss(t: number, dur: number, to: AudioNode, f?: Filter) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    let node: AudioNode = s;
    if (f) {
      const b = this.ctx.createBiquadFilter();
      b.type = f.type;
      b.frequency.setValueAtTime(f.f0, t);
      if (f.f1) b.frequency.exponentialRampToValueAtTime(f.f1, t + dur);
      b.Q.value = f.q ?? 0.8;
      s.connect(b);
      node = b;
    }
    node.connect(to);
    s.start(t, Math.random());
    s.stop(t + dur + 0.03);
  }

  /** A note with a pitch glide: the workhorse for blips, bloops and thumps. */
  private blip(t: number, to: AudioNode, f0: number, f1: number | null, dur: number, peak: number, type: OscillatorType = 'sine', a = 0.004) {
    this.osc(type, t, dur, f0, f1, this.env(t, peak, a, dur - a, to));
  }

  /** A burst of filtered noise. */
  private burst(t: number, to: AudioNode, dur: number, peak: number, f?: Filter, a = 0.003) {
    this.hiss(t, dur, this.env(t, peak, a, dur - a, to), f);
  }

  /** A struck bell or bar: a few partials, the higher ones dying first. */
  private bell(t: number, to: AudioNode, f: number, dur: number, peak: number, partials: number[] = [1, 2.76, 5.4], type: OscillatorType = 'sine') {
    partials.forEach((p, i) => this.osc(type, t, dur, f * p, null, this.env(t, peak / (1 + i * 1.3), 0.003, dur / (1 + i * 0.9), to)));
  }

  // ---------------------------------------------------------------- menus

  ui(kind: string, vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.5);
    switch (kind) {
      case 'move':
        this.blip(t, d, 760, 900, 0.045, 0.22, 'triangle');
        break;
      case 'select':
        this.blip(t, d, 620, null, 0.06, 0.25, 'triangle');
        this.blip(t + 0.055, d, 930, null, 0.09, 0.25, 'triangle');
        break;
      case 'back':
        this.blip(t, d, 560, null, 0.05, 0.22, 'triangle');
        this.blip(t + 0.05, d, 400, null, 0.08, 0.22, 'triangle');
        break;
      case 'pause':
        this.blip(t, d, 500, null, 0.07, 0.22, 'triangle');
        this.blip(t + 0.08, d, 500, null, 0.1, 0.2, 'triangle');
        break;
      case 'toggle':
        this.blip(t, d, 700, 1000, 0.05, 0.2, 'sine');
        break;
      case 'tick': // a number counting up
        this.blip(t, d, 1250, 1500, 0.025, 0.14, 'triangle', 0.002);
        break;
      case 'pop':
        this.blip(t, d, 420, 880, 0.06, 0.3, 'sine');
        break;
      case 'whoosh':
        this.burst(t, d, 0.22, 0.7, { type: 'bandpass', f0: 500, f1: 2600, q: 1.2 }, 0.08);
        break;
      case 'stamp':
        this.blip(t, d, 150, 60, 0.16, 0.55, 'sine');
        this.burst(t, d, 0.09, 0.3, { type: 'lowpass', f0: 1800 });
        break;
      case 'star':
        this.bell(t, d, 1320, 0.5, 0.26, [1, 2, 3.01]);
        break;
      case 'buy':
        this.coin(t, d, 1);
        break;
      case 'error':
        this.blip(t, d, 220, 180, 0.12, 0.22, 'triangle');
        this.blip(t + 0.13, d, 180, 150, 0.16, 0.22, 'triangle');
        break;
    }
  }

  // ---------------------------------------------------------------- movers

  step(vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.22, pan);
    this.burst(t, d, 0.05, 0.5, { type: 'bandpass', f0: 420 * rate * (0.9 + Math.random() * 0.2), q: 1.4 });
    this.blip(t, d, 150 * rate, 90 * rate, 0.04, 0.25);
  }

  jump(vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.3, pan);
    this.blip(t, d, 330 * rate, 660 * rate, 0.13, 0.35, 'sine', 0.01);
    this.burst(t, d, 0.07, 0.12, { type: 'highpass', f0: 2500 });
  }

  land(vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.4, pan);
    this.blip(t, d, 140 * rate, 55, 0.14, 0.6);
    this.burst(t, d, 0.08, 0.25, { type: 'lowpass', f0: 900 });
  }

  /** Mittens latch on: a soft pop, a touch higher for the load. */
  grab(vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.32, pan);
    this.blip(t, d, 520 * rate, 780 * rate, 0.06, 0.4, 'sine', 0.003);
    this.burst(t, d, 0.02, 0.2, { type: 'bandpass', f0: 2400, q: 2 }, 0.001);
  }

  release(vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    this.blip(t, this.dest(vol * 0.2, pan), 640 * rate, 420 * rate, 0.07, 0.35);
  }

  /** A hand slipping off: a rubbery squeak. */
  slip(vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.3, pan);
    const e = this.env(t, 0.3, 0.01, 0.16, d);
    const o = this.osc('sine', t, 0.18, 1500, 800, e);
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 38;
    lg.gain.value = 120;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.2);
  }

  /** Knocked flying: a cartoon bonk with a boing after it. */
  knock(vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.5, pan);
    this.blip(t, d, 260 * rate, 110 * rate, 0.12, 0.6, 'triangle');
    this.burst(t, d, 0.05, 0.35, { type: 'bandpass', f0: 1200, q: 1 });
    // the boing: a wobbling note that settles
    const e = this.env(t + 0.05, 0.28, 0.01, 0.42, d);
    const o = this.osc('sine', t + 0.05, 0.45, 300 * rate, 190 * rate, e);
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.setValueAtTime(16, t);
    lfo.frequency.exponentialRampToValueAtTime(7, t + 0.5);
    lg.gain.setValueAtTime(60, t);
    lg.gain.exponentialRampToValueAtTime(4, t + 0.5);
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.55);
  }

  getup(vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.25, pan);
    this.blip(t, d, 300 * rate, 450 * rate, 0.08, 0.3);
    this.blip(t + 0.08, d, 450 * rate, 640 * rate, 0.1, 0.3);
  }

  /** A mover says something: a couple of babbled syllables, pitched by who and what. */
  emote(vol = 1, pan = 0, rate = 1, kind = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.3, pan);
    const tune = [
      [0, 4, 7],
      [0, 7],
      [7, 4, 2],
      [5, 5],
    ][kind % 4];
    tune.forEach((n, i) => this.blip(t + i * 0.075, d, 520 * rate * 2 ** (n / 12), 520 * rate * 2 ** ((n + 1.5) / 12), 0.065, 0.32, 'triangle', 0.008));
  }

  // ---------------------------------------------------------------- things hitting things

  impact(material: ImpactMaterial, vol = 1, pan = 0, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.5, pan);
    const r = rate * (0.92 + Math.random() * 0.16);
    switch (material) {
      case 'metal':
        this.bell(t, d, 520 * r, 0.5, 0.3, [1, 2.27, 3.38, 5.05]);
        this.burst(t, d, 0.03, 0.3, { type: 'highpass', f0: 3000 }, 0.001);
        break;
      case 'glass':
      case 'ice':
        this.bell(t, d, (material === 'ice' ? 1700 : 2100) * r, 0.22, 0.26, [1, 1.58, 2.24]);
        this.burst(t, d, 0.03, 0.2, { type: 'highpass', f0: 5000 }, 0.001);
        break;
      case 'soft':
      case 'body':
        this.blip(t, d, 130 * r, 60, 0.12, 0.5);
        this.burst(t, d, 0.09, 0.3, { type: 'lowpass', f0: 500 });
        break;
      case 'cardboard':
        this.burst(t, d, 0.08, 0.5, { type: 'lowpass', f0: 700 * r });
        this.blip(t, d, 190 * r, 110, 0.06, 0.3);
        break;
      case 'cake':
        this.burst(t, d, 0.16, 0.4, { type: 'lowpass', f0: 900, f1: 250, q: 3 }, 0.01);
        break;
      case 'water':
        this.splash(vol, pan);
        break;
      case 'rubber':
        this.blip(t, d, 190 * r, 95 * r, 0.16, 0.55);
        this.blip(t + 0.02, d, 380 * r, 200 * r, 0.1, 0.2);
        break;
      case 'shell':
        this.blip(t, d, 900 * r, 700 * r, 0.05, 0.4, 'triangle', 0.002);
        this.burst(t, d, 0.03, 0.2, { type: 'bandpass', f0: 2500, q: 2 }, 0.001);
        break;
      case 'concrete':
        this.blip(t, d, 110 * r, 50, 0.13, 0.55);
        this.burst(t, d, 0.1, 0.4, { type: 'bandpass', f0: 900, q: 0.6 });
        break;
      default: // wood
        this.blip(t, d, 210 * r, 150 * r, 0.07, 0.5, 'triangle', 0.002);
        this.burst(t, d, 0.05, 0.35, { type: 'bandpass', f0: 1100 * r, q: 1.5 }, 0.001);
    }
  }

  /** The load takes a knock: a crack, worse the more it lost. */
  damage(amount = 0.1, vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const k = Math.min(1, 0.35 + amount * 5);
    const d = this.dest(vol * 0.5 * k, pan);
    this.burst(t, d, 0.07, 0.5, { type: 'highpass', f0: 2200 }, 0.001);
    this.burst(t + 0.03, d, 0.1, 0.3, { type: 'bandpass', f0: 3500, f1: 1200, q: 2 }, 0.002);
    // an "uh-oh" under it
    this.blip(t + 0.02, d, 330, 262, 0.2, 0.3, 'triangle', 0.01);
  }

  /** The load is no more: a long smash, bits tinkling down. */
  smash(vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.36, pan);
    this.burst(t, d, 0.5, 0.6, { type: 'highpass', f0: 900, f1: 300 }, 0.002);
    this.blip(t, d, 160, 45, 0.3, 0.6);
    for (let i = 0; i < 9; i++) this.bell(t + 0.05 + Math.random() * 0.55, d, 1800 + Math.random() * 3000, 0.18, 0.12, [1, 1.6]);
  }

  wobble(vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.25, pan);
    const e = this.env(t, 0.4, 0.03, 0.3, d);
    const o = this.osc('sine', t, 0.34, 150, 120, e);
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 11;
    lg.gain.value = 25;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.36);
  }

  splash(vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.4, pan);
    this.burst(t, d, 0.32, 0.5, { type: 'bandpass', f0: 2400, f1: 600, q: 0.8 }, 0.01);
    this.blip(t, d, 300, 120, 0.1, 0.25);
    this.blip(t + 0.09, d, 900, 1500, 0.05, 0.12);
  }

  // ---------------------------------------------------------------- the job

  private coin(t: number, d: AudioNode, k: number) {
    this.bell(t, d, 1975, 0.12, 0.25 * k, [1, 1.5]);
    this.bell(t + 0.07, d, 2637, 0.4, 0.28 * k, [1, 1.5, 2.01]);
  }

  /** A banknote pocketed. */
  tip(vol = 1, pan = 0) {
    this.coin(this.ctx.currentTime, this.dest(vol * 0.45, pan), 1);
  }

  checkpoint(vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.4);
    this.bell(t, d, midi(84), 0.5, 0.3, [1, 2, 3]);
    this.bell(t + 0.11, d, midi(88), 0.7, 0.3, [1, 2, 3]);
  }

  /** Delivered: a rising flourish. */
  goal(vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.45);
    [72, 76, 79, 84, 88].forEach((n, i) => this.bell(t + i * 0.085, d, midi(n), 0.7, 0.28, [1, 2, 3.01]));
    this.burst(t + 0.34, d, 0.7, 0.12, { type: 'highpass', f0: 6000 }, 0.2);
  }

  /** The drop-off filling up: a tick that climbs as it fills (k 0..1). */
  charge(k: number, vol = 1) {
    const t = this.ctx.currentTime;
    this.blip(t, this.dest(vol * 0.22), 520 + 620 * k, 560 + 660 * k, 0.05, 0.3, 'triangle', 0.004);
  }

  /** Off the edge and back: a slide whistle down. */
  respawn(vol = 1) {
    const t = this.ctx.currentTime;
    this.blip(t, this.dest(vol * 0.3), 1000, 320, 0.42, 0.3, 'sine', 0.02);
  }

  /** Payday: a till, then a happy run of notes. */
  payout(vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.45);
    this.burst(t, d, 0.05, 0.3, { type: 'bandpass', f0: 3000, q: 3 }, 0.001);
    this.coin(t + 0.05, d, 1);
    [76, 79, 84, 91].forEach((n, i) => this.bell(t + 0.3 + i * 0.09, d, midi(n), 0.6, 0.22, [1, 2, 3]));
  }

  /** Nothing to deliver: the sad trombone. */
  fail(vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(d);
    [58, 57, 56, 55].forEach((n, i) => {
      const last = i === 3;
      const at = t + i * 0.34;
      const dur = last ? 0.9 : 0.3;
      const e = this.env(at, 0.3, 0.03, dur, lp);
      const o = this.osc('sawtooth', at, dur + 0.05, midi(n), last ? midi(n - 1.2) : midi(n - 0.3), e, dur);
      if (last) {
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 5.5;
        lg.gain.value = 6;
        lfo.connect(lg);
        lg.connect(o.frequency);
        lfo.start(at);
        lfo.stop(at + dur + 0.05);
      }
    });
  }

  // ---------------------------------------------------------------- the world

  hazard(kind: string, vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.42, pan);
    switch (kind) {
      case 'ding':
        this.bell(t, d, 1568, 0.6, 0.3, [1, 2, 3]);
        break;
      case 'arrive':
        this.bell(t, d, 784, 0.5, 0.3, [1, 2, 3]);
        this.bell(t + 0.2, d, 622, 0.7, 0.3, [1, 2, 3]);
        break;
      case 'zap': {
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'bandpass';
        lp.frequency.value = 1800;
        lp.Q.value = 0.7;
        lp.connect(d);
        this.blip(t, lp, 900, 140, 0.22, 0.3, 'sawtooth');
        this.burst(t, d, 0.2, 0.2, { type: 'highpass', f0: 4000 });
        break;
      }
      case 'whoosh':
        this.burst(t, d, 0.4, 0.8, { type: 'bandpass', f0: 300, f1: 1800, q: 1 }, 0.15);
        break;
      case 'clunk':
        this.blip(t, d, 180, 90, 0.12, 0.5, 'triangle');
        this.bell(t, d, 340, 0.2, 0.15, [1, 2.4]);
        break;
      case 'wreck':
        this.blip(t, d, 110, 40, 0.35, 0.7);
        this.burst(t, d, 0.3, 0.5, { type: 'lowpass', f0: 1500, f1: 300 });
        this.bell(t, d, 260, 0.6, 0.2, [1, 2.27, 3.38]);
        break;
      case 'cannon':
        this.blip(t, d, 120, 38, 0.4, 0.75);
        this.burst(t, d, 0.25, 0.45, { type: 'lowpass', f0: 2200, f1: 300 });
        break;
      case 'bumper':
        this.blip(t, d, 300, 600, 0.09, 0.45);
        this.blip(t + 0.07, d, 600, 320, 0.16, 0.35);
        break;
      case 'flap':
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.06, d, 0.04, 0.3, { type: 'bandpass', f0: 1400, q: 1 });
        break;
      case 'hiccup':
        this.blip(t, d, 500, 900, 0.06, 0.35);
        this.blip(t + 0.09, d, 350, 280, 0.08, 0.25);
        break;
      case 'lava':
        this.burst(t, d, 0.5, 0.35, { type: 'bandpass', f0: 3500, f1: 900, q: 0.7 }, 0.03);
        break;
      default:
        this.blip(t, d, 440, 330, 0.1, 0.3, 'triangle');
    }
  }

  bark(vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.4, pan);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 1.2;
    f.connect(d);
    for (const at of [0, 0.16]) {
      this.blip(t + at, f, 420, 250, 0.09, 0.6, 'sawtooth', 0.008);
      this.burst(t + at, d, 0.05, 0.12, { type: 'bandpass', f0: 1600, q: 1 });
    }
  }

  honk(vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.3, pan);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1700;
    f.connect(d);
    for (const hz of [392, 494]) this.osc('square', t, 0.3, hz, null, this.env(t, 0.2, 0.012, 0.28, f));
  }

  /** A clock's chime. */
  chime(vol = 1, pan = 0) {
    this.bell(this.ctx.currentTime, this.dest(vol * 0.35, pan), 392, 1.4, 0.3, [1, 2, 2.4, 3, 4.5]);
  }

  tick(tock = false, vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    this.blip(t, this.dest(vol * 0.16, pan), tock ? 1500 : 2100, null, 0.02, 0.4, 'triangle', 0.001);
  }

  /** Something's about to happen in a chaos job: a two-tone siren. */
  siren(vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.24);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1500;
    f.connect(d);
    for (let i = 0; i < 4; i++) this.blip(t + i * 0.19, f, i % 2 ? 620 : 830, null, 0.18, 0.3, 'square', 0.015);
  }

  /** …and here it is: a low two-note sting. */
  sting(vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.36);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    f.connect(d);
    this.blip(t, f, midi(50), null, 0.16, 0.32, 'sawtooth', 0.01);
    this.blip(t + 0.17, f, midi(45), midi(44.6), 0.5, 0.36, 'sawtooth', 0.01);
    this.blip(t + 0.17, d, 90, 45, 0.3, 0.5);
  }

  // ---------------------------------------------------------------- party games

  /** 3… 2… 1… (the same note), then GO (higher, longer). */
  count(go = false, vol = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.4);
    if (go) {
      this.blip(t, d, 1175, null, 0.45, 0.3, 'triangle', 0.005);
      this.blip(t, d, 587, null, 0.45, 0.2, 'triangle', 0.005);
    } else this.blip(t, d, 587, null, 0.16, 0.3, 'triangle', 0.005);
  }

  /** A point, a round, the game: three rising notes and a bit of a cheer. */
  fanfare(vol = 1, big = false) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.42);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    f.connect(d);
    const notes = big ? [67, 72, 76, 79, 84] : [72, 76, 79];
    notes.forEach((n, i) => {
      const last = i === notes.length - 1;
      this.blip(t + i * 0.1, f, midi(n), null, last ? 0.5 : 0.11, 0.22, 'sawtooth', 0.008);
      this.blip(t + i * 0.1, d, midi(n + 12), null, last ? 0.5 : 0.11, 0.1, 'triangle', 0.008);
    });
    // the crowd
    this.burst(t + 0.15, d, big ? 1.3 : 0.7, 0.14, { type: 'bandpass', f0: 1300, f1: 2200, q: 0.5 }, 0.25);
  }

  /** A little announcement (TAG!, SPLASH!, +1 BOX). */
  pop(vol = 1, rate = 1) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.35);
    this.blip(t, d, 440 * rate, 900 * rate, 0.07, 0.35);
    this.blip(t + 0.06, d, 900 * rate, 1150 * rate, 0.07, 0.25);
  }

  boom(vol = 1, pan = 0) {
    const t = this.ctx.currentTime;
    const d = this.dest(vol * 0.36, pan);
    this.blip(t, d, 140, 32, 0.6, 0.8);
    this.burst(t, d, 0.5, 0.6, { type: 'lowpass', f0: 3000, f1: 200 }, 0.002);
    this.burst(t + 0.05, d, 0.9, 0.2, { type: 'bandpass', f0: 500, f1: 150, q: 0.5 }, 0.1);
  }
}
