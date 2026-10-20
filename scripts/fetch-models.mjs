#!/usr/bin/env node
/**
 * Downloads the curated Sketchfab models listed in scripts/models.config.json,
 * optimizes them for the web, and writes:
 *   public/models/<key>.glb       optimized models (meshopt-compressed, small textures)
 *   public/models/manifest.json   name -> file / size / credits, read by the game
 *   CREDITS.md                    title, author, link and license for every model
 *
 * Usage:
 *   npm run fetch-models                  # fetch anything missing
 *   npm run fetch-models -- --force       # re-download everything
 *   npm run fetch-models -- --only sofa,dog
 *   npm run fetch-models -- --credits     # just rebuild manifest + CREDITS.md
 *   npm run fetch-models -- --search "low poly couch"   # find candidates
 *
 * The API token is read from the SKETCHFAB_TOKEN environment variable or a
 * local .env file (never commit it). Only downloadable models licensed CC0 or
 * CC-BY are accepted. If the token is missing or a download fails, that model
 * is skipped and the game falls back to a primitive placeholder.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = resolve(root, 'scripts/models.config.json');
const OUT_DIR = resolve(root, 'public/models');
const RAW_DIR = resolve(root, '.model-cache/raw');
const MANIFEST = resolve(OUT_DIR, 'manifest.json');
const CREDITS = resolve(root, 'CREDITS.md');
const ALLOWED = new Set(['cc0', 'by']);

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

function loadEnv() {
  const p = resolve(root, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET JSON with polite retries: Sketchfab rate-limits downloads (HTTP 429). */
