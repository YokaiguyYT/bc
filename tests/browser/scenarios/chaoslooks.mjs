// Looks check for a few chaos events (screenshots only): blackout, dino, disco, banana peels.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => window.__FF.app.playGenerated('chaos', { seed: 186876, chaos: 5, chaosMask: 15 }));
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await adv(0.5);
  const D = 'window.__FF.game.session.hazards.find((h) => h.trigger)';
  await page.evaluate(`(${D}).nextAt = 1e9`);
  const go = async (id, wait, name) => {
    await page.evaluate(() => window.__FF.game.session.respawnAll(false));
    await adv(0.5);
    await page.evaluate(`(${D}).trigger('${id}')`);
    await adv(wait);
    await shot(name);
    await adv(12);
  };
  await go('blackout', 2.5, 'look_blackout');
  await go('dino', 4.2, 'look_dino');
  await go('disco', 1.0, 'look_disco');
  await go('bananas', 0.4, 'look_bananas');
}
