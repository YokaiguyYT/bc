import * as THREE from 'three';
import { matte, PALETTE } from '../render/materials';
import { surfaceTexture, SurfaceTex } from '../render/textures';
import type { Surface } from './types';
import type { ColliderInfo } from '../physics/PhysicsWorld';

export interface SurfaceDef {
  tex: SurfaceTex | null;
  /** metres per texture repeat */
  tile: number;
  color: number;
  friction: number;
  sound: NonNullable<ColliderInfo['material']>;
  roughness?: number;
}

export const SURFACES: Record<Surface, SurfaceDef> = {
  plain: { tex: null, tile: 1, color: 0xf0ebe3, friction: 0.8, sound: 'wood' },
  paint: { tex: 'plaster', tile: 2.5, color: 0xf0ebe3, friction: 0.8, sound: 'wood' },
  wood: { tex: 'planks', tile: 2.4, color: PALETTE.wood, friction: 0.8, sound: 'wood' },
  woodDark: { tex: 'planks', tile: 2.4, color: PALETTE.woodDark, friction: 0.8, sound: 'wood' },
  woodLight: { tex: 'planks', tile: 2.4, color: PALETTE.woodLight, friction: 0.8, sound: 'wood' },
  tiles: { tex: 'tiles', tile: 1.6, color: 0xf2efe9, friction: 0.7, sound: 'concrete' },
  checker: { tex: 'checker', tile: 1.8, color: 0xffffff, friction: 0.7, sound: 'concrete' },
  concrete: { tex: 'concrete', tile: 3.2, color: PALETTE.concrete, friction: 0.9, sound: 'concrete' },
  grass: { tex: 'grass', tile: 4, color: PALETTE.grass, friction: 0.9, sound: 'soft' },
  brick: { tex: 'brick', tile: 2.2, color: PALETTE.brick, friction: 0.8, sound: 'concrete' },
  carpet: { tex: 'carpet', tile: 2, color: PALETTE.carpet, friction: 1.0, sound: 'soft', roughness: 1 },
  wallpaper: { tex: 'stripes', tile: 1.4, color: PALETTE.wall, friction: 0.8, sound: 'wood' },
  plaster: { tex: 'plaster', tile: 3, color: PALETTE.wall, friction: 0.8, sound: 'concrete' },
  asphalt: { tex: 'asphalt', tile: 3.5, color: PALETTE.asphalt, friction: 0.95, sound: 'concrete' },
  metal: { tex: 'metal', tile: 1.6, color: PALETTE.steel, friction: 0.6, sound: 'metal', roughness: 0.45 },
  ice: { tex: 'plaster', tile: 3, color: 0xd7f3ff, friction: 0.03, sound: 'concrete', roughness: 0.25 },
  hazard: { tex: 'hazard', tile: 1, color: 0xffffff, friction: 0.8, sound: 'metal' },
  cardboard: { tex: 'cardboard', tile: 0.8, color: 0xd9b07a, friction: 0.7, sound: 'cardboard' },
  snow: { tex: 'snow', tile: 3, color: 0xf4f8fc, friction: 0.75, sound: 'soft', roughness: 0.95 },
};

export function surfaceMaterial(surface: Surface, color?: number): THREE.MeshStandardMaterial {
  const s = SURFACES[surface];
  const map = s.tex ? surfaceTexture(s.tex) : null;
  return matte(color ?? s.color, { map, roughness: s.roughness ?? 0.86, key: s.tex ?? 'none' });
}
