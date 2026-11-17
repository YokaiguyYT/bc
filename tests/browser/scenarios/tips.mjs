// Tips: on for a new player, off once they've a few deliveries (the default),
// and the Settings choice wins. Banners and money pops that come at once are
// stacked instead of drawn on top of each other.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (n, ok, got) => { checks.push(ok); console.log(ok ? 'ok  ' : 'FAIL', n.padEnd(58), JSON.stringify(got)); };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const seen = async (lvl) => {
    await page.evaluate((l) => window.__FF.app.playLevel(l), lvl);
    const got = new Set();
    for (let i = 0; i < 16; i++) { await adv(1); const t = await page.evaluate(() => { const h = document.querySelector('.hud .hint'); return h && h.style.opacity === '1' ? h.textContent : ''; }); if (t) got.add(t); }
    return [...got];
  };
  const setStats = (n) => page.evaluate((n) => { const s = JSON.parse(localStorage.getItem('ff.stats') || '{}'); s.deliveries = n; localStorage.setItem('ff.stats', JSON.stringify(s)); }, n);
  const setTips = (v) => page.evaluate((v) => { window.__FF.game.settings.tips = v; window.__FF.game.saveSettings(); }, v);
  await setStats(0);
  await setTips(undefined);
  const fresh = await seen('moveout');
  check('new player (auto): the job’s tips show', fresh.some((t) => /TV/.test(t)), fresh);
  await setStats(5);
  const old = await seen('moveout');
  check('after a few deliveries (auto): no tips (bonus goals still said)', !old.some((t) => /TV from both/.test(t)) && old.every((t) => t.startsWith('🎯')), old);
  await setTips('on');
  const on = await seen('moveout');
  check('Tips: On shows them again', on.some((t) => /TV/.test(t)), on);
  await setTips('off');
  await setStats(0);
  const off = await seen('moveout');
  check('Tips: Off hides them even for a new player', !off.some((t) => /TV from both/.test(t)), off);
  // the Settings screen has the choice
  await page.evaluate(() => window.__FF.app.showSettings(() => window.__FF.app.showMenu()));
  const seg = await page.evaluate(() => [...document.querySelectorAll('[data-setting="tips"] button')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')));
  check('Settings → Tips: New players / On / Off', JSON.stringify(seg) === JSON.stringify(['New players', 'On', 'Off*']), seg);
  await page.evaluate(() => document.querySelector('[data-setting="tips"] button[data-v="auto"]').click());
  check('…and it saves', await page.evaluate(() => JSON.parse(localStorage.getItem('ff.settings')).tips) === 'auto', 'auto');
  // banners at once: stacked, not on top of each other
  await page.evaluate(() => window.__FF.app.playLevel('playground'));
  await adv(2);
  const boxes = await page.evaluate(() => {
    const h = window.__FF.app.hud;
    h.banner('CHECKPOINT!', true); h.banner('WHOOPS!', true); h.banner('✨ CLEAN STRETCH +$20', true, 'clean');
    return [...document.querySelectorAll('.hud .banner')].map((b) => [b.offsetTop - b.offsetHeight / 2, b.offsetTop + b.offsetHeight / 2]);
  });
  let clash = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxes[i][0] < boxes[j][1] - 1 && boxes[j][0] < boxes[i][1] - 1) clash++;
  check('three banners at once: none overlap', boxes.length === 3 && clash === 0, boxes);
  await shot('banners');
  const pops = await page.evaluate(() => {
    const h = window.__FF.app.hud; const s = window.__FF.game.session; const at = s.cargo.body.translation(); const V = s.cargo.lastHitPos.constructor;
    for (let i = 0; i < 3; i++) h.pop(new V(at.x, at.y, at.z), '−$40', 'loss', 1.2);
    return [...document.querySelectorAll('.hud .world-pop')].map((b) => [b.offsetTop - b.offsetHeight / 2, b.offsetTop + b.offsetHeight / 2]);
  });
  let pc = 0;
  for (let i = 0; i < pops.length; i++) for (let j = i + 1; j < pops.length; j++) if (pops[i][0] < pops[j][1] - 1 && pops[j][0] < pops[i][1] - 1) pc++;
  check('three money pops at one spot: stacked', pops.length === 3 && pc === 0, pops);
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
