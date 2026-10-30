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
  if (checks.some((c) => !c)) throw new Error('online random job failed');
}
