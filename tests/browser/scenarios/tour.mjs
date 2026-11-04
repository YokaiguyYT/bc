// Screenshots round a hand-made job: env LEVEL, SPOTS="x,y,z;x,y,z;…" (where to
// put the movers and the load for each shot), YAW (camera, degrees), ZOOM.
export default async function ({ page, base, shot }) {
  const level = process.env.LEVEL ?? 'delivery';
  await page.goto(base + `?level=${level}&manual=1` + (process.env.Q ? '&' + process.env.Q : ''));
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await adv(1.5);
  await shot(`${level}_0start`);
  const spots = (process.env.SPOTS ?? '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
  for (const [i, [x, y, z]] of spots.entries()) {
    await page.evaluate(
      ([x, y, z, yaw, zoom]) => {
        const s = window.__FF.game.session;
        const V = s.cargo.lastHitPos.constructor;
        for (const p of s.players) for (const h of p.hands) if (h.grip) p.release(h);
        s.players[0].teleport(new V(x - 1.1, y, z), Math.PI / 2);
        s.players[1].teleport(new V(x + 1.1, y, z), -Math.PI / 2);
        s.cargo.reset(new V(x, y + 1.2, z), 0);
        s.physics.snapLinks();
        if (yaw !== null) s.cameraRig.yaw = (yaw * Math.PI) / 180;
        if (zoom !== null) s.cameraRig.zoomBias = zoom;
      },
      [x, y, z, process.env.YAW ? Number(process.env.YAW) : null, process.env.ZOOM ? Number(process.env.ZOOM) : null],
    );
    await adv(1.2);
    await shot(`${level}_${i + 1}`);
  }
  const info = await page.evaluate(() => {
    const s = window.__FF.game.session;
    return { health: s.cargo.health, status: s.cargo.status, state: s.state };
  });
  console.log(JSON.stringify(info));
}
