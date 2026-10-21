// Replays the keyboard event sequences Safari on a Mac produces (including its
// two-Shift-keys quirk) and checks which keys the game thinks are held.
export default async function ({ page, base }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const results = await page.evaluate(() => {
    const kb = window.__FF.game.keyboard;
    const ev = (type, code, mods = {}, repeat = false) =>
      window.dispatchEvent(new KeyboardEvent(type, { code, key: code, repeat, bubbles: true, cancelable: true, ...mods }));
    const held = () => [...kb.down].sort().join(',') || '-';
    const pressed = () => {
      kb.beginFrame();
      return ['ShiftLeft', 'ShiftRight', 'Enter', 'KeyW'].filter((c) => kb.wasPressed([c])).join(',') || '-';
    };
    const cases = [];
    const check = (name, got, want) => cases.push({ name, got, want, ok: got === want });
    const S = { shiftKey: true };
    kb.clear();

    // P1 holds Left ⇧ (grab); P2 taps Right ⇧ (jump). Safari reports P2's release as a keydown.
    ev('keydown', 'ShiftLeft', S);
    pressed();
    ev('keydown', 'ShiftRight', S);
    check('P2 jump press is seen', pressed(), 'ShiftRight');
    ev('keydown', 'ShiftRight', S); // Safari: Right ⇧ released while Left ⇧ held
    check('P2 release is not a second jump', pressed(), '-');
    check('only P1 grab still held', held(), 'ShiftLeft');
    ev('keyup', 'ShiftLeft', {});
    check('P1 lets go', held(), '-');

    // P2 holds Right ⇧; P1 lets go of grab: Safari again sends a keydown.
    ev('keydown', 'ShiftLeft', S);
    ev('keydown', 'ShiftRight', S);
    pressed();
    ev('keydown', 'ShiftLeft', S); // Safari: Left ⇧ released while Right ⇧ held
    check('P1 grab released while P2 holds jump', held(), 'ShiftRight');
    ev('keydown', 'ShiftLeft', S); // P1 grabs again
    check('P1 can grab again', held(), 'ShiftLeft,ShiftRight');
    ev('keyup', 'ShiftRight', S);
    ev('keyup', 'ShiftLeft', {});
    check('both let go', held(), '-');

    // Windows-style auto-repeat of a held Shift must not toggle it off
    ev('keydown', 'ShiftLeft', S);
    ev('keydown', 'ShiftLeft', S, true);
    ev('keydown', 'ShiftLeft', S, true);
    check('auto-repeat keeps Shift held', held(), 'ShiftLeft');
    ev('keyup', 'ShiftLeft', {});

    // a lost Shift keyup is repaired by the next event without the Shift flag
    ev('keydown', 'ShiftRight', S);
    ev('keydown', 'KeyW', {});
    check('missing Shift keyup repaired', held(), 'KeyW');
    ev('keyup', 'KeyW', {});

    // keys released while ⌘ is held never get a keyup on a Mac
    ev('keydown', 'KeyW', {});
    ev('keydown', 'MetaLeft', { metaKey: true });
    ev('keyup', 'MetaLeft', {});
    check('⌘ up clears keys whose keyup was swallowed', held(), '-');
    kb.clear();
    return cases;
  });
  let bad = 0;
  for (const c of results) {
    if (!c.ok) bad++;
    console.log(c.ok ? 'ok  ' : 'FAIL', c.name.padEnd(42), 'got', c.got, c.ok ? '' : `want ${c.want}`);
  }
  if (bad) throw new Error(`${bad} keyboard check(s) failed`);
}
