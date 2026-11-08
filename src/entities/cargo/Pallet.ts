import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { matte } from '../../render/materials';
import { surfaceTexture } from '../../render/textures';

/**
 * Stacking Tower: a wooden pallet that boxes get stacked on (the job's tower
 * hazard drops them on at the crane stations). It can't break; what it's worth
 * is the boxes still standing on it at the drop-off.
 */
export class Pallet extends Cargo {
  readonly kind = 'pallet' as const;
  readonly displayName = 'Box Tower';
  readonly tip = 'Stop under a crane to stack boxes on. Every box still standing at the drop-off pays.';
  readonly fragility: Fragility = { safeShock: 999, perShock: 0, maxPerHit: 0, spinLimit: 0, spinDamage: 0 };
  /** Carried level and smooth: a tower on top. */
  readonly care = 1;
  static readonly size: [number, number, number] = [1.5, 0.16, 1.1];
  /** Boxes stacked on it right now (the tower hazard counts them). */
  boxes = 0;
  /** Each box standing at the drop-off pays this. */
  static readonly perBox = 90;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.7;
    this.init(opts);
  }

  get value() {
    return 40 + this.boxes * Pallet.perBox;
  }

  protected buildColliders() {
    const [w, h, d] = Pallet.size;
    this.addCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setMass(12), 0.95);
  }

  protected buildVisual() {
    const [w, h, d] = Pallet.size;
    const wood = matte(0xd8b07a, { map: surfaceTexture('planks'), key: 'pallet' });
    const dark = matte(0x9a7448);
    // the deck: slats with gaps
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d / 5 - 0.03), wood);
      slat.position.set(0, h / 2 - 0.025, -d / 2 + (i + 0.5) * (d / 5));
      slat.castShadow = slat.receiveShadow = true;
      this.visual.add(slat);
    }
    // the blocks underneath
    for (const x of [-1, 0, 1])
      for (const z of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, h - 0.05, 0.16), dark);
        b.position.set((x * (w - 0.16)) / 2, -0.025, (z * (d - 0.16)) / 2);
        b.castShadow = true;
        this.visual.add(b);
      }
  }

  netState() {
    return [this.boxes];
  }
  applyNetState(s: number[]) {
    this.boxes = s[0] ?? 0;
  }
}
