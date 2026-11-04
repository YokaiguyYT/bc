import { railing, ramp } from '../helpers';
import { M, W, type Build, type Piece } from './pieces';

/**
 * More course pieces for random jobs (written like the ones in pieces.ts:
 * in their own frame, walking in at the origin toward -Z, floor at y 0).
 */

const DEG = Math.PI / 180;
const north = (h: number) => h === 0;
/** How far each mover is from the load's middle (they walk there). */
const reach = (b: Build) => Math.max(0, ...b.g.kit.movers.map((m) => Math.abs(m[0])));

/** A bridge of planks over a drop: each one falls away a moment after you step on it. Keep moving! */
const collapse: Piece = {
  id: 'collapse',
  // (end to end the back carrier would arrive after the plank's gone; the piano's castors want a floor that stays put)
  weight: (g) => (g.kit.form === 'inline' || g.cargo === 'piano' ? 0 : 0.55),
  build(b) {
    const r = b.g.rng;
    const bw = Math.min(W - 1, Math.max(3.4, 2 * reach(b) + 1.4));
    b.ground(0, -3);
    b.ground(-12, -15);
    b.world({
      type: 'hazard',
      kind: 'collapse',
      pos: b.f.p(0, 0, -7.5),
      params: { length: 9.1, width: bw, planks: 7, yaw: b.f.yaw(180), delay: 1.35 - b.g.difficulty * 0.35 + r.range(-0.05, 0.05) },
    });
    b.low = Math.min(b.low, b.f.origin[1] - 3);
    b.cash(0, -7.5, { y: 0 });
    b.go(0, -2.4);
    // (a moment's pause, then across in one go: no stopping halfway)
    b.wait({ wait: 'time', s: 0.05 });
    b.go(0, -12.9);
    b.go(0, -15);
    b.tip(0, -2, 'The planks fall away behind you: keep moving and don’t stop!', 3);
    return { length: 15 };
  },
};

/** A railway level crossing: barriers come down and a train thunders through. */
const train: Piece = {
  id: 'train',
  // (the bot's crossing logic, like the traffic's, is happiest heading north)
  weight: (g, h) => (north(h) ? 0.55 : 0),
  build(b) {
    const r = b.g.rng;
    const L = 10;
    const z = -5;
    b.ground(0, -L, { edges: false });
    b.edges(0, z + 1.7);
    b.edges(z - 1.7, -L);
    const at = b.f.p(0, 0, z);
    b.world({ type: 'hazard', kind: 'train', pos: at, params: { yaw: b.f.yaw(90), period: 13 + r.range(0, 5), phase: r.next(), speed: 9 + b.g.difficulty * 4, cars: r.chance(0.5) ? 3 : 2, gap: W / 2 } });
    b.go(0, z + 2.6);
    b.wait({ wait: 'train', at: [at[0], at[2]] });
    b.go(0, z - 2.8);
    b.go(0, -L);
    b.tip(0, z + 3, 'Level crossing! Wait for the train to pass and the barriers to go up.', 3);
    return { length: L };
  },
};

/** A crane slides a steel beam across the path at chest height, waits, then slides it back. */
const crane: Piece = {
  id: 'crane',
  weight: () => 0.55,
  build(b) {
    const r = b.g.rng;
    const L = 10;
    const z = -5;
    b.ground(0, -L, { edges: false });
    b.edges(0, z + 1.2);
    b.edges(z - 1.2, -L);
    const at = b.f.p(0, 0, z);
    const side = r.chance(0.5) ? 90 : -90;
    b.world({ type: 'hazard', kind: 'craneBeam', pos: at, params: { yaw: b.f.yaw(side), reach: W / 2 + 2.6, period: 11 + r.range(0, 3) - b.g.difficulty, phase: r.next() } });
    b.cash(0, z, { risky: true });
    b.go(0, z + 1.9);
    b.wait({ wait: 'crane', at: [at[0], at[2]] });
    b.go(0, z - 2.1);
    b.go(0, -L);
    b.tip(0, z + 2.5, 'A crane beam! Wait for it to swing off to the side, then go.', 3);
    return { length: L };
  },
};

