// Restart every job several times and watch GPU resources and the JS heap:
// they should level off, not grow with each restart.
export default async function ({ page, base }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const levels = await page.evaluate(() => window.__FF.game.levels.map((l) => l.id));
  const sample = () =>
    page.evaluate(() => {
      window.gc?.();
      const r = window.__FF.game.renderer.renderer;
      const sc = window.__FF.game.renderer.scene;
      let objects = 0;
      sc.traverse(() => objects++);
      return {
        geo: r.info.memory.geometries,
        tex: r.info.memory.textures,
        prog: r.info.programs?.length ?? 0,
        objects,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
      };
    });
  const rounds = Number(process.env.ROUNDS ?? 4);
  const rows = [];
  for (let round = 0; round < rounds; round++) {
    for (const id of levels) {
      await page.evaluate((id) => window.__FF.app.playLevel(id), id);
      await page.evaluate(() => window.__FF.game.advance(1.0));
    }
    await page.evaluate(() => window.__FF.app.quitToMenu());
    await page.evaluate(() => window.__FF.game.advance(0.5));
    rows.push({ round, ...(await sample()) });
    console.log('after round', round, JSON.stringify(rows.at(-1)));
  }
  const first = rows[1] ?? rows[0];
  const last = rows.at(-1);
  const grew = (k, slack) => last[k] - first[k] > slack;
  if (grew('geo', 10) || grew('tex', 4) || grew('objects', 50)) throw new Error('resources keep growing across restarts');
}
