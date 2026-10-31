import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER } from '../../physics/rapier';
import type { Collider } from '../../physics/rapier';
import type { ColliderInfo } from '../../physics/PhysicsWorld';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import type { Sim } from '../../game/Sim';
import { roundedBox } from '../../levels/LevelBuilder';
import { glossy } from '../../render/materials';
import { tuning } from '../../config/tuning';
import { Wobble } from '../../util/wobble';

/**
 * The weight the strings are tied to: a wrapped present (body origin = its
 * centre). It's tall for its size so mittens close on its sides, not its edges:
 * one hand on the top edge and one under the bottom would each lift to a
 * different height and wrench it crooked.
 */
const BW = 0.36;
const BH = 0.4;
const BD = 0.3;
const BOX_MASS = 1.6;
/** Every string is tied to the bow on top. */
const TIE = new THREE.Vector3(0, BH / 2 + 0.05, 0);
/** A balloon: collider radius, mass, and how far its knot hangs below its middle. */
const R = 0.18;
const BALLOON_MASS = 0.03;
const KNOT = 0.24;
const COLORS = [0xff4d5e, 0xffd23f, 0x3d9bff, 0x52d39a, 0xff8fab, 0xff8a3d, 0xb085f5, 0x4dd0e1, 0x9be15d, 0xe94fd0];

