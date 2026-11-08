import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { Player } from '../../Player';
import { matte } from '../../../render/materials';
import { ON, PartyGame } from './base';
import { mesh, parkSpot, prop, spawnProp, showLive, type Prop } from './kit';

/** Half the pitch's length and width (m); the goal mouths' half-width. */
const HX = 10;
const HZ = 6.5;
const MOUTH = 2;
const BALL = 0.6;

const _v = new THREE.Vector3();

/** A big football: white with dark patches. */
function ballLook() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbfbf6';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#26262e';
  const spot = (x: number, y: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r);
    }
    g.fill();
  };
  for (let i = 0; i < 6; i++) {
    spot(i * 43 + 10, 30, 13);
    spot(i * 43 + 31, 94, 13);
  }
  spot(128, 4, 30);
  spot(128, 124, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = mesh(new THREE.SphereGeometry(BALL, 28, 18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  const o = new THREE.Group();
  o.add(m);
  return o;
}

/**
 * Mover Football: a giant ball, two goals. Run into the ball to kick it the way
 * you're running (jump into it for a lob). Goals win rounds; when the clock runs
 * out the most goals wins, and a draw goes to a golden goal.
 */
export class Football extends PartyGame {
  readonly title = 'Mover Football';
  private ball: Prop;
  private kickAt = [-9, -9];
  private nets: THREE.MeshStandardMaterial[] = [];
  private coloured = false;
  private scorer = -1;

  constructor(...a: ConstructorParameters<typeof PartyGame>) {
    super(...a);
    this.ball = prop(this.sim, this.root, RAPIER.ColliderDesc.ball(BALL).setMass(1.4).setRestitution(0.72), ballLook(), parkSpot(0), {
      material: 'rubber',
      grabbable: false,
      friction: 0.5,
      damping: 0.35,
      angDamping: 0.5,
      ccd: true,
    });
    // the goals' nets (in the colour of who defends them, once we know it)
    for (const s of [-1, 1]) {
      const net = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, roughness: 0.8, side: THREE.DoubleSide });
      this.nets.push(net);
      const back = mesh(new THREE.PlaneGeometry(MOUTH * 2, 2.2), net, false);
      back.rotation.y = Math.PI / 2;
      back.position.set(s * (HX + 1.5), 1.1, 0);
      for (const z of [-MOUTH, MOUTH]) {
        const sideNet = mesh(new THREE.PlaneGeometry(1.5, 2.2), net, false);
        sideNet.position.set(s * (HX + 0.75), 1.1, z);
        this.root.add(sideNet);
      }
      const top = mesh(new THREE.PlaneGeometry(1.5, MOUTH * 2), net, false);
      top.rotation.x = -Math.PI / 2;
      top.position.set(s * (HX + 0.75), 2.2, 0);
      this.root.add(back, top);
      for (const z of [-MOUTH, MOUTH]) {
        const post = mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.3, 10), matte(0xffffff));
        post.position.set(s * HX, 1.15, z);
        this.root.add(post);
      }
      const bar = mesh(new THREE.CylinderGeometry(0.09, 0.09, MOUTH * 2, 10).rotateX(Math.PI / 2), matte(0xffffff));
      bar.position.set(s * HX, 2.25, 0);
      this.root.add(bar);
    }
    // the lines
    const line = matte(0xffffff);
    const centre = mesh(new THREE.BoxGeometry(0.12, 0.02, HZ * 2), line, false);
    centre.position.y = 0.011;
    const circle = mesh(new THREE.TorusGeometry(2.2, 0.06, 4, 48).rotateX(Math.PI / 2), line, false);
    circle.position.y = 0.012;
    this.root.add(centre, circle);
    for (const s of [-1, 1]) {
      const box = mesh(new THREE.BoxGeometry(0.1, 0.02, MOUTH * 2 + 2.4), line, false);
      box.position.set(s * (HX - 2.6), 0.011, 0);
      const b1 = mesh(new THREE.BoxGeometry(2.6, 0.02, 0.1), line, false);
      b1.position.set(s * (HX - 1.3), 0.011, MOUTH + 1.2);
      const b2 = b1.clone();
      b2.position.z = -(MOUTH + 1.2);
      this.root.add(box, b1, b2);
    }
  }

  protected setup() {
    this.place(0, -4.5, 0, 0, Math.PI / 2);
    this.place(1, 4.5, 0, 0, -Math.PI / 2);
    // kick-off: the ball drops in the middle (a little to one side, so nobody gets it for free)
    spawnProp(this.ball, _v.set(0, 3, (Math.random() - 0.5) * 0.6));
    this.kickAt = [-9, -9];
    this.scorer = -1;
    if (this.round > 1) this.readyTime = 2;
  }

  protected roundText(w: number) {
    return w < 0 ? 'NO GOAL' : `GOAL! ${this.name(w)}`;
  }

  line() {
    return this.phase === 'point' && this.scorer >= 0 ? `${this.name(this.scorer)} scored!` : 'Run into the ball to kick it. Jump to lob.';
  }

  protected step(_dt: number, now: number) {
    this.kicks(now);
    const b = this.ball.body.translation();
    // fell out somehow: back to the middle
    if (b.y < -4) spawnProp(this.ball, _v.set(0, 3, 0));
    if (Math.abs(b.z) < MOUTH && b.y < 2.3) {
      // P1 attacks the +x goal, P2 the -x one
      if (b.x > HX + BALL * 0.7) return (this.scorer = 0);
      if (b.x < -HX - BALL * 0.7) return (this.scorer = 1);
    }
    return ON;
  }

  protected idle(_dt: number, now: number) {
    if (this.phase === 'point') this.kicks(now);
  }

  /** Movers touching the ball send it where they're running. */
  private kicks(now: number) {
    const body = this.ball.body;
    if (!this.ball.live) return;
    const b = body.translation();
    this.players.forEach((p, i) => {
      if (p.state !== 'active' || now - this.kickAt[i] < 0.22) return;
      const dx = b.x - p.bodyPos.x;
      const dz = b.z - p.bodyPos.z;
      const d = Math.hypot(dx, dz);
      if (d > BALL + 0.45 || Math.abs(b.y - p.bodyPos.y) > 1.3) return;
      const v = p.bodyVel;
      const sp = Math.hypot(v.x, v.z);
      if (sp < 0.8) return;
      this.kickAt[i] = now;
      // mostly the way you're running, a bit the way you hit it
      const kx = (v.x / sp) * 0.7 + (dx / Math.max(0.01, d)) * 0.3;
      const kz = (v.z / sp) * 0.7 + (dz / Math.max(0.01, d)) * 0.3;
      const kl = Math.hypot(kx, kz) || 1;
      const power = 3.5 + sp * 1.5;
      const lob = p.grounded ? 1.4 : 4.6;
      const bv = body.linvel();
      body.setLinvel({ x: (kx / kl) * power + bv.x * 0.2, y: Math.max(bv.y, lob), z: (kz / kl) * power + bv.z * 0.2 }, true);
      this.sim.fx?.burst('dust', _v.set(b.x, b.y - BALL * 0.6, b.z), { count: 5, speed: 1.6, up: 0.6, size: 0.1, life: 0.5, gravity: -0.2, drag: 3 });
      this.sim.events.emit('impact', { pos: _v.set(b.x, b.y, b.z).clone(), speed: power, material: 'rubber' });
    });
  }

  focus() {
    return this.ball.live ? [this.sim.physics.interpolatedPosition(this.ball.body, new THREE.Vector3())] : [];
  }

  protected looks() {
    showLive([this.ball]);
    // the nets in the colour of who defends them
    if (!this.coloured && this.players.length === 2) {
      this.coloured = true;
      this.nets[0].color.setHex(this.players[0].color);
      this.nets[1].color.setHex(this.players[1].color);
    }
  }

  private plan = { x: 0, z: 0, at: -9 };
  protected cpuMove(me: Player, foe: Player) {
    const now = this.sim.time();
    const b = this.ball.body.translation();
    const m = me.bodyPos;
    if (now - this.plan.at > 0.32 - 0.22 * this.skill) {
      this.plan.at = now;
      // the computer is P2: it attacks the -x goal and defends +x
      let gx = -HX - 1;
      let gz = Math.max(-MOUTH + 0.6, Math.min(MOUTH - 0.6, b.z * 0.5));
      // the ball's against a side wall: there's no getting behind it, so push it along the wall
      if (Math.abs(b.z) > HZ - 1.3 && b.x > -HX + 1.5) {
        gx = b.x - 10;
        gz = b.z * 0.85;
      }
      // from the goal through the ball, and a spot just behind it on that line
      let ux = b.x - gx;
      let uz = b.z - gz;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      const bx = b.x + ux * 1.1;
      const bz = b.z + uz * 1.1;
      const ahead = (m.x - b.x) * ux + (m.z - b.z) * uz; // > 0: on the right side of the ball
      const side = Math.abs((m.x - b.x) * -uz + (m.z - b.z) * ux);
      const foeFirst = Math.hypot(foe.bodyPos.x - b.x, foe.bodyPos.z - b.z) < Math.hypot(m.x - b.x, m.z - b.z) - 1;
      if (b.x > HX - 4.5 && foeFirst && m.x < b.x) {
        // they're about to score: get back between the ball and our goal
        this.plan.x = Math.min(HX - 0.8, b.x + 1.6);
        this.plan.z = b.z * 0.6;
      } else if (ahead > 0.3 && side < 0.65) {
        // lined up: run through the ball at their goal
        this.plan.x = b.x - ux * 2.5;
        this.plan.z = b.z - uz * 2.5;
      } else if (ahead < 0.3) {
        // the wrong side of it: go round, not through
        const sx = -uz;
        const sz = ux;
        const s = (m.x - b.x) * sx + (m.z - b.z) * sz >= 0 ? 1 : -1;
        this.plan.x = bx + sx * s * 1.3;
        this.plan.z = bz + sz * s * 1.3;
      } else {
        this.plan.x = bx;
        this.plan.z = bz;
      }
      this.plan.x = Math.max(-HX + 0.5, Math.min(HX - 0.5, this.plan.x));
      this.plan.z = Math.max(-HZ + 0.5, Math.min(HZ - 0.5, this.plan.z));
    }
    this.steer(me, this.plan.x, this.plan.z);
  }
}