async function getJSON(url, token, tries = 7) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json', ...(token ? { Authorization: `Token ${token}` } : {}) } });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(240_000, 15_000 * 2 ** attempt);
      process.stdout.write(`(rate limited, waiting ${Math.round(wait / 1000)}s) `);
      await sleep(wait);
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} for ${url.replace(/\/download$/, '/download (token)')}`);
  }
}

async function downloadRaw(uid, token) {
  const dl = await getJSON(`https://api.sketchfab.com/v3/models/${uid}/download`, token);
  const glb = dl.glb;
  if (!glb?.url) throw new Error('no GLB archive offered for this model');
  const res = await fetch(glb.url);
  if (!res.ok) throw new Error(`archive download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(RAW_DIR, { recursive: true });
  const p = resolve(RAW_DIR, `${uid}.glb`);
  writeFileSync(p, buf);
  return p;
}

let gltf = null;
async function optimizer() {
  if (gltf) return gltf;
  const [{ NodeIO }, ext, fn, mo, sharp] = await Promise.all([
    import('@gltf-transform/core'),
    import('@gltf-transform/extensions'),
    import('@gltf-transform/functions'),
    import('meshoptimizer'),
    import('sharp').then((m) => m.default).catch(() => null),
  ]);
  await mo.MeshoptEncoder.ready;
  await mo.MeshoptSimplifier.ready;
  const io = new NodeIO()
    .registerExtensions(ext.ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': mo.MeshoptEncoder, 'meshopt.decoder': mo.MeshoptDecoder });
  gltf = { io, fn, mo, sharp };
  return gltf;
}

async function optimize(rawPath, outPath, entry) {
  const { io, fn, mo, sharp } = await optimizer();
  const doc = await io.read(rawPath);
  const animated = doc.getRoot().listAnimations().length > 0 || doc.getRoot().listSkins().length > 0;
  let faces = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      faces += idx ? idx.getCount() / 3 : (prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
    }
  // old spec/gloss materials -> metal/rough (three.js dropped spec/gloss support)
  const steps = [fn.metalRough(), fn.dedup(), fn.prune()];
  if (!animated) steps.push(fn.flatten(), fn.join({ keepNamed: false }));
  steps.push(fn.weld());
  if (faces > 6000 && !animated) steps.push(fn.simplify({ simplifier: mo.MeshoptSimplifier, ratio: Math.max(0.25, 6000 / faces), error: 0.004 }));
  if (animated) steps.push(fn.resample());
  if (sharp) {
    const max = entry.maxTexture ?? 512;
    steps.push(fn.textureCompress({ encoder: sharp, resize: [max, max], quality: 82 }));
  }
  steps.push(fn.prune(), fn.meshopt({ encoder: mo.MeshoptEncoder, level: 'medium' }));
  await doc.transform(...steps);
  await io.write(outPath, doc);
  return { animated, faces: Math.round(faces) };
}

function writeCredits(manifest) {
  const rows = Object.entries(manifest.models)
    .filter(([, e]) => e.title)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, e]) => `| ${key} | [${e.title.replace(/\|/g, '/')}](${e.url}) | [${e.author}](${e.authorUrl ?? e.url}) | [${e.license}](${e.licenseUrl ?? ''}) |`);
  const md = `# Credits

## 3D models

Props and scenery come from [Sketchfab](https://sketchfab.com) and are used under their
Creative Commons licenses (only CC0 and CC BY models are used). Each model was
downloaded with \`scripts/fetch-models.mjs\`, then downscaled, mesh-compressed and
re-shaded to fit the game's look. The cargo (TV, glass, aquarium, clock, cake),
the movers and the levels are built from primitive shapes in code.

| In game | Model | Author | License |
| --- | --- | --- | --- |
${rows.join('\n')}

This file is generated by \`npm run fetch-models\` — edit \`scripts/models.config.json\` instead.

## Font

**Fredoka** by the Fredoka Project Authors — SIL Open Font License 1.1 (see \`src/ui/fonts/OFL.txt\`).

## Code libraries

- [three.js](https://threejs.org) — MIT
- [Rapier](https://rapier.rs) physics (\`@dimforge/rapier3d-compat\`) — Apache-2.0
- [lil-gui](https://lil-gui.georgealways.com) — MIT
- [glTF Transform](https://gltf-transform.dev), [meshoptimizer](https://github.com/zeux/meshoptimizer) — MIT (build tools)

## Sound and music

Every sound effect and the music are synthesized live with the Web Audio API — no audio files.
`;
  writeFileSync(CREDITS, md);
}

async function main() {
  loadEnv();
  const search = opt('--search');
  if (search) {
    const { search: run, sheet } = await import('./sketchfab-search.mjs');
    const items = await run(search);
    mkdirSync(resolve(root, '.model-cache'), { recursive: true });
    const file = resolve(root, '.model-cache', `search-${search.replace(/[^a-z0-9]+/gi, '-')}.html`);
    writeFileSync(file, sheet(search, items));
    items.forEach((r, i) => console.log(`#${i} ${r.uid}  ${r.name}  | ${r.author} | ${r.license} | ${r.faces} faces, ${r.mb} MB`));
    console.log(`\nContact sheet: ${file}\nAdd a pick to scripts/models.config.json, then run npm run fetch-models.`);
    return;
  }

  const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
  const token = process.env.SKETCHFAB_TOKEN?.trim();
  const only = opt('--only')?.split(',').map((s) => s.trim());
  const force = flag('--force');
  const creditsOnly = flag('--credits');
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { models: {} };
  manifest.models ??= {};
  if (!token && !creditsOnly) console.warn('⚠ SKETCHFAB_TOKEN not set (env or .env): models not yet downloaded will be skipped (placeholders in game).');

  let ok = 0;
  let skipped = 0;
  const failures = [];
  for (const [key, entry] of Object.entries(config.models)) {
    if (only && !only.includes(key)) continue;
    const outFile = `${key}.glb`;
    const outPath = resolve(OUT_DIR, outFile);
    try {
      const info = await getJSON(`https://api.sketchfab.com/v3/models/${entry.uid}`);
      const slug = info.license?.slug;
      if (!ALLOWED.has(slug)) throw new Error(`license "${info.license?.label}" is not CC0/CC-BY — refusing`);
      if (!info.isDownloadable) throw new Error('model is not downloadable');
      const credit = {
        title: info.name,
        author: info.user?.displayName || info.user?.username,
        authorUrl: info.user?.profileUrl,
        url: info.viewerUrl,
        license: info.license.label,
        licenseUrl: info.license.url,
      };
      if (!creditsOnly && (force || !existsSync(outPath))) {
        let raw = resolve(RAW_DIR, `${entry.uid}.glb`);
        if (!existsSync(raw)) {
          if (!token) throw new Error('needs SKETCHFAB_TOKEN to download');
          process.stdout.write(`↓ ${key} (${info.name})… `);
          raw = await downloadRaw(entry.uid, token);
          await sleep(2500); // be gentle with the download API
        } else process.stdout.write(`⟳ ${key} (cached)… `);
        const r = await optimize(raw, outPath, entry);
        const kb = (statSync(outPath).size / 1024).toFixed(0);
        console.log(`${kb} KB (${r.faces} faces${r.animated ? ', animated' : ''})`);
        entry.animated = r.animated || entry.animated;
      }
      if (!existsSync(outPath)) {
        skipped++;
        delete manifest.models[key];
        continue;
      }
      manifest.models[key] = {
        file: outFile,
        size: entry.size,
        ...(entry.rotation ? { rotation: entry.rotation } : {}),
        ...(entry.style ? { style: entry.style } : {}),
        ...(entry.tint !== undefined ? { tint: entry.tint } : {}),
        ...(entry.animated ? { animated: true } : {}),
        ...(entry.fallbackColor !== undefined ? { fallbackColor: entry.fallbackColor } : {}),
        ...credit,
      };
      ok++;
    } catch (e) {
      failures.push(`${key}: ${e.message}`);
      console.log(`✗ ${key}: ${e.message}`);
    }
  }
  // drop manifest entries no longer in the config
  for (const key of Object.keys(manifest.models)) if (!config.models[key]) delete manifest.models[key];
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  writeCredits(manifest);
  console.log(`\n${ok} models ready, ${skipped} skipped, ${failures.length} failed. Wrote ${MANIFEST} and CREDITS.md.`);
  if (failures.length) console.log('Failed (the game uses placeholders for these):\n  ' + failures.join('\n  '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
