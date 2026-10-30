// The generated-job menus: random job (deliver it, try a new one, replay the
// same number), today's job (best kept), and an endless shift (next job is
// harder; a broken load ends it and the best shift is kept).
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => localStorage.removeItem('ff.shiftBest'));
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(44), JSON.stringify(got));
  };
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const st = () => page.evaluate(() => ({ screen: window.__FF.app.screen, def: window.__FF.game.session?.def && { name: window.__FF.game.session.def.name, gen: window.__FF.game.session.def.gen } }));
  /** Put the load on the drop-off (or break it) and wait for the results card. */
  const finish = async (ok) => {
    await page.evaluate((ok) => {
      const s = window.__FF.game.session;
      if (!ok) return s.cargo.break();
      const g = s.def.goal.pos;
      const V = s.cargo.lastHitPos.constructor;
      for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
      s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
    }, ok);
    for (let i = 0; i < 20 && (await st()).screen !== 'results'; i++) await adv(0.5);
  };
  const click = async (sel) => {
    await page.evaluate((sel) => document.querySelector(sel)?.click(), sel);
    await adv(0.1);
  };

  await page.evaluate(() => window.__FF.app.showLevels());
  const cards = await page.evaluate(() => [...document.querySelectorAll('.level-card.special')].map((c) => c.dataset.gen));
  check('four generated-job cards', cards.join() === 'random,daily,number,shift', cards);
  await shot('genflow_levels');

  // random
  await click('[data-gen="random"]');
  let s = await st();
  check('random job starts', s.screen === 'playing' && s.def?.gen?.label === 'Random job', s);
  const seed1 = s.def.gen.seed;
  await finish(true);
  s = await st();
  check('random job: results', s.screen === 'results', s.screen);
  const seedLine = await page.evaluate(() => document.querySelector('.results')?.textContent.includes('#'));
  check('results show the job number', seedLine, seedLine);
  await shot('genflow_results');
  await click('#r-retry');
  s = await st();
  check('play again: same job number', s.def?.gen?.seed === seed1, [seed1, s.def?.gen?.seed]);
  await finish(true);
  await click('#r-random');
  s = await st();
  check('new random job: a different number', s.def?.gen?.seed !== seed1, s.def?.gen?.seed);

  // daily
  await page.evaluate(() => window.__FF.app.showLevels());
  await click('[data-gen="daily"]');
  s = await st();
  check('daily job starts', s.def?.gen?.label === 'Daily job', s.def?.gen);
  await finish(true);
  await click('#r-levels');
  const dailyBest = await page.evaluate(() => document.querySelector('[data-gen="daily"] .best')?.textContent);
  check("daily card shows today's best", /today's best/.test(dailyBest ?? ''), dailyBest);

  // shift
  await click('[data-gen="shift"]');
  s = await st();
  check('shift job 1', s.def?.gen?.label === 'Shift job 1', s.def?.gen);
  const d1 = s.def.gen.difficulty;
  await finish(true);
  const nextBtn = await page.evaluate(() => !!document.querySelector('#r-shift'));
  check('shift: next job offered', nextBtn, nextBtn);
  await click('#r-shift');
  s = await st();
  check('shift job 2 is harder', s.def?.gen?.label === 'Shift job 2' && s.def.gen.difficulty > d1, s.def?.gen);
  check('shift job 2 shows the total so far', /so far/.test(s.def?.name ?? ''), s.def?.name);
  await finish(false);
  const over = await page.evaluate(() => document.querySelector('.results')?.textContent ?? '');
  check('a break ends the shift', /Shift over/.test(over), over.slice(0, 80));
  await shot('genflow_shift_over');
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('ff.shiftBest') ?? 'null'));
  check('best shift saved', best?.jobs === 1 && best.total > 0, best);
  if (checks.some((c) => !c)) throw new Error('generated-job menus failed');
}
