// Build a job: the builder screen (pick a load, a place, the time, line up
// pieces, take one out), a code that makes the same course every time, the
// code typed in by a friend, pieces a load can't do (stairs with a piano),
// playing it, and the guest of an online game getting the same course.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(56), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate(() => {
    localStorage.removeItem('ff.builder');
    window.__FF.app.draft = { cargo: 'crate', theme: 0, time: 'day', rain: false, diff: 1, pieces: [] };
    window.__FF.app.showBuilder();
  });
  await adv(0.1);
  const click = (id) => page.evaluate((id) => document.getElementById(id).click(), id);
  for (const id of ['bd-add-ramp', 'bd-add-door', 'bd-add-corner', 'bd-add-stairs', 'bd-add-slalom', 'bd-cargo-next', 'bd-th-next', 'bd-th-next', 'bd-t-sunset']) await click(id);
  let ui = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.piece-chip')].map((c) => c.textContent.trim()), code: document.getElementById('bd-code')?.textContent, draft: window.__FF.app.draft }));
  check('pieces lined up, a code for it', ui.chips.length === 5 && /^B[0-9A-Z-]+$/.test(ui.code ?? ''), ui);
  await shot('builder');
  // take the door out
  await click('bd-rm1');
  ui = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.piece-chip')].map((c) => c.textContent.trim()), code: document.getElementById('bd-code')?.textContent }));
  check('click a piece in the course: it comes out', ui.chips.length === 4 && !ui.chips.some((c) => /Doorway/.test(c)), ui.chips);
  const code = ui.code;
  // a piano can't do stairs: they're greyed out, and come out of the course
  const piano = await page.evaluate(() => {
    const app = window.__FF.app;
    app.draft.cargo = 'piano';
    app.showBuilder();
    return { stairs: document.getElementById('bd-add-stairs').disabled, chips: [...document.querySelectorAll('.piece-chip')].map((c) => c.textContent.trim()) };
  });
  check("a piano: no stairs (greyed out, taken out)", piano.stairs && !piano.chips.some((c) => /Stairs/.test(c)), piano);
  // the same code, the same course
  const same = await page.evaluate((code) => {
    const gen = window.__FF.gen.generateJob;
    const a = gen({ seed: 1, plan: code });
    const b = gen({ seed: 1, plan: code });
    return { pieces: a.pieces, same: JSON.stringify(a.objects) === JSON.stringify(b.objects), cargo: a.cargo, name: a.name };
  }, code);
  check('the same code makes the same course, with the pieces asked for', same.same && same.pieces.join() === 'ramp,corner,stairs,slalom', same);
  // a friend types it in (lower case, spaces: fine)
  await page.evaluate(() => window.__FF.app.showBuildCode());
  await adv(0.1);
  // (typed into the box by hand, the way a page does it: the WebKit test runner has no fill())
  const type = (text) =>
    page.evaluate((text) => {
      const el = document.getElementById('bc-code');
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, text);
  await type(code.toLowerCase().replace(/-/g, ' '));
  const ok = await page.evaluate(() => !document.getElementById('bc-go').disabled);
  check("a friend's code typed in: Play it lights up", ok, code);
  await type('BZZZZZZZ');
  const bad = await page.evaluate(() => ({ off: document.getElementById('bc-go').disabled, note: document.querySelector('.bc-note')?.textContent }));
  check('a wrong code: no', bad.off && /code/i.test(bad.note ?? ''), bad);
  await type(code);
  await click('bc-go');
  await adv(1);
  const s = await page.evaluate(() => ({ screen: window.__FF.app.screen, job: window.__FF.app.job, def: window.__FF.game.session.def.gen, pay: window.__FF.game.session.def.payScale }));
  check('playing it', s.screen === 'playing' && s.job.kind === 'built' && s.def.plan, s);
  await shot('builder_play');
  // delivered: the results card has the code, and Back to the builder
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) p.releaseAll();
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const res = await page.evaluate(() => ({ text: document.querySelector('.results')?.textContent.replace(/\s+/g, ' ').slice(0, 300), back: !!document.getElementById('r-builder') }));
  check('results: the code, built-job rate, back to the builder', res.back && /code B/.test(res.text ?? '') && /Built-job rate/.test(res.text ?? ''), res);
  await shot('builder_results');
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