/** A lawn with sprinklers whose jets shove you about. */
const sprinklers: Piece = {
  id: 'sprinklers',
  weight: () => 0.5,
  build(b) {
    const r = b.g.rng;
    const L = 12;
    b.ground(0, -L);
    let s = r.chance(0.5) ? 1 : -1;
    for (const z of [-3.8, -8.4]) {
      b.world({ type: 'hazard', kind: 'sprinkler', pos: b.f.p(s * 1.9, 0.01, z), params: { radius: 4, speed: 1.1 + r.range(0, 0.6), push: 5 + b.g.difficulty * 4, phase: r.range(0, 6.3) } });
      s = -s;
    }
    b.cash(0, -6);
    b.go(0, -4);
    b.go(0, -8);
    b.go(0, -L);
    b.tip(0, -2, 'Sprinklers! Their jets push you around.', 3);
    return { length: L };
  },
};

/** An escalator up: a moving slope that carries you (and anything you set down) to the top. */
const escalator: Piece = {
  id: 'escalator',
  weight: (g) => (g.kit.maxSlope >= 7 && g.cargo !== 'piano' ? (g.hilly ? 1.5 : 0.5) : 0),
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const rise = r.range(1.4, 2.0);
    const slope = Math.min(b.g.kit.maxSlope, 10) * 0.95 * DEG;
    const L = rise / Math.tan(slope);
    const f = b.f;
    const a = f.p(0, 0, 0);
    const e = f.p(0, rise, -L);
    const len = Math.hypot(e[0] - a[0], e[1] - a[1], e[2] - a[2]);
    const speed = 0.8;
    const vel: [number, number, number] = [((e[0] - a[0]) / len) * speed, ((e[1] - a[1]) / len) * speed, ((e[2] - a[2]) / len) * speed];
    b.world(
      ramp(f.p(0, 0, 0), f.p(0, rise, -L), W + 2 * M, { surface: t.verge.surface, color: t.verge.color, thickness: 0.4 }),
      // the moving treads (a little narrower than the path, between brushed-metal sides)
      ramp(f.p(0, 0.02, 0), f.p(0, rise + 0.02, -L), W - 1, { surface: 'metal', color: 0x9aa3ad, thickness: 0.06, surfaceVel: vel }),
    );
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.3);
      b.world(ramp(f.p(x, 0.5, 0), f.p(x, rise + 0.5, -L), 0.5, { surface: 'metal', color: 0xd8dde2, thickness: 1.0 }));
      b.world(...railing(f.p(x, 1.0, -0.1), f.p(x, rise + 1.0, -L + 0.1), { color: 0x22222a, height: 0.12 }));
    }
    b.low = Math.min(b.low, f.origin[1]);
    b.high = Math.max(b.high, f.origin[1] + rise);
    b.cash(0, -L - 0.8, { y: rise });
    b.go(0, -L * 0.5);
    b.go(0, -L);
    b.tip(0, -1, 'An escalator! Step on and it carries you up.', 3);
    return { length: L, dy: rise };
  },
};

/** A narrow ledge along the side of a building, with a drop on the other side. */
const ledge: Piece = {
  id: 'ledge',
  weight: (g) => (g.cargo === 'piano' ? 0 : 0.5),
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const s = r.chance(0.5) ? 1 : -1;
    const lw = Math.min(W - 1.4, Math.max(2.6, 2 * reach(b) + 1.3));
    const cx = s * (W / 2 - lw / 2);
    const z0 = -2.5;
    const z1 = -10.5;
    b.ground(0, z0);
    b.ground(z1, -13);
    const mid = (z0 + z1) / 2;
    const len = z0 - z1;
    b.add(
      { type: 'box', pos: [cx, -0.2, mid], size: [lw, 0.4, len + 0.1], surface: t.path.surface, color: t.path.color, radius: 0.03 },
      { type: 'box', pos: [cx, -1.4, mid], size: [lw - 0.2, 2, len], color: t.dirt, collide: false, radius: 0.2 },
      // the building: a tall wall with a row of windows
      { type: 'box', pos: [s * (W / 2 + 0.5), 2.6, mid], size: [1, 5.6, len + 0.6], surface: t.wall.surface, color: t.wall.color },
    );
    for (let z = z0 - 1.2; z > z1 + 0.6; z -= 2.2) b.add({ type: 'box', pos: [s * (W / 2 - 0.02), 2.7, z], size: [0.06, 1.1, 0.9], color: 0x9fd0f0, collide: false, castShadow: false });
    b.low = Math.min(b.low, b.f.origin[1] - 3);
    b.cash(cx, mid, { risky: true });
    b.go(cx * 0.6, z0 + 0.6);
    b.go(cx, z0 - 0.8);
    b.go(cx, z1 + 0.8);
    b.go(0, z1 - 1.2);
    b.go(0, -13);
    b.tip(cx, z0 + 1.5, 'A narrow ledge. Hug the wall: it’s a long way down.', 3);
    return { length: 13 };
  },
};

