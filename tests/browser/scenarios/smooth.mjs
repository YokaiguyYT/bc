// "Keep it smooth": the picture is drawn a step smaller when frames come slowly,
// steps back up when there's time to spare, and is put back when shrinking it
// made no difference (frames held back by the browser, or slow sums).
// Fed with made-up frame times, then once for real on the (slow) software renderer.
export default async function ({ page, base }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(64), JSON.stringify(got));
  };
  const ready = () => page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 90000 });

  // under automation it is off unless asked for
  await page.goto(base + '?level=playground&manual=1');
  await ready();
  const r0 = await page.evaluate(() => {
    const r = window.__FF.game.renderer;
    for (let i = 0; i < 600; i++) r.pace(1 / 20);
    return [r.smooth, r.smoothStep];
  });
  check('off under automation (tests draw at full size)', r0[0] === false && r0[1] === 0, r0);

  // made-up frame times (manual mode: the game's own loop feeds it nothing)
  await page.goto(base + '?level=playground&manual=1&smooth=1');
  await ready();
  const feed = (fps, seconds) =>
    page.evaluate(
      ([fps, seconds]) => {
        const r = window.__FF.game.renderer;
        const seen = [];
        for (let i = 0; i < fps * seconds; i++) {
          r.pace(1 / fps);
          if (seen[seen.length - 1] !== r.smoothStep) seen.push(r.smoothStep);
        }
        const c = r.renderer.domElement;
        return { step: r.smoothStep, seen, width: c.width, css: c.clientWidth, shadowsEveryFrame: r.renderer.shadowMap.autoUpdate };
      },
      [fps, seconds],
    );
  const a = await feed(60, 10);
  check('60 frames a second: left alone', a.step === 0 && a.width === a.css, a);
  // a machine that gets quicker as the picture shrinks: 34 fps, and each step buys 15%
  const b = await page.evaluate(() => {
    const r = window.__FF.game.renderer;
    const seen = [0];
    for (let i = 0; i < 2000; i++) {
      r.pace(1 / (34 * (1 + 0.15 * r.smoothStep)));
      if (seen[seen.length - 1] !== r.smoothStep) seen.push(r.smoothStep);
    }
    const c = r.renderer.domElement;
    return { step: r.smoothStep, seen, width: c.width, css: c.clientWidth };
  });
  check('slow, and shrinking helps: steps down until it is quick enough', b.step >= 2 && b.step <= 3 && b.width < b.css * 0.8, b);
  const c = await feed(60, 60);
  check('…and back up, a step at a time, when there is time to spare', c.step === 0 && c.seen.length >= 3 && c.width === c.css, c);
  // held at 30 whatever the size (a phone saving battery): two steps, no gain, put back, left alone
  const d = await feed(30, 20);
  check('held at 30 whatever the size: tried, then put back', d.step === 0 && d.seen.includes(2) && d.width === d.css, d);
  const e = await feed(30, 40);
  check('…and left alone for a good while', e.step === 0 && e.seen.length === 1, e);
  // very slow, and it helps all the way: the last steps redraw shadows every other frame
  const f = await page.evaluate(() => {
    const r = window.__FF.game.renderer;
    for (let i = 0; i < 100 * 60; i++) r.pace(1 / 60); // (the rest runs out)
    for (let i = 0; i < 1500; i++) r.pace(1 / (12 * (1 + 0.2 * r.smoothStep)));
    const c = r.renderer.domElement;
    return { step: r.smoothStep, width: c.width, css: c.clientWidth, shadowsEveryFrame: r.renderer.shadowMap.autoUpdate };
  });
  check('very slow: right down, shadows every other frame', f.step === 5 && f.shadowsEveryFrame === false && f.width <= f.css * 0.51, f);
  await page.evaluate(() => window.__FF.game.advance(0.2));
  const drew = await page.evaluate(() => {
    const c = window.__FF.game.renderer.renderer.domElement;
    return c.toDataURL('image/png').length;
  });
  check('…and it still draws', drew > 5000, drew);
  // the switch in Settings
  await page.evaluate(() => window.__FF.app.showSettings(() => {}));
  await page.click('.seg[data-setting="smooth"] button[data-v="0"]');
  const g = await page.evaluate(() => {
    const r = window.__FF.game.renderer;
    r.pace(1 / 30);
    const c = r.renderer.domElement;
    return { smooth: r.smooth, step: r.smoothStep, saved: JSON.parse(localStorage.getItem('ff.settings')).smooth, width: c.width, css: c.clientWidth, shadowsEveryFrame: r.renderer.shadowMap.autoUpdate };
  });
  check('switched off in Settings: full size again, and remembered', g.smooth === false && g.step === 0 && g.saved === false && g.width === g.css && g.shadowsEveryFrame, g);
  await page.evaluate(() => localStorage.removeItem('ff.settings'));

  // for real: the software renderer is slow at pixels, so it steps down by itself
  await page.goto(base + '?level=playground&smooth=1');
  await ready();
  const stepped = await page.waitForFunction(() => window.__FF.game.renderer.smoothStep > 0, null, { timeout: 40000 }).then(() => true, () => false);
  check('for real, on a slow renderer: it steps down by itself', stepped, await page.evaluate(() => window.__FF.game.renderer.smoothStep));
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
