// The instant replay: a run's biggest moment (a bad drop, or the smash that
// ended it) is on the results card as "watch it again"; it plays the moment
// back on a rebuilt copy of the job, slowly, pays nothing twice, and hands the
// results card back as it was. Any key skips it.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(60), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const cargo = () =>
    page.evaluate(() => {
      const s = window.__FF.game.session;
      const t = s.cargo.body.translation();
      return { y: +t.y.toFixed(2), z: +t.z.toFixed(2), health: +s.cargo.health.toFixed(3), destroyed: s.cargo.destroyed, mirror: !!s.mirror, level: s.def.id };
    });
  const drop = (h) =>
    page.evaluate((h) => {
      const s = window.__FF.game.session;
      for (const p of s.players) p.releaseAll();
      s.cargo.body.setTranslation({ x: 3, y: h, z: 4 }, true);
      s.cargo.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      s.cargo.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }, h);
  const ui = () =>
    page.evaluate(() => ({
      screen: window.__FF.app.screen,
      button: document.querySelector('#r-replay')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      banner: document.querySelector('.replay-banner')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      hidden: document.querySelector('.results') ? getComputedStyle(document.querySelector('.results').parentElement).display === 'none' : null,
      pay: document.querySelector('#r-pay')?.textContent ?? null,
      wallet: JSON.parse(localStorage.getItem('ff.wardrobe') ?? '{}').cash ?? null,
    }));

  // ---- a bad drop, then delivered
  await page.evaluate(() => window.__FF.app.playLevel('playground'));
  await page.evaluate(() => (window.__FF.game.session.scriptedInput = true));
  await adv(2);
  await drop(10);
  // (well past the end of the clip, so that what comes next isn't in it)
  await adv(5);
  const hit = await cargo();
  check('dropped: the crate took a knock', hit.health < 0.97 && !hit.destroyed, hit);
  const clip = await page.evaluate(() => {
    const c = window.__FF.app.recorder.clip;
    return c ? { label: c.label, frames: c.frames.length, events: c.events.length, at: +c.at.toFixed(2), span: [+c.frames[0].t.toFixed(2), +c.frames[c.frames.length - 1].t.toFixed(2)] } : null;
  });
  check('…and the moment was kept (a few seconds either side)', !!clip && clip.frames > 40 && clip.span[0] < clip.at - 1.5 && clip.span[1] > clip.at + 1 && clip.events > 0, clip);
  // into the drop-off
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.def.goal.pos;
    s.cargo.body.setTranslation({ x: g[0], y: g[1] - 0.5, z: g[2] }, true);
    s.cargo.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  for (let i = 0; i < 20 && (await ui()).screen !== 'results'; i++) await adv(0.5);
  await adv(1.5);
  const res = await ui();
  check('delivered: the results card offers the replay', res.screen === 'results' && /Watch it again.*−\d+% in one go/.test(res.button ?? ''), res);
  await shot('replay_card');

  await page.click('#r-replay');
  await adv(0.05);
  const on = await ui();
  const c0 = await cargo();
  check('watching: a tag, the card stepped aside, the job rebuilt as a picture', /REPLAY/.test(on.banner ?? '') && on.hidden === true && c0.mirror && c0.level === 'playground', [on.banner, on.hidden, c0]);
  // through the clip: the crate comes down again
  const ys = [c0.y];
  let frames = 0;
  let slow = 0;
  for (let i = 0; i < 400 && (await page.evaluate(() => !!window.__FF.app.instant)); i++) {
    await adv(0.1);
    frames++;
    const st = await page.evaluate(() => {
      const a = window.__FF.app.instant;
      return a ? { y: window.__FF.game.session.cargo.body.translation().y, speed: a.player.speed } : null;
    });
    if (st) {
      ys.push(+st.y.toFixed(2));
      if (st.speed < 0.5) slow++;
    }
    if (i === 30) await shot('replay_playing');
  }
  check('…the crate falls again', Math.max(...ys) > 4 && ys[ys.length - 1] < 1.5, { top: Math.max(...ys), end: ys[ys.length - 1] });
  check('…slowly through the moment itself', slow >= 20 && frames > 60 && frames < 250, { frames, slow });
  const after = await ui();
  check('then the card is back as it was, and nothing was paid twice', after.screen === 'results' && after.banner === null && after.hidden === false && after.pay === res.pay && after.wallet === res.wallet && after.button === res.button, { pay: [res.pay, after.pay], wallet: [res.wallet, after.wallet] });
  // again, and a key skips it
  await page.click('#r-replay');
  await adv(0.3);
  const again = await ui();
  await page.keyboard.press('Space');
  await adv(0.1);
  const skipped = await ui();
  check('it can be watched again, and any key skips it (and does nothing else)', /REPLAY/.test(again.banner ?? '') && skipped.banner === null && skipped.screen === 'results' && skipped.hidden === false, [again.banner, skipped.screen]);
  // the card's buttons still work on the job
  await adv(1.5);
  await page.click('#r-retry');
  await adv(0.5);
  const retried = await page.evaluate(() => ({ screen: window.__FF.app.screen, mirror: !!window.__FF.game.session.mirror, clip: !!window.__FF.app.recorder?.clip }));
  check('Play again starts the job afresh (a real one, a fresh recording)', retried.screen === 'playing' && !retried.mirror && !retried.clip, retried);

  // ---- the smash that ended it
  await page.evaluate(() => (window.__FF.game.session.scriptedInput = true));
  await adv(2);
  await page.evaluate(() => (window.__FF.game.session.cargo.health = 0.04));
  await drop(10);
  for (let i = 0; i < 30 && (await ui()).screen !== 'results'; i++) await adv(0.5);
  await adv(1.5);
  const lost = await ui();
  check('smashed: the card offers the end of it', lost.screen === 'results' && /Watch it again.*the end of it/.test(lost.button ?? ''), lost.button);
  await page.click('#r-replay');
  await adv(0.05);
  const b0 = await cargo();
  let broke = false;
  for (let i = 0; i < 400 && (await page.evaluate(() => !!window.__FF.app.instant)); i++) {
    await adv(0.1);
    if ((await cargo()).destroyed) broke = true;
    if (i === 34) await shot('replay_smash');
  }
  check('…whole again at the start of the replay, and it breaks again', !b0.destroyed && b0.mirror && broke, [b0, broke]);
  const errs = await page.evaluate(() => window.__FF.app.screen);
  check('back at the card', errs === 'results', errs);
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
