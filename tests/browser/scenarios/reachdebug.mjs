export default async function ({ page, base, shot }) {
  await page.goto(base + `?level=playground&manual=1&cargo=cake`);
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate(() => { const s = window.__FF.game.session; s.scriptedInput = true; });
  await adv(1.3);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const c = s.cargo.body.translation();
    const T = s.players[0].bodyPos.constructor;
    s.players[0].teleport(new T(c.x - 0.73, 0, c.z), Math.PI / 2);
    s.players[1].teleport(new T(c.x + 5, 0, c.z), -Math.PI / 2);
    s.physics.snapLinks();
    s.focusOverride = () => [s.cargo.position(new T()), s.players[0].bodyPos.clone()];
    window.__FF.tuning.camera.minDistance = 3; window.__FF.tuning.camera.pitch = 20;
  });
  await adv(0.3);
  await page.evaluate(() => { window.__FF.game.session.players[0].intent.grab = true; });
  for (let i = 0; i < 6; i++) {
    await adv(0.25);
    const d = await page.evaluate(() => {
      const p = window.__FF.game.session.players[0];
      const r = (v) => v ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] : null;
      const hw = (i) => r(p.handWorld(i, new p.bodyPos.constructor()));
      return { body: r(p.bodyPos), reach: p.hands.map(h => r(h.reach)), hands: [hw(0), hw(1)], grips: p.hands.map(h => !!h.grip), reachLow: +p['reachLow'].toFixed(2), state: p.state };
    });
    console.log(JSON.stringify(d));
  }
  await shot('reachdebug');
}
