// Online play when things go wrong: a wrong code, a third player trying to
// join a full game, and the host stopping while the guest is in.
export default async function ({ page, base, out }) {
  const q = process.env.NET ? `?net=${encodeURIComponent(process.env.NET)}` : '?net=local';
  const ctx = await page.context().browser().newContext({ viewport: { width: 560, height: 360 } });
  const [host, a, b] = [await ctx.newPage(), await ctx.newPage(), await ctx.newPage()];
  for (const [n, p] of [['host', host], ['a', a], ['b', b]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await Promise.all([host, a, b].map((p) => p.goto(base + q)));
  await Promise.all([host, a, b].map(ready));
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(40), JSON.stringify(got));
  };
  const until = (p, fn, ms = 20000) => p.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  const status = (p) => p.evaluate(() => document.querySelector('.net-status')?.textContent ?? '');
  const join = async (p, code) => {
    await p.evaluate(() => window.__FF.app.showOnline());
    await p.click('#o-join');
    for (const c of code) await p.keyboard.press(/[0-9]/.test(c) ? `Digit${c}` : `Key${c}`);
    await p.keyboard.press('Enter');
  };

  // a code nobody is hosting
  await join(a, 'QQQQQ');
  const notFound = await until(a, () => /No game found/.test(document.querySelector('.net-status')?.textContent ?? ''));
  check('wrong code: says no game found', notFound, await status(a));
  check('…and stays on the join screen', (await a.evaluate(() => window.__FF.app.screen)) === 'join', await a.evaluate(() => window.__FF.app.screen));

  // host, then two people try to join
  await host.evaluate(() => window.__FF.app.showOnline());
  await host.click('#o-host');
  await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await join(a, code);
  check('first friend gets in', await until(a, () => window.__FF.app.screen === 'guest'), await a.evaluate(() => window.__FF.app.screen));
  await join(b, code);
  const busy = await until(b, () => /already has/.test(document.querySelector('.net-status')?.textContent ?? ''));
  check('third player: game is full', busy, await status(b));
  check('first friend still in', (await a.evaluate(() => window.__FF.app.screen)) === 'guest', await a.evaluate(() => window.__FF.app.screen));

  // the friend's Wi-Fi drops (no goodbye): they're offered Rejoin, and the host lets them straight back in
  await a.evaluate(() => window.__FF.app.guest.conn.lose('timeout'));
  const lost = await until(a, () => window.__FF.app.screen === 'guest-lost' && !!document.querySelector('#gl-again'), 10000);
  check('dropped: Rejoin offered', lost, await a.evaluate(() => [window.__FF.app.screen, document.querySelector('#gl-again')?.textContent]));
  await a.waitForTimeout(5000); // the host notices the silence
  await a.click('#gl-again');
  const back = await until(a, () => window.__FF.app.screen === 'guest', 30000);
  check('Rejoin: back in the game', back, await a.evaluate(() => [window.__FF.app.screen, document.querySelector('.net-status')?.textContent]));
  check('host has its friend again', await until(host, () => window.__FF.app.host?.connected === true, 15000), null);

  // the host stops: the guest is told
  await host.evaluate(() => window.__FF.app.showMenu());
  await host.click('#m-online');
  await host.click('#h-stop');
  const told = await until(a, () => window.__FF.app.screen === 'guest-lost', 15000);
  check('host stops: guest is told', told, await a.evaluate(() => document.querySelector('.net-local .panel')?.textContent.trim().slice(0, 60)));
  await a.keyboard.press('Enter');
  check('guest back at its menu', (await a.evaluate(() => window.__FF.app.screen)) === 'menu', await a.evaluate(() => window.__FF.app.screen));
  check('host badge gone', !(await host.evaluate(() => document.querySelector('.net-badge'))), null);
  await a.screenshot({ path: `${out}/online-errors-guest.png` });
  if (checks.some((c) => !c)) throw new Error('online error handling failed');
}
