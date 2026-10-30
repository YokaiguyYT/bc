import type { Game } from '../game/Game';
import { LevelSession, SessionResult, PLAYER_COLORS } from '../game/LevelSession';
import { LEVELS, PLAYABLE_LEVELS, levelById } from '../levels';
import { Hud } from './Hud';
import { keyLabel, PlayerBindings, P2_LAYOUTS } from '../config/bindings';
import { takeKeys } from '../input/Keyboard';
import { loadProgress, recordResult, starsFor, totalEarnings } from '../game/progress';
import { formatMoney, formatTime } from '../util/math';
import { models } from '../render/models';
import { AudioEngine } from '../audio/AudioEngine';
import { DevPanel } from './DevPanel';
import { tuning } from '../config/tuning';
import { Attract } from '../game/Attract';
import { CARGO_INFO } from '../entities/cargo/info';
import { CODE_LEN, LevelMsg, mergeMoves, OnlineGuest, OnlineHost } from '../net/Online';
import { GuestSync } from '../net/sync';
import type { LevelDef } from '../levels/types';
import { morph } from '../net/mirror';

type Screen =
  | 'title'
  | 'menu'
  | 'levels'
  | 'controls'
  | 'settings'
  | 'credits'
  | 'playing'
  | 'paused'
  | 'results'
  | 'howto'
  | 'online'
  | 'host'
  | 'join'
  | 'guest'
  | 'guest-menu'
  | 'guest-lost';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** All the DOM UI: screens, menus, HUD, and the glue to the game. */
export class App {
  screen: Screen = 'title';
  private layer: HTMLDivElement;
  private hudLayer: HTMLDivElement;
  private hud: Hud | null = null;
  readonly audio = new AudioEngine();
  private dev: DevPanel | null = null;
  private focusables: HTMLElement[] = [];
  private focusIndex = 0;
  private back: (() => void) | null = null;
  private listening: { player: 'p1' | 'p2' | 'cam'; action: string; btn: HTMLButtonElement } | null = null;
  private attract: Attract | null = null;
  private keytestTimer = 0;
  private perf = { from: 0, frames: 0, hinted: false };
  /** Seconds the results card has been up. */
  private resultsFor = 0;
  /** Online: hosting a game for a friend, or playing on a friend's. */
  private host: OnlineHost | null = null;
  private guest: OnlineGuest | null = null;
  private joinCode = '';
  private joining = false;
  private netBadge: HTMLDivElement | null = null;
  /** Guest: our own menus go here, above the copy of the host's. */
  private localUi: HTMLDivElement | null = null;
  private video: HTMLVideoElement | null = null;

