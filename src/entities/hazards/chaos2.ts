import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider, RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { G, groups, SOLID } from '../../physics/groups';
import { jelly, matte } from '../../render/materials';
import { tuning } from '../../config/tuning';
import type { ChaosActs, ChaosHelp } from '../../game/chaos';
import type { Player } from '../Player';
import { registerHazard, Hazard } from './registry';
import { bonkPlayers } from './common';
import { models } from '../../render/models';

/**
 * The chaos director's companion: plays the newer kinds of chaos (blackout,
 * a giant boulder, a tornado, banana peels, the floor is lava, bees, swap,
 * mirror controls, disco, a flood, a dinosaur, slow-mo and fast-forward).
 * The director picks what happens and when (entities/hazards/chaos.ts) and
 * hands these over through `sim.chaosActs`.
 *
 * Online-safe the same way: the boulder and the dinosaur are made up front
 * and parked (the guest's copies move from the host's snapshots), and
 * everything else is looks driven by netState.
 */

const IDS = new Set(['blackout', 'boulder', 'tornado', 'bananas', 'lava', 'bees', 'swap', 'mirror', 'disco', 'flood', 'dino', 'slowmo', 'fastfwd']);
const MAX_LAVA = 6;
const MAX_PEELS = 8;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
/** Looks only: how long the lava glows before it's hot. */
const LAVA_WARM = 1.6;
const PARK_Y = -320;

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  return o;
}

/** A friendly-ish T-Rex (looks only) facing +Z, standing on the origin. Its two legs swing. */
function trex() {
  const g = new THREE.Group();
  const skin = jelly(0x4c9a4a, 0.4);
  const belly = jelly(0xa8d672, 0.35);
  const body = mesh(new THREE.SphereGeometry(0.9, 18, 14), skin);
  body.scale.set(0.85, 0.85, 1.45);
  body.position.set(0, 2.35, 0);
  body.rotation.x = -0.25;
  const tum = mesh(new THREE.SphereGeometry(0.72, 16, 12), belly);
  tum.scale.set(0.8, 0.8, 1.2);
  tum.position.set(0, 2.15, 0.3);
  const tail = mesh(new THREE.ConeGeometry(0.62, 2.8, 14).rotateX(-Math.PI / 2), skin);
  tail.position.set(0, 2.5, -2.2);
  tail.rotation.x = 0.18;
  const neck = mesh(new THREE.CylinderGeometry(0.42, 0.55, 1, 12), skin);
  neck.position.set(0, 3.05, 1.05);
  neck.rotation.x = 0.7;
  const head = mesh(new THREE.BoxGeometry(0.8, 0.7, 1.25), skin);
  head.position.set(0, 3.55, 1.6);
  const jaw = mesh(new THREE.BoxGeometry(0.72, 0.22, 1.05), belly);
  jaw.position.set(0, 3.15, 1.62);
  jaw.rotation.x = 0.18;
  const toothMat = matte(0xfbf8f2);
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const t = mesh(new THREE.ConeGeometry(0.05, 0.14, 6).rotateX(Math.PI), toothMat, false);
      t.position.set(s * 0.3, 3.25, 1.3 + i * 0.16);
      g.add(t);
    }
  const eyeMat = matte(0x222222);
  for (const s of [-1, 1]) {
    const w = mesh(new THREE.SphereGeometry(0.13, 10, 8), matte(0xffffff), false);
    w.position.set(s * 0.38, 3.75, 1.75);
    const e = mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat, false);
    e.position.set(s * 0.46, 3.77, 1.8);
    const arm = mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.45, 6), skin, false);
    arm.position.set(s * 0.45, 2.3, 1.05);
    arm.rotation.x = 1.1;
    g.add(w, e, arm);
  }
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.5, 2.0, -0.1);
    const thigh = mesh(new THREE.CylinderGeometry(0.32, 0.22, 1.2, 10), skin);
    thigh.position.y = -0.55;
    const shin = mesh(new THREE.CylinderGeometry(0.18, 0.15, 0.95, 8), skin);
    shin.position.set(0, -1.3, -0.12);
    shin.rotation.x = -0.25;
    const foot = mesh(new THREE.BoxGeometry(0.42, 0.18, 0.7), skin);
    foot.position.set(0, -1.85, 0.12);
    hip.add(thigh, shin, foot);
    hip.userData.side = s;
    legs.push(hip);
    g.add(hip);
  }
  g.add(body, tum, tail, neck, head, jaw);
  return { obj: g, legs };
}

