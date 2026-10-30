import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { roundedBox } from '../../levels/LevelBuilder';
import { glossy, matte } from '../../render/materials';
import { clamp, rng } from '../../util/math';

/** Outside of the frame: W wide (x), H tall (y), FD deep (z); the picture faces +Z. */
const W = 1.8;
const H = 1.25;
/** Width of the moulding, and how deep the frame is. */
const FW = 0.11;
const FD = 0.09;
/** The canvas inside, set back a little from the frame's front. */
const CW = W - 2 * FW;
const CH = H - 2 * FW;
const CANVAS_Z = FD / 2 - 0.025;
/** Wind push (as a multiple of a plain thing's) face-on and edge-on: it's a sail. */
const FACE = 10;
const EDGE = 0.45;
/** Canvas texture size (px). */
const TW = 512;
const TH = 336;

const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** "Lighthouse at Dusk": sunset sky, the sea, a lighthouse on its rock, a boat and some gulls. */
function drawSeascape(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const r = rng(1600);
  const hz = h * 0.56;
  const sky = ctx.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#2c3e7a');
  sky.addColorStop(0.45, '#c8648a');
  sky.addColorStop(0.8, '#ffa35c');
  sky.addColorStop(1, '#ffd98a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hz);
  // the sun, half down behind the sea
  const glow = ctx.createRadialGradient(w * 0.34, hz, 4, w * 0.34, hz, w * 0.3);
  glow.addColorStop(0, 'rgba(255,240,180,0.95)');
  glow.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, hz);
  ctx.fillStyle = '#fff1b8';
  ctx.beginPath();
  ctx.arc(w * 0.34, hz, w * 0.07, Math.PI, 0);
  ctx.fill();
  // wispy clouds: long soft brush strokes
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(255,${190 + Math.floor(r() * 50)},${170 + Math.floor(r() * 60)},${0.25 + r() * 0.3})`;
    ctx.lineWidth = 3 + r() * 6;
    ctx.lineCap = 'round';
    const y = h * (0.08 + r() * 0.38);
    const x = r() * w;
    ctx.beginPath();
    ctx.moveTo(x - 40 - r() * 60, y);
    ctx.quadraticCurveTo(x, y - 6 - r() * 8, x + 40 + r() * 70, y + r() * 4);
    ctx.stroke();
  }
  // the sea, with a glittering path under the sun
  const sea = ctx.createLinearGradient(0, hz, 0, h);
  sea.addColorStop(0, '#3a6d9a');
  sea.addColorStop(1, '#173a5c');
  ctx.fillStyle = sea;
  ctx.fillRect(0, hz, w, h - hz);
  for (let i = 0; i < 90; i++) {
    const y = hz + Math.pow(r(), 1.4) * (h - hz);
    const near = (y - hz) / (h - hz);
    const x = r() * w;
    const glint = Math.abs(x - w * 0.34) < 30 + near * 50 && r() < 0.8;
    ctx.strokeStyle = glint ? `rgba(255,226,150,${0.6 + r() * 0.4})` : `rgba(${150 + Math.floor(r() * 80)},${200 + Math.floor(r() * 40)},255,${0.25 + r() * 0.35})`;
    ctx.lineWidth = 1.5 + near * 4;
    const len = 8 + near * 30 + r() * 10;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.quadraticCurveTo(x, y - 2 - near * 4, x + len / 2, y);
    ctx.stroke();
  }
  // the rock and the lighthouse, right of centre
  const lx = w * 0.74;
  ctx.fillStyle = '#3b3026';
  ctx.beginPath();
  ctx.moveTo(w * 0.6, hz + 18);
  ctx.quadraticCurveTo(w * 0.66, hz - 22, lx, hz - 26);
  ctx.quadraticCurveTo(w * 0.86, hz - 18, w * 0.94, hz + 22);
  ctx.closePath();
  ctx.fill();
  const tower = (y0: number, y1: number, color: string) => {
    const t0 = 1 - (y0 - (hz - 130)) / 104;
    const t1 = 1 - (y1 - (hz - 130)) / 104;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(lx - 9 - 5 * t0, y0);
    ctx.lineTo(lx + 9 + 5 * t0, y0);
    ctx.lineTo(lx + 9 + 5 * t1, y1);
    ctx.lineTo(lx - 9 - 5 * t1, y1);
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 4; i++) tower(hz - 26 - i * 26, hz - 52 - i * 26, i % 2 ? '#f4efe6' : '#d6453a');
  ctx.fillStyle = '#2b2b33';
  ctx.fillRect(lx - 11, hz - 148, 22, 6);
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(lx - 7, hz - 142 - 14, 14, 14);
  ctx.fillStyle = '#d6453a';
  ctx.beginPath();
  ctx.moveTo(lx - 10, hz - 156);
  ctx.lineTo(lx, hz - 170);
  ctx.lineTo(lx + 10, hz - 156);
  ctx.fill();
  // the beam
  ctx.fillStyle = 'rgba(255,240,170,0.35)';
  ctx.beginPath();
  ctx.moveTo(lx, hz - 149);
  ctx.lineTo(lx - 150, hz - 190);
  ctx.lineTo(lx - 150, hz - 150);
  ctx.closePath();
  ctx.fill();
  // a little fishing boat
  const bx = w * 0.2;
  const by = hz + 32;
  ctx.fillStyle = '#7a3b22';
  ctx.beginPath();
  ctx.moveTo(bx - 24, by);
  ctx.lineTo(bx + 24, by);
  ctx.lineTo(bx + 16, by + 9);
  ctx.lineTo(bx - 16, by + 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f4efe6';
  ctx.beginPath();
  ctx.moveTo(bx - 2, by - 2);
  ctx.lineTo(bx - 2, by - 38);
  ctx.lineTo(bx + 18, by - 4);
  ctx.closePath();
  ctx.fill();
  // gulls
  ctx.strokeStyle = '#2b2430';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const gx = w * (0.45 + r() * 0.4);
    const gy = h * (0.12 + r() * 0.2);
    const s = 5 + r() * 5;
    ctx.beginPath();
    ctx.moveTo(gx - s, gy - s * 0.3);
    ctx.quadraticCurveTo(gx - s * 0.4, gy - s * 0.7, gx, gy);
    ctx.quadraticCurveTo(gx + s * 0.4, gy - s * 0.7, gx + s, gy - s * 0.3);
    ctx.stroke();
  }
  // brushwork over everything (it's oil on canvas)
  for (let i = 0; i < 260; i++) {
    const x = r() * w;
    const y = r() * h;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 2 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6 + r() * 10, y + (r() - 0.5) * 4);
    ctx.stroke();
  }
  // the painter's signature
  ctx.fillStyle = '#2b1d14';
  ctx.font = 'italic 700 18px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'right';
  ctx.fillText('M. Gale', w - 14, h - 12);
}

/** The back of the frame: a board with the gallery's label. */
function backTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 176;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8a6a48';
  ctx.fillRect(0, 0, 256, 176);
  ctx.fillStyle = 'rgba(60,40,25,0.25)';
  for (let y = 0; y < 176; y += 11) ctx.fillRect(0, y, 256, 1);
  ctx.fillStyle = '#f4ecd6';
  ctx.fillRect(70, 56, 116, 64);
  ctx.fillStyle = '#c63b2f';
  ctx.textAlign = 'center';
  ctx.font = '800 15px "Fredoka", ui-rounded, system-ui, sans-serif';
  ctx.fillText('MASTERPIECE', 128, 80);
  ctx.font = '700 11px "Fredoka", ui-rounded, system-ui, sans-serif';
  ctx.fillText('handle with care!', 128, 98);
  ctx.fillText('↑ THIS WAY UP ↑', 128, 113);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A big gilt-framed seascape: light for its size and a sail in the wind (face-on
 * a gust tears it out of your hands, edge-on it slips past). Knocks chip the
 * gilt and scuff or rip the canvas; badly treated, the frame goes crooked.
 */
export class Painting extends Cargo {
  readonly kind = 'painting' as const;
  readonly displayName = 'Masterpiece';
  readonly value = 1600;
  readonly tip = 'A sail in the wind! Keep its edge to the wind (or wait for a lull).';
  readonly fragility: Fragility = { safeShock: 1.6, perShock: 0.13, maxPerHit: 0.28, spinLimit: 3.6, spinDamage: 0.06 };

  private picture!: CanvasRenderingContext2D;
  private pictureTex!: THREE.CanvasTexture;
  private billowU = { value: 0 };
  private frame = new THREE.Group();
  private bars: THREE.Mesh[] = [];
  private dents = new THREE.Group();
  private dentGeo = new THREE.SphereGeometry(1, 8, 6);
  private hits = 0;
  /** Wind on the canvas, filled in by fans each step before our preStep (m/s², signed along the face). */
  private windIn = 0;
  private pushIn = 0;
  /** Smoothed: how hard the wind is on the face (signed, for the billow) and how hard it pushes. */
  private wind = 0;
  private push = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = W / 2;
    this.material = 'wood';
    this.init(opts);
    this.body.setAngularDamping(0.6);
  }

  protected buildColliders() {
    // four frame bars (hands hold these) and the canvas between them (nobody grabs a painting by its picture)
    const bar = (hx: number, hy: number, x: number, y: number, mass: number) => this.addCollider(RAPIER.ColliderDesc.cuboid(hx, hy, FD / 2).setTranslation(x, y, 0).setMass(mass), 0.65);
    for (const s of [-1, 1]) bar(W / 2, FW / 2, 0, s * (H / 2 - FW / 2), 3);
    for (const s of [-1, 1]) bar(FW / 2, H / 2 - FW, s * (W / 2 - FW / 2), 0, 2.2);
    const canvas = this.addCollider(RAPIER.ColliderDesc.cuboid(CW / 2, CH / 2, 0.012).setTranslation(0, 0, CANVAS_Z - 0.012).setMass(1.6), 0.6);
    this.sim.physics.info(canvas)!.grabbable = false;
  }

  protected buildVisual() {
    // the picture, on a canvas that billows in the wind
    const c = document.createElement('canvas');
    c.width = TW;
    c.height = TH;
    this.picture = c.getContext('2d')!;
    drawSeascape(this.picture, TW, TH);
    this.pictureTex = new THREE.CanvasTexture(c);
    this.pictureTex.colorSpace = THREE.SRGBColorSpace;
    this.pictureTex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({ map: this.pictureTex, roughness: 0.62 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uBillow = this.billowU;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float uBillow;\nvoid main() {')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n          transformed.z += uBillow * sin(3.14159 * uv.x) * sin(3.14159 * uv.y);`);
    };
    mat.customProgramCacheKey = () => 'canvasbillow';
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.02, CH + 0.02, 12, 8), mat);
    canvas.position.z = CANVAS_Z;
    canvas.castShadow = canvas.receiveShadow = true;
    this.visual.add(canvas);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.06, H - 0.06), new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.9 }));
    back.rotation.y = Math.PI;
    back.position.z = -FD / 2 + 0.008;
    this.visual.add(back);

    // the gilt frame: chunky moulding with a darker inner slip and rosettes at the corners
    const gilt = glossy(0xd9a93f, 0.32, 0.75);
    const slip = glossy(0x9c6b26, 0.45, 0.5);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.frame) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    for (const s of [-1, 1]) this.bars.push(add(roundedBox([W, FW, FD], 0.03, 1), gilt, 0, s * (H / 2 - FW / 2), 0));
    for (const s of [-1, 1]) this.bars.push(add(roundedBox([FW, H - 2 * FW + 0.02, FD], 0.03, 1), gilt, s * (W / 2 - FW / 2), 0, 0));
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(CW + 0.04, 0.025, 0.02), slip, 0, s * (CH / 2 + 0.005), CANVAS_Z + 0.006);
      add(new THREE.BoxGeometry(0.025, CH + 0.02, 0.02), slip, s * (CW / 2 + 0.005), 0, CANVAS_Z + 0.006);
    }
    const rose = new THREE.SphereGeometry(0.05, 10, 8);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) add(rose, gilt, sx * (W / 2 - FW / 2), sy * (H / 2 - FW / 2), FD / 2 + 0.005).scale.set(1, 1, 0.45);
    this.visual.add(this.frame, this.dents);
  }

  /** Fans call this each step it's in their wind: big face-on, small edge-on. */
  windScale(dir: THREE.Vector3, accel: number) {
    const r = this.body.rotation();
    const c = _n.set(0, 0, 1).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).dot(dir);
    const s = EDGE + (FACE - EDGE) * c * c;
    this.windIn += accel * c;
    this.pushIn += accel * s;
    return s;
  }

  preStep(dt: number) {
    const k = 1 - Math.exp(-dt / 0.15);
    this.wind += (this.windIn - this.wind) * k;
    this.push += (this.pushIn - this.push) * k;
    this.windIn = 0;
    this.pushIn = 0;
  }

  netState() {
    return [this.wind, this.push];
  }

  applyNetState(s: number[]) {
    [this.wind, this.push] = s;
  }

  update(_dt: number, time: number) {
    // the canvas bellies out with the wind on it, and flutters
    const w = this.destroyed ? 0 : this.wind;
    this.billowU.value = clamp(w * 0.009, -0.07, 0.07) + Math.sin(time * 17) * Math.min(0.012, Math.abs(w) * 0.0015);
    if (this.destroyed) {
      this.status = null;
      return;
    }
    // a battered frame goes crooked
    const skew = clamp((0.6 - this.health) / 0.6, 0, 1);
    this.bars[1].rotation.z = skew * 0.05;
    this.bars[3].position.x = W / 2 - FW / 2 + skew * 0.025;
    const held = this.sim.grips.isHeld(this.body);
    const v = this.body.linvel();
    this.status =
      held && this.push > 16
        ? '🌬️ It’s catching the wind! Edge to the wind!'
        : !held && this.push > 8 && Math.hypot(v.x, v.y, v.z) > 2.5
          ? '🌬️ Gone with the wind!'
          : null;
  }

  /** Canvas pixel position for a point on the canvas (local x, y). */
  private toPx(x: number, y: number): [number, number] {
    return [clamp(x / CW + 0.5, 0.04, 0.96) * TW, clamp(0.5 - y / CH, 0.05, 0.95) * TH];
  }

  /** A scuff: scratched-off paint showing the pale ground underneath, and a grubby smudge. */
  private scuff(px: number, py: number, sev: number, r: () => number) {
    const ctx = this.picture;
    ctx.fillStyle = `rgba(40,30,20,${0.12 + sev * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(px, py, 10 + sev * 18, 6 + sev * 10, r() * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'round';
    for (let i = 0; i < 3 + sev * 6; i++) {
      const a = (r() - 0.5) * 0.8 + 0.4;
      const len = 8 + r() * (14 + sev * 30);
      const x = px + (r() - 0.5) * 22;
      const y = py + (r() - 0.5) * 16;
      ctx.strokeStyle = 'rgba(240,232,212,0.85)';
      ctx.lineWidth = 1 + r() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  /** A rip: a jagged dark slit with frayed threads and a pale flap curling back. */
  private tear(px: number, py: number, sev: number, r: () => number) {
    const ctx = this.picture;
    const len = 30 + sev * 150;
    let a = r() * Math.PI;
    const n = 7;
    const pts: [number, number][] = [];
    let x = px - Math.cos(a) * len * 0.5;
    let y = py - Math.sin(a) * len * 0.5;
    for (let i = 0; i <= n; i++) {
      pts.push([x, y]);
      a += (r() - 0.5) * 0.7;
      x += Math.cos(a) * (len / n);
      y += Math.sin(a) * (len / n);
    }
    // the gap: widest in the middle
    const gap = (i: number) => (3 + sev * 9) * Math.sin((i / n) * Math.PI) + 0.5;
    const side = (i: number, s: number): [number, number] => {
      const [x0, y0] = pts[Math.max(0, i - 1)];
      const [x1, y1] = pts[Math.min(n, i + 1)];
      const l = Math.hypot(x1 - x0, y1 - y0) || 1;
      return [pts[i][0] - ((y1 - y0) / l) * gap(i) * s, pts[i][1] + ((x1 - x0) / l) * gap(i) * s];
    };
    // the flap, folded back on one side
    ctx.fillStyle = '#e9dfc6';
    ctx.strokeStyle = 'rgba(80,60,40,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [sx, sy] = side(i, 1);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    for (let i = n; i >= 0; i--) {
      const [sx, sy] = side(i, 1 + 1.6 * Math.sin((i / n) * Math.PI));
      ctx.lineTo(sx + (r() - 0.5) * 2, sy + (r() - 0.5) * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // the hole
    ctx.fillStyle = '#1b120b';
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [sx, sy] = side(i, 1);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    for (let i = n; i >= 0; i--) {
      const [sx, sy] = side(i, -1);
      ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    // frayed threads across it
    ctx.strokeStyle = 'rgba(233,223,198,0.9)';
    ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      if (r() < 0.4) continue;
      const [ax, ay] = side(i, 1.1);
      const [bx, by] = side(i, -1.1);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo((ax + bx) / 2 + (r() - 0.5) * 4, (ay + by) / 2 + (r() - 0.5) * 4);
      ctx.stroke();
    }
  }

  /** A dent in the gilt where the frame took the knock: bare wood shows through. */
  private dent(x: number, y: number, z: number, sev: number) {
    if (this.dents.children.length >= 16) return;
    const d = new THREE.Mesh(this.dentGeo, matte(0x6b4423));
    const s = 0.025 + sev * 0.05;
    d.scale.set(s, s, s * 0.35);
    d.position.set(x, y, z);
    this.dents.add(d);
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    // world point -> frame coordinates (from the body: exact on both laptops)
    const t = this.body.translation();
    const r0 = this.body.rotation();
    const local = point.clone().sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q.set(r0.x, r0.y, r0.z, r0.w).invert());
    // the same hits make the same marks on both laptops
    const r = rng(this.hits++ * 7919 + 1600);
    const sev = clamp(amount * 4, 0.1, 1);
    const onFrame = Math.abs(local.x) > CW / 2 - 0.04 || Math.abs(local.y) > CH / 2 - 0.04;
    if (onFrame) {
      // dent the nearest bit of moulding, front or back
      const fx = clamp(local.x, -W / 2 + 0.03, W / 2 - 0.03);
      const fy = clamp(local.y, -H / 2 + 0.03, H / 2 - 0.03);
      const toSide = W / 2 - FW / 2 - Math.abs(fx);
      const toTop = H / 2 - FW / 2 - Math.abs(fy);
      const x = toSide < toTop ? Math.sign(fx) * (W / 2 - FW / 2) : fx;
      const y = toSide < toTop ? fy : Math.sign(fy) * (H / 2 - FW / 2);
      this.dent(x, y, local.z >= 0 ? FD / 2 : -FD / 2, sev);
      this.sim.fx?.burst('chunk', point, { count: 2 + Math.floor(sev * 6), speed: 1.6, up: 1.2, size: 0.025, sizeVar: 0.5, life: 1.2, gravity: 11, colors: [0xe8c060, 0xd9a93f, 0x6b4423] });
    }
    // the canvas behind it takes the jolt: scuffs, and a rip from a proper knock
    const [px, py] = this.toPx(local.x * 0.8, local.y * 0.8);
    if (amount > 0.07) this.tear(px, py, sev, r);
    else this.scuff(px, py, sev, r);
    this.pictureTex.needsUpdate = true;
  }

  protected onBreak() {
    // ripped right across, and the frame comes apart
    const r = rng(99);
    this.tear(TW * 0.5, TH * 0.45, 1, r);
    this.tear(TW * 0.3, TH * 0.6, 0.8, r);
    this.tear(TW * 0.7, TH * 0.35, 0.8, r);
    this.pictureTex.needsUpdate = true;
    this.bars[1].rotation.z = 0.25;
    this.bars[1].position.y += 0.06;
    this.bars[2].rotation.z = -0.12;
    this.bars[3].rotation.z = 0.16;
    this.bars[3].position.x += 0.08;
    const p = this.position(_v);
    this.sim.fx?.burst('chunk', p, { count: 40, speed: 3, up: 1.6, size: 0.05, sizeVar: 0.6, life: 2.6, gravity: 11, spread: 0.8, colors: [0xe8c060, 0xd9a93f, 0x6b4423] });
    this.sim.fx?.burst('confetti', p, { count: 30, speed: 2.4, up: 1.4, size: 0.05, life: 2.4, gravity: 5, drag: 1.2, colors: [0x2c3e7a, 0xc8648a, 0xffa35c, 0x3a6d9a, 0xd6453a] });
  }
}
