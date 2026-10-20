import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { CrackLayer } from '../../render/cracks';
import { roundedBox } from '../../levels/LevelBuilder';
import { glossy, matte } from '../../render/materials';
import { surfaceTexture } from '../../render/textures';
import { clamp } from '../../util/math';
import { Wobble } from '../../util/wobble';

const W = 0.64;
const H = 0.54;
const D = 0.52;
const SCREEN_W = 0.42;
const SCREEN_H = 0.33;
const SCREEN_X = -0.07;
const SCREEN_Y = 0.035;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** The test card the TV shows when it's healthy. */
function drawTestCard(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 240;
  const ctx = c.getContext('2d')!;
  const bars = ['#f2f2f2', '#f4e04d', '#5ad1e6', '#57d36b', '#e65ad8', '#ec4f4f', '#4f6cec'];
  bars.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect((i * 320) / 7, 0, 320 / 7 + 1, 160);
  });
  ctx.fillStyle = '#1d1d26';
  ctx.fillRect(0, 160, 320, 80);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#f2f2f2' : '#1d1d26';
    ctx.fillRect(i * 40, 172, 40, 26);
  }
  // goofy mascot in a circle
  ctx.fillStyle = '#ffd36b';
  ctx.strokeStyle = '#1d1d26';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(160, 100, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1d1d26';
  for (const x of [138, 182]) {
    ctx.beginPath();
    ctx.ellipse(x, 88, 8, 13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(160, 108, 26, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.font = '800 26px "Fredoka", ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f2f2';
  ctx.fillText('FREIGHT TV', 160, 228);
  return c;
}

const screenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const screenFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uCrack;
  uniform float uTime;
  uniform float uStatic;
  uniform float uRoll;
  uniform float uDead;
  uniform float uBright;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    vec2 uv = 0.5 + c * (1.0 + 0.18 * r2);
    // rounded CRT mask
    vec2 q = abs(c) - vec2(0.43, 0.41);
    float mask = 1.0 - smoothstep(0.0, 0.025, length(max(q, 0.0)) - 0.05);
    float line = floor(uv.y * 120.0);
    uv.x += (hash(vec2(line, floor(uTime * 24.0))) - 0.5) * 0.06 * uStatic;
    uv.y = fract(uv.y + uRoll);
    vec3 col = texture2D(uMap, uv).rgb;
    float n = hash(floor(uv * vec2(220.0, 160.0)) + floor(uTime * 30.0));
    col = mix(col, vec3(n), clamp(uStatic, 0.0, 1.0));
    col *= 0.86 + 0.14 * sin(uv.y * 520.0);
    col *= 1.0 - r2 * 1.4;
    col *= uBright;
    col = mix(col, vec3(0.02, 0.025, 0.03), uDead);
    vec4 crack = texture2D(uCrack, vUv);
    col = mix(col, crack.rgb, crack.a * 0.85);
    vec3 bezel = vec3(0.05, 0.05, 0.06);
    gl_FragColor = vec4(mix(bezel, col, mask), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * A chunky wood-grain CRT. Heavy (two-mover job) and top-heavy. Damage shows
 * as static, rolling picture and screen cracks; destroyed = sparks and smoke.
 */
export class CrtTv extends Cargo {
  readonly kind = 'tv' as const;
  readonly displayName = 'CRT Television';
  readonly value = 400;
  readonly tip = 'The TV is heavy and top-heavy. Lift it together and keep it upright!';
  readonly fragility: Fragility = { safeShock: 2.1, perShock: 0.085, maxPerHit: 0.28, spinLimit: 4, spinDamage: 0.05 };

  private uniforms!: {
    uMap: { value: THREE.Texture };
    uCrack: { value: THREE.Texture };
    uTime: { value: number };
    uStatic: { value: number };
    uRoll: { value: number };
    uDead: { value: number };
    uBright: { value: number };
  };
  private cracks!: CrackLayer;
  private antenna!: THREE.Group;
  private antennaWobble = new Wobble(2.2, 0.08, 0.9);
  private burst = 0;
  private roll = 0;
  private flickerT = 0;
  private sparkT = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.45;
    this.material = 'metal';
    this.init(opts);
  }

  protected buildColliders() {
    const m = 26;
    const inertia = { x: (m / 12) * (H * H + D * D), y: (m / 12) * (W * W + D * D), z: (m / 12) * (W * W + H * H) };
    // centre of mass up and forward: the tube makes it top/front heavy
    this.addCollider(
      RAPIER.ColliderDesc.cuboid(W / 2, H / 2 + 0.025, D / 2).setTranslation(0, -0.025, 0).setMassProperties(m, { x: 0, y: 0.09, z: 0.06 }, inertia, { x: 0, y: 0, z: 0, w: 1 }),
      0.7,
    );
  }

  protected buildVisual() {
    const wood = matte(0x9a5f35, { map: surfaceTexture('planks'), key: 'tvwood' });
    const beige = matte(0xe9dcc2, { roughness: 0.6 });
    const dark = glossy(0x2b2a33, 0.4, 0.2);
    const metal = glossy(0xd8d2c4, 0.3, 0.7);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.visual.add(m);
      return m;
    };
    add(roundedBox([W, H, D], 0.05, 0.6), wood, 0, 0, 0);
    add(roundedBox([W - 0.04, H - 0.04, 0.04], 0.02, 1), beige, 0, 0, D / 2 + 0.005);
    // screen surround + screen
    add(roundedBox([SCREEN_W + 0.05, SCREEN_H + 0.05, 0.02], 0.02, 1), dark, SCREEN_X, SCREEN_Y, D / 2 + 0.02);
    const picture = new THREE.CanvasTexture(drawTestCard());
    picture.colorSpace = THREE.SRGBColorSpace;
    this.cracks = new CrackLayer(256, 200, undefined, 'rgba(235,245,255,0.95)', 'rgba(0,0,0,0.6)');
    this.uniforms = {
      uMap: { value: picture },
      uCrack: { value: this.cracks.texture },
      uTime: { value: 0 },
      uStatic: { value: 0 },
      uRoll: { value: 0 },
      uDead: { value: 0 },
      uBright: { value: 1.0 },
    };
    const screenGeo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H, 8, 6);
    // bulge the glass outward a little
    const pos = screenGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (SCREEN_W / 2);
      const y = pos.getY(i) / (SCREEN_H / 2);
      pos.setZ(i, 0.018 * (1 - 0.5 * (x * x + y * y)));
    }
    screenGeo.computeVertexNormals();
    const screen = new THREE.Mesh(screenGeo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: screenVert, fragmentShader: screenFrag }));
    screen.position.set(SCREEN_X, SCREEN_Y, D / 2 + 0.031);
    this.visual.add(screen);

    // controls on the right
    const knobGeo = new THREE.CylinderGeometry(0.032, 0.036, 0.03, 18);
    knobGeo.rotateX(Math.PI / 2);
    add(knobGeo, dark, 0.235, 0.11, D / 2 + 0.035);
    add(knobGeo, dark, 0.235, 0.0, D / 2 + 0.035);
    for (let i = 0; i < 5; i++) add(roundedBox([0.09, 0.012, 0.012], 0.004, 1), dark, 0.235, -0.1 - i * 0.025, D / 2 + 0.03);
    // brand plate
    add(roundedBox([0.16, 0.025, 0.01], 0.005, 1), metal, SCREEN_X, -0.215, D / 2 + 0.03);
    // feet
    const foot = new THREE.CylinderGeometry(0.025, 0.035, 0.05, 10);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(foot, dark, sx * (W / 2 - 0.07), -H / 2 - 0.022, sz * (D / 2 - 0.07));

    // rabbit-ear antenna
    this.antenna = new THREE.Group();
    this.antenna.position.set(0.02, H / 2, -0.05);
    this.visual.add(this.antenna);
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    base.castShadow = true;
    this.antenna.add(base);
    const rodGeo = new THREE.CylinderGeometry(0.006, 0.008, 0.46, 6);
    rodGeo.translate(0, 0.23, 0);
    const tipGeo = new THREE.SphereGeometry(0.016, 8, 6);
    for (const s of [-1, 1]) {
      const rod = new THREE.Mesh(rodGeo, metal);
      rod.rotation.z = s * 0.52;
      rod.position.y = 0.03;
      rod.castShadow = true;
      const tip = new THREE.Mesh(tipGeo, metal);
      tip.position.y = 0.46;
      rod.add(tip);
      this.antenna.add(rod);
    }
  }

  preStep(dt: number) {
    // antenna leans against the felt gravity, springs back with a wobble
    const g = Math.max(4, -this.gEff.y);
    this.antennaWobble.step(dt, clamp(-this.gEff.x / g, -1, 1) * 0.9, clamp(-this.gEff.z / g, -1, 1) * 0.9);
  }

  update(dt: number, time: number) {
    const u = this.uniforms;
    u.uTime.value = time;
    const h = this.destroyed ? 0 : this.health;
    this.burst = Math.max(0, this.burst - dt * 2.5);
    const base = clamp((1 - h) * 1.15 - 0.12, 0, 0.85);
    u.uStatic.value = Math.min(1, Math.max(base, this.burst));
    if (h < 0.55 && !this.destroyed) this.roll = (this.roll + dt * (0.55 - h) * 0.9) % 1;
    u.uRoll.value = this.roll;
    // flicker when hurt
    this.flickerT -= dt;
    if (this.flickerT <= 0) {
      this.flickerT = 0.05 + Math.random() * (0.3 + h * 2);
      u.uBright.value = h < 0.85 && Math.random() < 0.5 ? 0.45 + Math.random() * 0.4 : 1.0;
    }
    u.uDead.value = this.destroyed ? 1 : 0;
    this.antenna.rotation.z = -this.antennaWobble.x * 0.6;
    this.antenna.rotation.x = this.antennaWobble.y * 0.6;
    if (this.destroyed) {
      this.antenna.rotation.z = 0.9;
      this.sparkT -= dt;
      if (this.sparkT <= 0 && this.sim.fx) {
        this.sparkT = 0.4 + Math.random() * 1.2;
        const p = this.visual.localToWorld(new THREE.Vector3(SCREEN_X, SCREEN_Y, D / 2 + 0.05));
        this.sim.fx.burst('spark', p, { count: 5, speed: 2, up: 1, size: 0.02, life: 0.4, gravity: 8, colors: [0xfff1a8, 0x9fe8ff] });
        this.sim.fx.burst('smoke', this.visual.localToWorld(new THREE.Vector3(0, H / 2, 0)), { count: 1, speed: 0.3, up: 3, size: 0.06, life: 1.6, gravity: -0.6, drag: 1.5 });
      }
    }
  }

  protected onDamage(amount: number, point: THREE.Vector3, shock: number) {
    this.burst = Math.min(1, this.burst + 0.4 + amount * 3);
    this.antennaWobble.kick((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    // crack the screen if the hit was near the front
    const t = this.body.translation();
    const r = this.body.rotation();
    const local = point.clone().sub(_v.set(t.x, t.y, t.z)).applyQuaternion(_q.set(r.x, r.y, r.z, r.w).invert());
    if (local.z > D / 2 - 0.12 || amount > 0.12) {
      const u = clamp((local.x - SCREEN_X) / SCREEN_W + 0.5, 0.1, 0.9);
      const v = clamp((local.y - SCREEN_Y) / SCREEN_H + 0.5, 0.1, 0.9);
      this.cracks.crack(local.z > D / 2 - 0.12 ? u : 0.2 + Math.random() * 0.6, local.z > D / 2 - 0.12 ? v : 0.2 + Math.random() * 0.6, clamp(amount * 3, 0.1, 0.8));
    }
    if (shock > 3 && this.sim.fx) this.sim.fx.burst('spark', point, { count: 6, speed: 2.5, up: 1, size: 0.02, life: 0.35, gravity: 8, colors: [0xfff1a8, 0xffffff] });
  }

  protected onBreak() {
    this.cracks.crack(0.5, 0.5, 1);
    this.cracks.crack(0.3, 0.6, 0.7);
    const fx = this.sim.fx;
    if (!fx) return;
    const p = this.visual.localToWorld(new THREE.Vector3(SCREEN_X, SCREEN_Y, D / 2 + 0.05));
    fx.burst('spark', p, { count: 30, speed: 4, up: 1.2, size: 0.025, life: 0.6, gravity: 9, colors: [0xfff1a8, 0x9fe8ff, 0xffffff] });
    fx.burst('smoke', p, { count: 8, speed: 0.8, up: 2, size: 0.08, life: 2.2, gravity: -0.8, drag: 1.2 });
    fx.burst('shard', p, { count: 20, speed: 2.5, up: 1, size: 0.05, life: 2, gravity: 11, colors: [0x9aa6b0, 0xc8d2da] });
  }
}
