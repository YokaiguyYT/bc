import { midi } from './synth';

export type Track = 'menu' | 'level' | 'party' | 'none';

/**
 * The music: a tiny step sequencer (sixteenth notes) playing a few bars of
 * chords round and round, with a kick, a rim click, a shaker, a bass, soft
 * keys and a marimba. Everything is synthesized. `intensity` (0..1) brings
 * layers in and out, so a job's tune fills out while the load's being carried
 * and thins when everyone's standing about.
 */

interface Bar {
  bass: number;
  chord: number[];
}
interface Song {
  bpm: number;
  /** How late the off-beat sixteenths land (0 straight .. 0.3 lazy). */
  swing: number;
  bars: Bar[];
  /** Tunes for the marimba, each as long as `bars`: [step in the whole phrase, note]. */
  tunes: [number, number][][];
  /** Which tune plays on each pass (indices into tunes; -1 none). */
  order: number[];
}

const C = { bass: 48, chord: [64, 67, 71] };
const Am = { bass: 45, chord: [64, 67, 72] };
const F = { bass: 53, chord: [64, 69, 72] };
const G = { bass: 43, chord: [62, 65, 71] };

/** A bar of notes written out: 16 entries, 0 for a rest. */
const bar = (n: number, notes: number[]): [number, number][] => notes.map((m, i) => [n * 16 + i, m] as [number, number]).filter(([, m]) => m > 0);
const E5 = 76, G5 = 79, A5 = 81, C5 = 72, D5 = 74, A4 = 69, B4 = 71, G4 = 67, F5 = 77, C6 = 84, B5 = 83, D6 = 86, E4 = 64;

