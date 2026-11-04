// Hand-made jobs come out different each play (time of day; rain or snow on
// some), and some have bonus goals that pay once, the first time.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1&variety');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => {
    localStorage.removeItem('ff.goals');
    localStorage.setItem('ff.wardrobe', JSON.stringify({ cash: 0, owned: [], done: [] }));
  });
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(46), JSON.stringify(got));
  };
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const seen = [];
  for (let i = 0; i < 14; i++) {
    await page.evaluate(() => window.__FF.app.playLevel('moveout'));
    await adv(0.05);
    seen.push(await page.evaluate(() => window.__FF.game.session.def.variant));
  }
  const times = new Set(seen.map((v) => v?.time));
  check('different times of day', times.size >= 2, [...times]);
  check('rain sometimes', seen.some((v) => v?.weather === 'rain'), seen.map((v) => v?.weather ?? '-').join(' '));
  // a rainy one: wet floors, drops falling
  const rainy = seen.findIndex((v) => v?.weather === 'rain');
  if (rainy >= 0) {
    for (let i = 0; i < 30; i++) {
      await page.evaluate(() => window.__FF.app.playLevel('moveout'));
      if (await page.evaluate(() => window.__FF.game.session.def.weather === 'rain')) break;
    }
    await adv(1);
    const wet = await page.evaluate(() => window.__FF.game.session.sim.wet);
    check('rain makes the floors wet', wet === true, wet);
    await shot('variety_rain');
  }
  // the museum is always at night
  await page.evaluate(() => window.__FF.app.playLevel('museum'));
  check('the museum never varies', !(await page.evaluate(() => window.__FF.game.session.def.variant)), null);

  // bonus goals: deliver move-out day with no falls, under 1:45
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(0.5);
  const hint = await page.evaluate(() => window.__FF.game.session.def.hints[0]);
  check('the bonus goals are named at the start', /Bonus goals/.test(hint), hint);
  const cash0 = await page.evaluate(() => JSON.parse(localStorage.getItem('ff.wardrobe')).cash);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const goals = await page.evaluate(() => document.querySelector('.results .goals')?.textContent ?? '');
  const cash1 = await page.evaluate(() => JSON.parse(localStorage.getItem('ff.wardrobe')).cash);
  const payout = await page.evaluate(() => window.__FF.game.session.result.payout);
  check('both goals met, bonus paid', (goals.match(/✅/g) ?? []).length === 2 && cash1 === cash0 + payout + 2 * 60, [goals.replace(/\s+/g, ' '), cash0, payout, cash1]);
  await shot('variety_goals');
  // again: met, but no second bonus
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(0.5);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const again = await page.evaluate(() => document.querySelector('.results .goals')?.textContent ?? '');
  check('…paid once only', /done before/.test(again), again.replace(/\s+/g, ' '));
  await page.evaluate(() => window.__FF.app.showLevels());
  const card = await page.evaluate(() => document.querySelector('[data-level="moveout"] .goals-done')?.textContent ?? '');
  check('the job card shows 2/2 goals', /2\/2/.test(card), card);
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
