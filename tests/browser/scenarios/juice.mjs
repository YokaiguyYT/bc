// Satisfying feedback: a knock on the load pops what it cost off it ("−$…"),
// slows time for a beat and pushes the camera in; a stretch without a
// scratch pays a bonus at the checkpoint; the delivery is stamped; the
// results card has awards for whoever stood out, and confetti for three stars.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(56), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(1.5);
  // a clean stretch: the load reaches the first checkpoint without a scratch
  // (banners and pops are gone in a second or two, and this renderer is slow: note each one as it appears)
  await page.evaluate(() => {
    window.__seen = [];
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => /banner|world-pop/.test(n.className ?? '') && window.__seen.push(n.textContent)))).observe(document.querySelector('.hud'), { childList: true });
  });
  const seen = () => page.evaluate(() => window.__seen);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const cp = s.def.checkpoints[0];
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) p.releaseAll();
    s.cargo.reset(new V(cp.pos[0], cp.pos[1], cp.pos[2]), 0);
  });
  await adv(0.3);
  let got = await seen();
  const tips0 = await page.evaluate(() => [window.__FF.game.session.tips, window.__FF.game.session.cleans, window.__FF.game.session.tipCount]);
  check('a stretch without a scratch: a bonus at the checkpoint', got.some((t) => /CLEAN STRETCH \+\$/.test(t)) && tips0[0] > 0 && tips0[1] === 1 && tips0[2] === 0, [got, tips0]);
  await shot('juice_clean');
  // the load dropped: what it cost pops off it, time slows for a beat
  await adv(1.5);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const at = s.cargo.body.translation();
    const V = s.cargo.lastHitPos.constructor;
    window.__slow = 0;
    s.events.on('cargoDamage', () => (window.__slow = Math.max(window.__slow, s.slowT)));
    s.cargo.reset(new V(at.x, at.y + 9, at.z), 0);
  });
  let pop = '';
  for (let i = 0; i < 30 && !pop; i++) {
    await adv(0.1);
    await page.waitForTimeout(150);
    pop = (await seen()).find((t) => /^−\$/.test(t)) ?? '';
  }
  const slow = await page.evaluate(() => window.__slow);
  check('a knock: what it cost pops off the load', /^−\$\d/.test(pop), pop);
  check('…and time slows for a beat', slow > 0.04, +slow.toFixed(3));
  await shot('juice_loss');
  // P1 jumps about, then a delivery: the stamp, awards, and the clean-stretch row
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    s.stats[0].jumps = 14;
    s.stats[1].slips = 4;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) p.releaseAll();
    s.cargo.health = 1;
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  let stamp = false;
  for (let i = 0; i < 30 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) {
    await adv(0.3);
    stamp ||= (await seen()).includes('DELIVERED!');
  }
  check('delivered: the stamp', stamp, stamp);
  const res = await page.evaluate(() => ({ awards: [...document.querySelectorAll('.awards span')].map((a) => a.textContent), text: document.querySelector('.results')?.textContent.replace(/\s+/g, ' ').slice(0, 400), confetti: document.querySelectorAll('.confetti i').length, pay: document.getElementById('r-pay')?.textContent }));
  check('results: awards for who stood out', res.awards.length === 2 && res.awards.some((a) => /Butterfingers: P2/.test(a)) && res.awards.some((a) => /Kangaroo: P1/.test(a)), res.awards);
  check('results: the clean stretches are on the bill', /lean stretches \(\d\)/.test(res.text), res.text);
  await shot('juice_results');
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
