import * as THREE from 'three';
import { rng } from '../util/math';

/**
 * A canvas texture you can crack. Each hit draws a spiderweb (radial cracks
 * plus connecting rings) at a UV position; bigger hits draw bigger webs.
 */
export class CrackLayer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private seed = 1;
  hits = 0;

  constructor(
    readonly w = 512,
    readonly h = 512,
    private base?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    private color = 'rgba(255,255,255,0.92)',
    private shadow = 'rgba(60,80,90,0.35)',
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.reset();
  }

  reset() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.base?.(this.ctx, this.w, this.h);
    this.hits = 0;
    this.texture.needsUpdate = true;
  }

  /** u,v in 0..1 (v=0 at the bottom, like three.js UVs); severity 0..1. */
  crack(u: number, v: number, severity: number) {
    const r = rng(this.seed++ * 7919 + 17);
    const ctx = this.ctx;
    const cx = u * this.w;
    const cy = (1 - v) * this.h;
    const size = Math.min(this.w, this.h);
    const len = size * (0.08 + Math.min(1, severity) * 0.55);
    const n = 5 + Math.floor(severity * 7 + r() * 3);
    const spokes: [number, number][][] = [];
    const draw = (pts: [number, number][], width: number) => {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [style, w] of [
        [this.shadow, width + 1.6],
        [this.color, width],
      ] as [string, number][]) {
        ctx.strokeStyle = style;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    };
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
      let x = cx;
      let y = cy;
      const pts: [number, number][] = [[x, y]];
      const L = len * (0.55 + r() * 0.6);
      let d = 0;
      while (d < L) {
        const step = 6 + r() * 12;
        a += (r() - 0.5) * 0.55;
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        d += step;
        pts.push([x, y]);
        if (r() < 0.12) {
          // little branch
          let bx = x;
          let by = y;
          let ba = a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.6);
          const bp: [number, number][] = [[bx, by]];
          for (let k = 0; k < 3 + r() * 4; k++) {
            ba += (r() - 0.5) * 0.5;
            bx += Math.cos(ba) * (5 + r() * 8);
            by += Math.sin(ba) * (5 + r() * 8);
            bp.push([bx, by]);
          }
          draw(bp, 1.2);
        }
      }
      spokes.push(pts);
      draw(pts, 1.8 + severity * 1.2);
    }
    // rings joining the spokes
    for (const ringF of severity > 0.35 ? [0.28, 0.6] : [0.35]) {
      for (let i = 0; i < spokes.length; i++) {
        if (r() < 0.25) continue;
        const s1 = spokes[i];
        const s2 = spokes[(i + 1) % spokes.length];
        const p1 = s1[Math.min(s1.length - 1, Math.floor(s1.length * ringF))];
        const p2 = s2[Math.min(s2.length - 1, Math.floor(s2.length * ringF))];
        const mx = (p1[0] + p2[0]) / 2 + (r() - 0.5) * 8;
        const my = (p1[1] + p2[1]) / 2 + (r() - 0.5) * 8;
        draw([p1, [mx, my], p2], 1.3);
      }
    }
    // impact star
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = (i % 2 ? 3 : 7 + severity * 9) * (0.7 + r() * 0.6);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    this.hits++;
    this.texture.needsUpdate = true;
  }
}

/** Cartoon glass: faint tint plus two classic diagonal shine streaks. */
export function drawGlassBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(210,245,255,0.38)');
  g.addColorStop(1, 'rgba(160,220,240,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const streak = (x0: number, width: number) => {
    ctx.beginPath();
    ctx.moveTo(x0 * w, h);
    ctx.lineTo((x0 + width) * w, h);
    ctx.lineTo((x0 + width + 0.45) * w, 0);
    ctx.lineTo((x0 + 0.45) * w, 0);
    ctx.closePath();
    ctx.fill();
  };
  streak(0.12, 0.09);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  streak(0.27, 0.035);
  // edge sheen
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
}
