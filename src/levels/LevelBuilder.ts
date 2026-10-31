import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER } from '../physics/rapier';
import type { Collider, RigidBody } from '../physics/rapier';
import { G, groups, SOLID } from '../physics/groups';
import type { Sim } from '../game/Sim';
import type { BallObj, BoxObj, CylinderObj, LevelDef, LevelObject, ModelObj, SignObj, Vec3 } from './types';
import { SURFACES, surfaceMaterial } from './surfaces';
import { applyBoxUV } from '../render/textures';
import { models } from '../render/models';
import { matte } from '../render/materials';

const DEG = Math.PI / 180;

export interface BuiltLevel {
  root: THREE.Group;
  /** Dynamic props (body + mesh) — for resets. */
  props: { body: RigidBody; mesh: THREE.Object3D; start: THREE.Vector3; startQ: THREE.Quaternion; tag?: string }[];
  /** Meshes that fade when they block the camera. */
  faders: THREE.Mesh[];
  /** Objects by tag for scripted hazards. */
  tagged: Map<string, THREE.Object3D[]>;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

export function roundedBox(size: Vec3, radius: number | undefined, tile: number): THREE.BufferGeometry {
  const r = radius ?? Math.min(0.07, Math.min(size[0], size[1], size[2]) * 0.22);
  const key = `rb_${size.join('_')}_${r.toFixed(3)}_${tile}`;
  let g = geoCache.get(key);
  if (!g) {
    const big = Math.max(...size) > 6;
    g = new RoundedBoxGeometry(size[0], size[1], size[2], big ? 2 : 3, Math.max(0.001, r));
    applyBoxUV(g, tile);
    geoCache.set(key, g);
  }
  return g;
}

function cylinderGeo(o: CylinderObj, tile: number) {
  const key = `cyl_${o.radius}_${o.radiusTop ?? o.radius}_${o.height}_${o.segments ?? 24}_${tile}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(o.radiusTop ?? o.radius, o.radius, o.height, o.segments ?? 24, 1);
    applyBoxUV(g, tile);
    geoCache.set(key, g);
  }
  return g;
}

function quatFrom(rot?: Vec3) {
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(new THREE.Euler(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG));
  return q;
}

/** Turns level data into meshes + colliders. Hazards are created separately. */
export class LevelBuilder {
  private staticBatches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  /** Colliders made for the object being added (to tag them afterwards). */
  private made: Collider[] = [];

  constructor(private sim: Sim) {}

  build(def: LevelDef): BuiltLevel {
    const root = new THREE.Group();
    root.name = `level_${def.id}`;
    const built: BuiltLevel = { root, props: [], faders: [], tagged: new Map() };
    this.staticBatches.clear();
    for (const o of def.objects) this.addObject(o, built);
    this.flushStatic(root);
    return built;
  }

  private tag(built: BuiltLevel, tag: string | undefined, obj: THREE.Object3D) {
    if (!tag) return;
    let arr = built.tagged.get(tag);
    if (!arr) built.tagged.set(tag, (arr = []));
    arr.push(obj);
  }

  addObject(o: LevelObject, built: BuiltLevel) {
    this.made = [];
    switch (o.type) {
      case 'box':
        this.addBox(o, built);
        break;
      case 'cylinder':
        this.addCylinder(o, built);
        break;
      case 'ball':
        this.addBall(o, built);
        break;
      case 'model':
        this.addModel(o, built);
        break;
      case 'sign':
        this.addSign(o, built);
        break;
      case 'hazard':
        return; // handled by the session
    }
    if (o.sharp) for (const c of this.made) this.sim.physics.info(c)!.sharp = true;
    if (o.tie) for (const c of this.made) this.sim.physics.info(c)!.tie = true;
  }

  private staticCollider(desc: InstanceType<typeof RAPIER.ColliderDesc>, pos: Vec3, q: THREE.Quaternion, surface: keyof typeof SURFACES, friction?: number, surfaceVel?: Vec3) {
    const s = SURFACES[surface];
    desc
      .setTranslation(pos[0], pos[1], pos[2])
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(friction ?? s.friction)
      .setCollisionGroups(groups(G.STATIC, 0xffff));
    const c = this.sim.physics.world.createCollider(desc);
    this.made.push(c);
    this.sim.physics.setInfo(c, {
      kind: 'static',
      material: s.sound,
      friction: friction ?? s.friction,
      surfaceVelocity: surfaceVel ? new THREE.Vector3(...surfaceVel) : undefined,
    });
    return c;
  }

  private dynamicBody(pos: Vec3, q: THREE.Quaternion, desc: InstanceType<typeof RAPIER.ColliderDesc>, mass: number, surface: keyof typeof SURFACES, grabbable = true, friction?: number) {
    const world = this.sim.physics.world;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos[0], pos[1], pos[2])
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.05)
        .setAngularDamping(0.25),
    );
    const s = SURFACES[surface];
    desc
      .setMass(mass)
      .setFriction(friction ?? s.friction)
      .setRestitution(0.1)
      .setCollisionGroups(groups(G.PROP, SOLID | G.DEBRIS))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const c = world.createCollider(desc, body);
    this.made.push(c);
    this.sim.physics.setInfo(c, { kind: 'prop', material: s.sound, grabbable, owner: body });
    return body;
  }

  private addMesh(mesh: THREE.Mesh, built: BuiltLevel, opts: { dynamic?: boolean; fade?: boolean; tag?: string; castShadow?: boolean }) {
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = true;
    this.tag(built, opts.tag, mesh);
    if (opts.dynamic || opts.fade || opts.tag) {
      built.root.add(mesh);
      if (opts.fade) built.faders.push(mesh);
      return;
    }
    // merge statics by material to keep draw calls low
    mesh.updateMatrix();
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    g.applyMatrix4(mesh.matrix);
    const mat = mesh.material as THREE.Material;
    let arr = this.staticBatches.get(mat);
    if (!arr) this.staticBatches.set(mat, (arr = []));
    arr.push(g);
  }

  private flushStatic(root: THREE.Group) {
    for (const [mat, geos] of this.staticBatches) {
      for (const g of geos) {
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      }
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'static_batch';
      root.add(m);
    }
    this.staticBatches.clear();
  }

  private addBox(o: BoxObj, built: BuiltLevel) {
    const surface = o.surface ?? 'plain';
    const s = SURFACES[surface];
    const q = quatFrom(o.rot);
    const half = o.size.map((v) => v / 2) as Vec3;
    if (o.dynamic) {
      const body = this.dynamicBody(o.pos, q, RAPIER.ColliderDesc.cuboid(...half), o.dynamic.mass, surface, o.grabbable ?? true, o.friction);
      const mesh = new THREE.Mesh(roundedBox(o.size, o.radius, o.tile ?? s.tile), surfaceMaterial(surface, o.color));
      this.addMesh(mesh, built, { dynamic: true, tag: o.tag });
      this.sim.physics.link(body, mesh);
      built.props.push({ body, mesh, start: new THREE.Vector3(...o.pos), startQ: q.clone(), tag: o.tag });
      return;
    }
    if (o.collide !== false) {
      const c = this.staticCollider(RAPIER.ColliderDesc.cuboid(...half), o.pos, q, surface, o.friction, o.surfaceVel);
      if (o.grabbable === false) this.sim.physics.info(c)!.grabbable = false;
    }
    if (o.visible !== false) {
      const mat: THREE.Material = o.fade ? surfaceMaterial(surface, o.color).clone() : surfaceMaterial(surface, o.color);
      const mesh = new THREE.Mesh(roundedBox(o.size, o.radius, o.tile ?? s.tile), mat);
      mesh.position.set(...o.pos);
      mesh.quaternion.copy(q);
      this.addMesh(mesh, built, { fade: o.fade, tag: o.tag, castShadow: o.castShadow });
    }
  }

  private addCylinder(o: CylinderObj, built: BuiltLevel) {
    const surface = o.surface ?? 'plain';
    const s = SURFACES[surface];
    const q = quatFrom(o.rot);
    const rTop = o.radiusTop ?? o.radius;
    const desc =
      rTop === o.radius
        ? RAPIER.ColliderDesc.cylinder(o.height / 2, o.radius)
        : RAPIER.ColliderDesc.cone(o.height / 2, Math.max(o.radius, rTop));
    if (o.dynamic) {
      const body = this.dynamicBody(o.pos, q, desc, o.dynamic.mass, surface, true, o.friction);
      const mesh = new THREE.Mesh(cylinderGeo(o, s.tile), surfaceMaterial(surface, o.color));
      this.addMesh(mesh, built, { dynamic: true, tag: o.tag });
      this.sim.physics.link(body, mesh);
      built.props.push({ body, mesh, start: new THREE.Vector3(...o.pos), startQ: q.clone(), tag: o.tag });
      return;
    }
    if (o.collide !== false) this.staticCollider(desc, o.pos, q, surface, o.friction);
    if (o.visible !== false) {
      const mesh = new THREE.Mesh(cylinderGeo(o, s.tile), surfaceMaterial(surface, o.color));
      mesh.position.set(...o.pos);
      mesh.quaternion.copy(q);
      this.addMesh(mesh, built, { tag: o.tag });
    }
  }

  private addBall(o: BallObj, built: BuiltLevel) {
    const surface = o.surface ?? 'plain';
    const q = quatFrom(o.rot);
    const geo = new THREE.SphereGeometry(o.radius, 24, 16);
    const mesh = new THREE.Mesh(geo, surfaceMaterial(surface, o.color));
    if (o.dynamic) {
      const body = this.dynamicBody(o.pos, q, RAPIER.ColliderDesc.ball(o.radius), o.dynamic.mass, surface);
      this.addMesh(mesh, built, { dynamic: true, tag: o.tag });
      this.sim.physics.link(body, mesh);
      built.props.push({ body, mesh, start: new THREE.Vector3(...o.pos), startQ: q.clone(), tag: o.tag });
      return;
    }
    if (o.collide !== false) this.staticCollider(RAPIER.ColliderDesc.ball(o.radius), o.pos, q, surface);
    mesh.position.set(...o.pos);
    this.addMesh(mesh, built, { tag: o.tag });
  }

  private addModel(o: ModelObj, built: BuiltLevel) {
    const q = quatFrom(o.rot);
    const inst = models.instance(o.model, o.size);
    const size: Vec3 = inst.size;
    if ((o.align ?? 'bottom') === 'bottom') o = { ...o, pos: [o.pos[0], o.pos[1] + size[1] / 2, o.pos[2]] };
    const surface = o.surface ?? 'wood';
    let colSize: Vec3 | null = size;
    let colOffset: Vec3 = [0, 0, 0];
    if (o.collider === 'none') colSize = null;
    else if (o.collider && typeof o.collider === 'object') {
      colSize = o.collider.size;
      colOffset = o.collider.offset ?? [0, 0, 0];
    }
    if (o.dynamic) {
      const desc = RAPIER.ColliderDesc.cuboid(...((colSize ?? size).map((v) => v / 2) as Vec3)).setTranslation(...colOffset);
      const body = this.dynamicBody(o.pos, q, desc, o.dynamic.mass, surface, o.grabbable ?? true);
      const holder = new THREE.Group();
      holder.add(inst.object);
      built.root.add(holder);
      this.tag(built, o.tag, holder);
      this.sim.physics.link(body, holder);
      built.props.push({ body, mesh: holder, start: new THREE.Vector3(...o.pos), startQ: q.clone(), tag: o.tag });
      return;
    }
    if (colSize) {
      const off = new THREE.Vector3(...colOffset).applyQuaternion(q);
      this.staticCollider(
        RAPIER.ColliderDesc.cuboid(...(colSize.map((v) => v / 2) as Vec3)),
        [o.pos[0] + off.x, o.pos[1] + off.y, o.pos[2] + off.z],
        q,
        surface,
      );
    }
    inst.object.position.set(...o.pos);
    inst.object.quaternion.copy(q);
    built.root.add(inst.object);
    this.tag(built, o.tag, inst.object);
  }

  private addSign(o: SignObj, built: BuiltLevel) {
    const q = quatFrom(o.rot);
    const [w, h, d] = o.size;
    const group = new THREE.Group();
    group.position.set(...o.pos);
    group.quaternion.copy(q);
    const board = new THREE.Mesh(roundedBox([w, h, d], Math.min(0.04, d / 2.2), 1), matte(o.color ?? 0x3d5a80));
    board.castShadow = true;
    group.add(board);
    const tex = textTexture(o.text, w, h, o.textColor ?? '#ffffff', o.bg, o.fontSize);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.94, h * 0.9), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8 }));
    face.position.z = d / 2 + 0.003;
    group.add(face);
    const back = face.clone();
    back.rotation.y = Math.PI;
    back.position.z = -d / 2 - 0.003;
    group.add(back);
    if (o.post) {
      const postH = o.pos[1] - h / 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, postH, 10), matte(0x6b6b73));
      post.position.y = -h / 2 - postH / 2;
      post.castShadow = true;
      group.add(post);
    }
    built.root.add(group);
    this.tag(built, o.tag, group);
  }
}

export function textTexture(text: string, w: number, h: number, color: string, bg?: string, fontSize?: number, outline?: string) {
  const scale = 256;
  const cw = Math.max(64, Math.round(w * scale));
  const ch = Math.max(32, Math.round(h * scale));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d')!;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.fillStyle = color;
  const lines = text.split('\n');
  let fs = fontSize ? fontSize * scale : Math.min(ch / (lines.length * 1.25), (cw / Math.max(...lines.map((l) => l.length))) * 1.7);
  const font = (px: number) => `800 ${px}px "Fredoka", ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.font = font(fs);
  // never run off the edge: shrink long lines to fit
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  if (widest > cw * 0.94) {
    fs *= (cw * 0.94) / widest;
    ctx.font = font(fs);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    const y = ch / 2 + (i - (lines.length - 1) / 2) * fs * 1.15;
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = fs * 0.16;
      ctx.lineJoin = 'round';
      ctx.strokeText(l, cw / 2, y);
    }
    ctx.fillText(l, cw / 2, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
