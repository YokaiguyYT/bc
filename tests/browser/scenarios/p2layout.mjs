// Player 2's keys: the K / L default, the one-time move off the old cramped
// right-hand layouts (with a note on the menu), and the layout buttons on the
// Controls screen.
export default async function ({ page, base, shot }) {
  const checks = [];
  // key order can differ between browsers' JSON bridges: compare with sorted keys
  const canon = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
  const check = (name, got, want) => checks.push({ name, got: canon(got), want: canon(want), ok: canon(got) === canon(want) });
  const ready = () => page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const state = () =>
    page.evaluate(() => {
      const b = window.__FF.game.keyboard.bindings;
      return {
        p1: { jump: b.p1.jump, grab: b.p1.grab },
        p2: { jump: b.p2.jump, grab: b.p2.grab },
        note: document.body.innerText.includes('New for Player 2'),
        version: localStorage.getItem('ff.bindingsVersion'),
        saved: JSON.parse(localStorage.getItem('ff.bindings') ?? 'null')?.p2?.grab ?? null,
      };
    });
  // start the game with these saved keys (null = a first-time player)
  const boot = async (saved) => {
    await page.goto(base + '?manual=1');
    await ready();
    await page.evaluate((saved) => {
      localStorage.clear();
      if (saved) localStorage.setItem('ff.bindings', JSON.stringify(saved));
    }, saved);
    await page.reload();
    await ready();
    await page.evaluate(() => window.__FF.app.showMenu());
    return state();
  };
  const arrows = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };
  const KL = { jump: ['KeyK'], grab: ['KeyL'] };

  let s = await boot(null);
  check('first time: P2 is K / L', s.p2, KL);
  check('first time: no note', s.note, false);

  s = await boot({ p2: { ...arrows, jump: ['ShiftRight'], grab: ['Enter'] } });
  check('Return layout moves to K / L', s.p2, KL);
  check('…and says so on the menu', s.note, true);
  check('…and is saved', s.saved, ['KeyL']);
  check('…once', s.version, '2');
  await shot('p2_note');
  await page.evaluate(() => window.__FF.app.showControls(() => window.__FF.app.showMenu()));
  await shot('p2_controls');
  check('Controls marks K L as the layout', await page.evaluate(() => document.querySelector('[data-layout].on')?.dataset.layout), 'kl');
  await page.click('#c-back');
  check('note gone after visiting Controls', (await state()).note, false);
  await page.reload();
  await ready();
  await page.evaluate(() => window.__FF.app.showMenu());
  s = await state();
  check('no note after a reload', s.note, false);
  check('still K / L after a reload', s.p2, KL);

  s = await boot({ p2: { ...arrows, jump: ['ShiftRight', 'Enter'], grab: ['Slash'] } });
  check('first layout (/) moves to K / L', s.p2, KL);

  s = await boot({ p1: { jump: ['KeyK'] }, p2: { ...arrows, jump: ['ShiftRight'], grab: ['Slash'] } });
  check('P1 using K gets its default back', s.p1.jump, ['Space']);
  check('…and P2 still moves to K / L', s.p2, KL);

  s = await boot({ p2: { ...arrows, jump: ['ShiftRight'], grab: ['KeyM'] } });
  check('custom P2 keys are left alone', s.p2, { jump: ['ShiftRight'], grab: ['KeyM'] });
  check('…with no note', s.note, false);

  // the layout buttons
  s = await boot({ p1: { grab: ['KeyL'] }, p2: { ...arrows, jump: ['ShiftRight'], grab: ['KeyM'] } });
  check('Controls marks custom keys as no layout', await page.evaluate(() => (window.__FF.app.showControls(() => window.__FF.app.showMenu()), document.querySelector('[data-layout].on')?.dataset.layout ?? 'none')), 'none');
  await page.evaluate(() => window.__FF.app.showControls(() => window.__FF.app.showMenu()));
  await page.click('[data-layout="return"]');
  s = await state();
  check('Arrows + Return button', s.p2, { jump: ['ShiftRight'], grab: ['Enter'] });
  check('…marked as picked', await page.evaluate(() => document.querySelector('[data-layout].on')?.dataset.layout), 'return');
  await page.click('[data-layout="kl"]');
  s = await state();
  check('Arrows + K L button', s.p2, KL);
  check('…takes L off P1 grab, which gets its default back', s.p1.grab, ['ShiftLeft']);
  await page.click('[data-layout="slash"]');
  s = await state();
  check('Arrows + / button', s.p2, { jump: ['ShiftRight', 'Enter'], grab: ['Slash'] });
  await page.click('#c-reset');
  check('reset gives K / L', (await state()).p2, KL);
  await page.evaluate(() => localStorage.clear());

  let bad = 0;
  for (const c of checks) {
    if (!c.ok) bad++;
    console.log(c.ok ? 'ok  ' : 'FAIL', c.name.padEnd(48), 'got', c.got, c.ok ? '' : `want ${c.want}`);
  }
  if (bad) throw new Error(`${bad} check(s) failed`);
}
