// Diagnostics: how far behind the host the guest's copy runs, and how many
// snapshots arrive per second, over a given route (ONLY=relay|direct, NET=…).
export default async function ({ page, base }) {
  const params = new URLSearchParams();
  const net = process.env.NET;
  if (!net) params.set('net', 'local');
  else if (net !== 'peerjs') params.set('net', net);
  if (process.env.ONLY === 'relay') params.set('p2p', '0');
  if (process.env.ONLY === 'direct') params.set('relay', '0');
  const q = '?' + params;
  const ctx = await page.context().browser().newContext({ viewport: { width: 480, height: 300 } });
  const host = await ctx.newPage();
  const guest = await ctx.newPage();
  const ready = (p) => p.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await Promise.all([host.goto(base + q), guest.goto(base + q)]);
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
  await host.evaluate(() => window.__FF.app.playLevel('playground'));
  await guest.waitForFunction(() => window.__FF.game.session?.mirror, null, { timeout: 20000 });
  for (let i = 0; i < 6; i++) {
    await host.waitForTimeout(1000);
    const h = await host.evaluate(() => [window.__FF.game.session.physics.time, window.__FF.app.host?.via, performance.now()]);
    const g = await guest.evaluate(() => {
      const m = window.__FF.game.session?.mirror;
      return [window.__FF.game.session?.physics.time, m?.received, m?.delay, m?.frames?.length, m?.events?.length];
    });
    console.log(`t+${i + 1}s host t=${h[0].toFixed(2)} via=${h[1]} | guest t=${g[0]?.toFixed(2)} lag=${(h[0] - g[0]).toFixed(2)} recv=${g[1]} delay=${g[2]?.toFixed(3)} buffered=${g[3]} events=${g[4]}`);
  }
}
