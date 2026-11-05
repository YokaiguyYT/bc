// Solo play: the robot buddy (P2) tags along, waits on the other side of the
// load, grabs it when P1 does, carries it with P1, turns it with the turn keys,
// and sets it down when P1 lets go. Also: the Play screen's one/two players
// switch, and the HUD saying who P2 is.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(52), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);

  // the Play screen's switch
  await page.evaluate(() => window.__FF.app.showPlay());
  await page.evaluate(() => document.getElementById('p-solo').click());
  await adv(0.1);
  const solo = await page.evaluate(() => ({ setting: window.__FF.game.settings.solo, on: document.getElementById('p-solo')?.classList.contains('on') }));
  check('Play: Solo switch is on, and kept', solo.setting === true && solo.on, solo);
  await shot('solo_play');

  // the practice yard, solo
  await page.evaluate(() => window.__FF.app.playLevel('playground'));
  await adv(1);
  const has = await page.evaluate(() => !!window.__FF.game.session.buddy);
  check('a solo job has a robot buddy', has, has);
  const hudP2 = await page.evaluate(() => document.querySelector('.hud .ctl.p2, .hud .p2')?.textContent ?? '');
  check('the HUD says P2 is the robot', /robot|buddy|🤖/i.test(hudP2), hudP2.replace(/\s+/g, ' ').slice(0, 80));
  await shot('solo_start');

  const st = () =>
    page.evaluate(() => {
      const s = window.__FF.game.session;
      const c = s.cargo.body.translation();
      const q = s.cargo.body.rotation();
      const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
      return {
        buddy: s.buddy.state,
        cargo: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
        yaw: +((yaw * 180) / Math.PI).toFixed(0),
        grips: s.players.map((p) => p.hands.map((h) => (h.grip ? (h.grip.kind === 'cargo' ? 'c' : 'x') : '-')).join('')),
        p: s.players.map((p) => [+p.bodyPos.x.toFixed(2), +p.bodyPos.z.toFixed(2)]),
        health: +s.cargo.health.toFixed(3),
      };
    });
  const p1 = (o) => page.evaluate((o) => Object.assign(window.__FF.game.session.players[0].intent, o), o);
  await page.evaluate(() => (window.__FF.game.session.scriptedInput = true));

  // P1 wanders off: the robot tags along
  await p1({ moveX: 1, moveZ: 0, grab: false });
  await adv(5);
  await p1({ moveX: 0, moveZ: 0 });
  await adv(1.5);
  let s = await st();
  const gap = Math.hypot(s.p[0][0] - s.p[1][0], s.p[0][1] - s.p[1][1]);
  check('P1 walks off: the robot follows', s.buddy === 'follow' && gap < 3.4, [s.buddy, +gap.toFixed(2)]);

  // back to the crate, grab: the robot goes round to the other side and grabs too
  for (let i = 0; i < 40; i++) {
    const r = await page.evaluate(() => {
      const s = window.__FF.game.session;
      const p = s.players[0].bodyPos;
      const c = s.cargo.body.translation();
      // stand on the crate's +x side
      const tx = c.x + 0.85;
      const tz = c.z;
      const d = Math.hypot(tx - p.x, tz - p.z);
      Object.assign(s.players[0].intent, d > 0.15 ? { moveX: ((tx - p.x) / d) * Math.min(1, d), moveZ: ((tz - p.z) / d) * Math.min(1, d) } : { moveX: 0, moveZ: 0 });
      return d;
    });
    await adv(0.15);
    if (r < 0.2) break;
  }
  await p1({ moveX: -0.2, moveZ: 0, grab: true });
  let both = false;
  for (let i = 0; i < 50 && !both; i++) {
    await adv(0.15);
    s = await st();
    if (s.grips[0].includes('c')) await p1({ moveX: 0, moveZ: 0 });
    both = s.grips.every((g) => g === 'cc');
  }
  check('P1 grabs: the robot gets both hands on too', both, s);
  await shot('solo_grabbed');

  // carry it somewhere: forward, then off to one side
  const c0 = s.cargo;
  await p1({ moveX: 0, moveZ: -0.6 });
  await adv(3);
  await p1({ moveX: 0, moveZ: 0 });
  await adv(1);
  s = await st();
  const moved = Math.hypot(s.cargo[0] - c0[0], s.cargo[2] - c0[2]);
  check('carrying together: it goes where P1 goes', moved > 1.5 && s.grips.every((g) => g === 'cc') && s.health > 0.95, [+moved.toFixed(2), s]);
  await shot('solo_carry');

  // turn it round with the turn keys
  const y0 = s.yaw;
  await page.evaluate(() => (window.__FF.game.session.buddy.turn = 1));
  await adv(2.5);
  await page.evaluate(() => (window.__FF.game.session.buddy.turn = 0));
  await adv(0.8);
  s = await st();
  const turned = Math.abs(((s.yaw - y0 + 540) % 360) - 180);
  check('the turn keys spin it round', turned > 40 && s.grips.every((g) => g === 'cc'), [y0, s.yaw, turned, s.grips]);
  await shot('solo_turned');

  // P1 lets go: the robot sets it down too
  await p1({ grab: false });
  await adv(2);
  s = await st();
  check('P1 lets go: the robot sets it down too', s.grips.every((g) => !g.includes('c')) && s.cargo[1] < c0[1] + 0.1 && s.health > 0.9, s);

  // two players again (with the switch, so it's saved: WebKit runs share their storage): no robot
  await page.evaluate(() => {
    window.__FF.app.showPlay();
    document.getElementById('p-duo').click();
    window.__FF.app.playLevel('playground');
  });
  await adv(0.5);
  const none = await page.evaluate(() => !window.__FF.game.session.buddy);
  check('two players: no robot', none, none);

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
