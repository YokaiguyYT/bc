// Level 3: ride the truck to the dock without touching anything; report how
// the movers and the aquarium fare. env HOLD=1 makes both movers hold on.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?level=delivery&manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate(() => { window.__FF.game.session.scriptedInput = true; });
  const st = () =>
    page.evaluate(() => {
      const s = window.__FF.game.session;
      const r = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
      const truck = s.hazards.find((h) => h.tag === 'truck');
      return {
        t: +s.physics.time.toFixed(1),
        truck: r(truck.bodyRef.translation()),
        cargo: r(s.cargo.body.translation()),
        health: +s.cargo.health.toFixed(3),
        water: +(s.cargo.water ?? 0).toFixed(3),
        players: s.players.map((p) => [...r(p.body.translation()), p.state]),
      };
    });
  await adv(0.5);
  await shot('ride_0');
  if (process.env.HOLD) {
    // walk up to the tank and hold it
    await page.evaluate(() => {
      const s = window.__FF.game.session;
      s.players.forEach((p) => Object.assign(p.intent, { moveZ: -0.4, grab: true }));
    });
    await adv(1.2);
    await page.evaluate(() => window.__FF.game.session.players.forEach((p) => Object.assign(p.intent, { moveZ: 0 })));
  }
  for (let i = 0; i < 16; i++) {
    await adv(1);
    console.log(JSON.stringify(await st()));
    if (i === 4 || i === 9) await shot(`ride_${i}`);
  }
  await shot('ride_end');
}
