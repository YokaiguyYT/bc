import * as THREE from 'three';
import type { LevelSession } from './LevelSession';
import type { Player } from '../entities/Player';

const _c = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Angle (radians) to wrap into -π..π. */
function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Solo play: the second mover is a robot that helps. It waits on the other
 * side of the load from you, grabs it when you do, walks with you (copying how
 * you move and keeping where it stood round the load when it grabbed), and sets
 * it down when you let go. Your turn keys (Z / C) walk you both round the load
 * opposite ways to turn it. Away from the load, it tags along.
 */
export class Buddy {
  /** Which mover is the robot, and which one it helps. */
  readonly me = 1;
  readonly lead = 0;
  /** Solo turn keys: -1 anticlockwise, +1 clockwise (on screen, seen from above). */
  turn = 0;
  /** Where it's at, for tests: following, ready by the load, reaching for it, carrying. */
  state: 'follow' | 'ready' | 'reach' | 'carry' = 'follow';
  private carrying = false;
  /** Carrying: how far round the load from the lead it keeps (radians), and how far out. */
  private delta = Math.PI;
  private reach = 1;
  /** How long the lead has had grab released (s). */
  private letGo = 0;
  /** Seconds spent trying to get a hand on; after a while it steps back and tries again. */
  private reaching = 0;
  private retry = 0;

  constructor(private s: LevelSession) {}

  private holds(p: Player) {
    return p.hands.some((h) => h.grip?.kind === 'cargo');
  }

  /** Distance from a mover to the nearest bit of the load (not counting overhead bits). */
  private toSurface(p: Player) {
    const b = p.bodyPos;
    let near = 9;
    for (const col of this.s.cargo.colliders) {
      if (!col.isValid()) continue;
      const pr = col.projectPoint({ x: b.x, y: b.y, z: b.z }, true);
      if (pr && pr.point.y < b.y + 0.8) near = Math.min(near, Math.hypot(pr.point.x - b.x, pr.point.z - b.z));
    }
    return near;
  }

  private walk(p: Player, x: number, z: number, max = 1) {
    const l = Math.hypot(x, z);
    const k = l > max ? max / l : 1;
    p.intent.moveX = x * k;
    p.intent.moveZ = z * k;
  }

