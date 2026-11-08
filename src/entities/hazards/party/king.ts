import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { Player } from '../../Player';
import { glossy, matte } from '../../../render/materials';
import { ON, PartyGame } from './base';
import { Bay, holder, mesh, parkProp, parkSpot, prop, showLive, spawnProp, wordTexture, type Prop } from './kit';

/** Where the trucks' open backs are, and where loot falls. */
export const KING_BAY = 7.5;
const RAIN = { x: 5, z: 4.2 };

type Kind = 'box' | 'case' | 'tv' | 'trophy' | 'chest';
const KINDS: Record<Kind, { value: number; mass: number; half: [number, number, number]; count: number }> = {
  box: { value: 10, mass: 4, half: [0.3, 0.3, 0.3], count: 6 },
  case: { value: 25, mass: 8, half: [0.38, 0.28, 0.14], count: 4 },
  tv: { value: 40, mass: 12, half: [0.42, 0.32, 0.2], count: 3 },
  trophy: { value: 80, mass: 16, half: [0.24, 0.42, 0.24], count: 2 },
  chest: { value: 150, mass: 24, half: [0.48, 0.34, 0.32], count: 1 },
};

interface Loot extends Prop {
  kind: Kind;
  value: number;
  tag: THREE.Sprite;
  /** Where it's going to land (the shadow ring), while it falls. */
  ring: THREE.Mesh;
}

const _v = new THREE.Vector3();

function look(kind: Kind): THREE.Object3D {
  const g = new THREE.Group();
  const [hx, hy, hz] = KINDS[kind].half;
  switch (kind) {
    case 'box': {
      g.add(mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), matte(0xc8955b)));
      g.add(mesh(new THREE.BoxGeometry(0.14, hy * 2 + 0.01, hz * 2 + 0.01), matte(0xe8d3a8), false));
      break;
    }
    case 'case': {
      g.add(mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), glossy(0x7a4a2a, 0.5)));
      const h = mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12, Math.PI), glossy(0x2a2a30, 0.4), false);
      h.position.y = hy;
      g.add(h);
      break;
    }
    case 'tv': {
      g.add(mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), glossy(0x2a2a32, 0.4)));
      const scr = mesh(new THREE.PlaneGeometry(hx * 1.6, hy * 1.5), new THREE.MeshStandardMaterial({ color: 0x6ad0ff, emissive: 0x2a7aa8, roughness: 0.2 }), false);
      scr.position.z = hz + 0.005;
      g.add(scr);
      break;
    }
    case 'trophy': {
      const gold = glossy(0xffc83d, 0.25, 0.85);
      const base = mesh(new THREE.BoxGeometry(hx * 2, 0.16, hz * 2), glossy(0x3a2a20, 0.5));
      base.position.y = -hy + 0.08;
      const stem = mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.3, 10), gold);
      stem.position.y = -hy + 0.3;
      const cup = mesh(new THREE.CylinderGeometry(0.22, 0.1, 0.36, 16), gold);
      cup.position.y = hy - 0.24;
      g.add(base, stem, cup);
      break;
    }
    case 'chest': {
      g.add(mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), matte(0x8a5a2a)));
      for (const x of [-0.6, 0.6]) {
        const band = mesh(new THREE.BoxGeometry(0.08, hy * 2 + 0.02, hz * 2 + 0.02), glossy(0xffc83d, 0.3, 0.8), false);
        band.position.x = x * hx;
        g.add(band);
      }
      const lock = mesh(new THREE.BoxGeometry(0.12, 0.14, 0.04), glossy(0xffc83d, 0.3, 0.8), false);
      lock.position.set(0, hy * 0.3, hz + 0.02);
      g.add(lock);
      break;
    }
  }
  return g;
}

/**
 * King of the Truck: loot rains down in the middle (boxes, suitcases, TVs,
 * trophies, a treasure chest). Carry it into your own truck; whatever's in
 * your truck when the clock runs out is yours. Stealing from theirs is fair
 * game. Mind your head.
 */
