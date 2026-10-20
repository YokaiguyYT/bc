#!/usr/bin/env node
/**
 * Find candidate models on Sketchfab and write an HTML contact sheet you can
 * open in a browser to compare them.
 *
 *   node scripts/sketchfab-search.mjs "low poly couch" [more queries...]
 *
 * Only downloadable CC0 / CC-BY models under the size and polygon limits are
 * listed. Searching doesn't need an API token (downloading does).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_GLB_MB = Number(process.env.MAX_GLB_MB ?? 12);
const MAX_FACES = Number(process.env.MAX_FACES ?? 60000);
const PER_QUERY = Number(process.env.PER_QUERY ?? 16);
const out = resolve(process.cwd(), '.model-cache');
mkdirSync(out, { recursive: true });

export async function search(q, { licenses = ['cc0', 'by'], count = 24 } = {}) {
  const results = [];
  for (const license of licenses) {
    for (const sort of ['-likeCount', '']) {
      const url = new URL('https://api.sketchfab.com/v3/search');
      url.search = new URLSearchParams({ type: 'models', q, downloadable: 'true', license, count: String(count), ...(sort ? { sort_by: sort } : {}) });
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`search ${q}: ${res.status}`);
      const data = await res.json();
      for (const r of data.results ?? []) {
        if (results.some((x) => x.uid === r.uid)) continue;
        const glb = r.archives?.glb;
        if (!glb) continue;
        if (glb.size > MAX_GLB_MB * 1e6) continue;
        if ((glb.faceCount ?? r.faceCount ?? 0) > MAX_FACES) continue;
        const thumb = [...(r.thumbnails?.images ?? [])].sort((a, b) => Math.abs(a.width - 400) - Math.abs(b.width - 400))[0]?.url;
        results.push({
          uid: r.uid,
          name: r.name,
          author: r.user?.displayName || r.user?.username,
          license: r.license?.label,
          faces: glb.faceCount ?? r.faceCount,
          mb: +(glb.size / 1e6).toFixed(2),
          tex: `${glb.textureCount ?? 0}×${glb.textureMaxResolution ?? '-'}`,
          likes: r.likeCount,
          animated: r.animationCount > 0,
          url: r.viewerUrl,
          thumb,
        });
      }
    }
  }
  return results.sort((a, b) => b.likes - a.likes).slice(0, PER_QUERY);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function sheet(title, items) {
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:13px system-ui;margin:12px;background:#f4f1ea}h1{font-size:18px}
.g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.c{background:#fff;border-radius:8px;padding:6px;border:1px solid #ccc}
.c img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:4px;background:#ddd}.c b{font-size:15px}.m{color:#555;font-size:12px}</style>
<h1>${esc(title)}</h1><div class="g">${items
    .map(
      (r, i) => `<div class="c"><img src="${esc(r.thumb)}"><div><b>#${i}</b> ${esc(r.name)}</div>
<div class="m">${esc(r.author)} · ${esc(r.license)} · ${r.faces} faces · ${r.mb}MB · tex ${esc(r.tex)}${r.animated ? ' · anim' : ''}</div>
<div class="m"><a href="${esc(r.url)}">${esc(r.uid)}</a></div></div>`,
    )
    .join('')}</div>`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const queries = process.argv.slice(2);
  if (!queries.length) {
    console.log('usage: node scripts/sketchfab-search.mjs "query" ["query"...]');
    process.exit(1);
  }
  for (const q of queries) {
    const items = await search(q);
    const file = resolve(out, `search-${q.replace(/[^a-z0-9]+/gi, '-')}.html`);
    writeFileSync(file, sheet(q, items));
    writeFileSync(file.replace(/\.html$/, '.json'), JSON.stringify(items, null, 2));
    console.log(`${q}: ${items.length} candidates -> ${file}`);
    items.forEach((r, i) => console.log(`  #${i} ${r.uid} ${r.name} | ${r.author} | ${r.license} | ${r.faces}f ${r.mb}MB tex ${r.tex}`));
  }
}
