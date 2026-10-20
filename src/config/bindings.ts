/**
 * Keyboard bindings use KeyboardEvent.code (physical key position), so they work
 * the same on any layout and aren't affected by Shift/Option changing the
 * character produced.
 */
export interface PlayerBindings {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  jump: string[];
  grab: string[];
}

export interface Bindings {
  p1: PlayerBindings;
  p2: PlayerBindings;
  camLeft: string[];
  camRight: string[];
  pause: string[];
  dev: string[];
}

export const DEFAULT_BINDINGS: Bindings = {
  p1: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    jump: ['Space'],
    grab: ['ShiftLeft'],
  },
  p2: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['ShiftRight', 'Enter'],
    grab: ['Slash'],
  },
  camLeft: ['KeyQ'],
  camRight: ['KeyE'],
  pause: ['Escape', 'KeyP'],
  dev: ['Backquote'],
};

/** Pretty names for codes shown in the UI (Mac keyboard flavoured). */
export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Left ⇧',
    ShiftRight: 'Right ⇧',
    Enter: 'Return',
    Slash: '/',
    Period: '.',
    Comma: ',',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    AltLeft: 'Left ⌥',
    AltRight: 'Right ⌥',
    ControlLeft: 'Left ⌃',
    ControlRight: 'Right ⌃',
    MetaLeft: 'Left ⌘',
    MetaRight: 'Right ⌘',
    Tab: 'Tab',
    CapsLock: 'Caps',
    Escape: 'Esc',
    Backspace: 'Delete',
  };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}
