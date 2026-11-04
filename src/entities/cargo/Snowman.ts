import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import { Cargo, CargoOptions, Fragility } from './Cargo';
import { Sim, warmthAt } from '../../game/Sim';
import { glossy, matte } from '../../render/materials';
import { models } from '../../render/models';
import { roundedBox } from '../../levels/LevelBuilder';
import { tuning } from '../../config/tuning';

/** The wooden board it stands on (body origin = the board's centre). */
const BW = 0.9;
const BH = 0.12;
const BD = 0.62;
/** Health melted per second at "warmth 1"; out in the sun it's SUN, shade takes it off. */
const MELT = 0.0011;
const SUN = 1.6;
/** The snowballs: radius and centre height above the board's middle. */
const BALLS: [number, number][] = [
  [0.3, BH / 2 + 0.27],
  [0.22, BH / 2 + 0.7],
  [0.16, BH / 2 + 1.02],
];

const _v = new THREE.Vector3();

/**
 * A snowman on a board, built for a party in the park on a hot day. Out in
 * the sun it melts all the time (shade stops it; anything hot makes it
 * worse), slumping and dripping as it goes. A hard knock pops its head off.
 */
export class Snowman extends Cargo {
  readonly kind = 'snowman' as const;
  readonly displayName = 'Snowman';
  readonly value = 1200;
  readonly tip = 'It melts in the sun! Stick to the shade where you can, and keep it away from the barbecues.';
  readonly fragility: Fragility = { safeShock: 1.7, perShock: 0.11, maxPerHit: 0.3, spinLimit: 3.2, spinDamage: 0.06 };

  private snow = new THREE.Group();
  private head = new THREE.Group();
  private headCol: InstanceType<typeof RAPIER.Collider> | null = null;
  private headFree: { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; ground: number } | null = null;
  private melted = 0;
  private warmth = 0;
  private dripT = 0;

  constructor(sim: Sim, opts: CargoOptions) {
    super(sim);
    this.radius = 0.45;
    this.material = 'soft';
    this.init(opts);
  }

  protected buildColliders() {
    this.addCollider(RAPIER.ColliderDesc.cuboid(BW / 2, BH / 2, BD / 2).setMass(6), 0.75);
    // the bottom two balls hold up; the head can be knocked off
    for (const [i, [r, y]] of BALLS.entries()) {
      const c = this.addCollider(RAPIER.ColliderDesc.ball(r * 0.95).setTranslation(0, y, 0).setMass([12, 6, 2][i]), 0.6);
      this.sim.physics.info(c)!.grabbable = false;
      if (i === 2) this.headCol = c;
    }
  }

