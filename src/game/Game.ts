import * as THREE from 'three';
import { Renderer, Quality } from '../render/Renderer';
import { Keyboard } from '../input/Keyboard';
import { Touch } from '../input/Touch';
import { LevelSession, NetInput } from './LevelSession';
import { LEVELS, levelById } from '../levels';
import { setGeoDetail } from '../levels/LevelBuilder';
import type { LevelDef } from '../levels/types';
import { loadJSON, saveJSON } from '../util/storage';
import { loadStats } from './outfits';

export interface Settings {
  quality: Quality;
  master: number;
  music: number;
  sfx: number;
  shake: boolean;
  /** Hand-made jobs: the ghost of your best run (on unless switched off). */
  ghost?: boolean;
  /** One player: the second mover is a robot buddy. */
  solo?: boolean;
  /** Cargo damage multiplier (1 normal, 0.5 sturdy, 0 unbreakable). */
  damage: number;
  /** Shrink the picture a little when frames come slowly (on unless switched off). */
  smooth?: boolean;
  /** Tips on the hint line: on, off, or 'auto' (the default: only for a new player's first few deliveries). */
  tips?: 'auto' | 'on' | 'off';
}

/** How many deliveries count as being new to the game (tips on 'auto' stop after these). */
export const NEW_PLAYER_JOBS = 3;

const DEFAULT_SETTINGS: Settings = { quality: 'medium', master: 0.8, music: 0.55, sfx: 0.9, shake: true, damage: 1 };

/**
 * Top-level owner: renderer, input, audio, UI and the current level session.
 */
export class Game {
  readonly renderer: Renderer;
  readonly keyboard = new Keyboard();
  /** On-screen controls (phones and tablets; hidden everywhere else). */
  readonly touch = new Touch();
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

  /** Are tips shown (the Settings choice; 'auto' is on only while somebody is new to the game)? */
  tipsOn() {
    const t = this.settings.tips ?? 'auto';
    if (t !== 'auto') return t === 'on';
    return loadStats().deliveries < NEW_PLAYER_JOBS;
  }

  constructor(readonly container: HTMLElement) {
    const saved = loadJSON<Partial<Settings>>('ff.settings');
    this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    // first time on a Chromebook (usually a modest GPU): start on Fast graphics
    if (!saved?.quality && /CrOS/.test(navigator.userAgent)) this.settings.quality = 'low';
    this.renderer = new Renderer(container);
    // (not under automation: tests run on a software renderer, where it would always be at its smallest)
    const asked = new URLSearchParams(location.search).get('smooth');
    this.renderer.smooth = asked ? asked === '1' : this.settings.smooth !== false && !navigator.webdriver;
    this.renderer.setQuality(this.settings.quality);
    // Fit the picture to the screen. Phones report the old size for a moment after being turned (the
    // picture kept its old shape, stretched, with a strip of page showing), so it's measured again a few
    // times after any change, and the boxes are given the screen's size outright.
    const fit = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const el of [container, document.getElementById('ui')]) {
        if (!el) continue;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
      }
      this.renderer.resize();
    };
    const refit = () => {
      fit();
      for (const ms of [60, 250, 600, 1200]) setTimeout(fit, ms);
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    window.visualViewport?.addEventListener('resize', refit);
    fit();
  }

  saveSettings() {
    saveJSON('ff.settings', this.settings);
  }

  startLevel(def: LevelDef | string) {
    const d = typeof def === 'string' ? levelById(def) : def;
    if (!d) throw new Error(`no level ${def}`);
    this.endLevel();
    const q = this.settings.quality;
    setGeoDetail(q === 'low' ? 0 : q === 'high' ? 2 : 1);
    this.session = new LevelSession(d, this.renderer, this.keyboard);
    this.session.input = this.input;
    this.session.touch = this.touch;
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
      const real = (t - this.last) / 1000;
      const dt = Math.min(0.1, Math.max(0, real));
      this.last = t;
      this.frame(dt);
      if (!this.halted) this.renderer.pace(real);
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
    if (render) {
      this.renderer.render();
      this.afterRender?.();
    }
  }

  /** Every job with a load to deliver (tests walk these; party arenas aren't jobs). */
  get levels() {
    return LEVELS.filter((l) => !l.party);
  }
}

export { THREE };