/** A banana peel lying on the floor (looks only). */
function peel() {
  const g = new THREE.Group();
  const yellow = jelly(0xffd23f, 0.3);
  for (let i = 0; i < 4; i++) {
    const p = mesh(new THREE.SphereGeometry(0.1, 8, 6), yellow, false);
    p.scale.set(0.55, 0.25, 2.1);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    p.position.set(Math.sin(a) * 0.16, 0.03, Math.cos(a) * 0.16);
    p.rotation.y = a;
    g.add(p);
  }
  const top = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 6), matte(0x6b4a1f), false);
  top.position.y = 0.07;
  g.add(top);
  g.visible = false;
  return g;
}

interface Walker {
  body: RigidBody;
  col: Collider;
  obj: THREE.Object3D;
  park: THREE.Vector3;
  live: boolean;
  until: number;
}

class ChaosCompanion implements Hazard, ChaosActs {
  private root = new THREE.Group();
  private help: ChaosHelp | null = null;
  private cooldowns = new Map<Player, number>();
  private hotCool = new Map<object, number>();
  // the two bodies it can throw in
  private boulder: Walker;
  private dino: Walker & { legs: THREE.Object3D[]; from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number; walked: number; lastPos: THREE.Vector3 };
  // what's on (the host sets these as things happen; the guest gets them from netState)
  private black = false;
  private disco = false;
  private lava: { t0: number; spots: THREE.Vector3[] } | null = null;
  private peels: { spots: THREE.Vector3[]; got: number } | null = null;
  private bees: THREE.Vector3 | null = null;
  private tornado: THREE.Vector3 | null = null;
  private flood: { y: number; c: THREE.Vector3 } | null = null;
  // host only
  private beeTarget = 0;
  private beeCool = 0;
  private tornVel = new THREE.Vector3();
  private floodPlan: { base: number; t0: number; t1: number } | null = null;
  private discoUntil = 0;
  private fwd = new THREE.Vector3(0, 0, -1);
  // looks
  private light = new THREE.PointLight(0xfff1d6, 0, 13, 1.4);
  private blackK = 0;
  private discoK = 0;
  private exposureSet = 1;
  private discoBall = new THREE.Group();
  private lavaObjs: THREE.Mesh[] = [];
  private lavaMat = new THREE.MeshStandardMaterial({ color: 0x5a1a08, emissive: 0xff4a12, emissiveIntensity: 0.3, roughness: 0.6 });
  private peelObjs: THREE.Object3D[] = [];
  private beesObj: THREE.Points;
  private tornadoObj = new THREE.Group();
  private water: THREE.Mesh;
  private dinoStep = 0;
  private dinoMixer: THREE.AnimationMixer | null = null;
  private dinoLook = new THREE.Vector3(46, PARK_Y, 40);

  constructor(
    _o: HazardObj,
    private sim: Sim,
  ) {
    sim.chaosActs = this;
    sim.scene.add(this.root);
    this.root.add(this.light);
    const world = sim.physics.world;

    // the boulder
    const bb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(40, PARK_Y, 40).setLinearDamping(0.02).setAngularDamping(0.05).setCcdEnabled(true).setEnabled(false));
    const bc = world.createCollider(
      RAPIER.ColliderDesc.ball(1.25).setMass(350).setFriction(0.9).setRestitution(0.05).setCollisionGroups(groups(G.HAZARD, SOLID | G.DEBRIS)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      bb,
    );
    sim.physics.setInfo(bc, { kind: 'hazard', material: 'concrete', grabbable: false });
    const rock = new THREE.Group();
    const stone = mesh(new THREE.IcosahedronGeometry(1.28, 1), new THREE.MeshStandardMaterial({ color: 0x8a7c6d, roughness: 0.95, flatShading: true }));
    const moss = mesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshStandardMaterial({ color: 0x6e8b3d, roughness: 1, flatShading: true }), false);
    moss.position.set(0.5, 0.85, 0.3);
    rock.add(stone, moss);
    rock.visible = false;
    this.root.add(rock);
    sim.physics.link(bb, rock);
    this.boulder = { body: bb, col: bc, obj: rock, park: new THREE.Vector3(40, PARK_Y, 40), live: false, until: 0 };

