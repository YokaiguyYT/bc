// Online route: when the direct link doesn't come up at first (?p2plate on the
// host: as if the first try failed), the game plays over the slow relay and
// says so, then keeps trying, and moves onto a direct link without dropping
// the game. env WAIT (seconds to allow, default 45).
export default async function ({ page, base }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(58), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const until = (p, fn, ms = 30000) => p.waitForFunction(fn, null, { timeout: ms, polling: 500 }).then(() => true, () => false);
  const ctx = await page.context().browser().newContext({ viewport: { width: 800, height: 500 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  await Promise.all([host.goto(base + '?net=local&p2plate=1'), guest.goto(base + '?net=local')]);
  await Promise.all([ready(host), ready(guest)]);
  await host.evaluate(() => window.__FF.app.showOnline());
  await host.click('#o-host');
  await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.goto(base + `?net=local&join=${code}`);
  await ready(guest);
  check('joined', await until(guest, () => window.__FF.app.screen === 'guest'), code);
  const first = await host.evaluate(() => window.__FF.app.host.via);
  check('at first: the relay (the direct link "failed")', first === 'relay', first);
  await host.evaluate(() => window.__FF.app.playLevel('playground'));
  const line = await until(guest, () => /matchmaking server/.test(document.querySelector('.net-badge')?.textContent ?? ''), 15000);
  check('…and the line on screen says so', line, await guest.evaluate(() => document.querySelector('.net-badge')?.textContent ?? ''));
  const up = await until(host, () => window.__FF.app.host?.via === 'direct', Number(process.env.WAIT ?? 45) * 1000);
  const after = await Promise.all([host, guest].map((p) => p.evaluate(() => (window.__FF.app.host ?? window.__FF.app.guest)?.via)));
  check('it keeps trying, and moves onto a direct link', up && after.every((v) => v === 'direct'), after);
  const still = await guest.evaluate(() => ({ screen: window.__FF.app.screen, level: window.__FF.game.session?.def.id, snaps: window.__FF.game.session?.mirror?.received }));
  check('…without dropping the game', still.screen === 'guest' && still.level === 'playground' && still.snaps > 0, still);
  await ctx.close();
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
