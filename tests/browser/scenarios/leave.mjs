// Leaving the page mid-job asks first (stray trackpad swipe back, ⌘R); in the menus it doesn't.
export default async function ({ page, base }) {
  const seen = [];
  page.on('dialog', (d) => seen.push(d.type()));
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  await page.keyboard.press('Enter'); // title → menu (also counts as user interaction)
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const inMenus = seen.length;
  await page.evaluate(() => window.__FF.app.playLevel('moveout'));
  await page.evaluate(() => window.__FF.game.advance(0.5));
  await page.keyboard.press('KeyW');
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  console.log('dialogs leaving the menus:', inMenus, '· leaving mid-job:', seen.length - inMenus, seen);
  if (inMenus !== 0) throw new Error('asked before leaving the menus');
  if (seen.length - inMenus !== 1 || seen.at(-1) !== 'beforeunload') throw new Error('did not ask before leaving mid-job');
}
