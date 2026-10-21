// Overview + spot screenshots of a level. env LEVEL=id, SPOTS="x,y,z;x,y,z"
export default async function ({ page, base, shot }) {
  const id = process.env.LEVEL ?? 'moveout';
  await page.goto(base + `?level=${id}&manual=1`);
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate(() => { window.__FF.game.session.scriptedInput = true; });
  await adv(1.0);
  await shot(`${id}_start`);
  const views = [
    { yaw: 0.0, pitch: 62, dist: 34 },
    { yaw: 2.4, pitch: 50, dist: 30 },
    { yaw: -1.2, pitch: 40, dist: 28 },
  ];
  const center = await page.evaluate(() => { const s = window.__FF.game.session; const b = new s.cargo.lastHitPos.constructor(); s.level.root.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox?.(); } }); return null; });
  void center;
  for (let i = 0; i < views.length; i++) {
    const v = views[i];
    await page.evaluate((v) => {
      const s = window.__FF.game.session; const T = window.__FF.tuning;
      T.camera.pitch = v.pitch; T.camera.maxDistance = 60; T.camera.minDistance = v.dist;
      const c = (window.__levelCenter ??= (() => { const box = new (s.cargo.lastHitPos.constructor)(); return null; })());
      s.cameraRig.yaw = v.yaw;
      s.focusOverride = () => [new (s.cargo.lastHitPos.constructor)(...(window.__ovCenter ?? [4, 0, 0]))];
    }, v);
    const ctr = (process.env.CENTER ?? '3,0,0').split(',').map(Number);
    await page.evaluate((c) => { window.__ovCenter = c; }, ctr);
    await adv(1.5);
    await shot(`${id}_overview${i}`);
  }
  const spots = (process.env.SPOTS ?? '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
  for (let i = 0; i < spots.length; i++) {
    await page.evaluate(([p]) => {
      const s = window.__FF.game.session; const T = window.__FF.tuning;
      T.camera.pitch = 46; T.camera.minDistance = 9; T.camera.maxDistance = 26;
      s.cameraRig.yaw = 0;
      s.focusOverride = () => [new (s.cargo.lastHitPos.constructor)(p[0], p[1], p[2])];
    }, [spots[i]]);
    await adv(1.2);
    await shot(`${id}_spot${i}`);
  }
}
