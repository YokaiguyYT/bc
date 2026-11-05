// Speedrun leaderboards: a board name (filtered), a delivery goes on this
// laptop's board and (with a name) the world board, a second player's run
// shows up too, two-player and solo boards are kept apart, and an unreachable
// world board says so. env BOARD_URL (default the local test broker).
export default async function ({ page, base, shot }) {
  const url = process.env.BOARD_URL ?? 'ws://127.0.0.1:8888';
  // boards of this run's own on the test broker
  const ns = 't' + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, 'x');
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(52), JSON.stringify(got));
  };
  const open = async (q = '') => {
    await page.goto(base + `?manual=1&board=${encodeURIComponent(url)}&boardns=${ns}${q}`);
    await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  };
  await open();
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  // a fresh laptop, and a board of its own for this run (the test broker keeps old runs)
  const job = 'moveout';
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ff.')) localStorage.removeItem(k);
    localStorage.setItem('ff.pid', JSON.stringify('testaaaa' + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x')));
  });

  // the Leaderboards screen, before a name is picked
  await page.evaluate(() => window.__FF.app.showBoards());
  await adv(0.2);
  const prompt = await page.evaluate(() => document.querySelector('.boards-panel')?.textContent ?? '');
  check('Leaderboards: asks for a board name', /Pick a board name/.test(prompt), prompt.replace(/\s+/g, ' ').slice(0, 90));

  // the name screen: rude or odd names can't be saved
  await page.evaluate(() => document.getElementById('b-name').click());
  await adv(0.1);
  await page.keyboard.type('sh1t');
  await adv(0.1);
  const rude = await page.evaluate(() => ({ disabled: document.getElementById('bn-ok')?.hasAttribute('disabled'), why: document.getElementById('bn-why')?.textContent }));
  check('a rude name can’t be saved', rude.disabled === true && /can’t go on the board/.test(rude.why ?? ''), rude);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('Speedy Sam');
  await adv(0.1);
  await shot('board_name');
  await page.keyboard.press('Enter');
  await adv(0.2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ff.boardName') ?? 'null'));
  check('typed a name and saved it', saved === 'Speedy Sam', saved);

  const deliver = async (secs) => {
    await page.evaluate((job) => window.__FF.app.playLevel(job), job);
    await adv(secs);
    await page.evaluate(() => {
      const s = window.__FF.game.session;
      const g = s.def.goal.pos;
      const V = s.cargo.lastHitPos.constructor;
      for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
      s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
    });
    for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
    // the world rank arrives a moment later (real time)
    for (let i = 0; i < 30; i++) {
      const t = await page.evaluate(() => document.getElementById('r-world')?.textContent ?? '');
      if (!/checking/.test(t)) break;
      await page.waitForTimeout(200);
    }
    return page.evaluate(() => document.querySelector('.board-line')?.textContent ?? '');
  };

  // a delivery: on this laptop's board and the world's
  const line1 = await deliver(16);
  check('results: best time, this laptop, world rank', /your best time/.test(line1) && /#1 on this laptop/.test(line1) && /in the world/.test(line1), line1);
  await shot('board_results');

  // a second player (another laptop), a bit slower
  await page.evaluate(() => {
    localStorage.setItem('ff.pid', JSON.stringify('testbbbb' + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x')));
    localStorage.setItem('ff.boardName', JSON.stringify('Ghost Rider'));
    localStorage.removeItem('ff.times.v1');
  });
  const line2 = await deliver(20);
  check('a second player gets on the world board', /in the world/.test(line2), line2);

  // the world board lists both, fastest first
  await page.evaluate(() => window.__FF.app.showBoards());
  let world = '';
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    world = await page.evaluate(() => document.getElementById('b-world')?.textContent ?? '');
    if (!/Fetching/.test(world)) break;
  }
  const sam = world.indexOf('Speedy Sam');
  const ghost = world.indexOf('Ghost Rider');
  check('world board: both runs, faster one above', sam >= 0 && ghost > sam, world.replace(/\s+/g, ' ').slice(0, 160));
  await shot('board_world');

  // solo runs go on the solo board, apart from the two-player one
  await page.evaluate(() => (window.__FF.game.settings.solo = true));
  const line3 = await deliver(18);
  check('a solo delivery goes on the solo board', /Solo/.test(line3), line3);
  await page.evaluate(() => {
    window.__FF.game.settings.solo = false;
    window.__FF.app.showBoards();
    document.getElementById('b-solo').click();
  });
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    world = await page.evaluate(() => document.getElementById('b-world')?.textContent ?? '');
    if (!/Fetching/.test(world)) break;
  }
  check('the solo board has the solo run only', /Ghost Rider/.test(world) && !/Speedy Sam/.test(world), world.replace(/\s+/g, ' ').slice(0, 120));

  // nobody home: it says so, and this laptop's times are still there
  await page.goto(base + '?manual=1&board=0');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => window.__FF.app.showBoards());
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(200);
    world = await page.evaluate(() => document.getElementById('b-world')?.textContent ?? '');
    if (!/Fetching/.test(world)) break;
  }
  const local = await page.evaluate(() => document.querySelector('.board-cols > div:nth-child(2)')?.textContent ?? '');
  check('no world board: says so; this laptop still lists runs', /Couldn’t reach/.test(world) && /Ghost Rider/.test(local), [world.slice(0, 60), local.replace(/\s+/g, ' ').slice(0, 60)]);

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
