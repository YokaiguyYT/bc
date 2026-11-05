import * as THREE from 'three';
import type { Player } from './Player';
import { HAND_LOCAL, PART_NAMES, PartName, RIG } from './rig';
import { jelly, matte } from '../render/materials';
import { makeBack, makeFace, makeHat } from '../render/accessories';
import { ITEMS, type Outfit } from '../game/outfits';
import type { PhysicsWorld } from '../physics/PhysicsWorld';

export type Expression = 'normal' | 'blink' | 'strain' | 'surprise' | 'ko' | 'happy' | 'worried' | 'determined';

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

/** A pear-ish jelly bean torso. */
function beanGeometry() {
  return cached('bean', () => {
    const g = new THREE.CapsuleGeometry(RIG.body.r + 0.008, RIG.body.hh * 2, 12, 28);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const top = RIG.body.hh + RIG.body.r;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y / top; // -1 bottom .. 1 top
      const s = 1 + 0.07 * -t - 0.03 * t * t;
      pos.setX(i, pos.getX(i) * s);
      pos.setZ(i, pos.getZ(i) * s * 0.93);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** How far out the bean's surface is at height y (before its front-to-back squash). */
function beanRadius(y: number) {
  const R = RIG.body.r + 0.008;
  const top = RIG.body.hh + R;
  const t = y / top;
  const s = 1 + 0.07 * -t - 0.03 * t * t;
  const over = Math.max(0, Math.abs(y) - RIG.body.hh);
  return Math.sqrt(Math.max(0, R * R - over * over)) * s;
}

/** A point on the bean's surface, `out` metres proud of it, at (x, y) on the front (+1) or back (-1). */
function onBean(x: number, y: number, side: number, out = 0.012) {
  const r = beanRadius(y) + out;
  const z = Math.sqrt(Math.max(0, r * r - x * x)) * 0.93;
  return new THREE.Vector3(x, y, z * side);
}

/** The work trousers: the bottom of the bean, a touch bigger, up to the belt. */
function trouserGeometry() {
  return cached('trousers', () => {
    const pts: THREE.Vector2[] = [];
    const bottom = -(RIG.body.hh + RIG.body.r + 0.008);
    for (let i = 0; i <= 14; i++) {
      const y = bottom + ((-0.105 - bottom) * i) / 14;
      pts.push(new THREE.Vector2(beanRadius(y) + 0.01, y));
    }
    const g = new THREE.LatheGeometry(pts, 32);
    g.scale(1, 1, 0.93);
    g.computeVertexNormals();
    return g;
  });
}

/** The overalls' bib: a curved panel on the chest. */
function bibGeometry() {
  return cached('bib', () => {
    const y0 = -0.13;
    const y1 = 0.15;
    const g = new THREE.CylinderGeometry(beanRadius(y1) + 0.01, beanRadius(y0) + 0.01, y1 - y0, 16, 4, true, -0.62, 1.24);
    g.translate(0, (y0 + y1) / 2, 0);
    g.scale(1, 1, 0.93);
    g.computeVertexNormals();
    return g;
  });
}

/** A shoulder strap: up from the bib, over the shoulder, down the back. */
function strapGeometry(sx: number) {
  return cached(`strap${sx}`, () => {
    const curve = new THREE.CatmullRomCurve3([
      onBean(sx * 0.1, 0.14, 1, 0.014),
      onBean(sx * 0.15, 0.27, 1, 0.016),
      new THREE.Vector3(sx * 0.19, 0.39, 0),
      onBean(sx * 0.15, 0.27, -1, 0.016),
      onBean(sx * 0.11, -0.08, -1, 0.014),
    ]);
    const g = new THREE.TubeGeometry(curve, 24, 0.016, 6, false);
    g.scale(1, 0.999, 1);
    return g;
  });
}

/** The company patch on the back of the overalls. */
let patchTex: THREE.CanvasTexture | null = null;
function patchTexture() {
  if (patchTex) return patchTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fbf8f2';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#2b2b33';
  ctx.stroke();
  ctx.fillStyle = '#2b2b33';
  ctx.font = '800 56px "Fredoka", ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FF', 64, 68);
  patchTex = new THREE.CanvasTexture(c);
  patchTex.colorSpace = THREE.SRGBColorSpace;
  return patchTex;
}

/** The overalls: the mover's colour, deepened toward work-wear navy. */
function overallColor(color: number) {
  // (mixed as the screen shows colours, not in linear light, where it'd hardly darken)
  const mix = (a: number, b: number) => Math.round(a + (b - a) * 0.48);
  return new THREE.Color((mix((color >> 16) & 255, 0x1f) << 16) | (mix((color >> 8) & 255, 0x24) << 8) | mix(color & 255, 0x33));
}

function shade(color: number, f: number) {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * (f < 1 ? 1.05 : 0.9)), Math.max(0, Math.min(1, hsl.l * f)));
}

