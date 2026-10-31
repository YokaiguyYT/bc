import * as THREE from 'three';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { glossy, matte } from '../../render/materials';
import { registerHazard, Hazard } from './registry';
import { num, v3 } from './common';

/** One shape and look for every tip in a level (there can be a few dozen). */
let shared: { note: THREE.BufferGeometry; band: THREE.BufferGeometry; noteMat: THREE.Material; bandMat: THREE.Material } | null = null;

/**
 * A cash tip floating at chest height: walk a mover through it and it's
 * pocketed (paid with the delivery). Some sit on the easy line, some right
 * where it's risky. params: amount ($).
 */
class Tip implements Hazard {
  private visual = new THREE.Group();
  private pos: THREE.Vector3;
  private amount: number;
  private got = false;
  private phase: number;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.pos = v3(o.pos);
    this.amount = num(o.params, 'amount', 20);
    // where it bobs and turns (looks only: the guest may differ)
    this.phase = (this.pos.x * 7.3 + this.pos.z * 3.1) % (Math.PI * 2);
    shared ??= {
      note: new THREE.BoxGeometry(0.46, 0.24, 0.025),
      band: new THREE.BoxGeometry(0.1, 0.26, 0.035),
      noteMat: matte(0x5fc46f),
      bandMat: glossy(0xffd23f, 0.3, 0.5),
    };
    const note = new THREE.Mesh(shared.note, shared.noteMat);
    const band = new THREE.Mesh(shared.band, shared.bandMat);
    note.castShadow = true;
    this.visual.add(note, band);
    this.visual.position.copy(this.pos);
    sim.scene.add(this.visual);
  }

  preStep() {
    if (this.got) return;
    for (const p of this.sim.players ?? []) {
      if (p.bodyPos.distanceTo(this.pos) > 0.85) continue;
      this.take();
      this.sim.events.emit('tip', { amount: this.amount, pos: this.pos.clone() });
      return;
    }
  }

  private take() {
    this.got = true;
    this.visual.visible = false;
  }

  update(_dt: number, time: number) {
    if (this.got) return;
    this.visual.rotation.y = time * 2.2 + this.phase;
    this.visual.position.y = this.pos.y + Math.sin(time * 3 + this.phase) * 0.07;
  }

  netState() {
    return [this.got ? 1 : 0];
  }

  applyNetState(s: number[]) {
    if (s[0] === 1 && !this.got) this.take();
  }

  dispose() {
    this.visual.removeFromParent();
  }
}
registerHazard('tip', (o, sim) => new Tip(o, sim));
