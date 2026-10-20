// Visual check of every cargo type: healthy, after a drop, destroyed.
export default async function ({ page, base, shot }) {
  for (const kind of ['tv', 'glass', 'aquarium', 'clock', 'cake']) {
    await page.goto(base + `?level=playground&manual=1&cargo=${kind}`);
    await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
    const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
    await page.evaluate(() => {
      const s = window.__FF.game.session;
      // close-up camera on the cargo
      s.cameraRig.zoomBias = -6;
      window.__ffTune = true;
    });
    await page.evaluate(() => { const t = window.__FF.tuning; t.camera.minDistance = 2.6; t.camera.pitch = 30; t.camera.padding = 0.3; });
    // only frame the cargo
    await page.evaluate(() => { const s = window.__FF.game.session; s.focusOverride = () => [s.cargo.position(new s.cargo.lastHitPos.constructor())]; });
    await adv(1.5);
    await shot(`cargo_${kind}_1`);
    // drop it from 1.2 m
    await page.evaluate(() => { const s = window.__FF.game.session; const b = s.cargo.body; const t = b.translation(); b.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true); b.setAngvel({ x: 0.5, y: 0.3, z: 0.4 }, true); });
    await adv(2.0);
    const h1 = await page.evaluate(() => window.__FF.game.session.cargo.health);
    await shot(`cargo_${kind}_2`);
    await page.evaluate(() => window.__FF.game.session.cargo.damage(5, 5));
    await adv(0.25);
    await shot(`cargo_${kind}_3`);
    console.log(kind, 'health after drop', h1.toFixed(3));
  }
}