  protected buildVisual() {
    const board = new THREE.Mesh(roundedBox([BW, BH, BD], 0.02, 0.6), matte(0x9c6b3e));
    board.castShadow = board.receiveShadow = true;
    this.visual.add(board);
    const snow = matte(0xfbfdff, { roughness: 0.9 });
    const top = BH / 2;
    if (models.has('snowman')) {
      // the downloaded snowman (hat, scarf, carrot and all); its head is the top 30%
      const m = models.instance('snowman', [0.78, 1.22, 1.1]);
      m.object.position.y = top + m.size[1] / 2;
      this.snow.add(m.object);
    } else {
      for (const [i, [r, y]] of BALLS.entries()) {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), snow);
        ball.position.y = i === 2 ? 0 : y;
        ball.castShadow = ball.receiveShadow = true;
        (i === 2 ? this.head : this.snow).add(ball);
      }
      const coal = matte(0x222222);
      const [hr, hy] = BALLS[2];
      // the head's group sits at the head's centre (it rolls about that when knocked off)
      this.head.position.y = hy;
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), coal);
        eye.position.set(s * 0.055, 0.04, hr * 0.92);
        this.head.add(eye);
      }
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 10), glossy(0xff7a1a, 0.5, 0));
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 0, hr + 0.07);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20), coal);
      brim.position.y = hr * 0.85;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 20), coal);
      crown.position.y = hr * 0.85 + 0.1;
      this.head.add(nose, brim, crown);
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), coal);
        b.position.set(0, BALLS[1][1] + 0.1 - i * 0.1, Math.sqrt(Math.max(0, BALLS[1][0] ** 2 - (0.1 - i * 0.1) ** 2)));
        this.snow.add(b);
      }
      const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 8, 20), matte(0xd94a3d));
      scarf.rotation.x = Math.PI / 2;
      scarf.position.y = BALLS[1][1] + BALLS[1][0] * 0.8;
      this.snow.add(scarf);
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.42, 6), matte(0x6e4a2c));
        arm.position.set(s * 0.36, BALLS[1][1] + 0.08, 0);
        arm.rotation.z = s * -1.0;
        this.snow.add(arm);
      }
      this.snow.add(this.head);
    }
    this.visual.add(this.snow);
  }

  preStep(dt: number) {
    if (this.destroyed) return;
    this.warmth = SUN + warmthAt(this.sim, this.position(_v));
    const rate = MELT * Math.max(0, this.warmth) * tuning.damage.scale;
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
    [this.melted, this.warmth] = [s[0] ?? 0, s[1] ?? 0];
  }

  update(dt: number) {
    // melting: it slumps (shorter, a bit wider) and glistens
    const k = this.destroyed ? 0.3 : 1 - Math.min(0.32, this.melted * 0.7);
    this.snow.scale.set(1 + (1 - k) * 0.25, k, 1 + (1 - k) * 0.25);
    this.snow.position.y = (BH / 2) * (1 - k);
    this.status = this.destroyed ? null : this.warmth > 3 ? '🔥 Too hot! Melting fast!' : this.warmth <= 0.2 ? '⛱️ Nice and cool' : '☀️ Melting in the sun…';
    if (!this.destroyed && this.warmth > 0.4) {
      this.dripT -= dt * Math.min(6, this.warmth);
      if (this.dripT <= 0) {
        this.dripT = 0.45;
        const p = this.visual.localToWorld(_v.set((Math.random() - 0.5) * 0.5, BH / 2 + 0.05, (Math.random() - 0.5) * 0.4));
        this.sim.fx?.burst('drop', p, { count: 1, speed: 0.15, up: 0, size: 0.03, life: 0.8, gravity: 9, colors: [0xdff4ff] });
      }
    }
    if (this.headFree) {
      const f = this.headFree;
      f.vel.y -= 11 * dt;
      f.pos.addScaledVector(f.vel, dt);
      if (f.pos.y < f.ground) {
        f.pos.y = f.ground;
        f.vel.multiplyScalar(0.4);
        f.vel.y = Math.abs(f.vel.y) * 0.25;
        f.spin.multiplyScalar(0.6);
      }
      f.rot.x += f.spin.x * dt;
      f.rot.z += f.spin.z * dt;
      this.head.position.copy(f.pos);
      this.head.rotation.copy(f.rot);
    }
  }

  protected onDamage(amount: number, point: THREE.Vector3) {
    this.sim.fx?.burst('dust', point, { count: Math.min(10, 2 + Math.floor(amount * 30)), speed: 1.4, up: 0.8, size: 0.08, life: 0.9, gravity: 4, colors: [0xffffff, 0xeef6ff] });
    if (!this.headFree && this.head.children.length && (amount > 0.13 || this.health < 0.3)) this.popHead();
  }

  /** Off it comes, rolling away. */
  private popHead() {
    const wp = this.head.getWorldPosition(new THREE.Vector3());
    const wq = this.head.getWorldQuaternion(new THREE.Quaternion());
    const ws = this.head.getWorldScale(new THREE.Vector3());
    this.head.removeFromParent();
    this.sim.scene.add(this.head);
    this.head.scale.copy(ws);
    const ground = this.sim.fx?.groundAt ? this.sim.fx.groundAt(wp.x, wp.y + 0.5, wp.z) + BALLS[2][0] * ws.y : wp.y - 1;
    this.headFree = { pos: wp, vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, 1.6, (Math.random() - 0.5) * 2.5), rot: new THREE.Euler().setFromQuaternion(wq), spin: new THREE.Vector3(4, 0, 3), ground };
    if (this.headCol?.isValid()) {
      this.colliders = this.colliders.filter((c) => c !== this.headCol);
      this.sim.physics.world.removeCollider(this.headCol, true);
    }
  }

  protected onBreak() {
    if (!this.headFree && this.head.children.length) this.popHead();
    const p = this.visual.localToWorld(new THREE.Vector3(0, 0.5, 0));
    this.sim.fx?.burst('dust', p, { count: 40, speed: 2.4, up: 1.2, size: 0.12, sizeVar: 0.6, life: 1.8, gravity: 6, colors: [0xffffff, 0xeef6ff, 0xdff4ff] });
  }

  dispose() {
    this.head.removeFromParent();
    super.dispose();
  }
}
