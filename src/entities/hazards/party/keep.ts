import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { Player } from '../../Player';
import { glossy, unlit } from '../../../render/materials';
import { ON, PartyGame } from './base';
import { holder, mesh, parkSpot, prop, spawnProp, type Prop } from './kit';
import { num } from '../common';

/** The yard's half-size (inside the walls), and the stacks of crates to dodge round: [x, z, half-width, half-depth, height]. */
export const KEEP_HX = 8.5;
export const KEEP_HZ = 6.5;
export const KEEP_BLOCKS: [number, number, number, number, number][] = [
  [-4.2, -3, 0.8, 0.8, 1.3],
  [4.2, 3, 0.8, 0.8, 1.3],
  [-3.6, 3.4, 1.1, 0.6, 1.3],
  [3.6, -3.4, 1.1, 0.6, 1.3],
  // the pallet in the middle that the parcel starts on
  [0, 0, 0.6, 0.6, 0.45],
];
/** Where the parcel starts each round. */
const START = new THREE.Vector3(0, 0.75, 0);

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * Keep-Away: one golden parcel. Every second it's in your hands is a second on
 * your clock; first to enough seconds wins the round. The one without it runs
 * them down and grabs them to take it: the parcel jumps to their hands and the
 * one who lost it is shoved off with butterfingers for a moment. Carrying it
 * makes you a bit slower, so nobody keeps it long without some footwork.
 */
