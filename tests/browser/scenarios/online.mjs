// Online play between two tabs (host and guest), signalling over a
// BroadcastChannel (?net=local) so no internet is needed. The guest joins with
// the code, sees the host's menus, gets the host's job drawn on its own screen
// (light mode) in step with the host, drives P2 with either key layout, can
// pause, switches to the streamed picture and back, and leaves.
//
// ONLY=relay runs it with the direct link switched off (as on a school network
// that blocks it); ONLY=direct with the relay off.
// NET=ws://127.0.0.1:9000/peerjs uses a PeerJS server run locally instead of the
// BroadcastChannel; NET=peerjs the real public one; NET=mqtt with
// MQTT=ws://127.0.0.1:8888 an MQTT broker run locally (both: NET=ws://… MQTT=ws://…).
export default async function ({ page, base, out }) {
  const params = new URLSearchParams();
  const net = process.env.NET;
  if (!net) params.set('net', 'local');
  else if (net !== 'peerjs') params.set('net', net);
  if (process.env.MQTT) params.set('mqtt', process.env.MQTT);
  if (process.env.ONLY === 'relay') params.set('p2p', '0');
  if (process.env.ONLY === 'direct') params.set('relay', '0');
  const q = params.toString() ? '?' + params : '';
  // both tabs in one browser context, so the BroadcastChannel reaches across
  const ctx = await page.context().browser().newContext({ viewport: { width: 640, height: 400 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  await guest.setViewportSize({ width: 560, height: 360 });
  for (const [n, p] of [
    ['host', host],
    ['guest', guest],
  ]) {
    p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`[${n}]`, m.type(), m.text()));
    p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  }
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await Promise.all([host.goto(base + q), guest.goto(base + q)]);
  await Promise.all([ready(host), ready(guest)]);

  const checks = [];
  const check = (name, ok, got) => {
    checks.push({ name, ok, got });
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(46), JSON.stringify(got));
  };
  const until = async (p, fn, arg, ms = 20000) => {
    try {
      await p.waitForFunction(fn, arg, { timeout: ms });
      return true;
    } catch {
      return false;
    }
  };

  // host: menu → Play Online → Host a game
  await host.evaluate(() => window.__FF.app.showMenu());
  await host.click('#m-online');
  await host.click('#o-host');
  const gotCode = await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  check('host gets a code', gotCode, code);

  // guest: Play Online → Join a friend → type the code → Return
  await guest.evaluate(() => window.__FF.app.showOnline());
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('Enter');
  for (const c of code) await guest.keyboard.press(/[0-9]/.test(c) ? `Digit${c}` : `Key${c}`);
  await guest.keyboard.press('Enter');
  const joined = await until(guest, () => window.__FF.app.screen === 'guest');
  check('guest connects', joined, await guest.evaluate(() => window.__FF.app.screen + ' ' + (document.querySelector('.net-status')?.textContent ?? '')));
  const hostSees = await until(host, () => document.querySelector('.net-status')?.textContent.includes('in!'));
  check('host sees the friend arrive', hostSees, await host.evaluate(() => document.querySelector('.net-status')?.textContent));
  const want = process.env.ONLY === 'relay' ? 'relay' : 'direct';
  const route = await until(guest, (w) => window.__FF.app.guest?.via === w, want, 25000);
  check(`guest connected ${want}`, route, await guest.evaluate(() => window.__FF.app.guest?.via));
  const mirror = await until(guest, () => document.getElementById('ui').textContent.includes('HOSTING'));
  check("guest sees the host's menu", mirror, await guest.evaluate(() => document.getElementById('ui').textContent.slice(0, 50)));

  // host starts the practice yard: the guest builds it and follows along
  await host.evaluate(() => window.__FF.app.playLevel('playground'));
  const built = await until(guest, () => window.__FF.game.session?.mirror && window.__FF.game.session.def.id === 'playground');
  check('guest builds the same job', built, await guest.evaluate(() => window.__FF.game.session?.def.id));
  const hud = await until(guest, () => !!document.querySelector('#ui .hud .cargo-card'));
  check('guest has its own HUD', hud, hud);
  const p1card = await guest.evaluate(() => document.querySelectorAll('.player-card .keys')[0]?.textContent);
  check('guest HUD: P1 is the friend', /friend/.test(p1card ?? ''), p1card);
  const snaps = await until(guest, () => window.__FF.game.session?.mirror?.received > 10);
  check('snapshots arrive', snaps, await guest.evaluate(() => window.__FF.game.session?.mirror?.received));
  await host.waitForTimeout(1500);

  const hostPos = () => host.evaluate(() => [...window.__FF.game.session.players.map((p) => { const t = p.body.translation(); return [t.x, t.z]; }), window.__FF.game.session.physics.time]);
  const guestPos = () => guest.evaluate(() => window.__FF.game.session.players.map((p) => { const t = p.body.translation(); return [t.x, t.z]; }));
  const speed = (a, b, i) => Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]) / Math.max(0.05, a[2] - b[2]);
  const before = await hostPos();
  // the guest walks with the arrows (P1-style WASD would work too), into open floor
  await guest.keyboard.down('ArrowRight');
  await guest.keyboard.down('ArrowDown');
  await guest.waitForTimeout(1500);
  await guest.keyboard.up('ArrowRight');
  await guest.keyboard.up('ArrowDown');
  await host.waitForTimeout(400);
  const after = await hostPos();
  check("guest's keys move P2 (m/s)", speed(after, before, 1) > 0.8, +speed(after, before, 1).toFixed(2));
  check('…and not P1', speed(after, before, 0) < 0.3, +speed(after, before, 0).toFixed(2));
  const b2 = await hostPos();
  // (back up the yard: down there is the fence)
  await guest.keyboard.down('KeyW');
  await guest.waitForTimeout(1000);
  await guest.keyboard.up('KeyW');
  await host.waitForTimeout(400);
  const a2 = await hostPos();
  check('guest WASD moves P2 too (m/s)', speed(a2, b2, 1) > 0.8, +speed(a2, b2, 1).toFixed(2));
  const b3 = await hostPos();
  await host.keyboard.down('ArrowLeft');
  await host.waitForTimeout(1000);
  await host.keyboard.up('ArrowLeft');
  await host.waitForTimeout(400);
  const a3 = await hostPos();
  check("host's arrows move P1 (m/s)", speed(a3, b3, 0) > 0.8, +speed(a3, b3, 0).toFixed(2));
  // emotes: the guest's 1 key pops a bubble over P2 on both screens; the host's 2 over P1
  const bubble = (p, i) => p.evaluate((i) => { const el = document.querySelectorAll('.hud .tags .say')[i]; return el?.classList.contains('show') ? el.textContent : ''; }, i);
  await guest.keyboard.press('Digit1');
  const saidHost = await until(host, () => document.querySelectorAll('.hud .tags .say')[1]?.classList.contains('show'), null, 8000);
  const saidGuest = await until(guest, () => document.querySelectorAll('.hud .tags .say')[1]?.classList.contains('show'), null, 8000);
  check("guest's emote shows over P2 on both", saidHost && saidGuest, [await bubble(host, 1), await bubble(guest, 1)]);
  await host.keyboard.press('Digit2');
  const said1 = await until(guest, () => document.querySelectorAll('.hud .tags .say')[0]?.classList.contains('show'), null, 8000);
  check("host's emote shows over P1 on the guest", said1, await bubble(guest, 0));
  // once everyone stands still (and the guest's clock has caught up), its copy should match the host's
  const tStill = await host.evaluate(() => window.__FF.game.session.physics.time + 1.2);
  await until(host, (t) => window.__FF.game.session.physics.time > t, tStill, 30000);
  await until(guest, (t) => window.__FF.game.session.physics.time > t, tStill, 30000);
  const hp = await hostPos();
  const gp = await guestPos();
  const off = Math.max(...gp.map((g, i) => Math.hypot(g[0] - hp[i][0], g[1] - hp[i][1])));
  check("guest's copy matches the host (m)", off < 0.15, +off.toFixed(3));
  await guest.screenshot({ path: `${out}/online-guest-light.png` });
  await host.screenshot({ path: `${out}/online-host-light.png` });

  // a checkpoint/banner-style event and the cargo's health reach the guest: knock the crate about on the host
  const h0 = await guest.evaluate(() => window.__FF.game.session.cargo.health);
  await host.evaluate(() => {
    const c = window.__FF.game.session.cargo;
    c.damage(0.2, 3);
  });
  const hurt = await until(guest, (h) => window.__FF.game.session.cargo.health < h - 0.1, h0, 5000);
  check('cargo damage reaches the guest', hurt, await guest.evaluate(() => window.__FF.game.session.cargo.health));

  // guest: Esc → Pause the game → the host pauses, and the guest sees its pause menu
  await guest.keyboard.press('Escape');
  check('guest Esc opens the online menu', (await guest.evaluate(() => window.__FF.app.screen)) === 'guest-menu', await guest.evaluate(() => window.__FF.app.screen));
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('Enter');
  const paused = await until(host, () => window.__FF.app.screen === 'paused', null, 5000);
  check('guest can pause the game', paused, await host.evaluate(() => window.__FF.app.screen));
  const pausedMirror = await until(guest, () => document.getElementById('ui').textContent.includes('PAUSED'), null, 5000);
  check('guest sees the pause menu', pausedMirror, pausedMirror);
  await host.evaluate(() => window.__FF.app.resume());
  const unpaused = await until(guest, () => !document.getElementById('ui').textContent.includes('PAUSED'), null, 5000);
  check('…and it goes away on resume', unpaused, unpaused);

  if (process.env.ONLY !== 'relay') {
    // switch to the streamed picture and back
    await guest.keyboard.press('Escape');
    await guest.keyboard.press('ArrowDown');
    await guest.keyboard.press('ArrowDown');
    await guest.keyboard.press('Enter');
    const vid = await until(guest, () => window.__FF.app.guest?.mode === 'video' && document.querySelector('.net-video')?.videoWidth > 0, null, 15000);
    check('video mode: the picture arrives', vid, await guest.evaluate(() => [window.__FF.app.guest?.mode, document.querySelector('.net-video')?.videoWidth]));
    const vhud = await until(guest, () => !!document.querySelector('#ui .hud .cargo-card') && !window.__FF.game.session, null, 5000);
    check("video mode: host's HUD copied, nothing drawn here", vhud, vhud);
    await guest.screenshot({ path: `${out}/online-guest-video.png` });
    await guest.keyboard.press('Escape');
    await guest.keyboard.press('ArrowDown');
    await guest.keyboard.press('ArrowDown');
    await guest.keyboard.press('Enter');
    const back = await until(guest, () => window.__FF.app.guest?.mode === 'light' && window.__FF.game.session?.mirror && !document.querySelector('.net-video'), null, 10000);
    check('back to light mode: the job is rebuilt', back, await guest.evaluate(() => [window.__FF.app.guest?.mode, window.__FF.game.session?.def.id]));
  }

  // host quits to the menu: the guest's copy of the job goes too
  await host.evaluate(() => window.__FF.app.quitToMenu());
  const ended = await until(guest, () => !window.__FF.game.session?.mirror && document.getElementById('ui').textContent.includes('Play'), null, 8000);
  check('host quits: guest back to the menus', ended, await guest.evaluate(() => window.__FF.game.session?.def.id));

  // guest leaves: the host's P2 goes back to this keyboard
  await guest.keyboard.press('Escape');
  // walk the menu with the keys down to "Leave" (the buttons above it vary: Graphics shows in light mode only)
  for (let i = 0; i < 8; i++) {
    if (await guest.evaluate(() => !!document.querySelector('#g-leave.focus'))) break;
    await guest.keyboard.press('ArrowDown');
  }
  await guest.keyboard.press('Enter');
  check('guest back at its menu', (await guest.evaluate(() => window.__FF.app.screen)) === 'menu', await guest.evaluate(() => window.__FF.app.screen));
  const left = await until(host, () => !window.__FF.game.onlineP2, null, 15000);
  check('host notices the guest left', left, left);

  const bad = checks.filter((c) => !c.ok).length;
  if (bad) throw new Error(`${bad} check(s) failed`);
}