/** Stepping stones over water: step from stone to stone (carriers each have a row). */
const stones: Piece = {
  id: 'stones',
  weight: (g) => (g.cargo === 'piano' ? 0 : 0.5),
  build(b) {
    const z0 = -2.5;
    const z1 = -10;
    b.ground(0, z0);
    b.ground(z1, -12.5);
    const mid = (z0 + z1) / 2;
    b.add({ type: 'box', pos: [0, -1.0, mid], size: [W + 2 * M, 0.1, z0 - z1], color: 0x3d8fd6, collide: false, castShadow: false });
    const k = b.g.kit;
    // a row of stones under each carrier (one row, down the middle, for a load carried end to end)
    const rows = k.form === 'inline' ? [0] : [...new Set(k.movers.map((m) => +m[0].toFixed(2)))];
    for (const x of rows)
      for (let z = z0 - 0.62; z > z1 + 0.5; z -= 1.42)
        b.add({ type: 'cylinder', pos: [x, -0.16, z], radius: 0.64, height: 0.32, surface: 'concrete', color: 0x9a958c });
    b.low = Math.min(b.low, b.f.origin[1] - 3);
    b.cash(0, mid, { y: 0.4 });
    b.go(0, z0);
    b.wait({ wait: 'time', s: 0.05 });
    b.go(0, z1 - 0.4);
    b.go(0, -12.5);
    b.tip(0, z0 + 1.2, 'Stepping stones! Each of you keep to your own row.', 3);
    return { length: 12.5 };
  },
};

/** Mud: slow going. */
const mud: Piece = {
  id: 'mud',
  weight: () => 0.5,
  build(b) {
    const r = b.g.rng;
    const L = 11;
    b.ground(0, -L);
    for (const z of [-3, -6.2, -9]) {
      const w = r.range(4.2, W - 0.4);
      const x = r.range(-(W - w) / 2, (W - w) / 2);
      b.add({ type: 'box', pos: [x, 0.012, z], size: [w, 0.03, r.range(2.2, 3)], surface: 'plain', color: 0x5a3f28, slow: 0.5, radius: 0.01, castShadow: false });
    }
    b.cash(r.range(-2, 2), -6.2);
    b.go(0, -4);
    b.go(0, -8);
    b.go(0, -L);
    b.tip(0, -1.5, 'Mud! Slow going…', 3);
    return { length: L };
  },
};

/** Two spinning bars low down, one on each side: weave between them. */
const spinners: Piece = {
  id: 'spinners',
  weight: (g) => (g.kit.door <= 3.4 ? 0.55 : 0),
  build(b) {
    const r = b.g.rng;
    const L = 15;
    b.ground(0, -L);
    let s = r.chance(0.5) ? 1 : -1;
    const rad = 1.4;
    // (far enough apart to swing a long load across from one clear side to the other between them)
    for (const z of [-4, -11]) {
      const x = s * (W / 2 - rad - 0.1);
      b.world({ type: 'hazard', kind: 'spinner', pos: b.f.p(x, 0.48, z), params: { arms: 2, length: rad * 2, height: 0.4, thickness: 0.14, speed: (r.chance(0.5) ? 1 : -1) * (1.1 + b.g.difficulty * 0.6), bonk: true, color: 0xff5a4f } });
      const lane = -s * (W / 2 - (W - 2 * rad - 0.2) / 2);
      b.go(lane * 0.8, z + 2.0, b.g.kit.tight);
      b.go(lane * 0.8, z - 2.0, b.g.kit.tight);
      s = -s;
    }
    b.cash(0, -7.5, { risky: true });
    b.go(0, -L);
    b.tip(0, -1.5, 'Spinning bars! Keep to the clear side.', 3);
    return { length: L };
  },
};

export const PIECES2: Piece[] = [collapse, train, crane, sprinklers, escalator, ledge, stones, mud, spinners];
