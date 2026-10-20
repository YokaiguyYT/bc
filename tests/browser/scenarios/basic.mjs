export default async function ({ page, base, shot }) {
  await page.goto(base + '?level=playground&manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const st = () => page.evaluate(() => window.__FF.game.session.debugState());
  await adv(1.0);
  await shot('01_spawn');
  console.log(JSON.stringify(await st()));
  // P1 walks forward (W) toward the crate
  await page.keyboard.down('KeyW');
  await adv(0.6);
  await shot('02_walk');
  await page.keyboard.up('KeyW');
  // P1 grabs
  await page.keyboard.down('ShiftLeft');
  await adv(1.0);
  await shot('03_grab');
  console.log(JSON.stringify(await st()));
  await page.keyboard.up('ShiftLeft');
  const t0 = Date.now();
  await adv(1.0);
  console.log('1s of game took', Date.now() - t0, 'ms wall');
}
