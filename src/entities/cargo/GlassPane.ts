import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { CrackLayer, drawGlassBase } from '../../render/cracks';
import { roundedBox } from '../../levels/LevelBuilder';
import { matte } from '../../render/materials';
import { clamp } from '../../util/math';
import { tuning } from '../../config/tuning';

const W = 1.7;
const H = 1.15;
const T = 0.022;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * A big pane of glass in a thin protective frame. It flexes (wub-wub) when
 * jolted, cracks where it gets hit, and turns into a sparkly mess at 0%.
 */
export class GlassPane extends Cargo {
  readonly kind = 'glass' as const;
  readonly displayName = 'Pane of Glass';
  readonly value = 650;
  readonly tip = 'Glass flexes and cracks. Turn corners slowly — it is WIDE.';
  readonly fragility: Fragility = { safeShock: 1.5, perShock: 0.13, maxPerHit: 0.32, spinLimit: 3.2, spinDamage: 0.08 };

  private cracks!: CrackLayer;
  private glass!: THREE.Mesh;
  private flexU!: { value: number };
  /** First bending mode: displacement (m) and velocity. */
  private flex = 0;
  private flexVel = 0;
  private prevV = new THREE.Vector3();
  private prevW = new THREE.Vector3();
  private wobbleCooldown = 0;
  private aAvg = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = W / 2;
    this.material = 'glass';
    this.init(opts);
  }

  protected buildColliders() {
    this.addCollider(RAPIER.ColliderDesc.cuboid(W / 2 + 0.03, H / 2 + 0.03, 0.035).setMass(20), 0.6);
  }

  protected buildVisual() {
    this.cracks = new CrackLayer(512, 352, drawGlassBase);
    const geo = new THREE.PlaneGeometry(W, H, 20, 14);
    const mat = new THREE.MeshStandardMaterial({
      map: this.cracks.texture,
      transparent: true,
      side: THREE.DoubleSide,
      roughness: 0.08,
      metalness: 0.0,
      depthWrite: false,
      emissive: 0x9fd8ea,
      emissiveIntensity: 0.08,
    });
    this.flexU = { value: 0 };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlex = this.flexU;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float uFlex;\nvoid main() {')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.z += uFlex * sin(3.14159 * uv.x) * sin(3.14159 * uv.y);`,
        );
    };
    mat.customProgramCacheKey = () => 'glassflex';
    this.glass = new THREE.Mesh(geo, mat);
    this.glass.renderOrder = 3;
    this.visual.add(this.glass);

    // thin wooden frame + cardboard corner protectors
    const wood = matte(0xe2b47f);
    const card = matte(0xc99a5b);
    const fw = 0.05;
    const bars: [number, number, number, number][] = [
      [0, H / 2 + fw / 2, W + fw * 2, fw],
      [0, -H / 2 - fw / 2, W + fw * 2, fw],
      [W / 2 + fw / 2, 0, fw, H],
      [-W / 2 - fw / 2, 0, fw, H],
    ];
    for (const [x, y, w, h] of bars) {
      const m = new THREE.Mesh(roundedBox([w, h, 0.06], 0.012, 1), wood);
      m.position.set(x, y, 0);
      m.castShadow = true;
      this.visual.add(m);
    }
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const c = new THREE.Mesh(roundedBox([0.14, 0.14, 0.08], 0.02, 1), card);
        c.position.set(sx * (W / 2 + 0.01), sy * (H / 2 + 0.01), 0);
        c.castShadow = true;
        this.visual.add(c);
      }
    // a "FRAGILE — THIS SIDE UP" sticker
    const s = document.createElement('canvas');
    s.width = 256;
    s.height = 96;
    const ctx = s.getContext('2d')!;
    ctx.fillStyle = '#ffdf5d';
    ctx.fillRect(0, 0, 256, 96);
    ctx.fillStyle = '#c63b2f';
    ctx.font = '800 40px "Fredoka", ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FRAGILE', 128, 46);
    ctx.font = '700 22px "Fredoka", ui-rounded, system-ui, sans-serif';
    ctx.fillText('handle with care!', 128, 78);
    const tex = new THREE.CanvasTexture(s);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    sticker.position.set(W * 0.25, -H * 0.3, T / 2 + 0.002);
    this.visual.add(sticker);
    const back = sticker.clone();
    back.rotation.y = Math.PI;
    back.position.z = -T / 2 - 0.002;
    this.visual.add(back);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    // drive the bending mode with the pane's acceleration along its normal
    const v = this.body.linvel();
    const w = this.body.angvel();
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const n = _v.set(0, 0, 1).applyQuaternion(_q);
    const ax = (v.x - this.prevV.x) / dt;
    const ay = (v.y - this.prevV.y) / dt + tuning.physics.gravity;
    const az = (v.z - this.prevV.z) / dt;
    const aRaw = clamp(ax * n.x + ay * n.y + az * n.z, -400, 400);
    // only *changes* in acceleration bend the sheet (resting flat shouldn't sag through the floor)
    this.aAvg += (aRaw - this.aAvg) * (1 - Math.exp(-dt / 0.25));
    const aN = aRaw - this.aAvg;
    // spinning about the vertical axis also bends a wide sheet
    const alpha = clamp(Math.hypot(w.x - this.prevW.x, w.y - this.prevW.y, w.z - this.prevW.z) / dt, 0, 300);
    this.prevV.set(v.x, v.y, v.z);
    this.prevW.set(w.x, w.y, w.z);
    const om = Math.PI * 2 * 2.6;
    const zeta = 0.07;
    const drive = -aN * 0.45 - alpha * 0.02 * Math.sign(this.flex || 1);
    this.flexVel += (-om * om * this.flex - 2 * zeta * om * this.flexVel + drive) * dt;
    this.flex += this.flexVel * dt;
    // a pane resting on something can't wobble much
    const speed = Math.hypot(v.x, v.y, v.z) + Math.hypot(w.x, w.y, w.z) * 0.5;
    if (speed < 0.25) this.flexVel *= Math.exp(-dt * 8);
    this.flex = clamp(this.flex, -0.12, 0.12);
    const amp = Math.abs(this.flex);
    this.wobbleCooldown -= dt;
    if (amp > 0.03 && this.wobbleCooldown <= 0) {
      this.wobbleCooldown = 0.18;
      this.sim.events.emit('cargoWobble', { amount: Math.min(1, amp / 0.1), kind: 'glass' });
    }
    // too much bending = stress cracks
    if (amp > 0.1 && this.grace <= 0) this.damage((amp - 0.1) * dt * 1.2);
  }

  update() {
    this.flexU.value = this.destroyed ? 0 : this.flex * 0.8;
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    // world point -> pane UV
    const t = this.body.translation();
    const r = this.body.rotation();
    const local = point.clone().sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert());
    const u = clamp(local.x / W + 0.5, 0.04, 0.96);
    const v = clamp(local.y / H + 0.5, 0.04, 0.96);
    this.cracks.crack(u, v, clamp(amount * 3.2, 0.15, 1));
    this.flexVel += (Math.random() - 0.5) * 2;
  }

  protected onBreak() {
    this.glass.visible = false;
    const t = this.body.translation();
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const fx = this.sim.fx;
    if (!fx) return;
    const v = this.body.linvel();
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Vector3((Math.random() - 0.5) * W, (Math.random() - 0.5) * H, 0).applyQuaternion(_q).add(_v.set(t.x, t.y, t.z));
      fx.burst('shard', p, {
        count: 14,
        speed: 3.2,
        up: 0.9,
        size: 0.09,
        sizeVar: 0.7,
        life: 2.6,
        gravity: 11,
        spread: 0.3,
        colors: [0xc8f1ff, 0xe8fbff, 0x9fdcf2],
        dir: new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(0.15),
      });
    }
    fx.burst('spark', new THREE.Vector3(t.x, t.y, t.z), { count: 18, speed: 2.5, size: 0.02, life: 0.5, gravity: 3, colors: [0xffffff, 0xd8f6ff] });
  }
}