const SONGS: Record<Exclude<Track, 'none'>, Song> = {
  // the menus: laid back
  menu: {
    bpm: 92,
    swing: 0.14,
    bars: [C, Am, F, G],
    tunes: [
      [...bar(0, [0, 0, 0, 0, E5, 0, 0, 0, 0, 0, G5, 0, 0, 0, 0, 0]), ...bar(1, [0, 0, 0, 0, C5, 0, 0, 0, 0, 0, E5, 0, 0, 0, 0, 0]), ...bar(2, [0, 0, 0, 0, A4, 0, 0, 0, 0, 0, C5, 0, 0, 0, E5, 0]), ...bar(3, [D5, 0, 0, 0, 0, 0, 0, 0, B4, 0, 0, 0, 0, 0, 0, 0])],
      [...bar(0, [E5, 0, 0, G5, 0, 0, A5, 0, G5, 0, 0, 0, E5, 0, 0, 0]), ...bar(1, [C5, 0, 0, 0, E5, 0, 0, 0, A4, 0, 0, 0, 0, 0, 0, 0]), ...bar(2, [A5, 0, 0, G5, 0, 0, E5, 0, 0, 0, C5, 0, D5, 0, 0, 0]), ...bar(3, [D5, 0, 0, 0, B4, 0, 0, 0, G4, 0, 0, 0, 0, 0, D5, 0])],
      [...bar(0, [G4, 0, C5, 0, E5, 0, 0, 0, G5, 0, 0, 0, E5, 0, 0, 0]), ...bar(1, [A4, 0, C5, 0, E5, 0, 0, 0, A5, 0, 0, 0, G5, 0, 0, 0]), ...bar(2, [F5, 0, 0, 0, E5, 0, C5, 0, A4, 0, 0, 0, C5, 0, 0, 0]), ...bar(3, [B4, 0, D5, 0, G5, 0, 0, 0, F5, 0, 0, 0, D5, 0, 0, 0])],
    ],
    order: [0, 1, 0, 2],
  },
  // a job: gets going when the load's off the ground
  level: {
    bpm: 108,
    swing: 0.06,
    bars: [C, C, F, G, Am, F, C, G],
    tunes: [
      [
        ...bar(0, [E5, 0, 0, 0, 0, 0, G5, 0, 0, 0, E5, 0, 0, 0, 0, 0]),
        ...bar(1, [C5, 0, 0, 0, 0, 0, 0, 0, E5, 0, G5, 0, 0, 0, 0, 0]),
        ...bar(2, [A5, 0, 0, 0, 0, 0, G5, 0, 0, 0, F5, 0, 0, 0, 0, 0]),
        ...bar(3, [D5, 0, 0, 0, 0, 0, 0, 0, B4, 0, D5, 0, 0, 0, 0, 0]),
        ...bar(4, [E5, 0, 0, 0, 0, 0, C5, 0, 0, 0, A4, 0, 0, 0, 0, 0]),
        ...bar(5, [C5, 0, 0, 0, 0, 0, 0, 0, A4, 0, C5, 0, 0, 0, F5, 0]),
        ...bar(6, [E5, 0, 0, 0, 0, 0, G5, 0, 0, 0, C6, 0, 0, 0, 0, 0]),
        ...bar(7, [B4, 0, 0, 0, D5, 0, 0, 0, G5, 0, 0, 0, 0, 0, 0, 0]),
      ],
    ],
    order: [0],
  },
  // a party game: bouncy
  party: {
    bpm: 126,
    swing: 0,
    bars: [C, F, G, C],
    tunes: [
      [...bar(0, [E5, 0, G5, 0, C6, 0, G5, 0, E5, 0, G5, 0, C6, 0, 0, 0]), ...bar(1, [F5, 0, A5, 0, C6, 0, A5, 0, F5, 0, A5, 0, C6, 0, 0, 0]), ...bar(2, [G5, 0, B5, 0, D6, 0, B5, 0, G5, 0, B5, 0, D6, 0, B5, 0]), ...bar(3, [C6, 0, 0, 0, G5, 0, 0, 0, E5, 0, 0, 0, C5, 0, 0, 0])],
      [...bar(0, [C5, 0, 0, E5, 0, 0, G5, 0, 0, 0, E5, 0, 0, 0, 0, 0]), ...bar(1, [C5, 0, 0, F5, 0, 0, A5, 0, 0, 0, F5, 0, 0, 0, 0, 0]), ...bar(2, [D5, 0, 0, G5, 0, 0, B5, 0, 0, 0, G5, 0, 0, 0, D5, 0]), ...bar(3, [E5, 0, 0, 0, C5, 0, 0, 0, G4, 0, 0, 0, C5, 0, 0, 0])],
    ],
    order: [1, 0],
  },
};
void E4;

export class Music {
  track: Track = 'none';
  /** 0 thin .. 1 everything playing. */
  intensity = 0.6;
  private step = 0;
  private next = 0;
  private noise: AudioBuffer;

  constructor(
    private ctx: BaseAudioContext,
    private out: AudioNode,
  ) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Start a tune from its top (a beat from now). */
  play(track: Track) {
    if (track === this.track) return;
    this.track = track;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.12;
  }

  /** Line up everything due before `until` (call it often, a little ahead of the clock). */
  schedule(until: number) {
    if (this.track === 'none') return;
    const song = SONGS[this.track];
    const six = 60 / song.bpm / 4;
    // (fell behind, a tab in the background: skip on rather than play the lot at once)
    if (this.next < this.ctx.currentTime - 0.2) this.next = this.ctx.currentTime + 0.05;
    while (this.next < until) {
      const late = this.step % 2 ? six * song.swing : 0;
      this.playStep(song, this.step, this.next + late, six);
      this.step++;
      this.next += six;
    }
  }