  /** Call every frame, after the lead's intent is set. */
  update(dt: number) {
    const s = this.s;
    const me = s.players[this.me];
    const lead = s.players[this.lead];
    if (!me || !lead) return;
    const it = me.intent;
    it.jumpPressed = false;
    if (s.state !== 'playing') {
      // (after a delivery the dance takes over)
      if (s.state !== 'delivered') this.walk(me, 0, 0);
      it.grab = false;
      this.carrying = false;
      return;
    }
    const L = lead.bodyPos;
    const B = me.bodyPos;
    const C = s.cargo.position(_c);
    const leadGrabbing = lead.intent.grab && lead.state === 'active';
    const leadHolds = this.holds(lead);
    const dL = Math.hypot(L.x - C.x, L.z - C.z);
    const dB = Math.hypot(B.x - C.x, B.z - C.z);
    this.letGo = leadGrabbing ? 0 : this.letGo + dt;
    if (me.state !== 'active') {
      // knocked over: it gets up by itself
      this.walk(me, 0, 0);
      it.grab = false;
      this.carrying = false;
      return;
    }
    const angL = Math.atan2(L.x - C.x, L.z - C.z);
    const angB = Math.atan2(B.x - C.x, B.z - C.z);
    const rel = wrap(angB - angL);

    if (this.carrying || (this.holds(me) && leadHolds)) {
      // ---- carrying together
      if (!this.carrying) {
        this.carrying = true;
        this.delta = rel;
        this.reach = Math.min(2.1, Math.max(0.6, dB));
      }
      if (this.letGo > 0.12 || (!this.holds(me) && !leadHolds)) {
        // the lead let go: set it down too
        this.carrying = false;
        it.grab = false;
        this.walk(me, 0, 0);
        this.state = 'ready';
        return;
      }
      this.state = 'carry';
      it.grab = true;
      // turning: both walk round the load, opposite ways (the lead's share goes on its keys)
      let tx = 0;
      let tz = 0;
      if (this.turn) {
        const k = this.turn * 0.55;
        const lx = (-(L.z - C.z) / Math.max(0.3, dL)) * k;
        const lz = ((L.x - C.x) / Math.max(0.3, dL)) * k;
        lead.intent.moveX += lx;
        lead.intent.moveZ += lz;
        tx = (-(B.z - C.z) / Math.max(0.3, dB)) * k - lx;
        tz = ((B.x - C.x) / Math.max(0.3, dB)) * k - lz;
      }
      // walk the way the lead walks, keeping to the same place round the load; but carrying
      // end to end (the lead pushing or pulling along the load), line the load up with the
      // way we're going, like two people with a long thing in a corridor
      const mx0 = lead.intent.moveX;
      const mz0 = lead.intent.moveZ;
      const ml = Math.hypot(mx0, mz0);
      let a = angL + this.delta;
      if (ml > 0.3 && !this.turn && dB > 0.3) {
        const along = ((B.x - C.x) * mx0 + (B.z - C.z) * mz0) / (dB * ml);
        if (Math.abs(along) > 0.75) {
          a = Math.atan2(mx0 * Math.sign(along), mz0 * Math.sign(along));
          this.delta = wrap(angB - angL);
        }
      }
      _t.set(C.x + Math.sin(a) * this.reach, 0, C.z + Math.cos(a) * this.reach);
      let mx = lead.intent.moveX + tx + (_t.x - B.x) * 1.4;
      let mz = lead.intent.moveZ + tz + (_t.z - B.z) * 1.4;
      // a hand stretched near slipping: close in on the load
      if (me.maxGripStretch() > 0.45) {
        mx += (C.x - B.x) * 0.4;
        mz += (C.z - B.z) * 0.4;
      }
      this.walk(me, mx, mz);
      return;
    }

    if (dL < 2.6 || leadHolds) {
      // ---- by the load: be on the other side from the lead (round it, not through it)
      const farSide = Math.abs(rel) > (100 * Math.PI) / 180;
      const want = Math.min(2.0, Math.max(0.75, dL));
      if (!farSide) {
        // go round the side we're already nearer
        const a = angL + (rel >= 0 ? 1 : -1) * Math.min(Math.PI, Math.abs(rel) + 1.2);
        _t.set(C.x + Math.sin(a) * (want + 0.35), 0, C.z + Math.cos(a) * (want + 0.35));
        this.walk(me, _t.x - B.x, _t.z - B.z, 0.8);
        it.grab = false;
        this.state = 'ready';
        this.reaching = 0;
        return;
      }
      if (leadGrabbing && (leadHolds || dL < 1.3)) {
        // the lead's grabbing: step in and get both hands on
        this.state = 'reach';
        this.reaching += dt;
        if (this.retry > 0) {
          this.retry -= dt;
          it.grab = false;
          this.walk(me, -(C.x - B.x), -(C.z - B.z), 0.3);
          return;
        }
        const near = this.toSurface(me);
        const empty = me.hands.some((h) => !h.grip);
        it.grab = near < 0.9;
        if (dB > want + 0.6) this.walk(me, C.x - B.x, C.z - B.z, 0.6);
        else if (empty && near > 0.45) this.walk(me, C.x - B.x, C.z - B.z, 0.25);
        else this.walk(me, 0, 0);
        // a hand on something else, or no luck for a while: let go, step back, try again
        const wrong = me.hands.some((h) => h.grip && h.grip.kind !== 'cargo');
        if (wrong || this.reaching > 3) {
          this.reaching = 0;
          this.retry = 0.5;
        }
        return;
      }
      // wait there, ready, about as far out as the lead
      this.reaching = 0;
      this.state = 'ready';
      it.grab = false;
      if (Math.abs(dB - want) > 0.5) this.walk(me, (C.x - B.x) * (dB - want), (C.z - B.z) * (dB - want), 0.6);
      else this.walk(me, 0, 0);
      return;
    }

    // ---- away from the load: tag along behind the lead
    this.state = 'follow';
    this.reaching = 0;
    it.grab = false;
    const d = Math.hypot(L.x - B.x, L.z - B.z);
    if (d > 1.8) this.walk(me, L.x - B.x, L.z - B.z, Math.min(1, (d - 1.4) * 0.8));
    else this.walk(me, 0, 0);
    // hop up after the lead (a step, a ledge)
    if (L.y > B.y + 0.5 && d < 2.5) it.jumpPressed = true;
  }
}
