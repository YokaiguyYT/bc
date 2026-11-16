// The instant replay while hosting a friend online: the host presses "watch it
// again" on the results card, and the friend's screen shows the same replay
// (their copy follows the host's, as ever), then the results card again.
export default async function ({ page, base }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(58), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const until = (p, fn, ms = 30000) => p.waitForFunction(fn, null, { timeout: ms, polling: 200 }).then(() => true, () => false);
  const ctx = await page.context().browser().newContext({ viewport: { width: 420, height: 260 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  // (the host's tab only simulates, in step with the clock: two tabs drawing is too slow to time anything)
  await Promise.all([host.goto(base + '?net=local&manual=1'), guest.goto(base + '?net=local')]);
  await Promise.all([ready(host), ready(guest)]);
  await host.evaluate(() => {
    let last = performance.now();
    let owed = 0;
    setInterval(() => {
      const now = performance.now();
      owed = Math.min(0.2, owed + (now - last) / 1000);
      last = now;
      const n = Math.floor(owed * 60);
      if (n < 1) return;
      owed -= n / 60;
      window.__FF.game.advance(n / 60, 60, false);
    }, 8);
  });
  await host.evaluate(() => window.__FF.app.showOnline());
  await host.click('#o-host');
  await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.goto(base + `?net=local&join=${code}`);
  await ready(guest);
  check('joined', await until(guest, () => window.__FF.app.screen === 'guest'), code);
  await host.evaluate(() => window.__FF.app.playLevel('playground'));
  await until(guest, () => window.__FF.game.session?.mirror?.received > 20);
  await guest.evaluate(() => {
    const r = window.__FF.game.renderer;
    r.setQuality('low');
    r.capWidth = 200;
    r.resize();
  });
  await host.waitForTimeout(2200);
  // a bad drop, then into the drop-off
  await host.evaluate(() => {
    const s = window.__FF.game.session;
    s.scriptedInput = true;
    s.cargo.body.setTranslation({ x: 3, y: 10, z: 4 }, true);
    s.cargo.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  await host.waitForTimeout(5500);
  await host.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    s.cargo.body.setTranslation({ x: g[0], y: g[1] - 0.5, z: g[2] }, true);
    s.cargo.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  const card = await until(host, () => window.__FF.app.screen === 'results' && !!document.querySelector('#r-replay'), 20000);
  check('host: the results card offers the replay', card, await host.evaluate(() => document.querySelector('#r-replay')?.textContent.trim() ?? null));
  const guestCard = await until(guest, () => /Cargo value/.test(document.querySelector('#ui')?.textContent ?? document.body.textContent), 10000);
  check('friend: sees the results card', guestCard, guestCard);
  await host.waitForTimeout(1500);
  const before = await guest.evaluate(() => ({ recv: window.__FF.game.session?.mirror?.received ?? 0, y: window.__FF.game.session?.cargo.body.translation().y ?? null }));
  // the host watches it again: the friend's copy shows it too
  await guest.evaluate(() => {
    window.__ys = [];
    const loop = () => {
      const s = window.__FF.game.session;
      if (s?.mirror) window.__ys.push(+s.cargo.body.translation().y.toFixed(2));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await host.evaluate(() => document.querySelector('#r-replay').click());
  const playing = await until(host, () => !!window.__FF.app.instant, 5000);
  check('host: the replay plays', playing, playing);
  const over = await until(host, () => !window.__FF.app.instant, 30000);
  await host.waitForTimeout(1200);
  const g = await guest.evaluate(() => ({ top: Math.max(...window.__ys), n: window.__ys.length, level: window.__FF.game.session?.def.id, mirror: !!window.__FF.game.session?.mirror, screen: window.__FF.app.screen, card: /Cargo value/.test(document.body.textContent) }));
  check('friend: the crate falls again on their screen too', g.top > 4 && g.level === 'playground' && g.mirror, { top: g.top, frames: g.n, before: before.y });
  check('…and then the results card again, on both', over && g.card && g.screen === 'guest' && (await host.evaluate(() => window.__FF.app.screen === 'results' && !document.querySelector('.replay-banner'))), g);
  // and the game goes on: the host starts the job again, the friend follows
  await host.evaluate(() => document.querySelector('#r-retry').click());
  const on = await until(guest, () => window.__FF.game.session?.mirror?.received > 5 && window.__FF.game.session.state === 'playing' && !/Cargo value/.test(document.body.textContent), 15000);
  check('play again: the friend follows into the new go', on, await guest.evaluate(() => ({ state: window.__FF.game.session?.state, recv: window.__FF.game.session?.mirror?.received })));
  await ctx.close();
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
