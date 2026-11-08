// Screenshots of the main menu, the Play hub, Quick job, the Party screen and a party pause menu (to look at, no checks).
export default async function ({ page, base, out }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  for (const [name, fn] of [['menu', 'showMenu'], ['play', 'showPlay'], ['quick', 'showQuick'], ['party', 'showParty']]) {
    await page.evaluate((fn) => window.__FF.app[fn](), fn);
    await adv(0.3);
    await page.screenshot({ path: `${out}/look_${name}.png` });
  }
  await page.evaluate(() => { const app = window.__FF.app; Object.assign(app.partyOpts, { vs: 'cpu', cpu: 2, len: 1 }); app.playParty('sumo'); });
  await adv(1);
  await page.evaluate(() => window.__FF.app.pause());
  await adv(0.2);
  await page.screenshot({ path: `${out}/look_pause.png` });
}
