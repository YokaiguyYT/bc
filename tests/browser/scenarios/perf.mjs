// CPU cost of simulating each level (no rendering): ms per 60 Hz frame.
// env LEVELS (comma list; default every job).
export default async function ({ page, base }) {
  let ids = process.env.LEVELS?.split(',');
  if (!ids) {
    await page.goto(base + '?manual=1');
    await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
    ids = await page.evaluate(() => window.__FF.game.levels.filter((l) => !l.hidden).map((l) => l.id));
  }
  for (const id of ids) {
    await page.goto(base + `?level=${id}&manual=1`);
    await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
    const r = await page.evaluate(() => {
      const g = window.__FF.game;
      g.session.scriptedInput = true;
      g.advance(1, 60, false); // warm up
      const t0 = performance.now();
      g.advance(5, 60, false);
      const ms = (performance.now() - t0) / 300;
      const s = g.session;
      return { ms: +ms.toFixed(2), bodies: s.physics.world.bodies.len(), colliders: s.physics.world.colliders.len(), hazards: s.hazards.length };
    });
    console.log(id.padEnd(9), JSON.stringify(r));
  }
}
