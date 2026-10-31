// Touch controls on a phone: they show on a touch screen (never on a keyboard
// laptop), the menus work by tapping, the stick walks P1 (per simulated
// second), GRAB held near the cargo latches a hand while a second finger steers,
// JUMP jumps, the camera buttons turn the camera, the corner button pauses, a key
// press hides them, and codes can be typed with the on-screen keyboard. Then an
// online guest on a phone drives the host's P2 with them (two tabs over a
// BroadcastChannel). ONLINE=0 skips that part, ONLINE=only runs just that.
export default async function ({ page, base, out }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push({ name, ok });
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(50), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 120000 });
  const adv = (p, s) => p.evaluate((s) => window.__FF.game.advance(s), s);
  const shown = (p) => p.evaluate(() => {
    const el = document.querySelector('.touch-controls');
    return el && getComputedStyle(el).display !== 'none' ? el.dataset.show : 'hidden';
  });
  const until = async (p, fn, arg, ms = 20000) => {
    try {
      await p.waitForFunction(fn, arg, { timeout: ms });
      return true;
    } catch {
      return false;
    }
  };

  /** CDP touches: points [x, y, id]; touchEnd lifts the points listed (all when none are). */
  const touch = (p, type, pts) => p.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id })) });
  const centre = async (p, sel) => {
    const b = await p.locator(sel).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const browser = page.context().browser();

  /** A keyboard laptop, then a phone on its own. */
  const local = async () => {
    // ---------------------------------------------------------------- a keyboard laptop
    await page.goto(base + '?manual=1');
    await ready(page);
    await page.evaluate(() => window.__FF.app.playLevel('playground'));
    await adv(page, 0.5);
    check('keyboard: no touch mode', !(await page.evaluate(() => document.documentElement.classList.contains('touch'))), '');
    check('keyboard: no controls in a job', (await shown(page)) === 'hidden', await shown(page));
    const cardKeys = await page.evaluate(() => getComputedStyle(document.querySelector('.player-card .keys')).display);
    check('keyboard: player cards keep their keys', cardKeys !== 'none', cardKeys);
    await page.evaluate(() => {
      window.__FF.app.quitToMenu();
      window.__FF.app.showOnline();
    });
    await page.click('#o-join');
    const boxShown = await page.evaluate(() => getComputedStyle(document.getElementById('j-type')).display);
    check('keyboard: no text box on the join screen', boxShown === 'none', boxShown);
    await page.keyboard.press('KeyA');
    await page.keyboard.press('Digit7');
    const typed = await page.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
    check('keyboard: typing the code still works', typed === 'A7', typed);

    // ---------------------------------------------------------------- a phone (on its side)
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    const ph = await ctx.newPage();
    ph.on('pageerror', (e) => console.log('[phone pageerror]', e.message));
    ph.on('console', (m) => m.type() === 'error' && console.log('[phone]', m.text()));
    const cdp = await ctx.newCDPSession(ph);
    await ph.goto(base + '?manual=1');
    await ready(ph);
    check('phone: touch mode from the start', await ph.evaluate(() => document.documentElement.classList.contains('touch')), '');
    const title = await ph.evaluate(() => document.querySelector('.press-start')?.textContent);
    check('phone: title says tap', title === 'Tap to start', title);
    await ph.tap('.screen');
    await adv(ph, 0.4);
    check('phone: tap the title → menu', (await ph.evaluate(() => window.__FF.app.screen)) === 'menu', await ph.evaluate(() => window.__FF.app.screen));
    check('phone: no controls in the menus', (await shown(ph)) === 'hidden', await shown(ph));
    // the whole menu fits a phone on its side (or scrolls to it)
    const menuFits = await ph.evaluate(() => {
      const b = document.getElementById('m-credits').getBoundingClientRect();
      const t = document.getElementById('m-play').getBoundingClientRect();
      return [Math.round(t.top), Math.round(b.bottom)];
    });
    check('phone: main menu fits on screen', menuFits[0] >= 0 && menuFits[1] <= 390, menuFits);
    await ph.screenshot({ path: `${out}/touch-menu-landscape.png` });
    await ph.tap('#m-howto');
    await adv(ph, 0.4);
    const howto = await ph.evaluate(() => [...document.querySelectorAll('.touch-only')].some((e) => getComputedStyle(e).display !== 'none' && /phone/.test(e.textContent)));
    check('phone: How to Play explains the touch controls', howto, howto);
    await ph.tap('#h-back');
    await ph.tap('#m-play');
    await adv(ph, 0.4);
    await ph.screenshot({ path: `${out}/touch-levels-landscape.png` });
    await ph.tap('[data-level="playground"]');
    await adv(ph, 1.5);
    check('phone: tap a job → playing', (await ph.evaluate(() => window.__FF.app.screen)) === 'playing', await ph.evaluate(() => window.__FF.app.screen));
    check('phone: controls show in a job', (await shown(ph)) === 'play', await shown(ph));
    await ph.screenshot({ path: `${out}/touch-hud-landscape.png` });

    const p1 = () =>
      ph.evaluate(() => {
        const g = window.__FF.game;
        const s = g.session;
        const p = s.players[0].body.translation();
        const c = s.cargo.body.translation();
        const cam = g.renderer.camera;
        const Vec = cam.position.constructor; // (three's Vector3)
        const scr = (v) => {
          const w = new Vec(v.x, v.y, v.z).project(cam);
          return [((w.x + 1) / 2) * innerWidth, ((1 - w.y) / 2) * innerHeight];
        };
        // (the cargo on screen as if at the mover's height, so the stick aims along the floor)
        return { pos: [p.x, p.y, p.z], scr: scr(p), cargo: scr({ x: c.x, y: p.y, z: c.z }), cargoPos: [c.x, c.y, c.z], t: s.physics.time, yaw: s.cameraRig.yaw, grips: s.players[0].hands.map((h) => h.grip?.kind ?? null), grounded: s.players[0].grounded };
      });

    // the stick: put a thumb down on the left, drag it right
    const a = await p1();
    await touch(cdp, 'touchStart', [[200, 250, 1]]);
    for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [[200 + i * 16, 250, 1]]);
    const stickOn = await ph.evaluate(() => {
      const s = document.querySelector('.tc-stick');
      return [s.classList.contains('on'), Math.round(s.getBoundingClientRect().left + s.offsetWidth / 2)];
    });
    check('stick appears where the thumb landed', stickOn[0] && Math.abs(stickOn[1] - 200) < 50, stickOn);
    await adv(ph, 0.6);
    await ph.screenshot({ path: `${out}/touch-stick-landscape.png` });
    const b = await p1();
    const p2intent = await ph.evaluate(() => {
      const i = window.__FF.game.session.players[1].intent;
      return Math.hypot(i.moveX, i.moveZ);
    });
    await touch(cdp, 'touchEnd', []);
    const speed = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]) / (b.t - a.t);
    check('stick walks P1 (m per simulated s)', speed > 0.8, +speed.toFixed(2));
    check('…to the right on screen', b.scr[0] - a.scr[0] > 30 && Math.abs(b.scr[1] - a.scr[1]) < b.scr[0] - a.scr[0], [Math.round(b.scr[0] - a.scr[0]), Math.round(b.scr[1] - a.scr[1])]);
    check('…and not P2', p2intent === 0, p2intent);
    await adv(ph, 0.6);
    const still = await p1();
    await adv(ph, 0.5);
    const still2 = await p1();
    const drift = Math.hypot(still2.pos[0] - still.pos[0], still2.pos[2] - still.pos[2]);
    check('let go of the stick: P1 stops', drift < 0.1, +drift.toFixed(3));

    // GRAB near the cargo: walk up with the stick, ease off (thumb still down), and hold GRAB with another finger
    const grab = await centre(ph, '.tc-grab');
    await touch(cdp, 'touchStart', [[150, 230, 1]]);
    let near = 9;
    for (let i = 0; i < 24 && near > 0.85; i++) {
      const s = await p1();
      const dx = s.cargo[0] - s.scr[0];
      const dy = s.cargo[1] - s.scr[1];
      const l = Math.hypot(dx, dy) || 1;
      const pull = near < 1.6 ? 22 : 50; // slow down near it, like people do
      await touch(cdp, 'touchMove', [[150 + (dx / l) * pull, 230 + (dy / l) * pull, 1]]);
      await adv(ph, 0.15);
      const t = await p1();
      near = Math.hypot(t.cargoPos[0] - t.pos[0], t.cargoPos[2] - t.pos[2]);
    }
    check('stick steers P1 up to the cargo (m away)', near <= 0.85, +near.toFixed(2));
    await touch(cdp, 'touchMove', [[150, 230, 1]]); // back to the middle: stand still
    await touch(cdp, 'touchStart', [[150, 230, 1], [...grab, 2]]);
    let latched = false;
    for (let i = 0; i < 8 && !latched; i++) {
      await adv(ph, 0.2);
      latched = (await p1()).grips.includes('cargo');
    }
    const both = await ph.evaluate(() => [document.querySelector('.tc-stick').classList.contains('on'), document.querySelector('.tc-grab').classList.contains('on')]);
    check('two fingers at once: stick + GRAB held', both[0] && both[1], both);
    check('GRAB near the cargo latches a hand', latched, (await p1()).grips);
    // carry it a little: the crate comes along
    const c0 = (await p1()).cargoPos;
    await touch(cdp, 'touchMove', [[150, 290, 1], [...grab, 2]]);
    await adv(ph, 1);
    const c1 = (await p1()).cargoPos;
    await ph.screenshot({ path: `${out}/touch-grab-landscape.png` });
    const carried = Math.hypot(c1[0] - c0[0], c1[2] - c0[2]);
    check('…and carries it with the stick (m)', carried > 0.4 && (await p1()).grips.includes('cargo'), +carried.toFixed(2));
    await touch(cdp, 'touchMove', [[150, 230, 1], [...grab, 2]]);
    await touch(cdp, 'touchEnd', [[...grab, 2]]); // let go of GRAB, thumb still down
    await adv(ph, 2);
    const letGo = (await p1()).grips.every((g) => g === null);
    check('let go of GRAB: the hands open', letGo, (await p1()).grips);
    await touch(cdp, 'touchEnd', []);
    await adv(ph, 0.5);

    // JUMP: a tap
    const jump = await centre(ph, '.tc-jump');
    const j0 = await p1();
    await touch(cdp, 'touchStart', [[...jump, 3]]);
    await touch(cdp, 'touchEnd', []);
    let top = j0.pos[1];
    let air = false;
    for (let i = 0; i < 12; i++) {
      await adv(ph, 0.05);
      const s = await p1();
      top = Math.max(top, s.pos[1]);
      if (!s.grounded) air = true;
    }
    check('tap JUMP: P1 jumps', air && top - j0.pos[1] > 0.25, +(top - j0.pos[1]).toFixed(2));
    await adv(ph, 1);

    // camera: hold ⟳
    const camR = await centre(ph, '.tc-cam[data-act="camRight"]');
    const y0 = (await p1()).yaw;
    await touch(cdp, 'touchStart', [[...camR, 4]]);
    await adv(ph, 0.5);
    await touch(cdp, 'touchEnd', []);
    await adv(ph, 0.3);
    const turned = Math.abs((await p1()).yaw - y0);
    check('hold ⟳: the camera turns', turned > 0.2, +turned.toFixed(2));

    // the corner button pauses; Resume by tapping
    await ph.tap('.tc-menu');
    await adv(ph, 0.2);
    check('corner button pauses', (await ph.evaluate(() => window.__FF.app.screen)) === 'paused', await ph.evaluate(() => window.__FF.app.screen));
    check('…and the controls step aside', (await shown(ph)) === 'hidden', await shown(ph));
    await ph.tap('#p-resume');
    await adv(ph, 0.2);
    check('tap Resume → playing, controls back', (await ph.evaluate(() => window.__FF.app.screen)) === 'playing' && (await shown(ph)) === 'play', await shown(ph));

    // portrait
    await ph.setViewportSize({ width: 390, height: 844 });
    await adv(ph, 0.3);
    await touch(cdp, 'touchStart', [[110, 640, 1]]);
    await touch(cdp, 'touchMove', [[150, 610, 1]]);
    await adv(ph, 0.3);
    await ph.screenshot({ path: `${out}/touch-hud-portrait.png` });
    // nothing the controls cover that matters: cargo card, timer, the hint
    const overlap = await ph.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const hit = (a, b) => a && b && a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const hud = ['.cargo-card', '.timer-card', '.player-card.p1', '.player-card.p2', '.hud .hint'];
      const ctl = ['.tc-grab', '.tc-jump', '.tc-cam[data-act="camLeft"]', '.tc-cam[data-act="camRight"]', '.tc-menu'];
      const bad = [];
      for (const h of hud) for (const c of ctl) if (hit(r(h), r(c))) bad.push(`${h}/${c}`);
      for (const [x, y] of [['.cargo-card', '.timer-card'], ['.timer-card', '.player-card.p1'], ['.timer-card', '.player-card.p2']]) if (hit(r(x), r(y))) bad.push(`${x}/${y}`);
      return bad;
    });
    check('portrait: controls and HUD cards don’t overlap', !overlap.length, overlap);
    await touch(cdp, 'touchEnd', []);
    await ph.setViewportSize({ width: 844, height: 390 });
    await adv(ph, 0.3);
    const overlapL = await ph.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const hit = (a, b) => a && b && a.width && b.width && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const hud = ['.cargo-card', '.timer-card', '.status-card', '.player-card.p1', '.player-card.p2', '.hud .hint'];
      const ctl = ['.tc-grab', '.tc-jump', '.tc-cam[data-act="camLeft"]', '.tc-cam[data-act="camRight"]', '.tc-menu'];
      const bad = [];
      for (const h of hud) for (const c of ctl) if (hit(r(h), r(c))) bad.push(`${h}/${c}`);
      return bad;
    });
    check('landscape: controls and HUD cards don’t overlap', !overlapL.length, overlapL);

    // a key press: keyboard play, the controls go
    await ph.keyboard.press('KeyW');
    await adv(ph, 0.1);
    check('a key press hides the controls', (await shown(ph)) === 'hidden' && !(await ph.evaluate(() => document.documentElement.classList.contains('touch'))), await shown(ph));
    await ph.tap('#game canvas');
    await adv(ph, 0.1);
    check('…and a touch brings them back', (await shown(ph)) === 'play', await shown(ph));

    // typing a code with the on-screen keyboard (insertText types like one: no key events)
    await ph.tap('.tc-menu');
    await ph.tap('#p-quit');
    await ph.tap('#m-online');
    await ph.tap('#o-join');
    // (a finger on the code boxes: the invisible text box lying over them takes the tap)
    await ph.touchscreen.tap(...(await centre(ph, '.net-code')));
    const focused = await ph.evaluate(() => document.activeElement?.id);
    check('join screen: tapping the code boxes focuses a text box', focused === 'j-type', focused);
    await ph.keyboard.insertText('k7q-xm');
    const code = await ph.evaluate(() => [[...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''), document.getElementById('j-type').value, document.getElementById('j-go').disabled]);
    check('join screen: typed code fills the boxes', code[0] === 'K7QXM' && code[1] === 'K7QXM' && !code[2], code);
    check('…still in touch mode after typing', await ph.evaluate(() => document.documentElement.classList.contains('touch')), '');
    await ph.screenshot({ path: `${out}/touch-join-landscape.png` });
    await ph.tap('#j-back');
    await ph.tap('#o-back');
    await ph.tap('#m-play');
    await ph.tap('[data-gen="number"]');
    await ph.touchscreen.tap(...(await centre(ph, '.job-digits')));
    await ph.keyboard.insertText('123456');
    check('job number: typed digits enable Play', !(await ph.evaluate(() => document.getElementById('jn-go').disabled)), '');
    await ph.tap('#jn-go');
    await adv(ph, 0.5);
    const seed = await ph.evaluate(() => window.__FF.game.session?.def.gen?.seed);
    check('job number: plays that job', seed === 123456, seed);
    await ctx.close();
  };
  if (process.env.ONLINE !== 'only') await local();

  // ---------------------------------------------------------------- online: a guest on a phone
  if (process.env.ONLINE !== '0') await online({ browser, base, out, check, ready, until, touch, centre, shown });

  const bad = checks.filter((c) => !c.ok).length;
  if (bad) throw new Error(`${bad} check(s) failed`);
}

