export default async function ({ page, base, shot }) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(base + '?gallery=1');
  await page.waitForFunction(() => window.__galleryDone, null, { timeout: 120000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.argv[3] ? process.argv[3] + '/gallery.png' : '/tmp/claude-0/-home-user-bc/5820d62c-083f-5115-866a-7d02ebbd36ce/scratchpad/shots/gallery.png', fullPage: true });
}
