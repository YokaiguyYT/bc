// CPU cost of simulating each level (no rendering): ms per 60 Hz frame.
export default async function ({ page, base }) {
  for (const id of ['moveout', 'delivery', 'mansion', 'glass', 'city']) {
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
