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

  private plan = { x: 0, z: 0, at: -9, charge: false };
  protected cpuMove(me: Player, foe: Player) {
    const now = this.sim.time();
    const R = this.radius();
    const m = me.bodyPos;
    const f = foe.bodyPos;
    const mr = Math.hypot(m.x, m.z);
    // too near the edge: back to the middle
    if (mr > R - 1.1) return this.steer(me, 0, 0);
    // think again every so often (quicker when it's better)
    if (now - this.plan.at > 0.45 - 0.3 * this.skill) {
      this.plan.at = now;
      const fr = Math.hypot(f.x, f.z);
      const ux = fr > 0.3 ? f.x / fr : -m.x / Math.max(0.3, mr);
      const uz = fr > 0.3 ? f.z / fr : -m.z / Math.max(0.3, mr);
      // get on the middle side of them, then charge them outward
      const bx = f.x - ux * 1.3;
      const bz = f.z - uz * 1.3;
      const behind = Math.hypot(m.x - bx, m.z - bz) < 0.8 || (mr < fr && Math.hypot(m.x - f.x, m.z - f.z) < 1.8);
      this.plan.charge = behind;
      if (behind) {
        this.plan.x = f.x + ux * 2.5;
        this.plan.z = f.z + uz * 2.5;
      } else {
        // round the side, not through them
        const sx = -uz;
        const sz = ux;
        const side = (m.x - f.x) * sx + (m.z - f.z) * sz >= 0 ? 1 : -1;
        this.plan.x = bx + sx * side * 0.9;
        this.plan.z = bz + sz * side * 0.9;
      }
    }
    // (never plan past the edge, unless it's to run them off it)
    const pr = Math.hypot(this.plan.x, this.plan.z);
    const lim = this.plan.charge ? R + 1 : R - 0.6;
    const k = pr > lim ? lim / pr : 1;
    this.steer(me, this.plan.x * k, this.plan.z * k);
  }
}