export class PlayerRig {
  readonly root = new THREE.Group();
  readonly partObjects = {} as Record<PartName, THREE.Group>;
  private bodyMesh!: THREE.Mesh;
  /** Recoloured by an outfit. */
  private skin!: THREE.MeshPhysicalMaterial;
  private pants!: THREE.MeshPhysicalMaterial;
  private capMat!: THREE.MeshPhysicalMaterial;
  private cap!: THREE.Object3D;
  /** The outfit's hat, face and back things. */
  private extras: THREE.Object3D[] = [];
  private spinners: THREE.Object3D[] = [];
  private flickers: THREE.Object3D[] = [];
  private flappers: THREE.Object3D[] = [];
  private outfitT = 0;
  private headGroup!: THREE.Group;
  private faceCanvas: HTMLCanvasElement | OffscreenCanvas;
  private faceCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  private faceTex: THREE.CanvasTexture;
  private expr: Expression | null = null;
  private blinkTimer = 2 + Math.random() * 3;
  private squash = 0;
  private squashVel = 0;
  /** Set by gameplay: show a happy face for a while. */
  happyTime = 0;
  worriedTime = 0;

  constructor(
    private player: Player,
    physics: PhysicsWorld,
  ) {
    const color = player.color;
    const skin = (this.skin = jelly(color));
    const pants = (this.pants = jelly(overallColor(color).getHex(), 0.15).clone());
    const capMat = (this.capMat = jelly(shade(color, 0.68).getHex(), 0.35));
    const glove = jelly(0xfbf8f2, 0.35);
    const shoe = matte(0x3b302b, { roughness: 0.6 });
    const soleMat = matte(0xe8e0d0, { roughness: 0.8 });
    const belt = matte(0x4a3527, { roughness: 0.7 });
    const buckle = new THREE.MeshStandardMaterial({ color: 0xffd36b, roughness: 0.35, metalness: 0.6 });

    const mk = (name: PartName) => {
      const g = new THREE.Group();
      g.name = `${player.name}_${name}`;
      this.partObjects[name] = g;
      this.root.add(g);
      physics.link(player.parts[name], g);
      return g;
    };
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number]) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      if (pos) m.position.set(...pos);
      parent.add(m);
      return m;
    };

    // torso
    const body = mk('body');
    this.bodyMesh = add(body, beanGeometry(), skin);
    const beltMesh = add(
      this.bodyMesh,
      cached('belt', () => new THREE.TorusGeometry(RIG.body.r + 0.028, 0.03, 8, 36)),
      belt,
      [0, -0.13, 0],
    );
    beltMesh.rotation.x = Math.PI / 2;
    beltMesh.scale.set(1.04, 0.95, 1);
    add(this.bodyMesh, cached('buckle', () => new THREE.BoxGeometry(0.09, 0.07, 0.03)), buckle, [0, -0.13, 0.285]);
    // work overalls: trousers up to the belt, a bib with a pocket and two buttons, straps over the shoulders
    add(this.bodyMesh, trouserGeometry(), pants);
    add(this.bodyMesh, bibGeometry(), pants);
    for (const sx of [-1, 1]) {
      add(this.bodyMesh, strapGeometry(sx), pants);
      const b = onBean(sx * 0.1, 0.13, 1, 0.02);
      add(this.bodyMesh, cached('button', () => new THREE.SphereGeometry(0.022, 10, 8)), buckle, [b.x, b.y, b.z]).scale.set(1, 1, 0.5);
    }
    const pk = onBean(0, 0.03, 1, 0.016);
    const pocket = add(this.bodyMesh, cached('pocket', () => new THREE.BoxGeometry(0.12, 0.09, 0.014)), capMat, [pk.x, pk.y, pk.z]);
    pocket.rotation.x = -0.08;
    // the company patch on the back
    const pt = onBean(0, 0.05, -1, 0.016);
    const patch = add(this.bodyMesh, cached('patch', () => new THREE.CircleGeometry(0.075, 24)), new THREE.MeshStandardMaterial({ map: patchTexture(), roughness: 0.7 }), [pt.x, pt.y, pt.z]);
    patch.rotation.y = Math.PI;
    patch.castShadow = false;

    // head + face + cap
    const head = mk('head');
    this.headGroup = new THREE.Group();
    head.add(this.headGroup);
    const headMesh = add(this.headGroup, cached('head', () => new THREE.SphereGeometry(RIG.head.r, 30, 22)), skin);
    headMesh.scale.set(1, 0.97, 0.97);

    this.faceCanvas = makeCanvas(256, 256);
    this.faceCtx = this.faceCanvas.getContext('2d') as CanvasRenderingContext2D;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas as HTMLCanvasElement);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    const faceW = 1.75;
    const faceH = 1.5;
    // the decal sits a bit above the equator so the top-down camera can see the eyes
    const faceGeo = cached(
      'face',
      () => new THREE.SphereGeometry(RIG.head.r + 0.003, 26, 20, Math.PI / 2 - faceW / 2, faceW, 0.5, faceH),
    );
    const faceMat = new THREE.MeshStandardMaterial({
      map: this.faceTex,
      transparent: true,
      roughness: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.scale.copy(headMesh.scale);
    this.headGroup.add(face);
    this.setExpression('normal');

    // mover's cap, worn backwards (keeps the brim out of the face from a top-down camera)
    const cap = add(
      this.headGroup,
      cached('cap', () => new THREE.SphereGeometry(RIG.head.r + 0.018, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.42)),
      capMat,
      [0, 0.06, -0.03],
    );
    cap.rotation.set(-0.32, Math.PI, 0);
    cap.scale.set(1.0, 0.9, 1.0);
    this.cap = cap;
    const brim = add(
      cap,
      cached('brim', () => new THREE.CylinderGeometry(0.17, 0.17, 0.024, 26, 1, false, -Math.PI / 2, Math.PI)),
      capMat,
      [0, 0.045, 0.1],
    );
    brim.rotation.x = 0.12;
    brim.scale.set(1, 1, 1.05);
    add(cap, cached('capbutton', () => new THREE.SphereGeometry(0.028, 10, 8)), capMat, [0, RIG.head.r + 0.01, 0]);
    // cap badge
    const badge = add(cap, cached('badge', () => new THREE.CircleGeometry(0.05, 20)), jelly(0xfbf8f2, 0.2), [0, 0.15, -0.17]);
    badge.rotation.set(-0.75, Math.PI, 0);

    // arms
    for (const s of ['L', 'R'] as const) {
      const sx = s === 'L' ? 1 : -1;
      const ua = mk(`uArm${s}`);
      add(ua, cached('uarm', () => new THREE.CapsuleGeometry(RIG.upperArm.r, RIG.upperArm.L, 6, 14)), skin);
      // a rolled-up sleeve
      add(ua, cached('sleeve', () => new THREE.TorusGeometry(RIG.upperArm.r + 0.006, 0.022, 8, 18)), skin, [0, -RIG.upperArm.L / 2 + 0.03, 0]).rotation.x = Math.PI / 2;
      const la = mk(`lArm${s}`);
      add(la, cached('larm', () => new THREE.CapsuleGeometry(RIG.foreArm.r, RIG.foreArm.L, 6, 14)), skin);
      const hand = add(la, cached('hand', () => new THREE.SphereGeometry(RIG.hand.r, 20, 14)), glove, [HAND_LOCAL.x, HAND_LOCAL.y, HAND_LOCAL.z]);
      hand.scale.set(0.95, 0.92, 1.08);
      add(hand, cached('thumb', () => new THREE.SphereGeometry(0.042, 12, 10)), glove, [sx * -0.07, 0.03, 0.045]);
      add(la, cached('cuff', () => new THREE.TorusGeometry(0.073, 0.022, 8, 18)), glove, [0, HAND_LOCAL.y + 0.07, 0]).rotation.x =
        Math.PI / 2;
    }
    // legs
    for (const s of ['L', 'R'] as const) {
      const th = mk(`thigh${s}`);
      add(th, cached('thigh', () => new THREE.CapsuleGeometry(RIG.thigh.r, RIG.thigh.L, 6, 14)), pants);
      const sh = mk(`shin${s}`);
      add(sh, cached('shin', () => new THREE.CapsuleGeometry(RIG.shin.r, RIG.shin.L, 6, 14)), pants);
      const footY = -RIG.shin.L / 2 - RIG.foot.down;
      const shoeMesh = add(
        sh,
        cached('shoe', () => new THREE.CapsuleGeometry(RIG.foot.r + 0.012, RIG.foot.len, 6, 14)),
        shoe,
        [0, footY + 0.008, RIG.foot.fwd + 0.01],
      );
      shoeMesh.rotation.x = Math.PI / 2;
      shoeMesh.scale.set(1.15, 1, 0.82);
      // a chunky rubber sole
      const sole = add(sh, cached('sole', () => new THREE.CapsuleGeometry(RIG.foot.r + 0.018, RIG.foot.len, 4, 12)), soleMat, [0, footY - 0.035, RIG.foot.fwd + 0.01]);
      sole.rotation.x = Math.PI / 2;
      sole.scale.set(1.2, 1.04, 0.32);
    }
    void PART_NAMES;
  }

  /** Dress the mover: its colour, and a hat (or its own cap), a face thing and a back thing. */
  applyOutfit(o: Outfit) {
    const hex = ITEMS.color[o.color]?.hex ?? this.player.color;
    this.skin.color.setHex(hex);
    this.pants.color.copy(overallColor(hex));
    this.capMat.color.copy(shade(hex, 0.68));
    for (const x of this.extras) x.removeFromParent();
    this.extras = [];
    this.cap.visible = o.hat === 'cap';
    const hat = makeHat(o.hat);
    const face = makeFace(o.face);
    const back = makeBack(o.back);
    if (hat) this.headGroup.add(hat);
    if (face) this.headGroup.add(face);
    if (back) this.bodyMesh.add(back);
    this.extras = [hat, face, back].filter((x): x is THREE.Object3D => !!x);
    this.spinners = [];
    this.flappers = [];
    this.flickers = [];
    for (const x of this.extras)
      x.traverse((c) => {
        if (c.name === 'spin') this.spinners.push(c);
        if (c.name === 'flicker') this.flickers.push(c);
        if (c.name === 'flap') this.flappers.push(c);
      });
  }

  setExpression(e: Expression) {
    if (e === this.expr) return;
    this.expr = e;
    drawFace(this.faceCtx, e);
    this.faceTex.needsUpdate = true;
  }

  /** Per rendered frame. */
  update(dt: number) {
    const p = this.player;
    // landing squash spring
    if (p.landSquash > 0) {
      this.squashVel -= p.landSquash * 9;
      p.landSquash = 0;
    }
    const k = 260;
    const c = 14;
    this.squashVel += (-k * this.squash - c * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    const sq = THREE.MathUtils.clamp(this.squash, -0.25, 0.25);
    this.bodyMesh.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    this.headGroup.position.y = sq * 0.25;
    // the propeller turns faster on the move; capes, scarves and wings sway
    // a jetpack's flames flicker (and roar when jumping)
    for (const f of this.flickers) f.scale.set(1, (p.grounded ? 0.6 : 1.6) + Math.random() * 0.5, 1);
    if (this.spinners.length || this.flappers.length) {
      this.outfitT += dt;
      const v = p.body.linvel();
      const speed = Math.hypot(v.x, v.z);
      for (const sp of this.spinners) sp.rotation.y += dt * (4 + speed * 6);
      for (const f of this.flappers) {
        const side = (f.userData.side as number | undefined) ?? 0;
        const wave = Math.sin(this.outfitT * (side ? 5 : 3)) * (0.05 + Math.min(0.25, speed * 0.06));
        if (side) f.rotation.y = side * (0.35 + wave);
        else f.rotation.x = -0.1 - Math.min(0.5, speed * 0.12) + wave * 0.5;
      }
    }

    // expression
    this.blinkTimer -= dt;
    this.happyTime -= dt;
    this.worriedTime -= dt;
    let e: Expression = 'normal';
    const v = p.bodyVel;
    if (p.state === 'knocked') e = 'ko';
    else if (p.state === 'gettingUp') e = 'worried';
    else if (p.airTime > 0.5 && v.y < -5) e = 'surprise';
    else if (this.happyTime > 0) e = 'happy';
    else if (p.maxGripStretch() > 0.2 || p.heldMass() > 13) e = 'strain';
    else if (this.worriedTime > 0) e = 'worried';
    else if (p.intent.grab) e = 'determined';
    if (e === 'normal' || e === 'determined') {
      if (this.blinkTimer < 0) {
        e = 'blink';
        if (this.blinkTimer < -0.12) this.blinkTimer = 1.5 + Math.random() * 3.5;
      }
    }
    this.setExpression(e);
  }

  dispose() {
    this.faceTex.dispose();
    this.root.removeFromParent();
  }
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Draw a Gang Beasts-simple face: two eyes, a mouth, rosy cheeks. */
export function drawFace(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, e: Expression) {
  const W = 256;
  ctx.clearRect(0, 0, W, W);
  const cx = 128;
  const ey = 96;
  const ex = 42;
  const ink = '#24202a';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // cheeks
  ctx.fillStyle = 'rgba(255,120,140,0.32)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * 70, 150, 20, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const oval = (x: number, y: number, rx: number, ry: number) => {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.32, ry * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const line = (pts: number[], w = 9) => {
    ctx.strokeStyle = ink;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  const arc = (x: number, y: number, r: number, a0: number, a1: number, w = 9) => {
    ctx.strokeStyle = ink;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a1);
    ctx.stroke();
  };

  switch (e) {
    case 'normal':
    case 'determined':
      oval(cx - ex, ey, 16, 27);
      oval(cx + ex, ey, 16, 27);
      if (e === 'determined') {
        line([cx - ex - 16, ey - 34, cx - ex + 12, ey - 26], 7);
        line([cx + ex + 16, ey - 34, cx + ex - 12, ey - 26], 7);
        line([cx - 14, 150, cx + 14, 150], 7);
      } else arc(cx, 136, 18, 0.25 * Math.PI, 0.75 * Math.PI, 7);
      break;
    case 'blink':
      line([cx - ex - 11, ey, cx - ex + 11, ey], 7);
      line([cx + ex - 11, ey, cx + ex + 11, ey], 7);
      arc(cx, 136, 18, 0.25 * Math.PI, 0.75 * Math.PI, 7);
      break;
    case 'strain':
      line([cx - ex - 13, ey - 13, cx - ex + 11, ey, cx - ex - 13, ey + 13], 8);
      line([cx + ex + 13, ey - 13, cx + ex - 11, ey, cx + ex + 13, ey + 13], 8);
      // gritted teeth
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = ink;
      ctx.lineWidth = 6;
      roundRectPath(ctx, cx - 26, 140, 52, 22, 8);
      ctx.fill();
      ctx.stroke();
      line([cx - 26, 151, cx + 26, 151], 4);
      line([cx - 9, 140, cx - 9, 162], 4);
      line([cx + 9, 140, cx + 9, 162], 4);
      break;
    case 'surprise':
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx + s * ex, ey, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = 6;
        ctx.stroke();
        oval(cx + s * ex, ey + 2, 8, 9);
      }
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.ellipse(cx, 152, 13, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ko':
      for (const s of [-1, 1]) {
        const x = cx + s * ex;
        line([x - 13, ey - 13, x + 13, ey + 13], 8);
        line([x + 13, ey - 13, x - 13, ey + 13], 8);
      }
      ctx.strokeStyle = ink;
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = cx - 24 + i * 2;
        const y = 148 + Math.sin(i * 0.8) * 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    case 'happy':
      arc(cx - ex, ey + 8, 15, Math.PI * 1.1, Math.PI * 1.9, 8);
      arc(cx + ex, ey + 8, 15, Math.PI * 1.1, Math.PI * 1.9, 8);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx, 132, 26, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff7a8a';
      ctx.beginPath();
      ctx.ellipse(cx, 150, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'worried':
      oval(cx - ex, ey + 2, 10, 16);
      oval(cx + ex, ey + 2, 10, 16);
      line([cx - ex - 14, ey - 22, cx - ex + 12, ey - 32], 7);
      line([cx + ex + 14, ey - 22, cx + ex - 12, ey - 32], 7);
      arc(cx, 160, 16, 1.2 * Math.PI, 1.8 * Math.PI, 7);
      break;
  }
}

/** ctx.roundRect is Safari 16+; draw it by hand for older Macs. */
function roundRectPath(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
