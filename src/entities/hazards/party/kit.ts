import * as THREE from 'three';
import { RAPIER } from '../../../physics/rapier';
import type { Collider, RigidBody } from '../../../physics/rapier';
import type { Sim } from '../../../game/Sim';
import { G, groups, SOLID } from '../../../physics/groups';
import type { ColliderInfo } from '../../../physics/PhysicsWorld';

/** Bits for building party arenas: floors that move, things to throw about. */

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** A floor or wall the hazard moves (kinematic) or keeps still (fixed), with its look. */
export function platform(
  sim: Sim,
  root: THREE.Object3D,
  pos: THREE.Vector3,
  desc: InstanceType<typeof RAPIER.ColliderDesc>,
  look: THREE.Object3D,
  opts: { moving?: boolean; friction?: number; material?: ColliderInfo['material']; grabbable?: boolean } = {},
) {
  const world = sim.physics.world;
  const body = world.createRigidBody((opts.moving ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed()).setTranslation(pos.x, pos.y, pos.z));
  const friction = opts.friction ?? 0.9;
  desc.setFriction(friction).setCollisionGroups(groups(G.STATIC, SOLID | G.DEBRIS));
  const col = world.createCollider(desc, body);
  sim.physics.setInfo(col, { kind: 'static', material: opts.material ?? 'wood', friction, grabbable: opts.grabbable ?? false });
  root.add(look);
  if (opts.moving) sim.physics.link(body, look);
  else look.position.copy(pos);
  return { body, col, look };
}

export interface Prop {
  body: RigidBody;
  col: Collider;
  obj: THREE.Object3D;
  park: THREE.Vector3;
  live: boolean;
}

/** A loose thing to push or carry about, made up front and parked out of sight until it's needed. */
export function prop(
  sim: Sim,
  root: THREE.Object3D,
  desc: InstanceType<typeof RAPIER.ColliderDesc>,
  obj: THREE.Object3D,
  park: THREE.Vector3,
  opts: { material?: ColliderInfo['material']; grabbable?: boolean; friction?: number; damping?: number; angDamping?: number; ccd?: boolean; owner?: unknown } = {},
): Prop {
  const world = sim.physics.world;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(park.x, park.y, park.z)
      .setLinearDamping(opts.damping ?? 0.1)
      .setAngularDamping(opts.angDamping ?? 0.4)
      .setCcdEnabled(opts.ccd ?? false)
      .setEnabled(false),
  );
  desc.setFriction(opts.friction ?? 0.7).setCollisionGroups(groups(G.PROP, SOLID | G.DEBRIS)).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  const col = world.createCollider(desc, body);
  sim.physics.setInfo(col, { kind: 'prop', material: opts.material ?? 'wood', grabbable: opts.grabbable ?? true, owner: opts.owner ?? body });
  obj.visible = false;
  root.add(obj);
  sim.physics.link(body, obj);
  return { body, col, obj, park: park.clone(), live: false };
}

const _q = new THREE.Quaternion();

export function spawnProp(t: Prop, pos: THREE.Vector3, vel?: THREE.Vector3, yaw = 0) {
  const b = t.body;
  b.setEnabled(true);
  b.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
  _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
  b.setLinvel({ x: vel?.x ?? 0, y: vel?.y ?? 0, z: vel?.z ?? 0 }, true);
  b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  t.live = true;
  t.obj.visible = true;
}

export function parkProp(t: Prop) {
  const b = t.body;
  b.setTranslation({ x: t.park.x, y: t.park.y, z: t.park.z }, false);
  b.setLinvel({ x: 0, y: 0, z: 0 }, false);
  b.setAngvel({ x: 0, y: 0, z: 0 }, false);
  b.setEnabled(false);
  t.live = false;
  t.obj.visible = false;
}

/** The online guest: show the things that are in play (a parked one sits far below). */
export function showLive(props: Prop[]) {
  for (const t of props) t.obj.visible = t.body.translation().y > -150;
}

/** Somewhere far below to keep things that aren't in play (each its own spot). */
export function parkSpot(i: number) {
  return new THREE.Vector3(-40 + (i % 16) * 5, -300, -40 + Math.floor(i / 16) * 5);
}

/** Pack small whole numbers (0..3) into floats, 12 to a float (for netState). */
export function pack2(v: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < v.length; i += 12) {
    let n = 0;
    for (let j = 0; j < 12 && i + j < v.length; j++) n += (v[i + j] & 3) * 4 ** j;
    out.push(n);
  }
  return out;
}
export function unpack2(f: number[], into: Uint8Array) {
  for (let i = 0; i < into.length; i++) {
    const n = f[Math.floor(i / 12)] ?? 0;
    into[i] = Math.floor(n / 4 ** (i % 12)) % 4;
  }
}

/** Who's holding this body (0, 1, both 2, nobody -1). */
export function holder(players: { hands: { grip: { body: RigidBody | null } | null }[] }[], body: RigidBody) {
  let w = -1;
  players.forEach((p, i) => {
    // (by handle: the physics library can hand out more than one wrapper for the same body)
    if (p.hands.some((h) => h.grip?.body?.handle === body.handle)) w = w === -1 ? i : 2;
  });
  return w;
}

/** A canvas texture with a big word or two on it (signs, the scoreboard over the arena). */
export function wordTexture(text: string, bg: string, fg: string, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.font = `800 ${Math.round(h * 0.62)}px "Fredoka", ui-rounded, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // an outline, so it reads on anything
  g.lineJoin = 'round';
  g.lineWidth = h * 0.14;
  g.strokeStyle = '#2b2233';
  g.strokeText(text, w / 2, h / 2 + h * 0.04);
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + h * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A truck's load bed (see levels/party.ts truck()): painted in its owner's colour, and what's in it. */
export class Bay {
  readonly mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, transparent: true, opacity: 0.55 });
  readonly minX: number;
  readonly maxX: number;
  constructor(
    root: THREE.Object3D,
    x0: number,
    s: -1 | 1,
    readonly L = 4,
    readonly W = 3,
  ) {
    this.minX = Math.min(x0, x0 + s * L);
    this.maxX = Math.max(x0, x0 + s * L);
    const pad = mesh(new THREE.BoxGeometry(L - 0.2, 0.03, W - 0.2), this.mat, false);
    pad.position.set((this.minX + this.maxX) / 2, 0.016, 0);
    root.add(pad);
  }
  get cx() {
    return (this.minX + this.maxX) / 2;
  }
  contains(x: number, z: number, y = 0.5) {
    return x > this.minX + 0.15 && x < this.maxX - 0.15 && Math.abs(z) < this.W / 2 - 0.1 && y < 2.4 && y > -0.5;
  }
  colour(hex: number) {
    this.mat.color.setHex(hex);
  }
}
