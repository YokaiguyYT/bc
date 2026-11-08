// Invite links: while hosting (from a web address), "Send an invite" / "Copy an
// invite link" is offered; a friend opening the link (?join=CODE) goes straight
// to joining that game, and the code comes out of the address (no rejoin on reload).
export default async function ({ page, base }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(56), JSON.stringify(got));
  };
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const until = (p, fn, ms = 30000) => p.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);
  const ctx = await page.context().browser().newContext({ viewport: { width: 800, height: 500 } });
  const host = await ctx.newPage();
  await host.goto(base + '?net=local');
  await ready(host);
  await host.evaluate(() => window.__FF.app.showOnline());
  await host.click('#o-host');
  await until(host, () => /^[A-Z0-9]{5}$/.test([...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join('')));
  const code = await host.evaluate(() => [...document.querySelectorAll('.net-code span')].map((s) => s.textContent).join(''));
  const btn = await host.evaluate(() => document.getElementById('h-invite')?.textContent ?? '');
  check('hosting: an invite button', /invite|code/i.test(btn), btn);
  const guest = await ctx.newPage();
  await guest.goto(base + `?net=local&join=${code.toLowerCase()}`);
  await ready(guest);
  check('the link joins the game', await until(guest, () => window.__FF.app.screen === 'guest'), code);
  const url = await guest.evaluate(() => location.search);
  check('…and the code comes out of the address', !/join/.test(url), url);
  check('the host sees them', await until(host, () => !!window.__FF.app.host?.connected), '');
  await ctx.close();
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
