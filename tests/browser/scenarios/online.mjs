// Online play between two tabs (host and guest), signalling over a
// BroadcastChannel (?net=local) so no internet is needed: the guest joins with
// the code, sees the host's picture and menus, drives P2, can pause, and leaves.
// NET=peerjs uses the real public relay instead; NET=ws://localhost:9000/peerjs a
// PeerJS server run locally (npx peerjs --port 9000).
export default async function ({ page, base, out }) {
  const q = process.env.NET === 'peerjs' ? '' : process.env.NET ? `?net=${encodeURIComponent(process.env.NET)}` : '?net=local';
  // both tabs in one browser context, so the BroadcastChannel reaches across
  const ctx = await page.context().browser().newContext({ viewport: { width: 640, height: 400 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  await guest.setViewportSize({ width: 560, height: 360 });
  host.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[host]', m.type(), m.text()));
  host.on('pageerror', (e) => console.log('[host pageerror]', e.message));
  guest.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[guest]', m.type(), m.text()));
  guest.on('pageerror', (e) => console.log('[guest pageerror]', e.message));
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await Promise.all([host.goto(base + q), guest.goto(base + q)]);
  await Promise.all([ready(host), ready(guest)]);

  const checks = [];
  const check = (name, ok, got) => {
    checks.push({ name, ok, got });
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(44), JSON.stringify(got));
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
  await host.screenshot({ path: `${out}/online-host-lobby.png` });

  // guest: Play Online → Join a friend → type the code → Return
  await guest.evaluate(() => window.__FF.app.showOnline());
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('Enter');
  for (const c of code) await guest.keyboard.press(/[0-9]/.test(c) ? `Digit${c}` : `Key${c}`);
  const typed = await guest.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  check('guest typed the code', typed === code, typed);
  await guest.keyboard.press('Enter');
  const joined = await until(guest, () => window.__FF.app.screen === 'guest');
  check('guest connects', joined, await guest.evaluate(() => window.__FF.app.screen + ' ' + (document.querySelector('.net-status')?.textContent ?? '')));
  const hostSees = await until(host, () => document.querySelector('.net-status')?.textContent.includes('in!'));
  check('host sees the friend arrive', hostSees, await host.evaluate(() => document.querySelector('.net-status')?.textContent));
  const video = await until(guest, () => document.querySelector('.net-video')?.videoWidth > 0);
  check('guest gets the picture', video, await guest.evaluate(() => [document.querySelector('.net-video')?.videoWidth, document.querySelector('.net-video')?.videoHeight]));
  const mirror = await until(guest, () => document.getElementById('ui').textContent.includes('HOSTING'));
  check("guest sees the host's menu", mirror, await guest.evaluate(() => document.getElementById('ui').textContent.slice(0, 60)));

  // host starts the practice yard; the guest gets the HUD
  await host.evaluate(() => window.__FF.app.playLevel('playground'));
  const hud = await until(guest, () => !!document.querySelector('#ui .hud .cargo-card'));
  check("guest sees the host's HUD", hud, hud);
  // the black-picture fallback: the host switches to sending a copy of each frame, and the picture keeps coming
  await guest.evaluate(() => window.__FF.app.guest.link.sendCtl({ k: 'blank' }));
  const copying = await until(host, () => !!window.__FF.app.host.copy, null, 5000);
  check('host switches to the copy fallback', copying, copying);
  const look = () =>
    guest.evaluate(() => {
      const v = document.querySelector('.net-video');
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const x = c.getContext('2d');
      x.drawImage(v, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let m = 0;
      for (let i = 0; i < d.length; i += 4) m = Math.max(m, d[i], d[i + 1], d[i + 2]);
      return { lit: m, frames: v.getVideoPlaybackQuality?.().totalVideoFrames ?? -1 };
    });
  await guest.waitForTimeout(1500);
  const l0 = await look();
  await guest.waitForTimeout(2500);
  const l1 = await look();
  check('picture keeps coming after the switch', l1.lit > 40 && l1.frames > l0.frames, [l0, l1]);
  const p2card = await host.evaluate(() => document.querySelectorAll('.player-card .keys')[1]?.textContent);
  check('host HUD says P2 is online', /laptop/.test(p2card ?? ''), p2card);
  await host.waitForTimeout(1500);
  // positions plus sim time: this machine renders on the CPU, so the game runs in slow motion
  const pos = () => host.evaluate(() => [...window.__FF.game.session.players.map((p) => { const t = p.body.translation(); return [t.x, t.z]; }), window.__FF.game.session.physics.time]);
  const speed = (a, b, i) => Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]) / Math.max(0.05, a[2] - b[2]);
  const t0 = await host.evaluate(() => [window.__FF.game.session.physics.time, performance.now()]);
  await host.waitForTimeout(2000);
  const t1 = await host.evaluate(() => [window.__FF.game.session.physics.time, performance.now()]);
  console.log('host sim speed', ((t1[0] - t0[0]) / ((t1[1] - t0[1]) / 1000)).toFixed(2), 'frame ms', await host.evaluate(() => (window.__FF.game.frameTimes.reduce((a, b) => a + b, 0) / window.__FF.game.frameTimes.length).toFixed(1)));
  const before = await pos();
  // the guest walks with the arrows (P1-style WASD would work too)
  await guest.keyboard.down('ArrowRight');
  await guest.keyboard.down('ArrowUp');
  await guest.waitForTimeout(1500);
  await guest.keyboard.up('ArrowRight');
  await guest.keyboard.up('ArrowUp');
  await host.waitForTimeout(400);
  const after = await pos();
  const moved = [speed(after, before, 0), speed(after, before, 1)];
  check("guest's keys move P2 (m/s)", moved[1] > 0.8, +moved[1].toFixed(2));
  check('…and not P1', moved[0] < 0.3, +moved[0].toFixed(2));
  // and WASD on the guest's laptop drives P2 as well
  const b2 = await pos();
  await guest.keyboard.down('KeyA');
  await guest.waitForTimeout(1000);
  await guest.keyboard.up('KeyA');
  await host.waitForTimeout(400);
  const a2 = await pos();
  check('guest WASD moves P2 too (m/s)', speed(a2, b2, 1) > 0.8, +speed(a2, b2, 1).toFixed(2));
  // the host's arrows drive P1 while online
  const b3 = await pos();
  await host.keyboard.down('ArrowLeft');
  await host.waitForTimeout(1000);
  await host.keyboard.up('ArrowLeft');
  await host.waitForTimeout(400);
  const a3 = await pos();
  check("host's arrows move P1 (m/s)", speed(a3, b3, 0) > 0.8, +speed(a3, b3, 0).toFixed(2));
  await guest.waitForTimeout(800);
  await guest.screenshot({ path: `${out}/online-guest-playing.png` });
  await host.screenshot({ path: `${out}/online-host-playing.png` });

  // guest: Esc → Pause the game → the host pauses
  await guest.keyboard.press('Escape');
  check('guest Esc opens the online menu', (await guest.evaluate(() => window.__FF.app.screen)) === 'guest-menu', await guest.evaluate(() => window.__FF.app.screen));
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('Enter');
  const paused = await until(host, () => window.__FF.app.screen === 'paused', null, 5000);
  check('guest can pause the game', paused, await host.evaluate(() => window.__FF.app.screen));
  const pausedMirror = await until(guest, () => document.getElementById('ui').textContent.includes('PAUSED'), null, 5000);
  check('guest sees the pause menu', pausedMirror, pausedMirror);
  await host.evaluate(() => window.__FF.app.resume());

  // guest leaves: the host's P2 goes back to this keyboard
  await guest.keyboard.press('Escape');
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('ArrowDown');
  await guest.keyboard.press('Enter');
  check('guest back at its menu', (await guest.evaluate(() => window.__FF.app.screen)) === 'menu', await guest.evaluate(() => window.__FF.app.screen));
  const left = await until(host, () => !window.__FF.game.onlineP2, null, 12000);
  check('host notices the guest left', left, await host.evaluate(() => window.__FF.app.screen));
  const canvasBack = await guest.evaluate(() => getComputedStyle(document.querySelector('#game canvas')).visibility);
  check("guest's own game is back", canvasBack === 'visible', canvasBack);

  const bad = checks.filter((c) => !c.ok).length;
  if (bad) throw new Error(`${bad} check(s) failed`);
}
