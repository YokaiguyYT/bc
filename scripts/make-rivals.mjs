// Turns recorded deliveries (ghost files saved by the delivery bot with
// GHOST_OUT=<dir>/<job>.json) into src/levels/rivals.ts, the AI rival crews'
// runs: node scripts/make-rivals.mjs <dir>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/make-rivals.mjs <dir of <job>.json ghost files>');
const runs = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const g = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  if (!g || !Array.isArray(g.f) || g.f.length < 18 || !(g.time > 0)) continue;
  // each number minus the same one a frame earlier: small numbers, short text
  const d = g.f.map((v, i) => (i >= 9 ? v - g.f[i - 9] : v));
  runs[file.replace(/\.json$/, '')] = { time: Math.round(g.time * 10) / 10, f: d.join(',') };
}
const body = Object.entries(runs)
  .map(([k, v]) => `  ${JSON.stringify(k)}: { time: ${v.time}, f: '${v.f}' },`)
  .join('\n');
writeFileSync(
  'src/levels/rivals.ts',
  `/**\n * The AI rival crews' runs: a recorded delivery of each hand-made job (the test\n * bot's), as frames of the two movers and the load 8 times a second, each\n * number stored as the change since the frame before. Made by\n * scripts/make-rivals.mjs; don't edit by hand.\n */\nexport const RIVAL_RUNS: Record<string, { time: number; f: string }> = {\n${body}\n};\n`,
);
console.log(Object.keys(runs).length, 'runs:', Object.entries(runs).map(([k, v]) => `${k} ${v.time}s`).join(', '));
