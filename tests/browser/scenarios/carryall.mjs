// Two movers carry each cargo type ~5 m and set it down; report damage taken.
export default async function ({ page, base, shot }) {
  const kinds = (process.env.KINDS ?? 'crate,tv,glass,aquarium,clock,cake').split(',');
  for (const kind of kinds) {
    await page.goto(base + `?level=playground&manual=1&cargo=${kind}`);
    await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
    const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
    const setI = (i, o) => page.evaluate(([i, o]) => Object.assign(window.__FF.game.session.players[i].intent, o), [i, o]);
    const st = () => page.evaluate(() => { const s = window.__FF.game.session; const c = s.cargo.body.translation(); return { h: +s.cargo.health.toFixed(3), c: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], grips: s.players.map(p => p.hands.map(h => h.grip ? 1 : 0).join('')), stretch: s.players.map(p => +p.maxGripStretch().toFixed(2)) }; });
    await page.evaluate(() => { const s = window.__FF.game.session; s.scriptedInput = true; });
    // wait for spawn settle (glass/clock may need support)
    await adv(1.3);
    // put the movers on the cargo's left/right sides facing it
    await page.evaluate(() => {
      const s = window.__FF.game.session;
      const c = s.cargo.body.translation();
      const T = window.__FF.game.session.players[0].bodyPos.constructor;
      const half = { crate: 0.45, tv: 0.32, glass: 0.88, aquarium: 0.45, clock: 0.28, cake: 0.37 }[s.cargo.kind] ?? 0.4;
      const gap = s.cargo.kind === 'cake' ? 0.36 : 0.5;
      s.players[0].teleport(new T(c.x - half - gap, 0, c.z), Math.PI / 2);
      s.players[1].teleport(new T(c.x + half + gap, 0, c.z), -Math.PI / 2);
      s.physics.snapLinks();
    });
    await adv(0.4);
    const push = kind === 'cake' ? 0.0 : 0.25;
    await setI(0, { grab: true, moveX: push, moveZ: 0 });
    await setI(1, { grab: true, moveX: -push, moveZ: 0 });
    for (let i = 0; i < 20; i++) { await adv(0.1); const s = await st(); if (s.grips.every(g => g === '11')) break; }
    await setI(0, { moveX: 0 }); await setI(1, { moveX: 0 });
    await adv(0.8);
    const lifted = await st();
    // carry 'up the screen' (-Z) at ~70% stick, ease in/out
    for (const [t, m] of [[0.6, 0.35], [2.2, 0.7], [0.6, 0.3], [0.8, 0]]) {
      await setI(0, { moveZ: -m }); await setI(1, { moveZ: -m });
      await adv(t);
    }
    const carried = await st();
    await shot(`carry_${kind}`);
    // set down: release
    await setI(0, { grab: false }); await setI(1, { grab: false });
    await adv(1.5);
    const end = await st();
    console.log(kind.padEnd(9), 'lifted', JSON.stringify(lifted), '\n          carried', JSON.stringify(carried), '\n          dropped', JSON.stringify(end));
  }
}
