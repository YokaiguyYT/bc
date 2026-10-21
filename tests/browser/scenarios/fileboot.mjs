// Boot the single-file build from file:// and check models, physics and the menu.
export default async function ({ page, base, shot }) {
  await page.goto(base);
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const info = await page.evaluate(() => {
    const m = window.__FF.models;
    const names = m.names();
    return { models: names.length, placeholders: names.filter((n) => m.isPlaceholder?.(n)).length, screen: window.__FF.app.screen };
  });
  console.log('boot', JSON.stringify(info));
  await page.waitForTimeout(1500);
  await shot('file_title');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await page.click('#m-play');
  await page.waitForTimeout(800);
  await page.click('[data-level="city"]');
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => {
    const s = window.__FF.game.session;
    return { level: s.def.id, time: +s.time.toFixed(1), cargo: s.cargo.kind, health: s.cargo.health };
  });
  console.log('playing', JSON.stringify(s));
  await shot('file_city');
}