export class King extends PartyGame {
  readonly title = 'King of the Truck';
  private loot: Loot[] = [];
  private bays: Bay[];
  private nextDrop = 0;
  private t = 0;
  private coloured = false;
  private bonkAt = [-9, -9];

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    let k = 0;
    const ringGeo = new THREE.RingGeometry(0.45, 0.6, 24).rotateX(-Math.PI / 2);
    for (const kind of Object.keys(KINDS) as Kind[]) {
      const info = KINDS[kind];
      for (let i = 0; i < info.count; i++) {
        const [hx, hy, hz] = info.half;
        const p = prop(this.sim, this.root, RAPIER.ColliderDesc.cuboid(hx, hy, hz).setMass(info.mass).setRestitution(0.1), look(kind), parkSpot(k++), {
          material: kind === 'trophy' ? 'metal' : kind === 'tv' ? 'glass' : 'wood',
          friction: 0.7,
          damping: 0.15,
        });
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture(`$${info.value}`, 'rgba(0,0,0,0)', info.value >= 80 ? '#ffd23f' : '#ffffff', 256, 96), depthWrite: false, transparent: true }));
        tag.scale.set(0.7, 0.26, 1);
        tag.visible = false;
        this.root.add(tag);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.7, depthWrite: false }));
        ring.visible = false;
        this.root.add(ring);
        this.loot.push({ ...p, kind, value: info.value, tag, ring });
      }
    }
    this.bays = [new Bay(this.root, -KING_BAY, -1), new Bay(this.root, KING_BAY, 1)];
  }

  protected setup() {
    for (const l of this.loot) parkProp(l);
    this.t = 0;
    this.nextDrop = 1.5;
    // a few things to start with
    const first = this.loot.filter((l) => l.kind === 'box' || l.kind === 'case').slice(0, 5);
    first.forEach((l, i) => spawnProp(l, _v.set(((i % 3) - 1) * 2.4, 0.6, i < 3 ? -1.6 : 1.6), undefined, Math.random() * 3));
    this.place(0, -3, 0, 0, Math.PI / 2);
    this.place(1, 3, 0, 0, -Math.PI / 2);
  }

  /** Drop something from the sky (the bigger things later on). */
  private drop() {
    const late = this.t > (this.roundTime || 90) * 0.35;
    const pool = this.loot.filter((l) => !l.live && (late || l.value < 80));
    if (!pool.length) return;
    const l = pool[Math.floor(Math.random() * pool.length)];
    const x = (Math.random() * 2 - 1) * RAIN.x;
    const z = (Math.random() * 2 - 1) * RAIN.z;
    spawnProp(l, _v.set(x, 9, z), new THREE.Vector3(0, -2, 0), Math.random() * 3);
    if (l.value >= 80) this.say(l.kind === 'chest' ? '💰 TREASURE CHEST!' : '🏆 A TROPHY!', true);
  }

  private count() {
    const v: [number, number] = [0, 0];
    for (const l of this.loot) {
      if (!l.live) continue;
      const p = l.body.translation();
      for (let i = 0; i < 2; i++) if (this.bays[i].contains(p.x, p.z, p.y)) v[i] += l.value;
    }
    this.tally = v;
  }

  protected step(dt: number, now: number) {
    this.t += dt;
    if (this.t >= this.nextDrop) {
      this.drop();
      this.nextDrop = this.t + 2.6 + Math.random() * 1.4;
    }
    for (const l of this.loot) {
      if (!l.live) continue;
      const p = l.body.translation();
      if (p.y < -5) {
        parkProp(l);
        continue;
      }
      // something heavy landing on your head
      const v = l.body.linvel();
      if (v.y < -6)
        this.players.forEach((pl, i) => {
          if (now - this.bonkAt[i] < 1.5 || l.value < 25) return;
          if (Math.hypot(pl.bodyPos.x - p.x, pl.bodyPos.z - p.z) < 0.7 && p.y - pl.bodyPos.y < 1.4 && p.y > pl.bodyPos.y) {
            this.bonkAt[i] = now;
            pl.knock(10);
            this.say('BONK!', true, 1 - i);
          }
        });
    }
    this.count();
    return ON;
  }

  finalLine() {
    return `💰 $${this.tally[0]} vs $${this.tally[1]} in the trucks`;
  }
  showTally() {
    return `$${this.tally[0]}|$${this.tally[1]}`;
  }
  line() {
    return this.phase === 'play' ? 'Carry loot into your truck. Steal theirs!' : 'Most loot in your truck wins.';
  }
  protected roundText(w: number) {
    return w < 0 ? 'EVEN STEVENS!' : `${this.name(w)} IS KING OF THE TRUCK!`;
  }

  protected looks() {
    showLive(this.loot);
    if (!this.coloured && this.players.length === 2) {
      this.coloured = true;
      this.bays.forEach((b, i) => b.colour(this.players[i].color));
    }
    for (const l of this.loot) {
      const p = this.sim.physics.interpolatedPosition(l.body, _v);
      const live = l.obj.visible;
      l.tag.visible = live;
      if (live) l.tag.position.set(p.x, p.y + 0.75, p.z);
      // falling: a ring where it'll land
      const falling = live && p.y > 2.2 && l.body.linvel().y < -0.5;
      l.ring.visible = falling;
      if (falling) l.ring.position.set(p.x, 0.03, p.z);
    }
  }

  private goal: Loot | null = null;
  private plan = { at: -9 };
  private retry = 0;
  private letGo = 0;
  protected cpuMove(me: Player, _foe: Player, dt: number) {
    const now = this.sim.time();
    const mine = this.bays[1];
    const held = this.loot.find((l) => l.live && (holder(this.players, l.body) === 1 || holder(this.players, l.body) === 2));
    if (me.hands.some((h) => h.grip && !this.loot.some((l) => l.body.handle === h.grip!.body?.handle))) this.retry = 0.4;
    if (this.retry > 0) {
      this.retry -= dt;
      me.intent.grab = false;
      return this.steer(me, me.bodyPos.x - 1, me.bodyPos.z, 0.5);
    }
    if (held) {
      // carrying: into the truck, then let go
      const p = held.body.translation();
      if ((mine.contains(p.x, p.z, p.y) && p.x > mine.minX + 0.9) || this.letGo > 0) {
        // in: let go, and stand still while it's set down (walking off would drag it back out)
        this.letGo = this.letGo > 0 ? this.letGo : 1;
        me.intent.grab = false;
        this.goal = null;
        return this.steer(me, me.bodyPos.x, me.bodyPos.z, 0);
      }
      me.intent.grab = true;
      // round to the open back first (not into the side of the truck)
      if (me.bodyPos.x < mine.minX + 0.4 && Math.abs(me.bodyPos.z) > 1.4) return this.steer(me, mine.minX - 1, me.bodyPos.z * 0.5);
      return this.steer(me, mine.maxX - 0.6, Math.max(-0.9, Math.min(0.9, p.z * 0.5)));
    }
    me.intent.grab = false;
    this.letGo = 0;
    // what's worth going for: value for the trip, theirs counts double (it's a swing of two)
    if (!this.goal || !this.goal.live || now - this.plan.at > 1.2 || mine.contains(this.goal.body.translation().x, this.goal.body.translation().z)) {
      this.plan.at = now;
      let best = -1;
      this.goal = null;
      for (const l of this.loot) {
        if (!l.live) continue;
        const p = l.body.translation();
        if (p.y > 2 || mine.contains(p.x, p.z, p.y)) continue;
        const d = Math.hypot(p.x - me.bodyPos.x, p.z - me.bodyPos.z);
        const trip = Math.abs(mine.cx - p.x);
        const theirs = this.bays[0].contains(p.x, p.z, p.y) ? 1.6 : 1;
        const heavy = KINDS[l.kind].mass > 15 ? 0.7 : 1;
        const score = ((l.value * theirs * heavy) / (d + trip + 3)) * (0.7 + Math.random() * 0.6 * (1 - this.skill));
        if (score > best) {
          best = score;
          this.goal = l;
        }
      }
    }
    if (!this.goal) return this.steer(me, 0, 0, 0.5);
    const p = this.goal.body.translation();
    const d = Math.hypot(p.x - me.bodyPos.x, p.z - me.bodyPos.z);
    this.steer(me, p.x, p.z, d < 1.2 ? 0.4 : 1);
    me.intent.grab = d < 1.15;
  }
}
