// Online, on a slow line (?lag=150: every message held 150 ms each way): the
// friend's own mover answers their keys at once on their screen (it is drawn
// ahead of the host's picture), settles onto where the host has it when they
// stop, doesn't rubber-band, and doesn't get drawn inside a wall.
// env LAG (ms each way, default 150).
export default async function ({ page, base }) {
  const LAG = Number(process.env.LAG ?? 150);
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(62), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const until = (p, fn, ms = 30000) => p.waitForFunction(fn, null, { timeout: ms, polling: 200 }).then(() => true, () => false);
  // (the host's tab only simulates, in step with the clock, and never draws: the software
  //  renderer can't draw two games at a speed worth timing; the guest's is small and on Fast)
  const ctx = await page.context().browser().newContext({ viewport: { width: 320, height: 200 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  const q = `?net=local&lag=${LAG}`;
  await Promise.all([host.goto(base + q + '&manual=1'), guest.goto(base + q)]);
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
  await guest.goto(base + `${q}&join=${code}`);
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
  await guest.waitForTimeout(2500);
  const rtt = await guest.evaluate(() => [window.__FF.app.guest.conn?.rtt ?? window.__FF.app.guest.rtt, window.__FF.game.session.mirror.rtt, window.__FF.app.guest.via]);
  check('the line is slow (round trip, ms)', rtt[1] * 1000 >= LAG * 2 - 5, rtt);

  // a recorder on the guest: where its own mover is drawn, every frame
  await guest.evaluate(() => {
    const S = (window.__S = { rows: [], down: 0, up: 0 });
    addEventListener('keydown', (e) => { if (e.code.startsWith('Arrow') && !e.repeat) S.down = performance.now(); }, true);
    addEventListener('keyup', (e) => { if (e.code.startsWith('Arrow')) S.up = performance.now(); }, true);
    const loop = () => {
      const s = window.__FF.game.session;
      if (s?.mirror && s.players[1]) {
        const t = s.players[1].body.translation();
        const m = s.players[1].mirror;
        S.rows.push([performance.now(), t.x, t.z, s.mirror.leadDistance, m && (m.grip[0] || m.grip[1]) ? 1 : 0]);
        if (S.rows.length > 4000) S.rows.splice(0, 1000);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const hostP2 = () => host.evaluate(() => { const t = window.__FF.game.session.players[1].body.translation(); return [t.x, t.y, t.z]; });
  const walk = async (key, ms, rest = 1800) => {
    await guest.evaluate(() => { window.__S.rows.length = 0; window.__S.down = 0; });
    await guest.waitForTimeout(300);
    await guest.keyboard.down(key);
    await guest.waitForTimeout(ms);
    await guest.keyboard.up(key);
    await guest.waitForTimeout(rest);
    return guest.evaluate(() => window.__S);
  };
  // how long from the key going down until the mover has visibly moved; how far back it ever steps; where it ends
  const read = (S, axis, sign) => {
    const rows = S.rows;
    const start = rows.filter((r) => r[0] <= S.down).pop() ?? rows[0];
    const first = rows.find((r) => r[0] > S.down && Math.hypot(r[1] - start[1], r[2] - start[2]) > 0.08);
    let back = 0;
    let far = -Infinity;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] < S.down) continue;
      back = Math.min(back, (rows[i][axis] - rows[i - 1][axis]) * sign);
      far = Math.max(far, rows[i][axis] * sign);
    }
    if (process.env.DUMP) console.log(rows.filter((r) => r[0] > S.down - 150).map((r) => `${Math.round(r[0] - S.down)}${r[0] > S.up ? '^' : ''}: ${r[axis].toFixed(2)} +${r[3].toFixed(2)}`).join(' | '));
    const end = rows[rows.length - 1];
    const fps = rows.length / ((end[0] - rows[0][0]) / 1000);
    const heldLead = Math.max(0, ...rows.filter((r) => r[4]).map((r) => r[3]));
    return { heldLead: +heldLead.toFixed(2), ms: first ? Math.round(first[0] - S.down) : null, back: +back.toFixed(3), far: +far.toFixed(2), end: [+end[1].toFixed(2), +end[2].toFixed(2)], lead: +end[3].toFixed(3), fps: Math.round(fps), maxLead: +Math.max(...rows.map((r) => r[3])).toFixed(2) };
  };

  // 1. walking in the open: with the mover drawn ahead, and without
  const on = read(await walk('ArrowRight', 1200), 1, 1);
  const hostAfter = await hostP2();
  await guest.evaluate(() => (window.__FF.game.session.mirror.predictOwn = false));
  const off = read(await walk('ArrowLeft', 1200), 1, -1);
  await guest.evaluate(() => (window.__FF.game.session.mirror.predictOwn = true));
  console.log('   drawn ahead:', JSON.stringify(on));
  console.log('   as the host has it:', JSON.stringify(off));
  check('own mover answers the keys at once (ms to move)', on.ms !== null && on.ms < Math.max(140, LAG * 0.9), on.ms);
  check('…where plain mirroring waits for the round trip (ms)', off.ms !== null && off.ms > LAG * 2, off.ms);
  check('…so it feels this much quicker (ms)', off.ms - on.ms > LAG * 1.2, off.ms - on.ms);
  check('it is drawn ahead while walking (m)', on.maxLead > 0.25 && off.maxLead < 0.01, [on.maxLead, off.maxLead]);
  check('no rubber-banding (most it ever steps back, m)', on.back > -0.06, on.back);
  check('stopped: it settles onto where the host has it', on.lead < 0.01 && Math.hypot(on.end[0] - hostAfter[0], on.end[1] - hostAfter[2]) < 0.15, { lead: on.lead, drawn: on.end, host: [+hostAfter[0].toFixed(2), +hostAfter[2].toFixed(2)] });
  check('…without overshooting the stop (m past it)', on.far - on.end[0] < 0.3, +(on.far - on.end[0]).toFixed(2));

  // 2. into a wall: never drawn inside it
  await host.evaluate(() => {
    const s = window.__FF.game.session;
    const V = s.players[1].bodyPos.constructor;
    s.players[1].teleport(new V(-5.5, 0, -4.4), 180);
  });
  await guest.waitForTimeout(1500);
  const wall = read(await walk('ArrowUp', 2600), 2, -1);
  const hostWall = await hostP2();
  console.log('   into the wall:', JSON.stringify(wall), 'host', hostWall.map((v) => +v.toFixed(2)));
  check('the host stopped it at the wall (z)', hostWall[2] < -4.9 && hostWall[2] > -5.75, +hostWall[2].toFixed(2));
  check('…and it was never drawn inside the wall (m past the host)', -wall.far - hostWall[2] > -0.2, +(-wall.far - hostWall[2]).toFixed(2));

  // 3. carrying: hands on the crate, the lead is small (the load has to come too)
  await host.evaluate(() => {
    const s = window.__FF.game.session;
    const V = s.players[1].bodyPos.constructor;
    const c = s.cargo.position(new V());
    s.players[1].teleport(new V(c.x + 0.75, 0, c.z), 90);
  });
  await guest.waitForTimeout(1200);
  await guest.keyboard.down('KeyL');
  const held = await until(guest, () => { const m = window.__FF.game.session.players[1].mirror; return m && (m.grip[0] || m.grip[1]); }, 6000);
  if (held) {
    const carry = read(await walk('ArrowRight', 1000, 600), 1, 1);
    console.log('   carrying:', JSON.stringify(carry));
    check('holding the load: a smaller lead (m)', carry.heldLead > 0.1 && carry.heldLead < on.maxLead * 0.7, [carry.heldLead, on.maxLead]);
  } else console.log('   (could not get a grip for the carrying check; skipped)');
  await guest.keyboard.up('KeyL');

  const errs = await guest.evaluate(() => window.__FF.game.session?.mirror?.received > 50);
  check('still in step with the host', errs, errs);
  await ctx.close();
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
