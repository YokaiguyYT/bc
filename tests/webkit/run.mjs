// Run a tests/browser scenario in WebKitGTK (Safari's engine) through bridge.py.
// usage: xvfb-run -a -s "-screen 0 1400x900x24" python3 tests/webkit/bridge.py node tests/webkit/run.mjs <scenario> [outdir]
// FF_URL picks the page (default: the single-file build in play/).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scenario = process.argv[2] ?? 'fileboot';
const out = process.argv[3] ?? '/tmp/claude-0/-home-user-bc/5820d62c-083f-5115-866a-7d02ebbd36ce/scratchpad/wkshots';
mkdirSync(out, { recursive: true });
const base = process.env.FF_URL ?? pathToFileURL(resolve('play/FragileFreight.html')).href;
const bridge = process.env.WK_BRIDGE;
if (!bridge) throw new Error('run me through tests/webkit/bridge.py');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(op, body = {}) {
  const r = await fetch(bridge, { method: 'POST', body: JSON.stringify({ op, ...body }) });
  const j = await r.json();
  if (j.error) throw new Error(`${op}: ${j.error}`);
  return j.value;
}

// Playwright key names → KeyboardEvent.key
const KEY = { Space: ' ', Slash: '/', Enter: 'Enter', Escape: 'Escape', Backquote: '`' };
const keyOf = (code) => KEY[code] ?? (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code.replace(/(Left|Right)$/, ''));

function key(type, code) {
  return page.evaluate(
    ([type, code, key]) => {
      const t = document.activeElement || document.body;
      t.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
    },
    [type, code, keyOf(code)],
  );
}

// The subset of Playwright's Page the scenarios use.
const page = {
  goto: (url) => call('goto', { url }),
  evaluate(fn, arg) {
    const body = typeof fn === 'function' ? `return (${fn})(${arg === undefined ? '' : JSON.stringify(arg)});` : `return (${fn});`;
    return call('eval', { body });
  },
  async waitForFunction(fn, arg, opts = {}) {
    // truthiness is checked in the page: the value itself may not be serializable
    const call0 = typeof fn === 'function' ? `(${fn})(${arg == null ? '' : JSON.stringify(arg)})` : `(${fn})`;
    const t0 = Date.now();
    for (;;) {
      const v = await call('eval', { body: `return !!(await ${call0});` });
      if (v) return v;
      if (Date.now() - t0 > (opts.timeout ?? 30000)) throw new Error('waitForFunction timed out: ' + String(fn).slice(0, 80));
      await sleep(100);
    }
  },
  waitForTimeout: (ms) => sleep(ms),
  keyboard: {
    down: (code) => key('keydown', code),
    up: (code) => key('keyup', code),
    async press(code) {
      await key('keydown', code);
      await key('keyup', code);
    },
  },
  async click(sel) {
    const ok = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      el.click();
      return true;
    }, sel);
    if (!ok) throw new Error('click: no element ' + sel);
  },
  screenshot: ({ path }) => call('shot', { path }),
  setViewportSize: ({ width, height }) => call('resize', { width, height }),
};

console.log(`webkit ${process.env.WK_VERSION} · ${scenario} · ${base}`);
const mod = await import(`../browser/scenarios/${scenario}.mjs`);
try {
  await mod.default({ page, base, out, shot: (name) => page.screenshot({ path: `${out}/${name}.png` }) });
} catch (e) {
  console.error('SCENARIO FAILED', e);
  process.exitCode = 1;
} finally {
  const errs = (await page.evaluate(() => window.__wkErrors ?? []).catch((e) => [`(could not read errors: ${e.message})`])) ?? [];
  console.log('--- console (errors/warnings) ---\n' + errs.slice(0, 40).join('\n'));
}