/** Where each balloon floats (body frame): a ring of six, three above them, one on top. */
const SPOTS: THREE.Vector3[] = [
  ...Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos(((i + 0.5) * Math.PI) / 3) * 0.34, 1.07, Math.sin(((i + 0.5) * Math.PI) / 3) * 0.34)),
  ...Array.from({ length: 3 }, (_, i) => new THREE.Vector3(Math.cos((i * 2 * Math.PI) / 3) * 0.19, 1.35, Math.sin((i * 2 * Math.PI) / 3) * 0.19)),
  new THREE.Vector3(0, 1.63, 0),
];
const N = SPOTS.length;
/** Lift per balloon as a share of the whole bouquet's weight: all ten lift it 1.4×; with seven left it sinks. */
const LIFT = 0.14;
/** Air drag (1/s): let go, and a full bouquet rises at about 2 m/s. */
const DRAG = 2;
/** Seconds a balloon can be pressed on something sharp before it pops (at normal toughness). */
const PRICK = 1 / 60;
/** Segments per string. */
const SEGS = 5;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Vector3();
const _k = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _zero = new THREE.Vector3(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

/** A balloon with its knot: one shared shape for all of them, drawn in one go. */
function balloonGeometry() {
  const body = new THREE.SphereGeometry(0.17, 16, 12);
  body.scale(1, 1.15, 1);
  const knot = new THREE.ConeGeometry(0.03, 0.06, 8);
  knot.translate(0, -KNOT + 0.03, 0);
  const g = mergeGeometries([body, knot])!;
  body.dispose();
  knot.dispose();
  return g;
}

/**
 * A bouquet of helium balloons tied to a little wrapped present. Let go of it
 * and it floats off (unless it's set down somewhere it can be tied); anything
 * pointy pops a balloon, and so does a hard knock. Its condition is the share
 * of balloons left, and with too few left it sinks instead of floating.
 */
export class Balloons extends Cargo {
  readonly kind = 'balloons' as const;
  readonly displayName = 'Balloon Bouquet';
  readonly value = 500;
  readonly tip = 'Never let go: it floats off! Keep it away from anything pointy.';
  readonly fragility: Fragility = { safeShock: 3.0, perShock: 0.16, maxPerHit: 0.35, spinLimit: 0, spinDamage: 0 };
  /**
   * Four mittens on one small present: each holds where it grips. A hand that
   * latched out wide would keep tugging sideways, and the pair would slowly
   * waltz round and round the bouquet.
   */
  readonly snug = true;
  /** …and carried upright, the present a little above the carriers' middles. */
  readonly holdHeight = 0.3;

  private boxCol!: Collider;
  /** One per balloon; null once it has popped. */
  private balloons: (Collider | null)[] = [];
  /** Bit i set: balloon i has popped (this is all the other laptop needs to know). */
  private popped = 0;
  /** Seconds each balloon has been pressed on something sharp. */
  private prick = new Float32Array(N);
  /** Knocks add up: every tenth pops a balloon. */
  private strain = 0;
  /** On a stand or the party table (or settling after a respawn): no lift. */
  private tied = false;
  /** Where the lift acts (body frame): the middle of the balloons that are left. */
  private liftAt = new THREE.Vector3();

  private puffs!: THREE.InstancedMesh;
  private strings!: THREE.LineSegments;
  /** The balloons trail behind when it moves and swing past when it stops (radians-ish, body frame x/z). */
  private lean = new Wobble(1.1, 0.22, 0.35);
  private vel = new THREE.Vector3();
  private lastPos = new THREE.Vector3();
  private seen = false;

  /** A bouquet set on a stand whose top is at y has its present's centre this far up. */
  static readonly sitHeight = BH / 2;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.6;
    this.material = 'rubber';
    this.init(opts);
    this.body.setLinearDamping(DRAG);
    this.body.setAngularDamping(2.5);
    this.updateLiftPoint();
  }

  /** Balloons catch the breeze. */
  windScale() {
    return 3;
  }

  private get left() {
    let n = 0;
    for (let i = 0; i < N; i++) if (!(this.popped & (1 << i))) n++;
    return n;
  }

  protected buildColliders() {
    this.boxCol = this.addCollider(RAPIER.ColliderDesc.cuboid(BW / 2, BH / 2, BD / 2).setMass(BOX_MASS), 0.8);
    for (const s of SPOTS) {
      const c = this.addCollider(RAPIER.ColliderDesc.ball(R).setTranslation(s.x, s.y, s.z).setMass(BALLOON_MASS), 0.3);
      c.setRestitution(0.3);
      // nobody carries a bouquet by the balloons
      this.sim.physics.info(c)!.grabbable = false;
      this.balloons.push(c);
    }
  }

  protected buildVisual() {
    // the present: paper, a ribbon both ways, and a bow where the strings are tied
    const paper = glossy(0x3ec6c9, 0.45, 0);
    const ribbon = glossy(0xffd23f, 0.3, 0.1);
    const box = new THREE.Mesh(roundedBox([BW, BH, BD], 0.03, 1), paper);
    box.castShadow = box.receiveShadow = true;
    this.visual.add(box);
    for (const [w, d] of [
      [BW + 0.012, 0.06],
      [0.06, BD + 0.012],
    ]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w, BH + 0.012, d), ribbon);
      this.visual.add(band);
    }
    for (const s of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.015, 6, 14), ribbon);
      loop.position.set(s * 0.045, BH / 2 + 0.035, 0);
      loop.rotation.set(0, 0, s * 0.5);
      loop.castShadow = true;
      this.visual.add(loop);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), ribbon);
    knot.position.set(0, BH / 2 + 0.02, 0);
    this.visual.add(knot);

    // the balloons: one shape, one draw call, a colour each
    this.puffs = new THREE.InstancedMesh(balloonGeometry(), glossy(0xffffff, 0.22, 0), N);
    this.puffs.castShadow = true;
    this.puffs.frustumCulled = false;
    for (let i = 0; i < N; i++) this.puffs.setColorAt(i, new THREE.Color(COLORS[i % COLORS.length]));
    this.visual.add(this.puffs);

    // curly ribbon strings, each the colour of its balloon
    const pos = new Float32Array(N * SEGS * 2 * 3);
    const col = new Float32Array(N * SEGS * 2 * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      c.set(COLORS[i % COLORS.length]).lerp(new THREE.Color(0xffffff), 0.25);
      for (let k = 0; k < SEGS * 2; k++) col.set([c.r, c.g, c.b], (i * SEGS * 2 + k) * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.strings = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.strings.frustumCulled = false;
    this.visual.add(this.strings);
    this.update(0, 0);
  }

  /** Is collider `c` actually touching something that passes `test`? */
  private touches(c: Collider, test: (info: ColliderInfo) => boolean) {
    const world = this.sim.physics.world;
    let hit = false;
    world.contactPairsWith(c, (o) => {
      if (hit) return;
      const info = this.sim.physics.info(o);
      if (!info || !test(info)) return;
      world.contactPair(c, o, (m) => {
        for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) < 0.02) hit = true;
      });
    });
    return hit;
  }

  private updateLiftPoint() {
    this.liftAt.set(0, 0, 0);
    let n = 0;
    SPOTS.forEach((s, i) => {
      if (this.popped & (1 << i)) return;
      this.liftAt.add(s);
      n++;
    });
    if (n) this.liftAt.divideScalar(n);
  }

  /** Balloon i's middle in the world, from the body's pose. */
  private balloonWorld(i: number, out: THREE.Vector3) {
    const t = this.body.translation();
    const r = this.body.rotation();
    return out.copy(SPOTS[i]).applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_a.set(t.x, t.y, t.z));
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    // pins, cacti, spikes: a balloon pressed on anything sharp pops
    const scale = tuning.damage.scale;
    for (let i = 0; i < N; i++) {
      const c = this.balloons[i];
      if (!c) continue;
      if (this.grace <= 0 && scale > 0 && this.touches(c, (info) => !!info.sharp)) {
        this.prick[i] += dt * scale;
        if (this.prick[i] >= PRICK) this.pop(i, this.balloonWorld(i, new THREE.Vector3()), 0);
      } else this.prick[i] = 0;
    }
    if (this.destroyed) return;
    // the present touching a stand or the party table gets its ribbon tied on, even while someone is
    // still setting it down (with no lift there it sits with its full weight instead of skating
    // about); it's also left alone while it settles after a respawn
    const held = this.sim.grips.isHeld(this.body);
    this.tied = this.touches(this.boxCol, (info) => !!info.tie) || (!held && this.grace > 0);
    if (this.tied) return;
    const weight = (BOX_MASS + N * BALLOON_MASS) * tuning.physics.gravity;
    // the lift acts up among the balloons, so a free bouquet floats upright
    const at = _c.copy(this.liftAt);
    const r = this.body.rotation();
    const t = this.body.translation();
    at.applyQuaternion(_q.set(r.x, r.y, r.z, r.w)).add(_a.set(t.x, t.y, t.z));
    this.body.applyImpulseAtPoint({ x: 0, y: LIFT * weight * this.left * dt, z: 0 }, { x: at.x, y: at.y, z: at.z }, true);
    if (!held) {
      // nobody holding it: a lazy breeze carries it off as it rises
      const time = this.sim.time();
      const a = 0.7 + Math.sin(time * 0.11) * 0.6;
      const f = 0.06 * weight * dt;
      this.body.applyImpulse({ x: Math.sin(a) * f, y: 0, z: Math.cos(a) * f }, true);
    }
  }

  /** Knocks add up as strain; each tenth of it pops the balloon nearest the knock. */
  damage(amount: number, shock = 0, at?: THREE.Vector3) {
    if (this.destroyed || this.grace > 0) return;
    this.strain += amount * tuning.damage.scale;
    if (this.strain < 1 / N) return;
    const p = at ? at.clone() : this.contactPoint(new THREE.Vector3());
    while (this.strain >= 1 / N && !this.destroyed) {
      this.strain -= 1 / N;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < N; i++) {
        if (!this.balloons[i]) continue;
        const d = this.balloonWorld(i, _w).distanceToSquared(p);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) break;
      this.pop(best, this.balloonWorld(best, new THREE.Vector3()), shock);
    }
  }

  /** Pop balloon i: health is the share of balloons left. */
  private pop(i: number, at: THREE.Vector3, shock: number) {
    if (this.popped & (1 << i)) return;
    this.removeBalloon(i, at);
    const left = this.left;
    const amount = this.health - left / N;
    this.health = left / N;
    this.hitFlash = Math.min(1, this.hitFlash + 0.5);
    this.lastHitPos.copy(at);
    this.onDamage(amount, at);
    this.sim.events.emit('cargoDamage', { amount, pos: at.clone(), health: this.health, kind: this.kind, shock });
    if (left === 0) this.break();
  }

  /** Take balloon i away (its collider too); with `burst`, it goes with a bang of rubber scraps. */
  private removeBalloon(i: number, burst: THREE.Vector3 | null) {
    if (this.popped & (1 << i)) return;
    this.popped |= 1 << i;
    const c = this.balloons[i];
    if (c) {
      this.balloons[i] = null;
      this.colliders = this.colliders.filter((x) => x !== c);
      if (c.isValid()) this.sim.physics.world.removeCollider(c, true);
    }
    this.updateLiftPoint();
    if (burst) {
      this.sim.fx?.burst('confetti', burst, { count: 9, speed: 2.4, up: 0.8, size: 0.07, sizeVar: 0.5, life: 0.9, gravity: 5, drag: 2.5, colors: [COLORS[i % COLORS.length]] });
      this.sim.fx?.burst('dust', burst, { count: 3, speed: 0.8, size: 0.1, life: 0.35, gravity: -0.2, drag: 3 });
    }
  }

  netState() {
    return [this.popped];
  }

  applyNetState(s: number[]) {
    // the host's balloons popped with a bang there; its scraps come over on their own
    const m = s[0] ?? 0;
    for (let i = 0; i < N; i++) if (m & (1 << i)) this.removeBalloon(i, null);
  }

  reset(pos: THREE.Vector3, rot: number | THREE.Quaternion, vel?: THREE.Vector3) {
    super.reset(pos, rot, vel);
    this.seen = false;
  }

  update(dt: number, time: number) {
    // how fast it's going, from where it's drawn (so the guest's copy swings the same)
    const p = this.visual.position;
    if (dt > 0) {
      if (this.seen) {
        _v.copy(p).sub(this.lastPos).divideScalar(dt);
        if (_v.lengthSq() > 400) _v.set(0, 0, 0); // teleported
      } else _v.set(0, 0, 0);
      this.vel.lerp(_v, 1 - Math.exp(-dt / 0.08));
      this.lastPos.copy(p);
      this.seen = true;
      _w.copy(this.vel).applyQuaternion(_q.copy(this.visual.quaternion).invert());
      this.lean.step(Math.min(dt, 0.05), -_w.x * 0.06, -_w.z * 0.06);
    }

    const pos = this.strings.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const s = SPOTS[i];
      const base = i * SEGS * 2;
      if (this.popped & (1 << i)) {
        // a popped balloon leaves its string hanging limp over the side of the box
        _m.compose(_zero, _q.identity(), _zero);
        this.puffs.setMatrixAt(i, _m);
        const l = Math.hypot(s.x, s.z) || 1;
        const dx = s.x / l || Math.cos(i);
        const dz = s.z / l || Math.sin(i);
        _k.set(dx * (BW / 2 + 0.01), BH / 2 - 0.24, dz * (BD / 2 + 0.01));
        _a.set(dx * 0.26, BH / 2 + 0.06, dz * 0.2);
        this.writeString(pos, base, TIE, _a, _k);
        continue;
      }
      // a slow drift of its own, plus the whole bunch leaning
      const h = s.y - TIE.y;
      const ph = i * 2.4;
      _c.set(
        s.x + this.lean.x * h + Math.sin(time * (0.7 + (i % 3) * 0.13) + ph) * 0.025,
        s.y - (this.lean.x * this.lean.x + this.lean.y * this.lean.y) * h * 0.5,
        s.z + this.lean.y * h + Math.cos(time * (0.6 + (i % 4) * 0.11) + ph * 1.3) * 0.025,
      );
      // each balloon points along its string
      const dir = _w.copy(_c).sub(TIE).normalize();
      _q.setFromUnitVectors(UP, dir);
      _m.compose(_c, _q, _one);
      this.puffs.setMatrixAt(i, _m);
      _k.copy(_c).addScaledVector(dir, -KNOT);
      // the string bows a little behind the swing
      _a.copy(TIE).lerp(_k, 0.5);
      _a.x -= this.lean.x * h * 0.35;
      _a.z -= this.lean.y * h * 0.35;
      this.writeString(pos, base, TIE, _a, _k);
    }
    this.puffs.instanceMatrix.needsUpdate = true;
    pos.needsUpdate = true;

    if (this.destroyed) this.status = null;
    else if (dt > 0) {
      const free = !this.tied && !this.sim.grips.isHeld(this.body) && this.left > 0;
      this.status = free && this.vel.y > 0.3 ? '🎈 Floating away!' : null;
    }
  }

  /** One string as a gentle curve from a through b to c (body frame). */
  private writeString(pos: THREE.BufferAttribute, base: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
    const arr = pos.array as Float32Array;
    let px = a.x;
    let py = a.y;
    let pz = a.z;
    for (let k = 1; k <= SEGS; k++) {
      const t = k / SEGS;
      const u = 1 - t;
      const x = u * u * a.x + 2 * u * t * b.x + t * t * c.x;
      const y = u * u * a.y + 2 * u * t * b.y + t * t * c.y;
      const z = u * u * a.z + 2 * u * t * b.z + t * t * c.z;
      const o = (base + (k - 1) * 2) * 3;
      arr[o] = px;
      arr[o + 1] = py;
      arr[o + 2] = pz;
      arr[o + 3] = x;
      arr[o + 4] = y;
      arr[o + 5] = z;
      px = x;
      py = y;
      pz = z;
    }
  }

  protected onDamage(_amount: number, point: THREE.Vector3) {
    // the bunch flinches away from whatever got it
    const local = this.visual.worldToLocal(_v.copy(point));
    const l = Math.hypot(local.x, local.z) || 1;
    this.lean.kick((-local.x / l) * 1.2, (-local.z / l) * 1.2);
  }

  protected onBreak() {
    // every last one goes (on the guest the scraps come from the host)
    for (let i = 0; i < N; i++) if (this.balloons[i]) this.removeBalloon(i, this.balloonWorld(i, new THREE.Vector3()));
    this.status = null;
  }
}
