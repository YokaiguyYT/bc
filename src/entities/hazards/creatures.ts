import * as THREE from 'three';
import { RAPIER } from '../../physics/rapier';
import type { RigidBody } from '../../physics/rapier';
import type { Sim } from '../../game/Sim';
import type { HazardObj } from '../../levels/types';
import { registerHazard, Hazard } from './registry';
import { DEG, num, v3 } from './common';
import { Player } from '../Player';
import { PlayerRig } from '../PlayerRig';
import { G, groups, SOLID } from '../../physics/groups';
import { models } from '../../render/models';
import { glossy } from '../../render/materials';

let npcCounter = 2;

/** A random wander target: inside `area` ([w, d] box around home) if given, else a circle. */
function randomTarget(out: THREE.Vector3, home: THREE.Vector3, radius: number, area?: [number, number]) {
  if (area) return out.set(home.x + (Math.random() - 0.5) * area[0], home.y, home.z + (Math.random() - 0.5) * area[1]);
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return out.set(home.x + Math.cos(a) * r, home.y, home.z + Math.sin(a) * r);
}
const NPC_COLORS = [0x8bc34a, 0xb085f5, 0xffb74d, 0x4dd0e1, 0xf06292, 0xa1887f, 0x9ccc65, 0xffd54f];

// ------------------------------------------------------------------ NPC movers (drunk guy, pedestrians)

/**
 * A computer-controlled bean. mode 'drunk': staggers around `radius` of home
 * (or inside `area` [w, d]), falls over a lot, wanders up to players.
 * mode 'walk': follows `points`.
 */
class Npc implements Hazard {
  readonly player: Player;
  private rig: PlayerRig;
  private home: THREE.Vector3;
  private target = new THREE.Vector3();
  private retarget = 0;
  private wobbleT = Math.random() * 10;
  private hiccupT = 2 + Math.random() * 3;
  private pts: THREE.Vector3[] = [];
  private ptIdx = 0;
  private ptDir = 1;
  private stuck = 0;
  private pause = 0;
  private lastPos = new THREE.Vector3();

