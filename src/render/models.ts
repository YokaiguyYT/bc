import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import embedded from 'virtual:ff-models';
import { matte } from './materials';

/**
 * Sketchfab models (downloaded by scripts/fetch-models.mjs) are purely visual.
 * They're auto-scaled to a target size, restyled to match the game's soft
 * matte look, and replaced with primitive placeholders if missing.
 */

export interface ManifestEntry {
  file: string;
  /** Default target size (m) if the level doesn't give one. */
  size: [number, number, number];
  /** Extra rotation applied before fitting (degrees), to fix model orientation. */
  rotation?: [number, number, number];
  /** 'keep' = original materials softened, 'flat' = one matte colour per material. */
  style?: 'keep' | 'flat' | 'tint';
  tint?: number;
  /** Placeholder colour when the model is missing. */
  fallbackColor?: number;
  title?: string;
  author?: string;
  url?: string;
  license?: string;
}

export interface Manifest {
  models: Record<string, ManifestEntry>;
}

interface Loaded {
  scene: THREE.Object3D;
  entry: ManifestEntry;
}

class ModelLibrary {
  manifest: Manifest = { models: {} };
  private loaded = new Map<string, Loaded>();
  private failed = new Set<string>();
  private loader = new GLTFLoader();
  /** Names we know about but don't have (shown as placeholders). */
  missing: string[] = [];

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  async preload(onProgress?: (done: number, total: number) => void) {
    try {
      if (embedded) this.manifest = embedded.manifest as Manifest;
      else {
        const res = await fetch(new URL('models/manifest.json', document.baseURI).href);
        if (res.ok) this.manifest = (await res.json()) as Manifest;
      }
    } catch (e) {
      console.warn('[models] no manifest, using placeholders', e);
      return;
    }
    const names = Object.keys(this.manifest.models);
    let done = 0;
    onProgress?.(0, names.length);
    await Promise.all(
      names.map(async (name) => {
        try {
          await this.load(name);
        } catch (e) {
          console.warn(`[models] ${name} failed, using placeholder`, e);
          this.failed.add(name);
          this.missing.push(name);
        }
        onProgress?.(++done, names.length);
      }),
    );
  }

  private async load(name: string) {
    const entry = this.manifest.models[name];
    let buffer: ArrayBuffer;
    const b64 = embedded?.files[entry.file];
    if (b64) buffer = base64ToBuffer(b64);
    else {
      const res = await fetch(new URL(`models/${entry.file}`, document.baseURI).href);
      if (!res.ok) throw new Error(`${res.status}`);
      buffer = await res.arrayBuffer();
    }
    const gltf = await this.loader.parseAsync(buffer, '');
    const scene = gltf.scene;
    stylize(scene, entry);
    if (entry.rotation) {
      const r = entry.rotation.map((d) => (d * Math.PI) / 180);
      scene.rotation.set(r[0], r[1], r[2]);
    }
    const wrapper = new THREE.Group();
    wrapper.add(scene);
    this.loaded.set(name, { scene: wrapper, entry });
  }

  has(name: string) {
    return this.loaded.has(name);
  }

  /**
   * A fresh copy of a model, uniformly scaled to fit `target` and centred on
   * its bounding box. Returns the actual size after scaling.
   */
  instance(name: string, target?: [number, number, number]): { object: THREE.Object3D; size: [number, number, number] } {
    const l = this.loaded.get(name);
    const entry = this.manifest.models[name];
    const want = target ?? entry?.size ?? [1, 1, 1];
    if (!l) return placeholder(name, want, entry?.fallbackColor);
    const obj = l.scene.clone(true);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = Math.min(want[0] / Math.max(size.x, 1e-4), want[1] / Math.max(size.y, 1e-4), want[2] / Math.max(size.z, 1e-4));
    const outer = new THREE.Group();
    obj.position.sub(center);
    const scaler = new THREE.Group();
    scaler.scale.setScalar(s);
    scaler.add(obj);
    outer.add(scaler);
    outer.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return { object: outer, size: [size.x * s, size.y * s, size.z * s] };
  }
}

function placeholder(name: string, size: [number, number, number], color = 0xd8c3a5) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(0.05, Math.min(...size) * 0.2)), matte(color));
  m.castShadow = true;
  m.receiveShadow = true;
  m.name = `placeholder_${name}`;
  g.add(m);
  return { object: g, size };
}

/** Make downloaded models sit nicely in the soft, matte Human Fall Flat look. */
function stylize(root: THREE.Object3D, entry: ManifestEntry) {
  const style = entry.style ?? 'keep';
  const swap = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out = mats.map((m) => {
      let r = swap.get(m);
      if (r) return r;
      const std = m as THREE.MeshStandardMaterial;
      if (style === 'flat' || style === 'tint') {
        const c = style === 'tint' && entry.tint !== undefined ? new THREE.Color(entry.tint) : averageColor(std);
        r = matte(c, { roughness: 0.82, key: `model_${c.getHexString()}` });
      } else {
        const k = std.clone() as THREE.MeshStandardMaterial;
        if ('roughness' in k) k.roughness = Math.max(0.55, k.roughness ?? 1);
        if ('metalness' in k) k.metalness = Math.min(0.25, k.metalness ?? 0);
        if ('envMapIntensity' in k) k.envMapIntensity = 0.5;
        k.normalScale?.multiplyScalar(0.6);
        r = k;
      }
      swap.set(m, r);
      return r;
    });
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
  });
}

/** Average a material's colour, folding in its base colour texture if it has one. */
function averageColor(m: THREE.MeshStandardMaterial): THREE.Color {
  const base = m.color ? m.color.clone() : new THREE.Color(1, 1, 1);
  const img = m.map?.image as CanvasImageSource | undefined;
  if (!img) return base;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue;
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    if (!n) return base;
    const tex = new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
    return base.multiply(tex);
  } catch {
    return base;
  }
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export const models = new ModelLibrary();
