import * as THREE from 'three';
import type { Player } from '../../Player';
import { glossy, unlit } from '../../../render/materials';
import { ON, PartyGame } from './base';
import { mesh } from './kit';

/** The arena's half-size (inside the walls), and the pillars to dodge round. */
export const POTATO_HALF = 7.6;
export const POTATO_PILLARS: [number, number][] = [
  [-3.6, -3.4],
  [3.6, -3.4],
  [-3.6, 3.4],
  [3.6, 3.4],
];
const PILLAR_R = 0.7;

const _v = new THREE.Vector3();

/**
 * Hot Potato: tag, with a bomb on a fuse. Whoever has it passes it on by
 * touching the other mover; when the fuse runs out, it goes off on whoever's
 * holding it, and the other one wins the round. Nobody knows how long the fuse
 * is, but it ticks faster near the end.
 */
export class Potato extends PartyGame {
  readonly title = 'Hot Potato';
  /** Who has the bomb. */
  private holder = 0;
  /** Seconds of fuse left, and how long it was. */
  private fuse = 20;
  private fuseLen = 20;
  private passAt = -9;
  private bomb = new THREE.Group();
  private bombMat: THREE.MeshStandardMaterial;
  private spark: THREE.Mesh;
  private boomed = false;

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    // (its own material: it glows, and the shared ones mustn't)
    this.bombMat = new THREE.MeshStandardMaterial({ color: 0x24242c, roughness: 0.3, metalness: 0.2, emissive: 0xff2200, emissiveIntensity: 0 });
    this.bomb.add(mesh(new THREE.SphereGeometry(0.3, 20, 14), this.bombMat));
    const cap = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 12), glossy(0x8a8a96, 0.3, 0.6), false);
    cap.position.y = 0.3;
    const fuse = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), glossy(0xc9a46a, 0.8), false);
    fuse.position.set(0.04, 0.44, 0);
    fuse.rotation.z = -0.4;
    this.spark = mesh(new THREE.SphereGeometry(0.07, 8, 6), unlit(0xffd84d), false);
    this.spark.position.set(0.1, 0.56, 0);
    this.bomb.add(cap, fuse, this.spark);
    this.bomb.visible = false;
    this.root.add(this.bomb);
  }

  protected setup() {
    this.place(0, -4.5, 0, 0, Math.PI / 2);
    this.place(1, 4.5, 0, 0, -Math.PI / 2);
    // the last round's winner starts with it (the first round: whoever)
    this.holder = this.winner >= 0 ? this.winner : this.round === 1 ? Math.floor(Math.random() * 2) : 1 - this.holder;
    this.fuseLen = this.fuse = 14 + Math.random() * 12;
    this.passAt = -9;
    this.boomed = false;
    for (const p of this.players) p.speedScale = 1;
  }

  line() {
    if (this.phase === 'ready') return `💣 ${this.name(this.holder)} starts with the bomb`;
    if (this.phase !== 'play') return '';
    return this.holder === 0 ? '💣 P1 has it! Tag them!' : `💣 ${this.name(1)} has it! Run!`;
  }

  protected step(dt: number, now: number) {
    const ps = this.players;
    const h = ps[this.holder];
    const o = ps[1 - this.holder];
    // whoever has it is a touch quicker (or nobody would ever get tagged)
    h.speedScale = 1.08;
    o.speedScale = 1;
    // a tag
    const d = Math.hypot(h.bodyPos.x - o.bodyPos.x, h.bodyPos.z - o.bodyPos.z);
    if (d < 1.05 && Math.abs(h.bodyPos.y - o.bodyPos.y) < 1.3 && now - this.passAt > 0.9) {
      this.holder = 1 - this.holder;
      this.passAt = now;
      this.say('TAG!', true, this.holder);
      this.sim.fx?.burst('star', _v.copy(o.bodyPos).setY(o.bodyPos.y + 1.2), { count: 10, speed: 2.5, up: 2.5, size: 0.1, life: 0.9, gravity: 6, colors: [0xffd84d, 0xff7a3d, 0xffffff] });
    }
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.boom(ps[this.holder]);
      return 1 - this.holder;
    }
    return ON;
  }

  private boom(p: Player) {
    this.boomed = true;
    const a = Math.random() * Math.PI * 2;
    p.applyBlast(_v.set(Math.cos(a) * 4, 7, Math.sin(a) * 4).multiplyScalar(p.totalMass));
    p.knock(14, 1.4);
    const at = p.bodyPos.clone().setY(p.bodyPos.y + 0.6);
    this.sim.fx?.burst('dust', at, { count: 26, speed: 5, up: 3, size: 0.32, sizeVar: 0.5, life: 1.2, gravity: -0.5, drag: 2.5, colors: [0x55555f, 0x8a8a96, 0x3a3a44] });
    this.sim.fx?.burst('star', at, { count: 22, speed: 6, up: 4, size: 0.14, life: 0.9, gravity: 5, colors: [0xffd84d, 0xff7a1a, 0xff3b2f] });
    this.sim.shake?.(0.7);
    this.sim.events.emit('impact', { pos: at, speed: 14, material: 'metal' });
  }

  protected roundText(w: number) {
    return w < 0 ? 'DRAW!' : `BOOM! ${this.name(w)} WINS THE ROUND`;
  }

  protected netExtra() {
    return [this.holder, this.fuse, this.fuseLen, this.boomed ? 1 : 0];
  }
  protected applyExtra(v: number[]) {
    this.holder = v[0] ?? 0;
    this.fuse = v[1] ?? 20;
    this.fuseLen = v[2] ?? 20;
    this.boomed = v[3] === 1;
  }

  protected looks(_dt: number, time: number) {
    const p = this.players[this.holder];
    const show = !!p && !this.boomed && this.phase !== 'over';
    this.bomb.visible = show;
    if (!show) return;
    // over the holder's head, bobbing; it blinks faster as the fuse burns down
    this.sim.physics.interpolatedPosition(p.parts.head, _v);
    this.bomb.position.set(_v.x, _v.y + 0.95 + Math.sin(time * 6) * 0.05, _v.z);
    this.bomb.rotation.y = time * 1.5;
    const left = this.phase === 'play' ? this.fuse / this.fuseLen : 1;
    const rate = 2 + (1 - left) * 16;
    this.bombMat.emissiveIntensity = Math.sin(time * rate) > 0.2 ? 0.25 + (1 - left) * 1.2 : 0;
    this.spark.scale.setScalar(0.8 + Math.random() * 0.7);
    if (Math.random() < 0.3) this.sim.fx?.burst('star', this.spark.getWorldPosition(_v), { count: 1, speed: 0.8, up: 1, size: 0.04, life: 0.35, gravity: 2, colors: [0xffd84d, 0xff9a3d] });
  }

  dispose() {
    for (const p of this.players) p.speedScale = 1;
    super.dispose();
  }

  private plan = { x: 0, z: 0, at: -9 };
  protected cpuMove(me: Player, foe: Player) {
    const now = this.sim.time();
    if (now - this.plan.at < 0.3 - 0.2 * this.skill) return this.steer(me, this.plan.x, this.plan.z);
    this.plan.at = now;
    const m = me.bodyPos;
    const f = foe.bodyPos;
    if (this.holder === 1) {
      // got it: chase them down (aim a little ahead of where they're going)
      const lead = 0.25 + 0.35 * this.skill;
      this.plan.x = f.x + foe.bodyVel.x * lead;
      this.plan.z = f.z + foe.bodyVel.z * lead;
    } else {
      // run: away from them, but not into a corner or a pillar
      let ax = m.x - f.x;
      let az = m.z - f.z;
      const d = Math.hypot(ax, az) || 1;
      ax /= d;
      az /= d;
      // far off: keep on the move, circling round the middle (a sitting duck is easy to catch)
      if (d > 5.5) {
        const r = Math.max(2.5, Math.min(5, Math.hypot(m.x, m.z)));
        const ang = Math.atan2(m.z, m.x) + 0.7;
        this.plan.x = Math.cos(ang) * r;
        this.plan.z = Math.sin(ang) * r;
        return this.steer(me, this.plan.x, this.plan.z, 0.7);
      }
      // close: dodge sideways round them rather than straight back
      if (d < 3.2) {
        const s = ax * -m.z + az * m.x >= 0 ? 1 : -1;
        const tx = -az * s;
        const tz = ax * s;
        ax += tx * 0.9;
        az += tz * 0.9;
      }
      const wall = (v: number) => (Math.abs(v) > POTATO_HALF - 3 ? -Math.sign(v) * (Math.abs(v) - (POTATO_HALF - 3)) * 0.8 : 0);
      ax += wall(m.x);
      az += wall(m.z);
      for (const [px, pz] of POTATO_PILLARS) {
        const dx = m.x - px;
        const dz = m.z - pz;
        const dd = Math.hypot(dx, dz);
        if (dd < PILLAR_R + 1.3) {
          ax += (dx / dd) * 0.8;
          az += (dz / dd) * 0.8;
        }
      }
      this.plan.x = m.x + ax * 3;
      this.plan.z = m.z + az * 3;
    }
    this.steer(me, this.plan.x, this.plan.z);
  }
}
