import { Bindings, DEFAULT_BINDINGS, PlayerBindings } from '../config/bindings';
import { loadJSON, saveJSON } from '../util/storage';

/** Keys we swallow so Safari doesn't scroll the page or do anything else with them. */
const SWALLOW = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Slash',
  'Quote',
  'Tab',
  'Backspace',
  'Enter',
  'Backquote',
]);

export interface MoveState {
  x: number; // -1..1 screen right
  y: number; // -1..1 screen up
  jump: boolean;
  jumpPressed: boolean;
  grab: boolean;
}

/** Modifier keys and the event flag that says whether either of the pair is held. */
const MODIFIERS: Record<string, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'> = {
  ShiftLeft: 'shiftKey',
  ShiftRight: 'shiftKey',
  ControlLeft: 'ctrlKey',
  ControlRight: 'ctrlKey',
  AltLeft: 'altKey',
  AltRight: 'altKey',
  MetaLeft: 'metaKey',
  MetaRight: 'metaKey',
};

/**
 * Tracks physical key state. Robust to the usual Mac/Safari gotchas:
 * - releasing a key while ⌘ is held never sends keyup → we clear on ⌘ up
 * - window blur / tab switch → clear everything
 * - Safari reports releasing one of a modifier pair while the other is held
 *   (Right ⇧ while Left ⇧ is down) as another keydown → a second keydown of a
 *   held modifier means it was released
 * - modifier keyups can go missing → trust e.shiftKey etc. when they say "not held"
 */
export class Keyboard {
  readonly down = new Set<string>();
  private pressedQueue = new Set<string>();
  private pressedFrame = new Set<string>();
  bindings: Bindings;
  /** Called with every key code pressed (for menus and rebinding). */
  onKey: ((code: string, e: KeyboardEvent) => void) | null = null;
  /** While true, the game ignores keys (e.g. a text field has focus). */
  suspended = false;

  constructor() {
    this.bindings = loadBindings();
    window.addEventListener('keydown', this.handleDown, { passive: false });
    window.addEventListener('keyup', this.handleUp, { passive: false });
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
  }

  private handleDown = (e: KeyboardEvent) => {
    if (this.suspended) return;
    const code = e.code || e.key;
    if (SWALLOW.has(code) || code.startsWith('Arrow') || code === 'ShiftLeft' || code === 'ShiftRight') e.preventDefault();
    if (MODIFIERS[code] && !e.repeat && this.down.has(code)) {
      // modifiers never auto-repeat on a Mac: this is Safari reporting a release
      this.down.delete(code);
      return;
    }
    this.syncModifiers(e, code);
    if (!e.repeat) {
      this.pressedQueue.add(code);
      this.onKey?.(code, e);
    }
    this.down.add(code);
  };

  private handleUp = (e: KeyboardEvent) => {
    const code = e.code || e.key;
    if (SWALLOW.has(code)) e.preventDefault();
    this.down.delete(code);
    if (code === 'MetaLeft' || code === 'MetaRight') {
      // macOS swallows keyups of keys released while ⌘ was held
      for (const k of [...this.down]) if (!k.startsWith('Shift') && !k.startsWith('Alt') && !k.startsWith('Control')) this.down.delete(k);
    }
    this.syncModifiers(e, code);
  };

  /** A modifier the event says isn't held can't be down, whatever events we missed. */
  private syncModifiers(e: KeyboardEvent, code: string) {
    for (const k in MODIFIERS) if (k !== code && !e[MODIFIERS[k]]) this.down.delete(k);
  }

  clear() {
    this.down.clear();
    this.pressedQueue.clear();
    this.pressedFrame.clear();
  }

  /** Call once per rendered frame before reading presses. */
  beginFrame() {
    this.pressedFrame = this.pressedQueue;
    this.pressedQueue = new Set();
  }

  isDown(codes: string[]) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  wasPressed(codes: string[]) {
    for (const c of codes) if (this.pressedFrame.has(c)) return true;
    return false;
  }

  /** Anything pressed this frame? */
  anyPressed() {
    return this.pressedFrame.size > 0;
  }

  readPlayer(b: PlayerBindings): MoveState {
    let x = 0;
    let y = 0;
    if (this.isDown(b.right)) x += 1;
    if (this.isDown(b.left)) x -= 1;
    if (this.isDown(b.up)) y += 1;
    if (this.isDown(b.down)) y -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y, jump: this.isDown(b.jump), jumpPressed: this.wasPressed(b.jump), grab: this.isDown(b.grab) };
  }

  saveBindings() {
    saveJSON('ff.bindings', this.bindings);
  }

  resetBindings() {
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.saveBindings();
  }
}

function loadBindings(): Bindings {
  const saved = loadJSON<Partial<Bindings>>('ff.bindings');
  const b: Bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  if (saved) {
    for (const k of Object.keys(b) as (keyof Bindings)[]) {
      const v = saved[k];
      if (!v) continue;
      if (Array.isArray(v)) (b[k] as string[]) = v.filter((x) => typeof x === 'string');
      else if (typeof v === 'object') Object.assign(b[k] as object, v);
    }
  }
  return b;
}