  constructor(
    private o: HazardObj,
    private sim: Sim,
    private mode: 'drunk' | 'walk',
  ) {
    const p = o.params;
    this.home = v3(o.pos);
    const color = (p?.color as number) ?? NPC_COLORS[npcCounter % NPC_COLORS.length];
    this.player = new Player(sim, {
      index: npcCounter++,
      name: mode === 'drunk' ? 'Gary' : 'Pedestrian',
      color,
      position: this.home.clone(),
      yaw: (o.rot?.[1] ?? 0) * DEG,
      npc: true,
    });
    if (mode === 'drunk') {
      this.player.balanceScale = 0.42;
      this.player.speedScale = 0.55;
    } else {
      this.player.balanceScale = 0.9;
      this.player.speedScale = num(p, 'speed', 0.62);
      const raw = (p?.points as [number, number, number][] | undefined) ?? [
        [0, 0, 0],
        [0, 0, 8],
      ];
      this.pts = raw.map((r) => this.home.clone().add(new THREE.Vector3(...r)));
    }
    this.rig = new PlayerRig(this.player, sim.physics);
    sim.scene.add(this.rig.root);
    if (mode === 'drunk') {
      // a lampshade hat, naturally
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 0.26, 18, 1, true), glossy(0xfff1c9, 0.6, 0));
      (shade.material as THREE.Material).side = THREE.DoubleSide;
      shade.position.y = 0.28;
      shade.rotation.z = 0.25;
      this.rig.partObjects.head.add(shade);
    }
    this.target.copy(this.home);
  }

  preStep(dt: number) {
    const p = this.player;
    const pos = p.bodyPos;
    const intent = p.intent;
    if (this.mode === 'drunk') {
      this.retarget -= dt;
      const radius = num(this.o.params, 'radius', 4);
      if (this.retarget <= 0 || pos.distanceTo(this.target) < 0.6) {
        this.retarget = 2 + Math.random() * 3;
        const players = this.sim.players ?? [];
        const near = players.find((pl) => pl.bodyPos.distanceTo(pos) < 4 && pl.bodyPos.distanceTo(this.home) < radius + 2);
        if (near && Math.random() < 0.45) {
          // stagger up for a chat, but stop short: he's a nuisance, not a tackle
          const back = pos.clone().sub(near.bodyPos).setY(0);
          const l = back.length() || 1;
          this.target.copy(near.bodyPos).addScaledVector(back, Math.min(1.3, l) / l);
        } else randomTarget(this.target, this.home, radius, this.o.params?.area as [number, number] | undefined);
      }
      this.wobbleT += dt;
      const to = this.target.clone().sub(pos).setY(0);
      const d = to.length();
      if (d > 0.3) to.multiplyScalar(1 / d);
      // stagger: swerve around the intended direction
      const swerve = Math.sin(this.wobbleT * 1.7) * 0.9 + Math.sin(this.wobbleT * 3.1) * 0.4;
      const c = Math.cos(swerve);
      const s = Math.sin(swerve);
      intent.moveX = (to.x * c - to.z * s) * (d > 0.3 ? 1 : 0);
      intent.moveZ = (to.x * s + to.z * c) * (d > 0.3 ? 1 : 0);
      this.hiccupT -= dt;
      if (this.hiccupT <= 0) {
        this.hiccupT = 2.5 + Math.random() * 4;
        this.sim.events.emit('hazard', { pos: p.bodyPos.clone(), kind: 'hiccup' });
        if (Math.random() < 0.3 && p.grounded) intent.jumpPressed = true;
      }
    } else {
      if (this.pause > 0) {
        this.pause -= dt;
        intent.moveX = intent.moveZ = 0;
      } else if (this.giveWay(pos)) {
        intent.moveX = intent.moveZ = 0;
      } else {
        const tgt = this.pts[this.ptIdx];
        const to = tgt.clone().sub(pos).setY(0);
        const d = to.length();
        if (d < 0.7) {
          if (this.ptIdx + this.ptDir >= this.pts.length || this.ptIdx + this.ptDir < 0) this.ptDir *= -1;
          this.ptIdx += this.ptDir;
          if (Math.random() < 0.3) this.pause = 1 + Math.random() * 2;
        }
        to.normalize();
        // shuffle sideways if stuck on something (or someone)
        if (pos.distanceTo(this.lastPos) < 0.003 * 60 * dt) this.stuck += dt;
        else this.stuck = Math.max(0, this.stuck - dt);
        if (this.stuck > 0.8) {
          to.set(-to.z, 0, to.x);
          if (this.stuck > 1.6) this.stuck = 0;
        }
        intent.moveX = to.x;
        intent.moveZ = to.z;
      }
      this.lastPos.copy(pos);
    }
    p.preStep(dt);
  }

  /** Walkers are polite: they stop for a mover or the load right in their path. */
  private giveWay(pos: THREE.Vector3) {
    const tgt = this.pts[this.ptIdx];
    const dir = tgt.clone().sub(pos).setY(0);
    if (dir.lengthSq() < 1e-4) return false;
    dir.normalize();
    const blocked = (p: THREE.Vector3) => {
      const rel = p.clone().sub(pos).setY(0);
      const ahead = rel.dot(dir);
      const side = Math.abs(rel.x * dir.z - rel.z * dir.x);
      return ahead > 0.2 && ahead < 1.9 && side < 0.9;
    };
    const others = (this.sim.players ?? []).map((p) => p.bodyPos);
    const cargo = this.sim.cargo?.body.translation();
    if (cargo) others.push(new THREE.Vector3(cargo.x, cargo.y, cargo.z));
    return others.some(blocked);
  }

  postStep(dt: number) {
    this.player.postStep(dt);
    // fell off the world: come back home
    if (this.player.bodyPos.y < this.home.y - 12) {
      this.player.teleport(this.home.clone(), 0);
      this.sim.physics.snapLinks();
    }
  }

  update(dt: number) {
    this.rig.update(dt);
  }

  dispose() {
    this.rig.dispose();
    this.player.dispose();
  }
}
registerHazard('drunk', (o, sim) => new Npc(o, sim, 'drunk'));
registerHazard('pedestrian', (o, sim) => new Npc(o, sim, 'walk'));