export class KeepAway extends PartyGame {
  readonly title = 'Keep-Away';
  private parcel: Prop;
  private gold: THREE.MeshStandardMaterial;
  private arrow: THREE.Mesh;
  private arrowMat: THREE.MeshBasicMaterial;
  private ring: THREE.Mesh;
  /** Seconds on each clock, and how many it takes. */
  private secs: [number, number] = [0, 0];
  private need: number;
  /** Who has it (-1 nobody). */
  private has = -1;
  /** How long the other one has been hanging on to whoever has it. */
  private clutch = 0;
  /** Butterfingers: can't take hold of it for this long (s). */
  private butter = [0, 0];
  private stolenAt = -9;
  /** How long nobody's hands have been on it (s). */
  private loose = 0;
  /** How long both have had their hands on it with it nobody's (s). */
  private both = 0;

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    this.need = Math.max(5, num(this.o.params, 'need', 20));
    // (its own material: it glows, and the shared ones mustn't)
    this.gold = new THREE.MeshStandardMaterial({ color: 0xffc928, roughness: 0.3, metalness: 0.55, emissive: 0xff9a00, emissiveIntensity: 0.25 });
    const box = new THREE.Group();
    box.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), this.gold));
    const ribbon = glossy(0xe8413a, 0.4);
    box.add(mesh(new THREE.BoxGeometry(0.52, 0.52, 0.12), ribbon, false), mesh(new THREE.BoxGeometry(0.12, 0.52, 0.52), ribbon, false));
    const bow = mesh(new THREE.TorusGeometry(0.09, 0.035, 6, 12), ribbon, false);
    bow.position.y = 0.3;
    box.add(bow);
    this.parcel = prop(this.sim, this.root, RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25).setMass(3).setRestitution(0.2), box, parkSpot(0), { material: 'cardboard', damping: 0.4, angDamping: 1.2 });
    // an arrow over whoever has it, and a ring round it when nobody does
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.arrow = mesh(new THREE.ConeGeometry(0.2, 0.36, 4), this.arrowMat, false);
    this.arrow.rotation.x = Math.PI;
    this.arrow.visible = false;
    this.ring = mesh(new THREE.RingGeometry(0.55, 0.7, 32).rotateX(-Math.PI / 2), unlit(0xffe14a, { transparent: true, opacity: 0.8 }), false);
    this.ring.visible = false;
    this.root.add(this.arrow, this.ring);
  }

  /** Hands go for the parcel and nothing else here: a mitten full of the other mover's overalls is no use to anybody. */
  private handsOff(off: boolean) {
    for (const p of this.players)
      for (const b of Object.values(p.parts))
        for (let i = 0; i < b.numColliders(); i++) {
          const info = this.sim.physics.info(b.collider(i));
          if (info) info.grabbable = !off;
        }
  }

  protected setup() {
    this.place(0, -5.5, 0, 0, Math.PI / 2);
    this.place(1, 5.5, 0, 0, -Math.PI / 2);
    this.handsOff(true);
    for (const p of this.players) {
      p.releaseAll();
      p.speedScale = 1;
    }
    // on the pallet in the middle, for whoever gets there first
    spawnProp(this.parcel, START);
    this.secs = [0, 0];
    this.has = -1;
    this.clutch = 0;
    this.loose = 0;
    this.butter = [0, 0];
  }

  line() {
    if (this.phase !== 'play') return `First to ${this.need} seconds holding the parcel`;
    if (this.has < 0) return '🎁 Grab the golden parcel!';
    return this.has === 0 ? `🎁 P1 has it! ${this.name(1)}: grab them to take it` : `🎁 ${this.name(1)} has it! P1: grab them to take it`;
  }
  showTally() {
    return `${this.tally[0]}s|${this.tally[1]}s`;
  }
  finalLine() {
    return `🎁 ${this.tally[0]}s vs ${this.tally[1]}s with the parcel`;
  }
  protected roundText(w: number) {
    return w < 0 ? 'DRAW!' : `${this.name(w)} KEPT IT!`;
  }
  focus() {
    return this.parcel.live ? [this.sim.physics.interpolatedPosition(this.parcel.body, _w).clone()] : [];
  }

  protected step(dt: number, now: number) {
    const ps = this.players;
    const body = this.parcel.body;
    const at = body.translation();
    // dropped out of the yard somehow: back to the middle
    if (at.y < -2 || Math.abs(at.x) > KEEP_HX + 1.5 || Math.abs(at.z) > KEEP_HZ + 1.5) {
      for (const p of ps) p.releaseAll();
      spawnProp(this.parcel, START);
    }
    for (let i = 0; i < 2; i++) {
      this.butter[i] = Math.max(0, this.butter[i] - dt);
      // butterfingers: it won't stay in their hands
      if (this.butter[i] > 0 && ps[i].hands.some((h) => h.grip?.body?.handle === body.handle)) ps[i].releaseAll();
    }
    const h = holder(ps, body);
    if (h === 0 || h === 1) {
      this.has = h;
      this.loose = 0;
      this.both = 0;
    } else if (h === 2) {
      this.loose = 0;
      // both got to it at once and it was nobody's: a moment's tussle, and one of them comes away with it
      if (this.has < 0) {
        this.both += dt;
        if (this.both > 0.35) {
          this.both = 0;
          const w = Math.random() < 0.5 ? 0 : 1;
          ps[1 - w].releaseAll();
          this.butter[1 - w] = 0.9;
          this.has = w;
          this.say('MINE!', true, w);
        }
      }
    } else {
      // nobody's hands on it this instant: it's still theirs for a moment if it's right by them and they're
      // holding grab (just taken, hands on their way to it); otherwise it's anybody's
      this.loose += dt;
      const o = this.has >= 0 ? ps[this.has] : null;
      if (!o || this.loose > 0.7 || !o.intent.grab || o.state !== 'active' || Math.hypot(at.x - o.bodyPos.x, at.z - o.bodyPos.z) > 1.3) this.has = -1;
    }
    // (both hands on it at once: it stays whose it was; nobody's, the clock waits)
    if (this.has >= 0) {
      const me = ps[this.has];
      const foe = ps[1 - this.has];
      const before = Math.floor(this.secs[this.has]);
      this.secs[this.has] += dt;
      const after = Math.floor(this.secs[this.has]);
      if (after !== before) this.sim.events.emit('tick', { pos: me.bodyPos.clone(), tock: after % 2 === 1 });
      // the other one grabs hold of them: a moment of that and it's theirs
      const d = Math.hypot(me.bodyPos.x - foe.bodyPos.x, me.bodyPos.z - foe.bodyPos.z);
      // (a parcel in your arms slows you by a quarter: enough that you can be run down, and the tumble
      //  the one who lost it takes is the head start)
      me.speedScale = 1;
      foe.speedScale = 1;
      const reaching = foe.intent.grab && foe.state === 'active' && this.butter[1 - this.has] <= 0 && d < 1.15 && Math.abs(me.bodyPos.y - foe.bodyPos.y) < 1.2;
      this.clutch = reaching ? this.clutch + dt : Math.max(0, this.clutch - dt * 2);
      if (this.clutch > 0.3 && now - this.stolenAt > 0.8) this.steal(me, foe, now);
    } else {
      this.clutch = 0;
      for (const p of ps) p.speedScale = 1;
    }
    this.tally = [Math.floor(this.secs[0]), Math.floor(this.secs[1])];
    if (this.secs[0] >= this.need) return 0;
    if (this.secs[1] >= this.need) return 1;
    return ON;
  }

  /** It jumps from `from`'s hands to `to`'s; `from` is shoved off and can't hold it for a moment. */
  private steal(from: Player, to: Player, now: number) {
    const w = to.index;
    this.stolenAt = now;
    this.clutch = 0;
    this.butter[from.index] = 1.2;
    this.loose = 0;
    from.releaseAll();
    to.releaseAll();
    // into the taker's arms: just in front of their chest, going their way
    const fx = Math.sin(to.facingYaw);
    const fz = Math.cos(to.facingYaw);
    const b = this.parcel.body;
    b.setTranslation({ x: to.bodyPos.x + fx * 0.55, y: to.bodyPos.y + 0.15, z: to.bodyPos.z + fz * 0.55 }, true);
    b.setLinvel({ x: to.bodyVel.x, y: 0.5, z: to.bodyVel.z }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    let ax = from.bodyPos.x - to.bodyPos.x;
    let az = from.bodyPos.z - to.bodyPos.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l;
    az /= l;
    // the one who lost it goes over: that's the taker's head start
    from.applyBlast(_v.set(ax * 4.6, 2.6, az * 4.6).multiplyScalar(from.totalMass));
    from.knock(8, 0.55);
    this.has = w;
    this.say('STOLEN!', true, w);
    this.sim.shake?.(0.2);
    this.sim.fx?.burst('star', _v.copy(to.bodyPos).setY(to.bodyPos.y + 0.9), { count: 12, speed: 3, up: 2.5, size: 0.1, life: 0.8, gravity: 6, colors: [0xffe14a, 0xffffff, 0xff9a3d] });
  }

  protected netExtra() {
    return [this.has, this.secs[0], this.secs[1], this.butter[0], this.butter[1]];
  }
  protected applyExtra(v: number[]) {
    this.has = v[0] ?? -1;
    this.secs = [v[1] ?? 0, v[2] ?? 0];
    this.butter = [v[3] ?? 0, v[4] ?? 0];
  }

  protected looks(_dt: number, time: number) {
    const live = this.parcel.body.translation().y > -150;
    this.parcel.obj.visible = live;
    const p = this.sim.physics.interpolatedPosition(this.parcel.body, _w);
    const who = this.has >= 0 ? this.players[this.has] : null;
    // it glows harder the nearer its holder is to winning
    const near = who ? Math.min(1, this.secs[this.has] / this.need) : 0;
    this.gold.emissiveIntensity = 0.2 + near * 0.5 + (who ? Math.max(0, Math.sin(time * (4 + near * 10))) * 0.25 : 0);
    this.arrow.visible = !!who && live && this.phase !== 'over';
    if (who) {
      this.sim.physics.interpolatedPosition(who.parts.head, _v);
      this.arrow.position.set(_v.x, _v.y + 0.85 + Math.sin(time * 5) * 0.06, _v.z);
      this.arrow.rotation.y = time * 2;
      this.arrowMat.color.setHex(who.color);
    }
    this.ring.visible = !who && live && p.y < 1.2 && this.phase === 'play';
    if (this.ring.visible) {
      this.ring.position.set(p.x, 0.03, p.z);
      this.ring.scale.setScalar(1 + Math.sin(time * 6) * 0.12);
    }
  }

  dispose() {
    this.handsOff(false);
    for (const p of this.players) p.speedScale = 1;
    super.dispose();
  }

  // ---------------------------------------------------------------- the computer

  private plan = { x: 0, z: 0, at: -9 };
  private retry = 0;
  private stuck = 0;
  protected cpuMove(me: Player, foe: Player, dt: number) {
    const now = this.sim.time();
    const m = me.bodyPos;
    const f = foe.bodyPos;
    const body = this.parcel.body;
    const mine = me.hands.some((h) => h.grip?.body?.handle === body.handle);
    // hands on something that isn't the parcel (a crate, the other mover): let go and try again
    if (!mine && me.hands.some((h) => h.grip) && this.has < 0) {
      this.stuck += dt;
      if (this.stuck > 0.5) {
        this.stuck = 0;
        this.retry = 0.35;
      }
    } else this.stuck = 0;
    if (this.retry > 0) {
      this.retry -= dt;
      me.intent.grab = false;
      return this.steer(me, m.x + (m.x - f.x), m.z + (m.z - f.z), 0.4);
    }
    if (this.has === 1) {
      // got it: keep hold and keep away
      me.intent.grab = true;
      if (now - this.plan.at > 0.25 - 0.15 * this.skill) {
        this.plan.at = now;
        this.flee(m, f);
      }
      return this.steer(me, this.plan.x, this.plan.z);
    }
    if (this.has === 0) {
      // they have it: run them down (a little ahead of where they're going) and grab hold
      const lead = 0.2 + 0.3 * this.skill;
      const d = Math.hypot(f.x - m.x, f.z - m.z);
      const [x, z] = this.wayRound(m, f.x + foe.bodyVel.x * lead, f.z + foe.bodyVel.z * lead);
      this.steer(me, x, z);
      me.intent.grab = d < 1.3 && this.butter[1] <= 0;
      return;
    }
    // nobody has it: go and get it
    const p = body.translation();
    const d = Math.hypot(p.x - m.x, p.z - m.z);
    const [x, z] = d < 1.6 ? [p.x, p.z] : this.wayRound(m, p.x, p.z);
    this.steer(me, x, z, d < 1.1 ? 0.5 : 1);
    me.intent.grab = d < 1.25 && this.butter[1] <= 0;
  }

  /** The way to (tx, tz): straight there, or to the corner of the stack that's in the way. */
  private wayRound(m: THREE.Vector3, tx: number, tz: number): [number, number] {
    const PAD = 0.6;
    for (const [bx, bz, hw, hd] of KEEP_BLOCKS) {
      const x0 = bx - hw - PAD;
      const x1 = bx + hw + PAD;
      const z0 = bz - hd - PAD;
      const z1 = bz + hd + PAD;
      // (standing inside the padding already: just walk; the stack itself will slide us round)
      if (m.x > x0 && m.x < x1 && m.z > z0 && m.z < z1) continue;
      if (!crosses(m.x, m.z, tx, tz, x0, x1, z0, z1)) continue;
      // the corner that makes the shorter way round (a corner we can walk straight to)
      let best: [number, number] | null = null;
      let bd = Infinity;
      for (const cx of [x0 - 0.15, x1 + 0.15])
        for (const cz of [z0 - 0.15, z1 + 0.15]) {
          if (Math.abs(cx) > KEEP_HX - 0.4 || Math.abs(cz) > KEEP_HZ - 0.4) continue;
          // (the corner we're standing at is not the way on)
          if (Math.hypot(cx - m.x, cz - m.z) < 0.5) continue;
          if (crosses(m.x, m.z, cx, cz, x0 + 0.05, x1 - 0.05, z0 + 0.05, z1 - 0.05)) continue;
          const dd = Math.hypot(cx - m.x, cz - m.z) + Math.hypot(tx - cx, tz - cz);
          if (dd < bd) {
            bd = dd;
            best = [cx, cz];
          }
        }
      if (best) return best;
    }
    return [tx, tz];
  }

  /** Where to run with it: away from them, but not into a wall, a corner or a stack. */
  private flee(m: THREE.Vector3, f: THREE.Vector3) {
    let best = -Infinity;
    const base = Math.atan2(m.z - f.z, m.x - f.x);
    for (let i = 0; i < 12; i++) {
      const a = base + ((i - 6) / 12) * Math.PI * 2;
      const x = m.x + Math.cos(a) * 2.6;
      const z = m.z + Math.sin(a) * 2.6;
      if (Math.abs(x) > KEEP_HX - 0.7 || Math.abs(z) > KEEP_HZ - 0.7) continue;
      if (KEEP_BLOCKS.some(([bx, bz, hw, hd]) => Math.abs(x - bx) < hw + 0.6 && Math.abs(z - bz) < hd + 0.6)) continue;
      // far from them is good; so is room to keep running (the middle), and not doubling back past them
      const score = Math.hypot(x - f.x, z - f.z) * 1.2 - Math.hypot(x, z) * 0.25 + Math.cos(a - base) * 0.8 + Math.random() * (1 - this.skill);
      if (score > best) {
        best = score;
        this.plan.x = x;
        this.plan.z = z;
      }
    }
    if (best === -Infinity) {
      this.plan.x = 0;
      this.plan.z = 0;
    }
  }
}

/** Does the straight line from (ax, az) to (bx, bz) pass through the box x0..x1, z0..z1? */
function crosses(ax: number, az: number, bx: number, bz: number, x0: number, x1: number, z0: number, z1: number) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, q] of [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dz, az - z0],
    [dz, z1 - az],
  ]) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}
