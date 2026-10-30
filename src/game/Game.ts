import * as THREE from 'three';
import { Renderer, Quality } from '../render/Renderer';
import { Keyboard } from '../input/Keyboard';
import { LevelSession, NetInput } from './LevelSession';
import { LEVELS, levelById } from '../levels';
import type { LevelDef } from '../levels/types';
import { loadJSON, saveJSON } from '../util/storage';

export interface Settings {
  quality: Quality;
  master: number;
  music: number;
  sfx: number;
  shake: boolean;
  /** Cargo damage multiplier (1 normal, 0.5 sturdy, 0 unbreakable). */
  damage: number;
}

const DEFAULT_SETTINGS: Settings = { quality: 'medium', master: 0.8, music: 0.55, sfx: 0.9, shake: true, damage: 1 };

/**
 * Top-level owner: renderer, input, audio, UI and the current level session.
 */
export class Game {
  readonly renderer: Renderer;
  readonly keyboard = new Keyboard();
  session: LevelSession | null = null;
  settings: Settings;
  private last = performance.now();
  private running = false;
  /** Test mode: time only advances via advance(). */
  manual = false;
  onFrame: ((dt: number) => void) | null = null;
  /** Online: keys from the other laptop (handed to every new session). */
  input: NetInput | null = null;
  /** Online guest: the picture comes from the host, so this laptop runs and draws nothing. */
  halted = false;
  /** Online host: Player 2 is on the other laptop. */
  onlineP2 = false;
  /** Online guest: we're Player 2 and the host's laptop runs the game. */
  onlineGuest = false;
  /** Called right after each frame is drawn (online: copy the picture while it's still there). */
  afterRender: (() => void) | null = null;
  frameTimes: number[] = [];

  constructor(readonly container: HTMLElement) {
    this.settings = { ...DEFAULT_SETTINGS, ...(loadJSON<Partial<Settings>>('ff.settings') ?? {}) };
    this.renderer = new Renderer(container);
    this.renderer.setQuality(this.settings.quality);
    window.addEventListener('resize', () => this.renderer.resize());
  }

  saveSettings() {
    saveJSON('ff.settings', this.settings);
  }

  startLevel(def: LevelDef | string) {
    const d = typeof def === 'string' ? levelById(def) : def;
    if (!d) throw new Error(`no level ${def}`);
    this.endLevel();
    this.session = new LevelSession(d, this.renderer, this.keyboard);
    this.session.input = this.input;
    return this.session;
  }

  endLevel() {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      if (this.manual) return;
      const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  frame(dt: number) {
    const t0 = performance.now();
    this.keyboard.beginFrame();
    this.onFrame?.(dt);
    if (this.halted) return;
    if (this.session) this.session.update(dt);
    this.renderer.render();
    this.afterRender?.();
    const ft = performance.now() - t0;
    this.frameTimes.push(ft);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
  }

  /** Test hook: advance the game by `seconds` in fixed frames, then render once (unless told not to). */
  advance(seconds: number, fps = 60, render = true) {
    const n = Math.max(1, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) {
      this.keyboard.beginFrame();
      this.onFrame?.(1 / fps);
      this.session?.update(1 / fps);
    }
    if (render) this.renderer.render();
  }

  get levels() {
    return LEVELS;
  }
}

export { THREE };
