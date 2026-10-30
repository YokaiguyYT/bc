// Every job online in light mode: the host plays it, the guest builds it, and
// after a few seconds every moving body on the guest is where the host's is
// (allowing for the guest running a little behind). LEVELS=a,b to pick some.
export default async function ({ page, base }) {
  const ctx = await page.context().browser().newContext({ viewport: { width: 480, height: 300 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) {
    p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
    p.on('console', (m) => m.type() === 'error' && console.log(`[${n}]`, m.text()));
  }
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await Promise.all([host.goto(base + '?net=local'), guest.goto(base + '?net=local')]);
  await Promise.all([ready(host), ready(guest)]);
  await host.evaluate(() => window.__FF.app.showOnline());
  await host.click('#o-host');
  await host.waitForFunction(() => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')), null, { timeout: 20000 });
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.evaluate(() => window.__FF.app.showOnline());
  await guest.click('#o-join');
  for (const c of code) await guest.keyboard.press(/[0-9]/.test(c) ? `Digit${c}` : `Key${c}`);
  await guest.keyboard.press('Enter');
  await guest.waitForFunction(() => window.__FF.app.screen === 'guest', null, { timeout: 30000 });
  const ids = process.env.LEVELS ? process.env.LEVELS.split(',') : await host.evaluate(() => window.__FF.game.levels.map((l) => l.id));
  let bad = 0;
  for (const id of ids) {
    await host.evaluate((id) => window.__FF.app.playLevel(id), id);
    const ok = await guest.waitForFunction((id) => window.__FF.game.session?.mirror && window.__FF.game.session.def.id === id && window.__FF.game.session.mirror.received > 8, id, { timeout: 30000 }).then(() => true, () => false);
    if (!ok) {
      bad++;
      const gs = await guest.evaluate(() => ({ id: window.__FF.game.session?.def.id, mirror: !!window.__FF.game.session?.mirror, received: window.__FF.game.session?.mirror?.received, last: window.__FF.app.guest?.lastLevel?.id, mode: window.__FF.app.guest?.mode, screen: window.__FF.app.screen }));
      const hs = await host.evaluate(async () => {
        let frames = 0;
        const t0 = performance.now();
        await new Promise((r) => {
          const f = () => (++frames, performance.now() - t0 > 2000 ? r() : requestAnimationFrame(f));
          requestAnimationFrame(f);
        });
        const s = window.__FF.game.session;
        return { id: s?.def.id, paused: s?.paused, halted: window.__FF.game.halted, manual: window.__FF.game.manual, framesIn2s: frames, hidden: document.hidden, synced: window.__FF.app.host?.synced?.def.id, via: window.__FF.app.host?.via, screen: window.__FF.app.screen, t: s?.physics.time, frameMs: window.__FF.game.frameTimes.slice(-5).map((x) => Math.round(x)) };
      });
      console.log('FAIL', id.padEnd(12), 'guest never got going', JSON.stringify({ guest: gs, host: hs }));
      continue;
    }
    // let the host's sim run a couple of seconds, then compare at the guest's (slightly earlier) clock
    const t0 = await host.evaluate(() => window.__FF.game.session.physics.time);
    await host.waitForFunction((t) => window.__FF.game.session.physics.time > t + 1, t0, { timeout: 240000 });
    const g = await guest.evaluate(() => {
      const s = window.__FF.game.session;
      const out = [];
      for (let i = 0; i < s.physics.linkCount; i++) {
        const p = s.physics.linkPose(i).pos;
        out.push([p.x, p.y, p.z]);
      }
      return { t: s.physics.time, pos: out, links: s.physics.linkCount, mismatch: s.mirror.mismatch, health: s.cargo.health };
    });
    // the host's poses a moment ago are what the guest shows now: compare against the host's history
    const h = await host.evaluate(() => {
      const s = window.__FF.game.session;
      const out = [];
      for (let i = 0; i < s.physics.linkCount; i++) {
        const p = s.physics.linkPose(i).pos;
        out.push([p.x, p.y, p.z]);
      }
      return { t: s.physics.time, pos: out, links: s.physics.linkCount, health: s.cargo.health };
    });
    let worst = 0;
    let at = -1;
    for (let i = 0; i < Math.min(g.pos.length, h.pos.length); i++) {
      const d = Math.hypot(g.pos[i][0] - h.pos[i][0], g.pos[i][1] - h.pos[i][1], g.pos[i][2] - h.pos[i][2]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    // moving hazards keep moving while the guest is behind: allow their travel in that gap
    const lag = h.t - g.t;
    const okLevel = g.links === h.links && !g.mismatch && worst < 0.5 + lag * 12;
    if (!okLevel) bad++;
    console.log(okLevel ? 'ok  ' : 'FAIL', id.padEnd(12), `links ${g.links}/${h.links} worst ${worst.toFixed(2)} m (body ${at}) lag ${lag.toFixed(2)} s health ${g.health.toFixed(2)}/${h.health.toFixed(2)}`);
  }
  if (bad) throw new Error(`${bad} job(s) didn't line up`);
}