  private playStep(song: Song, step: number, t: number, six: number) {
    const k = this.intensity;
    const phrase = song.bars.length * 16;
    const at = step % phrase;
    const s = at % 16;
    const b = song.bars[Math.floor(at / 16)];
    const pass = Math.floor(step / phrase);
    const party = song === SONGS.party;
    // drums
    if (party ? s % 4 === 0 : s === 0 || s === 8 || (k > 0.8 && s === 10)) this.kick(t);
    if (s === 4 || s === 12) party ? this.clap(t) : this.rim(t);
    if (k > 0.5 && s % 2 === 0 && (party ? s % 4 === 2 : true)) this.hat(t, s % 4 === 0 ? 0.5 : 1);
    if (k > 0.85 && s % 2 === 1 && !party) this.hat(t, 0.35);
    // bass: the root on the beat, a fifth or an octave between
    if (s % 4 === 0) this.bass(t, b.bass, six * 3);
    else if (s % 4 === 2 && (party || k > 0.4)) this.bass(t, b.bass + (party ? 12 : 7), six * 1.6, 0.7);
    // keys: a soft chord at the top of the bar, and a push before the third beat
    if (s === 0 || (s === 6 && k > 0.3)) this.keys(t, b.chord, s === 0 ? six * 9 : six * 5, s === 0 ? 1 : 0.6);
    // the job's tune keeps a marimba ticking over under it once things are moving
    if (song === SONGS.level && k > 0.55 && s % 2 === 0) {
      const arp = [0, 1, 2, 1][(s / 2) % 4];
      this.marimba(t, b.chord[arp] + (s % 8 === 6 ? 12 : 0), 0.45);
    }
    // the tune
    const tune = song.tunes[song.order[pass % song.order.length]];
    if (tune && (song !== SONGS.level || k > 0.8)) for (const [st, note] of tune) if (st === at) party ? this.lead(t, note, six * 1.7) : this.marimba(t, note, 1);
  }

  // ---------------------------------------------------------------- the instruments

  private gain(t: number, peak: number, a: number, d: number, to: AudioNode = this.out) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(to);
    return g;
  }
  private tone(type: OscillatorType, t: number, dur: number, f0: number, f1: number | null, to: AudioNode) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(to);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  private hiss(t: number, dur: number, type: BiquadFilterType, hz: number, to: AudioNode) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    s.connect(f);
    f.connect(to);
    s.start(t, Math.random() * 0.4);
    s.stop(t + dur + 0.03);
  }

  private kick(t: number) {
    this.tone('sine', t, 0.16, 120, 48, this.gain(t, 0.5, 0.003, 0.15));
  }
  private rim(t: number) {
    this.hiss(t, 0.04, 'bandpass', 1900, this.gain(t, 0.16, 0.001, 0.04));
    this.tone('triangle', t, 0.03, 420, null, this.gain(t, 0.1, 0.001, 0.03));
  }
  private clap(t: number) {
    for (const d of [0, 0.012, 0.026]) this.hiss(t + d, 0.05, 'bandpass', 1500, this.gain(t + d, 0.14, 0.001, 0.05));
  }
  private hat(t: number, k: number) {
    this.hiss(t, 0.03, 'highpass', 7000, this.gain(t, 0.07 * k, 0.001, 0.03));
  }
  private bass(t: number, note: number, dur: number, k = 1) {
    const g = this.gain(t, 0.26 * k, 0.008, dur);
    this.tone('triangle', t, dur, midi(note), null, g);
    this.tone('sine', t, dur, midi(note) * 2, null, this.gain(t, 0.06 * k, 0.008, dur * 0.6));
  }
  private keys(t: number, notes: number[], dur: number, k: number) {
    for (const n of notes) {
      this.tone('sine', t, dur, midi(n), null, this.gain(t, 0.07 * k, 0.012, dur));
      this.tone('sine', t, dur, midi(n) * 2, null, this.gain(t, 0.018 * k, 0.012, dur * 0.4));
    }
  }
  private marimba(t: number, note: number, k: number) {
    const f = midi(note);
    this.tone('sine', t, 0.4, f, null, this.gain(t, 0.15 * k, 0.003, 0.36));
    this.tone('sine', t, 0.12, f * 3.9, null, this.gain(t, 0.04 * k, 0.002, 0.1));
  }
  private lead(t: number, note: number, dur: number) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.connect(this.out);
    this.tone('square', t, dur, midi(note), null, this.gain(t, 0.07, 0.006, dur, lp));
    this.tone('triangle', t, dur, midi(note), null, this.gain(t, 0.08, 0.006, dur));
  }
}
