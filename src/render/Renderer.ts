import * as THREE from 'three';

export type Quality = 'low' | 'medium' | 'high';

export interface Theme {
  skyTop: number;
  skyHorizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** Direction the sun light comes FROM (normalised in code). */
  sunDir: [number, number, number];
  cloudColor: number;
  /** Height of the cloud sea below the level. */
  cloudY: number;
  exposure: number;
}

export const DEFAULT_THEME: Theme = {
  skyTop: 0x6fb2f5,
  skyHorizon: 0xdcecf8,
  fog: 0xd7e9f6,
  fogNear: 45,
  fogFar: 170,
  sun: 0xfff0d8,
  sunIntensity: 2.6,
  hemiSky: 0xd6ebff,
  hemiGround: 0xc7a98a,
  hemiIntensity: 1.25,
  sunDir: [0.45, 0.85, 0.35],
  cloudColor: 0xffffff,
  cloudY: -24,
  exposure: 1.0,
};

/**
 * Owns the WebGL renderer, the scene graph root, lights and sky.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private skyUniforms: { top: { value: THREE.Color }; horizon: { value: THREE.Color }; sunDir: { value: THREE.Vector3 } };
  private clouds: THREE.Group;
  private cloudMat: THREE.MeshLambertMaterial;
  private shadowFocus = new THREE.Vector3();
  quality: Quality = 'medium';
  theme: Theme = { ...DEFAULT_THEME };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.3, 600);

    // lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -20;
    sc.right = 20;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // sky dome
    this.skyUniforms = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_Position.z = gl_Position.w; // keep at far plane
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          float t = pow(clamp(h * 1.25 + 0.06, 0.0, 1.0), 0.65);
          vec3 col = mix(horizon, top, t);
          // below the horizon fade to a hazy horizon colour (cloud sea fills it)
          col = mix(col, mix(horizon, top, 0.35), smoothstep(0.0, -0.6, h));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 1.6 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // cloud sea
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xbfd6ec, emissiveIntensity: 0.12 });
    this.clouds = this.makeClouds();
    this.scene.add(this.clouds);

    this.scene.fog = new THREE.Fog(0xffffff, 40, 160);
    this.applyTheme(this.theme);
    this.setQuality('medium');
    this.resize();
  }

  /** The cloud puffs' shape, round and rounder (380 of them are drawn every frame: Fast graphics takes the plainer). */
  private puffGeo = [new THREE.IcosahedronGeometry(1, 2), new THREE.IcosahedronGeometry(1, 3)];
  private puffs: THREE.InstancedMesh[] = [];

  private makeClouds() {
    const g = new THREE.Group();
    const geo = this.puffGeo[1];
    const count = 320;
    const inst = new THREE.InstancedMesh(geo, this.cloudMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      // a ring-ish sea of puffs around the play area
      const a = rnd() * Math.PI * 2;
      const r = 4 + Math.pow(rnd(), 0.75) * 160;
      p.set(Math.cos(a) * r, (rnd() - 0.5) * 9, Math.sin(a) * r);
      const sz = 4 + rnd() * 9;
      s.set(sz * (1.1 + rnd() * 0.7), sz * (0.5 + rnd() * 0.35), sz * (1.0 + rnd() * 0.6));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.receiveShadow = false;
    inst.castShadow = false;
    g.add(inst);
    // a few floating clouds up in the sky
    const puffs = new THREE.InstancedMesh(geo, this.cloudMat, 60);
    for (let i = 0; i < 60; i++) {
      const cluster = Math.floor(i / 5);
      const a = cluster * 1.9 + 0.3;
      const r = 70 + (cluster % 4) * 25;
      p.set(Math.cos(a) * r + (rnd() - 0.5) * 12, 18 + (cluster % 3) * 9 + rnd() * 3, Math.sin(a) * r + (rnd() - 0.5) * 8);
      const sz = 3 + rnd() * 4;
      s.set(sz * 1.6, sz * 0.8, sz);
      m.compose(p, q.identity(), s);
      puffs.setMatrixAt(i, m);
    }
    g.add(puffs);
    this.puffs = [inst, puffs];
    return g;
  }

  applyTheme(t: Theme) {
    this.theme = t;
    this.skyUniforms.top.value.set(t.skyTop);
    this.skyUniforms.horizon.value.set(t.skyHorizon);
    const sd = new THREE.Vector3(...t.sunDir).normalize();
    this.skyUniforms.sunDir.value.copy(sd);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(t.fog);
    fog.near = t.fogNear;
    fog.far = t.fogFar;
    this.sun.color.set(t.sun);
    this.sun.intensity = t.sunIntensity;
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.cloudMat.color.set(t.cloudColor);
    this.cloudMat.emissive.set(t.cloudColor);
    this.clouds.position.y = t.cloudY;
    this.renderer.toneMappingExposure = t.exposure;
    this.scene.background = new THREE.Color(t.skyHorizon);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const ratio = q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.baseRatio = ratio;
    const size = q === 'low' ? 1024 : 2048;
    this.renderer.shadowMap.enabled = true;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.shadow.radius = q === 'low' ? 1 : q === 'medium' ? 3 : 4;
    for (const p of this.puffs) p.geometry = this.puffGeo[q === 'low' ? 0 : 1];
    this.resize();
  }

  /** Pixel ratio from the quality setting. */
  private baseRatio = 1;

  // ---- keeping it smooth
  //
  // A slow machine is nearly always slow at filling pixels, so when frames come
  // slowly the picture is drawn a step smaller (and stretched to fit), and at the
  // last steps the shadows are redrawn only every other frame. Steps come back
  // one at a time when there's time to spare. If two steps down made no real
  // difference (the browser is holding frames back to save battery, or it's the
  // sums that are slow, not the drawing), they're undone and it leaves well alone.

  /** Whether the picture may be shrunk to keep the frames coming (Settings; off under automation). */
  smooth = true;
  /** The steps: how much of the full picture is drawn, and whether shadows are redrawn every frame. */
  private static readonly STEPS: [number, boolean][] = [[1, true], [0.85, true], [0.72, true], [0.6, true], [0.6, false], [0.5, false]];
  private step = 0;
  private pacing = { avg: 1 / 60, t: 0, slow: 0, good: 0, wait: 6, before: 0, noGain: 0, rest: 0, since: 99 };
  private shadowTurn = false;

  /** How far the picture has been stepped down (0 = full size). */
  get smoothStep() {
    return this.step;
  }

  /** Each frame: how long since the last one, by the clock (s). */
  pace(dt: number) {
    const p = this.pacing;
    if (!this.smooth) {
      if (this.step) this.setStep(0);
      return;
    }
    // (a tab coming back isn't a slow frame; and one long hitch, a level being built, isn't a trend)
    if (dt <= 0 || dt > 1) return;
    dt = Math.min(dt, 0.25);
    p.avg += (dt - p.avg) * 0.06;
    p.t += dt;
    p.since += dt;
    if (p.t < 1) return;
    p.t = 0;
    if (p.rest > 0) {
      p.rest -= 1;
      return;
    }
    const steps = Renderer.STEPS;
    if (p.avg > 1 / 45) {
      p.good = 0;
      if (++p.slow < 2) return;
      p.slow = 0;
      // did the last step down help?
      if (p.before) {
        if (p.avg > p.before * 0.92) p.noGain++;
        else p.noGain = 0;
        if (p.noGain >= 2) {
          // no: put the picture back and leave it be for a good while
          this.setStep(Math.max(0, this.step - 2));
          p.noGain = 0;
          p.before = 0;
          p.rest = 90;
          return;
        }
      }
      if (this.step < steps.length - 1) {
        // (a step back up that didn't hold: wait longer before trying that again)
        if (p.since < 8) p.wait = Math.min(120, p.wait * 2);
        p.before = p.avg;
        this.setStep(this.step + 1);
      }
    } else if (p.avg < 1 / 54) {
      p.slow = 0;
      p.before = 0;
      p.noGain = 0;
      if (this.step > 0 && ++p.good >= p.wait) {
        p.good = 0;
        p.since = 0;
        this.setStep(this.step - 1);
      }
    } else {
      p.slow = 0;
      p.good = 0;
    }
  }

  private setStep(n: number) {
    if (n === this.step) return;
    this.step = n;
    const full = Renderer.STEPS[n][1];
    this.renderer.shadowMap.autoUpdate = full;
    if (full) this.renderer.shadowMap.needsUpdate = true;
    this.resize();
  }
  /** While streaming online: keep the picture at most this many pixels wide (cheaper to capture and send). */
  capWidth: number | null = null;

  resize() {
    const el = this.renderer.domElement.parentElement;
    const w = el?.clientWidth || window.innerWidth;
    const h = el?.clientHeight || window.innerHeight;
    const mine = this.baseRatio * Renderer.STEPS[this.step][0];
    const ratio = this.capWidth ? Math.min(mine, this.capWidth / Math.max(1, w)) : mine;
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** Keep the shadow frustum around where the action is. */
  setShadowFocus(p: THREE.Vector3, radius: number) {
    this.shadowFocus.copy(p);
    const sd = new THREE.Vector3(...this.theme.sunDir).normalize();
    // snap to texel grid to avoid shimmering
    const r = Math.max(10, Math.min(34, radius));
    const cam = this.sun.shadow.camera;
    if (Math.abs(cam.right - r) > 0.5) {
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      cam.updateProjectionMatrix();
    }
    const texel = (2 * r) / this.sun.shadow.mapSize.x;
    const fx = Math.round(p.x / texel) * texel;
    const fz = Math.round(p.z / texel) * texel;
    this.sun.target.position.set(fx, p.y, fz);
    this.sun.position.set(fx + sd.x * 60, p.y + sd.y * 60, fz + sd.z * 60);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(this.camera.position);
    this.clouds.position.x = p.x * 0.6;
    this.clouds.position.z = p.z * 0.6;
  }

  render() {
    this.sky.position.copy(this.camera.position);
    // (stepped right down: shadows every other frame)
    if (!this.renderer.shadowMap.autoUpdate) {
      this.shadowTurn = !this.shadowTurn;
      if (this.shadowTurn) this.renderer.shadowMap.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
