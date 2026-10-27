// Screenshots of the online screens (for a look by eye).
export default async function ({ page, base, shot }) {
  await page.goto(base + '?net=local');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => window.__FF.app.showMenu());
  await page.waitForTimeout(500);
  await shot('on-menu');
  await page.click('#m-online');
  await page.waitForTimeout(500);
  await shot('on-online');
  await page.click('#o-host');
  await page.waitForTimeout(1500);
  await shot('on-host');
  await page.evaluate(() => window.__FF.app.showMenu());
  await page.click('#m-online');
  await page.click('#h-stop');
  await page.click('#m-online');
  await page.click('#o-join');
  for (const k of ['KeyK', 'Digit7', 'KeyQ']) await page.keyboard.press(k);
  await page.waitForTimeout(1500);
  await shot('on-join');
}
