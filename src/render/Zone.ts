import * as THREE from 'three';
import { textTexture } from '../levels/LevelBuilder';

/**
 * Goal / checkpoint marker: a glowing translucent column with a striped floor
 * pad and a floating label. `progress` (0..1) fills it up.
 */
export class Zone {
  readonly object = new THREE.Group();
  private walls: THREE.Mesh;
  private fill: THREE.Mesh;
  private pad: THREE.Mesh;
  private label: THREE.Sprite;
  private flag?: THREE.Group;
  private t = Math.random() * 10;
  private uniforms: { uColor: { value: THREE.Color }; uTime: { value: number }; uProgress: { value: number }; uDone: { value: number } };

  constructor(
    pos: THREE.Vector3,
    private size: THREE.Vector3,
    color: number,
    text: string,
    private isCheckpoint = false,
  ) {
    this.object.position.copy(pos);
    this.uniforms = {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uDone: { value: 0 },
    };
    const wallMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vY;
        void main() {
          vUv = uv;
          vY = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uProgress;
        uniform float uDone;
        varying vec2 vUv;
        void main() {
          float h = vUv.y;
          float a = (1.0 - h) * 0.42;
          float stripes = step(0.5, fract(vUv.y * 6.0 - uTime * 0.6));
          a *= 0.75 + 0.25 * stripes;
          a += smoothstep(0.03, 0.0, abs(h - uProgress)) * 0.6 * step(0.001, uProgress);
          vec3 c = mix(uColor, vec3(1.0), 0.15 + 0.35 * uDone);
          gl_FragColor = vec4(c, a * (0.55 + 0.45 * uDone));
        }`,
    });
    const g = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
    g.rotateY(Math.PI / 4);
    this.walls = new THREE.Mesh(g, wallMat);
    const h = isCheckpoint ? Math.min(size.y, 1.4) : size.y;
    this.walls.scale.set(size.x * Math.SQRT1_2, h, size.z * Math.SQRT1_2);
    this.walls.position.y = -size.y / 2 + h / 2;
    this.walls.renderOrder = 5;
    this.object.add(this.walls);

    // inner fill showing delivery progress
    this.fill = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    this.fill.scale.set(size.x * 0.98, 0.001, size.z * 0.98);
    this.fill.visible = !isCheckpoint;
    this.object.add(this.fill);

    // striped pad on the floor
    const padTex = padTexture(color);
    this.pad = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x, size.z),
      new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    this.pad.rotation.x = -Math.PI / 2;
    this.pad.position.y = -size.y / 2 + 0.015;
    this.pad.renderOrder = 4;
    this.object.add(this.pad);

    // floating label
    // outlined so it reads over snow, marble and white gazebos alike
    const tex = textTexture(text, 3.2, 0.7, '#ffffff', undefined, 0.42, 'rgba(38,44,62,0.8)');
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    this.label.scale.set(3.2 * 0.8, 0.7 * 0.8, 1);
    this.label.position.y = -size.y / 2 + h + 0.7;
    this.label.renderOrder = 20;
    this.object.add(this.label);

    if (isCheckpoint) {
      const f = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 }));
      pole.position.y = 1.1;
      pole.castShadow = true;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 8, 1), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }));
      cloth.position.set(0.42, 1.9, 0);
      cloth.castShadow = true;
      f.add(pole, cloth);
      f.position.set(size.x / 2 - 0.2, -size.y / 2, size.z / 2 - 0.2);
      this.flag = f;
      this.object.add(f);
    }
  }

  update(dt: number, progress: number) {
    this.t += dt;
    this.uniforms.uTime.value = this.t;
    this.uniforms.uProgress.value = this.isCheckpoint ? 0 : progress;
    const done = this.isCheckpoint ? progress : progress >= 1 ? 1 : 0;
    this.uniforms.uDone.value += (done - this.uniforms.uDone.value) * Math.min(1, dt * 4);
    if (this.isCheckpoint && progress >= 1) this.uniforms.uColor.value.lerp(new THREE.Color(0x6be0a5), Math.min(1, dt * 3));
    if (!this.isCheckpoint) {
      const h = Math.max(0.001, progress * this.size.y * 0.9);
      this.fill.scale.y = h;
      this.fill.position.y = -this.size.y / 2 + h / 2;
    }
    this.label.position.y += Math.sin(this.t * 2) * 0.002;
    if (this.flag) {
      const cloth = this.flag.children[1] as THREE.Mesh;
      const pos = (cloth.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + 0.4;
        pos.setZ(i, Math.sin(this.t * 6 + x * 6) * 0.06 * x);
      }
      pos.needsUpdate = true;
    }
  }
}

function padTexture(color: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const col = new THREE.Color(color);
  const css = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},`;
  ctx.fillStyle = css + '0.28)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = css + '0.95)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.fillStyle = css + '0.35)';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i + 16 + 128, 128);
    ctx.lineTo(i + 128, 128);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
