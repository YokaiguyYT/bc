// "Check this network" on the Online screen: each matchmaking server reported
// reachable or not, a direct-link guess, and a summary. Needs servers to talk
// to: run it against local ones (NET=ws://127.0.0.1:9000/peerjs
// MQTT=ws://127.0.0.1:8888), as the online tests do. DOWN=1 points both at a
// closed port instead, to check the "blocked" report.
export default async function ({ page, base, out }) {
  const down = process.env.DOWN === '1';
  const net = down ? 'ws://127.0.0.1:9/peerjs' : process.env.NET ?? 'ws://127.0.0.1:9000/peerjs';
  const mqtt = down ? 'ws://127.0.0.1:9' : process.env.MQTT ?? 'ws://127.0.0.1:8888';
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(`${base}?net=${encodeURIComponent(net)}&mqtt=${encodeURIComponent(mqtt)}`);
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(44), JSON.stringify(got));
  };
  const until = (fn, ms = 20000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true, () => false);

  await page.evaluate(() => window.__FF.app.showOnline());
  await page.click('#o-check');
  check('the check screen opens', (await page.evaluate(() => window.__FF.app.screen)) === 'netcheck', await page.evaluate(() => window.__FF.app.screen));
  const finished = await until(() => document.querySelectorAll('.net-check li').length === 3 && !document.querySelector('.net-check li.nc-wait'), 30000);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.net-check li')].map((li) => [li.dataset.check, li.className, li.textContent.trim()]));
  check('every check finishes', finished, rows);
  const state = (id) => rows.find((r) => r[0] === id)?.[1];
  if (down) {
    check('PeerJS reported blocked', state('peerjs') === 'nc-bad', state('peerjs'));
    check('MQTT reported blocked', state('mqtt') === 'nc-bad', state('mqtt'));
  } else {
    check('PeerJS reachable', state('peerjs') === 'nc-ok', state('peerjs'));
    check('MQTT reachable', state('mqtt') === 'nc-ok', state('mqtt'));
  }
  check('direct link: a verdict', ['nc-ok', 'nc-warn'].includes(state('direct')), state('direct'));
  const summary = await page.evaluate(() => [document.querySelector('.net-check-summary').className, document.querySelector('.net-check-summary').textContent]);
  check(down ? 'summary: blocked, try another network' : 'summary: should work', down ? /nc-bad/.test(summary[0]) && /hotspot/.test(summary[1]) : /nc-ok/.test(summary[0]), summary);
  await page.screenshot({ path: `${out}/netcheck${down ? '_down' : ''}.png` });

  // "Check again" starts over, Back returns to the Online screen
  await page.keyboard.press('Enter');
  check('check again restarts', await until(() => window.__FF.app.screen === 'netcheck' && !!document.querySelector('.net-check li'), 5000), null);
  await page.keyboard.press('Escape');
  check('Esc goes back to Online', await until(() => window.__FF.app.screen === 'online', 5000), await page.evaluate(() => window.__FF.app.screen));

  const bad = checks.filter((c) => !c).length;
  if (bad) throw new Error(`${bad} check(s) failed`);
}
