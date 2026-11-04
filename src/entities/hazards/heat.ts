import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { G, groups } from '../../physics/groups';
import { glossy, matte } from '../../render/materials';
import { surfaceMaterial } from '../../levels/surfaces';
import { registerHazard, Hazard } from './registry';
import { DEG, num, str, v3 } from './common';

const Y = new THREE.Vector3(0, 1, 0);

/**
 * Somewhere warm (or cold) that melts ice: a fireplace, a patio heater, the
 * heat lamps over a buffet, or an invisible spot (power < 0 is colder than
 * outdoors, like a walk-in freezer).
 * params: radius (m), power (melt multiplier at the centre, fading to 0 at the
 * radius), style 'fireplace' | 'patio' | 'lamp' | 'welder' (a welding bench
 * throwing sparks) | 'grill' (a barbecue) | 'none'. A fireplace faces its
 * rotation's +Z.
 */
class Heater implements Hazard {
  private group = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private t = Math.random() * 10;
  /** Where sparks fly from (welders), and when the next shower is due. */
  private sparks: THREE.Vector3 | null = null;
  private sparkT = 0;
  private smoke: THREE.Vector3 | null = null;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    const p = o.params;
    const pos = v3(o.pos);
    const yaw = (o.rot?.[1] ?? 0) * DEG;
    const style = str<'fireplace' | 'patio' | 'lamp' | 'welder' | 'grill' | 'none'>(p, 'style', 'patio');
    this.group.position.copy(pos);
    this.group.rotation.y = yaw;
    sim.scene.add(this.group);
    // the heat is centred where it's felt: in front of the hearth, under the lamp
    const centre = pos.clone();
    if (style === 'fireplace') centre.add(new THREE.Vector3(0, 0.7, 0.9).applyAxisAngle(Y, yaw));
    else if (style === 'patio') centre.y += 1.1;
    else if (style === 'lamp') centre.y -= 0.7;
    else if (style === 'welder' || style === 'grill') centre.y += 1.0;
    sim.heat?.push({ pos: centre, radius: num(p, 'radius', 3), power: num(p, 'power', 1) });
    if (style === 'fireplace') this.fireplace(pos, yaw);
    else if (style === 'patio') this.patio(pos);
    else if (style === 'lamp') this.lamp();
    else if (style === 'welder') this.welder(pos, yaw);
    else if (style === 'grill') this.grill(pos, yaw);
  }

  private solid(desc: InstanceType<typeof RAPIER.ColliderDesc>, at: THREE.Vector3, yaw: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, yaw);
    desc
      .setTranslation(at.x, at.y, at.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.8)
      .setCollisionGroups(groups(G.STATIC, 0xffff));
    const c = this.sim.physics.world.createCollider(desc);
    this.sim.physics.setInfo(c, { kind: 'static', material: 'concrete', friction: 0.8 });
  }

  private flame(r: number, h: number, color: number, x: number, z: number) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 1 }));
    m.geometry.translate(0, h / 2, 0);
    m.position.set(x, 0, z);
    this.flames.push(m);
    return m;
  }

  /** Brick hearth with a log fire; solid, so nobody walks into it. */
  private fireplace(pos: THREE.Vector3, yaw: number) {
    const brick = surfaceMaterial('brick', 0xb5654a);
    const add = (size: [number, number, number], at: [number, number, number], mat: THREE.Material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      m.position.set(...at);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    add([0.4, 1.4, 0.7], [-0.75, 0.7, 0], brick);
    add([0.4, 1.4, 0.7], [0.75, 0.7, 0], brick);
    add([1.9, 0.35, 0.7], [0, 1.225, 0], brick);
    add([1.1, 1.05, 0.15], [0, 0.525, -0.27], matte(0x2a1c12));
    add([2.2, 0.1, 0.85], [0, 1.45, 0.05], matte(0x5b3a22));
    add([1.1, 0.06, 0.5], [0, 0.03, 0.05], matte(0x3a3a40));
    const logs = matte(0x6e4a2c);
    for (const [x, a] of [[-0.12, 0.3], [0.14, -0.4]] as const) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), logs);
      log.rotation.set(0, a, Math.PI / 2);
      log.position.set(x * 0.3, 0.12, 0.02);
      this.group.add(log);
    }
    const fire = new THREE.Group();
    fire.position.set(0, 0.12, 0.02);
    fire.add(this.flame(0.2, 0.55, 0xff7a1a, 0, 0), this.flame(0.13, 0.42, 0xffb02e, -0.17, 0.05), this.flame(0.12, 0.38, 0xffd23f, 0.16, -0.02));
    this.group.add(fire);
    this.solid(RAPIER.ColliderDesc.cuboid(0.95, 0.75, 0.38), pos.clone().add(new THREE.Vector3(0, 0.75, 0)), yaw);
  }

  /** A mushroom-shaped patio heater: steel pole, glowing burner, reflector hat. */
  private patio(pos: THREE.Vector3) {
    const steel = glossy(0x9aa3ad, 0.35, 0.7);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.08, 16), steel);
    base.position.y = 0.04;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 10), steel);
    pole.position.y = 1.05;
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.32, 14), new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff5a10, emissiveIntensity: 1.4 }));
    burner.position.y = 2.0;
    this.flames.push(burner);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.2, 18, 1, true), steel);
    hat.position.y = 2.28;
    hat.material.side = THREE.DoubleSide;
    for (const m of [base, pole, burner, hat]) {
      m.castShadow = true;
      this.group.add(m);
    }
    this.solid(RAPIER.ColliderDesc.cylinder(1.1, 0.12), pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 0);
  }

  /** A red heat lamp hanging over a buffet (no collider: it's above head height). */
  private lamp() {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.22, 16, 1, true), glossy(0xd9a93f, 0.3, 0.8));
    (shade.material as THREE.Material).side = THREE.DoubleSide;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff2a10, emissiveIntensity: 1.8 }));
    bulb.position.y = -0.08;
    this.flames.push(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 6), matte(0x2b2b33));
    cord.position.y = 0.7;
    this.group.add(shade, bulb, cord);
  }

  /** A welding bench: a steel table with a torch on an arm, spitting sparks. */
  private welder(pos: THREE.Vector3, yaw: number) {
    const steel = glossy(0x7d8794, 0.4, 0.7);
    const dark = matte(0x2b2b33);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, at: [number, number, number]) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(...at);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(1.1, 0.08, 0.7), steel, [0, 0.82, 0]);
    for (const [x, z] of [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]]) add(new THREE.BoxGeometry(0.06, 0.8, 0.06), dark, [x, 0.4, z]);
    // a lump of metal being welded, and the torch on its arm
    add(new THREE.BoxGeometry(0.42, 0.16, 0.3), matte(0x5a6270), [0, 0.94, 0]);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), dark, [-0.35, 1.3, -0.2]).rotation.z = -0.9;
    const tip = add(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xbfe4ff, emissive: 0x9fd8ff, emissiveIntensity: 2.4 }), [0.05, 1.04, -0.05]);
    this.flames.push(tip);
    this.sparks = pos.clone().add(new THREE.Vector3(0.05, 1.04, -0.05).applyAxisAngle(Y, yaw));
    this.solid(RAPIER.ColliderDesc.cuboid(0.55, 0.45, 0.35), pos.clone().add(new THREE.Vector3(0, 0.45, 0)), yaw);
  }

  /** A kettle barbecue with glowing coals and a wisp of smoke. */
  private grill(pos: THREE.Vector3, yaw: number) {
    const black = glossy(0x2b2b33, 0.5, 0.3);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), black);
    bowl.position.y = 0.85;
    (bowl.material as THREE.Material).side = THREE.DoubleSide;
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xff5a10, emissive: 0xff3a00, emissiveIntensity: 1.6 }));
    coals.position.y = 0.8;
    this.flames.push(coals);
    const rack = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.01, 16), glossy(0xb0b5bc, 0.3, 0.8));
    rack.position.y = 0.86;
    this.group.add(bowl, coals, rack);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), black);
      leg.position.set(Math.cos(a) * 0.24, 0.35, Math.sin(a) * 0.24);
      leg.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
      this.group.add(leg);
    }
    // sausages
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.16, 4, 8), matte(0x9c4a2a));
      s.rotation.z = Math.PI / 2;
      s.position.set(0, 0.89, -0.15 + i * 0.1);
      this.group.add(s);
    }
    this.group.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.smoke = pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    this.solid(RAPIER.ColliderDesc.cylinder(0.45, 0.36), pos.clone().add(new THREE.Vector3(0, 0.45, 0)), yaw);
  }

  preStep() {}

  update(dt: number) {
    this.t += dt;
    // welding sparks (a shower every so often) and barbecue smoke
    if (this.sparks || this.smoke) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        if (this.sparks) {
          this.sparkT = 0.08;
          const on = Math.sin(this.t * 1.7) > -0.3;
          if (on) this.sim.fx?.burst('spark', this.sparks, { count: 3, speed: 2.6, up: 1.6, size: 0.025, life: 0.5, gravity: 9, colors: [0xffe28a, 0xffb347, 0xffffff] });
        } else if (this.smoke) {
          this.sparkT = 0.35;
          this.sim.fx?.burst('smoke', this.smoke, { count: 1, speed: 0.15, up: 0.6, size: 0.25, life: 2.2, gravity: -0.4, drag: 1, colors: [0xd9d9d9, 0xbfbfbf] });
        }
      }
    }
    this.flames.forEach((f, i) => {
      const k = 1 + 0.16 * Math.sin(this.t * 13 + i * 2.1) + 0.08 * Math.sin(this.t * 31 + i);
      f.scale.set(1, k, 1);
    });
  }

  dispose() {
    this.group.removeFromParent();
  }
}
registerHazard('heater', (o, sim) => new Heater(o, sim));
