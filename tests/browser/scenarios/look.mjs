export default async function ({ page, base, shot }) {
  await page.goto(base + '?level=playground&manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await adv(1.0);
  // front view of faces
  await page.evaluate(() => { const s = window.__FF.game.session; s.cameraRig.yaw = Math.PI; });
  await page.keyboard.down('ShiftLeft');
  await adv(1.0);
  await shot('l1_faces');
  await page.keyboard.up('ShiftLeft');
  // wide view
  await page.evaluate(() => { const s = window.__FF.game.session; s.cameraRig.yaw = 0.6; s.cameraRig.zoomBias = 22; });
  await adv(2.0);
  await shot('l2_wide');
  await page.evaluate(() => { const s = window.__FF.game.session; s.cameraRig.zoomBias = 0; });
}