  constructor(
    private game: Game,
    private root: HTMLElement,
  ) {
    this.hudLayer = document.createElement('div');
    this.layer = document.createElement('div');
    root.append(this.hudLayer, this.layer);
    this.audio.setVolumes(game.settings.master, game.settings.music, game.settings.sfx);
    tuning.damage.scale = game.settings.damage ?? 1;
    game.keyboard.onKey = (code, e) => this.onKey(code, e);
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
    game.onFrame = (dt) => this.frame(dt);
    window.addEventListener('paste', this.onPaste);
    // switching to another app or tab pauses, rather than leaving the movers standing in traffic
    window.addEventListener('blur', () => {
      this.pause();
      // a guest switching away must not leave its mover walking on the host's screen
      this.guest?.sendKeys(null, 1, null);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
    });
    // a stray trackpad swipe back or ⌘R mid-job asks first
    window.addEventListener('beforeunload', (e) => {
      if (this.screen !== 'playing' && this.screen !== 'paused' && !this.guest && !this.host?.connected) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  // ------------------------------------------------------------ navigation

  private setScreen(s: Screen, html: string, opts: { dim?: boolean; back?: () => void } = {}) {
    this.screen = s;
    this.layer.innerHTML = html ? `<div class="screen ${opts.dim ? 'dim' : ''}">${html}</div>` : '';
    this.back = opts.back ?? null;
    this.focusables = [...this.layer.querySelectorAll<HTMLElement>('[data-nav]')];
    this.focusIndex = Math.max(
      0,
      this.focusables.findIndex((el) => el.hasAttribute('data-default')),
    );
    this.updateFocus();
    for (const el of this.focusables) {
      el.addEventListener('mouseenter', () => {
        this.focusIndex = this.focusables.indexOf(el);
        this.updateFocus();
      });
      el.addEventListener('click', () => {
        this.audio.ui('select');
      });
    }
  }

  /** Up and down move a whole row in a grid of cards (the job list); everything else moves one. */
  private navStep(code: string) {
    const el = this.focusables[this.focusIndex];
    const vertical = code === 'ArrowUp' || code === 'ArrowDown' || code === 'KeyW' || code === 'KeyS';
    if (!vertical || !el?.classList.contains('level-card')) return 1;
    const cards = this.focusables.filter((c) => c.classList.contains('level-card'));
    const cols = cards.filter((c) => c.offsetTop === cards[0].offsetTop).length;
    const i = cards.indexOf(el);
    const up = code === 'ArrowUp' || code === 'KeyW';
    // from the top row, up stays put; from the bottom row, down goes on to Back
    if (up) return i >= cols ? cols : 0;
    return i + cols < cards.length ? cols : cards.length - i;
  }

  private updateFocus() {
    this.focusables.forEach((el, i) => el.classList.toggle('focus', i === this.focusIndex));
  }

  private onKey(code: string, e: KeyboardEvent) {
    this.audio.unlock();
    if (this.listening) {
      e.preventDefault();
      this.finishRebind(code);
      return;
    }
    const b = this.game.keyboard.bindings;
    if (b.dev.includes(code)) {
      this.toggleDev();
      return;
    }
    if (this.screen === 'join' && this.typeCode(code, e)) return;
    if (this.screen === 'guest') {
      if (b.pause.includes(code)) this.showGuestMenu();
      return;
    }
    if (this.screen === 'title') {
      this.audio.ui('select');
      this.showMenu();
      return;
    }
    if (this.screen === 'playing') {
      if (b.pause.includes(code)) this.pause();
      return;
    }
    if (this.screen === 'paused' && b.pause.includes(code)) {
      this.resume();
      return;
    }
    if (this.screen === 'results' && this.game.session?.result && !this.focusables.length) return;
    // jump keys double as "select": don't let a last mashed jump skip the results card
    if (this.screen === 'results' && this.resultsFor < 1.2) return;
    // menu navigation
    const prev = ['ArrowUp', 'KeyW', 'ArrowLeft', 'KeyA'];
    const next = ['ArrowDown', 'KeyS', 'ArrowRight', 'KeyD'];
    const ok = ['Enter', 'Space', 'NumpadEnter'];
    if (prev.includes(code) || next.includes(code)) {
      if (!this.focusables.length) return;
      e.preventDefault();
      // stop at the ends instead of wrapping: from Resume, a stray W must not land on Quit
      this.focusIndex = Math.max(0, Math.min(this.focusables.length - 1, this.focusIndex + (prev.includes(code) ? -1 : 1) * this.navStep(code)));
      this.updateFocus();
      this.focusables[this.focusIndex]?.scrollIntoView({ block: 'nearest' });
      this.audio.ui('move');
    } else if (ok.includes(code)) {
      const el = this.focusables[this.focusIndex];
      if (el) {
        e.preventDefault();
        el.click();
      }
    } else if (code === 'Escape' || code === 'Backspace') {
      if (this.back) {
        this.audio.ui('back');
        this.back();
      }
    }
  }

  private frame(dt: number) {
    const g = this.guest;
    if (g) {
      const s = this.game.session;
      g.sendKeys(this.screen === 'guest' ? this.game.keyboard : null, dt, s?.mirror ? s : null);
      if (g.mode === 'light') {
        this.attract?.update(dt);
        if (s?.mirror && this.hud) this.hud.update(dt);
      }
      return;
    }
    if (this.host) {
      // the host only shares real jobs, not the menu's background scene
      this.host.level = this.attract ? null : this.game.session;
      this.host.update(dt);
    }
    this.watchFrameRate();
    if (this.screen === 'results') this.resultsFor += dt;
    this.attract?.update(dt);
    const s = this.game.session;
    if (s && this.hud && (this.screen === 'playing' || this.screen === 'paused')) this.hud.update(dt);
    if (s && this.screen === 'playing' && s.result) this.showResults(s.result);
    if (this.screen === 'controls') {
      this.keytestTimer -= dt;
      if (this.keytestTimer <= 0) {
        this.keytestTimer = 0.05;
        const box = this.layer.querySelector('.keytest');
        if (box) {
          const keys = [...this.game.keyboard.down];
          box.innerHTML = keys.length ? keys.map((k) => `<kbd>${esc(keyLabel(k))}</kbd>`).join('') : '<span class="hint-line">Hold keys here to test them…</span>';
        }
      }
    }
    this.audio.update(dt, s);
  }

  // ------------------------------------------------------------ screens

  showTitle() {
    this.startAttract();
    this.setScreen(
      'title',
      `<div class="logo" style="font-size:clamp(54px,11vw,140px)"><span class="w fragile">FRAGILE</span><br><span class="w freight" style="animation-delay:-1.3s">FREIGHT</span></div>
       <div class="press-start">Press any key</div>
       <div class="hint-line">A goofy 2-player moving company · one keyboard, or a laptop each</div>`,
    );
    this.layer.querySelector('.screen')?.addEventListener('click', () => this.showMenu());
  }

  private startAttract() {
    if (this.attract) return;
    this.game.endLevel();
    this.hudLayer.innerHTML = '';
    this.hud = null;
    const s = this.game.startLevel('playground');
    this.attract = new Attract(s);
  }

  showMenu() {
    this.startAttract();
    this.audio.music('menu');
    const earned = totalEarnings();
    this.setScreen(
      'menu',
      `<div class="logo" style="font-size:clamp(40px,6vw,74px)"><span class="w fragile">FRAGILE</span> <span class="w freight" style="animation-delay:-1.3s">FREIGHT</span></div>
       <div class="menu">
         <button class="btn primary" data-nav data-default id="m-play">Play</button>
         <button class="btn" data-nav id="m-online">${this.host ? `Online: ${this.host.connected ? 'friend connected' : 'hosting'}` : 'Play Online'}</button>
         <button class="btn" data-nav id="m-howto">How to Play</button>
         <button class="btn" data-nav id="m-controls">Controls</button>
         <button class="btn" data-nav id="m-settings">Settings</button>
         <button class="btn" data-nav id="m-credits">Credits</button>
       </div>
       ${this.game.keyboard.movedP2 ? '<div class="hint-line" style="color:var(--ink)"><b>New for Player 2:</b> arrows to move, <b>K</b> to jump, <b>L</b> to grab. Other layouts are under Controls.</div>' : ''}
       <div class="hint-line">${earned > 0 ? `Company earnings so far: <b>${formatMoney(earned)}</b> · ` : ''}Navigate with arrows / WASD · Return or Space to pick</div>`,
    );
    this.bind('m-play', () => this.showLevels());
    this.bind('m-online', () => (this.host ? this.showHost() : this.showOnline()));
    this.bind('m-howto', () => this.showHowTo(() => this.showMenu()));
    this.bind('m-controls', () => this.showControls(() => this.showMenu()));
    this.bind('m-settings', () => this.showSettings(() => this.showMenu()));
    this.bind('m-credits', () => this.showCredits());
  }

  private bind(id: string, fn: () => void) {
    this.layer.querySelector('#' + id)?.addEventListener('click', fn);
  }

  showLevels() {
    this.startAttract();
    const prog = loadProgress();
    const cards = [...PLAYABLE_LEVELS, ...LEVELS.filter((l) => l.hidden)]
      .map((l, i) => {
        const b = prog[l.id];
        const info = CARGO_INFO[l.cargo];
        const earned = b?.stars ?? 0;
        const stars = [0, 1, 2].map((i) => `<span class="${i < earned ? '' : 'off'}">★</span>`).join('');
        return `<button class="level-card" data-nav ${i === 0 ? 'data-default' : ''} data-level="${l.id}">
          <div class="num">${l.hidden ? 'PRACTICE' : `JOB ${l.order}`}</div>
          <div class="name">${esc(l.name)}</div>
          <div class="cargo">${info.icon} ${esc(info.name)} · ${formatMoney(info.value)}</div>
          <div class="tag">${esc(l.tagline)}</div>
          <div class="best"><span class="stars">${stars}</span><span>${b?.completed ? `${formatMoney(b.bestPayout)} · ${formatTime(b.bestTime ?? 0)}` : b?.attempts ? 'not delivered yet' : 'new job'}</span></div>
        </button>`;
      })
      .join('');
    this.setScreen(
      'levels',
      `<div class="logo" style="font-size:44px">PICK A JOB</div>
       <div class="levels">${cards}</div>
       ${Object.values(prog).some((p) => p?.completed) ? '' : '<div class="hint-line">First time? The <b>Practice Yard</b> is a good place to learn the ropes.</div>'}
       <div class="row"><button class="btn small" data-nav id="l-back">← Back</button></div>`,
      { back: () => this.showMenu() },
    );
    this.layer.querySelectorAll<HTMLElement>('[data-level]').forEach((el) => el.addEventListener('click', () => this.playLevel(el.dataset.level!)));
    this.bind('l-back', () => this.showMenu());
  }

  showHowTo(back: () => void) {
    const b = this.game.keyboard.bindings;
    this.setScreen(
      'howto',
      `<div class="panel" style="max-width:720px">
        <h2>How to move stuff (badly)</h2>
        <p>You and a friend run <b>Fragile Freight</b>. Each job: carry one very breakable, very expensive thing from the start to the <b style="color:#1f9d63">green drop-off zone</b>.</p>
        <h3>🧤 Grabbing</h3>
        <p>Hold <b>GRAB</b> (${keys(b.p1.grab, 'p1')} / ${keys(b.p2.grab, 'p2')}) near something: your arms reach out and your mittens latch on. Let go of the key and you set it down gently (jump to just drop it).</p>
        <p>Heavy cargo needs <b>both</b> of you to lift it. Grab it from opposite sides, then walk together. Loads have weight: they speed up and stop slowly.</p>
        <p>To deliver, <b>set the cargo down</b> inside the green zone and let go.</p>
        <h3>💥 Damage</h3>
        <p>Slow bumps are fine. Drops, slams, and wild swings crack, smash, or squish your cargo. The more condition you keep, the more you get paid.</p>
        <h3>🧭 Finding the way</h3>
        <p>When the next checkpoint (🚩) or the drop-off (🏁) is off screen, an arrow at the edge of the screen points to it.</p>
        <h3>☁️ Falling off</h3>
        <p>Fall off the world and you respawn at the last checkpoint (flags), minus a small payout penalty. Get the cargo to a checkpoint to save progress.</p>
        <h3>🎥 Camera</h3>
        <p>${keys(b.camLeft, '')} ${keys(b.camRight, '')} spin the camera. Movement is relative to the camera. ${keys(b.pause, '')} pauses.</p>
       </div>
       <div class="row"><button class="btn" data-nav data-default id="h-back">Got it</button></div>`,
      { back, dim: true },
    );
    this.bind('h-back', back);
  }

  showControls(back: () => void) {
    const b = this.game.keyboard.bindings;
    const row = (player: 'p1' | 'p2', action: keyof PlayerBindings, label: string) =>
      `<div class="bind-row"><span>${label}</span><span class="keys">${keys(b[player][action], player)}<button class="rebind" data-nav data-p="${player}" data-a="${action}">change</button></span></div>`;
    const col = (player: 'p1' | 'p2', name: string) => `<div class="col"><h3 style="color:${player === 'p1' ? 'var(--p1)' : 'var(--p2)'}">${name}</h3>
      ${row(player, 'up', 'Move up')}${row(player, 'down', 'Move down')}${row(player, 'left', 'Move left')}${row(player, 'right', 'Move right')}${row(player, 'jump', 'Jump')}${row(player, 'grab', 'Grab (hold)')}</div>`;
    this.setScreen(
      'controls',
      `<div class="panel">
        <h2>Controls</h2>
        <div class="controls-grid">${col('p1', 'Player 1 · Orange')}${col('p2', 'Player 2 · Blue')}</div>
        <div class="setting" style="margin-top:10px"><span>Player 2 layout</span><div class="seg" data-p2layouts>${P2_LAYOUTS.map((l) => `<button data-nav data-layout="${l.id}" title="${esc(l.hint)}" class="${same(b.p2.jump, l.jump) && same(b.p2.grab, l.grab) ? 'on' : ''}">${esc(l.name)}</button>`).join('')}</div></div>
        <p style="font-size:14px;margin-top:4px">${esc((P2_LAYOUTS.find((l) => same(b.p2.jump, l.jump) && same(b.p2.grab, l.grab)) ?? { hint: 'Custom keys.' }).hint)}</p>
        <div class="bind-row" style="margin-top:10px"><span>Spin camera</span><span class="keys">${keys(b.camLeft, '')}${keys(b.camRight, '')}<button class="rebind" data-nav data-p="cam" data-a="camLeft">change ⟲</button><button class="rebind" data-nav data-p="cam" data-a="camRight">change ⟳</button></span></div>
        <div class="bind-row"><span>Pause</span><span class="keys">${keys(b.pause, '')}</span></div>
        <h3>Key tester</h3>
        <p>Mac keyboards can't always register every key combo at once ("ghosting"). Both players: hold your keys together here and check they all light up. If one drops out, rebind it.</p>
        <div class="keytest"></div>
       </div>
       <div class="row"><button class="btn small" data-nav id="c-reset">Reset to defaults</button><button class="btn" data-nav data-default id="c-back">Done</button></div>`,
      { back, dim: true },
    );
    this.layer.querySelectorAll<HTMLButtonElement>('button.rebind').forEach((btn) =>
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.listening = { player: btn.dataset.p as 'p1' | 'p2' | 'cam', action: btn.dataset.a!, btn };
        btn.classList.add('listening');
        btn.textContent = 'press a key…';
      }),
    );
    this.bind('c-reset', () => {
      this.game.keyboard.resetBindings();
      this.showControls(back);
    });
    this.layer.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const l = P2_LAYOUTS.find((x) => x.id === btn.dataset.layout)!;
        const kb = this.game.keyboard;
        const p2 = kb.bindings.p2;
        Object.assign(p2, { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], jump: [...l.jump], grab: [...l.grab] });
        takeKeys(kb.bindings, p2, [...p2.up, ...p2.down, ...p2.left, ...p2.right, ...p2.jump, ...p2.grab]);
        kb.saveBindings();
        kb.movedP2 = false;
        this.showControls(back);
      }),
    );
    this.game.keyboard.movedP2 = false;
    this.bind('c-back', back);
  }

  private finishRebind(code: string) {
    const l = this.listening!;
    this.listening = null;
    const kb = this.game.keyboard;
    if (code !== 'Escape') {
      const b = kb.bindings as unknown as Record<string, string[] | Record<string, string[]>>;
      const lists = (b: typeof kb.bindings) => {
        const out: { owner: Record<string, string[]>; action: string }[] = [];
        for (const [k, v] of Object.entries(b)) {
          if (Array.isArray(v)) out.push({ owner: b as unknown as Record<string, string[]>, action: k });
          else for (const a of Object.keys(v)) out.push({ owner: v as unknown as Record<string, string[]>, action: a });
        }
        return out;
      };
      const target = (l.player === 'cam' ? b : b[l.player]) as Record<string, string[]>;
      const old = target[l.action] ?? [];
      // a key does one thing: take it from whatever had it, and swap if that leaves it with none
      for (const { owner, action } of lists(kb.bindings)) {
        if (owner === target && action === l.action) continue;
        if (!owner[action].includes(code)) continue;
        owner[action] = owner[action].filter((c) => c !== code);
        if (!owner[action].length) owner[action] = old.filter((c) => c !== code).slice(0, 1);
      }
      target[l.action] = [code];
      kb.saveBindings();
    }
    const back = this.back ?? (() => this.showMenu());
    this.showControls(back);
  }

  showSettings(back: () => void) {
    const st = this.game.settings;
    const seg = (name: string, opts: [string, string][], cur: string) =>
      `<div class="seg" data-setting="${name}">${opts.map(([v, l]) => `<button data-nav data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    this.setScreen(
      'settings',
      `<div class="panel" style="min-width:min(560px,92vw)">
        <h2>Settings</h2>
        <div class="setting"><span>Graphics</span>${seg('quality', [['low', 'Fast'], ['medium', 'Balanced'], ['high', 'Pretty']], st.quality)}</div>
        <div class="setting"><span>Cargo toughness</span>${seg('damage', [['1', 'Normal'], ['0.5', 'Sturdy'], ['0', 'Unbreakable']], String(st.damage ?? 1))}</div>
        <div class="setting"><span>Screen shake</span>${seg('shake', [['1', 'On'], ['0', 'Off']], st.shake ? '1' : '0')}</div>
        <div class="setting"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" value="${st.master}" data-vol="master"></div>
        <div class="setting"><span>Music</span><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-vol="music"></div>
        <div class="setting"><span>Sound effects</span><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-vol="sfx"></div>
        <p style="margin-top:12px">Running slow in Safari? Pick <b>Fast</b>. Want it bigger? In Safari: <b>View → Enter Full Screen</b>. Developer tuning panel: press <kbd>\`</kbd> any time.</p>
       </div>
       <div class="row"><button class="btn" data-nav data-default id="s-back">Done</button></div>`,
      { back, dim: true },
    );
    this.layer.querySelectorAll<HTMLElement>('.seg').forEach((segEl) => {
      segEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) =>
        btn.addEventListener('click', () => {
          const name = segEl.dataset.setting!;
          const v = btn.dataset.v!;
          if (name === 'quality') {
            st.quality = v as typeof st.quality;
            this.game.renderer.setQuality(st.quality);
          } else if (name === 'damage') {
            st.damage = parseFloat(v);
            tuning.damage.scale = st.damage;
          } else if (name === 'shake') st.shake = v === '1';
          this.game.saveSettings();
          segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
        }),
      );
    });
    this.layer.querySelectorAll<HTMLInputElement>('input[data-vol]').forEach((inp) =>
      inp.addEventListener('input', () => {
        (st as unknown as Record<string, number>)[inp.dataset.vol!] = parseFloat(inp.value);
        this.audio.setVolumes(st.master, st.music, st.sfx);
        this.game.saveSettings();
      }),
    );
    this.bind('s-back', back);
  }

  showCredits() {
    const list = Object.entries(models.manifest.models)
      .filter(([, e]) => e.title)
      .map(
        ([, e]) =>
          `<li><b>${esc(e.title!)}</b> by ${esc(e.author ?? 'unknown')} — <a href="${esc(e.url ?? '#')}" target="_blank" rel="noopener">Sketchfab</a> · ${esc(e.license ?? '')}</li>`,
      )
      .join('');
    this.setScreen(
      'credits',
      `<div class="panel" style="max-width:760px">
        <h2>Credits</h2>
        <p><b>Fragile Freight</b> — made with three.js, Rapier physics and a lot of dropped TVs.</p>
        <p>Font: <b>Fredoka</b> by the Fredoka Project Authors (SIL Open Font License 1.1).</p>
        <h3>3D models (Sketchfab)</h3>
        ${list ? `<ul class="credits-list">${list}</ul>` : '<p>No downloaded models yet — everything is built from primitive shapes.</p>'}
        <p style="font-size:14px">Full list with links: CREDITS.md in the project folder.</p>
       </div>
       <div class="row"><button class="btn" data-nav data-default id="cr-back">Back</button></div>`,
      { back: () => this.showMenu(), dim: true },
    );
    this.bind('cr-back', () => this.showMenu());
  }

  // ------------------------------------------------------------ gameplay

  playLevel(id: string) {
    let def = levelById(id);
    if (!def) return this.showLevels();
    // dev: ?cargo=tv swaps the cargo of any level
    const forced = new URLSearchParams(location.search).get('cargo');
    if (forced) def = { ...def, cargo: forced as typeof def.cargo };
    this.attract = null;
    this.audio.unlock();
    // restart / retry / next job: the old HUD goes with the old session
    this.hud?.dispose();
    const s = this.game.startLevel(def);
    this.wireSession(s);
    this.hud = new Hud(this.hudLayer, this.game, s);
    this.setScreen('playing', '');
    this.audio.music(def.cargo === 'crate' ? 'menu' : 'level');
  }

  private wireSession(s: LevelSession) {
    this.audio.attach(s);
    s.events.on('cargoDamage', () => {
      if (!this.game.settings.shake) s.cameraRig.addShake(-1);
    });
  }

  /** If play stays choppy (real frames per second), suggest Fast graphics once. */
  private watchFrameRate() {
    const p = this.perf;
    const now = performance.now() / 1000;
    if (p.hinted || this.game.manual || this.screen !== 'playing' || this.game.settings.quality === 'low') {
      p.from = 0;
      return;
    }
    if (!p.from) {
      p.from = now + 3; // skip the hitch while a level loads
      p.frames = 0;
    }
    if (now < p.from) return;
    p.frames++;
    if (now - p.from < 5) return;
    if (p.frames / (now - p.from) < 40) {
      p.hinted = true;
      this.hud?.say('Choppy? Press Esc, then Settings → Graphics: Fast.', 8);
    }
    p.from = now;
    p.frames = 0;
  }

  pause() {
    const s = this.game.session;
    if (!s || this.screen !== 'playing') return;
    s.paused = true;
    this.audio.ui('pause');
    this.showPauseMenu();
  }

  private showPauseMenu() {
    const s = this.game.session!;
    this.setScreen(
      'paused',
      `<div class="logo" style="font-size:56px">PAUSED</div>
       <div class="menu">
         <button class="btn primary" data-nav data-default id="p-resume">Resume</button>
         <button class="btn" data-nav id="p-cp" ${s.checkpoint < 0 ? 'disabled' : ''}>Back to checkpoint</button>
         <button class="btn" data-nav id="p-restart">Restart job</button>
         <button class="btn" data-nav id="p-controls">Controls</button>
         <button class="btn" data-nav id="p-settings">Settings</button>
         <button class="btn" data-nav id="p-quit">Quit to menu</button>
       </div>`,
      { dim: true, back: () => this.resume() },
    );
    this.bind('p-resume', () => this.resume());
    this.bind('p-cp', () => {
      s.respawnAll(false);
      this.resume();
    });
    this.bind('p-restart', () => this.playLevel(s.def.id));
    this.bind('p-controls', () => this.showControls(() => this.showPauseMenu()));
    this.bind('p-settings', () => this.showSettings(() => this.showPauseMenu()));
    this.bind('p-quit', () => this.quitToMenu());
  }

  resume() {
    const s = this.game.session;
    if (!s) return;
    s.paused = false;
    this.game.keyboard.clear();
    this.hud?.refreshKeys(); // in case keys were changed from the pause menu
    this.setScreen('playing', '');
  }

  quitToMenu() {
    this.hud?.dispose();
    this.hud = null;
    this.game.endLevel();
    this.showMenu();
  }

  private showResults(r: SessionResult) {
    const s = this.game.session!;
    this.resultsFor = 0;
    const beat = recordResult(r);
    const stars = starsFor(r);
    const def = s.def;
    const nextLevel = PLAYABLE_LEVELS.find((l) => l.order > def.order);
    const verdicts = r.success
      ? r.condition >= 0.97
        ? ['Flawless!', 'Not a scratch. Suspicious.']
        : r.condition >= 0.9
          ? ['Handled with care!', 'The client is delighted.']
          : r.condition >= 0.6
            ? ['Delivered… mostly.', 'Some assembly required.']
            : ['Technically delivered.', 'The client is weeping softly.']
      : ['Total loss!', `The ${r.cargoName.toLowerCase()} did not survive the move.`];
    const row = (label: string, v: string) => `<tr><td>${label}</td><td>${v}</td></tr>`;
    this.setScreen(
      'results',
      `<div class="panel results">
        <div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}" style="animation-delay:${0.15 + i * 0.18}s">★</span>`).join('')}</div>
        <div class="verdict" style="color:${r.success ? 'var(--ink)' : 'var(--bad)'}">${verdicts[0]}</div>
        <p>${verdicts[1]}</p>
        <table>
          ${row('Cargo value', formatMoney(r.value))}
          ${row('Condition', `${Math.round(r.condition * 100)}%`)}
          ${r.success ? row('Time', `${formatTime(r.time)}${beat.time ? '<span class="new-best">NEW BEST</span>' : ''}`) : ''}
          ${r.timeBonus ? row(`Speedy bonus (under ${formatTime(def.parTime)})`, '+' + formatMoney(r.timeBonus)) : ''}
          ${r.falls ? row(`Falls (${r.falls}×)`, '−' + formatMoney(r.penalty)) : ''}
          <tr class="total"><td>Payout</td><td>${formatMoney(r.payout)}${beat.payout ? '<span class="new-best">NEW BEST</span>' : ''}</td></tr>
        </table>
        ${!r.success && (this.game.settings.damage ?? 1) >= 1 ? '<p style="font-size:14px">Too fragile? <b>Settings → Cargo toughness: Sturdy</b> halves the damage.</p>' : ''}
        <div class="row">
          ${r.success && nextLevel ? `<button class="btn primary" data-nav data-default id="r-next">Next job →</button>` : ''}
          <button class="btn ${r.success && nextLevel ? '' : 'primary'}" data-nav ${r.success && nextLevel ? '' : 'data-default'} id="r-retry">${r.success ? 'Play again' : 'Retry'}</button>
          <button class="btn" data-nav id="r-levels">Job list</button>
        </div>
      </div>`,
      { dim: true, back: () => this.showLevels() },
    );
    this.audio.sfx(r.success ? 'payout' : 'fail');
    this.bind('r-next', () => nextLevel && this.playLevel(nextLevel.id));
    this.bind('r-retry', () => this.playLevel(def.id));
    this.bind('r-levels', () => {
      this.hud?.dispose();
      this.hud = null;
      this.showLevels();
    });
  }

  // ------------------------------------------------------------ online

  /** Host or join. */
  showOnline() {
    this.startAttract();
    this.setScreen(
      'online',
      `<div class="logo" style="font-size:44px">PLAY ONLINE</div>
       <div class="panel" style="max-width:min(640px,92vw)">
         <p>Each of you plays on your <b>own laptop</b> (a Chromebook is fine). One of you <b>hosts</b>: the game runs on that laptop. The other <b>joins</b> with a code.</p>
         <p style="font-size:14px">Free, no accounts. Works on home and school Wi-Fi: if the network won't let the laptops connect directly, the game passes its messages through the matchmaking server instead. The faster laptop should host.</p>
       </div>
       <div class="menu">
         <button class="btn primary" data-nav data-default id="o-host">Host a game</button>
         <button class="btn" data-nav id="o-join">Join a friend</button>
         <button class="btn small" data-nav id="o-back">← Back</button>
       </div>`,
      { back: () => this.showMenu() },
    );
    this.bind('o-host', () => this.showHost());
    this.bind('o-join', () => {
      this.joinCode = '';
      this.showJoin('');
    });
    this.bind('o-back', () => this.showMenu());
  }

  /** How the friend is connected, in words. */
  private viaText(via: 'direct' | 'relay' | null, video = false) {
    if (via === 'direct') return video ? 'connected directly · streaming the picture' : 'connected directly';
    if (via === 'relay') return 'connected through the relay (a little slower)';
    return 'connecting…';
  }

  /** The host's lobby: the code to share, and whether the friend is in. */
  private showHost(error = '') {
    this.startAttract();
    const h = this.host;
    const code = h ? h.code.split('').map((c) => `<span>${c}</span>`).join('') : '<span>·</span>'.repeat(CODE_LEN);
    const status = error
      ? `<span style="color:var(--bad)">${esc(error)}</span>`
      : !h
        ? 'Getting a code…'
        : h.connected
          ? `✅ <b>Your friend is in!</b> Pick a job. <span style="font-size:14px;opacity:.75">(${this.viaText(h.via, h.mode === 'video')})</span>`
          : h.status === 'connecting'
            ? 'Your friend is connecting…'
            : 'Waiting for your friend…';
    this.setScreen(
      'host',
      `<div class="logo" style="font-size:44px">HOSTING</div>
       <div class="panel" style="text-align:center;max-width:min(640px,92vw)">
         <p>Your game code</p>
         <div class="net-code">${code}</div>
         <p class="net-status">${status}</p>
         <p style="font-size:14px">On your friend's laptop: open Fragile Freight → <b>Play Online</b> → <b>Join a friend</b> → type the code.<br>
         You're <b style="color:var(--p1)">P1</b> and they're <b style="color:var(--p2)">P2</b>. You can each use <b>WASD</b> or the <b>arrows</b>, whichever you like. You pick the jobs.</p>
       </div>
       <div class="row">
         ${error ? '<button class="btn primary" data-nav data-default id="h-retry">Try again</button>' : '<button class="btn primary" data-nav data-default id="h-play">Pick a job →</button>'}
         <button class="btn" data-nav id="h-stop">${h ? 'Stop hosting' : 'Cancel'}</button>
       </div>`,
      { back: () => this.showMenu() },
    );
    this.bind('h-play', () => this.showLevels());
    this.bind('h-retry', () => this.showHost());
    this.bind('h-stop', () => {
      this.stopHosting();
      this.showMenu();
    });
    if (!h && !error && !this.joining) {
      this.joining = true;
      OnlineHost.start({ canvas: this.game.renderer.renderer.domElement, ui: this.root, menus: this.layer }).then(
        (host) => {
          this.joining = false;
          // gave up waiting (went back to the menu): don't keep a code nobody can see
          if (this.screen !== 'host') return host.stop();
          this.host = host;
          host.onChange = (what) => this.hostChanged(what);
          host.onPauseRequest = () => this.pause();
          this.game.afterRender = () => host.copyFrame();
          this.updateBadge();
          this.showHost();
        },
        (e) => {
          this.joining = false;
          if (this.screen === 'host') this.showHost(e instanceof Error ? e.message : String(e));
        },
      );
    }
  }

  private hostChanged(what: 'joined' | 'left' | 'status') {
    const h = this.host;
    if (!h) return;
    const on = h.connected;
    this.game.onlineP2 = on;
    // while a friend is in: our keys (either layout) drive P1, theirs drive P2
    this.game.input = on
      ? {
          player: (i) => {
            if (i === 1) return h.input();
            const b = this.game.keyboard.bindings;
            return mergeMoves(this.game.keyboard.readPlayer(b.p1), this.game.keyboard.readPlayer(b.p2));
          },
          cam: () => h.cam(),
        }
      : null;
    if (this.game.session) this.game.session.input = this.game.input;
    // streaming the picture: keep it at most 1600 px wide so it's cheap to capture
    this.game.renderer.capWidth = on && h.mode === 'video' ? 1600 : null;
    this.game.renderer.resize();
    this.hud?.refreshKeys();
    this.updateBadge();
    if (what === 'joined') this.toast('🌐 Your friend joined!');
    if (what === 'left') {
      this.toast('Your friend disconnected. They can join again with the same code.');
      this.pause();
    }
    if (this.screen === 'host') this.showHost();
    if (this.screen === 'menu') this.showMenu();
  }

  private stopHosting() {
    if (!this.host) return;
    this.host.send({ k: 'bye' });
    this.host.stop();
    this.host = null;
    this.game.afterRender = null;
    this.game.onlineP2 = false;
    this.game.input = null;
    if (this.game.session) this.game.session.input = null;
    this.game.renderer.capWidth = null;
    this.game.renderer.resize();
    this.hud?.refreshKeys();
    this.updateBadge();
  }

  /** A small line in the corner saying what's going on online (not copied to the guest). */
  private updateBadge(text?: string) {
    const h = this.host;
    const t =
      text ??
      (h ? (h.connected ? `🌐 Online · your friend is P2 · ${this.viaText(h.via, h.mode === 'video')}` : `🌐 Hosting · code ${h.code} · waiting for your friend`) : '');
    if (!t) {
      this.netBadge?.remove();
      this.netBadge = null;
      return;
    }
    if (!this.netBadge) {
      this.netBadge = document.createElement('div');
      this.netBadge.className = 'net-badge';
      document.body.appendChild(this.netBadge);
    }
    this.netBadge.textContent = t;
  }

  private toast(text: string) {
    const d = document.createElement('div');
    d.className = 'toast net-toast';
    d.textContent = text;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 4000);
  }

  /** Typing the code: letters and digits type, Backspace deletes, Return joins. */
  private typeCode(code: string, e: KeyboardEvent) {
    if (this.joining) return code !== 'Escape';
    const m = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(code);
    if (m) {
      e.preventDefault();
      if (this.joinCode.length < CODE_LEN) this.joinCode += m[1] ?? m[2] ?? m[3];
      this.updateJoin('');
      return true;
    }
    if (code === 'Backspace') {
      e.preventDefault();
      this.joinCode = this.joinCode.slice(0, -1);
      this.updateJoin('');
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      e.preventDefault();
      this.join();
      return true;
    }
    return false;
  }

  private codeBoxes() {
    return Array.from({ length: CODE_LEN }, (_, i) => `<span class="${i === this.joinCode.length ? 'cursor' : ''}">${this.joinCode[i] ?? ''}</span>`).join('');
  }

  /** Update the join screen in place (rebuilding it would replay its fade-in on every key). */
  private updateJoin(status: string, bad = false) {
    const box = this.layer.querySelector('.net-code');
    const st = this.layer.querySelector<HTMLElement>('.net-status');
    const go = this.layer.querySelector<HTMLButtonElement>('#j-go');
    if (this.screen !== 'join' || !box || !st || !go) return this.showJoin(status, bad);
    box.innerHTML = this.codeBoxes();
    st.textContent = status || ' ';
    st.style.color = bad ? 'var(--bad)' : '';
    go.disabled = this.joinCode.length !== CODE_LEN || this.joining;
  }

  private showJoin(status: string, bad = false) {
    this.startAttract();
    const boxes = this.codeBoxes();
    this.setScreen(
      'join',
      `<div class="logo" style="font-size:44px">JOIN A FRIEND</div>
       <div class="panel" style="text-align:center;max-width:min(640px,92vw)">
         <p>Type the code on your friend's screen</p>
         <div class="net-code entry">${boxes}</div>
         <p class="net-status" ${bad ? 'style="color:var(--bad)"' : ''}>${esc(status) || '&nbsp;'}</p>
         <p style="font-size:14px">Their laptop runs the game; yours shows it. You're <b style="color:var(--p2)">P2</b>: move with <b>WASD</b> or the <b>arrows</b>, whichever you like. <kbd>Esc</kbd> for the online menu.</p>
       </div>
       <div class="row">
         <button class="btn primary" data-nav data-default id="j-go" ${this.joinCode.length === CODE_LEN && !this.joining ? '' : 'disabled'}>Join</button>
         <button class="btn small" data-nav id="j-back">← Back</button>
       </div>`,
      { back: () => (this.joining ? undefined : this.showOnline()) },
    );
    this.bind('j-go', () => this.join());
    this.bind('j-back', () => !this.joining && this.showOnline());
    // pasting a code works too
    this.layer.querySelector('.net-code')?.addEventListener('click', () => navigator.clipboard?.readText?.().then((t) => this.pasteCode(t)).catch(() => {}));
  }

  private onPaste = (e: ClipboardEvent) => {
    if (this.screen === 'join' && !this.joining) this.pasteCode(e.clipboardData?.getData('text') ?? '');
  };

  private pasteCode(t: string) {
    const c = t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
    if (!c) return;
    this.joinCode = c;
    this.updateJoin('');
  }

  private join() {
    if (this.joining || this.joinCode.length !== CODE_LEN) return;
    this.joining = true;
    this.updateJoin('Looking for your friend’s game…');
    OnlineGuest.join(this.joinCode, (msg) => this.screen === 'join' && this.updateJoin(msg)).then(
      (g) => {
        this.joining = false;
        if (this.screen !== 'join') return g.leave();
        this.enterGuest(g);
      },
      (e) => {
        this.joining = false;
        if (this.screen === 'join') this.updateJoin(e instanceof Error ? e.message : String(e), true);
      },
    );
  }

  /** Become the guest: show the host's game (drawn here, or streamed), copy its menus, send our keys. */
  private enterGuest(g: OnlineGuest) {
    this.guest = g;
    this.game.onlineGuest = true;
    // our own menus (Esc) move above everything the host sends
    this.localUi = document.createElement('div');
    this.localUi.className = 'net-local';
    this.localUi.append(this.layer);
    document.body.appendChild(this.localUi);
    // the host's menus (light mode) go here, over our own view of the level
    this.menuMirror = document.createElement('div');
    this.menuMirror.className = 'net-menus';
    this.root.append(this.menuMirror);
    this.fitGuest = () => this.fitVideoUi();
    window.addEventListener('resize', this.fitGuest);
    g.onStream = (s) => {
      if (this.video) {
        this.video.srcObject = s;
        this.video.play().catch(() => {});
      }
    };
    g.onUi = (html, all) => {
      if (all !== (g.mode === 'video')) return; // from before a mode switch
      if (all) {
        morph(this.root, html);
        this.fitVideoUi();
      } else if (this.menuMirror) morph(this.menuMirror, html);
    };
    g.onLevel = (m) => this.guestLevel(m);
    g.onEnd = () => this.guestEnd();
    g.onMode = (m) => this.presentGuest(m);
    g.onVia = () => this.updateBadge(this.guestBadge());
    g.onLost = (why) => this.showGuestLost(why);
    this.pictureTimer = window.setInterval(() => this.video && this.guest?.checkPicture(this.video), 2000);
    this.setScreen('guest', '');
    this.presentGuest(g.mode);
  }

  private menuMirror: HTMLDivElement | null = null;

  private guestBadge() {
    const g = this.guest;
    if (!g) return '';
    return `🌐 On your friend's game · ${this.viaText(g.via, g.mode === 'video')} · Esc: online menu`;
  }

  /** Show the host's game the way the current mode says: drawn here (light) or streamed (video). */
  private presentGuest(mode: 'light' | 'video') {
    const g = this.guest;
    if (!g) return;
    const canvas = this.game.renderer.renderer.domElement;
    if (mode === 'video') {
      // stop drawing anything ourselves
      this.endGuestLevel();
      this.attract = null;
      this.game.endLevel();
      this.game.halted = true;
      canvas.style.visibility = 'hidden';
      if (!this.video) {
        const v = document.createElement('video');
        v.className = 'net-video';
        v.muted = true;
        v.autoplay = true;
        v.playsInline = true;
        document.body.insertBefore(v, this.root);
        this.video = v;
      }
      if (g.stream) {
        this.video.srcObject = g.stream;
        this.video.play().catch(() => {});
      }
      this.hudLayer.remove();
      this.menuMirror?.remove();
      this.root.innerHTML = '';
      if (g.ui?.all) {
        morph(this.root, g.ui.html);
        this.fitVideoUi();
      }
    } else {
      this.video?.remove();
      this.video = null;
      this.root.innerHTML = '';
      this.root.removeAttribute('style');
      this.root.append(this.hudLayer, this.menuMirror ?? document.createElement('div'));
      if (this.menuMirror) this.menuMirror.innerHTML = '';
      canvas.style.visibility = '';
      this.game.halted = false;
      if (g.lastLevel) this.guestLevel(g.lastLevel);
      else this.guestEnd();
      if (g.ui && !g.ui.all && this.menuMirror) morph(this.menuMirror, g.ui.html);
    }
    this.updateBadge(this.guestBadge());
  }

  /** Video mode: the copy of the host's whole UI sits exactly over the video. */
  private fitVideoUi() {
    const u = this.guest?.ui;
    if (!u || !u.all || this.guest?.mode !== 'video') return;
    const s = Math.min(window.innerWidth / u.w, window.innerHeight / u.h);
    Object.assign(this.root.style, {
      inset: 'auto',
      left: `${(window.innerWidth - u.w * s) / 2}px`,
      top: `${(window.innerHeight - u.h * s) / 2}px`,
      width: `${u.w}px`,
      height: `${u.h}px`,
      transform: `scale(${s})`,
      transformOrigin: '0 0',
    });
  }

  /** Light mode: the host started a level; build the same one here and follow along. */
  private guestLevel(m: LevelMsg) {
    const g = this.guest;
    if (!g || g.mode !== 'light') return;
    let def = (m.def as LevelDef | undefined) ?? levelById(m.id);
    if (!def) {
      this.toast('Your friend started a job this copy of the game doesn’t have. You both need the same file.');
      return;
    }
    if (m.cargo && m.cargo !== def.cargo) def = { ...def, cargo: m.cargo as LevelDef['cargo'] };
    this.endGuestLevel();
    this.attract = null;
    const s = this.game.startLevel(def);
    const sync = new GuestSync(s);
    s.mirror = sync;
    g.attachSync(sync);
    this.wireSession(s);
    this.hud = new Hud(this.hudLayer, this.game, s);
  }

  /** Light mode: the host is back in the menus. */
  private guestEnd() {
    this.endGuestLevel();
    if (this.guest?.mode === 'light') this.startAttract();
  }

  private endGuestLevel() {
    this.guest?.attachSync(null);
    this.hud?.dispose();
    this.hud = null;
    if (this.game.session?.mirror) this.game.endLevel();
  }

  private fitGuest: (() => void) | null = null;
  private pictureTimer = 0;

  private showGuestMenu() {
    const g = this.guest;
    if (!g) return;
    const video = g.mode === 'video';
    this.setScreen(
      'guest-menu',
      `<div class="logo" style="font-size:48px">ONLINE</div>
       <div class="menu">
         <button class="btn primary" data-nav data-default id="g-back">Keep playing</button>
         <button class="btn" data-nav id="g-pause">Pause the game</button>
         <button class="btn" data-nav id="g-mode" ${video || g.canVideo ? '' : 'disabled'}>${video ? 'Picture: draw it on this laptop' : 'Picture: stream it from my friend'}</button>
         <button class="btn" data-nav id="g-leave">Leave</button>
       </div>
       <div class="hint-line">${esc(this.viaText(g.via, video))}. ${
         video
           ? 'Streaming suits a slow laptop on a fast network.'
           : g.canVideo
             ? 'Laptop struggling? Streaming the picture is easier on it.'
             : 'Streaming the picture needs a direct connection (this network doesn’t allow one).'
       }<br>Your friend picks the jobs and runs the pause menu.</div>`,
      { dim: true, back: () => this.setScreen('guest', '') },
    );
    this.bind('g-back', () => this.setScreen('guest', ''));
    this.bind('g-pause', () => {
      this.guest?.requestPause();
      this.setScreen('guest', '');
    });
    this.bind('g-mode', () => {
      this.guest?.requestMode(video ? 'light' : 'video');
      this.setScreen('guest', '');
    });
    this.bind('g-leave', () => this.leaveGuest());
  }

  private showGuestLost(why: string) {
    const text = why === 'left' ? 'Your friend stopped hosting.' : 'Lost the connection to your friend’s game.';
    this.setScreen(
      'guest-lost',
      `<div class="panel" style="text-align:center">
         <h2>Disconnected</h2>
         <p>${text}</p>
         <p style="font-size:14px">To play again, join with the code on their screen.</p>
       </div>
       <div class="row"><button class="btn primary" data-nav data-default id="gl-ok">Back to menu</button></div>`,
      { dim: true, back: () => this.leaveGuest() },
    );
    this.bind('gl-ok', () => this.leaveGuest());
  }

  private leaveGuest() {
    const g = this.guest;
    if (!g) return;
    this.endGuestLevel();
    this.guest = null;
    this.game.onlineGuest = false;
    g.leave();
    clearInterval(this.pictureTimer);
    if (this.fitGuest) window.removeEventListener('resize', this.fitGuest);
    this.fitGuest = null;
    this.video?.remove();
    this.video = null;
    this.menuMirror?.remove();
    this.menuMirror = null;
    this.root.innerHTML = '';
    this.root.removeAttribute('style');
    this.root.append(this.hudLayer, this.layer);
    this.localUi?.remove();
    this.localUi = null;
    this.game.renderer.renderer.domElement.style.visibility = '';
    this.game.halted = false;
    this.updateBadge();
    this.showMenu();
  }

  toggleDev() {
    if (!this.dev) this.dev = new DevPanel(this.game);
    else this.dev.toggle();
  }
}

function keys(codes: string[], cls: string) {
  return codes.map((c) => `<kbd class="${cls}">${esc(keyLabel(c))}</kbd>`).join('');
}

export { PLAYER_COLORS };

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
