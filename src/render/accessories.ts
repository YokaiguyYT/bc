import * as THREE from 'three';
import { glossy, jelly, matte } from './materials';

/**
 * The Locker's hats, face things and back things, built from primitives.
 * Hats and face things sit on the head (its centre at the origin, the face
 * toward +Z); back things on the torso (its centre at the origin, the back
 * toward -Z). Anything named "spin", "flap" or "flicker" is animated by the rig.
 */

const geos = new Map<string, THREE.BufferGeometry>();
const geo = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
  const o = new THREE.Mesh(g, m);
  o.position.set(...pos);
  o.rotation.set(...rot);
  o.castShadow = true;
  return o;
}

const cyl = (rt: number, rb: number, h: number, seg = 24) => geo(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const ball = (r: number) => geo(`ball${r}`, () => new THREE.SphereGeometry(r, 16, 12));
const dome = (r: number, cut = 0.5) => geo(`dome${r},${cut}`, () => new THREE.SphereGeometry(r, 26, 12, 0, Math.PI * 2, 0, Math.PI * cut));
const ring = (r: number, t: number) => geo(`ring${r},${t}`, () => new THREE.TorusGeometry(r, t, 8, 26));
const cone = (r: number, h: number) => geo(`cone${r},${h}`, () => new THREE.ConeGeometry(r, h, 20));
const box = (x: number, y: number, z: number) => geo(`box${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));

/** A hat (null: the mover's own cap, or nothing). */
export function makeHat(id: string): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (id) {
    case 'beanie': {
      const knit = jelly(0xd94a4a, 0.3);
      g.add(mesh(dome(0.235, 0.47), knit, [0, 0.02, 0]));
      g.add(mesh(ring(0.205, 0.035), jelly(0xfbf8f2, 0.3), [0, 0.06, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(ball(0.06), jelly(0xfbf8f2, 0.3), [0, 0.265, 0]));
      return g;
    }
    case 'cowboy': {
      const felt = matte(0xa0703f);
      g.add(mesh(cyl(0.36, 0.36, 0.02, 32), felt, [0, 0.14, 0]));
      g.add(mesh(cyl(0.15, 0.18, 0.17), felt, [0, 0.23, 0]));
      g.add(mesh(cyl(0.183, 0.183, 0.035), matte(0x4a3527), [0, 0.165, 0]));
      g.rotation.x = -0.12;
      return g;
    }
    case 'tophat': {
      const black = glossy(0x24242c, 0.4, 0.1);
      g.add(mesh(cyl(0.28, 0.28, 0.02, 32), black, [0, 0.16, 0]));
      g.add(mesh(cyl(0.15, 0.15, 0.32), black, [0, 0.33, 0]));
      g.add(mesh(cyl(0.152, 0.152, 0.05), matte(0xc0392b), [0, 0.2, 0]));
      g.rotation.z = 0.08;
      return g;
    }
    case 'chef': {
      const white = jelly(0xfbfaf6, 0.25);
      g.add(mesh(cyl(0.17, 0.17, 0.13), white, [0, 0.21, 0]));
      for (const [x, z] of [
        [0, 0],
        [0.09, 0.05],
        [-0.09, 0.05],
        [0.05, -0.09],
        [-0.06, -0.08],
      ])
        g.add(mesh(ball(0.12), white, [x, 0.33, z]));
      return g;
    }
    case 'wizard': {
      const purple = matte(0x5b3fb0);
      g.add(mesh(cyl(0.32, 0.32, 0.02, 32), purple, [0, 0.14, 0]));
      const c = mesh(cone(0.2, 0.55), purple, [0, 0.41, 0], [-0.25, 0, 0]);
      g.add(c);
      for (const [x, y, z] of [
        [0.1, 0.3, 0.12],
        [-0.08, 0.42, 0.06],
        [0.03, 0.55, -0.05],
      ])
        g.add(mesh(ball(0.025), glossy(0xffd23f, 0.3, 0.3), [x, y, z]));
      return g;
    }
    case 'propeller': {
      const quarters = [0xe9554b, 0xffd23f, 0x3d9bff, 0x4cc46a];
      quarters.forEach((c, i) => {
        const q = new THREE.Mesh(
          geo(`prop${i}`, () => new THREE.SphereGeometry(0.235, 10, 10, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI * 0.45)),
          jelly(c, 0.3),
        );
        q.castShadow = true;
        g.add(q);
      });
      g.add(mesh(cyl(0.012, 0.012, 0.1, 8), matte(0x3a3a46), [0, 0.27, 0]));
      const spin = new THREE.Group();
      spin.name = 'spin';
      spin.position.y = 0.32;
      spin.add(mesh(box(0.42, 0.012, 0.06), glossy(0xe9554b, 0.4, 0.1)));
      g.add(spin);
      return g;
    }
    case 'party': {
      const c = mesh(cone(0.12, 0.32), jelly(0xff7ab8, 0.3), [0.05, 0.33, 0.02], [0, 0, -0.25]);
      g.add(c);
      g.add(mesh(ball(0.045), jelly(0xffd23f, 0.3), [0.09, 0.49, 0.02]));
      g.add(mesh(ring(0.1, 0.018), jelly(0x3d9bff, 0.3), [0.025, 0.2, 0.02], [Math.PI / 2, 0, -0.25]));
      return g;
    }
    case 'hardhat': {
      const yellow = glossy(0xffcf3d, 0.35, 0.05);
      g.add(mesh(dome(0.245, 0.48), yellow, [0, 0.03, 0]));
      g.add(mesh(cyl(0.27, 0.29, 0.025, 32), yellow, [0, 0.06, 0.03]));
      g.add(mesh(box(0.05, 0.05, 0.36), yellow, [0, 0.25, 0]));
      return g;
    }
    case 'crown': {
      const gold = glossy(0xe5b53a, 0.25, 0.8);
      g.add(mesh(cyl(0.15, 0.16, 0.09, 24), gold, [0, 0.21, 0]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(mesh(cone(0.04, 0.09), gold, [Math.sin(a) * 0.15, 0.29, Math.cos(a) * 0.15]));
        g.add(mesh(ball(0.018), glossy(i % 2 ? 0xe9554b : 0x3d9bff, 0.2, 0.3), [Math.sin(a) * 0.158, 0.21, Math.cos(a) * 0.158]));
      }
      g.rotation.z = 0.12;
      return g;
    }
    case 'pirate': {
      const black = matte(0x22222a);
      g.add(mesh(cyl(0.3, 0.3, 0.025, 3), black, [0, 0.15, 0], [0, Math.PI / 6, 0]));
      g.add(mesh(cyl(0.16, 0.19, 0.15, 24), black, [0, 0.23, 0]));
      g.add(mesh(ball(0.035), jelly(0xfbfaf6, 0.3), [0, 0.24, 0.17]));
      for (const s of [-1, 1]) g.add(mesh(box(0.07, 0.012, 0.012), jelly(0xfbfaf6, 0.3), [0, 0.2, 0.18], [0, 0, s * 0.7]));
      return g;
    }
    case 'bunny': {
      const fur = jelly(0xfbf8f2, 0.3);
      const pink = jelly(0xffa8c8, 0.3);
      g.add(mesh(ring(0.2, 0.018), fur, [0, 0.12, 0], [Math.PI / 2 - 0.2, 0, 0]));
      for (const s of [-1, 1]) {
        const ear = new THREE.Group();
        ear.position.set(s * 0.09, 0.18, -0.02);
        ear.rotation.z = -s * 0.22;
        const outer = mesh(ball(0.06), fur, [0, 0.16, 0]);
        outer.scale.set(0.8, 2.8, 0.45);
        const inner = mesh(ball(0.04), pink, [0, 0.16, 0.022]);
        inner.scale.set(0.7, 2.6, 0.3);
        ear.add(outer, inner);
        g.add(ear);
      }
      return g;
    }
    case 'cone': {
      const orange = glossy(0xff7a1a, 0.4, 0.05);
      g.add(mesh(box(0.34, 0.03, 0.34), orange, [0, 0.16, 0]));
      g.add(mesh(cone(0.15, 0.42), orange, [0, 0.38, 0]));
      g.add(mesh(cyl(0.085, 0.112, 0.07, 20), jelly(0xffffff, 0.2), [0, 0.38, 0]));
      g.rotation.z = 0.15;
      return g;
    }
    case 'flowers': {
      g.add(mesh(ring(0.2, 0.02), matte(0x4c9a4a), [0, 0.13, 0], [Math.PI / 2, 0, 0]));
      const cols = [0xff7ab8, 0xffd23f, 0xffffff, 0x9a6bff, 0xff5a4f];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.add(mesh(ball(0.04), jelly(cols[i % cols.length], 0.3), [Math.sin(a) * 0.2, 0.15, Math.cos(a) * 0.2]));
      }
      return g;
    }
    case 'halo': {
      const spin = new THREE.Group();
      spin.name = 'spin';
      spin.position.y = 0.4;
      spin.add(mesh(ring(0.16, 0.025), new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc93a, emissiveIntensity: 0.7, roughness: 0.3 }), [0, 0, 0], [Math.PI / 2, 0, 0]));
      g.add(spin);
      return g;
    }
    case 'astronaut': {
      const bubble = new THREE.Mesh(
        geo('bubble', () => new THREE.SphereGeometry(0.33, 28, 18)),
        new THREE.MeshPhysicalMaterial({ color: 0xcfefff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, depthWrite: false }),
      );
      bubble.position.y = 0.02;
      g.add(bubble);
      g.add(mesh(ring(0.24, 0.05), jelly(0xf3f1ec, 0.3), [0, -0.24, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(box(0.08, 0.05, 0.03), glossy(0x3d9bff, 0.3, 0.3), [0.1, -0.24, 0.24]));
      return g;
    }
    case 'viking': {
      const steel = glossy(0x9aa3ad, 0.35, 0.7);
      g.add(mesh(dome(0.24, 0.48), steel, [0, 0.03, 0]));
      g.add(mesh(ring(0.235, 0.025), glossy(0x8a5a36, 0.5, 0.2), [0, 0.07, 0], [Math.PI / 2, 0, 0]));
      const horn = jelly(0xfbf1dc, 0.3);
      for (const s of [-1, 1]) g.add(mesh(cone(0.05, 0.22), horn, [s * 0.25, 0.2, 0], [0, 0, -s * 0.9]));
      return g;
    }
    default:
      return null;
  }
}

/** Something on the face (null: nothing). */
export function makeFace(id: string): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (id) {
    case 'shades': {
      const lens = glossy(0x1c1c24, 0.15, 0.4);
      for (const s of [-1, 1]) g.add(mesh(geo('lens', () => new THREE.CylinderGeometry(0.055, 0.055, 0.02, 20)), lens, [s * 0.075, 0.06, 0.205], [Math.PI / 2, 0, 0]));
      g.add(mesh(box(0.06, 0.014, 0.014), lens, [0, 0.07, 0.212]));
      return g;
    }
    case 'mustache': {
      const hair = matte(0x4a3527);
      for (const s of [-1, 1]) {
        const m = mesh(ball(0.05), hair, [s * 0.045, -0.035, 0.205]);
        m.scale.set(1.3, 0.5, 0.6);
        m.rotation.z = s * 0.35;
        g.add(m);
      }
      return g;
    }
    case 'monocle': {
      g.add(mesh(ring(0.05, 0.008), glossy(0xe5b53a, 0.25, 0.8), [0.075, 0.06, 0.212]));
      g.add(mesh(cyl(0.004, 0.004, 0.18, 6), glossy(0xe5b53a, 0.25, 0.8), [0.12, -0.03, 0.19], [0.2, 0, 0.35]));
      return g;
    }
    case 'nose':
      g.add(mesh(ball(0.05), glossy(0xe9433b, 0.2, 0.05), [0, 0.0, 0.225]));
      return g;
    case 'nerd': {
      const frame = matte(0x22222a);
      for (const s of [-1, 1]) g.add(mesh(ring(0.065, 0.014), frame, [s * 0.08, 0.06, 0.212]));
      g.add(mesh(box(0.05, 0.014, 0.014), frame, [0, 0.065, 0.22]));
      g.add(mesh(box(0.02, 0.02, 0.02), jelly(0xfbfaf6, 0.2), [0, 0.06, 0.226]));
      return g;
    }
    case 'hearts': {
      const pink = glossy(0xff4f9a, 0.2, 0.2);
      for (const s of [-1, 1]) {
        for (const d of [-1, 1]) g.add(mesh(ball(0.03), pink, [s * 0.075 + d * 0.022, 0.075, 0.208]));
        const tip = mesh(cone(0.04, 0.05), pink, [s * 0.075, 0.045, 0.208], [Math.PI, 0, 0]);
        g.add(tip);
      }
      g.add(mesh(box(0.05, 0.012, 0.012), pink, [0, 0.075, 0.214]));
      return g;
    }
    case 'beard': {
      const hair = matte(0x6b4428);
      const b = mesh(ball(0.15), hair, [0, -0.12, 0.13]);
      b.scale.set(1.1, 0.9, 0.7);
      g.add(b);
      for (const s of [-1, 1]) {
        const m = mesh(ball(0.05), hair, [s * 0.05, -0.03, 0.205]);
        m.scale.set(1.3, 0.5, 0.6);
        g.add(m);
      }
      return g;
    }
    case 'goggles': {
      const strap = matte(0x3a3a46);
      g.add(mesh(ring(0.226, 0.018), strap, [0, 0.06, 0], [Math.PI / 2, 0, 0]));
      for (const s of [-1, 1]) {
        g.add(mesh(ring(0.055, 0.016), glossy(0x8a5a36, 0.4, 0.3), [s * 0.075, 0.07, 0.205]));
        g.add(mesh(geo('glens', () => new THREE.CircleGeometry(0.05, 18)), new THREE.MeshStandardMaterial({ color: 0x7fd6ff, transparent: true, opacity: 0.6, roughness: 0.1 }), [s * 0.075, 0.07, 0.21]));
      }
      return g;
    }
    default:
      return null;
  }
}

/** Something on the back (null: nothing). */
export function makeBack(id: string): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (id) {
    case 'backpack': {
      const canvas = matte(0x2f6f9f);
      const bag = mesh(box(0.3, 0.32, 0.15), canvas, [0, 0.03, -0.3]);
      g.add(bag);
      g.add(mesh(box(0.31, 0.12, 0.16), matte(0x24577d), [0, 0.15, -0.3]));
      g.add(mesh(box(0.18, 0.1, 0.04), matte(0x24577d), [0, -0.05, -0.39]));
      return g;
    }
    case 'cape': {
      const cape = new THREE.Mesh(
        geo('cape', () => new THREE.CylinderGeometry(0.3, 0.42, 0.62, 18, 1, true, Math.PI * 0.62, Math.PI * 0.76)),
        new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7, side: THREE.DoubleSide }),
      );
      cape.position.set(0, -0.06, 0.02);
      cape.castShadow = true;
      const flap = new THREE.Group();
      flap.name = 'flap';
      flap.add(cape);
      g.add(flap);
      return g;
    }
    case 'scarf': {
      const knit = jelly(0x4cc46a, 0.3);
      g.add(mesh(ring(0.2, 0.05), knit, [0, 0.27, 0], [Math.PI / 2, 0, 0]));
      const tail = new THREE.Group();
      tail.name = 'flap';
      tail.position.set(0.08, 0.25, -0.22);
      tail.add(mesh(box(0.09, 0.26, 0.03), knit, [0, -0.13, 0]));
      tail.add(mesh(box(0.1, 0.03, 0.035), jelly(0xffd23f, 0.3), [0, -0.25, 0]));
      g.add(tail);
      return g;
    }
    case 'jetpack': {
      const steel = glossy(0x9aa3ad, 0.3, 0.7);
      for (const s of [-1, 1]) {
        g.add(mesh(cyl(0.08, 0.08, 0.36, 16), steel, [s * 0.09, 0.03, -0.3]));
        g.add(mesh(cone(0.08, 0.1), glossy(0xe9554b, 0.4, 0.2), [s * 0.09, 0.26, -0.3]));
        const flame = mesh(cone(0.06, 0.18), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8 }), [s * 0.09, -0.24, -0.3], [Math.PI, 0, 0]);
        flame.name = 'flicker';
        g.add(flame);
      }
      g.add(mesh(box(0.08, 0.2, 0.06), matte(0x3a3a46), [0, 0.03, -0.27]));
      return g;
    }
    case 'guitar': {
      const wood = glossy(0xc8662b, 0.35, 0.1);
      const guitar = new THREE.Group();
      guitar.position.set(0, 0, -0.27);
      guitar.rotation.z = 0.7;
      const low = mesh(ball(0.15), wood, [0, -0.12, 0]);
      low.scale.set(1, 1, 0.35);
      const up = mesh(ball(0.11), wood, [0, 0.06, 0]);
      up.scale.set(1, 1, 0.35);
      guitar.add(low, up);
      guitar.add(mesh(cyl(0.04, 0.04, 0.02, 16), matte(0x22222a), [0, -0.06, -0.05], [Math.PI / 2, 0, 0]));
      guitar.add(mesh(box(0.05, 0.42, 0.03), matte(0x5a3a22), [0, 0.32, 0]));
      guitar.add(mesh(box(0.08, 0.1, 0.035), matte(0x22222a), [0, 0.56, 0]));
      g.add(guitar);
      return g;
    }
    case 'balloon': {
      const sway = new THREE.Group();
      sway.name = 'flap';
      sway.position.set(0.12, 0.2, -0.18);
      sway.add(mesh(cyl(0.004, 0.004, 0.8, 4), matte(0xffffff), [0, 0.4, 0]));
      const b = mesh(ball(0.17), glossy(0xe9433b, 0.2, 0.05), [0, 0.92, 0]);
      b.scale.set(1, 1.15, 1);
      sway.add(b);
      g.add(sway);
      return g;
    }
    case 'wings': {
      const feather = jelly(0xfbfaf6, 0.25);
      for (const s of [-1, 1]) {
        const w = new THREE.Group();
        w.name = 'flap';
        w.position.set(s * 0.1, 0.12, -0.26);
        const a = mesh(ball(0.14), feather, [s * 0.16, 0.02, -0.04]);
        a.scale.set(1.5, 0.75, 0.28);
        const b = mesh(ball(0.1), feather, [s * 0.28, -0.08, -0.05]);
        b.scale.set(1.2, 0.6, 0.25);
        w.add(a, b);
        w.rotation.y = s * 0.35;
        w.userData.side = s;
        g.add(w);
      }
      return g;
    }
    default:
      return null;
  }
}
