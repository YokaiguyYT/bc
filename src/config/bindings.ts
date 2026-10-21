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
  // right hand on the arrows, left hand on K and L: two hands, nothing cramped
  p2: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    jump: ['KeyK'],
    grab: ['KeyL'],
  },
  camLeft: ['KeyQ'],
  camRight: ['KeyE'],
  pause: ['Escape', 'KeyP'],
  dev: ['Backquote'],
};

/** One-click layouts for Player 2 (always moving with the arrows). */
export const P2_LAYOUTS: { id: string; name: string; hint: string; jump: string[]; grab: string[] }[] = [
  { id: 'kl', name: 'Arrows + K L', hint: 'Right hand on the arrows, left hand on K (jump) and L (grab).', jump: ['KeyK'], grab: ['KeyL'] },
  { id: 'return', name: 'Arrows + Return', hint: 'Right ⇧ to jump, Return to grab.', jump: ['ShiftRight'], grab: ['Enter'] },
  { id: 'slash', name: 'Arrows + /', hint: 'Right ⇧ or Return to jump, / to grab (the first layout).', jump: ['ShiftRight', 'Enter'], grab: ['Slash'] },
];

/**
 * Player 2's keys from before the K / L layout: everything sat under the right
 * hand next to the arrows. Saved bindings like these move to the new default once.
 */
export function isOldP2Layout(p: PlayerBindings) {
  const arrows = p.up?.[0] === 'ArrowUp' && p.down?.[0] === 'ArrowDown' && p.left?.[0] === 'ArrowLeft' && p.right?.[0] === 'ArrowRight';
  const grabOld = p.grab?.length === 1 && (p.grab[0] === 'Slash' || p.grab[0] === 'Enter');
  const jumpOld = !!p.jump?.length && p.jump.every((c) => c === 'ShiftRight' || c === 'Enter');
  return arrows && grabOld && jumpOld;
}

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
