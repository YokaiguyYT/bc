import * as THREE from 'three';
import { rng } from '../util/math';

/**
 * Small procedural canvas textures. They're mostly near-white detail maps that
 * multiply the material colour, so one "wood" texture works for any wood tint.
 * Everything is drawn at startup: no image files to load.
 */

export type SurfaceTex =
  | 'planks'
  | 'tiles'
  | 'concrete'
  | 'grass'
  | 'brick'
  | 'carpet'
  | 'stripes'
  | 'asphalt'
  | 'metal'
  | 'checker'
  | 'dots'
  | 'plaster'
  | 'cardboard'
  | 'hazard';

const cache = new Map<string, THREE.Texture>();

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function noise(ctx: CanvasRenderingContext2D, size: number, amount: number, seed: number, scale = 1) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount * 255 * scale;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number, seed: number, dark = true) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = 8 + r() * size * 0.18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const c = dark ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${c},${alpha * r()})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function draw(kind: SurfaceTex): HTMLCanvasElement {
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  const r = rng(kind.length * 977 + 13);
  switch (kind) {
    case 'planks': {
      const rows = 4;
      const h = S / rows;
      for (let i = 0; i < rows; i++) {
        const shade = 225 + Math.floor(r() * 30);
        ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
        ctx.fillRect(0, i * h, S, h);
        // grain
        ctx.strokeStyle = 'rgba(120,80,40,0.10)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 7; k++) {
          ctx.beginPath();
          const y0 = i * h + r() * h;
          ctx.moveTo(0, y0);
          for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.03 + k) * 2.5);
          ctx.stroke();
        }
        // seams
        ctx.fillStyle = 'rgba(70,45,25,0.35)';
        ctx.fillRect(0, i * h, S, 2);
        const off = r() * S;
        ctx.fillRect(off, i * h, 2, h);
      }
      noise(ctx, S, 0.05, 3);
      break;
    }
    case 'tiles': {
      const n = 4;
      const t = S / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = 238 + Math.floor(r() * 14);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(i * t, j * t, t, t);
        }
      ctx.strokeStyle = 'rgba(90,90,100,0.35)';
      ctx.lineWidth = 3;
      for (let i = 0; i <= n; i++) {
        ctx.beginPath();
        ctx.moveTo(i * t, 0);
        ctx.lineTo(i * t, S);
        ctx.moveTo(0, i * t);
        ctx.lineTo(S, i * t);
        ctx.stroke();
      }
      noise(ctx, S, 0.03, 5);
      break;
    }
    case 'checker': {
      const n = 4;
      const t = S / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#c9c6cf';
          ctx.fillRect(i * t, j * t, t, t);
        }
      noise(ctx, S, 0.03, 9);
      break;
    }
    case 'concrete':
    case 'plaster': {
      blotches(ctx, S, 26, kind === 'concrete' ? 0.035 : 0.025, 11);
      blotches(ctx, S, 20, 0.05, 12, false);
      noise(ctx, S, kind === 'concrete' ? 0.05 : 0.03, 7);
      if (kind === 'concrete') {
        ctx.strokeStyle = 'rgba(0,0,0,0.09)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, S - 2, S - 2);
      }
      break;
    }
    case 'grass': {
      blotches(ctx, S, 50, 0.12, 21);
      blotches(ctx, S, 40, 0.12, 22, false);
      ctx.strokeStyle = 'rgba(40,90,30,0.18)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 260; i++) {
        const x = r() * S;
        const y = r() * S;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 6);
        ctx.stroke();
      }
      noise(ctx, S, 0.05, 23);
      break;
    }
    case 'brick': {
      const rows = 8;
      const h = S / rows;
      const w = S / 4;
      ctx.fillStyle = '#d8d2cc';
      ctx.fillRect(0, 0, S, S);
      for (let i = 0; i < rows; i++) {
        const off = i % 2 ? w / 2 : 0;
        for (let j = -1; j < 5; j++) {
          const v = 228 + Math.floor(r() * 27);
          ctx.fillStyle = `rgb(${v},${v - 6},${v - 8})`;
          ctx.fillRect(j * w + off + 2, i * h + 2, w - 4, h - 4);
        }
      }
      noise(ctx, S, 0.05, 31);
      break;
    }
    case 'carpet': {
      noise(ctx, S, 0.12, 41);
      blotches(ctx, S, 20, 0.05, 42);
      break;
    }
    case 'stripes': {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ece6dc';
        ctx.fillRect((i * S) / 8, 0, S / 8, S);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      for (let i = 0; i < 8; i++) ctx.fillRect((i * S) / 8 + S / 16 - 1, 0, 2, S);
      noise(ctx, S, 0.02, 51);
      break;
    }
    case 'asphalt': {
      noise(ctx, S, 0.16, 61);
      blotches(ctx, S, 30, 0.08, 62);
      break;
    }
    case 'metal': {
      for (let y = 0; y < S; y++) {
        const v = 235 + Math.floor(Math.sin(y * 0.7) * 4 + r() * 10);
        ctx.fillStyle = `rgb(${v},${v},${v + 3})`;
        ctx.fillRect(0, y, S, 1);
      }
      // rivets
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (const p of [16, S - 16])
        for (const q of [16, S / 2, S - 16]) {
          ctx.beginPath();
          ctx.arc(p, q, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      break;
    }
    case 'dots': {
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 6; j++) {
          ctx.beginPath();
          ctx.arc(i * (S / 6) + S / 12 + (j % 2) * (S / 12), j * (S / 6) + S / 12, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      break;
    }
    case 'cardboard': {
      ctx.fillStyle = '#f2e9d8';
      ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(120,90,50,0.08)';
      ctx.lineWidth = 3;
      for (let x = 0; x < S; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, S);
        ctx.stroke();
      }
      // tape stripe
      ctx.fillStyle = 'rgba(200,150,80,0.35)';
      ctx.fillRect(S * 0.42, 0, S * 0.16, S);
      noise(ctx, S, 0.04, 71);
      break;
    }
    case 'hazard': {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = '#2b2a33';
      for (let i = -4; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 64, 0);
        ctx.lineTo(i * 64 + 32, 0);
        ctx.lineTo(i * 64 + 32 + S, S);
        ctx.lineTo(i * 64 + S, S);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
  }
  return c;
}

export function surfaceTexture(kind: SurfaceTex): THREE.Texture {
  let t = cache.get(kind);
  if (t) return t;
  t = new THREE.CanvasTexture(draw(kind));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(kind, t);
  return t;
}

/**
 * Replace a geometry's UVs with a box projection in world units, so textures
 * keep the same scale no matter how big the box is. `tile` = metres per repeat.
 */
export function applyBoxUV(geo: THREE.BufferGeometry, tile: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
