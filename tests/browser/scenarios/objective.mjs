// Screenshot every job at the start: the arrow should point to the next checkpoint.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  for (const id of ['moveout', 'delivery', 'mansion', 'glass', 'city']) {
    await page.evaluate((id) => window.__FF.app.playLevel(id), id);
    await page.evaluate(() => window.__FF.game.advance(1.2));
    const o = await page.evaluate(() => {
      const el = document.querySelector('.hud .objective');
      return { opacity: el.style.opacity, text: el.textContent, transform: el.style.transform };
    });
    console.log(id, JSON.stringify(o));
    await shot('objective_' + id);
  }
}
