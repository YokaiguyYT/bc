import * as THREE from 'three';
import type { Effects } from '../render/Effects';
import type { Player } from '../entities/Player';
import type { Cargo } from '../entities/cargo/Cargo';

/**
 * The Locker's showing-off: footprint trails, victory dances and cargo
 * skins (outfits.ts lists them; this is what they do).
 */

const RAINBOW = [0xff5a4f, 0xffa03a, 0xffe14a, 0x4cc46a, 0x3d9bff, 0x9a6bff];

/** A puff of whatever this mover's trail is, where a foot came down. */
export function trailBurst(fx: Effects, trail: string | undefined, at: THREE.Vector3) {
  if (!trail || trail === 'none') return;
  const p = at.clone();
  switch (trail) {
    case 'dust':
      return fx.burst('dust', p, { count: 3, speed: 0.8, up: 0.3, size: 0.1, life: 0.6, gravity: -0.2, drag: 3 });
    case 'snow':
      return fx.burst('star', p.setY(p.y + 0.1), { count: 3, speed: 0.6, up: 0.8, size: 0.04, life: 1.0, gravity: 1, drag: 2, colors: [0xffffff, 0xdff2ff] });
    case 'hearts':
      return fx.burst('blob', p.setY(p.y + 0.15), { count: 2, speed: 0.5, up: 1.2, size: 0.07, life: 0.9, gravity: -0.5, drag: 2, colors: [0xff4f9a, 0xff8ab8] });
    case 'bubbles':
      return fx.burst('blob', p.setY(p.y + 0.15), { count: 3, speed: 0.4, up: 1.4, size: 0.08, life: 1.3, gravity: -1.2, drag: 1.5, colors: [0xbfe9ff, 0xe8f8ff] });
    case 'fire':
      fx.burst('spark', p, { count: 4, speed: 1.2, up: 1.5, size: 0.03, life: 0.45, gravity: -1, colors: [0xffc04a, 0xff6a1a] });
      return fx.burst('smoke', p.setY(p.y + 0.1), { count: 1, speed: 0.3, up: 0.8, size: 0.12, life: 0.6, gravity: -0.6, drag: 2, colors: [0x666666] });
    case 'sparkles':
      return fx.burst('star', p.setY(p.y + 0.1), { count: 3, speed: 0.9, up: 1.2, size: 0.05, life: 0.7, gravity: 2, colors: [0xffe14a, 0xffffff] });
    case 'flowers':
      return fx.burst('confetti', p.setY(p.y + 0.1), { count: 3, speed: 0.7, up: 1, size: 0.06, life: 1.1, gravity: 2, drag: 2.5, colors: [0xff8ab8, 0xffffff, 0xffe14a] });
    case 'rainbow':
      return fx.burst('confetti', p.setY(p.y + 0.1), { count: 5, speed: 0.9, up: 1.2, size: 0.06, life: 1.0, gravity: 2.2, drag: 2, colors: RAINBOW });
    case 'money':
      return fx.burst('confetti', p.setY(p.y + 0.1), { count: 3, speed: 0.9, up: 1.5, size: 0.08, life: 1.2, gravity: 2, drag: 2.5, colors: [0x5fc46f, 0x9be3a8] });
  }
}

/** Set a mover's keys for its victory dance, `t` seconds after the delivery. */
export function danceIntent(p: Player, dance: string, t: number, dt: number, i: number, goal: THREE.Vector3) {
  if (t < 0.6) return;
  const every = (s: number) => Math.floor(t / s) !== Math.floor((t - dt) / s);
  const it = p.intent;
  switch (dance) {
    case 'wave':
      if (every(0.9)) it.jumpPressed = true;
      break;
    case 'spin': {
      const a = t * 7 + i * 3;
      it.moveX = Math.cos(a) * 0.6;
      it.moveZ = Math.sin(a) * 0.6;
      break;
    }
    case 'jump':
      it.moveX = Math.sin(t * 4 + i) * 0.25;
      if (every(0.55)) it.jumpPressed = true;
      break;
    case 'worm': {
      const s = Math.sin(t * 6 + i * 1.5);
      it.moveX = s * 0.5;
      it.moveZ = Math.cos(t * 3) * 0.2;
      if (every(0.8)) it.jumpPressed = true;
      break;
    }
    case 'flex':
      // arms up, arms down
      it.grab = Math.floor(t / 0.35) % 2 === 0;
      if (every(1.4)) it.jumpPressed = true;
      break;
    case 'conga': {
      // round the drop-off in a little line, with a hop on the beat
      const a = t * 1.6 + i * 1.2;
      it.moveX = -Math.sin(a) * 0.55;
      it.moveZ = Math.cos(a) * 0.55;
      if (every(1.0)) it.jumpPressed = true;
      break;
    }
    case 'boss': {
      // a lap of honour round the drop-off
      const d = p.bodyPos.clone().sub(goal).setY(0);
      const r = d.length();
      const tan = new THREE.Vector3(-d.z, 0, d.x).normalize();
      const out = d.normalize().multiplyScalar(r < 3 ? 0.6 : r > 4 ? -0.6 : 0);
      it.moveX = tan.x + out.x;
      it.moveZ = tan.z + out.z;
      break;
    }
  }
}

/** Put the Locker's cargo skin on the load; returns what to do each frame (sparkles), if anything. */
export function dressCargo(cargo: Cargo, skin: string | undefined): ((dt: number, time: number) => void) | null {
  if (!skin || skin === 'none') return null;
  // (loads with materials of their own that change as you go keep their looks: only the sparkles)
  const special = ['swan', 'aquarium', 'balloons', 'glass', 'rocket', 'snowman'].includes(cargo.kind);
  const mats: THREE.MeshStandardMaterial[] = [];
  if ((skin === 'gold' || skin === 'rainbow') && !special)
    cargo.visual.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const one = (mat: THREE.Material) => {
        if (!(mat instanceof THREE.MeshStandardMaterial) || mat.transparent) return mat;
        const c = mat.clone();
        if (skin === 'gold') {
          c.color.set(0xe5b53a).lerp(mat.color, 0.25);
          c.metalness = 0.85;
          c.roughness = 0.28;
          c.map = null;
        }
        mats.push(c);
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
    });
  let next = 0;
  return (_dt, time) => {
    if (skin === 'rainbow') for (const m of mats) {
      m.emissive.setHSL((time * 0.25) % 1, 0.9, 0.5);
      m.emissiveIntensity = 0.35;
    }
    if (time > next) {
      next = time + (skin === 'sparkle' || special ? 0.12 : 0.3);
      const c = cargo.position(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6, (Math.random() - 0.5) * 0.8));
      cargo['sim'].fx?.burst('star', c, { count: 1, speed: 0.3, up: 0.4, size: 0.05, life: 0.6, gravity: 0, drag: 2, colors: skin === 'rainbow' ? RAINBOW : [0xffe14a, 0xffffff] });
    }
  };
}
