import * as THREE from 'three';
import type { Game } from '../game/Game';
import { LevelSession, SessionResult, PLAYER_COLORS } from '../game/LevelSession';
import { Buddy } from '../game/Buddy';
import { hasRival, RivalCrew, RIVAL_PACES, type RivalPace } from '../game/rival';
import { quickMatch, RaceLink, type RaceMsg } from '../net/race';
import { boardKey, boardName, cleanName, formatRunTime, localBoard, playerId, postRun, recordRun, setBoardName, worldBoard, type BoardEntry, type CrewMode } from '../game/board';
import { LEVELS, PLAYABLE_LEVELS, levelById } from '../levels';
import { Hud } from './Hud';
import { keyLabel, PlayerBindings, P2_LAYOUTS } from '../config/bindings';
import { takeKeys } from '../input/Keyboard';
import { loadProgress, recordResult, starsFor } from '../game/progress';
import { formatMoney, formatTime } from '../util/math';
import { models } from '../render/models';
import { AudioEngine } from '../audio/AudioEngine';
import { DevPanel } from './DevPanel';
import { tuning } from '../config/tuning';
import { Attract } from '../game/Attract';
import { CARGO_INFO } from '../entities/cargo/info';
import { CODE_LEN, LevelMsg, mergeMoves, OnlineGuest, OnlineHost } from '../net/Online';
import { GuestSync } from '../net/sync';
import type { GenParams, LevelDef, Variant } from '../levels/types';
import { goalId, goalMet, goalText, rollVariant, withVariant } from '../levels/variants';
import { dailySeed, generateJob, hashSeed, randomSeed, TWISTS } from '../levels/gen/generate';
import { loadJSON, saveJSON } from '../util/storage';
import { morph } from '../net/mirror';
import { checkNetwork, checkSummary, type CheckItem } from '../net/check';
import { activeOutfits, addCash, buy, claimQuests, companyRank, emoteLines, ITEMS, RANKS, loadStats, loadWardrobe, owns, QUESTS, rewardOf, setActiveOutfits, setGuestOutfit, setJobCount, SLOTS, track, wear, type Payday, type Slot } from '../game/outfits';
import { ALL_CHAOS, CHAOS_LEVELS, chaosLevel } from '../game/chaos';
import { bestBeaten, CPU_NAMES, CPU_PRIZE, LENGTH_NAMES, PARTY_GAMES, partyInfo, partyRecord, recordParty, type PartyLength } from '../game/party';
import { chaosDaily, dailyNumber, dailyTwist, lastWeek, recordDaily, shareText, streak, StretchTracker, todaysResult, triesToday, untilNext } from '../game/daily';

type Screen =
  | 'title'
  | 'menu'
  | 'levels'
  | 'controls'
  | 'settings'
  | 'credits'
  | 'boards'
  | 'boardname'
  | 'versus'
  | 'racewait'
  | 'racejoin'
  | 'playing'
  | 'paused'
  | 'results'
  | 'howto'
  | 'online'
  | 'host'
  | 'join'
  | 'guest'
  | 'guest-menu'
  | 'guest-lost'
  | 'jobnum'
  | 'netcheck'
  | 'play'
  | 'quick'
  | 'locker'
  | 'chaos'
  | 'party';

/** The developer tuning panel (backquote) only with ?dev in the address. */
const DEV = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');

