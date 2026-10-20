import * as THREE from 'three';

/**
 * Human Fall Flat / Gang Beasts look: soft matte surfaces for the world,
 * slightly glossy "gummy" surfaces for characters with a rim glow that fakes
 * subsurface scattering.
 */

const cache = new Map<string, THREE.Material>();

function addRim(mat: THREE.Material, strength: number, power: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: strength };
    shader.uniforms.uRimPow = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uRim;\nuniform float uRimPow;\nvoid main() {')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = 1.0 - saturate(dot(normalize(vViewPosition), normal));
        totalEmissiveRadiance += diffuseColor.rgb * uRim * pow(rimF, uRimPow);`,
      );
  };
  mat.customProgramCacheKey = () => `rim${strength}_${power}`;
  return mat;
}

/** Gummy character material. */
export function jelly(color: THREE.ColorRepresentation, rim = 0.55): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  const key = `jelly_${c.getHexString()}_${rim}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const m = new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.32,
    sheen: 0.25,
    sheenColor: c.clone().lerp(new THREE.Color(1, 1, 1), 0.5),
    sheenRoughness: 0.6,
  });
  addRim(m, rim, 2.2);
  cache.set(key, m);
  return m;
}

/** Soft matte material for the world. */
export function matte(color: THREE.ColorRepresentation, opts: { roughness?: number; map?: THREE.Texture | null; rim?: number; key?: string } = {}) {
  const c = new THREE.Color(color);
  const key = `matte_${c.getHexString()}_${opts.roughness ?? 0.85}_${opts.key ?? (opts.map ? opts.map.uuid : '')}_${opts.rim ?? 0}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color: c,
    roughness: opts.roughness ?? 0.85,
    metalness: 0,
    map: opts.map ?? null,
  });
  if (opts.rim) addRim(m, opts.rim, 2.5);
  cache.set(key, m);
  return m;
}

/** Slightly shiny painted surfaces (metal machinery, plastic). */
export function glossy(color: THREE.ColorRepresentation, roughness = 0.35, metalness = 0.1) {
  const c = new THREE.Color(color);
  const key = `glossy_${c.getHexString()}_${roughness}_${metalness}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({ color: c, roughness, metalness });
  cache.set(key, m);
  return m;
}

export function unlit(color: THREE.ColorRepresentation, opts: { transparent?: boolean; opacity?: number } = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: opts.transparent, opacity: opts.opacity ?? 1 });
}

/** Material palette used by levels (pastel, slightly desaturated). */
export const PALETTE = {
  cream: 0xf3ead8,
  sand: 0xe8d3a9,
  wood: 0xc98f5a,
  woodDark: 0x8a5a36,
  woodLight: 0xe0b47c,
  brick: 0xc9694e,
  concrete: 0xc9c6c0,
  concreteDark: 0x9a9893,
  asphalt: 0x5d6168,
  grass: 0x8cc66b,
  grassDark: 0x6aa557,
  sky: 0x9fd3ff,
  water: 0x5ec4e8,
  steel: 0x8d9aa6,
  yellow: 0xffcc4d,
  orange: 0xff9447,
  red: 0xe9554b,
  pink: 0xff9fb2,
  mint: 0x9fe3c4,
  teal: 0x4fb7b3,
  blue: 0x5b8def,
  lavender: 0xb7a6ef,
  white: 0xfbfaf6,
  black: 0x2b2a33,
  wall: 0xf1e3c8,
  wallBlue: 0xbcd8ee,
  wallGreen: 0xc9e4c5,
  carpet: 0xb65a5a,
};
