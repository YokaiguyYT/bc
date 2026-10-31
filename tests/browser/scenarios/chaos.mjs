// Chaos jobs: the Chaos screen (a slider from Mild to ULTRA, kinds on and
// off, all by keyboard), a chaos job with its director, each kind of chaos
// doing what it says (and the world put back after), money rain paying, the
// HUD line and banners, the chaos pay on the results card, and nothing left
// changed after quitting mid-chaos.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => {
    localStorage.removeItem('ff.chaos');
    localStorage.removeItem('ff.chaosBest');
  });
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(46), JSON.stringify(got));
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
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('ff.chaos') || 'null'));
  const focused = () => page.evaluate(() => document.querySelector('.focus')?.id);

  // Play → Chaos
  await page.evaluate(() => window.__FF.app.showPlay());
  const tile = await page.evaluate(() => !!document.querySelector('#p-chaos'));
  check('the Play screen has a Chaos tile', tile, tile);
  await click('#p-chaos');
  check('Chaos screen', (await page.evaluate(() => window.__FF.app.screen)) === 'chaos', await page.evaluate(() => window.__FF.app.screen));
  // keyboard: up from Start lands on the kinds, then the slider
  await key('ArrowUp');
  for (let i = 0; i < 6 && (await focused()) !== 'ch-level'; i++) await key('ArrowUp');
  check('the slider can be focused', (await focused()) === 'ch-level', await focused());
  await key('ArrowRight');
  await key('ArrowRight');
  let c = await saved();
  check('→ → turns it up to ULTRA', c?.level === 5, c);
  const label = await page.evaluate(() => document.querySelector('.chaos-slider .now')?.textContent);
  check('…and it says so', /ULTRA/.test(label), label);
  check('the focus stays on the slider', (await focused()) === 'ch-level', await focused());
  await key('ArrowLeft');
  c = await saved();
  check('← turns it down', c?.level === 4, c);
  await key('ArrowRight');
  await shot('chaos_setup');
  await click('#ch-k8');
  c = await saved();
  check('critters off', c?.mask === 7, c);
  await click('#ch-k8');
  check('…and on again', (await saved())?.mask === 15, await saved());

  // a chaos job on ULTRA
  await click('#ch-go');
  const st = await page.evaluate(() => {
    const s = window.__FF.game.session;
    return { screen: window.__FF.app.screen, gen: s.def.gen, pay: s.def.payScale, dir: s.hazards.some((h) => h.trigger) };
  });
  check('a chaos job starts (ULTRA, pays ×3)', st.screen === 'playing' && st.gen.chaos === 5 && st.pay === 3 && st.dir, st);
  const line = await page.evaluate(() => {
    const el = document.querySelector('.chaos-line');
    return el && getComputedStyle(el).display !== 'none' ? el.textContent : null;
  });
  check('the HUD has a chaos line', /ULTRA/.test(line ?? ''), line);

  // the tour: a known course (a piano on a boardwalk) on ULTRA
  await page.evaluate(() => window.__FF.app.playGenerated('chaos', { seed: 186876, chaos: 5, chaosMask: 15 }));
  await adv(0.3);
  // (an unbreakable load for the tour: on ULTRA a meteor can land right on it)
  await page.evaluate(() => (window.__FF.tuning.damage.scale = 0));
  const D = 'window.__FF.game.session.hazards.find((h) => h.trigger)';
  const trigger = (id) => page.evaluate(`(${D}).trigger(${JSON.stringify(id)})`);
  // (one at a time for the tour: nothing random in between)
  await page.evaluate(`(${D}).nextAt = 1e9`);
  const live = (kind) => page.evaluate(`(${D}).things.filter((t) => t.kind === ${JSON.stringify(kind)} && t.live).length`);
  // pick the load up off the stand first? no: leave it; chaos happens around it either way
  const g0 = await page.evaluate(() => window.__FF.tuning?.physics.gravity ?? null);
  const grav = () => page.evaluate(`(${D}).sim.physics.world.gravity.y`);
  const banners = () => page.evaluate(() => [...document.querySelectorAll('.hud .banner.chaos')].map((b) => b.textContent));

  await trigger('meteors');
  await adv(1.6);
  const b1 = await banners();
  check('a banner: METEOR SHOWER', b1.some((t) => /METEOR/.test(t)), b1);
  const rocks = await live('rock');
  check('meteors are falling', rocks >= 2, rocks);
  const ring = await page.evaluate(`(${D}).things.some((t) => t.kind === 'rock' && t.ring.visible)`);
  check('…with a target ring where they land', ring, ring);
  await shot('chaos_meteors');
  await adv(2.5);
  const landed = await page.evaluate(`(${D}).things.filter((t) => t.kind === 'rock' && t.landed).length`);
  check('meteors land', landed >= 2, landed);
  await adv(9);
  check('…and are tidied away', (await live('rock')) === 0, await live('rock'));

  await trigger('moon');
  await adv(0.3);
  const gm = await grav();
  check('moon gravity: gravity down to a third', gm > -5 && gm < -3, gm);
  await adv(9);
  const gb = await grav();
  check('…and back after', gb < -11, gb);

  await trigger('speed');
  await adv(0.2);
  const sp = await page.evaluate(() => window.__FF.game.session.players.map((p) => p.speedScale));
  check('speed shoes', sp.every((x) => x === 1.7), sp);
  await trigger('ice');
  await adv(0.2);
  const ice = await page.evaluate(() => window.__FF.game.session.players.map((p) => p.slippery));
  check('flash freeze: slippery', ice.every(Boolean), ice);
  await adv(8);
  const after = await page.evaluate(() => window.__FF.game.session.players.map((p) => [p.speedScale, p.slippery]));
  check('…both wear off', after.every(([s, i]) => s === 1 && !i), after);

  await trigger('stampede');
  await adv(1.5);
  const ch = await live('chicken');
  check('chicken stampede', ch >= 4, ch);
  const vel = await page.evaluate(`(${D}).things.filter((t) => t.kind === 'chicken' && t.live).map((t) => Math.hypot(t.body.linvel().x, t.body.linvel().z))`);
  check('…running (some bump into things)', vel.some((v) => v > 3), vel.map((v) => +v.toFixed(1)));
  await shot('chaos_chickens');
  await adv(10);

  await trigger('barrels');
  await adv(2);
  check('rolling barrels', (await live('barrel')) >= 2, await live('barrel'));
  await trigger('balls');
  await adv(1);
  check('beach balls', (await live('ball')) >= 2, await live('ball'));
  await trigger('boxes');
  await adv(2);
  check("it's raining boxes", (await live('box')) >= 5, await live('box'));
  await shot('chaos_stuff');
  await adv(10);

  // money rain: walk a mover through a note
  await trigger('money');
  await adv(5);
  const tips0 = await page.evaluate(() => window.__FF.game.session.tips);
  await page.evaluate(`(() => {
    const d = ${D};
    const n = d.money.notes.find((_, i) => !(d.money.got & (1 << i)));
    const p = window.__FF.game.session.players[0];
    p.teleport(new p.bodyPos.constructor(n.x, n.ground + 1.2, n.z), 0);
  })()`);
  await adv(0.3);
  const tips1 = await page.evaluate(() => window.__FF.game.session.tips);
  check('money rain: grab a note, get a tip', tips1 > tips0, [tips0, tips1]);
  await shot('chaos_money');
  await adv(5);

  await trigger('quake');
  await adv(0.5);
  const q = await page.evaluate(`(${D}).quake`);
  check('earthquake', q > 0.5, q);
  await trigger('gust');
  await adv(2);
  const gust = await page.evaluate(`!!(${D}).gust`);
  check('hurricane', gust, gust);
  await adv(5);

  // left alone, things just happen
  await page.evaluate(`(${D}).nextAt = 0`);
  await page.evaluate(() => {
    window.__seen = [];
    return window.__FF.game.session.events.on('chaos', (e) => window.__seen.push(e.kind));
  });
  await adv(30);
  const happened = await page.evaluate(() => window.__seen);
  check('on ULTRA, things happen by themselves', happened.length >= 4, happened);

  // super jump then quit mid-jump: the world is put back
  await trigger('jump');
  await adv(0.3);
  const jv = await page.evaluate(`(${D}).sim && window.__FF.tuning ? window.__FF.tuning.jump.velocity : null`);
  await page.evaluate(() => window.__FF.app.quitToMenu());
  await adv(0.3);
  const restored = await page.evaluate(() => {
    const s = window.__FF.game.session;
    return { g: s.physics.world.gravity.y };
  });
  check('quitting mid-chaos leaves the world normal', restored.g < -11, { jv, ...restored });

  await page.evaluate(() => (window.__FF.tuning.damage.scale = 1));
  // deliver a chaos job: the chaos pay is on the card
  await page.evaluate(() => window.__FF.app.playGenerated('chaos', { seed: 4242, chaos: 2, chaosMask: 15 }));
  await adv(0.5);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const res = await page.evaluate(() => ({ r: window.__FF.game.session.result, text: document.querySelector('.results')?.textContent ?? '', btn: !!document.querySelector('#r-chaos') }));
  check('results: chaos pay (×1.5)', res.r?.bonus > 0 && /Chaos pay/.test(res.text), [res.r?.bonus, res.r?.payout]);
  check('results: new chaos job button', res.btn, res.btn);
  const best = await page.evaluate(() => JSON.parse(localStorage.getItem('ff.chaosBest') || 'null'));
  check('best chaos delivery kept', best?.level === 2 && best.payout === res.r?.payout, best);
  await shot('chaos_results');
  await click('#r-chaos');
  const again = await page.evaluate(() => window.__FF.game.session.def.gen);
  check('new chaos job: same level, new number', again.chaos === 2 && again.seed !== 4242, again);

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
