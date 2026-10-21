// Walk through every menu screen and take a screenshot of each.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const click = async (sel) => {
    await page.click(sel);
    await adv(0.4);
  };
  const back = async () => {
    await page.keyboard.press('Escape');
    await adv(0.4);
  };
  await adv(1.5);
  await shot('ui_title');
  await page.keyboard.press('Enter');
  await adv(0.6);
  await shot('ui_menu');
  await click('#m-play');
  await shot('ui_levels');
  await back();
  await click('#m-howto');
  await shot('ui_howto');
  await back();
  await click('#m-controls');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await adv(0.3);
  await shot('ui_controls');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  await back();
  await click('#m-settings');
  await shot('ui_settings');
  await back();
  await click('#m-credits');
  await shot('ui_credits');
  await back();
  // play job 1, pause, then finish it to see the results card
  await click('#m-play');
  await click('[data-level="moveout"]');
  await adv(2.0);
  await shot('ui_hud');
  await page.keyboard.press('Escape');
  await adv(0.3);
  await shot('ui_pause');
  await page.keyboard.press('Escape');
  await adv(0.3);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    s.time = 97.4;
    s.cargo.health = 0.83;
    s.falls = 1;
    s.finish(true);
  });
  await adv(1.0);
  await shot('ui_results');
  // a failed job
  await page.evaluate(() => window.__FF.app.playLevel('city'));
  await adv(1.0);
  await page.evaluate(() => window.__FF.game.session.cargo.break());
  await adv(3.5);
  await shot('ui_failed');
}
