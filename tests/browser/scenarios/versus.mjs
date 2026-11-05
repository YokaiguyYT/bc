// Versus: race the AI rival crew (countdown, their ghosts moving, the banner
// when they deliver, the result, a rematch), race a friend online by code
// (both laptops start together, see each other's crew, and get the same
// result), and quick match (two people looking find each other; nobody about
// means the rival crew). env BOARD_URL (default the local test broker).
export default async function ({ page, base, shot }) {
  const broker = process.env.BOARD_URL ?? 'ws://127.0.0.1:8888';
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(54), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const job = process.env.JOB ?? 'ballroom';

  // ---------------------------------------------------------------- the rival crew (AI)
  await page.goto(base + '?manual=1');
  await ready(page);
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate((job) => {
    const app = window.__FF.app;
    app.versus.job = app.versusJobs().findIndex((l) => l.id === job);
    app.versus.pace = 'hard';
    app.showVersus();
  }, job);
  await adv(0.1);
  await shot('versus_menu');
  await page.evaluate(() => document.getElementById('v-ai').click());
  await adv(0.5);
  const start = await page.evaluate(() => ({ paused: window.__FF.game.session.paused, count: document.querySelector('.race-count')?.textContent, rival: !!window.__FF.game.session.rival }));
  check('AI race: a countdown, and a rival crew', start.paused && /[123]/.test(start.count ?? '') && start.rival, start);
  await adv(3.2);
  const go = await page.evaluate(() => ({ paused: window.__FF.game.session.paused, t: window.__FF.game.session.time }));
  check('…then GO', !go.paused, go);
  const p0 = await page.evaluate(() => window.__FF.game.session.rival.root.children[2].position.toArray());
  await adv(6);
  const p1 = await page.evaluate(() => ({ pos: window.__FF.game.session.rival.root.children[2].position.toArray(), vis: window.__FF.game.session.rival.root.visible }));
  const moved = Math.hypot(p1.pos[0] - p0[0], p1.pos[2] - p0[2]);
  check('the rival crew carries their load along', p1.vis && moved > 2, [+moved.toFixed(2), p1.vis]);
  await shot('versus_rival');
  // we dawdle; they deliver
  const fin = await page.evaluate(() => window.__FF.game.session.rival.finish);
  const banners = [];
  await page.evaluate(() => {
    window.__banners = [];
    new MutationObserver(() => document.querySelectorAll('.banner').forEach((b) => window.__banners.push(b.textContent))).observe(document.body, { childList: true, subtree: true });
  });
  for (let t = 9; t < fin + 2; t += 2) await adv(2);
  banners.push(...(await page.evaluate(() => window.__banners)));
  check('a banner when they deliver', banners.some((b) => /OTHER CREW DELIVERED/.test(b)), [fin, banners.slice(-3)]);
  const deliver = async (p) => {
    await p.evaluate(() => {
      const s = window.__FF.game.session;
      const g = s.def.goal.pos;
      const V = s.cargo.lastHitPos.constructor;
      for (const pl of s.players) for (const h of pl.hands) if (h.grip) pl.release(h);
      s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
    });
  };
  await deliver(page);
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const lost = await page.evaluate(() => document.getElementById('r-race')?.textContent ?? '');
  check('results: the rival crew won', /rival crew won/i.test(lost), lost);
  await shot('versus_lost');
  // rematch, and this time we're quick
  await page.evaluate(() => document.getElementById('r-rematch').click());
  await adv(3.5);
  await deliver(page);
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const won = await page.evaluate(() => document.getElementById('r-race')?.textContent ?? '');
  check('rematch: we win', /You won/.test(won), won);
  await shot('versus_won');

  // ---------------------------------------------------------------- a friend online
  const ctx = await page.context().browser().newContext({ viewport: { width: 640, height: 400 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  const q = `?net=local&board=${encodeURIComponent(broker)}`;
  await Promise.all([host.goto(base + q), guest.goto(base + q)]);
  await Promise.all([ready(host), ready(guest)]);
  await host.evaluate((job) => {
    const app = window.__FF.app;
    app.versus.job = app.versusJobs().findIndex((l) => l.id === job);
    app.showVersus();
    document.getElementById('v-host').click();
  }, job);
  await host.waitForFunction(() => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')), null, { timeout: 20000 });
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.evaluate(() => {
    window.__FF.app.showVersus();
    document.getElementById('v-join').click();
  });
  await guest.keyboard.type(code);
  await guest.keyboard.press('Enter');
  const bothIn = await Promise.all([host, guest].map((p) => p.waitForFunction(() => window.__FF.game.session?.rival && window.__FF.app.screen === 'playing', null, { timeout: 30000 }).then(() => true, () => false)));
  check('online: both laptops start the race', bothIn.every(Boolean), bothIn);
  // (two windows in one browser: typing in the guest's took the focus from the host's, which
  // paused it, as switching away does; on two laptops that doesn't happen)
  const unpause = () => Promise.all([host, guest].map((p) => p.evaluate(() => window.__FF.app.screen === 'paused' && window.__FF.app.resume())));
  await unpause();
  // the countdown, then both going
  const going = await Promise.all([host, guest].map((p) => p.waitForFunction(() => !window.__FF.game.session.paused, null, { timeout: 15000 }).then(() => true, () => false)));
  check('…together, after the countdown', going.every(Boolean), going);
  await host.waitForTimeout(1500);
  const seen = await Promise.all([host, guest].map((p) => p.evaluate(() => ({ vis: window.__FF.game.session.rival.root.visible, tag: window.__FF.game.session.rival.name, job: window.__FF.game.session.def.id }))));
  check('each sees the other crew (and the same job)', seen.every((s) => s.vis) && seen[0].job === seen[1].job, seen);
  await shot('versus_online');
  await host.screenshot({ path: (process.argv[3] ?? '.') + '/versus_online_host.png' }).catch(() => {});
  // the host delivers first, then the guest
  await unpause();
  await deliver(host);
  // (these test windows draw slowly: fast-forward the delivery)
  await host.evaluate(() => window.__FF.game.advance(4));
  await host.waitForFunction(() => window.__FF.app.screen === 'results', null, { timeout: 15000 }).catch(() => {});
  await host.waitForTimeout(1500);
  const hostLine = await host.evaluate(() => document.getElementById('r-race')?.textContent ?? '');
  check('host finishes first: "delivered first"', /delivered first|You won/.test(hostLine), hostLine);
  await unpause();
  await deliver(guest);
  await guest.evaluate(() => window.__FF.game.advance(4));
  await guest.waitForFunction(() => window.__FF.app.screen === 'results', null, { timeout: 15000 }).catch(() => {});
  await guest.waitForTimeout(1500);
  const lines = await Promise.all([host, guest].map((p) => p.evaluate(() => document.getElementById('r-race')?.textContent ?? '')));
  check('host: won; guest: the other crew won', /You won/.test(lines[0]) && /won/.test(lines[1]) && !/You won/.test(lines[1]), lines);
  // leave
  await guest.evaluate(() => document.getElementById('r-versus')?.click());
  await ctx.close();

  // ---------------------------------------------------------------- quick match
  const ctx2 = await page.context().browser().newContext({ viewport: { width: 640, height: 400 } });
  const a = await ctx2.newPage();
  const b = await ctx2.newPage();
  await Promise.all([a.goto(base + q), b.goto(base + q)]);
  await Promise.all([ready(a), ready(b)]);
  await a.evaluate(() => {
    window.__FF.app.showVersus();
    document.getElementById('v-quick').click();
  });
  await a.waitForTimeout(1500);
  await b.evaluate(() => {
    window.__FF.app.showVersus();
    document.getElementById('v-quick').click();
  });
  const matched = await Promise.all([a, b].map((p) => p.waitForFunction(() => window.__FF.game.session?.rival && window.__FF.app.screen === 'playing', null, { timeout: 30000 }).then(() => true, () => false)));
  const kinds = await Promise.all([a, b].map((p) => p.evaluate(() => window.__FF.app.job?.vs)));
  check('quick match: two people looking find each other', matched.every(Boolean) && kinds.every((k) => k === 'online'), [matched, kinds]);
  await ctx2.close();

  // nobody about (no broker): the rival crew instead
  await page.goto(base + '?manual=1&board=0');
  await ready(page);
  await page.evaluate(() => {
    window.__FF.app.showVersus();
    document.getElementById('v-quick').click();
  });
  await page.waitForFunction(() => window.__FF.app.job?.kind === 'race' && window.__FF.app.screen === 'playing', null, { timeout: 15000 }).catch(() => {});
  const fallback = await page.evaluate(() => ({ vs: window.__FF.app.job?.vs, rival: !!window.__FF.game.session?.rival }));
  check('quick match, nobody about: the rival crew', fallback.vs === 'ai' && fallback.rival, fallback);

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
