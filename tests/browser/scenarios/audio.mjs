// Sound: nothing plays before a key or a tap; after one the engine runs; every
// sound renders (off-line) to something audible that doesn't clip and ends
// when it should; the tunes play; game events make their sounds (steps, a
// jump, a grab, a knock on the load, a delivery); the volume sliders work,
// and with the effects slider at zero nothing plays.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(54), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const before = await page.evaluate(() => window.__FF.app.audio.ready);
  check('silent until a key or a tap', before === false, before);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__FF.app.audio.ready);
  check('a key press starts the sound', after === true, after);

  // every sound, rendered and measured
  const all = await page.evaluate(async () => {
    const A = window.__FF.app.audio;
    const out = {};
    for (const n of A.constructor.ALL) out[n] = await A.measure(n);
    return out;
  });
  const bad = Object.entries(all).filter(([n, m]) => {
    const music = n.startsWith('music:');
    return !(m.peak > 0.05 && m.peak < 0.98 && (music ? m.rms > 0.01 && m.seconds > 7 : m.seconds > 0.005 && m.seconds < 1.9));
  });
  check(`all ${Object.keys(all).length} sounds: audible, no clipping, the right length`, bad.length === 0, bad.map(([n, m]) => [n, +m.peak.toFixed(2), +m.rms.toFixed(3), +m.seconds.toFixed(2)]));
  if (process.env.DUMP) for (const [n, m] of Object.entries(all)) console.log('   ', n.padEnd(18), 'peak', m.peak.toFixed(2), 'rms', m.rms.toFixed(3), 'len', m.seconds.toFixed(2));
  const loud = Object.entries(all).filter(([n]) => !n.startsWith('music:')).map(([, m]) => m.peak);
  check('effects sit in a sensible range (peaks)', Math.min(...loud) > 0.05 && Math.max(...loud) < 0.98, [+Math.min(...loud).toFixed(2), +Math.max(...loud).toFixed(2)]);

  // game events make their sounds
  await page.evaluate(() => window.__FF.app.playLevel('playground'));
  await adv(0.5);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    s.scriptedInput = true;
    Object.assign(s.players[0].intent, { moveX: 1, moveZ: 0 });
  });
  // (real time has to pass for the audio clock to move on between sounds)
  for (let i = 0; i < 6; i++) {
    await adv(0.15);
    await page.waitForTimeout(60);
  }
  // (stand still to jump: out in the open, not into the steps)
  await page.evaluate(() => Object.assign(window.__FF.game.session.players[0].intent, { moveX: 0, moveZ: 0, jumpPressed: true }));
  for (let i = 0; i < 8; i++) {
    await adv(0.15);
    await page.waitForTimeout(60);
  }
  let played = await page.evaluate(() => ({ ...window.__FF.app.audio.played }));
  check('walking and jumping: steps, a jump, a landing', played.step0 > 2 && played.jump0 >= 1 && played.land0 >= 1, played);
  // the load dropped from a height: an impact and a crack
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const V = s.cargo.lastHitPos.constructor;
    s.cargo.reset(new V(3, 9, 4), 0);
  });
  for (let i = 0; i < 18; i++) {
    await adv(0.15);
    await page.waitForTimeout(50);
  }
  played = await page.evaluate(() => ({ ...window.__FF.app.audio.played }));
  check('the load dropped: an impact, and a crack', played['impact:wood'] >= 1 && played.damage >= 1, played);
  // delivered
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    const V = s.cargo.lastHitPos.constructor;
    s.cargo.reset(new V(g[0], g[1] - 0.2, g[2]), 0);
  });
  for (let i = 0; i < 30 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) {
    await adv(0.3);
    await page.waitForTimeout(40);
  }
  played = await page.evaluate(() => ({ ...window.__FF.app.audio.played }));
  check('delivered: the flourish, then payday', played.goal >= 1 && played.payout >= 1, [played.goal, played.payout]);
  // music follows the screen
  const tracks = await page.evaluate(() => {
    const a = window.__FF.app;
    const got = [a.audio.tunes.track];
    a.showMenu();
    got.push(a.audio.tunes.track);
    a.playParty('sumo');
    got.push(a.audio.tunes.track);
    a.quitToMenu();
    return got;
  });
  check('the tune follows what you are doing', tracks.join() === 'menu,menu,party', tracks);
  // effects slider at zero: nothing plays
  const quiet = await page.evaluate(() => {
    const a = window.__FF.app.audio;
    a.setVolumes(0.8, 0.5, 0);
    const n = Object.values(a.played).reduce((x, y) => x + y, 0);
    a.ui('select');
    a.sfx('payout');
    const m = Object.values(a.played).reduce((x, y) => x + y, 0);
    a.setVolumes(0.8, 0.5, 0.9);
    a.ui('select');
    return [n, m, Object.values(a.played).reduce((x, y) => x + y, 0)];
  });
  check('effects slider at zero: silence; back up: sound', quiet[0] === quiet[1] && quiet[2] === quiet[1] + 1, quiet);
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
