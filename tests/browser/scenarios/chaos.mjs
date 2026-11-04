// Chaos jobs: the Chaos screen (a slider from Mild to ULTRA by keyboard, and
// no list of what can happen), a chaos job with its director, each kind of chaos
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
  // keyboard: up from Start lands on the slider
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
  // no spoilers: the screen doesn't list what can happen
  const spoil = await page.evaluate(() => (document.querySelector('.chaos-kind') ? 'KINDS ' : '') + (document.querySelector('.chaos-setup')?.textContent ?? ''));
  check("the Chaos screen doesn't spoil the surprises", !/meteor|chicken|UFO|quake|gravity|barrel|KINDS/i.test(spoil), spoil.slice(0, 120));

  // a friend's chaos job number, played at the slider's level
  await click('#ch-num');
  const title = await page.evaluate(() => document.querySelector('.logo')?.textContent ?? '');
  check("a friend's chaos number screen", /CHAOS JOB NUMBER/.test(title), title);
  for (const d of '186876') await key('Digit' + d);
  await key('Enter');
  const fj = await page.evaluate(() => window.__FF.game.session?.def.gen);
  check('…plays that chaos job on ULTRA', fj?.seed === 186876 && fj?.chaos === 5, fj);
  await page.evaluate(() => window.__FF.app.showChaos());
  await adv(0.1);

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
  // (everyone and the load back at the start, as if after a fall: each check starts from the same place)
  const calm = async () => {
    await page.evaluate(() => {
      const s = window.__FF.game.session;
      s.respawnAll(false);
    });
    await adv(0.6);
  };
  // (one at a time for the tour: nothing random in between)
  await page.evaluate(`(${D}).nextAt = 1e9`);
  const live = (kind) => page.evaluate(`(${D}).things.filter((t) => t.kind === ${JSON.stringify(kind)} && t.live).length`);
  // pick the load up off the stand first? no: leave it; chaos happens around it either way
  const g0 = await page.evaluate(() => window.__FF.tuning?.physics.gravity ?? null);
  const grav = () => page.evaluate(`(${D}).sim.physics.world.gravity.y`);
  // (banners only stay up for two real seconds: note each one as it appears)
  await page.evaluate(() => {
    window.__banners = [];
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('chaos')) window.__banners.push(n.textContent);
    }).observe(document.querySelector('.hud'), { childList: true });
  });
  const banners = () => page.evaluate(() => window.__banners);

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

  await calm();
  await trigger('stampede');
  await adv(1.5);
  const ch = await live('chicken');
  check('chicken stampede', ch >= 4, ch);
  const vel = await page.evaluate(`(${D}).things.filter((t) => t.kind === 'chicken' && t.live).map((t) => Math.hypot(t.body.linvel().x, t.body.linvel().z))`);
  check('…running (some bump into things)', vel.some((v) => v > 3), vel.map((v) => +v.toFixed(1)));
  await shot('chaos_chickens');
  await adv(10);

  await calm();
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

  // the UFO: it beams the load up (on ULTRA it floats away if nobody holds it)
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
  });
  await calm();
  const y0 = await page.evaluate(() => window.__FF.game.session.cargo.body.translation().y);
  await trigger('ufo');
  await adv(3);
  const y1 = await page.evaluate(() => window.__FF.game.session.cargo.body.translation().y);
  const ufoSeen = await page.evaluate(`(${D}).ufoObj.visible`);
  check('UFO: the load is beamed up', ufoSeen && y1 > y0 + 0.8, [+y0.toFixed(2), +y1.toFixed(2), ufoSeen]);
  await shot('chaos_ufo');
  await adv(6);
  check('…and the UFO leaves', !(await page.evaluate(`(${D}).ufoObj.visible`)), null);

  // fog rolls in, and out again
  const far0 = await page.evaluate(() => window.__FF.game.renderer.scene.fog.far);
  await trigger('fog');
  await adv(4);
  const far1 = await page.evaluate(() => window.__FF.game.renderer.scene.fog.far);
  check('fog: thick', far1 < 40 && far1 < far0, [far0, +far1.toFixed(1)]);
  await shot('chaos_fog');
  await adv(16);
  const far2 = await page.evaluate(() => window.__FF.game.renderer.scene.fog.far);
  check('…and clears', Math.abs(far2 - far0) < 1, [far0, far2]);

  // ---- the newer kinds (played by the director's companion)
  const A = 'window.__FF.game.session.hazards.find((h) => h.handles)';
  const sess = (fn) => page.evaluate(fn);
  const P = (i) => `window.__FF.game.session.players[${i}]`;
  const knocked = () => sess(() => window.__FF.game.session.players.map((p) => p.state));
  const exposure = () => sess(() => window.__FF.game.renderer.renderer.toneMappingExposure);
  const e0 = await exposure();
  await trigger('blackout');
  await adv(2);
  const e1 = await exposure();
  check('blackout: lights down', e1 < e0 * 0.4, [e0, +e1.toFixed(3)]);
  await shot('chaos_blackout');
  await adv(9);
  const e2 = await exposure();
  check('…and back up', Math.abs(e2 - e0) < 0.02, [e0, +e2.toFixed(3)]);

  await trigger('disco');
  await adv(0.5);
  const dance = await sess(() => window.__FF.game.session.players.map((p) => Math.hypot(p.intent.moveX, p.intent.moveZ)));
  check('disco: everybody dances', dance.every((m) => m > 0.1), dance.map((m) => +m.toFixed(2)));
  await shot('chaos_disco');
  await adv(6);

  const before = await sess(() => window.__FF.game.session.players.map((p) => [p.bodyPos.x, p.bodyPos.z]));
  await calm();
  await trigger('swap');
  await adv(0.3);
  const after2 = await sess(() => window.__FF.game.session.players.map((p) => [p.bodyPos.x, p.bodyPos.z]));
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.8;
  check('swap: the movers trade places', near(after2[0], before[1]) && near(after2[1], before[0]), [before, after2]);
  await adv(2);

  await trigger('mirror');
  await adv(0.2);
  check('mirror controls', await sess(() => window.__FF.game.session.sim.flipControls === true), null);
  await adv(7);
  check('…and normal again', await sess(() => !window.__FF.game.session.sim.flipControls), null);

  await trigger('slowmo');
  await adv(0.1);
  const ts1 = await sess(() => window.__FF.game.session.sim.timeScale);
  await adv(9);
  const ts2 = await sess(() => window.__FF.game.session.sim.timeScale);
  await trigger('fastfwd');
  await adv(0.1);
  const ts3 = await sess(() => window.__FF.game.session.sim.timeScale);
  await adv(6);
  const ts4 = await sess(() => window.__FF.game.session.sim.timeScale);
  check('slow-mo, then normal; fast-forward, then normal', ts1 < 0.5 && ts2 === 1 && ts3 > 1.5 && ts4 === 1, [ts1, ts2, ts3, ts4]);

  await calm();
  await trigger('boulder');
  await adv(1.5);
  const bv = await page.evaluate(`(() => { const b = (${A}).boulder; const v = b.body.linvel(); return [b.live, Math.hypot(v.x, v.z)]; })()`);
  check('boulder: rolling', bv[0] && bv[1] > 2, bv);
  await shot('chaos_boulder');
  await adv(10);
  check('…and gone after', !(await page.evaluate(`(${A}).boulder.live`)), null);

  await calm();
  await trigger('dino');
  await adv(2);
  const dn = await page.evaluate(`(() => { const d = (${A}).dino; const p = d.body.translation(); return [d.live, p.x, p.z]; })()`);
  check('dino stomp: a dinosaur walks across', dn[0], dn);
  await shot('chaos_dino');
  await adv(9);
  check('…and leaves', !(await page.evaluate(`(${A}).dino.live`)), null);

  await trigger('tornado');
  await adv(2);
  check('tornado', await page.evaluate(`!!(${A}).tornado && (${A}).tornadoObj.visible`), null);
  await shot('chaos_tornado');
  await adv(8);

  await calm();
  await trigger('bananas');
  await adv(0.3);
  const peel = await page.evaluate(`(() => { const p = (${A}).peels; return p && p.spots.length ? [p.spots[0].x, p.spots[0].y, p.spots[0].z] : null; })()`);
  check('banana peels', !!peel, peel);
  if (peel) {
    await page.evaluate(`${P(0)}.teleport(new ${P(0)}.bodyPos.constructor(${peel[0]}, ${peel[1]}, ${peel[2]}), 0)`);
    await adv(0.4);
    const st = await knocked();
    check('…step on one and down you go', st[0] !== 'active', st);
  }
  await shot('chaos_bananas');
  await adv(15);

  await calm();
  await trigger('lava');
  await adv(2.2);
  const hot = await page.evaluate(`(() => { const l = (${A}).lava; return l && l.spots.length ? [l.spots[0].x, l.spots[0].y, l.spots[0].z] : null; })()`);
  check('the floor is lava', !!hot, hot);
  if (hot) {
    await page.evaluate(`${P(1)}.teleport(new ${P(1)}.bodyPos.constructor(${hot[0]}, ${hot[1]}, ${hot[2]}), 0)`);
    await page.evaluate(() => {
      window.__hot = 0;
      window.__FF.game.session.events.on('hazard', (e) => e.kind === 'lava' && window.__hot++);
    });
    await adv(0.3);
    const hops = await page.evaluate(() => window.__hot);
    check('…hot feet: a mover in it hops out', hops > 0, hops);
  }
  await shot('chaos_lava');
  await adv(9);

  await calm();
  await trigger('bees');
  const bd0 = await page.evaluate(`(() => { const a = ${A}; const t = window.__FF.game.session.players[a.beeTarget % 2].bodyPos; return a.bees.distanceTo(t); })()`);
  await adv(1.5);
  const bd1 = await page.evaluate(`(() => { const a = ${A}; if (!a.bees) return 0; const t = window.__FF.game.session.players[a.beeTarget % 2].bodyPos; return a.bees.distanceTo(t); })()`);
  check('bees chase a mover', bd1 < bd0 - 1, [+bd0.toFixed(1), +bd1.toFixed(1)]);
  await shot('chaos_bees');
  await adv(8);

  await calm();
  await trigger('flood');
  await adv(3);
  const fl = await page.evaluate(`(() => { const a = ${A}; return a.flood ? [a.flood.y, a.water.visible, window.__FF.game.session.players.map((p) => p.speedScale)] : null; })()`);
  check('flood: water rises, movers wade', !!fl && fl[1] && fl[2].some((x) => x < 1), fl);
  await shot('chaos_flood');
  await adv(9);
  check('…and drains', await page.evaluate(`!(${A}).flood && window.__FF.game.session.players.every((p) => p.speedScale === 1)`), null);

  // left alone, things just happen (with a siren first, and on ULTRA sometimes two at once)
  await page.evaluate(`(${D}).nextAt = 0`);
  await page.evaluate(() => {
    window.__seen = [];
    window.__FF.game.session.events.on('chaos', (e) => window.__seen.push(`${window.__FF.game.session.physics.time.toFixed(1)} ${e.kind}`));
  });
  await adv(60);
  const happened = await page.evaluate(() => window.__seen);
  const warns = happened.filter((h) => h.endsWith(' warn')).length;
  check('on ULTRA, things happen by themselves', happened.length - warns >= 6, happened);
  check('…each after a siren', warns >= happened.length - warns - 1, [warns, happened.length - warns]);
  check('…sometimes two at once', happened.some((h) => h.includes('+')), happened.filter((h) => h.includes('+')));

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
