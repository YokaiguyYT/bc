// The job list: up/down move a row at a time, the ends don't wrap, Back is
// reachable, and the title and Back stay on screen however many jobs there are.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => window.__FF.app.showLevels());
  const state = () =>
    page.evaluate(() => {
      const cards = [...document.querySelectorAll('.level-card')];
      const cols = cards.filter((c) => c.offsetTop === cards[0].offsetTop).length;
      const el = document.querySelector('.focus');
      const onScreen = (sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight;
      };
      return { cols, n: cards.length, at: el?.classList.contains('level-card') ? cards.indexOf(el) : el?.id, title: onScreen('.logo'), back: onScreen('#l-back') };
    });
  const checks = [];
  const check = (name, ok, got) => checks.push({ name, ok, got });
  let s = await state();
  check('title on screen', s.title, s.title);
  check('Back on screen', s.back, s.back);
  check('starts on the first job', s.at === 0, s.at);
  await page.keyboard.press('ArrowDown');
  const down = await state();
  check('down moves a row', down.at === Math.min(s.cols, s.n - 1) || down.at === 'l-back', down.at);
  await page.keyboard.press('ArrowUp');
  check('up comes back', (await state()).at === 0, (await state()).at);
  await page.keyboard.press('ArrowUp');
  check('up from the top row stays', (await state()).at === 0, (await state()).at);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  check('down from the bottom reaches Back', (await state()).at === 'l-back', (await state()).at);
  await shot('levelnav');
  let bad = 0;
  for (const c of checks) {
    if (!c.ok) bad++;
    console.log(c.ok ? 'ok  ' : 'FAIL', c.name.padEnd(36), JSON.stringify(c.got));
  }
  if (bad) throw new Error(`${bad} check(s) failed`);
}
