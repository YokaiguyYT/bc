import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { G, groups, SOLID } from '../../physics/groups';
import { glossy, jelly, matte } from '../../render/materials';
import { tuning } from '../../config/tuning';
import { CHAOS_EVENTS, chaosLevel, type ChaosEvent } from '../../game/chaos';
import type { Player } from '../Player';
import { registerHazard, Hazard } from './registry';
import { bonkPlayers, num } from './common';

/**
 * A chaos job's director: every few seconds something crazy happens around
 * the movers (meteors, an earthquake, moon gravity, a chicken stampede…), more
 * often and closer the higher the chaos level. One per chaos job.
 *
 * Online-safe: every body it throws is made up front, parked out of sight, in
 * the same order on both laptops (so the guest's copy moves them from the
 * host's snapshots); what bodies don't show (the quake, the wind, the money
 * notes, what's going on) travels in netState; banners are game events.
 *
 * params: level (1..5), mask (CHAOS_KINDS bits), path ([x, z] pairs along the
 * course, to know which way is ahead).
 */

/** The world as it was before any chaos (moon gravity and super jumps change the shared tuning for a while). */
const BASE = { gravity: tuning.physics.gravity, jump: tuning.jump.velocity };

type Kind = 'rock' | 'ball' | 'box' | 'barrel' | 'chicken';
const POOL: [Kind, number][] = [
  ['rock', 8],
  ['ball', 4],
  ['box', 8],
  ['barrel', 4],
  ['chicken', 8],
];

interface Thing {
  kind: Kind;
  body: RigidBody;
  col: Collider;
  obj: THREE.Object3D;
  park: THREE.Vector3;
  live: boolean;
  /** Host time to tidy it away. */
  until: number;
  /** Rocks: hit the ground already. Chickens: running direction. */
  landed: boolean;
  run: THREE.Vector3;
  turnAt: number;
  /** Looks: last position (for the meteor's trail and the chicken's flapping). */
  last: THREE.Vector3;
  ring?: THREE.Object3D;
  trail?: THREE.Object3D;
  wings?: THREE.Object3D[];
}

interface Active {
  ev: ChaosEvent;
  t0: number;
  t1: number;
  center: THREE.Vector3;
  fwd: THREE.Vector3;
  side: THREE.Vector3;
  /** Staggered spawns: how many still to come, and when the next one is. */
  left: number;
  next: number;
  /** Stampedes: which side they come from. */
  from: number;
}

interface Note {
  x: number;
  z: number;
  y0: number;
  ground: number;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const MAX_NOTES = 8;

let looks: {
  rock: THREE.BufferGeometry;
  rockMat: THREE.Material;
  glowMat: THREE.Material;
  ring: THREE.BufferGeometry;
  ringMat: THREE.Material;
  trail: THREE.BufferGeometry;
  trailMat: THREE.Material;
  ball: THREE.BufferGeometry;
  ballMat: THREE.Material;
  box: THREE.BufferGeometry;
  boxMat: THREE.Material;
  tape: THREE.BufferGeometry;
  tapeMat: THREE.Material;
  barrel: THREE.BufferGeometry;
  barrelMat: THREE.Material;
  band: THREE.BufferGeometry;
  bandMat: THREE.Material;
  note: THREE.BufferGeometry;
  noteMat: THREE.Material;
  noteBand: THREE.BufferGeometry;
  noteBandMat: THREE.Material;
} | null = null;

function makeLooks() {
  // a beach ball: coloured segments round the middle
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  ['#ff5a4f', '#ffffff', '#3d9bff', '#ffffff', '#ffd23f', '#ffffff'].forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect((i * 256) / 6, 0, 256 / 6 + 1, 64);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return {
    rock: new THREE.IcosahedronGeometry(0.42, 0),
    rockMat: new THREE.MeshStandardMaterial({ color: 0x5b4a40, roughness: 0.95, flatShading: true, emissive: 0x6a1d00, emissiveIntensity: 0.6 }),
    glowMat: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55, depthWrite: false }),
    ring: new THREE.RingGeometry(0.55, 0.75, 28).rotateX(-Math.PI / 2),
    ringMat: new THREE.MeshBasicMaterial({ color: 0xff3b2f, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    trail: new THREE.ConeGeometry(0.36, 2.4, 12, 1, true).translate(0, 1.2, 0),
    trailMat: new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.7, depthWrite: false }),
    ball: new THREE.SphereGeometry(0.75, 24, 16),
    ballMat: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }),
    box: new THREE.BoxGeometry(0.62, 0.5, 0.62),
    boxMat: matte(0xc8955b),
    tape: new THREE.BoxGeometry(0.16, 0.505, 0.625),
    tapeMat: matte(0xe8d3a8),
    barrel: new THREE.CylinderGeometry(0.38, 0.38, 0.9, 20),
    barrelMat: glossy(0xd63c2f, 0.45, 0.2),
    band: new THREE.TorusGeometry(0.385, 0.03, 6, 24).rotateX(Math.PI / 2),
    bandMat: glossy(0x3a3a46, 0.4, 0.6),
    note: new THREE.BoxGeometry(0.5, 0.26, 0.025),
    noteMat: matte(0x5fc46f),
    noteBand: new THREE.BoxGeometry(0.11, 0.28, 0.035),
    noteBandMat: glossy(0xffd23f, 0.3, 0.5),
  };
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  return o;
}

