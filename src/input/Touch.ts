import { mergeMoves, MoveState } from './Keyboard';

/** What the on-screen controls show: nothing, just the menu button, or all of them. */
export type TouchShow = 'off' | 'menu' | 'play';

type Act = 'stick' | 'grab' | 'jump' | 'camLeft' | 'camRight' | 'menu';

/** The stick: no move until the thumb is this far out (share of its reach), full speed from here on. */
const DEAD = 0.18;
const FULL = 0.8;

/**
 * On-screen controls for phones and tablets: a stick that appears wherever the
 * left thumb lands, big GRAB (hold) and JUMP (tap) buttons on the right, two
 * small camera buttons and a menu button in the corner. They drive one player
 * (this device's), adding to that player's keys, and only show on a touch
 * screen: any key press hides them again, so a laptop played with the
 * keyboard never sees them.
 */
export class Touch {
  /** A touch screen is in use (a coarse pointer, or touched since the last key press). */
  active = false;
  /** The menu button was tapped (pause, or the online guest's menu). */
  onMenu: (() => void) | null = null;
  /** Jump taps so far (counted, so a quick tap is never lost between frames). */
  jumps = 0;
  private usedJumps = 0;
  private want: TouchShow = 'off';
  private shown: TouchShow = 'off';
  private el: HTMLDivElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  /** Which finger holds what. */
  private holds = new Map<number, { act: Act; el: HTMLElement }>();
  /** The stick's finger: where the stick sits and how far the thumb is from its middle. */
  private stick: { id: number; x: number; y: number; dx: number; dy: number; r: number } | null = null;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'touch-controls';
    this.el.dataset.show = 'off';
    this.el.innerHTML = `
      <div class="tc-zone" data-act="stick"></div>
      <div class="tc-stick"><div class="tc-knob"></div></div>
      <div class="tc-btn tc-grab" data-act="grab">GRAB</div>
      <div class="tc-btn tc-jump" data-act="jump">JUMP</div>
      <div class="tc-small tc-cam" data-act="camLeft">⟲</div>
      <div class="tc-small tc-cam" data-act="camRight">⟳</div>
      <div class="tc-small tc-menu" data-act="menu"><i></i><i></i></div>`;
    document.body.appendChild(this.el);
    this.base = this.el.querySelector('.tc-stick')!;
    this.knob = this.el.querySelector('.tc-knob')!;
    this.el.addEventListener('pointerdown', this.down);
    this.el.addEventListener('pointermove', this.move);
    this.el.addEventListener('pointerup', this.up);
    this.el.addEventListener('pointercancel', this.up);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press on GRAB
    this.setActive(!!window.matchMedia?.('(pointer: coarse)').matches);
    window.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && this.setActive(true), true);
    window.addEventListener('keydown', this.key, true);
    window.addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => document.hidden && this.release());
    // while playing, nothing on the page scrolls or zooms (Safari ignores the viewport's say on zooming)
    document.addEventListener('touchmove', (e) => this.shown === 'play' && e.cancelable && e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  /** What the game wants shown right now (called every frame; shows nothing unless a touch screen is in use). */
  show(s: TouchShow) {
    this.want = s;
    this.apply();
  }

  /** This device's move with the on-screen controls added (the same object back while they're untouched). */
  merge(m: MoveState): MoveState {
    if (!this.stick && !this.holds.size && this.jumps === this.usedJumps) return m;
    return { ...mergeMoves(m, this.read()), world: m.world };
  }

  /** The on-screen controls as a move, like a player's keys (screen right / up). Reading takes the jump taps. */
  read(): MoveState {
    let x = 0;
    let y = 0;
    const s = this.stick;
    if (s) {
      const l = Math.hypot(s.dx, s.dy);
      const k = Math.max(0, Math.min(1, (l / s.r - DEAD) / (FULL - DEAD)));
      if (l > 0) {
        x = (s.dx / l) * k;
        y = (-s.dy / l) * k;
      }
    }
    const jumpPressed = this.jumps > this.usedJumps;
    this.usedJumps = this.jumps;
    return { x, y, jump: this.held('jump'), jumpPressed, grab: this.held('grab') };
  }

  /** The camera buttons: -1, 0 or 1, like Q and E. */
  cam() {
    return (this.held('camRight') ? 1 : 0) - (this.held('camLeft') ? 1 : 0);
  }

  private held(act: Act) {
    for (const h of this.holds.values()) if (h.act === act) return true;
    return false;
  }

  private setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    document.documentElement.classList.toggle('touch', on);
    this.apply();
  }

  private apply() {
    const s = this.active ? this.want : 'off';
    if (s === this.shown) return;
    this.shown = s;
    this.el.dataset.show = s;
    if (s !== 'play') this.release();
  }

  /** Let go of everything (hidden, tab switched…). */
  private release() {
    for (const h of this.holds.values()) h.el.classList.remove('on');
    this.holds.clear();
    this.stick = null;
    this.base.classList.remove('on');
    this.base.style.left = this.base.style.top = '';
    this.knob.style.transform = '';
    this.usedJumps = this.jumps;
  }

  /** A key press means a keyboard is being used: off they go (typing in a text box doesn't count). */
  private key = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.isComposing || e.key === 'Unidentified' || e.keyCode === 229) return;
    this.setActive(false);
  };

  private down = (e: PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    e.preventDefault();
    const act = el.dataset.act as Act;
    if (act === 'stick') {
      if (this.stick) return; // one thumb on the stick
      // the stick comes to the thumb
      const r = this.base.offsetWidth / 2 || 60;
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0, r };
      this.base.style.left = `${e.clientX - r}px`;
      this.base.style.top = `${e.clientY - r}px`;
      this.base.classList.add('on');
    }
    // keep this finger's moves and lift coming here, even off the button
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* (a finger the browser has already let go of) */
    }
    this.holds.set(e.pointerId, { act, el });
    el.classList.add('on');
    if (act === 'jump') this.jumps++;
  };

  private move = (e: PointerEvent) => {
    const s = this.stick;
    if (!s || e.pointerId !== s.id) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const l = Math.hypot(dx, dy);
    if (l > s.r) {
      // past the rim: the stick follows the thumb
      s.x += dx * (1 - s.r / l);
      s.y += dy * (1 - s.r / l);
      dx = e.clientX - s.x;
      dy = e.clientY - s.y;
      this.base.style.left = `${s.x - s.r}px`;
      this.base.style.top = `${s.y - s.r}px`;
    }
    s.dx = dx;
    s.dy = dy;
    this.knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  };

  private up = (e: PointerEvent) => {
    const h = this.holds.get(e.pointerId);
    if (!h) return;
    this.holds.delete(e.pointerId);
    h.el.classList.remove('on');
    if (h.act === 'stick') {
      this.stick = null;
      this.base.classList.remove('on');
      this.base.style.left = this.base.style.top = '';
      this.knob.style.transform = '';
    }
    if (h.act === 'menu' && e.type === 'pointerup') this.onMenu?.();
  };
}
