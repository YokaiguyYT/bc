// Changing keys: a key taken from another action swaps, and the HUD shows the new keys.
export default async function ({ page, base }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const binds = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__FF.game.keyboard.bindings)));
  const rebind = async (p, a, code) => {
    await page.click(`button.rebind[data-p="${p}"][data-a="${a}"]`);
    await page.keyboard.press(code);
    await adv(0.2);
  };
  const checks = [];
  const check = (name, got, want) => checks.push({ name, got: JSON.stringify(got), want: JSON.stringify(want), ok: JSON.stringify(got) === JSON.stringify(want) });

  await page.evaluate(() => window.__FF.app.showControls(() => window.__FF.app.showMenu()));
  await adv(0.3);
  await rebind('p2', 'grab', 'Space'); // P1's jump
  let b = await binds();
  check('P2 grab takes Space', b.p2.grab, ['Space']);
  check('P1 jump gets P2’s old grab key', b.p1.jump, ['KeyL']);
  await rebind('p1', 'up', 'KeyP'); // one of the two pause keys
  b = await binds();
  check('P1 up takes P', b.p1.up, ['KeyP']);
  check('pause keeps Escape', b.pause, ['Escape']);
  await rebind('p1', 'grab', 'Escape'); // Escape cancels
  b = await binds();
  check('Escape cancels a rebind', b.p1.grab, ['ShiftLeft']);
  await page.click('#c-reset');
  await adv(0.2);
  b = await binds();
  check('reset restores P1 jump', b.p1.jump, ['Space']);
  check('reset restores P2 grab', b.p2.grab, ['KeyL']);

  // change a key from the pause menu: the HUD card follows
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(1);
  await page.keyboard.press('Escape');
  await adv(0.3);
  await page.click('#p-controls');
  await adv(0.3);
  await rebind('p1', 'grab', 'KeyF');
  await page.click('#c-back');
  await adv(0.3);
  await page.click('#p-resume');
  await adv(0.3);
  const card = await page.evaluate(() => document.querySelector('.hud .player-card.p1 .keys').textContent);
  check('HUD shows the new grab key', card.includes('grab F'), true);
  await page.evaluate(() => window.__FF.game.keyboard.resetBindings());

  let bad = 0;
  for (const c of checks) {
    if (!c.ok) bad++;
    console.log(c.ok ? 'ok  ' : 'FAIL', c.name.padEnd(40), 'got', c.got, c.ok ? '' : `want ${c.want}`);
  }
  if (bad) throw new Error(`${bad} check(s) failed`);
}
