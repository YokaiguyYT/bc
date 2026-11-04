// The five newer jobs' loads each do their own thing: the chandelier's
// crystals clink when it's swung about, the bees come out and sting when
// they're angry (and calm down again), the jelly tears if it wobbles too
// hard, the snowman melts in the sun but not in the freezer or the shade,
// and the rocket's engine lights if it's left by a welder.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(50), JSON.stringify(got));
  };
  const open = async (id) => {
    await page.goto(base + `?level=${id}&manual=1&plain`);
    await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
    await page.evaluate(() => window.__FF.game.advance(1.2));
  };
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  /** Rock the load back and forth `n` times (m/s), every `every` seconds. */
  const shake = (n, speed, every) =>
    page.evaluate(
      ([n, speed, every]) => {
        const g = window.__FF.game;
        const c = g.session.cargo;
        for (let i = 0; i < n; i++) {
          const v = c.body.linvel();
          c.body.setLinvel({ x: (i % 2 ? -1 : 1) * speed, y: v.y, z: 0 }, true);
          g.advance(every, 60, false);
        }
      },
      [n, speed, every],
    );

  // ---- the chandelier: swung about, crystals clink and fall off
  await open('ballroom');
  await shot('nj_ballroom');
  const h0 = await page.evaluate(() => window.__FF.game.session.cargo.health);
  await shake(10, 2.2, 0.45);
  const ch = await page.evaluate(() => {
    const c = window.__FF.game.session.cargo;
    return { health: +c.health.toFixed(3), clink: +c.clinkLoss.toFixed(3), swing: +c.maxSwing.toFixed(2), status: c.status };
  });
  check('chandelier: swinging it clinks the crystals', ch.clink > 0 && ch.health < h0, ch);

  // ---- the beehive: angry bees come out and sting, then calm down
  await open('bees');
  await shot('nj_bees');
  const bees = await page.evaluate(() => {
    const g = window.__FF.game;
    const s = g.session;
    const c = s.cargo;
    c.anger = 1;
    let t = 0;
    let swarm = false;
    let status = '';
    while (t < 12 && c.stings === 0) {
      g.advance(0.1, 60, false);
      t += 0.1;
      if (c.netState()[1]) swarm = true;
      if (c.status) status = c.status;
    }
    const stung = c.stings;
    const knocked = s.players.some((p) => p.state !== 'active');
    // now leave it be: they settle and go home
    let home = 0;
    while (home < 40 && c.netState()[1]) {
      g.advance(0.5, 60, false);
      home += 0.5;
    }
    return { swarm, stung, knocked, status, after: +t.toFixed(1), calm: +c.anger.toFixed(2), home, gone: !c.netState()[1] };
  });
  check('beehive: angry bees swarm out and sting', bees.swarm && bees.stung >= 1 && /ANGRY/.test(bees.status), bees);
  check('beehive: left alone, they calm down and go home', bees.gone && bees.calm < 0.35, bees);
  await shot('nj_bees_after');

  // ---- the jelly: wobbled too hard, it tears
  await open('jelly');
  await shot('nj_jelly');
  await shake(8, 3.0, 0.22);
  const je = await page.evaluate(() => ({ health: +window.__FF.game.session.cargo.health.toFixed(3), status: window.__FF.game.session.cargo.status }));
  check('jelly: wobbled hard, it tears', je.health < 0.97, je);
  // left on its stand, it settles and stops tearing
  await adv(3);
  const je2 = await page.evaluate(() => ({ health: +window.__FF.game.session.cargo.health.toFixed(3), status: window.__FF.game.session.cargo.status }));
  await adv(2);
  const je3 = await page.evaluate(() => +window.__FF.game.session.cargo.health.toFixed(3));
  check('jelly: left alone, the wobble dies away', je3 === je2.health && je2.status === null, [je2, je3]);

  // ---- the snowman: no melting in the freezer, melting in the sun, faster by a barbecue
  await open('snowman');
  await shot('nj_snowman');
  const sn = await page.evaluate(() => {
    const g = window.__FF.game;
    const s = g.session;
    const c = s.cargo;
    const V = c.lastHitPos.constructor;
    const melt = (x, z, secs) => {
      c.reset(new V(x, 0.5, z), 0);
      g.advance(0.6, 60, false);
      const h = c.health;
      g.advance(secs, 60, false);
      return { lost: +((h - c.health) / secs).toFixed(5), status: c.status };
    };
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
    return { freezer: melt(0, 20.2, 4), sun: melt(-1, -11.0, 4), shade: melt(0, -15.4, 4), grill: melt(1.4, 5.0, 4) };
  });
  check('snowman: no melting in the freezer', sn.freezer.lost === 0, sn.freezer);
  check('snowman: melts in the sun', sn.sun.lost > 0 && /sun/.test(sn.sun.status ?? ''), sn.sun);
  check('snowman: the shade stops it', sn.shade.lost === 0 && /cool/.test(sn.shade.status ?? ''), sn.shade);
  check('snowman: a barbecue melts it fast', sn.grill.lost > sn.sun.lost * 2 && /hot/i.test(sn.grill.status ?? ''), sn.grill);
  await shot('nj_snowman_after');

  // ---- the rocket: left by a welder it heats up and the engine lights
  await open('rocket');
  await shot('nj_rocket');
  const ro = await page.evaluate(() => {
    const g = window.__FF.game;
    const s = g.session;
    const c = s.cargo;
    const V = c.lastHitPos.constructor;
    for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
    const q = new (window.__FF.game.renderer.camera.quaternion.constructor)().setFromAxisAngle(new V(1, 0, 0), -Math.PI / 2);
    // on the floor right by the first welder
    c.reset(new V(1.4, 0.4, 13.0), q);
    let t = 0;
    let warm = '';
    while (t < 30 && c.launches === 0) {
      g.advance(0.25, 60, false);
      t += 0.25;
      if (c.status && /hot/.test(c.status)) warm = c.status;
    }
    const at = c.body.translation();
    g.advance(0.3, 60, false);
    const v = c.body.linvel();
    return { t, launches: c.launches, warm, burning: c.status, health: +c.health.toFixed(3), speed: +Math.hypot(v.x, v.z).toFixed(2), at: [+at.x.toFixed(1), +at.z.toFixed(1)] };
  });
  check('rocket: heats up by the welder, then the engine lights', ro.launches === 1 && /hot/.test(ro.warm) && ro.health < 1, ro);
  check('rocket: the engine shoves it along', ro.speed > 1 || /WHOOSH/.test(ro.burning ?? ''), ro);
  await shot('nj_rocket_after');

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
