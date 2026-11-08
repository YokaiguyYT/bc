import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { glossy, matte } from '../../render/materials';
import { registerHazard, type Hazard } from './registry';
import { mesh, parkProp, parkSpot, prop, showLive, spawnProp, wordTexture, type Prop } from './party/kit';
import type { Pallet } from '../cargo/Pallet';

const BOX = 0.5;
const PAD = 1.6;
const POOL = 16;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();

interface Station {
  x: number;
  y: number;
  z: number;
  /** Seconds the pallet's been sat still on the pad. */
  t: number;
  dropped: number;
  hook: THREE.Object3D;
}

/**
 * Stacking Tower: crane pads along the course. Stop the pallet on one and hold
 * still, and a box gets stacked on top of whatever's on it (again, and again,
 * for as long as you dare). It counts the boxes standing on the pallet; the
 * pallet's worth that many boxes.
 *
 * params: stations ([x, y, z] of each pad's middle, on the floor).
 */
class Tower implements Hazard {
  private root = new THREE.Group();
  private boxes: Prop[] = [];
  private stations: Station[] = [];
  private count = 0;
  private best = 0;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    sim.scene.add(this.root);
    const looks = [0xc8955b, 0xd8a86b, 0xb98450];
    for (let i = 0; i < POOL; i++) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(BOX, BOX, BOX), matte(looks[i % 3])));
      g.add(mesh(new THREE.BoxGeometry(0.12, BOX + 0.005, BOX + 0.005), matte(0xe8d3a8), false));
      this.boxes.push(prop(sim, this.root, RAPIER.ColliderDesc.cuboid(BOX / 2, BOX / 2, BOX / 2).setMass(2.2).setRestitution(0), g, parkSpot(i), { material: 'cardboard', friction: 1.0, damping: 0.05, angDamping: 0.3 }));
    }
    const list = (o.params?.stations as [number, number, number][] | undefined) ?? [];
    const label = new THREE.SpriteMaterial({ map: wordTexture('🏗️ STACK HERE', 'rgba(0,0,0,0)', '#ffd23f', 512, 96), transparent: true, depthWrite: false });
    for (const [x, y, z] of list) {
      // a striped pad, and a gantry crane over it with a hook that drops the boxes
      const pad = mesh(new THREE.BoxGeometry(PAD * 2, 0.02, PAD * 2), matte(0xffd23f), false);
      pad.position.set(x, y + 0.012, z);
      const inner = mesh(new THREE.BoxGeometry(PAD * 2 - 0.3, 0.022, PAD * 2 - 0.3), matte(0x3a3a44), false);
      inner.position.set(x, y + 0.014, z);
      this.root.add(pad, inner);
      const steel = glossy(0xf2a23a, 0.4, 0.4);
      for (const s of [-1, 1]) {
        const post = mesh(new THREE.BoxGeometry(0.2, 4.4, 0.2), steel);
        post.position.set(x + s * (PAD + 0.25), y + 2.2, z);
        this.root.add(post);
      }
      const beam = mesh(new THREE.BoxGeometry(PAD * 2 + 0.7, 0.26, 0.3), steel);
      beam.position.set(x, y + 4.4, z);
      this.root.add(beam);
      const hook = new THREE.Group();
      const cable = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6).translate(0, -0.5, 0), glossy(0x2a2a30, 0.4), false);
      const block = mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), glossy(0xffd23f, 0.4, 0.3), false);
      block.position.y = -1;
      hook.add(cable, block);
      hook.position.set(x, y + 4.3, z);
      this.root.add(hook);
      const sign = new THREE.Sprite(label);
      sign.scale.set(2.4, 0.45, 1);
      sign.position.set(x, y + 4.95, z);
      this.root.add(sign);
      this.stations.push({ x, y, z, t: 0, dropped: 0, hook });
    }
  }

  private get pallet() {
    return this.sim.cargo as Pallet | undefined;
  }

  /** Which boxes are standing on the pallet (above its deck, inside its edges). */
  private onPallet(): Prop[] {
    const p = this.pallet;
    if (!p) return [];
    const t = p.body.translation();
    const r = p.body.rotation();
    _qi.set(r.x, r.y, r.z, r.w).invert();
    return this.boxes.filter((b) => {
      if (!b.live) return false;
      const bt = b.body.translation();
      _v.set(bt.x - t.x, bt.y - t.y, bt.z - t.z).applyQuaternion(_qi);
      return _v.y > 0.1 && Math.abs(_v.x) < 0.8 && Math.abs(_v.z) < 0.6 && _v.y < 6;
    });
  }

  preStep(dt: number) {
    const p = this.pallet;
    if (!p || this.sim.live?.() === false) return;
    const t = p.body.translation();
    const v = p.body.linvel();
    const still = Math.hypot(v.x, v.y, v.z) < 0.6;
    for (const s of this.stations) {
      const on = Math.abs(t.x - s.x) < PAD && Math.abs(t.z - s.z) < PAD && Math.abs(t.y - s.y) < 2.5;
      s.t = on && still ? s.t + dt : 0;
      if (s.t > (s.dropped ? 1.25 : 0.7)) {
        s.t = 0.001;
        this.drop(s);
      }
    }
    for (const b of this.boxes) if (b.live && b.body.translation().y < -30) parkProp(b);
    // the count, and a cheer or a groan when it changes
    const n = this.onPallet().length;
    if (n < this.count) {
      this.sim.events.emit('party', { text: n === this.count - 1 ? '−1 BOX!' : `−${this.count - n} BOXES!`, small: true });
      this.sim.shake?.(0.15);
    }
    this.count = n;
    this.best = Math.max(this.best, n);
    p.boxes = n;
    const waiting = this.stations.some((s) => s.t > 0.05);
    p.status = waiting ? '🏗️ hold still: stacking…' : `🗼 ${n} box${n === 1 ? '' : 'es'} stacked`;
  }

  private drop(s: Station) {
    const p = this.pallet!;
    const free = this.boxes.find((b) => !b.live);
    if (!free) return;
    const t = p.body.translation();
    const r = p.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    // on top of the stack (or the deck)
    let top = t.y + 0.08;
    for (const b of this.onPallet()) top = Math.max(top, b.body.translation().y + BOX / 2);
    const v = p.body.linvel();
    const yaw = new THREE.Euler().setFromQuaternion(_q, 'YXZ').y;
    spawnProp(free, _v.set(t.x + (Math.random() - 0.5) * 0.06, top + BOX / 2 + 0.35, t.z + (Math.random() - 0.5) * 0.06), new THREE.Vector3(v.x, Math.min(0, v.y) - 0.3, v.z), yaw);
    s.dropped++;
    this.sim.fx?.burst('dust', _v.set(t.x, top + 0.9, t.z), { count: 4, speed: 0.8, up: 0.3, size: 0.12, life: 0.5, gravity: -0.2, drag: 3 });
    this.sim.events.emit('party', { text: `+1 BOX (${this.count + 1})`, small: true });
  }

  update(_dt: number, time: number) {
    showLive(this.boxes);
    // the hooks sway, and dip over a pallet that's being stacked
    for (const s of this.stations) {
      const dip = s.t > 0 ? Math.min(1, s.t * 1.5) : 0;
      s.hook.scale.y = 1 + dip * 1.2;
      s.hook.rotation.z = Math.sin(time * 1.3 + s.x) * 0.05;
    }
  }

  netState() {
    return this.stations.map((s) => s.t);
  }
  applyNetState(v: number[]) {
    this.stations.forEach((s, i) => (s.t = v[i] ?? 0));
  }

  dispose() {
    this.root.removeFromParent();
  }
}

registerHazard('tower', (o, sim) => new Tower(o, sim));
