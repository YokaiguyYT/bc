// Switching away pauses the job, P resumes it, and choppy play suggests Fast graphics.
export default async function ({ page, base, shot }) {
  const screen = () => page.evaluate(() => window.__FF.app.screen);
  const checks = [];
  const check = (name, got, want) => checks.push({ name, got, want, ok: got === want });

  await page.goto(base + '?level=moveout&manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 90000 });
  await page.evaluate(() => window.__FF.game.advance(1));
  check('starts playing', await screen(), 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('switching apps pauses', await screen(), 'paused');
  check('the job really stops', await page.evaluate(() => window.__FF.game.session.paused), true);
  await page.keyboard.press('KeyP');
  check('P resumes', await screen(), 'playing');
  await page.keyboard.press('KeyP');
  check('P pauses again', await screen(), 'paused');
  await page.keyboard.press('Escape');
  check('Esc resumes', await screen(), 'playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('a second blur keeps the pause menu', await screen(), 'paused');
  // coming back and walking up then jumping must not quit the job
  await page.keyboard.press('KeyW');
  await page.keyboard.press('Space');
  check('W then Space on the pause menu resumes', await screen(), 'playing');

  // real time: headless software rendering is slow, so the tip should show up
  await page.goto(base + '?level=moveout');
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 90000 });
  const quality = await page.evaluate(() => window.__FF.game.settings.quality);
  let tip = '';
  for (let i = 0; i < 40 && !tip.startsWith('Choppy'); i++) {
    await page.waitForTimeout(500);
    tip = await page.evaluate(() => document.querySelector('.hint')?.textContent ?? '');
  }
  const fps = await page.evaluate(() => {
    const f = window.__FF.game.frameTimes;
    return f.length;
  });
  console.log('quality', quality, 'frames recorded', fps);
  check('choppy play suggests Fast graphics', tip.startsWith('Choppy') ? 'tip' : tip, 'tip');
  await shot('pause_tip');

  let bad = 0;
  for (const c of checks) {
    if (!c.ok) bad++;
    console.log(c.ok ? 'ok  ' : 'FAIL', c.name.padEnd(36), 'got', c.got, c.ok ? '' : `want ${c.want}`);
  }
  if (bad) throw new Error(`${bad} check(s) failed`);
}
