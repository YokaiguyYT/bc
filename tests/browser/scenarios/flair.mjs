// The Locker's extras and the company rank: trails, dances, emote packs and
// cargo skins (some locked until a rank), a promotion on the results card,
// and the ghost of your best run in a hand-made job.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ff.')) localStorage.removeItem(k);
    // a company that’s earned $7,700: Senior Mover, $300 short of Crew Lead
    localStorage.setItem('ff.stats', JSON.stringify({ deliveries: 3, flawless: 0, tips: 0, dailies: 0, bestShift: 0, online: 0, chaos: 0, chaosAny: 0, surprises: 0, bestPayout: 3000, earned: 7700, jobs: [], threeStars: [] }));
    localStorage.setItem('ff.wardrobe', JSON.stringify({ cash: 5000, owned: [], done: [] }));
  });
  await page.reload();
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(48), JSON.stringify(got));
  };
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const click = async (sel) => {
    await page.evaluate((sel) => document.querySelector(sel)?.click(), sel);
    await adv(0.1);
  };
  const wardrobe = () => page.evaluate(() => JSON.parse(localStorage.getItem('ff.wardrobe')));

  await page.evaluate(() => window.__FF.app.showMenu());
  const menuRank = await page.evaluate(() => document.querySelector('.hint-line:last-of-type')?.textContent ?? '');
  check('main menu shows the rank', /Senior Mover/.test(menuRank), menuRank);
  await click('#m-locker');
  const bar = await page.evaluate(() => document.querySelector('.rank-bar')?.textContent ?? '');
  check('Locker: rank and the way to the next', /Senior Mover/.test(bar) && /\$300 to/.test(bar), bar.replace(/\s+/g, ' '));
  const tabs = await page.evaluate(() => [...document.querySelectorAll('.locker .tab')].map((t) => t.id));
  check('Locker: trail, dance, emotes and cargo tabs', ['lk-t-trail', 'lk-t-dance', 'lk-t-emotes', 'lk-t-skin'].every((t) => tabs.includes(t)), tabs);

  // trails: sparkles are Senior Mover's (unlocked), flowers Foreman's (locked)
  await click('#lk-t-trail');
  await shot('flair_trails');
  const tr = await page.evaluate(() => ({ sparkles: document.querySelector('#lk-i-sparkles .state')?.textContent, flowers: document.querySelector('#lk-i-flowers .state')?.textContent }));
  check('rank items: unlocked at your rank, locked above it', tr.sparkles === 'Choose' && /Foreman/.test(tr.flowers ?? ''), tr);
  await click('#lk-i-sparkles');
  await click('#lk-i-flowers');
  let w = await wardrobe();
  check('choose sparkles; flowers stay locked', w.outfits[0].trail === 'sparkles', w.outfits[0]);
  // a dance and an emote pack (bought)
  await click('#lk-t-dance');
  await click('#lk-i-jump');
  await click('#lk-t-emotes');
  await click('#lk-i-silly');
  await click('#lk-t-skin');
  await click('#lk-i-sparkle');
  w = await wardrobe();
  check('jumping jacks, the silly emotes, a sparkly cargo', w.outfits[0].dance === 'jump' && w.outfits[0].emotes === 'silly' && w.outfits[0].skin === 'sparkle' && w.cash === 5000 - 300 - 500, [w.outfits[0], w.cash]);

  // in a job: the emote says the pack's line, the trail and the sparkles show up
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(0.6);
  await page.keyboard.press('Digit1');
  await adv(0.2);
  const said = await page.evaluate(() => document.querySelector('.hud .tags .say')?.textContent ?? '');
  check("P1's emote is from the silly pack", /Bawk/.test(said), said);
  // walk a bit (footsteps leave sparkles)
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    s.scriptedInput = true;
    s.players[0].intent.moveX = 1;
  });
  await adv(1.5);
  await shot('flair_trail_in_job');

  // a delivery: $600 more makes Crew Lead (a promotion, and the flex dance unlocked)
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    s.scriptedInput = false;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const res = await page.evaluate(() => ({ payout: window.__FF.game.session.result?.payout, text: document.querySelector('.payday')?.textContent ?? '', ghost: window.__FF.game.session.ghostSaved }));
  check('promoted to Crew Lead on the results card', /Crew Lead/.test(res.text) && /Flex/.test(res.text), [res.payout, res.text]);
  check('the run is saved as a ghost', res.ghost === true, res.ghost);
  await shot('flair_results');
  // the movers dance after the delivery
  await adv(1.5);

  // play it again: the ghost runs alongside
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(1);
  const ghost = await page.evaluate(() => {
    const s = window.__FF.game.session;
    return { view: !!s.ghostView, visible: s.ghostView?.root.visible, time: s.ghostView?.time };
  });
  check('next time, the ghost is there', ghost.view && ghost.visible, ghost);

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
