// Party games online: the host picks a party game while a friend is joined;
// the friend is P2 (no computer), sees the same scoreboard and banners, moves
// P2 with their own keys, and sees the same results card. env GAME (default sumo).
export default async function ({ page, base }) {
  const out = process.argv[3] ?? 'test-shots';
  const game = process.env.GAME ?? 'sumo';
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(58), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const until = (p, fn, arg = null, ms = 20000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const ctx = await page.context().browser().newContext({ viewport: { width: 900, height: 560 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  await Promise.all([host.goto(base + '?net=local'), guest.goto(base + '?net=local')]);
  await Promise.all([ready(host), ready(guest)]);
  await host.evaluate(() => window.__FF.app.showOnline());
  await host.click('#o-host');
  await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.evaluate(() => window.__FF.app.showOnline());
  await guest.click('#o-join');
  await guest.keyboard.type(code);
  await guest.keyboard.press('Enter');
  check('the friend joins', await until(guest, () => window.__FF.app.screen === 'guest', null, 30000), code);
  await until(host, () => window.__FF.app.host?.connected, null, 15000);
  const unpause = () => Promise.all([host, guest].map((p) => p.evaluate(() => window.__FF.app.screen === 'paused' && window.__FF.app.resume())));

  // the Party screen while hosting: the friend is P2
  await host.evaluate(() => {
    Object.assign(window.__FF.app.partyOpts, { vs: 'cpu', cpu: 3 });
    window.__FF.app.showParty();
  });
  const menu = await host.evaluate(() => ({ online: !!document.querySelector('.party-online'), cpuPick: !!document.getElementById('pa-cpu') }));
  check('Party screen while hosting: "your friend plays P2"', menu.online && !menu.cpuPick, menu);
  await host.evaluate((g) => document.getElementById(`pa-${g}`).click(), game);
  await host.waitForTimeout(500);
  await unpause();
  const hs = await host.evaluate(() => ({ cpu: window.__FF.game.session.party?.cpu, buddy: !!window.__FF.game.session.buddy }));
  check('no computer, no robot: P2 is the friend', hs.cpu === 0 && !hs.buddy, hs);
  check('the friend gets the party game', await until(guest, () => !!window.__FF.game.session?.party && !!document.querySelector('.party-board'), null, 20000), game);
  // the countdown, then play
  await unpause();
  // (these test windows draw slowly, and pause each other: fast-forward the countdown)
  await host.evaluate(() => window.__FF.game.advance(3.3));
  check('the countdown, then GO', await until(host, () => window.__FF.game.session.party.phase === 'play', null, 5000), '');
  // the friend walks P2 with their own keys
  const at = () => host.evaluate(() => {
    const b = window.__FF.game.session.players[1].bodyPos;
    return [b.x, b.z];
  });
  const a = await at();
  await guest.keyboard.down('KeyW');
  // (two windows in one browser: pressing keys in the guest's takes the focus from the host's, which
  // pauses it, and the window behind hardly draws; step the host's game along by hand)
  await unpause();
  await guest.waitForTimeout(300);
  await host.evaluate(() => window.__FF.game.advance(0.6));
  if (process.env.DEBUG) console.log(await host.evaluate(() => ({ fps: window.__FF.game.frameTimes.length, t: window.__FF.game.session.physics.time,  screen: window.__FF.app.screen, paused: window.__FF.game.session.paused, intent: window.__FF.game.session.players[1].intent, inp: window.__FF.game.session.input?.player(1), phase: window.__FF.game.session.party.phase })), await guest.evaluate(() => ({ screen: window.__FF.app.screen, down: [...window.__FF.game.keyboard.down] })));
  await guest.waitForTimeout(800);
  await guest.keyboard.up('KeyW');
  const b = await at();
  const moved = Math.hypot(b[0] - a[0], b[1] - a[1]);
  check("the friend's keys move P2 on the host", moved > 0.6, +moved.toFixed(2));
  // a point to P1: both scoreboards say so
  await unpause();
  await host.evaluate(() => window.__FF.game.session.party.endRound(0));
  await until(guest, () => /1[–-]0/.test(document.querySelector('.party-board .pb-score')?.textContent ?? ''), null, 8000);
  const boards = await Promise.all([host, guest].map((p) => p.evaluate(() => document.querySelector('.party-board .pb-score')?.textContent.replace(/\s+/g, ''))));
  check('both scoreboards: 1–0', boards.every((t) => /^P11[–-]0P2$/.test(t ?? '')), boards);
  await guest.screenshot({ path: `${out}/party_online_guest.png` });
  // P1 takes the game: the same results card on both
  await host.evaluate(() => {
    const g = window.__FF.game.session.party;
    g.score[0] = g.target - 1;
    g.endRound(0);
  });
  await host.evaluate(() => window.__FF.game.advance(7));
  await until(host, () => window.__FF.app.screen === 'results', null, 15000);
  const res = await Promise.all([host, guest].map((p) => until(p, () => /P1 wins!/.test(document.querySelector('.party-results')?.textContent ?? ''), null, 15000)));
  check('both see "P1 wins!"', res.every(Boolean), res);
  await guest.screenshot({ path: `${out}/party_online_results.png` });
  await ctx.close();
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
