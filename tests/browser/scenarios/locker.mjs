// The Locker: the wallet starts with what was earned before it existed, things
// can be bought and worn (the menu's movers change), quests unlock things, a
// delivery pays into the wallet and the results card says so, and keyboard
// navigation moves round the item grid.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  // an old player: $5,000 earned before the Locker; no wardrobe yet
  await page.evaluate(() => {
    localStorage.removeItem('ff.wardrobe');
    localStorage.removeItem('ff.stats');
    localStorage.setItem('ff.progress.v1', JSON.stringify({ moveout: { completed: true, stars: 2, bestPayout: 5000, bestTime: 60, bestCondition: 0.9, attempts: 1 } }));
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
  const key = async (k) => {
    await page.keyboard.press(k);
    await adv(0.05);
  };
  const wallet = () => page.evaluate(() => JSON.parse(localStorage.getItem('ff.wardrobe') || 'null'));
  const focused = () => page.evaluate(() => document.querySelector('.focus')?.id);

  await page.evaluate(() => localStorage.removeItem('ff.news'));
  await page.evaluate(() => localStorage.removeItem('ff.newsShown'));
  await page.evaluate(() => window.__FF.app.showMenu());
  const nudge = await page.evaluate(() => document.querySelector('#m-nudge')?.textContent ?? '');
  check("a returning player is told what's new", /New:.*Chaos/.test(nudge), nudge);
  await shot('locker_menu');
  await click('#m-nudge');
  check('…which opens the Play screen', (await page.evaluate(() => window.__FF.app.screen)) === 'play', await page.evaluate(() => window.__FF.app.screen));
  await page.evaluate(() => window.__FF.app.showMenu());
  const nudge2 = await page.evaluate(() => document.querySelector('#m-nudge')?.textContent ?? '');
  check('then it nudges about the daily instead', /Daily #/.test(nudge2), nudge2);
  const btn = await page.evaluate(() => document.querySelector('#m-locker')?.textContent);
  check('menu has the Locker, with the cash', !!btn && btn.includes('5,000'), btn);
  await click('#m-locker');
  check('Locker opens', (await page.evaluate(() => window.__FF.app.screen)) === 'locker', await page.evaluate(() => window.__FF.app.screen));
  let w = await wallet();
  check('wallet seeded from earnings', w?.cash === 5000, w?.cash);
  check('focus starts on what P1 wears', (await focused()) === 'lk-i-cap', await focused());
  const t0 = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
  check('an old delivery finishes the first quest', w.done.includes('first') && t0.includes('Party hat'), [w.done, t0]);
  await shot('locker_hats');

  // grid navigation: down moves a whole row
  const before = await focused();
  await key('ArrowDown');
  const after = await focused();
  const cols = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.item-card')];
    return c.filter((x) => x.offsetTop === c[0].offsetTop).length;
  });
  const ids = await page.evaluate(() => [...document.querySelectorAll('.item-card')].map((c) => c.id));
  check('down moves a row in the grid', ids.indexOf(after) - ids.indexOf(before) === cols, [before, after, cols]);

  // buy a cowboy hat for P1 and wear it: the menu mover gets it
  await click('#lk-i-cowboy');
  w = await wallet();
  check('bought the cowboy hat ($900)', w.cash === 4100 && w.owned.includes('hat:cowboy') && w.outfits[0].hat === 'cowboy', w);
  const extras = await page.evaluate(() => window.__FF.game.session.rigs[0].extras.length);
  check('the menu mover wears it', extras === 1, extras);
  check('focus stays on the hat', (await focused()) === 'lk-i-cowboy', await focused());
  // too pricey: the wizard hat ($2,500) twice → second fails
  await click('#lk-i-wizard');
  await click('#lk-i-tophat');
  w = await wallet();
  check('wizard + top hat: $100 left', w.cash === 100, w.cash);
  await click('#lk-i-chef');
  w = await wallet();
  check('chef hat: not enough cash, nothing bought', w.cash === 100 && !w.owned.includes('hat:chef'), w.cash);
  const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent ?? '');
  check('…and says how much more is needed', toast.includes('more to earn'), toast);
  // quest items are locked
  await click('#lk-i-crown');
  w = await wallet();
  check('the crown is a quest prize', w.outfits[0].hat === 'tophat', w.outfits[0]);

  // surprise me: a random mix of what P1 owns
  const o0 = JSON.stringify((await wallet()).outfits[0]);
  await click('#lk-rand');
  const o1 = (await wallet()).outfits[0];
  check('🎲 surprise me changes the outfit (owned things only)', JSON.stringify(o1) !== o0 && ['cap', 'none', 'cowboy', 'wizard', 'tophat', 'party'].includes(o1.hat), [o0, o1]);
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('ff.wardrobe'));
    w.outfits[0] = { color: 'orange', hat: 'tophat', face: 'none', back: 'none' };
    localStorage.setItem('ff.wardrobe', JSON.stringify(w));
  });
  // the camera closes in on the mover being dressed, who stands still
  const view = await page.evaluate(() => ({ close: window.__FF.game.session.cameraRig.closeUp, hold: window.__FF.app.attract?.hold }));
  check('close-up on the mover being dressed', view.close > 0 && view.hold === 0, view);
  // P2: colour
  await click('#lk-p1');
  await click('#lk-t-color');
  await shot('locker_colours');
  await click('#lk-i-green');
  w = await wallet();
  check('green costs $300: not enough', w.outfits[1].color === 'blue', w.outfits[1]);
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('ff.wardrobe'));
    w.cash += 1000;
    localStorage.setItem('ff.wardrobe', JSON.stringify(w));
  });
  await click('#lk-i-green');
  w = await wallet();
  check('P2 in green', w.outfits[1].color === 'green' && w.cash === 800, [w.outfits[1], w.cash]);
  const col = await page.evaluate(() => window.__FF.game.session.rigs[1].skin.color.getHex());
  check('menu mover P2 is green', col === 0x4cc46a, col.toString(16));
  await click('#lk-t-back');
  await click('#lk-i-backpack');
  await click('#lk-t-quests');
  await shot('locker_quests');
  const q = await page.evaluate(() => document.querySelectorAll('.quest').length);
  check('quests listed', q === 14, q);

  await page.evaluate(() => window.__FF.app.showMenu());
  const view2 = await page.evaluate(() => ({ close: window.__FF.game.session.cameraRig.closeUp, hold: window.__FF.app.attract?.hold }));
  check('…and back to the usual view after', view2.close === null && view2.hold === null, view2);
  // a delivery: pays the wallet; the fifth delivery gives the hard hat
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ff.stats'));
    s.deliveries = 4;
    localStorage.setItem('ff.stats', JSON.stringify(s));
  });
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await adv(0.5);
  const outfitInJob = await page.evaluate(() => window.__FF.game.session.outfits);
  check('the job uses the outfits', outfitInJob[0].hat === 'tophat' && outfitInJob[1].color === 'green' && outfitInJob[1].back === 'backpack', outfitInJob);
  const hudColour = await page.evaluate(() => document.querySelector('.hud')?.style.getPropertyValue('--p2'));
  check('the HUD knows P2 is green', hudColour === '#4cc46a', hudColour);
  const cash0 = (await wallet()).cash;
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const res = await page.evaluate(() => ({ payout: window.__FF.game.session.result?.payout, text: document.querySelector('.payday')?.textContent ?? '' }));
  w = await wallet();
  check('payout went in the wallet', w.cash === cash0 + res.payout, [cash0, res.payout, w.cash]);
  check('results say so', res.text.includes('Locker wallet'), res.text);
  check('fifth delivery: the hard hat', w.done.includes('five') && res.text.includes('Hard hat'), [w.done, res.text]);
  await shot('locker_results');
  // back in the Locker the party hat can be worn
  await page.evaluate(() => window.__FF.app.showMenu());
  await click('#m-locker');
  await click('#lk-t-hat');
  await click('#lk-i-party');
  w = await wallet();
  check('wear the party hat', w.outfits[1].hat === 'party', w.outfits[1]);

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