async function online({ browser, base, out, check, ready, until, touch, centre, shown }) {
  // both tabs in one context (the BroadcastChannel), a touch screen for both: the host plays with keys
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, hasTouch: true, isMobile: true });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  await guest.setViewportSize({ width: 740, height: 360 });
  for (const [n, p] of [
    ['host', host],
    ['guest', guest],
  ]) {
    p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
    p.on('console', (m) => m.type() === 'error' && console.log(`[${n}]`, m.text()));
  }
  await Promise.all([host.goto(base + '?net=local'), guest.goto(base + '?net=local')]);
  await Promise.all([ready(host), ready(guest)]);
  const cdp = await ctx.newCDPSession(guest);
  await host.evaluate(() => window.__FF.app.showMenu());
  await host.keyboard.press('KeyS'); // keyboard on the host: no touch controls there
  await host.click('#m-online');
  await host.click('#o-host');
  await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.evaluate(() => window.__FF.app.showMenu());
  await guest.tap('#m-online');
  await guest.tap('#o-join');
  await guest.touchscreen.tap(...(await centre(guest, '.net-code')));
  await guest.keyboard.insertText(code.toLowerCase());
  await guest.tap('#j-go');
  const joined = await until(guest, () => window.__FF.app.screen === 'guest', null, 30000);
  check('online: the phone joins by tapping', joined, code);
  await until(guest, () => document.querySelector('.touch-controls')?.dataset.show === 'menu', null, 5000);
  await until(guest, () => document.getElementById('ui').textContent.includes('HOSTING'));
  check('online: menu button only, in the host’s menus', (await shown(guest)) === 'menu', await shown(guest));
  await guest.screenshot({ path: `${out}/touch-guest-lobby.png` });

  await host.evaluate(() => window.__FF.app.playLevel('playground'));
  const inJob = await until(guest, () => window.__FF.game.session?.mirror && document.querySelector('.touch-controls')?.dataset.show === 'play', null, 30000);
  check('online: the controls show in the job', inJob, await shown(guest));
  check('online: none on the host (keys)', (await shown(host)) === 'hidden', await shown(host));
  // (note when and why the host pauses, for when a check below goes wrong)
  await host.evaluate(() => {
    const app = window.__FF.app;
    const pause = app.pause.bind(app);
    window.__pauses = [];
    app.pause = () => {
      if (app.screen === 'playing') window.__pauses.push({ hidden: document.hidden, focus: document.hasFocus(), from: new Error().stack.split('\n').slice(2, 4).join(' | ') });
      pause();
    };
  });
  await host.waitForTimeout(1500);

  const hostP2 = () =>
    host.evaluate(() => {
      const s = window.__FF.game.session;
      const p = s.players[1];
      const t = p.body.translation();
      return { pos: [t.x, t.y, t.z], t: s.physics.time, grab: p.intent.grab, grounded: p.grounded, p1: [s.players[0].body.translation().x, s.players[0].body.translation().z] };
    });
  // drag the stick down and right (open floor), measured on the host's clock
  const a = await hostP2();
  await touch(cdp, 'touchStart', [[180, 200, 1]]);
  await touch(cdp, 'touchMove', [[230, 250, 1]]);
  await until(host, (t) => window.__FF.game.session.physics.time > t, a.t + 1.2, 30000);
  await touch(cdp, 'touchEnd', []);
  const b = await hostP2();
  const speed = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]) / (b.t - a.t);
  check("online: the phone's stick moves the host's P2 (m/s)", speed > 0.8, +speed.toFixed(2));
  const p1moved = Math.hypot(b.p1[0] - a.p1[0], b.p1[1] - a.p1[1]);
  check('…and not P1', p1moved < 0.3, +p1moved.toFixed(2));
  await host.waitForTimeout(800);

  // GRAB held on the phone: the host's P2 reaches
  const grab = await centre(guest, '.tc-grab');
  await touch(cdp, 'touchStart', [[...grab, 2]]);
  const grabbing = await until(host, () => window.__FF.game.session.players[1].intent.grab, null, 10000);
  // (what each side thinks, for when it goes wrong)
  const diag = async () => [
    await host.evaluate(() => ({ screen: window.__FF.app.screen, pauses: window.__pauses, hidden: document.hidden, p2: window.__FF.game.session?.players[1].intent })),
    await guest.evaluate(() => ({ screen: window.__FF.app.screen, show: document.querySelector('.touch-controls').dataset.show, held: [...document.querySelectorAll('.touch-controls .on')].map((e) => e.className), sent: window.__FF.app.guest?.lastSent, hidden: document.hidden })),
  ];
  check("online: GRAB held → the host's P2 grabs", grabbing, grabbing || (await diag()));
  await touch(cdp, 'touchEnd', []);
  const opened = await until(host, () => !window.__FF.game.session.players[1].intent.grab, null, 10000);
  check('…and lets go', opened, opened || (await diag()));

  // JUMP tapped on the phone: the host's P2 leaves the ground
  const jump = await centre(guest, '.tc-jump');
  const j0 = await hostP2();
  await touch(cdp, 'touchStart', [[...jump, 3]]);
  await touch(cdp, 'touchEnd', []);
  const jumped = await until(host, (y) => window.__FF.game.session.players[1].body.translation().y > y + 0.25, j0.pos[1], 15000);
  check("online: JUMP tap → the host's P2 jumps", jumped, jumped || (await diag()));
  await guest.screenshot({ path: `${out}/touch-guest-job.png` });

  // the corner button opens the guest's online menu
  await guest.tap('.tc-menu');
  check('online: corner button opens the online menu', (await guest.evaluate(() => window.__FF.app.screen)) === 'guest-menu', await guest.evaluate(() => window.__FF.app.screen));
  await guest.screenshot({ path: `${out}/touch-guest-menu.png` });
  await guest.tap('#g-back');
  check('…Keep playing', (await guest.evaluate(() => window.__FF.app.screen)) === 'guest', await guest.evaluate(() => window.__FF.app.screen));
  await guest.tap('.tc-menu');
  await guest.tap('#g-leave');
  const left = await until(host, () => !window.__FF.game.onlineP2, null, 15000);
  check('online: Leave by tapping', left, left);
  await ctx.close();
}