/** A plump chicken (looks only), facing +Z, its middle at the origin. */
function chicken(): { obj: THREE.Group; wings: THREE.Object3D[] } {
  const g = new THREE.Group();
  const white = jelly(0xfbf8f2, 0.35);
  const orange = matte(0xf2a33a);
  const red = matte(0xe8433b);
  const body = mesh(new THREE.SphereGeometry(0.22, 14, 10), white);
  body.scale.set(1, 0.9, 1.2);
  const head = mesh(new THREE.SphereGeometry(0.12, 12, 8), white);
  head.position.set(0, 0.2, 0.17);
  const beak = mesh(new THREE.ConeGeometry(0.04, 0.09, 8).rotateX(Math.PI / 2), orange);
  beak.position.set(0, 0.19, 0.31);
  const comb = mesh(new THREE.BoxGeometry(0.03, 0.08, 0.12), red);
  comb.position.set(0, 0.33, 0.16);
  const wattle = mesh(new THREE.SphereGeometry(0.03, 6, 5), red);
  wattle.position.set(0, 0.12, 0.27);
  const eyeGeo = new THREE.SphereGeometry(0.018, 6, 5);
  const eyeMat = matte(0x222222);
  const e1 = mesh(eyeGeo, eyeMat, false);
  e1.position.set(0.07, 0.24, 0.26);
  const e2 = e1.clone();
  e2.position.x = -0.07;
  const tail = mesh(new THREE.ConeGeometry(0.08, 0.18, 8).rotateX(-Math.PI / 3), white);
  tail.position.set(0, 0.1, -0.25);
  const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.16, 5);
  const l1 = mesh(legGeo, orange, false);
  l1.position.set(0.07, -0.24, 0);
  const l2 = l1.clone();
  l2.position.x = -0.07;
  const wings: THREE.Object3D[] = [];
  for (const s of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.2 * s, 0.04, 0);
    const w = mesh(new THREE.SphereGeometry(0.13, 10, 6), white);
    w.scale.set(0.35, 0.8, 1.2);
    w.position.set(0.02 * s, -0.04, 0);
    pivot.add(w);
    pivot.userData.side = s;
    wings.push(pivot);
    g.add(pivot);
  }
  g.add(body, head, beak, comb, wattle, e1, e2, tail, l1, l2);
  return { obj: g, wings };
}

