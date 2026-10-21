// HUD + level select at the current VIEWPORT (for checking small / big windows).
export default async function ({ page, base, shot }) {
  const tag = process.env.VIEWPORT ?? '1280x720';
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await adv(1);
  await page.keyboard.press('Enter');
  await adv(0.4);
  await page.click('#m-play');
  await adv(0.4);
  await page.waitForTimeout(600);
  await shot(`size_levels_${tag}`);
  await page.evaluate(() => window.__FF.app.playLevel('delivery'));
  await adv(2);
  await page.waitForTimeout(600);
  await shot(`size_hud_${tag}`);
}