// ------------------------------------------------------------------ dog

/** An excitable dog: wanders, chases movers, and jumps up at them. params: radius, area [w, d]. */
class Dog implements Hazard {
  private body: RigidBody;
  private visual = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private home: THREE.Vector3;
  private target = new THREE.Vector3();
  private state: 'idle' | 'wander' | 'chase' | 'retreat' = 'idle';
  private stateT = 1;
  private yaw = 0;
  private chaseCool = 2;
  private barkT = 0;

  constructor(
    private o: HazardObj,
    private sim: Sim,
  ) {
    this.home = v3(o.pos);
    const world = sim.physics.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this.home.x, this.home.y + 0.3, this.home.z)
        .lockRotations()
        .setLinearDamping(0.5)
        .setCanSleep(false),
    );
    const c = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.18, 0.17)
        .setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })
        .setMass(16)
        .setFriction(0.3)
        .setCollisionGroups(groups(G.NPC, SOLID)),
      this.body,
    );
    sim.physics.setInfo(c, { kind: 'npc', owner: this, material: 'soft', grabbable: true });
    const inst = models.instance('dog', [0.42, 0.5, 0.8]);
    inst.object.position.y = -0.08;
    this.visual.add(inst.object);
    if (inst.clips.length && inst.root) {
      this.mixer = new THREE.AnimationMixer(inst.root);
      for (const clip of inst.clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    sim.scene.add(this.visual);
    sim.physics.link(this.body, this.visual);
    this.play('sitting_idle');
  }

  private play(name: string) {
    if (name === this.current || !this.actions.size) return;
    const next = this.actions.get(name) ?? [...this.actions.values()][0];
    const prev = this.actions.get(this.current);
    next.reset().fadeIn(0.25).play();
    prev?.fadeOut(0.25);
    this.current = name;
  }

  preStep(dt: number) {
    const t = this.body.translation();
    const pos = new THREE.Vector3(t.x, t.y, t.z);
    const players = this.sim.players ?? [];
    const radius = num(this.o.params, 'radius', 5);
    this.stateT -= dt;
    this.chaseCool -= dt;
    let speed = 0;
    let nearest: Player | null = null;
    let nd = 1e9;
    for (const p of players) {
      const d = p.bodyPos.distanceTo(pos);
      if (d < nd && p.bodyPos.distanceTo(this.home) < radius + 4) {
        nd = d;
        nearest = p;
      }
    }
    if (this.state !== 'chase' && this.state !== 'retreat' && nearest && nd < 5 && this.chaseCool <= 0) {
      this.state = 'chase';
      this.stateT = 4;
    }
    switch (this.state) {
      case 'idle':
        if (this.stateT <= 0) {
          this.state = 'wander';
          this.stateT = 3 + Math.random() * 3;
          randomTarget(this.target, this.home, radius, this.o.params?.area as [number, number] | undefined);
        }
        break;
      case 'wander':
        speed = 1.6;
        if (this.stateT <= 0 || pos.distanceTo(this.target) < 0.4) {
          this.state = 'idle';
          this.stateT = 1.5 + Math.random() * 3;
        }
        break;
      case 'chase':
        speed = 4.2;
        if (nearest) this.target.copy(nearest.bodyPos);
        this.barkT -= dt;
        if (this.barkT <= 0) {
          this.barkT = 0.6 + Math.random() * 0.8;
          this.sim.events.emit('bark', { pos: pos.clone() });
        }
        if (nearest && nd < 1.1) {
          // jump up at them
          this.body.applyImpulse({ x: (nearest.bodyPos.x - pos.x) * 18, y: 70, z: (nearest.bodyPos.z - pos.z) * 18 }, true);
          const push = nearest.bodyPos.clone().sub(pos).setY(0).normalize().multiplyScalar(1.6 * nearest.totalMass);
          nearest.applyBlast(push);
          this.state = 'retreat';
          this.stateT = 1.6;
          this.chaseCool = 4 + Math.random() * 3;
          const away = pos.clone().sub(nearest.bodyPos).setY(0).normalize().multiplyScalar(3);
          this.target.copy(pos).add(away);
        } else if (this.stateT <= 0) {
          this.state = 'retreat';
          this.stateT = 1.2;
          this.chaseCool = 3;
          this.target.copy(this.home);
        }
        break;
      case 'retreat':
        speed = 3.2;
        if (this.stateT <= 0) {
          this.state = 'idle';
          this.stateT = 1 + Math.random() * 2;
        }
        break;
    }
    // keep the dog near home
    if (pos.distanceTo(this.home) > radius + 3) this.target.copy(this.home);
    const to = this.target.clone().sub(pos).setY(0);
    const d = to.length();
    const v = this.body.linvel();
    if (speed > 0 && d > 0.2) {
      to.multiplyScalar(speed / d);
      const k = Math.min(1, dt * 8);
      this.body.setLinvel({ x: v.x + (to.x - v.x) * k, y: v.y, z: v.z + (to.z - v.z) * k }, true);
      const targetYaw = Math.atan2(to.x, to.z);
      let dy = targetYaw - this.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 10);
    } else {
      this.body.setLinvel({ x: v.x * 0.9, y: v.y, z: v.z * 0.9 }, true);
    }
    if (pos.y < this.home.y - 10) {
      this.body.setTranslation({ x: this.home.x, y: this.home.y + 0.5, z: this.home.z }, true);
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  update(dt: number) {
    const v = this.body.linvel();
    const sp = Math.hypot(v.x, v.z);
    this.visual.children[0].rotation.y = this.yaw;
    if (sp > 0.4) this.play('walking_cycle');
    else this.play(this.state === 'idle' ? 'sitting_idle' : 'standing_idle');
    const walk = this.actions.get('walking_cycle');
    if (walk) walk.timeScale = Math.max(0.6, sp / 1.6);
    this.mixer?.update(dt);
  }

  dispose() {
    this.visual.removeFromParent();
  }
}
registerHazard('dog', (o, sim) => new Dog(o, sim));

// ------------------------------------------------------------------ pigeons

/** A little flock that hops about and scatters when movers come close. params: count, radius. */
class Pigeons implements Hazard {
  private birds: {
    obj: THREE.Object3D;
    mixer: THREE.AnimationMixer | null;
    home: THREE.Vector3;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    flying: number;
    hop: number;
    yaw: number;
  }[] = [];
  private center: THREE.Vector3;

  constructor(
    o: HazardObj,
    private sim: Sim,
  ) {
    this.center = v3(o.pos);
    const n = num(o.params, 'count', 6);
    const r = num(o.params, 'radius', 1.8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * r;
      const home = this.center.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
      const inst = models.instance('pigeon', [0.22, 0.28, 0.36]);
      const holder = new THREE.Group();
      holder.add(inst.object);
      inst.object.position.y = 0.12;
      let mixer: THREE.AnimationMixer | null = null;
      if (inst.clips.length && inst.root) {
        mixer = new THREE.AnimationMixer(inst.root);
        const act = mixer.clipAction(inst.clips[0]);
        act.play();
        act.timeScale = 0;
        act.time = 0.35;
      }
      sim.scene.add(holder);
      this.birds.push({ obj: holder, mixer, home, pos: home.clone(), vel: new THREE.Vector3(), flying: 0, hop: Math.random() * 5, yaw: Math.random() * 6 });
    }
  }

  preStep() {}

  update(dt: number) {
    const players = this.sim.players ?? [];
    let scare = false;
    for (const p of players) if (p.bodyPos.distanceTo(this.center) < 3.2) scare = true;
    for (const b of this.birds) {
      if (b.flying > 0) {
        b.flying -= dt;
        b.vel.y += 2.5 * dt;
        b.pos.addScaledVector(b.vel, dt);
        b.mixer?.update(dt * 3);
        if (b.flying <= 0) {
          b.pos.copy(b.home);
          b.vel.set(0, 0, 0);
        }
      } else {
        if (scare) {
          b.flying = 6 + Math.random() * 4;
          const away = b.pos.clone().sub(this.center).setY(0).normalize();
          b.vel.set(away.x * 3 + (Math.random() - 0.5), 3 + Math.random() * 2, away.z * 3 + (Math.random() - 0.5));
          b.yaw = Math.atan2(b.vel.x, b.vel.z);
          this.sim.events.emit('hazard', { pos: b.pos.clone(), kind: 'flap' });
          continue;
        }
        // hop, peck, turn
        b.hop -= dt;
        if (b.hop <= 0) {
          b.hop = 0.6 + Math.random() * 2.5;
          b.yaw += (Math.random() - 0.5) * 2;
          b.pos.x += Math.sin(b.yaw) * 0.12;
          b.pos.z += Math.cos(b.yaw) * 0.12;
          if (b.pos.distanceTo(b.home) > 1) b.pos.lerp(b.home, 0.3);
        }
      }
      const peck = b.flying > 0 ? 0 : Math.max(0, Math.sin(this.sim.time() * 9 + b.home.x * 7)) * 0.05;
      b.obj.position.set(b.pos.x, b.pos.y - peck * 0.3, b.pos.z);
      b.obj.rotation.set(peck * 4, b.yaw, 0);
    }
  }

  dispose() {
    for (const b of this.birds) b.obj.removeFromParent();
  }
}
registerHazard('pigeons', (o, sim) => new Pigeons(o, sim));

// ------------------------------------------------------------------ chandelier

/** A heavy chandelier on a chain that swings when bumped. params: length. */
class Chandelier implements Hazard {
  private body: RigidBody;
  private visual = new THREE.Group();
  private chain: THREE.Mesh;
  private anchor: THREE.Vector3;
  constructor(o: HazardObj, sim: Sim) {
    this.anchor = v3(o.pos);
    const L = num(o.params, 'length', 1.6);
    const world = sim.physics.world;
    const fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.anchor.x, this.anchor.y, this.anchor.z));
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this.anchor.x, this.anchor.y - L, this.anchor.z)
        .setAngularDamping(0.8)
        .setLinearDamping(0.1)
        .setCanSleep(false),
    );
    const c = world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.35, 0.55).setMass(25).setCollisionGroups(groups(G.PROP, SOLID)).setTranslation(0, -0.2, 0),
      this.body,
    );
    sim.physics.setInfo(c, { kind: 'prop', material: 'metal', grabbable: true });
    world.createImpulseJoint(RAPIER.JointData.spherical({ x: 0, y: 0, z: 0 }, { x: 0, y: L, z: 0 }), fixed, this.body, true);
    const inst = models.instance('chandelier', [1.2, 1.1, 1.2]);
    inst.object.position.y = -0.2;
    this.visual.add(inst.object);
    // warm glow
    const glow = new THREE.PointLight(0xffd59a, 2.5, 6, 2);
    glow.position.y = -0.2;
    this.visual.add(glow);
    sim.scene.add(this.visual);
    sim.physics.link(this.body, this.visual);
    this.chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), glossy(0xd9a93f, 0.3, 0.8));
    sim.scene.add(this.chain);
  }
  preStep() {}
  update() {
    const b = this.visual.position;
    this.chain.position.copy(b).add(this.anchor).multiplyScalar(0.5);
    const d = this.anchor.clone().sub(b);
    this.chain.scale.set(1, d.length(), 1);
    this.chain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }
  dispose() {
    this.visual.removeFromParent();
    this.chain.removeFromParent();
  }
}
registerHazard('chandelier', (o, sim) => new Chandelier(o, sim));
