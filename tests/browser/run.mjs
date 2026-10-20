// Drive the game in headless Chromium (SwiftShader WebGL) and take screenshots.
// usage: node tests/browser/run.mjs <scenario> [outdir]
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const scenario = process.argv[2] ?? 'basic';
const out = process.argv[3] ?? '/tmp/claude-0/-home-user-bc/5820d62c-083f-5115-866a-7d02ebbd36ce/scratchpad/shots';
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));

const mod = await import(`./scenarios/${scenario}.mjs`);
try {
  await mod.default({ page, base, out, shot: (name) => page.screenshot({ path: `${out}/${name}.png` }) });
} catch (e) {
  console.error('SCENARIO FAILED', e);
  process.exitCode = 1;
} finally {
  const errs = logs.filter((l) => l.startsWith('[error]') || l.startsWith('[pageerror]') || l.startsWith('[warning]'));
  console.log('--- console (errors/warnings) ---\n' + errs.slice(0, 40).join('\n'));
  await browser.close();
  srv?.kill();
}
