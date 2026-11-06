// Two phones, nothing else: on a phone on its side the menus fit (they scroll,
// nothing is cut off), a job played alone gets the robot buddy and the
// turn-the-load buttons, and two phones play online: the host taps through
// hosting and picking a job, its stick drives P1, the guest's stick drives P2.
export default async function ({ page, base }) {
  const out = process.argv[3] ?? 'test-shots';
  const browser = page.context().browser();
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(56), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const until = (p, fn, arg = null, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const phone = { viewport: { width: 750, height: 342 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
  const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  /** Hold the stick right for a moment; how far that phone's player went. */
  const stickWalk = async (p, cdp, who) => {
    const at = () => p.evaluate((who) => {
      const s = window.__FF.game.session;
      const b = s.players[who].body.translation();
      return [b.x, b.z];
    }, who);
    const a = await at();
    await touch(cdp, 'touchStart', [[150, 260, 1]]);
    for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [[150 + i * 16, 260, 1]]);
    await p.waitForTimeout(1500);
    const b = await at();
    await touch(cdp, 'touchEnd', []);
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };

  // ---------------------------------------------------------------- one phone
  {
    const ctx = await browser.newContext(phone);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await p.goto(base + '?manual=1');
    await ready(p);
    await p.evaluate(() => window.__FF.app.showOnline());
    await p.waitForTimeout(300);
    const panel = await p.evaluate(() => {
      const el = document.querySelector('.screen .panel');
      return el ? [el.clientHeight, el.scrollHeight] : null;
    });
    check('phone on its side: the Online panel isn’t cut off', !!panel && panel[1] <= panel[0] + 2, panel);
    await p.screenshot({ path: `${out}/phones_online.png` });
    await p.evaluate(() => window.__FF.app.playLevel('playground'));
    await p.evaluate(() => window.__FF.game.advance(0.5));
    const solo = await p.evaluate(() => ({ buddy: !!window.__FF.game.session.buddy, turn: [...document.querySelectorAll('.tc-turn')].map((e) => getComputedStyle(e).display) }));
    check('a phone on its own plays solo, with turn buttons', solo.buddy && solo.turn.length === 2 && solo.turn.every((d) => d !== 'none'), solo);
    await p.screenshot({ path: `${out}/phones_solo.png` });
    // picking two players by hand is kept
    await p.evaluate(() => {
      window.__FF.app.showPlay();
      document.getElementById('p-duo').click();
      window.__FF.app.playLevel('playground');
    });
    const duo = await p.evaluate(() => !window.__FF.game.session.buddy);
    check('…unless two players is picked', duo, duo);
    await ctx.close();
  }

  // ---------------------------------------------------------------- two phones online
  const ctx = await browser.newContext(phone);
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  await Promise.all([host.goto(base + '?net=local'), guest.goto(base + '?net=local')]);
  await Promise.all([ready(host), ready(guest)]);
  await host.evaluate(() => window.__FF.app.showMenu());
  await host.tap('#m-online');
  await host.tap('#o-host');
  await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.evaluate(() => window.__FF.app.showMenu());
  await guest.tap('#m-online');
  await guest.tap('#o-join');
  const box = await guest.evaluate(() => {
    const r = document.querySelector('.net-code').getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  });
  await guest.touchscreen.tap(box[0], box[1]);
  await guest.keyboard.insertText(code.toLowerCase());
  await guest.tap('#j-go');
  check('phone joins phone by tapping', await until(guest, () => window.__FF.app.screen === 'guest', null, 30000), code);
  // the host taps a job (two windows in one browser: the host's may be paused for losing focus)
  await until(host, () => window.__FF.app.host?.connected, null, 15000);
  await host.evaluate(() => window.__FF.app.playLevel('playground'));
  await host.waitForTimeout(800);
  await Promise.all([host, guest].map((p) => p.evaluate(() => window.__FF.app.screen === 'paused' && window.__FF.app.resume())));
  const hostSide = await host.evaluate(() => ({ buddy: !!window.__FF.game.session.buddy, controls: document.querySelector('.touch-controls')?.dataset.show }));
  check('hosting on a phone: no robot (P2 is the friend), controls show', !hostSide.buddy && hostSide.controls === 'play', hostSide);
  await until(guest, () => document.querySelector('.touch-controls')?.dataset.show === 'play', null, 10000);
  const hostCdp = await ctx.newCDPSession(host);
  const guestCdp = await ctx.newCDPSession(guest);
  const p1 = await stickWalk(host, hostCdp, 0);
  check("the host phone's stick walks P1", p1 > 0.8, +p1.toFixed(2));
  await Promise.all([host, guest].map((p) => p.evaluate(() => window.__FF.app.screen === 'paused' && window.__FF.app.resume())));
  const p2 = await stickWalk(guest, guestCdp, 1);
  // (the guest's mover is shown where the host says it is)
  check("the guest phone's stick walks P2", p2 > 0.5, +p2.toFixed(2));
  await guest.screenshot({ path: `${out}/phones_guest.png` });
  await host.screenshot({ path: `${out}/phones_host.png` });
  await ctx.close();
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
