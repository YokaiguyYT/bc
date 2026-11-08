import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { Player } from '../../Player';
import { matte } from '../../../render/materials';
import { ON, PartyGame } from './base';
import { Bay, holder, mesh, parkSpot, prop, showLive, spawnProp, type Prop } from './kit';

/** Where the trucks' open backs are (each side of the middle). */
export const TUG_BAY = 8.5;
/** (27 kg: one mover alone can just about drag it, slowly; 30 and they can't) */
const SOFA = { hx: 1.15, hy: 0.42, hz: 0.45, mass: 27 };
const IN_FOR = 1;

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

function sofaLook() {
  const g = new THREE.Group();
  const fabric = matte(0xc2413b);
  const dark = matte(0x8f2b28);
  const seat = mesh(new THREE.BoxGeometry(SOFA.hx * 2 - 0.3, 0.38, SOFA.hz * 2), fabric);
  seat.position.y = -0.2;
  const back = mesh(new THREE.BoxGeometry(SOFA.hx * 2 - 0.3, 0.7, 0.24), dark);
  back.position.set(0, 0.05, -SOFA.hz + 0.12);
  g.add(seat, back);
  for (const s of [-1, 1]) {
    // the arms: the ends you grab
    const arm = mesh(new THREE.BoxGeometry(0.3, 0.62, SOFA.hz * 2), dark);
    arm.position.set(s * (SOFA.hx - 0.15), -0.1, 0);
    const cushion = mesh(new THREE.BoxGeometry(SOFA.hx - 0.2, 0.14, SOFA.hz * 2 - 0.3), matte(0xd85a4f));
    cushion.position.set(s * (SOFA.hx / 2 - 0.08), 0.03, 0.08);
    g.add(arm, cushion);
    for (const z of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 8), matte(0x3a2a20), false);
      leg.position.set(s * (SOFA.hx - 0.15), -0.45, z * (SOFA.hz - 0.1));
      g.add(leg);
    }
  }
  return g;
}

/**
 * Tug of War: one big heavy sofa in the middle, a truck at each end. Grab an
 * end and drag it into your own truck; hold it there a moment to score. Let
 * go and they'll run off with it. When the clock runs out, whoever has it on
 * their side takes the round.
 */
export class Tug extends PartyGame {
  readonly title = 'Tug of War';
  private sofa: Prop;
  private bays: Bay[];
  private inT = [0, 0];
  private coloured = false;

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    this.sofa = prop(this.sim, this.root, RAPIER.ColliderDesc.cuboid(SOFA.hx, SOFA.hy, SOFA.hz).setMass(SOFA.mass), sofaLook(), parkSpot(0), {
      material: 'soft',
      friction: 0.55,
      damping: 0.4,
      angDamping: 1.2,
    });
    this.bays = [new Bay(this.root, -TUG_BAY, -1), new Bay(this.root, TUG_BAY, 1)];
  }

  protected setup() {
    spawnProp(this.sofa, _v.set(0, 0.5, 0));
    this.inT = [0, 0];
    this.place(0, -SOFA.hx - 1.1, 0, 0, Math.PI / 2);
    this.place(1, SOFA.hx + 1.1, 0, 0, -Math.PI / 2);
  }

  protected step(dt: number) {
    const c = this.sofa.body.translation();
    if (c.y < -4) spawnProp(this.sofa, _v.set(0, 1.2, 0));
    for (let i = 0; i < 2; i++) {
      this.inT[i] = this.bays[i].contains(c.x, c.z, c.y) ? this.inT[i] + dt : 0;
      if (this.inT[i] >= IN_FOR) return i;
    }
    return ON;
  }

  protected timeUp() {
    const x = this.sofa.body.translation().x;
    return x < -1.5 ? 0 : x > 1.5 ? 1 : -1;
  }
  protected roundText(w: number) {
    return w < 0 ? 'STALEMATE!' : this.clock <= 0 ? `TIME! ${this.name(w)}'S SIDE` : `LOADED! ${this.name(w)} SCORES`;
  }

  line() {
    if (this.phase !== 'play') return 'Grab an end, pull it into your truck.';
    const i = this.inT[0] > 0 ? 0 : this.inT[1] > 0 ? 1 : -1;
    if (i >= 0) return `🛋️ in ${this.name(i)}'s truck… ${Math.round((this.inT[i] / IN_FOR) * 100)}%`;
    const x = this.sofa.body.translation().x;
    return Math.abs(x) < 1.5 ? 'Pull!' : `It's on ${this.name(x < 0 ? 0 : 1)}'s side`;
  }

  focus() {
    return this.sofa.live ? [this.sim.physics.interpolatedPosition(this.sofa.body, new THREE.Vector3())] : [];
  }

  protected netExtra() {
    return [this.inT[0], this.inT[1]];
  }
  protected applyExtra(v: number[]) {
    this.inT = [v[0] ?? 0, v[1] ?? 0];
  }

  protected looks() {
    showLive([this.sofa]);
    if (!this.coloured && this.players.length === 2) {
      this.coloured = true;
      this.bays.forEach((b, i) => b.colour(this.players[i].color));
    }
  }

  private wiggle = 0;
  private retry = 0;
  protected cpuMove(me: Player, _foe: Player, dt: number) {
    const body = this.sofa.body;
    const c = body.translation();
    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const ax = _v.copy(X).applyQuaternion(_q);
    ax.y = 0;
    ax.normalize();
    // the end nearer our truck (the computer's is on the +x side)
    const s = ax.x >= 0 ? 1 : -1;
    const ex = c.x + ax.x * s * SOFA.hx;
    const ez = c.z + ax.z * s * SOFA.hx;
    const holding = holder(this.players, body);
    const mine = holding === 1 || holding === 2;
    // a hand on something else (the floor): let go, and try again in a moment
    if (me.hands.some((h) => h.grip && h.grip.body?.handle !== body.handle)) this.retry = 0.4;
    if (this.retry > 0) {
      this.retry -= dt;
      me.intent.grab = false;
      this.steer(me, ex + ax.x * s * 1.2, ez + ax.z * s * 1.2, 0.5);
      return;
    }
    if (!mine) {
      // get to that end (from outside it), and grab
      const tx = ex + ax.x * s * 0.55;
      const tz = ez + ax.z * s * 0.55;
      const d = Math.hypot(me.bodyPos.x - ex, me.bodyPos.z - ez);
      if (d > 1.2) this.steer(me, tx, tz);
      else this.steer(me, ex, ez, 0.4);
      me.intent.grab = d < 1.1;
      return;
    }
    // got it: haul it to the truck, yanking from side to side now and then
    me.intent.grab = true;
    this.wiggle += dt * (1.5 + 2 * this.skill);
    const bay = this.bays[1];
    const yank = holding === 2 && this.skill > 0.7 ? Math.sin(this.wiggle) * 1.6 : 0;
    // round to the open back first (not into the side of the truck)
    if (me.bodyPos.x < bay.minX + 0.4 && Math.abs(me.bodyPos.z) > 0.9) return this.steer(me, bay.minX - 1.2, 0);
    this.steer(me, bay.maxX - 1, yank);
  }
}
