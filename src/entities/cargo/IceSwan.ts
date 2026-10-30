import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import { Sim, warmthAt } from '../../game/Sim';
import { roundedBox } from '../../levels/LevelBuilder';
import { tuning } from '../../config/tuning';

/** Plinth: the block of ice the swan was carved out of (body origin = its centre). */
const PW = 0.8;
const PH = 0.22;
const PD = 0.5;
/** Health melted per second outdoors; heat multiplies it, cold stops it. */
const MELT = 0.0007;

const _v = new THREE.Vector3();

/**
 * An ice swan carved on a block of ice. It melts all the time (faster near
 * anything warm, not at all somewhere freezing), shrinking and dripping as it
 * goes, and a hard knock snaps its neck off.
 */
export class IceSwan extends Cargo {
  readonly kind = 'swan' as const;
  readonly displayName = 'Ice Swan';
  readonly value = 1100;
  readonly tip = 'It melts while you dawdle, and faster near anything warm. Hurry, gently!';
  readonly fragility: Fragility = { safeShock: 1.35, perShock: 0.15, maxPerHit: 0.3, spinLimit: 3.0, spinDamage: 0.08 };

  private ice!: THREE.MeshPhysicalMaterial;
  private swan = new THREE.Group();
  private neck = new THREE.Group();
  private neckCol!: Collider;
  private neckFree: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; ground: number } | null = null;
  /** How much has melted away (0..1 of the swan's health lost to warmth). */
  private melted = 0;
  private warmth = 0;
  private dripT = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.45;
    this.material = 'ice';
    this.init(opts);
  }

  protected buildColliders() {
    this.addCollider(RAPIER.ColliderDesc.cuboid(PW / 2, PH / 2, PD / 2).setMass(18), 0.45);
    // the swan's body: a capsule lying along X on top of the block
    const lie = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    this.addCollider(
      RAPIER.ColliderDesc.capsule(0.15, 0.14)
        .setTranslation(-0.04, PH / 2 + 0.14, 0)
        .setRotation({ x: lie.x, y: lie.y, z: lie.z, w: lie.w })
        .setMass(10),
      0.45,
    );
    // the neck: knockable, but nobody carries a swan by the neck
    this.neckCol = this.addCollider(RAPIER.ColliderDesc.capsule(0.17, 0.05).setTranslation(0.21, PH / 2 + 0.45, 0).setMass(1.5), 0.45);
    this.sim.physics.info(this.neckCol)!.grabbable = false;
  }

  protected buildVisual() {
    this.ice = new THREE.MeshPhysicalMaterial({
      color: 0xcdeeff,
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.84,
      emissive: 0x6cc8f0,
      emissiveIntensity: 0.14,
    });
    const frost = new THREE.MeshPhysicalMaterial({ color: 0xe6f6ff, roughness: 0.45, clearcoat: 0.6, transparent: true, opacity: 0.9, emissive: 0x9fd8ea, emissiveIntensity: 0.08 });
    const block = new THREE.Mesh(roundedBox([PW, PH, PD], 0.03, 1), frost);
    block.castShadow = block.receiveShadow = true;
    this.visual.add(block);

    const top = PH / 2;
    const mesh = (geo: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, this.ice);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      return m;
    };
    // body, raised wings, tail
    this.swan.add(mesh(new THREE.SphereGeometry(0.17, 22, 16), -0.04, top + 0.15, 0, 1.8, 0.95, 1.05));
    for (const side of [-1, 1]) {
      const wing = mesh(new THREE.SphereGeometry(0.16, 18, 12), -0.08, top + 0.27, side * 0.12, 1.45, 0.42, 0.62);
      wing.rotation.set(side * -0.55, 0, 0.18);
      this.swan.add(wing);
    }
    const tail = mesh(new THREE.ConeGeometry(0.07, 0.2, 10), -0.35, top + 0.27, 0);
    tail.rotation.z = 0.9;
    this.swan.add(tail);
    // S-shaped neck with the head and beak, all one piece (it can snap off)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.17, top + 0.2, 0),
      new THREE.Vector3(0.27, top + 0.36, 0),
      new THREE.Vector3(0.22, top + 0.55, 0),
      new THREE.Vector3(0.15, top + 0.68, 0),
      new THREE.Vector3(0.19, top + 0.76, 0),
    ]);
    this.neck.add(mesh(new THREE.TubeGeometry(curve, 24, 0.045, 10, false), 0, 0, 0));
    this.neck.add(mesh(new THREE.SphereGeometry(0.065, 14, 10), 0.21, top + 0.77, 0, 1.35, 1, 0.9));
    const beak = mesh(new THREE.ConeGeometry(0.026, 0.11, 10), 0.31, top + 0.76, 0);
    beak.rotation.z = -Math.PI / 2;
    this.neck.add(beak);
    this.swan.add(this.neck);
    this.visual.add(this.swan);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    this.warmth = warmthAt(this.sim, this.position(_v));
    const rate = MELT * Math.max(0, 1 + this.warmth) * tuning.damage.scale;
    if (rate <= 0) return;
    const loss = Math.min(this.health, rate * dt);
    this.health -= loss;
    this.melted += loss;
    if (this.health <= 0) this.break();
  }

  netState() {
    return [this.melted, this.warmth];
  }

  applyNetState(s: number[]) {
    [this.melted, this.warmth] = s;
  }

  update(dt: number) {
    // melting shrinks the swan (not the block) and makes it glisten
    const k = 1 - Math.min(0.3, this.melted * 0.6);
    this.swan.scale.setScalar(k);
    this.swan.position.y = (PH / 2) * (1 - k);
    this.ice.emissiveIntensity = 0.14 + Math.min(0.25, this.warmth * 0.04);
    this.status = this.destroyed ? null : this.warmth > 1 ? '🔥 Too warm! Melting fast' : this.warmth < -0.3 ? '❄️ Nice and cold' : null;
    // drips, more of them the warmer it is
    if (!this.destroyed && this.warmth > 0.3) {
      this.dripT -= dt * Math.min(6, this.warmth);
      if (this.dripT <= 0) {
        this.dripT = 0.5;
        const p = this.visual.localToWorld(_v.set((Math.random() - 0.5) * PW, -PH / 2, (Math.random() - 0.5) * PD));
        this.sim.fx?.burst('drop', p, { count: 1, speed: 0.1, up: 0, size: 0.03, life: 1, gravity: 9, colors: [0xbfeaff] });
      }
    }
    if (this.neckFree) {
      const f = this.neckFree;
      f.vel.y -= 11 * dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < f.ground + 0.05) {
        f.pos.y = f.ground + 0.05;
        f.vel.multiplyScalar(0.3);
        f.vel.y = Math.abs(f.vel.y) * 0.3;
        f.spin.multiplyScalar(0.5);
      }
      f.rot.x += f.spin.x * dt;
      f.rot.z += f.spin.z * dt;
      this.neck.position.copy(f.pos);
      this.neck.rotation.copy(f.rot);
    }
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    this.sim.fx?.burst('shard', point, { count: Math.min(12, 2 + Math.floor(amount * 30)), speed: 1.8, up: 1, size: 0.03, life: 1.2, gravity: 10, colors: [0xdff4ff, 0xbfeaff, 0xffffff] });
    // a hard knock (or a swan in a bad way) loses its head
    if (!this.neckFree && (amount > 0.12 || this.health < 0.35)) this.snapNeck();
  }

  private snapNeck() {
    const wp = this.neck.getWorldPosition(new THREE.Vector3());
    const wq = this.neck.getWorldQuaternion(new THREE.Quaternion());
    this.neck.removeFromParent();
    this.sim.scene.add(this.neck);
    this.neck.quaternion.copy(wq);
    this.neck.scale.copy(this.swan.scale);
    const ground = this.sim.fx?.groundAt ? this.sim.fx.groundAt(wp.x, wp.y + 0.5, wp.z) : wp.y - 0.6;
    this.neckFree = {
      pos: wp,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.4, (Math.random() - 0.5) * 2),
      rot: new THREE.Euler().setFromQuaternion(wq),
      spin: new THREE.Vector3(5, 0, 3),
      ground,
    };
    if (this.neckCol.isValid()) {
      this.colliders = this.colliders.filter((c) => c !== this.neckCol);
      this.sim.physics.world.removeCollider(this.neckCol, true);
    }
  }

  protected onBreak() {
    if (!this.neckFree) this.snapNeck();
    const p = this.visual.localToWorld(new THREE.Vector3(0, 0.3, 0));
    this.sim.fx?.burst('shard', p, { count: 50, speed: 3.2, up: 1.4, size: 0.05, sizeVar: 0.6, life: 2.5, gravity: 10, spread: 0.3, colors: [0xdff4ff, 0xbfeaff, 0xffffff] });
    this.swan.visible = false;
  }

  dispose() {
    this.neck.removeFromParent();
    super.dispose();
  }
}
