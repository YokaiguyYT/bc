import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Collider } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { G, groups } from '../../physics/groups';
import { glossy } from '../../render/materials';
import { Player } from '../Player';
import { registerHazard, Hazard } from './registry';
import { DEG, num, v3 } from './common';

const Y = new THREE.Vector3(0, 1, 0);

/**
 * A security laser gate: red beams between two posts that blink on and off.
 * Walk into it while it's on and ZAP, that mover is knocked flat. It flickers
 * for half a second before switching on.
 * params: width (m, across, along the rotation's X), beams (count), low and
 * high (beam heights), on and off (s), phase (s).
 */
class LaserGate implements Hazard {
  private group = new THREE.Group();
  private beamMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private cols: Collider[] = [];
  private on: number;
  private off: number;
  private phase: number;
  private cool = new Map<Player, number>();
  /** Whether the beams are live right now (the test bot reads this). */
  live = false;
  readonly pos: THREE.Vector3;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    this.pos = v3(o.pos);
    const yaw = (o.rot?.[1] ?? 0) * DEG;
    const W = num(p, 'width', 5);
    const n = num(p, 'beams', 4);
    const low = num(p, 'low', 0.35);
    const high = num(p, 'high', 1.75);
    this.on = num(p, 'on', 2.4);
    this.off = num(p, 'off', 2.2);
    this.phase = num(p, 'phase', 0);
    this.group.position.copy(this.pos);
    this.group.rotation.y = yaw;
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a });
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.25, depthWrite: false });
    const steel = glossy(0x5a5f69, 0.4, 0.6);
    for (const x of [-W / 2, W / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, high + 0.35, 0.16), steel);
      post.position.set(x, (high + 0.35) / 2, 0);
      post.castShadow = true;
      this.group.add(post);
    }
    const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
    const body = sim.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pos.x, this.pos.y, this.pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    for (let i = 0; i < n; i++) {
      const y = low + ((high - low) * i) / Math.max(1, n - 1);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, W - 0.16, 6), this.beamMat);
      beam.rotation.z = Math.PI / 2;
      beam.position.y = y;
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, W - 0.16, 8), this.glowMat);
      glow.rotation.z = Math.PI / 2;
      glow.position.y = y;
      this.group.add(beam, glow);
      // a thin sensor slab per beam: movers walk through it (and get zapped)
      const c = sim.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(W / 2 - 0.1, 0.06, 0.06).setTranslation(0, y, 0).setSensor(true).setCollisionGroups(groups(G.HAZARD, G.P1 | G.P2)), // HAZARD: movers' bodies look for it
        body,
      );
      this.cols.push(c);
    }
    sim.scene.add(this.group);
  }

  private state(t: number) {
    const T = this.on + this.off;
    const x = (((t + this.phase) % T) + T) % T;
    // off first, then on; flicker in the last half second of off
    if (x < this.off) return { live: false, warn: x > this.off - 0.6 };
    return { live: true, warn: false };
  }

  preStep() {
    const t = this.sim.time();
    const st = this.state(t);
    this.live = st.live;
    if (!st.live) return;
    for (const c of this.cols)
      this.sim.physics.world.intersectionPairsWith(c, (other) => {
        const pl = this.sim.physics.info(other)?.owner;
        if (!(pl instanceof Player) || pl.state === 'knocked') return;
        if ((this.cool.get(pl) ?? -9) > t - 1.5) return;
        this.cool.set(pl, t);
        const away = pl.bodyPos.clone().sub(this.pos).setY(0);
        const push = (away.lengthSq() > 1e-4 ? away.normalize() : new THREE.Vector3(0, 0, 1)).multiplyScalar(2.5).setY(2).multiplyScalar(pl.totalMass);
        pl.applyBlast(push);
        pl.knock(6, 0.8);
        this.sim.events.emit('hazard', { pos: pl.bodyPos.clone(), kind: 'zap' });
        this.sim.fx?.burst('spark', pl.bodyPos.clone(), { count: 14, speed: 3, up: 1.5, size: 0.03, life: 0.5, gravity: 6, colors: [0xff5a5a, 0xffe28a] });
      });
  }

  update() {
    const st = this.state(this.sim.time());
    const flick = st.warn ? (Math.floor(this.sim.time() * 12) % 2 ? 0.9 : 0.15) : 0;
    const k = st.live ? 1 : flick;
    this.beamMat.color.setRGB(0.25 + 0.75 * k, 0.05 + 0.18 * k, 0.05 + 0.18 * k);
    this.glowMat.opacity = 0.28 * k;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
registerHazard('laser', (o, sim) => new LaserGate(o, sim));

/**
 * A lamp: a point light (no shadows) with an optional fitting.
 * params: color, intensity, distance, style 'pendant' | 'none'.
 */
class Lamp implements Hazard {
  private group = new THREE.Group();
  constructor(o: HazardObj, sim: Sim) {
    const p = o.params;
    this.group.position.copy(v3(o.pos));
    const color = (p?.color as number) ?? 0xffd59a;
    const light = new THREE.PointLight(color, num(p, 'intensity', 3), num(p, 'distance', 10), 2);
    this.group.add(light);
    if (p?.style === 'pendant') {
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.3, 18, 1, true), glossy(0x2f5d4a, 0.4, 0.3));
      (shade.material as THREE.Material).side = THREE.DoubleSide;
      shade.position.y = 0.18;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1c9 }));
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 3, 5), new THREE.MeshBasicMaterial({ color: 0x2b2b33 }));
      cord.position.y = 1.8;
      this.group.add(shade, bulb, cord);
    }
    sim.scene.add(this.group);
  }
  preStep() {}
  update() {}
  dispose() {
    this.group.removeFromParent();
  }
}
registerHazard('light', (o, sim) => new Lamp(o, sim));
