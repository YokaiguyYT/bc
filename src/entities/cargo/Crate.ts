import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { roundedBox } from '../../levels/LevelBuilder';
import { matte } from '../../render/materials';
import { surfaceTexture } from '../../render/textures';

/** A plain wooden crate — the practice cargo. */
export class Crate extends Cargo {
  readonly kind = 'crate' as const;
  readonly displayName = 'Wooden Crate';
  readonly value = 150;
  readonly tip = 'Practice crate. Grab it together and walk it to the goal.';
  readonly fragility: Fragility = { safeShock: 2.8, perShock: 0.05, maxPerHit: 0.25, spinLimit: 0, spinDamage: 0 };
  static readonly size: [number, number, number] = [0.9, 0.6, 0.6];

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.5;
    this.init(opts);
  }

  protected buildColliders() {
    const [w, h, d] = Crate.size;
    this.addCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setMass(18));
  }

  protected buildVisual() {
    const [w, h, d] = Crate.size;
    const wood = matte(0xd9a066, { map: surfaceTexture('planks'), key: 'crate' });
    const dark = matte(0x8a5a36);
    const box = new THREE.Mesh(roundedBox([w, h, d], 0.03, 0.6), wood);
    box.castShadow = box.receiveShadow = true;
    this.visual.add(box);
    // frame slats
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const slat = new THREE.Mesh(roundedBox([w + 0.02, 0.07, 0.07], 0.02, 1), dark);
        slat.position.set(0, (sy * (h - 0.07)) / 2, (sz * (d - 0.07)) / 2);
        slat.castShadow = true;
        this.visual.add(slat);
      }
    }
    // "FRAGILE" stencil
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(200,40,40,0.85)';
    ctx.font = '800 54px "Fredoka", ui-rounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FRAGILE', 128, 50);
    ctx.strokeStyle = 'rgba(200,40,40,0.85)';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 240, 80);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    for (const s of [-1, 1]) {
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
      label.position.set(0, 0, (s * d) / 2 + 0.002);
      if (s < 0) label.rotation.y = Math.PI;
      this.visual.add(label);
    }
  }
}