export class ChaosDirector implements Hazard {
  readonly level: number;
  private mask: number;
  private path: THREE.Vector3[] = [];
  private things: Thing[] = [];
  private root = new THREE.Group();
  private active: Active[] = [];
  private nextAt: number;
  private lastId = '';
  private rand: () => number;
  private cooldowns = new Map<Player, number>();
  private quakeTick = 0;
  // looks (the host sets them as things happen; the guest gets them from netState)
  private quake = 0;
  private gust: THREE.Vector3 | null = null;
  private ice = false;
  private shown: { ev: number; end: number }[] = [];
  private money: { t0: number; end: number; got: number; notes: Note[] } | null = null;
  private noteObjs: THREE.Object3D[] = [];
  private windT = 0;
  private time = 0;
  /** How many surprises so far (the results card counts them). */
  fired = 0;
  // the UFO (where it hovers) and the fog (how thick, 0..1, eased on each laptop)
  private ufo: THREE.Vector3 | null = null;
  private ufoObj = new THREE.Group();
  private beam: THREE.Mesh;
  private fog = false;
  private fogK = 0;
  private fogWas: { near: number; far: number; color: THREE.Color } | null = null;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.level = Math.max(1, Math.min(5, Math.round(num(o.params, 'level', 3))));
    this.mask = num(o.params, 'mask', 15) || 15;
    const flat = (o.params?.path as number[] | undefined) ?? [];
    for (let i = 0; i + 1 < flat.length; i += 2) this.path.push(new THREE.Vector3(flat[i], 0, flat[i + 1]));
    // (looks and timing only: what actually happens is decided on the host)
    let seed = (num(o.params, 'seed', 1) >>> 0) || 1;
    this.rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const lv = chaosLevel(this.level);
    this.nextAt = 5 + lv.every * 0.4 + this.rand() * 3;
    looks ??= makeLooks();
    sim.scene.add(this.root);
    // every body up front, parked far below, in a fixed order (online: the same on both laptops)
    let k = 0;
    for (const [kind, n] of POOL) for (let i = 0; i < n; i++) this.things.push(this.make(kind, new THREE.Vector3(-60 + (k++ % 20) * 6, -300, -60 + Math.floor(k / 20) * 6)));
    for (let i = 0; i < MAX_NOTES; i++) {
      const g = new THREE.Group();
      g.add(mesh(looks.note, looks.noteMat), mesh(looks.noteBand, looks.noteBandMat));
      g.visible = false;
      this.root.add(g);
      this.noteObjs.push(g);
    }
    // a flying saucer with a little green pilot, and its tractor beam
    const hull = mesh(new THREE.SphereGeometry(1.5, 28, 12), glossy(0xb8c2cc, 0.25, 0.7));
    hull.scale.set(1, 0.28, 1);
    const dome = mesh(new THREE.SphereGeometry(0.62, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.55, roughness: 0.1 }), false);
    dome.position.y = 0.25;
    const pilot = mesh(new THREE.SphereGeometry(0.22, 12, 10), jelly(0x7bdc4a, 0.5), false);
    pilot.position.y = 0.42;
    this.ufoObj.add(hull, dome, pilot);
    for (let i = 0; i < 8; i++) {
      const light = mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffe14a : 0xff5a4f }), false);
      const a = (i / 8) * Math.PI * 2;
      light.position.set(Math.cos(a) * 1.35, -0.05, Math.sin(a) * 1.35);
      this.ufoObj.add(light);
    }
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.6, 1, 24, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xc8ffb0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.ufoObj.add(this.beam);
    this.ufoObj.visible = false;
    this.root.add(this.ufoObj);
  }

  private make(kind: Kind, park: THREE.Vector3): Thing {
    const L = looks!;
    const world = this.sim.physics.world;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(park.x, park.y, park.z)
        .setLinearDamping(kind === 'ball' ? 0.25 : 0.05)
        .setAngularDamping(kind === 'chicken' ? 5 : 0.3)
        .setGravityScale(kind === 'chicken' ? 0.6 : 1)
        .setCcdEnabled(kind === 'rock')
        .setEnabled(false),
    );
    if (kind === 'chicken') body.lockRotations(true, false);
    let desc: InstanceType<typeof RAPIER.ColliderDesc>;
    const obj = new THREE.Group();
    const t: Partial<Thing> = {};
    let hazard = false;
    let material: 'concrete' | 'rubber' | 'cardboard' | 'metal' | 'soft' = 'concrete';
    switch (kind) {
      case 'rock': {
        desc = RAPIER.ColliderDesc.ball(0.4).setMass(40).setRestitution(0.15);
        obj.add(mesh(L.rock, L.rockMat));
        const glow = mesh(L.rock, L.glowMat, false);
        glow.scale.setScalar(1.25);
        obj.add(glow);
        const trail = mesh(L.trail, L.trailMat, false);
        obj.add(trail);
        t.trail = trail;
        const ring = mesh(L.ring, L.ringMat, false);
        ring.visible = false;
        this.root.add(ring);
        t.ring = ring;
        hazard = true;
        break;
      }
      case 'ball':
        desc = RAPIER.ColliderDesc.ball(0.75).setMass(2.5).setRestitution(0.85);
        obj.add(mesh(L.ball, L.ballMat));
        material = 'rubber';
        break;
      case 'box':
        desc = RAPIER.ColliderDesc.cuboid(0.31, 0.25, 0.31).setMass(4).setRestitution(0.1);
        obj.add(mesh(L.box, L.boxMat), mesh(L.tape, L.tapeMat));
        material = 'cardboard';
        break;
      case 'barrel': {
        desc = RAPIER.ColliderDesc.cylinder(0.45, 0.38).setMass(30).setRestitution(0.1);
        obj.add(mesh(L.barrel, L.barrelMat));
        for (const y of [-0.25, 0.25]) {
          const b = mesh(L.band, L.bandMat, false);
          b.position.y = y;
          obj.add(b);
        }
        hazard = true;
        material = 'metal';
        break;
      }
      case 'chicken': {
        desc = RAPIER.ColliderDesc.ball(0.24).setMass(2.5).setRestitution(0.3);
        const c = chicken();
        obj.add(c.obj);
        t.wings = c.wings;
        material = 'soft';
        break;
      }
    }
    desc.setFriction(kind === 'barrel' ? 0.9 : 0.6).setCollisionGroups(groups(hazard ? G.HAZARD : G.PROP, SOLID | G.DEBRIS)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const col = world.createCollider(desc, body);
    this.sim.physics.setInfo(col, { kind: hazard ? 'hazard' : 'prop', material, grabbable: !hazard, owner: body });
    obj.visible = false;
    this.root.add(obj);
    this.sim.physics.link(body, obj);
    return { kind, body, col, obj, park, live: false, until: 0, landed: false, run: new THREE.Vector3(), turnAt: 0, last: park.clone(), ...t };
  }

  // ---------------------------------------------------------------- host: what happens

  preStep(dt: number) {
    const now = this.sim.time();
    this.time = now;
    // nothing new once the load is lost
    if (now >= this.nextAt && !this.sim.cargo?.destroyed && (this.sim.live?.() ?? true)) {
      this.fire(now);
      // Mayhem and up: sometimes two at once
      const two = this.level >= 5 ? 0.35 : this.level >= 4 ? 0.15 : 0;
      if (this.rand() < two) this.fire(now);
      this.nextAt = now + chaosLevel(this.level).every * (0.7 + this.rand() * 0.6);
    }
    for (const a of this.active) this.tick(a, now, dt);
    for (const a of this.active.filter((x) => now >= x.t1)) this.end(a);
    this.active = this.active.filter((x) => now < x.t1);
    this.shown = this.active.map((a) => ({ ev: CHAOS_EVENTS.indexOf(a.ev), end: a.t1 }));
    if (this.money && now > this.money.end) this.money = null;
    this.things.forEach((t) => this.keep(t, now, dt));
  }

  /** Tests: start this one now (on the host). */
  trigger(id: string) {
    this.fire(this.sim.time(), id);
  }

  private fire(now: number, only?: string) {
    const busy = new Set(this.active.map((a) => a.ev.id));
    const choices = CHAOS_EVENTS.filter((e) => (only ? e.id === only : this.mask & e.kind && e.id !== this.lastId) && !busy.has(e.id));
    if (!choices.length) return;
    const ev = choices[Math.floor(this.rand() * choices.length)];
    this.lastId = ev.id;
    const center = this.center();
    const fwd = this.ahead(center);
    const side = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const a: Active = { ev, t0: now, t1: now + ev.dur, center, fwd, side, left: 0, next: now, from: this.rand() < 0.5 ? 1 : -1 };
    this.active.push(a);
    this.fired++;
    this.start(a);
    this.sim.events.emit('chaos', { kind: ev.id, text: ev.text });
  }

  /** Where the action is: the cargo (the movers are usually with it), or the movers if it's gone. */
  private center() {
    const cargo = this.sim.cargo;
    const ps = this.sim.players ?? [];
    const c = cargo?.position(new THREE.Vector3()) ?? new THREE.Vector3();
    const near = ps.some((p) => p.bodyPos.distanceTo(c) < 8);
    if ((cargo?.destroyed || !near) && ps.length) {
      c.set(0, 0, 0);
      for (const p of ps) c.add(p.bodyPos);
      c.multiplyScalar(1 / ps.length);
    }
    return c;
  }

  /** Which way the course goes from here. */
  private ahead(at: THREE.Vector3) {
    const P = this.path;
    if (P.length < 2) return new THREE.Vector3(0, 0, -1);
    let best = 0;
    let bd = Infinity;
    P.forEach((p, i) => {
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    // past the nearest point already? then the stretch after it
    const i = Math.min(best, P.length - 2);
    const d = new THREE.Vector3(P[i + 1].x - P[i].x, 0, P[i + 1].z - P[i].z);
    if (d.lengthSq() < 0.01) return new THREE.Vector3(0, 0, -1);
    return d.normalize();
  }

  /** A spot on the floor rMin..rMax from `c` (a few tries: a narrow deck or a bridge has void either side). */
  private spot(c: THREE.Vector3, rMin: number, rMax: number): THREE.Vector3 | null {
    for (let k = 0; k < 8; k++) {
      const ang = this.rand() * Math.PI * 2;
      const rad = rMin + this.rand() * (rMax - rMin) * (1 - k * 0.1);
      const x = c.x + Math.cos(ang) * rad;
      const z = c.z + Math.sin(ang) * rad;
      const g = this.groundAt(x, c.y + 4, z);
      if (g !== null && Math.abs(g - c.y) < 4) return new THREE.Vector3(x, g, z);
    }
    return null;
  }

  private groundAt(x: number, y: number, z: number): number | null {
    const hit = this.sim.physics.world.castRay(new RAPIER.Ray({ x, y: y + 12, z }, { x: 0, y: -1, z: 0 }), 40, true, RAPIER.QueryFilterFlags.ONLY_FIXED);
    return hit ? y + 12 - hit.timeOfImpact : null;
  }

  private start(a: Active) {
    const L = this.level;
    const c = a.center;
    switch (a.ev.id) {
      case 'meteors':
        a.left = Math.round(1 + L * 1.4);
        a.next = a.t0 + 0.6;
        break;
      case 'balls':
        a.left = 2 + Math.floor(L / 2);
        a.next = a.t0 + 0.3;
        break;
      case 'boxes':
        a.left = 3 + L;
        a.next = a.t0 + 0.2;
        break;
      case 'barrels':
        a.left = 1 + Math.ceil(L / 2);
        a.next = a.t0 + 0.5;
        break;
      case 'stampede':
        a.left = Math.min(8, 4 + L);
        a.next = a.t0 + 0.3;
        break;
      case 'chickenRain':
        a.left = Math.min(8, 3 + L);
        a.next = a.t0 + 0.2;
        break;
      case 'money': {
        const n = Math.min(MAX_NOTES, 5 + Math.floor(L / 2));
        const notes: Note[] = [];
        for (let i = 0; i < n; i++) {
          const at = this.spot(c, 1.6, 5.6);
          if (at) notes.push({ x: at.x, z: at.z, y0: at.y + 5 + this.rand() * 2.5, ground: at.y });
        }
        this.money = { t0: a.t0, end: a.t1, got: 0, notes };
        break;
      }
      case 'gust': {
        // across the course more often than along it: that's what blows you off
        const ang = (this.rand() - 0.5) * 1.2;
        this.gust = a.side
          .clone()
          .multiplyScalar(this.rand() < 0.5 ? 1 : -1)
          .applyAxisAngle(UP, ang)
          .normalize();
        break;
      }
      case 'quake':
        this.quake = 0.4 + L * 0.12;
        break;
      case 'ice':
        this.ice = true;
        for (const p of this.sim.players ?? []) p.slippery = true;
        break;
      case 'moon':
        tuning.physics.gravity = BASE.gravity * 0.35;
        break;
      case 'jump':
        tuning.jump.velocity = BASE.jump * 1.7;
        break;
      case 'speed':
        for (const p of this.sim.players ?? []) p.speedScale = 1.7;
        break;
      case 'ufo':
        this.ufo = a.center.clone().add(new THREE.Vector3(0, 7, 0));
        break;
      case 'fog':
        this.fog = true;
        break;
    }
  }

  private end(a: Active) {
    switch (a.ev.id) {
      case 'gust':
        this.gust = null;
        break;
      case 'quake':
        this.quake = 0;
        break;
      case 'ice':
        this.ice = false;
        for (const p of this.sim.players ?? []) p.slippery = false;
        break;
      case 'moon':
        tuning.physics.gravity = BASE.gravity;
        break;
      case 'jump':
        tuning.jump.velocity = BASE.jump;
        break;
      case 'speed':
        for (const p of this.sim.players ?? []) p.speedScale = 1;
        break;
      case 'ufo':
        this.ufo = null;
        break;
      case 'fog':
        this.fog = false;
        break;
    }
  }

  private tick(a: Active, now: number, dt: number) {
    const L = this.level;
    // staggered spawns
    while (a.left > 0 && now >= a.next) {
      a.left--;
      this.spawnOne(a, now);
      a.next = now + (a.ev.id === 'meteors' ? 0.55 : a.ev.id === 'barrels' ? 0.9 : a.ev.id === 'boxes' ? 0.18 : 0.3);
    }
    switch (a.ev.id) {
      case 'gust':
        // (Mild about as strong as job 9's fans; ULTRA two and a half times that)
        if (this.gust) this.blow(this.gust, 2.5 + 1.8 * L, dt);
        break;
      case 'quake': {
        this.quakeTick -= dt;
        if (this.quakeTick > 0) break;
        this.quakeTick = 0.25;
        const kick = 0.5 + 0.35 * L;
        for (const p of this.sim.players ?? []) {
          const ang = this.rand() * Math.PI * 2;
          p.applyBlast(_v.set(Math.cos(ang) * kick, 0.4, Math.sin(ang) * kick).multiplyScalar(p.totalMass));
          if (L >= 3 && this.rand() < 0.04 * (L - 2)) p.knock(4);
        }
        // loose things hop about (the cargo too, from Wild up, unless it's being carried)
        const cargo = this.sim.cargo;
        const hop = (L - 1) * 0.45;
        if (cargo && hop > 0 && !this.sim.grips.isHeld(cargo.body)) {
          const m = cargo.body.mass();
          cargo.body.applyImpulse({ x: (this.rand() - 0.5) * hop * m, y: hop * m, z: (this.rand() - 0.5) * hop * m }, true);
        }
        for (const t of this.things) if (t.live && t.kind !== 'rock' && t.kind !== 'chicken') t.body.applyImpulse({ x: 0, y: 1.5 * t.body.mass(), z: 0 }, true);
        break;
      }
      case 'ufo': {
        const u = this.ufo;
        if (!u) break;
        // it drifts after the load and beams it up: on Mild it only makes it light, on ULTRA it lifts it away
        const c = this.center();
        u.x += (c.x - u.x) * Math.min(1, dt * 1.2);
        u.z += (c.z - u.z) * Math.min(1, dt * 1.2);
        const g = tuning.physics.gravity;
        const lift = (0.8 + 0.08 * L) * g;
        const pull = (b: RigidBody, k = 1) => {
          const p = b.translation();
          if (Math.hypot(p.x - u.x, p.z - u.z) > 1.9 || p.y > u.y - 1.6) return;
          const m = b.mass() * k;
          b.applyImpulse({ x: (u.x - p.x) * m * dt * 0.6, y: lift * m * dt, z: (u.z - p.z) * m * dt * 0.6 }, true);
        };
        const cargo = this.sim.cargo;
        if (cargo) pull(cargo.body);
        for (const t of this.things) if (t.live) pull(t.body);
        // movers in the beam go light-footed (not quite floating)
        for (const p of this.sim.players ?? []) for (const name of ['body', 'head'] as const) {
          const part = (p as unknown as { parts: Record<string, RigidBody> }).parts[name];
          if (part) pull(part, 0.5);
        }
        break;
      }
      case 'money': {
        const m = this.money;
        if (!m) break;
        m.notes.forEach((n, i) => {
          if (m.got & (1 << i)) return;
          const y = this.noteY(n, now);
          for (const p of this.sim.players ?? []) {
            if (Math.hypot(p.bodyPos.x - n.x, p.bodyPos.z - n.z) > 1 || Math.abs(p.bodyPos.y - y) > 1.3) continue;
            m.got |= 1 << i;
            this.sim.events.emit('tip', { amount: 5 * Math.round((10 + 5 * L) / 5), pos: new THREE.Vector3(n.x, y, n.z) });
            break;
          }
        });
        break;
      }
    }
  }

  /** A gust: push everything dynamic near the movers (the painting catches it, as in job 9). */
  private blow(dir: THREE.Vector3, accel: number, dt: number) {
    const c = this.center();
    const world = this.sim.physics.world;
    const seen = new Set<number>();
    const hit: Collider[] = [];
    world.collidersWithAabbIntersectingAabb({ x: c.x, y: c.y, z: c.z }, { x: 16, y: 8, z: 16 }, (col) => {
      const b = col.parent();
      if (!b || !b.isDynamic() || seen.has(b.handle)) return true;
      seen.add(b.handle);
      hit.push(col);
      return true;
    });
    for (const col of hit) {
      const b = col.parent()!;
      const info = this.sim.physics.info(col);
      const scale = info?.kind === 'cargo' ? (info.owner as { windScale(d: THREE.Vector3, a: number): number }).windScale(dir, accel) : 1;
      const f = dir.clone().multiplyScalar(accel * b.mass() * dt * scale);
      b.applyImpulse({ x: f.x, y: f.y, z: f.z }, true);
    }
  }

  private take(kind: Kind) {
    const pool = this.things.filter((t) => t.kind === kind);
    const free = pool.find((t) => !t.live);
    if (free) return free;
    // all out: recycle the oldest one nobody's holding
    const old = pool.filter((t) => !this.sim.grips.isHeld(t.body)).sort((a, b) => a.until - b.until)[0];
    return old ?? null;
  }

  private spawnOne(a: Active, now: number) {
    const L = this.level;
    const c = a.center;
    // follow the action (the movers keep walking during a shower)
    const here = this.center();
    const r = () => this.rand();
    switch (a.ev.id) {
      case 'meteors': {
        const t = this.take('rock');
        if (!t) return;
        // the higher the chaos, the closer they land (from Mayhem, some right at the cargo)
        const rMin = [4.5, 3.5, 2.5, 1.5, 0.8][L - 1];
        const aim = L >= 4 && r() < 0.3;
        const at = aim ? this.spot(here, 0.6, 1.5) : this.spot(here, rMin, rMin + 4);
        if (!at) return;
        this.spawn(t, _v.set(at.x + 1.5, at.y + 15, at.z), new THREE.Vector3(-0.6, -7, 0), now + 6);
        t.body.setAngvel({ x: r() * 6 - 3, y: r() * 6 - 3, z: r() * 6 - 3 }, true);
        break;
      }
      case 'balls': {
        const t = this.take('ball');
        if (!t) return;
        const at = c.clone().addScaledVector(a.fwd, 9).addScaledVector(a.side, (r() - 0.5) * 6);
        const g = this.groundAt(at.x, here.y + 4, at.z) ?? here.y;
        const vel = here.clone().sub(at).setY(0).normalize().multiplyScalar(4.5 + L * 0.5).setY(3);
        this.spawn(t, at.setY(g + 3), vel, now + 10);
        break;
      }
      case 'boxes': {
        const t = this.take('box');
        if (!t) return;
        const at = this.spot(here, 1.2, 5.7);
        if (!at) return;
        _q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
        this.spawn(t, _v.set(at.x, at.y + 8 + r() * 3, at.z), new THREE.Vector3(0, -2, 0), now + 16, _q);
        break;
      }
      case 'barrels': {
        const t = this.take('barrel');
        if (!t) return;
        // from up ahead, rolling back down the course at the movers (nearer if the floor runs out)
        const off = (r() - 0.5) * 3;
        let at = here.clone();
        let g: number | null = null;
        for (const k of [11, 8, 6]) {
          at = here.clone().addScaledVector(a.fwd, k).addScaledVector(a.side, off);
          g = this.groundAt(at.x, here.y + 4, at.z);
          if (g !== null && Math.abs(g - here.y) < 4) break;
          g = null;
        }
        if (g === null) return;
        const dir = here.clone().sub(at).setY(0).normalize();
        const speed = 3.5 + L * 0.5;
        // lying down, its axis across the way it rolls
        const axis = new THREE.Vector3().crossVectors(UP, dir).normalize();
        _q.setFromUnitVectors(UP, axis);
        this.spawn(t, at.setY(g + 0.42), dir.clone().multiplyScalar(speed), now + 9, _q);
        const w = axis.clone().multiplyScalar(speed / 0.38);
        t.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
        break;
      }
      case 'stampede': {
        const t = this.take('chicken');
        if (!t) return;
        // in from one side, straight across the course and through the movers
        const s = a.from;
        const along = (r() - 0.5) * 4;
        // from off to the side, or (a narrow deck, a bridge) as far out as there's floor
        let at = here.clone();
        let g: number | null = null;
        const floor = this.groundAt(here.x, here.y + 0.5, here.z) ?? here.y - 0.8;
        for (const k of [7, 5, 3.5, 2.2]) {
          at = here.clone().addScaledVector(a.side, k * s).addScaledVector(a.fwd, along);
          g = this.groundAt(at.x, here.y + 3, at.z);
          // (on the same level as the movers: not down on the grass behind a kerb)
          if (g !== null && Math.abs(g - floor) < 0.6) break;
          g = null;
        }
        if (g === null) return;
        t.run.copy(a.side).multiplyScalar(-s);
        this.spawn(t, at.setY(g + 0.3), t.run.clone().multiplyScalar(5), now + a.ev.dur + 3);
        t.turnAt = now + 99;
        break;
      }
      case 'chickenRain': {
        const t = this.take('chicken');
        if (!t) return;
        const at = this.spot(here, 1, 5);
        if (!at) return;
        const ang = r() * Math.PI * 2;
        t.run.set(Math.cos(ang), 0, Math.sin(ang));
        t.turnAt = now + 2 + r() * 2;
        this.spawn(t, _v.set(at.x, at.y + 9, at.z), new THREE.Vector3(0, -1, 0), now + a.ev.dur + 4);
        break;
      }
    }
  }

  private spawn(t: Thing, pos: THREE.Vector3, vel: THREE.Vector3, until: number, rot?: THREE.Quaternion) {
    const b = t.body;
    b.setEnabled(true);
    b.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    const q = rot ?? (t.kind === 'chicken' ? _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.run.clone().setY(0).normalize()) : _q.identity());
    b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    b.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    t.live = true;
    t.until = until;
    t.landed = false;
  }

  private park(t: Thing) {
    const b = t.body;
    b.setTranslation({ x: t.park.x, y: t.park.y, z: t.park.z }, false);
    b.setLinvel({ x: 0, y: 0, z: 0 }, false);
    b.setAngvel({ x: 0, y: 0, z: 0 }, false);
    b.setEnabled(false);
    t.live = false;
  }

  /** Each live thing, every step: drive the chickens, bonk with the heavy things, tidy away. */
  private keep(t: Thing, now: number, dt: number) {
    if (!t.live) return;
    const b = t.body;
    const p = b.translation();
    const v = b.linvel();
    const held = this.sim.grips.isHeld(b);
    if ((now > t.until && !held) || p.y < -60) {
      if (!held) this.park(t);
      return;
    }
    if (t.kind === 'rock') {
      if (!t.landed && v.y > -1.5 && now > t.until - 5.6) {
        t.landed = true;
        const at = new THREE.Vector3(p.x, p.y - 0.3, p.z);
        this.sim.fx?.burst('dust', at, { count: 14, speed: 3.5, up: 2, size: 0.18, life: 0.9, gravity: -0.2, drag: 2.5 });
        this.sim.fx?.burst('chunk', at, { count: 6, speed: 4, up: 4, size: 0.1, life: 1.2, gravity: 12, colors: [0x5b4a40, 0x7a6658] });
        this.sim.shake?.(0.25);
        this.sim.events.emit('impact', { pos: at, speed: 12, material: 'concrete' });
      }
      bonkPlayers(this.sim, t.col, new THREE.Vector3(v.x, v.y, v.z), 3, 7, this.cooldowns, now);
    } else if (t.kind === 'barrel') {
      bonkPlayers(this.sim, t.col, new THREE.Vector3(v.x, v.y, v.z), 2.4, 4.5, this.cooldowns, now);
    } else if (t.kind === 'chicken' && !held) {
      if (now > t.turnAt) {
        const ang = this.rand() * Math.PI * 2;
        t.run.set(Math.cos(ang), 0, Math.sin(ang));
        t.turnAt = now + 1 + this.rand() * 2;
      }
      const fast = t.turnAt > now + 50 ? 5.2 : 2.6;
      const low = Math.abs(v.y) < 0.6;
      // stuck against a kerb or a wall: flap up and over it
      const stuck = low && Math.hypot(v.x, v.z) < fast * 0.4;
      const hopV = stuck && this.rand() < dt * 8 ? 5.5 : low && this.rand() < dt * 2.5 ? 2.6 : v.y;
      b.setLinvel({ x: t.run.x * fast, y: hopV, z: t.run.z * fast }, true);
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t.run);
      b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    }
  }

  private noteY(n: Note, now: number) {
    return Math.max(n.ground + 0.95, n.y0 - (now - (this.money?.t0 ?? now)) * 1.15);
  }

  // ---------------------------------------------------------------- both laptops: looks

  mirrorFrame(time: number) {
    this.time = time;
  }

  update(dt: number, time: number) {
    this.time = time;
    for (const t of this.things) {
      const pos = t.obj.position;
      const out = pos.y > -100;
      t.obj.visible = out;
      const vy = (pos.y - t.last.y) / Math.max(dt, 1e-3);
      if (t.kind === 'rock') {
        // a falling meteor: a fiery trail, and a red target where it'll land
        const falling = out && vy < -2.5;
        t.trail!.visible = falling;
        if (falling) {
          t.trail!.quaternion.copy(t.obj.quaternion).invert();
          t.trail!.scale.set(1, Math.min(2.2, -vy / 7), 1);
        }
        const ring = t.ring!;
        const g = out && falling ? this.groundAt(pos.x, pos.y - 13, pos.z) : null;
        ring.visible = g !== null && pos.y - g > 1;
        if (ring.visible && g !== null) {
          ring.position.set(pos.x, g + 0.04, pos.z);
          const k = Math.min(1, (pos.y - g) / 14);
          ring.scale.setScalar(0.8 + k * 0.8);
          ring.rotation.y = time * 3;
        }
      } else if (t.kind === 'chicken' && t.wings && out) {
        const flap = Math.abs(vy) > 0.4 ? Math.sin(time * 38) * 0.9 : Math.sin(time * 6) * 0.1;
        for (const w of t.wings) w.rotation.z = flap * (w.userData.side as number);
      }
      t.last.copy(pos);
    }
    // the ground shakes
    if (this.quake > 0) this.sim.shake?.(this.quake * dt * 2.2);
    // the UFO glides in, hums about and its beam reaches the floor
    const u = this.ufo;
    this.ufoObj.visible = !!u;
    if (u) {
      const o = this.ufoObj.position;
      if (o.y < -50 || o.distanceTo(u) > 20) o.copy(u).add(new THREE.Vector3(0, 6, 0));
      o.lerp(u, Math.min(1, dt * 3));
      o.y += Math.sin(time * 2.5) * 0.004;
      this.ufoObj.rotation.y += dt * 1.8;
      const floor = this.groundAt(o.x, o.y - 13, o.z);
      const h = floor === null ? 8 : Math.max(0.5, o.y - 0.2 - floor);
      this.beam.scale.set(1, h, 1);
      this.beam.position.y = -0.2;
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(time * 9) * 0.06;
    }
    // fog rolls in and out
    this.fogK += ((this.fog ? 1 : 0) - this.fogK) * Math.min(1, dt * 0.9);
    this.applyFog();
    // wind streaks blowing past
    const focus = this.sim.cargo?.position(new THREE.Vector3());
    this.windT -= dt;
    if (focus && this.windT <= 0 && (this.gust || this.ice)) {
      this.windT = 0.07;
      for (let i = 0; i < 3; i++) {
        const at = focus.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, Math.random() * 3, (Math.random() - 0.5) * 14));
        if (this.gust) this.sim.fx?.burst('dust', at, { count: 1, speed: 11, spread: 0.05, dir: this.gust, size: 0.07, life: 0.7, gravity: 0, drag: 0, colors: [0xffffff, 0xe6f2ff] });
        else this.sim.fx?.burst('star', at.setY(focus.y + 3), { count: 1, speed: 0.5, size: 0.05, life: 1.6, gravity: 1.2, drag: 1, colors: [0xffffff, 0xcdeeff] });
      }
    }
    // money floating down
    const m = this.money;
    this.noteObjs.forEach((o, i) => {
      const n = m?.notes[i];
      o.visible = !!m && !!n && !(m.got & (1 << i)) && time < m.end;
      if (!o.visible || !n) return;
      const y = this.noteY(n, time);
      const flutter = y > n.ground + 1 ? Math.sin(time * 5 + i) * 0.25 : 0;
      o.position.set(n.x + flutter, y + Math.sin(time * 3 + i) * 0.05, n.z);
      o.rotation.set(Math.sin(time * 4 + i) * 0.5, time * 2.4 + i, 0);
    });
  }

  /** Thicken the scene's fog by fogK (and put it back as it clears). */
  private applyFog() {
    let sc: THREE.Object3D | null = this.root;
    while (sc && !(sc instanceof THREE.Scene)) sc = sc.parent;
    const fog = (sc as THREE.Scene | null)?.fog as THREE.Fog | undefined;
    if (!fog || !(fog instanceof THREE.Fog)) return;
    if (this.fogK < 0.002) {
      if (this.fogWas) {
        fog.near = this.fogWas.near;
        fog.far = this.fogWas.far;
        fog.color.copy(this.fogWas.color);
        this.fogWas = null;
      }
      return;
    }
    this.fogWas ??= { near: fog.near, far: fog.far, color: fog.color.clone() };
    const k = this.fogK;
    const w = this.fogWas;
    fog.near = w.near + (3 - w.near) * k;
    fog.far = w.far + (21 - w.far) * k;
    fog.color.copy(w.color).lerp(new THREE.Color(0xdfe3e6), k);
  }

  /** The HUD's chaos line: what's going on right now. */
  hudLine() {
    const lv = chaosLevel(this.level);
    const now = this.shown
      .filter((s) => s.end > this.time && CHAOS_EVENTS[s.ev])
      .map((s) => `${CHAOS_EVENTS[s.ev].text.replace(/!.*$/, '')} ${Math.ceil(s.end - this.time)}`)
      .join(' · ');
    return `${lv.icon} ${lv.name}${now ? ` · ${now}` : ''}`;
  }

  // ---------------------------------------------------------------- online

  netState() {
    const m = this.money;
    const s = [this.quake, this.gust?.x ?? 0, this.gust?.z ?? 0, this.gust ? 1 : 0, this.ice ? 1 : 0];
    for (let i = 0; i < 2; i++) s.push(this.shown[i]?.ev ?? -1, this.shown[i]?.end ?? 0);
    s.push(this.ufo ? 1 : 0, this.ufo?.x ?? 0, this.ufo?.y ?? 0, this.ufo?.z ?? 0, this.fog ? 1 : 0);
    if (m) {
      s.push(m.t0, m.end, m.got, m.notes.length);
      for (const n of m.notes) s.push(n.x, n.z, n.y0, n.ground);
    }
    return s;
  }

  applyNetState(s: number[]) {
    this.quake = s[0] ?? 0;
    this.gust = s[3] ? new THREE.Vector3(s[1], 0, s[2]) : null;
    this.ice = !!s[4];
    this.shown = [];
    for (let i = 0; i < 2; i++) if ((s[5 + i * 2] ?? -1) >= 0) this.shown.push({ ev: s[5 + i * 2], end: s[6 + i * 2] });
    this.ufo = s[9] ? new THREE.Vector3(s[10], s[11], s[12]) : null;
    this.fog = !!s[13];
    if (s.length > 14) {
      const n = s[17] ?? 0;
      const notes: Note[] = [];
      for (let i = 0; i < n; i++) notes.push({ x: s[18 + i * 4], z: s[19 + i * 4], y0: s[20 + i * 4], ground: s[21 + i * 4] });
      this.money = { t0: s[14], end: s[15], got: s[16], notes };
    } else this.money = null;
  }

  dispose() {
    // put the world back the way it was
    tuning.physics.gravity = BASE.gravity;
    tuning.jump.velocity = BASE.jump;
    for (const p of this.sim.players ?? []) {
      p.speedScale = 1;
      p.slippery = false;
    }
    this.fogK = 0;
    this.applyFog();
    this.root.removeFromParent();
  }
}

registerHazard('chaos', (o, sim) => new ChaosDirector(o, sim));
