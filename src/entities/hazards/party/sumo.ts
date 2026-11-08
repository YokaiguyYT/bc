import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { RigidBody } from '../../../physics/rapier';
import type { Player } from '../../Player';
import { matte } from '../../../render/materials';
import { ON, PartyGame } from './base';
import { mesh, platform } from './kit';

const R_OUT = 5.2;
const R_IN = 3.1;
/** Seconds into a round when the outer ring sinks away. */
const SHRINK_AT = 20;

/**
 * Belly-Bump Sumo: a round mat over the water. Run into the other mover to
 * shove them, grab them and drag them; first one off loses the round. After
 * a while the outer ring sinks and there's a lot less room.
 */
export class Sumo extends PartyGame {
  readonly title = 'Belly-Bump Sumo';
  private outer: RigidBody;
  private outerLook: THREE.Group;
  private edge: THREE.MeshStandardMaterial;
  /** 0 up .. 1 sunk. */
  private sink = 0;
  private t = 0;
  private warned = false;

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    const sim = this.sim;
    // the middle (stays), and the outer ring (sinks)
    const clay = new THREE.Group();
    const top = mesh(new THREE.CylinderGeometry(R_IN, R_IN + 0.1, 0.6, 48), matte(0xd9b98a));
    clay.add(top);
    const rope = mesh(new THREE.TorusGeometry(R_IN - 0.35, 0.07, 8, 64).rotateX(Math.PI / 2), matte(0xf4ecd8), false);
    rope.position.y = 0.31;
    clay.add(rope);
    // the two lines you start behind
    for (const x of [-1, 1]) {
      const l = mesh(new THREE.BoxGeometry(0.12, 0.02, 0.9), matte(0xffffff), false);
      l.position.set(x * 0.9, 0.31, 0);
      clay.add(l);
    }
    platform(sim, this.root, new THREE.Vector3(0, -0.3, 0), RAPIER.ColliderDesc.cylinder(0.3, R_IN), clay, { friction: 0.95 });
    this.outerLook = new THREE.Group();
    const ring = mesh(new THREE.CylinderGeometry(R_OUT, R_OUT + 0.15, 0.58, 64), matte(0xf2c75c));
    this.outerLook.add(ring);
    this.edge = new THREE.MeshStandardMaterial({ color: 0xff5a4f, emissive: 0x000000, roughness: 0.6 });
    const band = mesh(new THREE.TorusGeometry(R_OUT - 0.25, 0.12, 8, 64).rotateX(Math.PI / 2), this.edge, false);
    band.position.y = 0.3;
    this.outerLook.add(band);
    this.outer = platform(sim, this.root, new THREE.Vector3(0, -0.31, 0), RAPIER.ColliderDesc.cylinder(0.29, R_OUT), this.outerLook, { moving: true, friction: 0.95 }).body;
  }

  private radius() {
    return this.sink > 0.5 ? R_IN : R_OUT;
  }

  protected setup() {
    this.sink = 0;
    this.t = 0;
    this.warned = false;
    this.place(0, -2.2, 0, 0, Math.PI / 2);
    this.place(1, 2.2, 0, 0, -Math.PI / 2);
  }

  private out(p: Player) {
    const r = Math.hypot(p.bodyPos.x, p.bodyPos.z);
    return p.bodyPos.y < -0.9 || (r > this.radius() + 0.5 && p.bodyPos.y < 0.2);
  }

  protected step(dt: number) {
    this.t += dt;
    if (this.t > SHRINK_AT - 3 && !this.warned) {
      this.warned = true;
      this.say('THE RING IS SHRINKING!', true);
    }
    if (this.t > SHRINK_AT) this.sink = Math.min(1, this.sink + dt / 1.6);
    this.moveRing();
    const [a, b] = this.players;
    const oa = this.out(a);
    const ob = this.out(b);
    if (oa && ob) return -1;
    if (oa) return 1;
    if (ob) return 0;
    return ON;
  }

  protected idle() {
    // between rounds the ring comes back up (the next round's setup puts it there)
    this.moveRing();
  }

  private moveRing() {
    const y = -0.31 - this.sink * this.sink * 5;
    this.outer.setNextKinematicTranslation({ x: 0, y, z: 0 });
  }

  line() {
    return this.phase === 'play' && this.sink === 0 && this.t > SHRINK_AT - 5 ? '⚠️ the blue ring sinks soon!' : 'Shove them off the ring!';
  }

  protected netExtra() {
    return [this.sink, this.t];
  }
  protected applyExtra(v: number[]) {
    this.sink = v[0] ?? 0;
    this.t = v[1] ?? 0;
  }

  protected looks(_dt: number, time: number) {
    // the edge flashes before the ring goes
    const warn = this.sink === 0 && this.t > SHRINK_AT - 3 && this.phase === 'play';
    this.edge.emissive.setHex(warn && Math.sin(time * 14) > 0 ? 0xff2200 : 0x000000);
  }

  /** The computer: lining up a run at them (from the middle side), or charging (for a moment, whatever happens). */
  private plan = { x: 0, z: 0, until: 0, charge: false };
  protected cpuMove(me: Player, foe: Player) {
    const now = this.sim.time();
    const R = this.radius();
    const m = me.bodyPos;
    const f = foe.bodyPos;
    const mr = Math.hypot(m.x, m.z);
    const fr = Math.hypot(f.x, f.z);
    // too near the edge (and not mid-charge at someone nearer it): back to the middle
    if (mr > R - 1 && !(this.plan.charge && fr > mr && mr < R - 0.5)) {
      this.plan.charge = false;
      return this.steer(me, 0, 0);
    }
    if (this.plan.charge && now < this.plan.until) return this.steer(me, this.plan.x, this.plan.z);
    this.plan.charge = false;
    // which way is "off" for them: out from the middle (or just away from us if they're in the middle)
    let ux = fr > 0.6 ? f.x / fr : f.x - m.x;
    let uz = fr > 0.6 ? f.z / fr : f.z - m.z;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    // the run-up spot: on the middle side of them, a couple of metres back
    const back = 1.6 + 0.8 * this.skill;
    let bx = f.x - ux * back;
    let bz = f.z - uz * back;
    const br = Math.hypot(bx, bz);
    if (br > R - 1.2) {
      bx *= (R - 1.2) / br;
      bz *= (R - 1.2) / br;
    }
    const there = Math.hypot(m.x - bx, m.z - bz) < 0.7 + 0.4 * (1 - this.skill);
    const lined = ((f.x - m.x) * ux + (f.z - m.z) * uz) / (Math.hypot(f.x - m.x, f.z - m.z) || 1) > 0.8;
    if (there || (lined && Math.hypot(f.x - m.x, f.z - m.z) < back + 0.6)) {
      // charge: right through them and on, for a second
      this.plan.charge = true;
      this.plan.until = now + 0.9 + 0.3 * this.skill;
      this.plan.x = f.x + ux * 3;
      this.plan.z = f.z + uz * 3;
      return this.steer(me, this.plan.x, this.plan.z);
    }
    // to the run-up spot, round them rather than through them
    const sx = -uz;
    const sz = ux;
    const side = (m.x - f.x) * sx + (m.z - f.z) * sz >= 0 ? 1 : -1;
    const wrongSide = (m.x - f.x) * ux + (m.z - f.z) * uz > -0.3;
    this.steer(me, bx + (wrongSide ? sx * side * 1.4 : 0), bz + (wrongSide ? sz * side * 1.4 : 0));
  }
}
