// Drive the game in headless Chromium (SwiftShader WebGL) and take screenshots.
// usage: node tests/browser/run.mjs <scenario> [outdir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const scenario = process.argv[2] ?? 'basic';
const out = process.argv[3] ?? 'test-shots';
mkdirSync(out, { recursive: true });
const port = 5199;
const url0 = process.env.FF_URL;

async function startServer() {
  if (url0) return null;
  const srv = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite timeout')), 60000);
    srv.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); res(); } });
    srv.stderr.on('data', (d) => process.stderr.write(d));
  });
  return srv;
}

const srv = await startServer();
const base = url0 ?? `http://localhost:${port}/`;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const [vw, vh] = (process.env.VIEWPORT ?? '1280x720').split('x').map(Number);
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('dialog', (d) => d.accept()); // "leave this page?" when a test navigates mid-job

const mod = await import(`./scenarios/${scenario}.mjs`);
try {
  // (screenshots are for looking at afterwards: on the software renderer under load one can take half a
  //  minute, and a slow one is noted rather than failing the run)
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }).catch((e) => console.log(`(screenshot ${name} skipped: ${e.message.split('\n')[0]})`));
  await mod.default({ page, base, out, shot });
} catch (e) {
  console.error('SCENARIO FAILED', e);
  process.exitCode = 1;
} finally {
  const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]') || l.startsWith('[warning]'));
  console.log('--- console (errors/warnings) ---\n' + errs.slice(0, 40).join('\n'));
  await browser.close();
  srv?.kill();
}
