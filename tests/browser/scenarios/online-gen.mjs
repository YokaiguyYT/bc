// A random job online: the guest rebuilds the very same course from its
// recipe (same moving parts, same name), and stays in step with the host.
export default async function ({ page, base }) {
  const q = '?net=local' + (process.env.ONLY === 'relay' ? '&p2p=0' : '');
  const ctx = await page.context().browser().newContext({ viewport: { width: 560, height: 360 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  for (const [n, p] of [['host', host], ['guest', guest]]) p.on('pageerror', (e) => console.log(`[${n} pageerror]`, e.message));
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await Promise.all([host.goto(base + q), guest.goto(base + q)]);
  await Promise.all([ready(host), ready(guest)]);
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(40), JSON.stringify(got));
  };
  await host.evaluate(() => window.__FF.app.showOnline());
  await host.click('#o-host');
  await host.waitForFunction(() => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')), null, { timeout: 20000 });
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  await guest.evaluate(() => window.__FF.app.showOnline());
  await guest.click('#o-join');
  for (const c of code) await guest.keyboard.press(/[0-9]/.test(c) ? `Digit${c}` : `Key${c}`);
  await guest.keyboard.press('Enter');
  await guest.waitForFunction(() => window.__FF.app.screen === 'guest', null, { timeout: 30000 });
  // the host starts a shift (a generated job with a custom name)
  await host.evaluate(() => window.__FF.app.startShift());
  const built = await guest.waitForFunction(() => window.__FF.game.session?.mirror && window.__FF.game.session.def.generated, null, { timeout: 20000 }).then(() => true, () => false);
  check('guest builds the generated job', built, built);
  const h = await host.evaluate(() => { const s = window.__FF.game.session; return { name: s.def.name, seed: s.def.gen.seed, links: s.physics.linkCount, objects: s.def.objects.length }; });
  const g = await guest.evaluate(() => { const s = window.__FF.game.session; return { name: s.def.name, seed: s.def.gen.seed, links: s.physics.linkCount, objects: s.def.objects.length }; });
  check('same job number', h.seed === g.seed, [h.seed, g.seed]);
  check('same name (shift label too)', h.name === g.name, [h.name, g.name]);
  check('same moving parts', h.links === g.links, [h.links, g.links]);
  check('same objects', h.objects === g.objects, [h.objects, g.objects]);
  await host.waitForTimeout(3000);
  const mm = await guest.evaluate(() => window.__FF.game.session.mirror.mismatch);
  check('snapshots fit the level', !mm, mm);

  // a chaos job: the same thrown things on both laptops, banners and the HUD line on the guest too
  await host.evaluate(() => window.__FF.app.quitToMenu());
  await host.evaluate(() => window.__FF.app.playGenerated('chaos', { seed: 186876, chaos: 5, chaosMask: 15 }));
  const cb = await guest
    .waitForFunction(() => window.__FF.game.session?.mirror && window.__FF.game.session.def.gen?.chaos === 5, null, { timeout: 20000 })
    .then(() => true, () => false);
  check('guest builds the chaos job', cb, cb);
  const hl = await host.evaluate(() => window.__FF.game.session.physics.linkCount);
  const gl = await guest.evaluate(() => window.__FF.game.session.physics.linkCount);
  check('same moving parts (thrown things too)', hl === gl, [hl, gl]);
  const D = 'window.__FF.game.session.hazards.find((h) => h.hudLine)';
  await host.evaluate(`(${D}).nextAt = 1e9`);
  await host.evaluate(`(${D}).trigger('boxes')`);
  await host.evaluate(`(${D}).trigger('money')`);
  const banner = await guest
    .waitForFunction(() => [...document.querySelectorAll('.hud .banner.chaos')].some((b) => /BOXES|MONEY/.test(b.textContent)), null, { timeout: 10000 })
    .then(() => true, () => false);
  check('guest sees the chaos banner', banner, banner);
  await host.waitForTimeout(2500);
  // a box the host dropped is where the guest shows it
  // (the guest is a snapshot or two behind: give it a moment to catch up)
  let hb = 0;
  let gb = 0;
  for (let i = 0; i < 40; i++) {
    hb = await host.evaluate(`(${D}).things.filter((t) => t.kind === 'box' && t.live).length`);
    gb = await guest.evaluate(`(${D}).things.filter((t) => t.kind === 'box' && t.obj.visible).length`);
    if (hb > 0 && gb === hb) break;
    await host.waitForTimeout(500);
  }
  check('guest sees the falling boxes', hb > 0 && gb === hb, [hb, gb]);
  const notes = await guest.evaluate(`(${D}).noteObjs.filter((o) => o.visible).length`);
  check('guest sees the money raining', notes > 0, notes);
  // the UFO hovers over the same spot on the guest's screen
  await host.evaluate(`(${D}).trigger('ufo')`);
  let uh = null;
  let ug = null;
  for (let i = 0; i < 40; i++) {
    await host.waitForTimeout(500);
    uh = await host.evaluate(`(() => { const u = (${D}).ufo; return u && [u.x, u.z]; })()`);
    ug = await guest.evaluate(`(() => { const d = ${D}; return d.ufoObj.visible ? [d.ufoObj.position.x, d.ufoObj.position.z] : null; })()`);
    if (uh && ug && Math.hypot(uh[0] - ug[0], uh[1] - ug[1]) < 1.5) break;
  }
  check('guest sees the UFO over the same spot', !!uh && !!ug && Math.hypot(uh[0] - ug[0], uh[1] - ug[1]) < 1.5, [uh, ug]);
  const line = await guest.evaluate(() => document.querySelector('.hud .chaos-line')?.textContent ?? '');
  check("guest's HUD says what's going on", /MONEY|BOXES|UFO/.test(line), line);
  const mm2 = await guest.evaluate(() => window.__FF.game.session.mirror.mismatch);
  check('snapshots fit the chaos job', !mm2, mm2);
  if (checks.some((c) => !c)) throw new Error('online random job failed');
}