/** Bump to show the main menu's "New:" line again after an update. */
const NEWS = 'build10';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** All the DOM UI: screens, menus, HUD, and the glue to the game. */
export class App {
  screen: Screen = 'title';
  private netCheckRun = 0;
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
  /** What's being played: a hand-made job, or a generated one (and how it came about). */
  private job: Job | null = null;
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
    setJobCount(PLAYABLE_LEVELS.length);
    this.audio.setVolumes(game.settings.master, game.settings.music, game.settings.sfx);
    tuning.damage.scale = game.settings.damage ?? 1;
    game.keyboard.onKey = (code, e) => this.onKey(code, e);
    game.touch.onMenu = () => (this.guest ? this.showGuestMenu() : this.pause());
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
    if (s !== 'locker' && this.viewing) this.lockerView(null);
    // the same screen drawn again (something on it changed): no pop-in, and lists stay scrolled where they were
    const again = s === this.screen && !!this.layer.firstElementChild;
    const scrolled = again ? [...this.layer.querySelectorAll<HTMLElement>('.items, .quests, .levels, .hub')].map((e) => e.scrollTop) : [];
    this.screen = s;
    this.layer.innerHTML = html ? `<div class="screen ${opts.dim ? 'dim' : ''} ${again ? 'still' : ''}">${html}</div>` : '';
    if (again) this.layer.querySelectorAll<HTMLElement>('.items, .quests, .levels, .hub').forEach((e, i) => (e.scrollTop = scrolled[i] ?? 0));
    this.back = opts.back ?? null;
    this.game.touch.show(this.touchShow()); // (at once: the controls mustn't sit over a menu for a frame)
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
    // grids of cards (the job list, the Locker's items)
    const grid = ['level-card', 'item-card'].find((c) => el?.classList.contains(c));
    if (!vertical || !grid) return 1;
    const cards = this.focusables.filter((c) => c.classList.contains(grid));
    const cols = cards.filter((c) => c.offsetTop === cards[0].offsetTop).length;
    const i = cards.indexOf(el);
    const up = code === 'ArrowUp' || code === 'KeyW';
    // from the top row, up stays put; from the bottom row, down goes on to Back
    if (up) return i >= cols ? cols : 0;
    return i + cols < cards.length ? cols : cards.length - i;
  }

  /** Number keys say things: 1–4 for P1, 7–0 for P2 (unless they've been bound to something). */
  private emoteKey(code: string): { player: number; kind: number } | null {
    const m = /^Digit([0-9])$/.exec(code);
    if (!m) return null;
    const b = this.game.keyboard.bindings as unknown as Record<string, string[] | Record<string, string[]>>;
    const bound = Object.values(b).some((v) => (Array.isArray(v) ? v.includes(code) : Object.values(v).some((l) => l.includes(code))));
    if (bound) return null;
    const d = Number(m[1]);
    if (d >= 1 && d <= 4) return { player: 0, kind: d - 1 };
    if (d >= 7 || d === 0) return { player: 1, kind: d === 0 ? 3 : d - 7 };
    return null;
  }

  private emoteAt = [0, 0];
  /** At most one emote a half-second per player. */
  private emoteReady(player: number) {
    const now = performance.now();
    if (now - this.emoteAt[player] < 500) return false;
    this.emoteAt[player] = now;
    return true;
  }

  /** A mover says something over its head (on the host it's sent on to the guest with the other events). */
  private emote(player: number, kind: number) {
    const s = this.game.session;
    if (!s || s.mirror || !this.emoteReady(player)) return;
    // (in that mover's own emote pack, from the Locker)
    s.events.emit('emote', { player, kind, text: emoteLines(s.outfits[player]?.emotes)[kind] });
  }

  private focusById(id: string) {
    const i = this.focusables.findIndex((el) => el.id === id);
    if (i >= 0) {
      this.focusIndex = i;
      this.updateFocus();
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
    // the tuning panel is for developers only (?dev in the address)
    if (DEV && b.dev.includes(code)) {
      this.toggleDev();
      return;
    }
    if (this.screen === 'join' && this.typeCode(code, e)) return;
    if (this.screen === 'jobnum' && this.typeJobNumber(code, e)) return;
    if (this.screen === 'boardname' && this.typeName(e)) return;
    if (this.screen === 'racejoin' && this.typeRaceCode(e)) return;
    if (this.screen === 'guest') {
      if (b.pause.includes(code)) this.showGuestMenu();
      else if (b.p1.jump.includes(code) || b.p2.jump.includes(code)) this.guest?.tapJump();
      else if (this.emoteKey(code) && this.emoteReady(1)) this.guest?.emote(this.emoteKey(code)!.kind);
      return;
    }
    if (this.screen === 'title') {
      this.audio.ui('select');
      this.showMenu();
      return;
    }
    if (this.screen === 'playing') {
      if (b.pause.includes(code)) this.pause();
      else {
        const k = this.emoteKey(code);
        // online, this laptop's player is P1; on one keyboard 1–4 is P1 and 7–0 is P2
        if (k) this.emote(this.game.onlineP2 ? 0 : k.player, k.kind);
      }
      return;
    }
    if (this.screen === 'paused' && b.pause.includes(code)) {
      this.resume();
      return;
    }
    if (this.screen === 'results' && this.game.session?.result && !this.focusables.length) return;
    // jump keys double as "select": don't let a last mashed jump skip the results card
    if (this.screen === 'results' && this.resultsFor < 1.2) return;
    // a focused slider takes left and right
    const sl = this.focusables[this.focusIndex];
    if (sl?.hasAttribute('data-slider') && this.sliderStep && ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(code)) {
      e.preventDefault();
      this.sliderStep(code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1);
      return;
    }
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

  private badgeT = 0;

  private frame(dt: number) {
    this.game.touch.show(this.touchShow());
    this.game.touch.setSolo(!!this.game.session?.buddy && this.screen === 'playing');
    // keep the online line's round-trip time fresh (and say so soon if the other laptop goes quiet)
    this.badgeT -= dt;
    if (this.badgeT <= 0) {
      this.badgeT = 1;
      if (this.guest) this.updateBadge(this.guestBadge());
      else if (this.host?.connected) this.updateBadge();
    }
    const g = this.guest;
    if (g) {
      const s = this.game.session;
      if (g.mode === 'light') {
        this.attract?.update(dt);
        if (s?.mirror && this.hud) {
          this.hud.update(dt);
          this.watchGuestFrameRate();
        }
      }
      return;
    }
    if (this.host) {
      // the host only shares real jobs, not the menu's background scene
      this.host.level = this.attract ? null : this.game.session;
      this.host.update(dt);
    }
    this.watchFrameRate();
    this.raceFrame(dt);
    if (this.screen === 'results') this.resultsFor += dt;
    this.attract?.update(dt);
    const s = this.game.session;
    if (s && this.hud && (this.screen === 'playing' || this.screen === 'paused')) this.hud.update(dt);
    if (s && this.stretches && this.screen === 'playing') {
      const c = s.cargo.body.translation();
      this.stretches.update(c.x, c.z, s.cargo.health);
    }
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

  /** Phones and tablets: the on-screen controls in a job, just the menu button on the online guest's screen otherwise. */
  private touchShow() {
    if (this.screen === 'playing') return 'play';
    const g = this.guest;
    if (!g || this.screen !== 'guest') return 'off';
    // the guest is in a job when its HUD is up, and the host isn't showing a menu over it
    const job = g.mode === 'light' ? !!this.game.session?.mirror && !this.menuMirror?.firstElementChild : !!this.root.querySelector('.hud') && !this.root.querySelector('.screen');
    return job ? 'play' : 'menu';
  }

  /** How to open the menu, in a hint. */
  private escWord() {
    return this.game.touch.active ? 'Tap ❚❚' : 'Press Esc';
  }

  // ------------------------------------------------------------ screens

  showTitle() {
    this.startAttract();
    this.setScreen(
      'title',
      `<div class="logo" style="font-size:clamp(54px,11vw,140px)"><span class="w fragile">FRAGILE</span><br><span class="w freight" style="animation-delay:-1.3s">FREIGHT</span></div>
       <div class="press-start">${this.game.touch.active ? 'Tap to start' : 'Press any key'}</div>
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
    this.setScreen(
      'menu',
      `<div class="logo" style="font-size:clamp(40px,6vw,74px)"><span class="w fragile">FRAGILE</span> <span class="w freight" style="animation-delay:-1.3s">FREIGHT</span></div>
       <div class="menu">
         <button class="btn primary" data-nav data-default id="m-play">Play</button>
         <button class="btn" data-nav id="m-locker">👕 Locker${loadWardrobe().cash > 0 ? ` <span class="cash">${formatMoney(loadWardrobe().cash)}</span>` : ''}</button>
         <button class="btn" data-nav id="m-online">${this.host ? `Online: ${this.host.connected ? 'friend connected' : 'hosting'}` : 'Play Online'}</button>
       </div>
       <div class="row menu-small">
         <button class="btn small" data-nav id="m-howto">How to Play</button>
         <button class="btn small" data-nav id="m-controls">Controls</button>
         <button class="btn small" data-nav id="m-settings">Settings</button>
         <button class="btn small" data-nav id="m-credits">Credits</button>
       </div>
       ${this.menuNudge()}
       ${this.game.keyboard.movedP2 ? '<div class="hint-line" style="color:var(--ink)"><b>New for Player 2:</b> arrows to move, <b>K</b> to jump, <b>L</b> to grab. Other layouts are under Controls.</div>' : ''}
       <div class="hint-line">${(() => {
         const cr = companyRank();
         return cr.earned > 0 ? `${cr.rank.icon} ${cr.rank.name} · ` : '';
       })()}Navigate with arrows / WASD · Return or Space to pick</div>`,
    );
    this.bind('m-play', () => this.showPlay());
    this.bind('m-locker', () => this.showLocker());
    this.bind('m-nudge', () => {
      saveJSON('ff.news', NEWS);
      this.showPlay();
    });
    this.bind('m-online', () => (this.host ? this.showHost() : this.showOnline()));
    this.bind('m-howto', () => this.showHowTo(() => this.showMenu()));
    this.bind('m-controls', () => this.showControls(() => this.showMenu()));
    this.bind('m-settings', () => this.showSettings(() => this.showMenu()));
    this.bind('m-credits', () => this.showCredits());
  }

  /** One line under the main menu: what's new in this version (a few times), or today's job if it's not done yet. */
  private menuNudge() {
    const seen = loadJSON<string>('ff.news');
    const shown = loadJSON<number>('ff.newsShown') ?? 0;
    const played = Object.values(loadProgress()).some((p) => p?.completed);
    // (brand-new players get the START HERE ribbon instead)
    if (played && seen !== NEWS && shown < 4) {
      saveJSON('ff.newsShown', shown + 1);
      return `<button class="nudge" data-nav id="m-nudge">✨ <b>New:</b> 💥 Chaos jobs · 👕 the Locker · 📅 Daily streaks · 💵 tips</button>`;
    }
    if (played && !todaysResult()?.delivered) {
      const st = streak();
      return `<button class="nudge" data-nav id="m-nudge">📅 <b>Daily #${dailyNumber()}</b> is waiting${st.current ? ` · 🔥 keep your ${st.current}-day streak` : ''}</button>`;
    }
    return '';
  }

  private bind(id: string, fn: () => void) {
    this.layer.querySelector('#' + id)?.addEventListener('click', fn);
  }

  /** Play: a few big choices (the hand-made jobs, today's job, a quick random one, the endless shift), not everything at once. */
  showPlay() {
    this.startAttract();
    const prog = loadProgress();
    const jobs = PLAYABLE_LEVELS.filter((l) => !l.hidden);
    const done = jobs.filter((l) => prog[l.id]?.completed).length;
    const stars = jobs.reduce((n, l) => n + (prog[l.id]?.stars ?? 0), 0);
    const fresh = !Object.values(prog).some((p) => p?.completed);
    const next = jobs.find((l) => !prog[l.id]?.completed);
    const daily = generateJob({ seed: dailySeed(), label: 'Daily job', twist: dailyTwist() });
    const dInfo = CARGO_INFO[daily.cargo];
    const dBest = prog[dailyId()];
    const today = todaysResult();
    const twist = TWISTS[dailyTwist()];
    const st = streak();
    const shiftBest = loadJSON<ShiftBest>('ff.shiftBest');
    const chaosBest = loadJSON<{ payout: number; level: number }>('ff.chaosBest');
    const cd = chaosDaily();
    const cst = streak(new Date(), 'chaos');
    // returning players land on today's job until it's done; newcomers on the jobs
    const dailyFirst = !fresh && !dBest?.completed && !today?.delivered;
    this.setScreen(
      'play',
      `<div class="logo" style="font-size:44px">PLAY</div>
       <div class="crew-pick">
         <button class="seg-btn ${this.solo() ? '' : 'on'}" data-nav id="p-duo">👥 Two players</button>
         <button class="seg-btn ${this.solo() ? 'on' : ''}" data-nav id="p-solo">🤖 Solo + robot buddy</button>
       </div>
       <div class="hub">
         <button class="hub-tile ${fresh ? 'start' : ''}" data-nav ${dailyFirst ? '' : 'data-default'} id="p-jobs">
           ${fresh ? '<div class="ribbon">START HERE</div>' : ''}
           <div class="icon">🚚</div>
           <div class="name">Jobs</div>
           <div class="sub">${jobs.length} hand-made deliveries, from a crate to a piano</div>
           <div class="best">${fresh ? 'Start with the <b>Practice Yard</b>' : `${done} of ${jobs.length} delivered · ${stars} ★${next ? ` · next: ${esc(next.name)}` : ''}`}</div>
         </button>
         <button class="hub-tile daily" data-nav ${dailyFirst ? 'data-default' : ''} id="p-daily">
           <div class="icon">📅</div>
           <div class="name">Daily #${dailyNumber()}</div>
           <div class="sub">${dInfo.icon} ${esc(dInfo.name)} · ${twist.icon} ${twist.name}<br>The same course for everyone today</div>
           <div class="week" title="the last seven days">${lastWeek()
             .map((d) => `<span class="${d}">${d === 'done' ? '✓' : d === 'tried' ? '✗' : ''}</span>`)
             .join('')}${st.current ? `<b>🔥 ${st.current}</b>` : ''}</div>
           <div class="best">${dBest?.completed || today?.delivered ? `✅ done today${triesToday() > 1 ? ` in ${triesToday()} tries` : triesToday() === 1 ? ', first try!' : ''} · next in ${untilNext()}` : triesToday() ? `${triesToday()} ${triesToday() === 1 ? 'try' : 'tries'} so far today` : 'not done yet today'}</div>
         </button>
         <button class="hub-tile" data-nav id="p-quick">
           <div class="icon">🎲</div>
           <div class="name">Quick job</div>
           <div class="sub">A brand-new random course, or a friend's job number</div>
           <div class="best">never the same twice</div>
         </button>
         <button class="hub-tile chaos" data-nav id="p-chaos">
           <div class="icon">💥</div>
           <div class="name">Chaos</div>
           <div class="sub">Courses where crazy things keep happening. Pick how much: Mild to ULTRA</div>
           <div class="best">${chaosBest ? `best: ${formatMoney(chaosBest.payout)} on ${chaosLevel(chaosBest.level).name}` : 'what happens? a surprise…'}</div>
         </button>
         <button class="hub-tile chaos" data-nav id="p-chaosdaily">
           <div class="icon">🌀</div>
           <div class="name">Chaos Daily #${dailyNumber()}</div>
           <div class="sub">Today's chaos, the same for everyone: ${chaosLevel(cd.level).icon} ${chaosLevel(cd.level).name}${cd.level === 5 ? ' (it’s the weekend!)' : ''}</div>
           <div class="week" title="the last seven days">${lastWeek(new Date(), 'chaos')
             .map((d) => `<span class="${d}">${d === 'done' ? '✓' : d === 'tried' ? '✗' : ''}</span>`)
             .join('')}${cst.current ? `<b>🔥 ${cst.current}</b>` : ''}</div>
           <div class="best">${todaysResult(new Date(), 'chaos')?.delivered ? `✅ survived today · next in ${untilNext()}` : triesToday(new Date(), 'chaos') ? `${triesToday(new Date(), 'chaos')} tries so far today` : 'not survived yet today'}</div>
         </button>
         <button class="hub-tile" data-nav id="p-shift">
           <div class="icon">♾️</div>
           <div class="name">Endless shift</div>
           <div class="sub">Job after job, each one harder, until something breaks</div>
           <div class="best">${shiftBest ? `best: ${formatMoney(shiftBest.total)} in ${shiftBest.jobs} job${shiftBest.jobs === 1 ? '' : 's'}` : 'no shift worked yet'}</div>
         </button>
         <button class="hub-tile party" data-nav id="p-party">
           <div class="icon">🎉</div>
           <div class="name">Party games</div>
           <div class="sub">${PARTY_GAMES.length} quick 1v1 games: sumo, tug of war, football, hot potato…</div>
           <div class="best">you vs a friend, or vs the computer</div>
         </button>
         <button class="hub-tile chaos" data-nav id="p-versus">
           <div class="icon">⚔️</div>
           <div class="name">Versus</div>
           <div class="sub">Two crews race the same job: a friend's crew online, a stranger's, or the rival crew</div>
           <div class="best">first to deliver wins</div>
         </button>
         <button class="hub-tile" data-nav id="p-boards">
           <div class="icon">🏆</div>
           <div class="name">Leaderboards</div>
           <div class="sub">The fastest deliveries of every job: on this laptop and in the world</div>
           <div class="best">${boardName() ? `you're on the board as <b>${esc(boardName()!)}</b>` : 'pick a board name to join'}</div>
         </button>
       </div>
       <div class="row"><button class="btn small" data-nav id="p-back">← Back</button></div>`,
      { back: () => this.showMenu() },
    );
    this.bind('p-jobs', () => this.showLevels());
    this.bind('p-daily', () => this.playGenerated('daily', { seed: dailySeed(), twist: dailyTwist() }));
    this.bind('p-quick', () => this.showQuick());
    this.bind('p-shift', () => this.startShift());
    this.bind('p-chaos', () => this.showChaos());
    this.bind('p-chaosdaily', () => {
      const c = chaosDaily();
      this.playGenerated('chaosDaily', { seed: c.seed, chaos: c.level, chaosMask: ALL_CHAOS });
    });
    this.bind('p-back', () => this.showMenu());
    this.bind('p-boards', () => this.showBoards());
    this.bind('p-versus', () => this.showVersus());
    this.bind('p-party', () => this.showParty());
    const crew = (solo: boolean) => {
      this.game.settings.solo = solo;
      this.game.saveSettings();
      this.showPlay();
      this.focusById(solo ? 'p-solo' : 'p-duo');
    };
    this.bind('p-duo', () => crew(false));
    this.bind('p-solo', () => crew(true));
  }

  /** Quick job: a random course now, or a friend's job number. */
  private showQuick() {
    this.startAttract();
    this.setScreen(
      'quick',
      `<div class="logo" style="font-size:44px">QUICK JOB</div>
       <div class="hub">
         <button class="hub-tile" data-nav data-default id="q-random">
           <div class="icon">🎲</div>
           <div class="name">Random job</div>
           <div class="sub">Any cargo, any place: a new course every time</div>
           <div class="best">each one has a job number you can share</div>
         </button>
         <button class="hub-tile" data-nav id="q-number">
           <div class="icon">🔢</div>
           <div class="name">Play a job number</div>
           <div class="sub">Type the number from a friend's results card</div>
           <div class="best">same number, same course</div>
         </button>
       </div>
       <div class="row"><button class="btn small" data-nav id="q-back">← Back</button></div>`,
      { back: () => this.showPlay() },
    );
    this.bind('q-random', () => this.playGenerated('random', { seed: randomSeed() }));
    this.bind('q-number', () => this.showJobNumber());
    this.bind('q-back', () => this.showPlay());
  }

  // ------------------------------------------------------------ chaos jobs

  /** Chaos: how much (a slider from Mild to ULTRA CHAOS), then a chaos job. What happens is a surprise. */
  private showChaos(focus?: string) {
    this.startAttract();
    // (every kind of chaos, always: the menu doesn't spoil what's coming)
    const c = { level: 3, ...(loadJSON<{ level: number }>('ff.chaos') ?? {}), mask: ALL_CHAOS };
    const lv = chaosLevel(c.level);
    const best = loadJSON<{ payout: number; level: number }>('ff.chaosBest');
    const notches = CHAOS_LEVELS.map((_, i) => `<span class="notch ${i < c.level ? 'on' : ''} l${i + 1}" data-level="${i + 1}"></span>`).join('');
    this.setScreen(
      'chaos',
      `<div class="logo" style="font-size:44px">💥 CHAOS</div>
       <div class="panel chaos-setup">
         <p style="margin:0">A random course, and every few seconds <b>something crazy happens</b>. Separate from the usual jobs.</p>
         <div class="chaos-slider ${c.level === 5 ? 'ultra' : ''}" data-nav data-slider id="ch-level" title="← → to change">
           <div class="now">${lv.icon} ${lv.name}</div>
           <div class="track">${notches}</div>
           <div class="ends"><span>← less</span><span>${esc(lv.text)} · pays ×${lv.pay}</span><span>more →</span></div>
         </div>
         <p class="chaos-tease">🎁 What happens is a surprise. Expect the unexpected.</p>
         ${best ? `<p class="hint-line" style="margin:0">Best chaos delivery: <b>${formatMoney(best.payout)}</b> on ${chaosLevel(best.level).name}</p>` : ''}
         <div class="row">
           <button class="btn primary" data-nav ${focus ? '' : 'data-default'} id="ch-go">Start a chaos job →</button>
           <button class="btn small" data-nav id="ch-num" title="play the same chaos job as a friend">🔢 A friend's number</button>
           <button class="btn small" data-nav id="ch-back">← Back</button>
         </div>
       </div>`,
      { back: () => this.showPlay() },
    );
    if (focus) {
      const at = this.focusables.findIndex((e) => e.id === focus);
      if (at >= 0) {
        this.focusIndex = at;
        this.updateFocus();
      }
    }
    const save = (n: { level: number }) => saveJSON('ff.chaos', { level: n.level });
    this.sliderStep = (d) => {
      const level = Math.max(1, Math.min(5, c.level + d));
      if (level === c.level) return;
      save({ ...c, level });
      this.showChaos('ch-level');
    };
    this.layer.querySelectorAll<HTMLElement>('.chaos-slider .notch').forEach((n) =>
      n.addEventListener('click', (e) => {
        e.stopPropagation();
        save({ ...c, level: Number(n.dataset.level) });
        this.showChaos('ch-level');
      }),
    );
    // Return (or a click on the slider itself) goes up a notch, round to Mild after ULTRA
    this.bind('ch-level', () => {
      save({ ...c, level: (c.level % 5) + 1 });
      this.showChaos('ch-level');
    });
    this.bind('ch-go', () => this.playGenerated('chaos', { seed: randomSeed(), chaos: c.level, chaosMask: c.mask }));
    this.bind('ch-num', () => this.showJobNumber({ level: c.level, mask: c.mask }));
    this.bind('ch-back', () => this.showPlay());
  }

  /** The focused slider (the chaos level): ← and → change it instead of moving the focus. */
  private sliderStep: ((d: number) => void) | null = null;

  // ------------------------------------------------------------ the Locker

  private lockerPlayer: 0 | 1 = 0;
  private lockerTab: Slot | 'quests' = 'hat';

  /** The Locker: what the movers wear, bought with the company's cash or won from quests. */
  private showLocker(focus?: string) {
    this.startAttract();
    this.dressMovers();
    this.lockerView(this.lockerPlayer);
    // quests finished some other way (before the Locker existed, or today's streak)
    const won = claimQuests(streak().current);
    if (won.length) this.toast(won.map(({ quest, item }) => `🏆 Quest done: ${quest.name}${item ? `! ${item.item.icon} ${item.item.name} unlocked` : ''}`).join(' · '));
    const w = loadWardrobe();
    const st = loadStats();
    const cr = companyRank();
    const days = streak().current;
    const p = this.lockerPlayer;
    const tab = this.lockerTab;
    const outfit = w.outfits[p];
    const swatch = (c: string) => `#${(ITEMS.color[c]?.hex ?? 0).toString(16).padStart(6, '0')}`;
    const players = ([0, 1] as const)
      .map((i) => `<button class="btn small tab ${p === i ? 'on' : ''}" data-nav id="lk-p${i}"><span class="swatch" style="background:${swatch(w.outfits[i].color)}"></span>Player ${i + 1}</button>`)
      .join('');
    const tabs = [...SLOTS.map((x) => ({ id: x.slot as string, name: x.name })), { id: 'quests', name: `Quests ${w.done.length}/${QUESTS.length}` }]
      .map((t) => `<button class="btn small tab ${tab === t.id ? 'on' : ''}" data-nav id="lk-t-${t.id}">${t.name}</button>`)
      .join('');
    let body: string;
    if (tab === 'quests') {
      const st2 = streak();
      const shiftBest = loadJSON<ShiftBest>('ff.shiftBest');
      const rec = (icon: string, label: string, v: string) => `<div class="rec"><span>${icon}</span><b>${v}</b><small>${label}</small></div>`;
      const records = `<div class="records">
          ${rec('📦', 'deliveries', String(st.deliveries))}
          ${rec('✨', 'flawless', String(st.flawless))}
          ${rec('💵', 'tips grabbed', String(st.tips))}
          ${rec('🏆', 'best payout', formatMoney(st.bestPayout))}
          ${rec('🔥', 'best daily streak', String(st2.best))}
          ${rec('♾️', 'best shift', shiftBest ? `${shiftBest.jobs} jobs` : '–')}
          ${rec('💥', 'chaos jobs', String(st.chaosAny))}
          ${rec('🐔', 'surprises survived', String(st.surprises))}
        </div>`;
      body = `${records}<div class="quests">${QUESTS.map((q) => {
        const [d, n] = q.progress(st, days);
        const done = w.done.includes(q.id);
        const r = rewardOf(q.id);
        return `<div class="quest ${done ? 'done' : ''}">
            <div class="q-icon">${r?.item.icon ?? '🏆'}</div>
            <div class="q-text"><b>${esc(q.name)}</b> <span>${esc(q.text)}${r ? ` · wins the <b>${esc(r.item.name)}</b>` : ''}</span>
              <div class="bar"><i style="width:${Math.round(100 * Math.min(1, d / n))}%"></i></div></div>
            <div class="q-state">${done ? '✅' : `${d}/${n}`}</div>
          </div>`;
      }).join('')}</div>`;
    } else {
      body = `<div class="items">${Object.entries(ITEMS[tab])
        .map(([id, it]) => {
          const has = owns(w, tab, id);
          const on = outfit[tab] === id;
          const q = it.quest ? QUESTS.find((x) => x.id === it.quest) : null;
          const rk = it.rank !== undefined ? RANKS[it.rank] : null;
          const state = on ? (tab === 'emotes' || tab === 'dance' || tab === 'trail' || tab === 'skin' ? 'Chosen' : 'Wearing') : has ? (tab === 'color' || tab === 'hat' || tab === 'face' || tab === 'back' ? 'Wear' : 'Choose') : q ? `🔒 ${esc(q.name)}` : rk ? `🔒 ${rk.icon} ${esc(rk.name)}` : formatMoney(it.price);
          const cls = on ? 'on' : has ? 'own' : q || rk ? 'locked' : w.cash >= it.price ? 'buy' : 'pricey';
          const icon = tab === 'color' ? `<span class="swatch big" style="background:${swatch(id)}"></span>` : it.icon;
          const title = q ? q.text : rk ? `Reach the rank of ${rk.name}` : it.lines ? it.lines.join(' · ') : '';
          return `<button class="item-card ${cls}" data-nav id="lk-i-${id}" ${title ? `title="${esc(title)}"` : ''}><div class="icon">${icon}</div><div class="name">${esc(it.name)}</div><div class="state">${state}</div></button>`;
        })
        .join('')}</div>`;
    }
    this.setScreen(
      'locker',
      `<div class="panel locker">
         <div class="locker-head"><div class="logo" style="font-size:40px">LOCKER</div><div class="wallet" title="every delivery pays in">💵 ${formatMoney(w.cash)}</div></div>
         <div class="rank-bar" title="the company's rank goes up with everything it earns">${cr.rank.icon} <b>${cr.rank.name}</b>${cr.next ? `<span class="track"><i style="width:${Math.round(cr.progress * 100)}%"></i></span><small>${formatMoney(cr.next.at - cr.earned)} to ${cr.next.icon} ${cr.next.name}</small>` : '<small>the top of the company!</small>'}</div>
         ${tab === 'skin' ? '<p class="hint-line" style="margin:0">The cargo’s look: Player 1’s choice counts (it’s the company’s cargo).</p>' : tab === 'emotes' ? '<p class="hint-line" style="margin:0">What the number keys say. Point at a pack to see its lines.</p>' : ''}
         <div class="row tabs">${players}<button class="btn small tab" data-nav id="lk-rand" title="put on a random mix of what you own">🎲 Surprise me</button></div>
         <div class="row tabs">${tabs}</div>
         ${body}
         <p class="hint-line" style="margin:6px 0 0">${tab === 'quests' ? 'Quests unlock things money can’t buy.' : 'Every delivery pays into the wallet. 🔒 things are won from quests.'}</p>
         <div class="row"><button class="btn small" data-nav id="lk-back">← Back</button></div>
       </div>`,
      { back: () => this.showMenu() },
    );
    // keep the focus where it was (or on what's being worn)
    const want = focus ?? (tab === 'quests' ? 'lk-t-quests' : `lk-i-${outfit[tab]}`);
    const at = this.focusables.findIndex((e) => e.id === want);
    if (at >= 0) {
      this.focusIndex = at;
      this.updateFocus();
    }
    for (const i of [0, 1] as const)
      this.bind(`lk-p${i}`, () => {
        this.lockerPlayer = i;
        this.showLocker(`lk-p${i}`);
      });
    for (const t of [...SLOTS.map((x) => x.slot), 'quests'] as const)
      this.bind(`lk-t-${t}`, () => {
        this.lockerTab = t;
        this.showLocker(`lk-t-${t}`);
      });
    if (tab !== 'quests')
      for (const [id, it] of Object.entries(ITEMS[tab]))
        this.bind(`lk-i-${id}`, () => {
          const again = () => this.showLocker(`lk-i-${id}`);
          if (owns(w, tab, id)) {
            wear(p, tab, id);
            return again();
          }
          if (it.quest) {
            const q = QUESTS.find((x) => x.id === it.quest);
            this.toast(`🔒 ${it.icon} ${it.name}: win it from the quest “${q?.name}” (${q?.text}).`);
            return;
          }
          if (it.rank !== undefined) {
            const rk = RANKS[it.rank];
            this.toast(`🔒 ${it.icon} ${it.name}: the company gets it at the rank of ${rk.icon} ${rk.name} (${formatMoney(rk.at)} earned in all).`);
            return;
          }
          if (!buy(tab, id)) {
            this.toast(`${it.icon} ${it.name} costs ${formatMoney(it.price)}: ${formatMoney(it.price - w.cash)} more to earn. Every delivery pays into the wallet.`);
            return;
          }
          wear(p, tab, id);
          this.toast(`Bought the ${it.name}! ${formatMoney(loadWardrobe().cash)} left.`);
          again();
        });
    this.bind('lk-rand', () => {
      // a random mix of what's owned (something different each time)
      const before = JSON.stringify(loadWardrobe().outfits[p]);
      for (let tries = 0; tries < 6; tries++) {
        const w2 = loadWardrobe();
        for (const { slot } of SLOTS) {
          const mine = Object.keys(ITEMS[slot]).filter((id) => owns(w2, slot, id) && !(p === 1 && slot === 'color' && id === w2.outfits[0].color) && !(p === 0 && slot === 'color' && id === w2.outfits[1].color));
          if (mine.length) wear(p, slot, mine[Math.floor(Math.random() * mine.length)]);
        }
        if (JSON.stringify(loadWardrobe().outfits[p]) !== before) break;
      }
      this.showLocker('lk-rand');
    });
    this.bind('lk-back', () => this.showMenu());
  }

  /** The Locker: a close-up of the mover being dressed, the camera circling them (null: back to the usual view). */
  private lockerView(player: 0 | 1 | null) {
    const s = this.game.session;
    if (!s || !this.attract) return;
    this.attract.hold = player;
    if (player === null) {
      if (this.viewing) s.focusOverride = null;
      s.cameraRig.closeUp = null;
      this.viewing = false;
      return;
    }
    this.viewing = true;
    s.cameraRig.closeUp = 5.2;
    s.focusOverride = () => {
      const p = s.players[player];
      const at = s.physics.interpolatedPosition(p.body, new THREE.Vector3());
      // the panel covers the right of the screen: put the mover left of the middle
      if (window.innerWidth > 900) at.addScaledVector(s.cameraRig.right(new THREE.Vector3()), 1.3);
      return [at.add(new THREE.Vector3(0, 0.1, 0))];
    };
  }
  private viewing = false;

  /** The menu's movers wear the latest outfits. */
  private dressMovers() {
    const s = this.game.session;
    if (!s || !this.attract) return;
    const o = activeOutfits();
    s.rigs.forEach((r, i) => r.applyOutfit(o[i]));
  }

  /** The hand-made jobs (and the Practice Yard). */
  showLevels() {
    this.startAttract();
    const prog = loadProgress();
    const fresh = !Object.values(prog).some((p) => p?.completed);
    const list = [...LEVELS.filter((l) => l.hidden && !l.generated), ...PLAYABLE_LEVELS];
    const next = PLAYABLE_LEVELS.find((l) => !prog[l.id]?.completed);
    // newcomers start on the Practice Yard; everyone else on the next job they haven't delivered
    const pick = fresh ? list[0] : (next ?? list[1] ?? list[0]);
    const goalsDone = loadJSON<string[]>('ff.goals') ?? [];
    const cards = list
      .map((l) => {
        const b = prog[l.id];
        const info = CARGO_INFO[l.cargo];
        const earned = b?.stars ?? 0;
        const stars = [0, 1, 2].map((i) => `<span class="${i < earned ? '' : 'off'}">★</span>`).join('');
        return `<button class="level-card ${fresh && l === pick ? 'start' : ''}" data-nav ${l === pick ? 'data-default' : ''} data-level="${l.id}">
          ${fresh && l === pick ? '<div class="ribbon">START HERE</div>' : ''}
          <div class="num">${l.hidden ? 'PRACTICE' : `JOB ${l.order}`}</div>
          <div class="name">${esc(l.name)}</div>
          <div class="cargo">${info.icon} ${esc(info.name)} · ${formatMoney(info.value)}</div>
          <div class="tag">${esc(l.tagline)}</div>
          ${l.goals?.length ? `<div class="goals-done" title="${esc(l.goals.map(goalText).join(' · '))}">🎯 ${l.goals.filter((_, i) => goalsDone.includes(goalId(l.id, i))).length}/${l.goals.length} bonus goals</div>` : ''}
          <div class="best"><span class="stars">${stars}</span><span>${b?.completed ? `${formatMoney(b.bestPayout)} · ${formatTime(b.bestTime ?? 0)}` : b?.attempts ? 'not delivered yet' : 'new job'}</span></div>
        </button>`;
      })
      .join('');
    this.setScreen(
      'levels',
      `<div class="logo" style="font-size:44px">JOBS</div>
       <div class="levels">${cards}</div>
       ${fresh ? '<div class="hint-line">First time? The <b>Practice Yard</b> is a good place to learn the ropes.</div>' : ''}
       <div class="row"><button class="btn small" data-nav id="l-back">← Back</button></div>`,
      { back: () => this.showPlay() },
    );
    this.layer.querySelectorAll<HTMLElement>('[data-level]').forEach((el) => el.addEventListener('click', () => this.playLevel(el.dataset.level!)));
    this.bind('l-back', () => this.showPlay());
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
        <h3>💬 Talking</h3>
        <p>Number keys pop a bubble over your mover: <b>1</b> 👋 Hi! · <b>2</b> 👍 Nice! · <b>3</b> 😬 Careful! · <b>4</b> ✋ Wait! (Player 2 on the same keyboard: <b>7 8 9 0</b>; online, each of you uses 1–4.)</p>
        <h3>☁️ Falling off</h3>
        <p>Fall off the world and you respawn at the last checkpoint (flags), minus a small payout penalty. Get the cargo to a checkpoint to save progress.</p>
        <h3>🎥 Camera</h3>
        <p>${keys(b.camLeft, '')} ${keys(b.camRight, '')} spin the camera. Movement is relative to the camera. ${keys(b.pause, '')} pauses.</p>
        <p class="touch-only">📱 <b>On a phone or tablet:</b> put your left thumb down anywhere on the left half and slide it to walk. Hold <b>GRAB</b>, tap <b>JUMP</b>; ⟲ ⟳ spin the camera and the button in the corner pauses.</p>
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
        <div class="setting"><span>Ghost of your best run</span>${seg('ghost', [['1', 'On'], ['0', 'Off']], st.ghost === false ? '0' : '1')}</div>
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
          else if (name === 'ghost') st.ghost = v === '1';
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
    // a bit different each time: the time of day, maybe rain or snow (tests can ask for the plain one)
    // (tests run the plain job unless they ask for ?variety)
    const q = new URLSearchParams(location.search);
    const v = q.has('plain') || (this.game.manual && !q.has('variety')) ? null : rollVariant(def);
    if (v) def = withVariant(def, v);
    if (def.goals?.length) def = { ...def, hints: [`🎯 Bonus goals: ${def.goals.map(goalText).join(' · ')}`, ...(def.hints ?? [])] };
    this.job = { kind: 'level', id };
    this.playDef(def);
  }

  /** A generated job: a random one, today's, or the next one in an endless shift. */
  playGenerated(kind: 'random' | 'daily' | 'chaos' | 'chaosDaily', gen: GenParams) {
    const label = kind === 'daily' ? 'Daily job' : kind === 'chaosDaily' ? 'Chaos Daily' : kind === 'chaos' ? 'Chaos job' : 'Random job';
    this.job = { kind, gen: { ...gen, label } };
    this.playDef(generateJob(this.job.gen));
  }

  /** An endless shift: job after job, harder each time, until something breaks. */
  startShift() {
    this.job = { kind: 'shift', base: randomSeed(), round: 1, total: 0, gen: { seed: 0 } };
    this.playShiftRound();
  }

  private playShiftRound() {
    const j = this.job;
    if (j?.kind !== 'shift') return;
    j.gen = {
      seed: 100000 + (hashSeed(`shift ${j.base} ${j.round}`) % 900000),
      difficulty: Math.min(0.95, 0.15 + j.round * 0.1),
      pieces: Math.min(12, 2 + j.round),
      label: `Shift job ${j.round}`,
    };
    const def = generateJob(j.gen);
    def.name = `Shift job ${j.round}${j.total ? ` · ${formatMoney(j.total)} so far` : ''}`;
    this.playDef(def);
  }

  /** Generated jobs: the cargo's health stretch by stretch, for the share card. */
  private stretches: StretchTracker | null = null;
  private shareCard = '';

  private playDef(def: LevelDef) {
    this.attract = null;
    this.audio.unlock();
    this.stretches = def.stretches ? new StretchTracker(def.stretches) : null;
    // restart / retry / next job: the old HUD goes with the old session
    this.hud?.dispose();
    const s = this.game.startLevel(def);
    this.wireSession(s);
    this.hud = new Hud(this.hudLayer, this.game, s);
    this.setScreen('playing', '');
    this.audio.music(def.cargo === 'crate' ? 'menu' : 'level');
  }

  /** Playing on your own (the robot buddy carries the other end); ?solo in the address for tests. */
  solo() {
    // (a phone or tablet on its own can only be one player: solo, unless you've picked two players)
    return !!(this.game.settings.solo ?? this.game.touch.active) || new URLSearchParams(location.search).has('solo');
  }

  private wireSession(s: LevelSession) {
    this.audio.attach(s);
    s.ghostOn = this.game.settings.ghost !== false && !s.mirror;
    // solo: a robot buddy is the second mover (not online: there it's your friend)
    s.buddy = this.solo() && !s.mirror && !this.host?.connected && !s.def.party ? new Buddy(s) : null;
    // a party game: the computer plays P2 (not online: there it's your friend)
    if (s.party && !s.mirror) s.party.cpu = this.job?.kind === 'party' && !this.host?.connected ? this.job.cpu : 0;
    // (solo, the load is a bit tougher: one person's steering for two)
    if (s.buddy) s.sim.damageScale = (s.sim.damageScale ?? 1) * 0.75;
    s.events.on('cargoDamage', () => {
      if (!this.game.settings.shake) s.cameraRig.addShake(-1);
    });
  }

  /** Online guest drawing the level itself: if it stays choppy, say what helps (once). */
  private watchGuestFrameRate() {
    const p = this.perf;
    const now = performance.now() / 1000;
    if (p.hinted || this.game.manual) return;
    if (!p.from) {
      p.from = now + 3;
      p.frames = 0;
    }
    if (now < p.from) return;
    p.frames++;
    if (now - p.from < 5) return;
    if (p.frames / (now - p.from) < 28) {
      p.hinted = true;
      const fast = this.game.settings.quality === 'low';
      this.hud?.say(
        this.guest?.canVideo
          ? `Choppy? ${this.escWord()}: ${fast ? '' : 'Graphics: Fast, or '}Picture: stream it.`
          : fast
            ? 'Choppy? Close other tabs and apps; this laptop is drawing the whole game.'
            : `Choppy? ${this.escWord()}, then Graphics: Fast.`,
        9,
      );
    }
    p.from = now;
    p.frames = 0;
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
      this.hud?.say(`Choppy? ${this.escWord()}, then Settings → Graphics: Fast.`, 8);
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
    this.bind('p-restart', () => this.replay(s.def));
    this.bind('p-controls', () => this.showControls(() => this.showPauseMenu()));
    this.bind('p-settings', () => this.showSettings(() => this.showPauseMenu()));
    this.bind('p-quit', () => this.quitToMenu());
  }

  /** The same job again from the top. */
  private replay(def: LevelDef) {
    if (this.job?.kind === 'party') return this.playParty(this.job.game, this.job.mix);
    // a race against the rival crew starts over as a race
    if (this.job?.kind === 'race' && this.job.vs === 'ai') return this.startRace(this.job.id, def.variant ?? null, 'ai');
    if (def.gen) this.playDef(def.gen.label?.startsWith('Shift') ? { ...generateJob(def.gen), name: def.name } : generateJob(def.gen));
    else this.playLevel(def.id);
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
    if (r.party) return this.showPartyResults(r);
    const s = this.game.session!;
    this.resultsFor = 0;
    const def = s.def;
    const job = this.job ?? { kind: 'level', id: def.id };
    // generated jobs: a random job is a one-off (nothing to keep), today's job keeps today's best, a shift keeps a running total
    // a race: tell the other laptop how it went
    if (job.kind === 'race' && this.race) {
      this.race.mine = r.success ? r.time : null;
      this.raceLink?.send({ k: 'done', t: +r.time.toFixed(2), ok: r.success });
      this.raceShow('');
    }
    const kept = job.kind === 'level' || job.kind === 'race' ? r : job.kind === 'daily' ? { ...r, levelId: dailyId() } : job.kind === 'chaosDaily' ? { ...r, levelId: 'chaos' + dailyId() } : null;
    const beat = kept ? recordResult(kept) : { payout: false, time: false };
    const stars = starsFor(r);
    const nextLevel = job.kind === 'level' ? PLAYABLE_LEVELS.find((l) => l.order > def.order) : undefined;
    // generated jobs: how the cargo fared stretch by stretch; today's job keeps its best go and a card to share
    const squares = this.stretches?.squares(r.condition, r.success, s.cargo.destroyed) ?? '';
    let shareBlock = squares ? `<div class="share"><div class="squares" title="each square is a stretch of the course: 🟩 barely a scratch · 🟨 a few knocks · 🟥 a beating">${squares}</div></div>` : '';
    if (job.kind === 'daily') {
      const info = CARGO_INFO[def.cargo];
      recordDaily({ delivered: r.success, condition: r.condition, time: r.time, payout: r.payout, stars, cargo: def.cargo, squares, twist: def.gen?.twist ?? null });
      const best = todaysResult();
      this.shareCard = best ? shareText(best, `${info.icon} ${info.name}`) : '';
      const st = streak();
      shareBlock = `<div class="share">
          <div class="squares" title="each square is a stretch of the course: 🟩 barely a scratch · 🟨 a few knocks · 🟥 a beating">${squares}</div>
          <p>${st.current ? `🔥 <b>${st.current}</b>-day streak${st.best > st.current ? ` (best ${st.best})` : ''}` : "Deliver today's job to start a streak."} · next daily in ${untilNext()}</p>
          <pre class="share-text">${esc(this.shareCard)}</pre>
          <button class="btn small" data-nav id="r-share">📋 Copy today's result</button>
        </div>`;
    }
    const surprises = (s.hazards.find((h) => h.hudLine) as { fired?: number } | undefined)?.fired ?? 0;
    if (job.kind === 'chaosDaily') {
      // today's chaos: kept like the daily, with its own streak and card (and the surprises survived)
      const info = CARGO_INFO[def.cargo];
      const lv = chaosLevel(def.gen?.chaos);
      recordDaily({ delivered: r.success, condition: r.condition, time: r.time, payout: r.payout, stars, cargo: def.cargo, squares, twist: null }, new Date(), 'chaos');
      const best = todaysResult(new Date(), 'chaos');
      this.shareCard = best ? shareText(best, `${info.icon} ${info.name} · ${surprises} surprises`, new Date(), 'chaos', `${lv.icon} ${lv.name}`) : '';
      const st = streak(new Date(), 'chaos');
      shareBlock = `<div class="share">
          <div class="squares" title="each square is a stretch of the course: 🟩 barely a scratch · 🟨 a few knocks · 🟥 a beating">${squares}</div>
          <p>${st.current ? `🔥 <b>${st.current}</b>-day chaos streak${st.best > st.current ? ` (best ${st.best})` : ''}` : "Deliver today's chaos to start a streak."} · next in ${untilNext()}</p>
          <pre class="share-text">${esc(this.shareCard)}</pre>
          <button class="btn small" data-nav id="r-share">📋 Copy today's chaos</button>
        </div>`;
    }
    // a hand-made job's bonus goals (each pays once, the first time)
    let goalsBlock = '';
    if (job.kind === 'level' && def.goals?.length) {
      const done = loadJSON<string[]>('ff.goals') ?? [];
      const reward = Math.max(50, Math.round((r.value * 0.15) / 10) * 10);
      let bonus = 0;
      const rows = def.goals.map((g, i) => {
        const met = goalMet(g, r);
        const id = goalId(def.id, i);
        const first = met && !done.includes(id);
        if (first) {
          done.push(id);
          bonus += reward;
        }
        return `<li class="${met ? 'met' : ''}">${met ? '✅' : '⬜'} ${goalText(g)}${first ? ` <b>+${formatMoney(reward)}</b>` : met ? ' <small>(done before)</small>' : ''}</li>`;
      });
      saveJSON('ff.goals', done);
      addCash(bonus);
      goalsBlock = `<div class="goals"><b>🎯 Bonus goals</b><ul>${rows.join('')}</ul></div>`;
    }
    // speedrun boards: hand-made jobs and today's Daily, two-player and solo apart
    let boardBlock = '';
    let boardPost: (() => void) | null = null;
    if (r.success && !s.mirror && (job.kind === 'level' || job.kind === 'race' || job.kind === 'daily') && !def.hidden) {
      const mode: CrewMode = s.buddy ? 'solo' : 'duo';
      const key = boardKey(job.kind === 'daily' ? `daily-${dailyNumber()}` : def.id, mode);
      const hex = `#${(ITEMS.color[s.outfits[0]?.color ?? 'orange']?.hex ?? 0xff7a3d).toString(16).padStart(6, '0')}`;
      const run = recordRun(key, { time: r.time, health: r.condition, color: hex });
      const label = mode === 'solo' ? '🤖 Solo' : '👥 Two players';
      boardBlock = `<div class="board-line">🏆 ${label} · ${run.personalBest ? '<b>your best time!</b>' : `${formatRunTime(r.time)}`}${run.place ? ` · #${run.place} on this laptop` : ''} · <span id="r-world">${boardName() ? '🌍 checking the world board…' : 'pick a board name (Play → 🏆 Leaderboards) to join the world board'}</span></div>`;
      if (boardName())
        boardPost = () => {
          const me = playerId();
          (run.personalBest ? postRun(key, run.entry) : Promise.resolve(true))
            .then(() => worldBoard(key))
            .then(({ ok, entries }) => {
              const el = this.layer.querySelector('#r-world');
              if (!el || this.screen !== 'results') return;
              const at = entries.findIndex((e) => e.id === me);
              el.textContent = !ok ? '🌍 couldn’t reach the world board' : at >= 0 ? `🌍 #${at + 1} of ${entries.length} in the world` : '🌍 on its way to the world board';
            });
        };
    }
    // the best chaos delivery
    let chaosBestLine = false;
    if ((job.kind === 'chaos' || job.kind === 'chaosDaily') && r.success && def.gen?.chaos) {
      const best = loadJSON<{ payout: number; level: number }>('ff.chaosBest');
      if (!best || r.payout > best.payout) {
        saveJSON('ff.chaosBest', { payout: r.payout, level: def.gen.chaos });
        chaosBestLine = true;
      }
    }
    // the wallet and the quests (after today's job is counted, for the streak)
    const payday = track(
      { success: r.success, payout: r.payout, condition: r.condition, tipCount: r.tipCount, stars },
      { kind: job.kind, levelId: def.id, online: !!this.host?.connected, chaos: def.gen?.chaos, surprises, shiftRound: job.kind === 'shift' ? job.round : 0, daily: job.kind === 'daily' },
      streak().current,
    );
    if (this.host?.connected) this.host.sendPaid({ success: r.success, payout: r.payout, condition: r.condition, tipCount: r.tipCount, stars });
    let shiftLine = '';
    if (job.kind === 'shift') {
      if (r.success) job.total += r.payout;
      else {
        const done = job.round - 1;
        const best = loadJSON<ShiftBest>('ff.shiftBest');
        const record = !best || job.total > best.total;
        if (record && done > 0) saveJSON('ff.shiftBest', { total: job.total, jobs: done } satisfies ShiftBest);
        shiftLine = `<p><b>Shift over.</b> ${done} job${done === 1 ? '' : 's'} delivered, ${formatMoney(job.total)} earned${record && done > 0 ? ' <span class="new-best">NEW BEST</span>' : best ? ` (best ${formatMoney(best.total)})` : ''}.</p>`;
      }
    }
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
    // (a shift job's number alone doesn't make the same course: shifts also set how hard it is)
    const twist = def.gen?.twist ? TWISTS[def.gen.twist] : null;
    const seedLine =
      job.kind === 'daily'
        ? `<p style="font-size:14px">Daily <b>#${dailyNumber()}</b>${twist ? ` · ${twist.icon} ${twist.name}` : ''} · the same course for everyone today</p>`
        : job.kind === 'chaosDaily'
          ? `<p style="font-size:14px">💥 Chaos Daily <b>#${dailyNumber()}</b> · ${chaosLevel(def.gen?.chaos).icon} ${chaosLevel(def.gen?.chaos).name} · ${r.success ? 'survived' : 'lasted through'} <b>${surprises}</b> surprise${surprises === 1 ? '' : 's'} · the same chaos for everyone today</p>`
        : def.gen?.chaos
          ? `<p style="font-size:14px">${chaosLevel(def.gen.chaos).icon} ${chaosLevel(def.gen.chaos).name} chaos job <b>#${def.gen.seed}</b>${surprises ? ` · ${r.success ? 'survived' : 'lasted through'} <b>${surprises}</b> surprise${surprises === 1 ? '' : 's'}` : ''}<br>Challenge a friend: Chaos → 🔢 A friend's number, on ${chaosLevel(def.gen.chaos).name}</p>`
          : def.gen && job.kind !== 'shift'
          ? `<p style="font-size:14px">${esc(def.gen.label ?? 'Job')} <b>#${def.gen.seed}</b> · tell a friend the number to play the same course</p>`
          : '';
    // the buttons depend on what's being played
    let buttons: string;
    if (job.kind === 'shift')
      buttons = r.success
        ? `<button class="btn primary" data-nav data-default id="r-shift">Next job in the shift →</button>
           <button class="btn" data-nav id="r-shift-stop">End the shift here</button>`
        : `<button class="btn primary" data-nav data-default id="r-shift-new">Start a new shift</button>
           <button class="btn" data-nav id="r-levels">Back to Play</button>`;
    else if (job.kind === 'chaos')
      buttons = `<button class="btn primary" data-nav data-default id="r-chaos">New chaos job →</button>
           <button class="btn" data-nav id="r-retry">${r.success ? 'Play this one again' : 'Retry'}</button>
           <button class="btn" data-nav id="r-levels">Change the chaos</button>`;
    else if (job.kind === 'race')
      buttons =
        job.vs === 'ai'
          ? `<button class="btn primary" data-nav data-default id="r-rematch">Rematch</button>
           <button class="btn" data-nav id="r-versus">Versus menu</button>`
          : this.raceLink?.role === 'host'
            ? `<button class="btn primary" data-nav data-default id="r-rematch">Race again</button>
           <button class="btn" data-nav id="r-versus">Leave the race</button>`
            : `<button class="btn" data-nav data-default id="r-versus">Leave the race</button>`;
    else if (job.kind === 'random')
      buttons = `<button class="btn primary" data-nav data-default id="r-random">New random job →</button>
           <button class="btn" data-nav id="r-retry">${r.success ? 'Play this one again' : 'Retry'}</button>
           <button class="btn" data-nav id="r-levels">Back to Play</button>`;
    else
      buttons = `${r.success && nextLevel ? `<button class="btn primary" data-nav data-default id="r-next">Next job →</button>` : ''}
           <button class="btn ${r.success && nextLevel ? '' : 'primary'}" data-nav ${r.success && nextLevel ? '' : 'data-default'} id="r-retry">${r.success ? 'Play again' : 'Retry'}</button>
           <button class="btn" data-nav id="r-levels">${job.kind === 'level' ? 'Job list' : 'Back to Play'}</button>`;
    this.setScreen(
      'results',
      `<div class="panel results">
        <div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}" style="animation-delay:${0.15 + i * 0.18}s">★</span>`).join('')}</div>
        <div class="verdict" style="color:${r.success ? 'var(--ink)' : 'var(--bad)'}">${verdicts[0]}</div>
        <p>${verdicts[1]}</p>
        ${seedLine}
        <table>
          ${row('Cargo value', formatMoney(r.value))}
          ${row('Condition', `${Math.round(r.condition * 100)}%`)}
          ${r.success ? row('Time', `${formatTime(r.time)}${beat.time ? '<span class="new-best">NEW BEST</span>' : ''}`) : ''}
          ${r.timeBonus ? row(`Speedy bonus (under ${formatTime(def.parTime)})`, '+' + formatMoney(r.timeBonus)) : ''}
          ${r.tips ? row(`Tips (${r.tipCount})`, '+' + formatMoney(r.tips)) : ''}
          ${r.bonus ? row(`${chaosLevel(def.gen?.chaos).icon} Chaos pay (×${def.payScale})`, '+' + formatMoney(r.bonus)) : ''}
          ${r.falls ? row(`Falls (${r.falls}×)`, '−' + formatMoney(r.penalty)) : ''}
          <tr class="total"><td>Payout</td><td>${formatMoney(r.payout)}${beat.payout || chaosBestLine ? '<span class="new-best">NEW BEST</span>' : ''}</td></tr>
          ${job.kind === 'shift' && r.success ? row('Shift so far', `<b>${formatMoney(job.total)}</b> · ${job.round} job${job.round === 1 ? '' : 's'}`) : ''}
        </table>
        ${shiftLine}
        ${job.kind === 'race' ? `<div class="race-line" id="r-race">${this.raceLine()}</div>${job.vs === 'online' && this.raceLink?.role === 'guest' ? '<p style="font-size:14px">Your friend can start another race from their results.</p>' : ''}` : ''}
        ${boardBlock}
        ${goalsBlock}
        ${s.ghostSaved && this.game.settings.ghost !== false ? '<p style="font-size:14px">👻 Your fastest run yet: next time, its ghost runs alongside you.</p>' : ''}
        ${shareBlock}
        ${this.paydayBlock(payday)}
        ${!r.success && (this.game.settings.damage ?? 1) >= 1 ? '<p style="font-size:14px">Too fragile? <b>Settings → Cargo toughness: Sturdy</b> halves the damage.</p>' : ''}
        <div class="row">${buttons}</div>
      </div>`,
      { dim: true, back: () => this.backToList() },
    );
    this.audio.sfx(r.success ? 'payout' : 'fail');
    boardPost?.();
    this.bind('r-rematch', () => {
      if (job.kind !== 'race') return;
      if (job.vs === 'ai') this.startRace(job.id, null, 'ai');
      else this.hostRace();
    });
    this.bind('r-versus', () => this.showVersus());
    this.bind('r-next', () => nextLevel && this.playLevel(nextLevel.id));
    this.bind('r-retry', () => this.replay(def));
    this.bind('r-share', () => {
      void copyText(this.shareCard).then((ok) => {
        const b = this.layer.querySelector('#r-share');
        if (b) b.textContent = ok ? '✅ Copied! Paste it anywhere' : 'Select the text above to copy it';
      });
    });
    this.bind('r-random', () => this.playGenerated('random', { seed: randomSeed() }));
    this.bind('r-chaos', () => def.gen && this.playGenerated('chaos', { seed: randomSeed(), chaos: def.gen.chaos, chaosMask: def.gen.chaosMask }));
    this.bind('r-shift', () => {
      if (this.job?.kind !== 'shift') return;
      this.job.round++;
      this.playShiftRound();
    });
    const endShift = () => {
      const j = this.job;
      if (j?.kind === 'shift') {
        const best = loadJSON<ShiftBest>('ff.shiftBest');
        if (!best || j.total > best.total) saveJSON('ff.shiftBest', { total: j.total, jobs: j.round } satisfies ShiftBest);
      }
      this.hud?.dispose();
      this.hud = null;
      this.showPlay();
    };
    this.bind('r-shift-stop', endShift);
    this.bind('r-shift-new', () => this.startShift());
    this.bind('r-levels', () => {
      this.hud?.dispose();
      this.hud = null;
      this.backToList();
    });
  }

  /** What a job paid into the Locker's wallet, and any quest it finished. */
  private paydayBlock(p: Payday) {
    const quests = p.quests
      .map(
        ({ quest, item }) =>
          `<div class="quest-won"><span class="q-icon">${item?.item.icon ?? '🏆'}</span><span><b>Quest done: ${esc(quest.name)}!</b>${item ? ` The <b>${esc(item.item.name)}</b> is in the Locker.` : ''}</span></div>`,
      )
      .join('');
    const promo = p.rankUp
      ? `<div class="quest-won promo"><span class="q-icon">${p.rankUp.rank.icon}</span><span><b>Promoted! The company is now ${esc(p.rankUp.rank.name)}.</b>${p.rankUp.items.length ? ` New in the Locker: ${p.rankUp.items.map((x) => `${x.item.icon} ${esc(x.item.name)}`).join(', ')}.` : ''}</span></div>`
      : '';
    if (!p.cash && !quests && !promo) return '';
    return `<div class="payday">${p.cash ? `<p>💵 <b>+${formatMoney(p.cash)}</b> to the Locker wallet (now ${formatMoney(loadWardrobe().cash)})</p>` : ''}${promo}${quests}</div>`;
  }

  /** Back from a job to where it was picked: the job list for a hand-made job, the Play screen otherwise. */
  private backToList() {
    if (this.job?.kind === 'level') this.showLevels();
    else if (this.job?.kind === 'chaos') this.showChaos();
    else if (this.job?.kind === 'race') this.showVersus();
    else this.showPlay();
  }

  // ------------------------------------------------------------ job by number

  private jobNumber = '';

  /** A chaos job number is played at this chaos (from the Chaos screen); null: a plain random job. */
  private jobChaos: { level: number; mask: number } | null = null;

  /** Type a six-digit job number (from a friend's results card) and play that very course. */
  private showJobNumber(chaos: { level: number; mask: number } | null = null) {
    this.startAttract();
    this.jobNumber = '';
    this.jobChaos = chaos;
    const lv = chaos ? chaosLevel(chaos.level) : null;
    const back = () => (chaos ? this.showChaos() : this.showQuick());
    this.setScreen(
      'jobnum',
      `<div class="logo" style="font-size:44px">${lv ? '💥 CHAOS JOB NUMBER' : 'JOB NUMBER'}</div>
       <div class="panel" style="text-align:center;max-width:min(640px,92vw)">
         <p>Type the six-digit job number</p>
         <div class="type-over"><div class="net-code entry job-digits">${this.jobBoxes()}</div>${typeBox('jn-type', true)}</div>
         <p style="font-size:14px">${
           lv
             ? `It's on the results card of every chaos job. It'll be played on <b>${lv.icon} ${lv.name}</b> (your slider): set the slider to your friend's level for the very same chaos.`
             : "It's on the results card of every random job. Same number, same course (and the same cargo)."
         }</p>
       </div>
       <div class="row">
         <button class="btn primary" data-nav data-default id="jn-go" disabled>Play it</button>
         <button class="btn small" data-nav id="jn-back">← Back</button>
       </div>`,
      { back },
    );
    this.bind('jn-go', () => this.playJobNumber());
    this.typeBox('jn-type', (t) => {
      this.jobNumber = t.replace(/[^0-9]/g, '').slice(0, 6);
      this.updateJobNumber();
    });
    this.bind('jn-back', back);
  }

  private jobBoxes() {
    return Array.from({ length: 6 }, (_, i) => `<span class="${i === this.jobNumber.length ? 'cursor' : ''}">${this.jobNumber[i] ?? ''}</span>`).join('');
  }

  private typeJobNumber(code: string, e: KeyboardEvent) {
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(code);
    if (m || code === 'Backspace') {
      e.preventDefault();
      if (m && this.jobNumber.length < 6) this.jobNumber += m[1];
      if (code === 'Backspace') this.jobNumber = this.jobNumber.slice(0, -1);
      this.updateJobNumber();
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && this.jobNumber.length === 6) {
      e.preventDefault();
      this.playJobNumber();
      return true;
    }
    return false;
  }

  private updateJobNumber() {
    const box = this.layer.querySelector('.job-digits');
    if (box) box.innerHTML = this.jobBoxes();
    const go = this.layer.querySelector<HTMLButtonElement>('#jn-go');
    if (go) go.disabled = this.jobNumber.length !== 6;
    syncTypeBox(this.layer, 'jn-type', this.jobNumber);
  }

  /** Phones and tablets have no keys to type a code with: a text box brings up the on-screen keyboard. */
  private typeBox(id: string, typed: (text: string) => void) {
    const el = this.layer.querySelector<HTMLInputElement>('#' + id);
    el?.addEventListener('input', () => typed(el.value));
    // Return / Go on the on-screen keyboard: put the keyboard away (the key itself goes on to join or play)
    el?.addEventListener('keydown', (e) => e.key === 'Enter' && el.blur());
  }

  // ------------------------------------------------------------ versus

  /** The Versus screen's picks: which job, and how quick the rival crew is. */
  private versus = { job: 0, pace: 'normal' as RivalPace };
  /** Online versus: the line to the other laptop. */
  private raceLink: RaceLink | null = null;
  /** The race being run: counting down / waiting for the other crew, and who's finished. */
  /** count: seconds of countdown left (on the real clock, from `goAt`), so two laptops start together however fast each draws. */
  private race: { wait: boolean; count: number; goAt: number; sendT: number; told: boolean; mine: number | null; level: string } | null = null;
  private raceCode = '';
  private raceStop: (() => void) | null = null;
  private raceOverlay: HTMLDivElement | null = null;

  private versusJobs() {
    return PLAYABLE_LEVELS.filter((l) => !l.hidden);
  }

  // ------------------------------------------------------------ party games (1v1)

  private partyOpts: { vs: 'friend' | 'cpu'; cpu: number; len: PartyLength } = { vs: 'cpu', cpu: 2, len: 1, ...(loadJSON<object>('ff.partyOpts') ?? {}) };

  /** Party: pick a game, who you're playing (a friend here, the computer, or the friend you're hosting online), and how long. */
  showParty(focus?: string) {
    this.startAttract();
    const o = this.partyOpts;
    const online = !!this.host?.connected;
    const save = () => saveJSON('ff.partyOpts', o);
    const games = PARTY_GAMES.filter((g) => levelById(`party-${g.id}`));
    const tiles = games
      .map((g) => {
        const rec = partyRecord(g.id);
        const best = bestBeaten(g.id);
        return `<button class="hub-tile party-tile" data-nav id="pa-${g.id}">
           <div class="icon">${g.icon}</div>
           <div class="name">${esc(g.name)}</div>
           <div class="sub">${esc(g.blurb)}</div>
           <div class="best">${best ? `beat the ${CPU_NAMES[best]} computer ${'★'.repeat(best)}` : rec.played ? `played ${rec.played}×` : '✨ new'}</div>
         </button>`;
      })
      .join('');
    const vs = online
      ? '<div class="party-online">🌐 Your friend online plays <b>P2</b></div>'
      : `<button class="seg-btn ${o.vs === 'friend' ? 'on' : ''}" data-nav id="pa-friend">👥 A friend, this keyboard</button>
         <button class="seg-btn ${o.vs === 'cpu' ? 'on' : ''}" data-nav id="pa-cpu">🤖 The computer</button>`;
    const cpu =
      !online && o.vs === 'cpu'
        ? `<div class="crew-pick small">${[1, 2, 3].map((k) => `<button class="seg-btn ${o.cpu === k ? 'on' : ''}" data-nav id="pa-lvl${k}">${['', '🙂', '😐', '😈'][k]} ${CPU_NAMES[k]}</button>`).join('')}</div>`
        : '';
    const phoneNote = this.game.touch.active && !online && o.vs === 'friend' ? '<p class="party-note">On one phone only one person can play: play the computer, or each use your own phone (Online → Host, then pick a party game).</p>' : '';
    this.setScreen(
      'party',
      `<div class="logo" style="font-size:44px">🎉 PARTY</div>
       <div class="party-opts">
         <div class="crew-pick">${vs}</div>
         ${cpu}
         <div class="crew-pick small">${LENGTH_NAMES.map((n, i) => `<button class="seg-btn ${o.len === i ? 'on' : ''}" data-nav id="pa-len${i}">${['⚡', '🎯', '🏟️'][i]} ${n}</button>`).join('')}</div>
         ${phoneNote}
       </div>
       <div class="hub party-hub">
         ${tiles}
         <button class="hub-tile party mix" data-nav id="pa-mix">
           <div class="icon">🎲</div>
           <div class="name">Party mix</div>
           <div class="sub">${Math.min(5, games.length)} games in a row, picked at random. Most wins takes the trophy.</div>
           <div class="best">the best way to settle it</div>
         </button>
       </div>
       <p class="party-note">${online ? 'Playing online: you both see the same game; the score is kept here.' : `Online with a friend? <b>Online → Host</b> first, then come back here: they play P2 on their own laptop or phone.`}</p>
       <div class="row"><button class="btn small" data-nav id="pa-back">← Back</button></div>`,
      { back: () => this.showPlay() },
    );
    const again = (id: string) => {
      save();
      this.showParty(id);
    };
    this.bind('pa-friend', () => {
      o.vs = 'friend';
      again('pa-friend');
    });
    this.bind('pa-cpu', () => {
      o.vs = 'cpu';
      again('pa-cpu');
    });
    for (const k of [1, 2, 3])
      this.bind(`pa-lvl${k}`, () => {
        o.cpu = k;
        again(`pa-lvl${k}`);
      });
    for (const i of [0, 1, 2] as PartyLength[])
      this.bind(`pa-len${i}`, () => {
        o.len = i;
        again(`pa-len${i}`);
      });
    for (const g of games) this.bind(`pa-${g.id}`, () => this.playParty(g.id));
    this.bind('pa-mix', () => {
      const list = games.map((g) => g.id).sort(() => Math.random() - 0.5).slice(0, 5);
      this.playParty(list[0], { list, at: 0, wins: [0, 0] });
    });
    this.bind('pa-back', () => this.showPlay());
    this.focusById(focus ?? (games[0] ? `pa-${games[0].id}` : 'pa-back'));
  }

  /** The party games that have an arena (tests). */
  partyGames() {
    return PARTY_GAMES.filter((g) => levelById(`party-${g.id}`)).map((g) => g.id);
  }

  /** Start a party game (as part of a mix, maybe). */
  playParty(game: string, mix?: PartyMix) {
    const info = partyInfo(game);
    let def = levelById(`party-${game}`);
    if (!info || !def) return this.showParty();
    const o = this.partyOpts;
    const len = o.len;
    const params: Record<string, number> = { target: info.targets[len] };
    if (info.times) params.time = info.times[len];
    if (info.gameTimes) params.gameTime = info.gameTimes[len];
    def = {
      ...def,
      name: mix ? `${info.name} · game ${mix.at + 1} of ${mix.list.length}` : info.name,
      hints: [info.how],
      objects: def.objects.map((x) => (x.type === 'hazard' && x.kind === 'party' ? { ...x, params: { ...x.params, ...params } } : x)),
    };
    this.job = { kind: 'party', game, cpu: o.vs === 'cpu' ? o.cpu : 0, len, mix };
    this.playDef(def);
  }

  private showPartyResults(r: SessionResult) {
    const p = r.party!;
    const s = this.game.session!;
    this.resultsFor = 0;
    const job = this.job?.kind === 'party' ? this.job : null;
    const info = partyInfo(p.game);
    const rec = recordParty(p.game, p.winner, p.cpu);
    const hex = (i: number) => `#${(s.players[i]?.color ?? PLAYER_COLORS[i]).toString(16).padStart(6, '0')}`;
    let prize = 0;
    if (p.cpu && p.winner === 0) {
      prize = CPU_PRIZE[p.cpu] ?? 0;
      addCash(prize);
    }
    // a party mix: the running score, and what's next
    const mix = job?.mix;
    let mixBlock = '';
    let next: string | null = null;
    if (mix) {
      if (p.winner >= 0) mix.wins[p.winner]++;
      mix.at++;
      next = mix.at < mix.list.length ? mix.list[mix.at] : null;
      const left = mix.list.length - mix.at;
      // (stop early once nobody can catch up)
      const lead = Math.abs(mix.wins[0] - mix.wins[1]);
      if (next && lead > left) next = null;
      const dots = mix.list
        .map((g, i) => `<span class="${i < mix.at ? 'done' : i === mix.at && next ? 'next' : ''}">${partyInfo(g)?.icon ?? '?'}</span>`)
        .join('');
      const champ: number = mix.wins[0] === mix.wins[1] ? -1 : mix.wins[0] > mix.wins[1] ? 0 : 1;
      mixBlock = `<div class="party-mix"><div class="dots">${dots}</div>
        <div>Party mix: <b style="color:${hex(0)}">${p.names[0]} ${mix.wins[0]}</b> – <b style="color:${hex(1)}">${mix.wins[1]} ${p.names[1]}</b></div>
        ${next ? `<div>Next up: ${partyInfo(next)?.icon} <b>${esc(partyInfo(next)?.name ?? '')}</b></div>` : `<div class="mix-champ">${champ < 0 ? '🤝 The mix is a draw!' : `🏆 <b style="color:${hex(champ)}">${p.names[champ]}</b> takes the party mix!`}</div>`}
      </div>`;
    }
    const title = p.winner < 0 ? 'It’s a draw!' : p.cpu && p.winner === 1 ? 'The computer wins!' : p.cpu ? 'You win!' : `${p.names[p.winner]} wins!`;
    const sub =
      p.winner < 0
        ? 'Nobody could split you.'
        : p.cpu
          ? p.winner === 0
            ? `You beat the ${CPU_NAMES[p.cpu]} computer${p.cpu < 3 ? '. Try a harder one?' : '. Impressive.'}`
            : `The ${CPU_NAMES[p.cpu]} computer got you this time.`
          : ['Bragging rights, for now.', 'Best of three? Best of five?', 'Rematch. Obviously.'][Math.floor(Math.random() * 3)];
    const vsLine = p.cpu ? `<p style="font-size:14px">Vs the ${CPU_NAMES[p.cpu]} computer: ${rec.won[p.cpu]} won · ${rec.lost[p.cpu]} lost</p>` : '';
    const buttons = mix
      ? next
        ? `<button class="btn primary" data-nav data-default id="r-mixnext">Next game →</button>
           <button class="btn" data-nav id="r-party">Stop the mix</button>`
        : `<button class="btn primary" data-nav data-default id="r-mixnew">New party mix</button>
           <button class="btn" data-nav id="r-party">Party games</button>`
      : `<button class="btn primary" data-nav data-default id="r-rematch">Rematch</button>
         <button class="btn" data-nav id="r-party">Another game</button>
         <button class="btn" data-nav id="r-menu">Main menu</button>`;
    this.setScreen(
      'results',
      `<div class="panel results party-results">
        <div class="party-trophy">${p.winner >= 0 ? '🏆' : '🤝'}</div>
        <div class="verdict" style="color:${p.winner >= 0 ? hex(p.winner) : 'var(--ink)'}">${title}</div>
        <p>${sub}</p>
        <div class="party-final"><span class="pf-name" style="background:${hex(0)}">${p.names[0]}</span><b style="color:${hex(0)}">${p.score[0]}</b><i>–</i><b style="color:${hex(1)}">${p.score[1]}</b><span class="pf-name" style="background:${hex(1)}">${p.names[1]}</span></div>
        ${p.line ? `<p style="font-size:16px">${esc(p.line)}</p>` : ''}
        <p style="font-size:15px">${info?.icon ?? ''} ${esc(info?.name ?? p.title)}</p>
        ${prize ? `<p class="party-prize">💵 +${formatMoney(prize)} into the company wallet</p>` : ''}
        ${vsLine}
        ${mixBlock}
        <div class="row">${buttons}</div>
      </div>`,
      { dim: true, back: () => this.showParty() },
    );
    this.audio.sfx(p.winner === 0 || (p.winner === 1 && !p.cpu) ? 'payout' : 'fail');
    this.bind('r-rematch', () => this.playParty(p.game));
    this.bind('r-mixnext', () => mix && next && this.playParty(next, mix));
    this.bind('r-mixnew', () => {
      const list = PARTY_GAMES.filter((g) => levelById(`party-${g.id}`))
        .map((g) => g.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, 5);
      this.playParty(list[0], { list, at: 0, wins: [0, 0] });
    });
    this.bind('r-party', () => {
      this.quitToMenu();
      this.showParty();
    });
    this.bind('r-menu', () => this.quitToMenu());
  }

  showVersus(focus = 'v-ai') {
    this.closeRace();
    this.startAttract();
    const jobs = this.versusJobs();
    const v = this.versus;
    v.job = ((v.job % jobs.length) + jobs.length) % jobs.length;
    const job = jobs[v.job];
    const rival = hasRival(job.id);
    this.setScreen(
      'versus',
      `<div class="logo" style="font-size:44px">⚔️ VERSUS</div>
       <div class="panel boards-panel">
         <p>Two crews, the same job, a load each: <b>first to deliver wins</b>. The other crew shows as see-through ghosts (they can't bump you).</p>
         <div class="board-pick">
           <button class="btn small" data-nav id="v-prev">◀</button>
           <div class="board-title">${CARGO_INFO[job.cargo].icon} Job ${job.order}: ${esc(job.name)}</div>
           <button class="btn small" data-nav id="v-next">▶</button>
         </div>
         <div class="crew-pick">${(Object.keys(RIVAL_PACES) as RivalPace[])
           .map((k) => `<button class="seg-btn ${v.pace === k ? 'on' : ''}" data-nav id="v-pace-${k}">${RIVAL_PACES[k].icon} ${RIVAL_PACES[k].name}</button>`)
           .join('')}</div>
         <div class="versus-btns">
           <button class="btn primary" data-nav data-default id="v-ai" ${rival ? '' : 'disabled'}>🤖 Race the rival crew</button>
           <button class="btn" data-nav id="v-quick">🔎 Quick match online</button>
           <button class="btn" data-nav id="v-host">🌐 Host a race for a friend</button>
           <button class="btn" data-nav id="v-join">🔑 Join a friend's race</button>
         </div>
         <p style="font-size:14px">${rival ? '' : 'No rival crew for this job yet: race a person, or pick another job. '}Quick match finds someone else who's looking; if nobody is, you race the rival crew. Your crew: <b>${this.solo() ? '🤖 you and the robot buddy' : '👥 two players on this keyboard'}</b> (switch on the Play screen).</p>
       </div>
       <div class="row"><button class="btn small" data-nav id="v-back">← Back</button></div>`,
      { back: () => this.showPlay() },
    );
    const go = (d: number) => {
      v.job += d;
      this.showVersus(d < 0 ? 'v-prev' : 'v-next');
    };
    this.bind('v-prev', () => go(-1));
    this.bind('v-next', () => go(1));
    for (const k of Object.keys(RIVAL_PACES) as RivalPace[])
      this.bind(`v-pace-${k}`, () => {
        v.pace = k;
        this.showVersus(`v-pace-${k}`);
      });
    this.bind('v-ai', () => rival && this.startRace(job.id, null, 'ai'));
    this.bind('v-quick', () => this.showQuickMatch());
    this.bind('v-host', () => this.showRaceHost());
    this.bind('v-join', () => this.showRaceJoin());
    this.bind('v-back', () => this.showPlay());
    this.focusById(focus);
  }

  /** Start racing on a job (with this time of day and weather, so both laptops match online). */
  private startRace(id: string, variant: Variant | null, vs: 'ai' | 'online', theirName = 'Friend') {
    let def = levelById(id);
    if (!def) return this.showVersus();
    if (variant) def = withVariant(def, variant);
    this.job = { kind: 'race', id, vs, pace: this.versus.pace };
    this.playDef(def);
    const s = this.game.session!;
    // (just the one ghost crew: your own best run stays out of it)
    s.ghostOn = false;
    s.setRival(vs === 'ai' ? RivalCrew.ai(id, this.versus.pace, s.cargoSize()) : RivalCrew.online(theirName, s.cargoSize()));
    this.race = { wait: vs === 'online', count: vs === 'ai' ? 3 : 0, goAt: performance.now() + 3000, sendT: 0, told: false, mine: null, level: id };
    s.paused = true;
    if (vs === 'online') this.raceLink?.send({ k: 'ready' });
  }

  /** Each frame while racing: the countdown, our crew's whereabouts for the other laptop, who's finished. */
  private raceFrame(dt: number) {
    const r = this.race;
    const s = this.game.session;
    if (!r || !s || this.job?.kind !== 'race') return this.raceShow('');
    if (r.wait) {
      s.paused = true;
      return this.raceShow('<div class="race-wait">Waiting for the other crew…</div>');
    }
    if (r.count > 0) {
      s.paused = true;
      // (the countdown waits while the pause menu's open)
      if (this.screen !== 'playing') {
        r.goAt = performance.now() + r.count * 1000;
        return this.raceShow('');
      }
      // (tests step the game by hand: they count in game time)
      r.count = this.game.manual ? r.count - dt : Math.max(0, (r.goAt - performance.now()) / 1000);
      if (r.count <= 0) {
        s.paused = false;
        this.hud?.banner('GO!');
        this.raceShow('');
      } else this.raceShow(`<div class="race-count">${Math.ceil(r.count)}</div>`);
      return;
    }
    const link = this.raceLink;
    if (link && this.screen === 'playing') {
      r.sendT -= dt;
      if (r.sendT <= 0) {
        r.sendT = 0.1;
        const pts = [s.players[0].bodyPos, s.players[1].bodyPos, s.cargo.position(new THREE.Vector3())];
        link.sendFast({ k: 'p', t: +s.time.toFixed(2), f: pts.flatMap((p) => [Math.round(p.x * 100), Math.round(p.y * 100), Math.round(p.z * 100)]) });
      }
    }
    const rv = s.rival;
    if (rv && !r.told && rv.finish !== null && s.time >= rv.finish && s.state === 'playing') {
      r.told = true;
      this.hud?.banner('🏁 THE OTHER CREW DELIVERED!', true);
    }
  }

  private raceShow(html: string) {
    if (!html) {
      this.raceOverlay?.remove();
      this.raceOverlay = null;
      return;
    }
    if (!this.raceOverlay) {
      this.raceOverlay = document.createElement('div');
      this.raceOverlay.className = 'race-overlay';
      this.hudLayer.append(this.raceOverlay);
    }
    if (this.raceOverlay.innerHTML !== html) this.raceOverlay.innerHTML = html;
  }

  /** Online: what the other laptop says. */
  private onRaceMsg(m: RaceMsg) {
    const s = this.game.session;
    const rv = this.job?.kind === 'race' ? s?.rival : null;
    if (m.k === 'p' && rv && Array.isArray(m.f)) rv.push(Number(m.t), (m.f as unknown[]).map(Number));
    else if (m.k === 'done' && rv) {
      if (m.ok) rv.finish = Number(m.t);
      else rv.out = true;
      this.updateRaceLine();
    } else if (m.k === 'race' && this.raceLink?.role === 'guest') {
      // the host picked a job: go
      this.startRace(String(m.id), (m.variant as Variant) ?? null, 'online', typeof m.name === 'string' ? m.name : 'Friend');
    } else if (m.k === 'ready' && this.raceLink?.role === 'host' && this.race) {
      this.raceLink.send({ k: 'go' });
      this.race.wait = false;
      this.race.count = 3;
      this.race.goAt = performance.now() + 3000;
    } else if (m.k === 'go' && this.race) {
      this.race.wait = false;
      this.race.count = 3;
      this.race.goAt = performance.now() + 3000;
    } else if (m.k === 'bye') {
      if (rv) rv.out = true;
      this.hud?.banner('THE OTHER CREW LEFT', true);
      this.raceLink?.close();
      this.raceLink = null;
      if (this.race?.wait) this.race.wait = false;
      if (this.screen === 'racewait') this.showVersus();
    }
  }

  /** Host: pick the job on the Versus screen, and send it (again, for a rematch). */
  private hostRace() {
    const link = this.raceLink;
    if (!link) return;
    const job = this.versusJobs()[this.versus.job] ?? this.versusJobs()[0];
    let v = null as Variant | null;
    const def = levelById(job.id);
    if (def && !this.game.manual) v = rollVariant(def);
    link.send({ k: 'race', id: job.id, variant: v, name: boardName() ?? 'Friend' });
    this.startRace(job.id, v, 'online', link.theirName);
  }

  private wireRace(link: RaceLink) {
    this.raceLink = link;
    link.onMsg = (m) => this.onRaceMsg(m);
    link.onLost = () => {
      if (this.raceLink !== link) return;
      this.raceLink = null;
      const rv = this.game.session?.rival;
      if (rv) rv.out = true;
      if (this.race) this.race.wait = false;
      this.hud?.banner('LOST THE OTHER CREW', true);
      if (this.screen === 'racewait') this.showVersus();
    };
  }

  private closeRace() {
    this.raceStop?.();
    this.raceStop = null;
    this.raceLink?.close();
    this.raceLink = null;
    this.race = null;
    this.raceShow('');
  }

  private showRaceWait(title: string, text: string) {
    this.startAttract();
    this.setScreen(
      'racewait',
      `<div class="logo" style="font-size:44px">${title}</div>
       <div class="panel" style="text-align:center;max-width:min(640px,92vw)"><div id="rw-text">${text}</div></div>
       <div class="row"><button class="btn small" data-nav data-default id="rw-back">← Back</button></div>`,
      { back: () => this.showVersus() },
    );
    this.bind('rw-back', () => this.showVersus());
  }

  private showRaceHost() {
    this.closeRace();
    this.showRaceWait('🌐 HOST A RACE', '<p>Getting a code…</p>');
    RaceLink.host((code, stop) => {
      this.raceStop = stop;
      const el = this.layer.querySelector('#rw-text');
      if (el)
        el.innerHTML = `<p>Your friend picks <b>Versus → 🔑 Join a friend's race</b> and types:</p><div class="net-code">${code
          .split('')
          .map((c) => `<span>${c}</span>`)
          .join('')}</div><p style="font-size:14px">You'll race <b>${esc(this.versusJobs()[this.versus.job]?.name ?? '')}</b>. Waiting for them…</p>`;
    }).then(
      (link) => {
        this.raceStop = null;
        this.wireRace(link);
        this.hostRace();
      },
      (e) => {
        if ((e as Error).message === 'stopped' || this.screen !== 'racewait') return;
        const el = this.layer.querySelector('#rw-text');
        if (el) el.innerHTML = `<p>Couldn’t start a race: ${esc((e as Error).message)}</p>`;
      },
    );
  }

  private showRaceJoin() {
    this.closeRace();
    this.raceCode = '';
    this.startAttract();
    this.setScreen(
      'racejoin',
      `<div class="logo" style="font-size:44px">🔑 JOIN A RACE</div>
       <div class="panel" style="text-align:center;max-width:min(640px,92vw)">
         <p>Type the code on your friend's screen</p>
         <div class="type-over"><div class="net-code entry" id="rj-show">${this.raceBoxes()}</div>${typeBox('rj-type', false)}</div>
         <p id="rj-msg" style="font-size:14px">&nbsp;</p>
       </div>
       <div class="row">
         <button class="btn primary" data-nav data-default id="rj-go" disabled>Join</button>
         <button class="btn small" data-nav id="rj-back">← Back</button>
       </div>`,
      { back: () => this.showVersus() },
    );
    this.typeBox('rj-type', (t) => {
      this.raceCode = t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
      this.updateRaceCode();
    });
    this.bind('rj-go', () => this.joinRace());
    this.bind('rj-back', () => this.showVersus());
  }

  private raceBoxes() {
    return Array.from({ length: CODE_LEN }, (_, i) => `<span class="${i === this.raceCode.length ? 'cursor' : ''}">${this.raceCode[i] ?? ''}</span>`).join('');
  }

  private updateRaceCode() {
    const el = this.layer.querySelector('#rj-show');
    if (el) el.innerHTML = this.raceBoxes();
    this.layer.querySelector<HTMLButtonElement>('#rj-go')?.toggleAttribute('disabled', this.raceCode.length !== CODE_LEN);
    syncTypeBox(this.layer, 'rj-type', this.raceCode);
  }

  private typeRaceCode(e: KeyboardEvent) {
    if (document.activeElement?.id === 'rj-type') return false;
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.raceCode = this.raceCode.slice(0, -1);
      this.updateRaceCode();
      return true;
    }
    if (e.key === 'Enter' && this.raceCode.length === CODE_LEN) {
      e.preventDefault();
      this.joinRace();
      return true;
    }
    if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (this.raceCode.length < CODE_LEN) this.raceCode += e.key.toUpperCase();
      this.updateRaceCode();
      return true;
    }
    return false;
  }

  private joinRace() {
    if (this.raceCode.length !== CODE_LEN) return;
    const msg = this.layer.querySelector('#rj-msg');
    if (msg) msg.textContent = 'Looking for the race…';
    RaceLink.join(this.raceCode, boardName()).then(
      (link) => {
        this.wireRace(link);
        this.showRaceWait('⚔️ VERSUS', '<p>Connected! Waiting for your friend to start the race…</p>');
      },
      (e) => {
        const m = this.layer.querySelector('#rj-msg');
        if (m) m.textContent = (e as Error).message;
      },
    );
  }

  private showQuickMatch() {
    this.closeRace();
    let secs = 20;
    this.showRaceWait('🔎 QUICK MATCH', `<p>Looking for another crew… <b id="qm-t">${secs}</b></p><p style="font-size:14px">If nobody's around, you'll race the rival crew instead.</p>`);
    const tick = window.setInterval(() => {
      secs--;
      const el = this.layer.querySelector('#qm-t');
      if (el) el.textContent = String(Math.max(0, secs));
      if (this.screen !== 'racewait') clearInterval(tick);
    }, 1000);
    quickMatch(boardName(), 20, (t) => {
      const el = this.layer.querySelector('#rw-text');
      if (el) el.innerHTML = `<p>${esc(t)}</p>`;
    }).then((link) => {
      clearInterval(tick);
      if (this.screen !== 'racewait') {
        link?.close();
        return;
      }
      if (link) {
        this.wireRace(link);
        if (link.role === 'host') this.hostRace();
        else {
          const el = this.layer.querySelector('#rw-text');
          if (el) el.innerHTML = '<p>Found another crew! Waiting for the race to start…</p>';
        }
        return;
      }
      // nobody: the rival crew, on this job if it has one (or any that does)
      const jobs = this.versusJobs();
      let j = this.versus.job;
      if (!hasRival(jobs[j]?.id ?? '')) j = Math.max(0, jobs.findIndex((l) => hasRival(l.id)));
      this.versus.job = j;
      const el = this.layer.querySelector('#rw-text');
      if (el) el.innerHTML = '<p>Nobody else is looking right now. Here comes the rival crew!</p>';
      window.setTimeout(() => this.screen === 'racewait' && hasRival(jobs[j].id) && this.startRace(jobs[j].id, null, 'ai'), 1500);
    });
  }

  /** The race's line on the results card (and again when the other crew finishes later). */
  private raceLine() {
    const s = this.game.session;
    const r = this.race;
    if (!s || !r || this.job?.kind !== 'race') return '';
    const rv = s.rival;
    const mine = r.mine;
    const theirs = rv?.finish ?? null;
    const them = this.job.vs === 'ai' ? 'the rival crew' : (this.raceLink?.theirName ?? 'the other crew');
    if (mine !== null && (theirs === null || mine < theirs))
      return theirs !== null ? `🏆 <b>You won!</b> ${(theirs - mine).toFixed(1)} s ahead of ${esc(them)}` : rv?.out ? `🏆 <b>You won!</b> (${esc(them)} didn't make it)` : `🏆 <b>You delivered first!</b> (they're still going…)`;
    if (theirs !== null) return mine !== null ? `😬 <b>${esc(them)} won</b>, ${(mine - theirs).toFixed(1)} s ahead` : `😬 <b>${esc(them)} won</b>`;
    return rv?.out ? '🤝 Nobody delivered' : `${esc(them.charAt(0).toUpperCase() + them.slice(1))}: still going…`;
  }

  private updateRaceLine() {
    const el = this.layer.querySelector('#r-race');
    if (el && this.screen === 'results') el.innerHTML = this.raceLine();
  }

  // ------------------------------------------------------------ leaderboards

  /** Which board the Leaderboards screen shows: a job (index into the list), duo or solo. */
  private boardView = { job: 0, mode: 'duo' as CrewMode };

  /** The boards: every hand-made job, then today's Daily. */
  private boardJobs() {
    return [...PLAYABLE_LEVELS.filter((l) => !l.hidden).map((l) => ({ key: l.id, name: `Job ${l.order}: ${l.name}`, icon: CARGO_INFO[l.cargo].icon })), { key: `daily-${dailyNumber()}`, name: `Daily #${dailyNumber()}`, icon: '📅' }];
  }

  showBoards(focus = 'b-next') {
    this.startAttract();
    const jobs = this.boardJobs();
    const v = this.boardView;
    v.job = ((v.job % jobs.length) + jobs.length) % jobs.length;
    const job = jobs[v.job];
    const key = boardKey(job.key, v.mode);
    const me = playerId();
    const name = boardName();
    const rows = (list: BoardEntry[], world: boolean) =>
      list.length
        ? `<table class="board">${list
            .map(
              (e, i) =>
                `<tr class="${e.id === me && (world || e.name === (name ?? 'You')) ? 'mine' : ''}"><td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td><td>${e.color ? `<i class="dot" style="background:${esc(e.color)}"></i>` : ''}${esc(e.name)}</td><td>${formatRunTime(e.time)}</td><td>${Math.round(e.health * 100)}%</td></tr>`,
            )
            .join('')}</table>`
        : `<p class="empty">${world ? 'No times yet. Be the first!' : 'No deliveries on this laptop yet.'}</p>`;
    this.setScreen(
      'boards',
      `<div class="logo" style="font-size:44px">🏆 LEADERBOARDS</div>
       <div class="panel boards-panel">
         <div class="board-pick">
           <button class="btn small" data-nav id="b-prev">◀</button>
           <div class="board-title">${job.icon} ${esc(job.name)}</div>
           <button class="btn small" data-nav id="b-next">▶</button>
         </div>
         <div class="crew-pick">
           <button class="seg-btn ${v.mode === 'duo' ? 'on' : ''}" data-nav id="b-duo">👥 Two players</button>
           <button class="seg-btn ${v.mode === 'solo' ? 'on' : ''}" data-nav id="b-solo">🤖 Solo</button>
         </div>
         <div class="board-cols">
           <div><b>🌍 The world</b><div id="b-world"><p class="empty">Fetching the world board…</p></div></div>
           <div><b>💻 This laptop</b>${rows(localBoard(key), false)}</div>
         </div>
         <p style="font-size:14px">${name ? `You're on the world board as <b>${esc(name)}</b>. Your best time goes up when you deliver.` : 'Pick a <b>board name</b> to put your best times on the world board (a nickname, not your real name).'}</p>
       </div>
       <div class="row">
         <button class="btn" data-nav id="b-name">${name ? '✏️ Change board name' : '✏️ Pick a board name'}</button>
         <button class="btn small" data-nav id="b-back">← Back</button>
       </div>`,
      { back: () => this.showPlay() },
    );
    const go = (d: number) => {
      v.job += d;
      this.showBoards(d < 0 ? 'b-prev' : 'b-next');
    };
    this.bind('b-prev', () => go(-1));
    this.bind('b-next', () => go(1));
    this.bind('b-duo', () => {
      v.mode = 'duo';
      this.showBoards('b-duo');
    });
    this.bind('b-solo', () => {
      v.mode = 'solo';
      this.showBoards('b-solo');
    });
    this.bind('b-name', () => this.showBoardName());
    this.bind('b-back', () => this.showPlay());
    this.focusById(focus);
    // the world board arrives a moment later
    const token = (this.boardToken = (this.boardToken ?? 0) + 1);
    worldBoard(key).then(({ ok, entries }) => {
      if (this.screen !== 'boards' || token !== this.boardToken) return;
      const el = this.layer.querySelector('#b-world');
      if (!el) return;
      const mine = entries.findIndex((e) => e.id === me);
      const top = entries.slice(0, 10);
      el.innerHTML = ok
        ? rows(top, true) + (mine >= 10 ? `<p class="you">You: #${mine + 1} of ${entries.length} (${formatRunTime(entries[mine].time)})</p>` : entries.length > 10 ? `<p class="you">${entries.length} on the board</p>` : '')
        : '<p class="empty">Couldn’t reach the world board (no internet, or a network that blocks it). This laptop’s times are still kept.</p>';
    });
  }
  private boardToken = 0;

  /** Typing a board name. */
  private nameDraft = '';

  private showBoardName() {
    this.startAttract();
    this.nameDraft = boardName() ?? '';
    this.setScreen(
      'boardname',
      `<div class="logo" style="font-size:44px">BOARD NAME</div>
       <div class="panel" style="text-align:center;max-width:min(640px,92vw)">
         <p>Type a nickname for the world leaderboard</p>
         <div class="type-over"><div class="net-code entry name-entry" id="bn-show">${esc(this.nameDraft) || '&nbsp;'}</div>${typeBox('bn-type', false, this.nameDraft)}</div>
         <p id="bn-why" style="font-size:14px">2–14 letters, numbers, spaces, - _ or . · <b>Not your real name!</b> Everyone can see it.</p>
       </div>
       <div class="row">
         <button class="btn primary" data-nav data-default id="bn-ok">Save</button>
         <button class="btn" data-nav id="bn-clear">Leave the world board</button>
         <button class="btn small" data-nav id="bn-back">← Back</button>
       </div>`,
      { back: () => this.showBoards() },
    );
    this.typeBox('bn-type', (t) => {
      this.nameDraft = t.slice(0, 14);
      this.updateName();
    });
    this.bind('bn-ok', () => this.saveName());
    this.bind('bn-clear', () => {
      setBoardName(null);
      this.showBoards();
    });
    this.bind('bn-back', () => this.showBoards());
    this.updateName();
  }

  private updateName() {
    const el = this.layer.querySelector('#bn-show');
    if (el) el.textContent = this.nameDraft || ' ';
    const ok = !!cleanName(this.nameDraft);
    const why = this.layer.querySelector('#bn-why');
    if (why && this.nameDraft.trim().length >= 2 && !ok) why.innerHTML = '⚠️ That one can’t go on the board. Letters, numbers, spaces, - _ or . only, and nothing rude.';
    else if (why) why.innerHTML = '2–14 letters, numbers, spaces, - _ or . · <b>Not your real name!</b> Everyone can see it.';
    this.layer.querySelector<HTMLButtonElement>('#bn-ok')?.toggleAttribute('disabled', !ok);
    syncTypeBox(this.layer, 'bn-type', this.nameDraft);
  }

  private saveName() {
    const n = cleanName(this.nameDraft);
    if (!n) return;
    setBoardName(n);
    this.showBoards();
  }

  /** A key on the board name screen: letters and numbers type, Backspace deletes, Return saves. */
  private typeName(e: KeyboardEvent) {
    if (document.activeElement?.id === 'bn-type') return false;
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.nameDraft = this.nameDraft.slice(0, -1);
      this.updateName();
      return true;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.saveName();
      return true;
    }
    if (e.key.length === 1 && /[A-Za-z0-9 _.-]/.test(e.key) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (this.nameDraft.length < 14) this.nameDraft += e.key;
      this.updateName();
      return true;
    }
    return false;
  }

  private playJobNumber() {
    if (this.jobNumber.length !== 6) return;
    const c = this.jobChaos;
    if (c) this.playGenerated('chaos', { seed: Number(this.jobNumber), chaos: c.level, chaosMask: c.mask });
    else this.playGenerated('random', { seed: Number(this.jobNumber) });
  }

  // ------------------------------------------------------------ online

  /** Host or join. */
  showOnline() {
    this.startAttract();
    this.setScreen(
      'online',
      `<div class="logo" style="font-size:44px">PLAY ONLINE</div>
       <div class="panel" style="max-width:min(640px,92vw)">
         <p>Each of you plays on your <b>own laptop or phone</b> (a Chromebook, iPhone or Android is fine). One of you <b>hosts</b>: the game runs there. The other <b>joins</b> with a code.</p>
         <p style="font-size:14px">Free, no accounts. Works on home and school Wi-Fi: if the network won't let the laptops connect directly, the game passes its messages through the matchmaking server instead. The faster laptop should host.</p>
       </div>
       <div class="menu">
         <button class="btn primary" data-nav data-default id="o-host">Host a game</button>
         <button class="btn" data-nav id="o-join">Join a friend</button>
         <button class="btn small" data-nav id="o-check">Check this network</button>
         <button class="btn small" data-nav id="o-back">← Back</button>
       </div>`,
      { back: () => this.showMenu() },
    );
    this.bind('o-host', () => this.showHost());
    this.bind('o-join', () => {
      this.joinCode = '';
      this.showJoin('');
    });
    this.bind('o-check', () => this.showNetCheck());
    this.bind('o-back', () => this.showMenu());
  }

  /** Can this network reach the matchmaking servers, and will a direct link work? Updated in place as each check ends. */
  private showNetCheck() {
    const run = ++this.netCheckRun;
    const icon: Record<string, string> = { wait: '⏳', ok: '✅', warn: '⚠️', bad: '❌' };
    const list = (items: CheckItem[]) =>
      items.map((it) => `<li class="nc-${it.state}" data-check="${it.id}"><span class="nc-icon">${icon[it.state]}</span><b>${esc(it.label)}</b><br><span class="nc-detail">${esc(it.detail)}</span></li>`).join('');
    this.setScreen(
      'netcheck',
      `<div class="logo" style="font-size:44px">NETWORK CHECK</div>
       <div class="panel" style="max-width:min(640px,92vw)">
         <ul class="net-check"></ul>
         <p class="net-check-summary nc-wait"></p>
         <p style="font-size:13px;opacity:0.75">Run it on both laptops. Only one matchmaking server has to work (on both). School Wi-Fi often blocks direct links: that's fine, the game goes through the relay.</p>
       </div>
       <div class="menu">
         <button class="btn primary" data-nav data-default id="nc-again">Check again</button>
         <button class="btn small" data-nav id="nc-back">← Back</button>
       </div>`,
      { back: () => this.showOnline() },
    );
    this.bind('nc-again', () => this.showNetCheck());
    this.bind('nc-back', () => this.showOnline());
    const show = (items: CheckItem[]) => {
      if (run !== this.netCheckRun || this.screen !== 'netcheck') return;
      const ul = this.layer.querySelector('.net-check');
      const sum = this.layer.querySelector<HTMLElement>('.net-check-summary');
      if (ul) ul.innerHTML = list(items);
      const s = checkSummary(items);
      if (sum) {
        sum.className = `net-check-summary nc-${s.state}`;
        sum.textContent = s.text;
      }
    };
    void checkNetwork(show);
  }

  /** How the friend is connected, in words (with the round trip, once it's known). */
  private viaText(via: 'direct' | 'relay' | null, video = false, rtt: number | null = null) {
    const ms = rtt === null ? '' : ` · ${Math.round(rtt)} ms`;
    if (via === 'direct') return (video ? 'connected directly · streaming the picture' : 'connected directly') + ms;
    if (via === 'relay') return `connected through the relay (a little slower)${ms}`;
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
         ${error ? '<button class="btn primary" data-nav data-default id="h-retry">Try again</button><button class="btn" data-nav id="h-check">Check this network</button>' : '<button class="btn primary" data-nav data-default id="h-play">Pick a job →</button>'}
         <button class="btn" data-nav id="h-stop">${h ? 'Stop hosting' : 'Cancel'}</button>
       </div>`,
      { back: () => this.showMenu() },
    );
    this.bind('h-play', () => this.showPlay());
    this.bind('h-retry', () => this.showHost());
    this.bind('h-check', () => this.showNetCheck());
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
          host.onEmote = (kind) => this.emote(1, kind);
          host.onOutfit = (o) => {
            setGuestOutfit(o);
            this.dressMovers();
          };
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
      setGuestOutfit(null);
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
    setGuestOutfit(null);
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
      (h
        ? h.connected
          ? h.quiet > 3
            ? `⚠️ No word from your friend's laptop for ${Math.round(h.quiet)} s… (their Wi-Fi?)`
            : `🌐 Online · your friend is P2 · ${this.viaText(h.via, h.mode === 'video', h.rtt)}`
          : `🌐 Hosting · code ${h.code} · waiting for your friend`
        : '');
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
    // one at a time (they'd sit on top of each other)
    for (const old of document.querySelectorAll('.toast.net-toast')) old.remove();
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
    syncTypeBox(this.layer, 'j-type', this.joinCode);
  }

  private showJoin(status: string, bad = false) {
    this.startAttract();
    const boxes = this.codeBoxes();
    this.setScreen(
      'join',
      `<div class="logo" style="font-size:44px">JOIN A FRIEND</div>
       <div class="panel" style="text-align:center;max-width:min(640px,92vw)">
         <p>Type the code on your friend's screen</p>
         <div class="type-over"><div class="net-code entry">${boxes}</div>${typeBox('j-type', false, this.joinCode)}</div>
         <p class="net-status" ${bad ? 'style="color:var(--bad)"' : ''}>${esc(status) || '&nbsp;'}</p>
         <p style="font-size:14px">Their laptop runs the game; yours shows it. You're <b style="color:var(--p2)">P2</b>: <span class="keys-only">move with <b>WASD</b> or the <b>arrows</b>, whichever you like. <kbd>Esc</kbd> for the online menu.</span><span class="touch-only">play with the stick and buttons on screen; the button in the corner opens the online menu.</span></p>
       </div>
       <div class="row">
         <button class="btn primary" data-nav data-default id="j-go" ${this.joinCode.length === CODE_LEN && !this.joining ? '' : 'disabled'}>Join</button>
         <button class="btn small" data-nav id="j-back">← Back</button>
       </div>`,
      { back: () => (this.joining ? undefined : this.showOnline()) },
    );
    this.bind('j-go', () => this.join());
    this.bind('j-back', () => !this.joining && this.showOnline());
    this.typeBox('j-type', (t) => {
      if (this.joining) return syncTypeBox(this.layer, 'j-type', this.joinCode);
      this.joinCode = t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
      this.updateJoin('');
    });
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
    // our mover wears this laptop's Player 1 outfit; a job pays into our own wallet too
    g.sendOutfit(loadWardrobe().outfits[0]);
    g.onPaid = (r) => {
      const p = track(r, { kind: 'online', online: true }, streak().current);
      const won = p.quests.map(({ quest, item }) => `🏆 ${quest.name}${item ? `: ${item.item.icon} ${item.item.name} unlocked` : ''}`);
      if (p.cash || won.length) this.toast([p.cash ? `💵 +${formatMoney(p.cash)} to your Locker wallet` : '', ...won].filter(Boolean).join(' · '));
    };
    this.pictureTimer = window.setInterval(() => this.video && this.guest?.checkPicture(this.video), 2000);
    // keys go out on a steady beat, however slowly this laptop draws frames
    this.keysTimer = window.setInterval(() => {
      const s = this.game.session;
      this.guest?.sendKeys(this.screen === 'guest' ? this.game.keyboard : null, 1 / 30, s?.mirror ? s : null, this.game.touch);
    }, 1000 / 30);
    this.setScreen('guest', '');
    this.presentGuest(g.mode);
  }

  private menuMirror: HTMLDivElement | null = null;

  private guestBadge() {
    const g = this.guest;
    if (!g) return '';
    if (g.quiet > 3) return `⚠️ No word from your friend's laptop for ${Math.round(g.quiet)} s… (Wi-Fi?)`;
    return `🌐 On your friend's game · ${this.viaText(g.via, g.mode === 'video', g.rtt)}${this.game.touch.active ? '' : ' · Esc: online menu'}`;
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
    let def = m.gen ? generateJob(m.gen) : levelById(m.id);
    if (def && m.gen && m.name) def = { ...def, name: m.name };
    // the host's time of day and weather
    if (def && !m.gen && m.variant) def = withVariant(def, m.variant as Variant);
    if (!def) {
      this.toast('Your friend started a job this copy of the game doesn’t have. You both need the same file.');
      return;
    }
    if (m.cargo && m.cargo !== def.cargo) def = { ...def, cargo: m.cargo as LevelDef['cargo'] };
    this.endGuestLevel();
    this.attract = null;
    // the movers as the host dressed them
    setActiveOutfits(m.outfits ?? null);
    let s: LevelSession;
    try {
      s = this.game.startLevel(def);
    } finally {
      setActiveOutfits(null);
    }
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
  private keysTimer = 0;

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
         ${video ? '' : `<button class="btn" data-nav id="g-gfx">Graphics: ${({ low: 'Fast', medium: 'Balanced', high: 'Pretty' } as const)[this.game.settings.quality]}</button>`}
         <button class="btn" data-nav id="g-leave">Leave</button>
       </div>
       <div class="hint-line">${esc(this.viaText(g.via, video, g.rtt))}. ${
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
    this.bind('g-gfx', () => {
      const st = this.game.settings;
      st.quality = st.quality === 'high' ? 'low' : st.quality === 'low' ? 'medium' : 'high';
      this.game.renderer.setQuality(st.quality);
      this.game.saveSettings();
      this.showGuestMenu();
      this.focusIndex = this.focusables.findIndex((el) => el.id === 'g-gfx');
      this.updateFocus();
    });
    this.bind('g-leave', () => this.leaveGuest());
  }

  private showGuestLost(why: string) {
    const text = why === 'left' ? 'Your friend stopped hosting.' : 'Lost the connection to your friend’s game.';
    // a dropped connection (school Wi-Fi…): the host keeps the same code, so offer to go straight back in
    const again = why !== 'left' && this.joinCode.length === CODE_LEN;
    this.setScreen(
      'guest-lost',
      `<div class="panel" style="text-align:center">
         <h2>Disconnected</h2>
         <p>${text}</p>
         <p style="font-size:14px">${again ? 'Your friend’s game waits for you: rejoin with the same code.' : 'To play again, join with the code on their screen.'}</p>
       </div>
       <div class="row">
         ${again ? `<button class="btn primary" data-nav data-default id="gl-again">Rejoin ${esc(this.joinCode)}</button>` : ''}
         <button class="btn ${again ? '' : 'primary'}" data-nav ${again ? '' : 'data-default'} id="gl-ok">Back to menu</button>
       </div>`,
      { dim: true, back: () => this.leaveGuest() },
    );
    this.bind('gl-again', () => {
      this.leaveGuest();
      this.showJoin('');
      this.join();
    });
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
    clearInterval(this.keysTimer);
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

/** What's being played. */
type Job =
  | { kind: 'level'; id: string }
  | { kind: 'race'; id: string; vs: 'ai' | 'online'; pace: RivalPace }
  | { kind: 'random' | 'daily' | 'chaos' | 'chaosDaily'; gen: GenParams }
  | { kind: 'shift'; gen: GenParams; base: number; round: number; total: number }
  | { kind: 'party'; game: string; cpu: number; len: PartyLength; mix?: PartyMix };

/** Party mix: several party games in a row; whoever wins the most takes it. */
interface PartyMix {
  list: string[];
  at: number;
  wins: [number, number];
}

/** The best endless shift so far. */
interface ShiftBest {
  total: number;
  jobs: number;
}

/** Today's job's key in the saved bests. */
/** Put text on the clipboard (the API, or the old way where it isn't allowed, like some file:// pages). */
async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function dailyId(d = new Date()) {
  return `daily-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** An invisible text box over a code's boxes: on a phone or tablet, tapping them brings up the on-screen keyboard (hidden on a keyboard). */
function typeBox(id: string, digits: boolean, value = '') {
  return `<input class="type-box touch-only" id="${id}" type="text" value="${esc(value)}" aria-label="Code" ${digits ? 'inputmode="numeric" pattern="[0-9]*"' : 'autocapitalize="characters"'} autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go">`;
}

/** Keep a code's text box showing the code (keys typed on a real keyboard go straight to the code). */
function syncTypeBox(layer: HTMLElement, id: string, code: string) {
  const el = layer.querySelector<HTMLInputElement>('#' + id);
  if (el && el.value !== code) el.value = code;
}

function keys(codes: string[], cls: string) {
  return codes.map((c) => `<kbd class="${cls}">${esc(keyLabel(c))}</kbd>`).join('');
}

export { PLAYER_COLORS };

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
