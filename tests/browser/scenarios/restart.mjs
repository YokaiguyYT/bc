// Restart a job from the pause menu and retry it from the results card: one HUD, never a pile.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const huds = () => page.evaluate(() => document.querySelectorAll('.hud').length);
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(1);
  const one = await huds();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await adv(0.3);
    await page.click('#p-restart');
    await adv(1);
  }
  const afterRestarts = await huds();
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    s.time = 90;
    s.finish(true);
  });
  await adv(1.5);
  await page.click('#r-retry');
  await adv(1);
  const afterRetry = await huds();
  await shot('restart_hud');
  console.log('HUDs: first', one, 'after 3 restarts', afterRestarts, 'after retry', afterRetry);
  if (one !== 1 || afterRestarts !== 1 || afterRetry !== 1) throw new Error('HUDs pile up on restart');
}