    // the dinosaur: a kinematic body for its legs and middle, so it shoves whatever it walks into
    const db = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(46, PARK_Y, 40).setEnabled(false));
    const dc = world.createCollider(RAPIER.ColliderDesc.capsule(0.75, 0.75).setTranslation(0, 1.5, 0).setCollisionGroups(groups(G.HAZARD, SOLID | G.DEBRIS)), db);
    sim.physics.setInfo(dc, { kind: 'hazard', material: 'body', grabbable: false });
    // (the Sketchfab T-Rex, walking, if it's loaded; else one of our own)
    let t: { obj: THREE.Object3D; legs: THREE.Object3D[] };
    if (models.has('trex')) {
      const m = models.instance('trex', [1.9, 4.2, 6.4]);
      const g = new THREE.Group();
      m.object.position.y = m.size[1] / 2;
      g.add(m.object);
      t = { obj: g, legs: [] };
      if (m.clips.length && m.root) {
        this.dinoMixer = new THREE.AnimationMixer(m.root);
        const walk = m.clips.find((c) => /walk|run/i.test(c.name)) ?? m.clips[0];
        this.dinoMixer.clipAction(walk).play();
      }
    } else t = trex();
    t.obj.visible = false;
    this.root.add(t.obj);
    sim.physics.link(db, t.obj);
    this.dino = { body: db, col: dc, obj: t.obj, park: new THREE.Vector3(46, PARK_Y, 40), live: false, until: 0, legs: t.legs, from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, t1: 0, walked: 0, lastPos: new THREE.Vector3(46, PARK_Y, 40) };

    // a disco ball
    const ball = mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.15, flatShading: true }), false);
    const string = mesh(new THREE.CylinderGeometry(0.01, 0.01, 3, 4), matte(0x444444), false);
    string.position.y = 1.9;
    this.discoBall.add(ball, string);
    this.discoBall.visible = false;
    this.root.add(this.discoBall);

    // lava spots, banana peels
    const disc = new THREE.CircleGeometry(1.1, 28).rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_LAVA; i++) {
      const m = new THREE.Mesh(disc, this.lavaMat);
      m.visible = false;
      m.receiveShadow = false;
      this.root.add(m);
      this.lavaObjs.push(m);
    }
    for (let i = 0; i < MAX_PEELS; i++) {
      const p = peel();
      this.root.add(p);
      this.peelObjs.push(p);
    }

    // a swarm of bees
    const n = 46;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = new THREE.Color(i % 3 ? 0xffc928 : 0x222222);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.beesObj = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, sizeAttenuation: true }));
    this.beesObj.visible = false;
    this.beesObj.frustumCulled = false;
    this.root.add(this.beesObj);

    // a tornado: three spinning funnels and some debris going round
    const funnelMat = new THREE.MeshStandardMaterial({ color: 0x9a8f80, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(1.6 + i * 0.9, 0.35 + i * 0.5, 2.6, 18, 1, true), funnelMat);
      f.position.y = 1.3 + i * 2.2;
      f.name = `funnel${i}`;
      this.tornadoObj.add(f);
    }
    for (let i = 0; i < 10; i++) {
      const d = mesh(new THREE.BoxGeometry(0.18, 0.12, 0.22), matte(i % 2 ? 0x8a6a42 : 0x6e8b3d), false);
      d.name = `debris${i}`;
      this.tornadoObj.add(d);
    }
    this.tornadoObj.visible = false;
    this.root.add(this.tornadoObj);

    // flood water
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3d8fd6, transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.1, depthWrite: false }),
    );
    this.water.visible = false;
    this.water.renderOrder = 2;
    this.root.add(this.water);
  }

  handles(id: string) {
    return IDS.has(id);
  }

  // ---------------------------------------------------------------- host: what happens

  start(id: string, a: { t0: number; t1: number; center: THREE.Vector3; fwd: THREE.Vector3; side: THREE.Vector3 }, help: ChaosHelp) {
    this.help = help;
    this.fwd.copy(a.fwd);
    const L = help.level;
    const r = () => help.rand();
    const c = a.center;
    const ps = this.sim.players ?? [];
    switch (id) {
      case 'blackout':
        this.black = true;
        break;
      case 'disco':
        this.disco = true;
        this.discoUntil = a.t0 + 2.6;
        break;
      case 'mirror':
        this.sim.flipControls = true;
        break;
      case 'slowmo':
        this.sim.timeScale = 0.4;
        break;
      case 'fastfwd':
        this.sim.timeScale = 1.6;
        break;
      case 'swap': {
        // the two movers trade places (and which way they face)
        if (ps.length < 2) break;
        const [p, q] = ps;
        const lift = tuning.float.rideHeight + 0.05;
        const pa = p.bodyPos.clone().setY(p.bodyPos.y - lift);
        const qa = q.bodyPos.clone().setY(q.bodyPos.y - lift);
        const py = p.facingYaw;
        const qy = q.facingYaw;
        p.teleport(qa, qy);
        q.teleport(pa, py);
        this.sim.physics.snapLinks();
        for (const at of [pa, qa]) this.sim.fx?.burst('smoke', at.clone().setY(at.y + 1), { count: 14, speed: 1.6, up: 1, size: 0.3, life: 0.8, gravity: -0.5, drag: 2, colors: [0xffffff, 0xe0e0ff] });
        break;
      }
      case 'boulder': {
        // from behind, rolling down the course after the movers
        const b = this.boulder;
        let at: THREE.Vector3 | null = null;
        for (const k of [13, 10, 8, 6]) {
          const base = c.clone().addScaledVector(a.fwd, -k);
          const g = help.groundAt(base.x, c.y + 4, base.z);
          if (g !== null && Math.abs(g - (c.y - 0.8)) < 3) {
            at = base.setY(g + 1.3);
            break;
          }
        }
        if (!at) break;
        const speed = 3.6 + 0.45 * L;
        b.body.setEnabled(true);
        b.body.setTranslation({ x: at.x, y: at.y, z: at.z }, true);
        b.body.setLinvel({ x: a.fwd.x * speed, y: 0, z: a.fwd.z * speed }, true);
        const w = new THREE.Vector3().crossVectors(UP, a.fwd).multiplyScalar(speed / 1.25);
        b.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true);
        b.live = true;
        b.until = a.t1;
        break;
      }
      case 'dino': {
        // across the course, close by the movers
        const d = this.dino;
        const s = r() < 0.5 ? 1 : -1;
        const along = (r() - 0.5) * 3;
        const g = help.groundAt(c.x, c.y + 3, c.z) ?? c.y - 0.8;
        d.from.copy(c).addScaledVector(a.side, 11 * s).addScaledVector(a.fwd, along).setY(g);
        d.to.copy(c).addScaledVector(a.side, -11 * s).addScaledVector(a.fwd, along).setY(g);
        d.t0 = a.t0;
        d.t1 = a.t1;
        d.walked = 0;
        d.lastPos.copy(d.from);
        d.body.setEnabled(true);
        d.body.setTranslation({ x: d.from.x, y: d.from.y, z: d.from.z }, true);
        d.live = true;
        d.until = a.t1;
        break;
      }
      case 'tornado': {
        const s = r() < 0.5 ? 1 : -1;
        this.tornado = c.clone().addScaledVector(a.side, 7 * s).addScaledVector(a.fwd, 2 + r() * 4);
        this.tornVel.set(0, 0, 0);
        break;
      }
      case 'bananas': {
        const n = Math.min(MAX_PEELS, 3 + L);
        const spots: THREE.Vector3[] = [];
        for (let i = 0; i < n; i++) {
          const base = c.clone().addScaledVector(a.fwd, 1.5 + r() * 7).addScaledVector(a.side, (r() - 0.5) * 3.5);
          const at = help.spot(base, 0, 1.2);
          if (at) spots.push(at);
        }
        this.peels = { spots, got: 0 };
        break;
      }
      case 'lava': {
        const n = Math.min(MAX_LAVA, 3 + Math.floor(L / 1.5));
        const spots: THREE.Vector3[] = [];
        for (let i = 0; i < n; i++) {
          const base = i % 2 ? c.clone().addScaledVector(a.fwd, 3 + r() * 4) : c;
          const at = help.spot(base, i % 2 ? 0 : 1, i % 2 ? 1.5 : 3.5);
          if (at && !spots.some((o) => o.distanceTo(at) < 1.8)) spots.push(at);
        }
        this.lava = { t0: a.t0, spots };
        break;
      }
      case 'bees': {
        const s = r() < 0.5 ? 1 : -1;
        this.bees = c.clone().addScaledVector(a.side, 8 * s).add(new THREE.Vector3(0, 1.5, 0));
        this.beeTarget = Math.floor(r() * Math.max(1, ps.length));
        this.beeCool = 0;
        break;
      }
      case 'flood': {
        const base = help.groundAt(c.x, c.y + 2, c.z) ?? c.y - 0.8;
        this.floodPlan = { base, t0: a.t0, t1: a.t1 };
        this.flood = { y: base - 0.4, c: c.clone() };
        for (const p of ps) this.sim.events.emit('splash', { pos: p.bodyPos.clone(), amount: 0.4 });
        break;
      }
    }
  }

  end(id: string) {
    switch (id) {
      case 'blackout':
        this.black = false;
        break;
      case 'disco':
        this.disco = false;
        break;
      case 'mirror':
        this.sim.flipControls = false;
        break;
      case 'slowmo':
      case 'fastfwd':
        this.sim.timeScale = 1;
        break;
      case 'tornado':
        this.tornado = null;
        break;
      case 'bananas':
        this.peels = null;
        break;
      case 'lava':
        this.lava = null;
        break;
      case 'bees':
        this.bees = null;
        break;
      case 'flood':
        this.flood = null;
        this.floodPlan = null;
        for (const p of this.sim.players ?? []) p.speedScale = 1;
        break;
    }
  }

  tick(id: string, now: number, dt: number) {
    const L = this.help?.level ?? 3;
    const ps = this.sim.players ?? [];
    switch (id) {
      case 'disco': {
        // everybody dance (for a couple of seconds): a little shuffle round and a hop now and then
        if (now > this.discoUntil) break;
        ps.forEach((p, i) => {
          const t = now * 5 + i * 1.7;
          p.intent.moveX = Math.cos(t) * 0.3;
          p.intent.moveZ = Math.sin(t) * 0.3;
          if (Math.sin(now * 9 + i) > 0.97) p.intent.jumpPressed = true;
        });
        break;
      }
      case 'boulder': {
        const b = this.boulder;
        if (!b.live) break;
        const v = b.body.linvel();
        bonkPlayers(this.sim, b.col, new THREE.Vector3(v.x, v.y, v.z), 1.8, 8, this.cooldowns, now);
        // keep it rolling after the movers (a nudge, not a homing missile)
        const want = this.fwd;
        b.body.applyImpulse({ x: want.x * 350 * 2.2 * dt, y: 0, z: want.z * 350 * 2.2 * dt }, true);
        break;
      }
      case 'dino': {
        const d = this.dino;
        if (!d.live) break;
        const k = Math.min(1, (now - d.t0) / Math.max(0.1, d.t1 - d.t0 - 0.5));
        const p = _v.copy(d.from).lerp(d.to, k);
        const dir = d.to.clone().sub(d.from).setY(0).normalize();
        _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        d.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
        d.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
        // every stomp: anyone close by is knocked off their feet, loose things jump
        d.walked += p.distanceTo(d.lastPos);
        d.lastPos.copy(p);
        if (d.walked > 1.5) {
          d.walked = 0;
          for (const q of ps) {
            const dist = Math.hypot(q.bodyPos.x - p.x, q.bodyPos.z - p.z);
            if (dist < 2.8) {
              // (on Mild it only throws them off balance: a fall can cost a fragile load)
              if (L >= 2) q.knock(3);
              q.applyBlast(_v.set(q.bodyPos.x - p.x, 0, q.bodyPos.z - p.z).normalize().multiplyScalar(3).setY(2.5).multiplyScalar(q.totalMass));
            } else if (dist < 6) q.applyBlast(new THREE.Vector3(0, 1.6 * q.totalMass, 0));
          }
          const cargo = this.sim.cargo;
          if (cargo && !this.sim.grips.isHeld(cargo.body)) {
            const cp = cargo.body.translation();
            if (Math.hypot(cp.x - p.x, cp.z - p.z) < 6) cargo.body.applyImpulse({ x: 0, y: 1.4 * cargo.body.mass(), z: 0 }, true);
          }
        }
        break;
      }
      case 'tornado': {
        const t = this.tornado;
        const c = this.help?.center();
        if (!t || !c) break;
        // it wanders toward the movers, wobbling about
        const to = c.clone().addScaledVector(this.fwd, 1.5).sub(t).setY(0);
        if (to.lengthSq() > 0.01) to.normalize();
        this.tornVel.lerp(to.multiplyScalar(1.4 + 0.2 * L).add(new THREE.Vector3(Math.sin(now * 1.3) * 0.9, 0, Math.cos(now * 1.1) * 0.9)), Math.min(1, dt * 1.5));
        t.addScaledVector(this.tornVel, dt);
        const g = this.help?.groundAt(t.x, c.y + 3, t.z) ?? null;
        if (g !== null) t.y = g;
        this.suck(t, L, dt);
        break;
      }
      case 'bananas': {
        const pl = this.peels;
        if (!pl) break;
        pl.spots.forEach((s, i) => {
          if (pl.got & (1 << i)) return;
          for (const p of ps) {
            if (Math.hypot(p.bodyPos.x - s.x, p.bodyPos.z - s.z) > 0.55 || Math.abs(p.bodyPos.y - tuning.float.rideHeight - s.y) > 0.6) continue;
            pl.got |= 1 << i;
            const v = p.body.linvel();
            p.knock(3);
            p.applyBlast(_v.set(v.x * 0.8, 2.4, v.z * 0.8).multiplyScalar(p.totalMass));
            this.sim.events.emit('slip', { player: p.index, pos: s.clone() });
            break;
          }
        });
        break;
      }
      case 'lava': {
        const lv = this.lava;
        if (!lv || now - lv.t0 < LAVA_WARM) break;
        // hot feet: anyone (or anything set down) in it hops out, smartish
        for (const s of lv.spots) {
          for (const p of ps) {
            if (Math.hypot(p.bodyPos.x - s.x, p.bodyPos.z - s.z) > 1.1 || Math.abs(p.bodyPos.y - tuning.float.rideHeight - s.y) > 0.7) continue;
            if ((this.hotCool.get(p) ?? -9) > now - 0.9) continue;
            this.hotCool.set(p, now);
            const ang = Math.random() * Math.PI * 2;
            p.applyBlast(_v.set(Math.cos(ang) * 1.6, 4.6, Math.sin(ang) * 1.6).multiplyScalar(p.totalMass));
            this.sim.events.emit('hazard', { pos: s.clone(), kind: 'lava' });
            this.sim.fx?.burst('smoke', s.clone().setY(s.y + 0.3), { count: 6, speed: 0.8, up: 1.5, size: 0.2, life: 0.8, gravity: -1, drag: 1.5, colors: [0x555555, 0x888888] });
          }
          const cargo = this.sim.cargo;
          if (cargo && !this.sim.grips.isHeld(cargo.body)) {
            const cp = cargo.body.translation();
            if (Math.hypot(cp.x - s.x, cp.z - s.z) < 1.1 && cp.y - s.y < 1.2 && (this.hotCool.get(cargo) ?? -9) < now - 1.2) {
              this.hotCool.set(cargo, now);
              cargo.body.applyImpulse({ x: 0, y: 2.6 * cargo.body.mass(), z: 0 }, true);
            }
          }
        }
        break;
      }
      case 'bees': {
        const b = this.bees;
        if (!b || !ps.length) break;
        const target = ps[this.beeTarget % ps.length];
        const to = target.bodyPos.clone().add(new THREE.Vector3(0, 0.4, 0)).sub(b);
        const dist = to.length();
        b.addScaledVector(to.normalize(), Math.min(dist, (2.5 + 0.25 * L) * dt));
        this.beeCool -= dt;
        if (dist < 0.9 && this.beeCool <= 0) {
          // stung! (and off they go after the other one)
          this.beeCool = 1.6;
          if (L >= 2) target.knock(1.5);
          const ang = Math.random() * Math.PI * 2;
          target.applyBlast(_v.set(Math.cos(ang) * 2, 1.5, Math.sin(ang) * 2).multiplyScalar(target.totalMass));
          this.beeTarget++;
        }
        break;
      }
      case 'flood': {
        const plan = this.floodPlan;
        const f = this.flood;
        if (!plan || !f) break;
        // rises over 2.5 s, stays, drains over the last 2
        const up = Math.min(1, (now - plan.t0) / 2.5);
        const down = Math.min(1, Math.max(0, (plan.t1 - now) / 2));
        f.y = plan.base - 0.4 + 1.05 * Math.min(up, down);
        this.float(f, dt);
        for (const p of ps) p.speedScale = p.bodyPos.y - tuning.float.rideHeight < f.y - 0.15 ? 0.6 : 1;
        break;
      }
    }
  }

  /** The tornado pulls loose things in, round and up (not too high). */
  private suck(t: THREE.Vector3, L: number, dt: number) {
    const world = this.sim.physics.world;
    const seen = new Set<number>();
    const bodies: RigidBody[] = [];
    world.collidersWithAabbIntersectingAabb({ x: t.x, y: t.y + 3, z: t.z }, { x: 5, y: 4, z: 5 }, (col) => {
      const b = col.parent();
      if (!b || !b.isDynamic() || seen.has(b.handle)) return true;
      seen.add(b.handle);
      bodies.push(b);
      return true;
    });
    const g = tuning.physics.gravity;
    for (const b of bodies) {
      const p = b.translation();
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 4.5) continue;
      const k = 1 - d / 4.5;
      const m = b.mass();
      const inX = (dx / Math.max(d, 0.1)) * (5 + 0.8 * L) * k;
      const inZ = (dz / Math.max(d, 0.1)) * (5 + 0.8 * L) * k;
      // round (counter-clockwise), in, and up while it's low
      const sw = (6 + L) * k;
      const lift = p.y - t.y < 2.6 ? g * (0.75 + 0.1 * L) * k : 0;
      b.applyImpulse({ x: (inX - (dz / Math.max(d, 0.1)) * sw) * m * dt, y: lift * m * dt, z: (inZ + (dx / Math.max(d, 0.1)) * sw) * m * dt }, true);
    }
  }

  /** Flood water: things in it float (a bit) and slow down. */
  private float(f: { y: number; c: THREE.Vector3 }, dt: number) {
    const world = this.sim.physics.world;
    const seen = new Set<number>();
    const bodies: RigidBody[] = [];
    world.collidersWithAabbIntersectingAabb({ x: f.c.x, y: f.y, z: f.c.z }, { x: 30, y: 3, z: 30 }, (col) => {
      const b = col.parent();
      if (!b || !b.isDynamic() || seen.has(b.handle)) return true;
      seen.add(b.handle);
      bodies.push(b);
      return true;
    });
    const g = tuning.physics.gravity;
    for (const b of bodies) {
      const p = b.translation();
      const depth = Math.min(1, Math.max(0, (f.y - p.y + 0.25) / 0.5));
      if (depth <= 0) continue;
      const m = b.mass();
      const v = b.linvel();
      b.applyImpulse({ x: -v.x * 1.4 * m * dt * depth, y: (g * 0.85 * depth - v.y * 1.2 * depth) * m * dt, z: -v.z * 1.4 * m * dt * depth }, true);
    }
  }

  preStep() {
    const now = this.sim.time();
    // tidy away the boulder and the dinosaur when they're done
    for (const w of [this.boulder, this.dino]) {
      if (!w.live) continue;
      const y = w.body.translation().y;
      if (now > w.until || y < -60) {
        w.body.setTranslation({ x: w.park.x, y: w.park.y, z: w.park.z }, false);
        if (w.body.isDynamic()) {
          w.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
          w.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        }
        w.body.setEnabled(false);
        w.live = false;
      }
    }
  }

  // ---------------------------------------------------------------- both laptops: looks

  update(dt: number, time: number) {
    this.boulder.obj.visible = this.boulder.obj.position.y > -100;
    // the dinosaur's legs swing as it goes, and each stomp shakes the ground
    const d = this.dino;
    const dp = d.obj.position;
    d.obj.visible = dp.y > -100;
    if (d.obj.visible) {
      const moved = Math.hypot(dp.x - this.dinoLook.x, dp.z - this.dinoLook.z);
      if (moved < 3) this.dinoStep += moved / 0.75;
      d.legs.forEach((leg) => (leg.rotation.x = Math.sin(this.dinoStep * Math.PI * 0.5 + ((leg.userData.side as number) > 0 ? 0 : Math.PI)) * 0.55));
      // (the model's own walk, in step with how far it went)
      this.dinoMixer?.update(Math.min(0.1, moved / 2.2));
      if (Math.floor(this.dinoStep / 2) !== Math.floor((this.dinoStep - moved / 0.75) / 2)) {
        this.sim.shake?.(0.3);
        this.sim.fx?.burst('dust', dp.clone().add(new THREE.Vector3(0, 0.1, 0)), { count: 10, speed: 2.4, up: 0.6, size: 0.2, life: 0.8, gravity: -0.2, drag: 2.5 });
      }
    }
    this.dinoLook.copy(dp);

    // blackout and disco: the picture darkens (or strobes), and a light goes with the movers
    this.blackK += ((this.black ? 1 : 0) - this.blackK) * Math.min(1, dt * 2.5);
    this.discoK += ((this.disco ? 1 : 0) - this.discoK) * Math.min(1, dt * 4);
    const strobe = this.discoK > 0.01 ? 0.55 + 0.35 * Math.sin(time * 14) : 1;
    // (the HUD darkens the screen round the edges too: see dark())
    const k = (1 - 0.55 * this.blackK) * (1 - (1 - strobe) * this.discoK);
    if (Math.abs(k - this.exposureSet) > 0.002) {
      this.exposureSet = k;
      this.sim.exposure?.(k);
    }
    const ps = this.sim.players ?? [];
    const mid = new THREE.Vector3();
    for (const p of ps) mid.add(p.bodyPos);
    if (ps.length) mid.multiplyScalar(1 / ps.length);
    const lit = Math.max(this.blackK, this.discoK);
    this.light.visible = lit > 0.01;
    if (this.light.visible) {
      this.light.position.copy(mid).add(new THREE.Vector3(0, 2.8, 0));
      this.light.intensity = 30 * this.blackK + 14 * this.discoK;
      if (this.discoK > 0.05) this.light.color.setHSL((time * 0.6) % 1, 0.9, 0.6);
      else this.light.color.set(0xfff1d6);
    }
    this.discoBall.visible = this.discoK > 0.05;
    if (this.discoBall.visible) {
      this.discoBall.position.copy(mid).add(new THREE.Vector3(0, 4.2, 0));
      this.discoBall.rotation.y += dt * 2;
    }

    // lava glows (then bubbles)
    const lv = this.lava;
    this.lavaObjs.forEach((o, i) => {
      const s = lv?.spots[i];
      o.visible = !!s;
      if (s) o.position.set(s.x, s.y + 0.03, s.z);
    });
    if (lv) {
      const hot = time - lv.t0 >= LAVA_WARM;
      this.lavaMat.emissiveIntensity = hot ? 1.6 + Math.sin(time * 6) * 0.3 : 0.3 + (Math.sin(time * 18) > 0 ? 0.5 : 0);
      this.lavaMat.emissive.set(hot ? 0xff6a1a : 0xff3a12);
      if (hot && Math.random() < dt * 4) {
        const s = lv.spots[Math.floor(Math.random() * lv.spots.length)];
        if (s) this.sim.fx?.burst('blob', s.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.05, (Math.random() - 0.5) * 1.4)), { count: 2, speed: 0.6, up: 2, size: 0.08, life: 0.6, gravity: 6, colors: [0xff8a2a, 0xffc04a] });
      }
    }

    // banana peels
    const pl = this.peels;
    this.peelObjs.forEach((o, i) => {
      const s = pl?.spots[i];
      o.visible = !!s && !(pl!.got & (1 << i));
      if (o.visible && s) o.position.set(s.x, s.y, s.z);
    });

    // the bee swarm buzzes about its middle
    const b = this.bees;
    this.beesObj.visible = !!b;
    if (b) {
      const pos = this.beesObj.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const a = time * (3 + (i % 5)) + i * 2.3;
        const r = 0.25 + ((i * 37) % 10) * 0.05;
        pos.setXYZ(i, b.x + Math.cos(a) * r, b.y + Math.sin(a * 1.3 + i) * r * 0.6, b.z + Math.sin(a) * r);
      }
      pos.needsUpdate = true;
    }

    // the tornado spins
    const t = this.tornado;
    this.tornadoObj.visible = !!t;
    if (t) {
      const o = this.tornadoObj;
      o.position.lerp(t, o.position.y < -50 || o.position.distanceTo(t) > 6 ? 1 : Math.min(1, dt * 6));
      o.children.forEach((c, i) => {
        if (c.name.startsWith('funnel')) c.rotation.y += dt * (5 + i);
        else {
          const a = time * 4 + i * 0.63;
          const r = 1 + (i % 3) * 0.8;
          c.position.set(Math.cos(a) * r, 0.5 + (i % 5) * 1.1, Math.sin(a) * r);
          c.rotation.set(a, a * 1.3, 0);
        }
      });
    }

    // flood water
    const f = this.flood;
    this.water.visible = !!f;
    if (f) this.water.position.set(f.c.x, f.y + Math.sin(time * 1.7) * 0.03, f.c.z);
  }

  dark() {
    return this.blackK;
  }

  // ---------------------------------------------------------------- online

  netState() {
    let mask = 0;
    const s: number[] = [0];
    if (this.black) mask |= 1;
    if (this.disco) mask |= 2;
    if (this.lava) {
      mask |= 4;
      s.push(this.lava.t0, this.lava.spots.length);
      for (const p of this.lava.spots) s.push(p.x, p.y, p.z);
    }
    if (this.peels) {
      mask |= 8;
      s.push(this.peels.got, this.peels.spots.length);
      for (const p of this.peels.spots) s.push(p.x, p.y, p.z);
    }
    if (this.bees) {
      mask |= 16;
      s.push(this.bees.x, this.bees.y, this.bees.z);
    }
    if (this.tornado) {
      mask |= 32;
      s.push(this.tornado.x, this.tornado.y, this.tornado.z);
    }
    if (this.flood) {
      mask |= 64;
      s.push(this.flood.y, this.flood.c.x, this.flood.c.z);
    }
    s[0] = mask;
    return s;
  }

  applyNetState(s: number[]) {
    const mask = s[0] ?? 0;
    let i = 1;
    const next = () => s[i++] ?? 0;
    const vec = () => new THREE.Vector3(next(), next(), next());
    this.black = !!(mask & 1);
    this.disco = !!(mask & 2);
    if (mask & 4) {
      const t0 = next();
      const n = next();
      const spots: THREE.Vector3[] = [];
      for (let k = 0; k < n; k++) spots.push(vec());
      this.lava = { t0, spots };
    } else this.lava = null;
    if (mask & 8) {
      const got = next();
      const n = next();
      const spots: THREE.Vector3[] = [];
      for (let k = 0; k < n; k++) spots.push(vec());
      this.peels = { got, spots };
    } else this.peels = null;
    this.bees = mask & 16 ? vec() : null;
    this.tornado = mask & 32 ? vec() : null;
    if (mask & 64) {
      const y = next();
      this.flood = { y, c: new THREE.Vector3(next(), 0, next()) };
    } else this.flood = null;
  }

  dispose() {
    this.sim.flipControls = false;
    this.sim.timeScale = 1;
    this.sim.exposure?.(1);
    for (const p of this.sim.players ?? []) p.speedScale = 1;
    if (this.sim.chaosActs === this) this.sim.chaosActs = undefined;
    this.root.removeFromParent();
  }
}

registerHazard('chaosActs', (o, sim) => new ChaosCompanion(o, sim));
