import type { Game } from '../game/Game';
import { LevelSession, SessionResult, PLAYER_COLORS } from '../game/LevelSession';
import { LEVELS, PLAYABLE_LEVELS, levelById } from '../levels';
import { Hud } from './Hud';
import { keyLabel, PlayerBindings } from '../config/bindings';
import { loadProgress, recordResult, starsFor, totalEarnings } from '../game/progress';
import { formatMoney, formatTime } from '../util/math';
import { models } from '../render/models';
import { AudioEngine } from '../audio/AudioEngine';
import { DevPanel } from './DevPanel';
import { tuning } from '../config/tuning';
import { Attract } from '../game/Attract';
import { CARGO_INFO } from '../entities/cargo/info';

type Screen = 'title' | 'menu' | 'levels' | 'controls' | 'settings' | 'credits' | 'playing' | 'paused' | 'results' | 'howto';

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

  constructor(
    private game: Game,
    root: HTMLElement,
  ) {
    this.hudLayer = document.createElement('div');
    this.layer = document.createElement('div');
    root.append(this.hudLayer, this.layer);
    this.audio.setVolumes(game.settings.master, game.settings.music, game.settings.sfx);
    tuning.damage.scale = game.settings.damage ?? 1;
    game.keyboard.onKey = (code, e) => this.onKey(code, e);
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: false });
    game.onFrame = (dt) => this.frame(dt);
    // switching to another app or tab pauses, rather than leaving the movers standing in traffic
    window.addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
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
    // menu navigation
    const prev = ['ArrowUp', 'KeyW', 'ArrowLeft', 'KeyA'];
    const next = ['ArrowDown', 'KeyS', 'ArrowRight', 'KeyD'];
    const ok = ['Enter', 'Space', 'NumpadEnter'];
    if (prev.includes(code) || next.includes(code)) {
      if (!this.focusables.length) return;
      e.preventDefault();
      this.focusIndex = (this.focusIndex + (prev.includes(code) ? -1 : 1) + this.focusables.length) % this.focusables.length;
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
    this.watchFrameRate();
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
       <div class="hint-line">A goofy 2-player moving company · one keyboard, two movers</div>`,
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
         <button class="btn" data-nav id="m-howto">How to Play</button>
         <button class="btn" data-nav id="m-controls">Controls</button>
         <button class="btn" data-nav id="m-settings">Settings</button>
         <button class="btn" data-nav id="m-credits">Credits</button>
       </div>
       <div class="hint-line">${earned > 0 ? `Company earnings so far: <b>${formatMoney(earned)}</b> · ` : ''}Navigate with arrows / WASD · Return or Space to pick</div>`,
    );
    this.bind('m-play', () => this.showLevels());
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
    this.bind('c-back', back);
  }

  private finishRebind(code: string) {
    const l = this.listening!;
    this.listening = null;
    const kb = this.game.keyboard;
    if (code !== 'Escape') {
      if (l.player === 'cam') (kb.bindings as unknown as Record<string, string[]>)[l.action] = [code];
      else kb.bindings[l.player][l.action as keyof PlayerBindings] = [code];
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
        <p style="margin-top:12px">Running slow in Safari? Pick <b>Fast</b>. Developer tuning panel: press <kbd>\`</kbd> any time.</p>
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

  toggleDev() {
    if (!this.dev) this.dev = new DevPanel(this.game);
    else this.dev.toggle();
  }
}

function keys(codes: string[], cls: string) {
  return codes.map((c) => `<kbd class="${cls}">${esc(keyLabel(c))}</kbd>`).join('');
}

export { PLAYER_COLORS };
