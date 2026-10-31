import type { CargoKind, LevelObject, SpawnSet, Vec3 } from '../types';
import { railing, ramp, stairs, wall } from '../helpers';
import { galleryEasel } from '../props';
import type { Frame } from './frame';
import type { Rng } from './rng';
import type { CargoKit, GenTheme } from './kits';

/**
 * Course pieces for generated jobs. Each is written in its own frame: you walk
 * in at the origin heading toward -Z, the floor is at y 0, +X is on your right.
 * A piece builds its ground, obstacles and hazards, says where the next piece
 * starts, and tells the test bot how to get through (waypoints and waits).
 *
 * The path is W wide with a verge of M either side (decorations live there).
 */
export const W = 7;
export const M = 2.4;
const DEG = Math.PI / 180;

export interface GenCtx {
  rng: Rng;
  kit: CargoKit;
  theme: GenTheme;
  /** 0 (gentle) .. 1 (nasty). */
  difficulty: number;
  cargo: CargoKind;
}

/** Bot steps: [x, z, formation] waypoints (level coordinates), or a wait. */
export type BotStep = [number, number, string] | { wait: string; [k: string]: unknown };

export interface Exit {
  length: number;
  /** Sideways shift, rise, and turn (degrees, + = left) of the next piece. */
  dx?: number;
  dy?: number;
  turn?: number;
  /** A calm stretch: fine for a checkpoint right after. */
  calm?: boolean;
}

export class Build {
  readonly objects: LevelObject[] = [];
  readonly bot: BotStep[] = [];
  readonly tips: { pos: Vec3; radius: number; text: string }[] = [];
  /** Lowest floor this piece has (for the out-of-bounds height). */
  low = 0;
  /** Highest floor (for the ceiling a floating load is lost above). */
  high = 0;

  constructor(
    readonly f: Frame,
    readonly g: GenCtx,
  ) {
    this.low = f.origin[1];
    this.high = f.origin[1];
  }

  /** Objects written in the piece's frame. */
  add(...os: LevelObject[]) {
    for (const o of os) this.objects.push(this.f.obj(o));
  }

  /** Objects already in level coordinates. */
  world(...os: LevelObject[]) {
    this.objects.push(...os);
  }

  /** The bot walks here (the load's position, or the leader's in an inline carry). */
  go(x: number, z: number, form = this.g.kit.form) {
    const p = this.f.p(x, 0, z);
    this.bot.push([p[0], p[2], form]);
  }

  wait(w: { wait: string; [k: string]: unknown }) {
    this.bot.push(w);
  }

  tip(x: number, z: number, text: string, radius = 3) {
    this.tips.push({ pos: this.f.p(x, 0, z), radius, text });
  }

  /** Floating ground from z0 down to z1 (z0 > z1): verge, path, underside, edges, decorations. */
  ground(z0: number, z1: number, o: { edges?: boolean; decor?: boolean; y?: number } = {}) {
    const { edges = true, decor = true, y = 0 } = o;
    const t = this.g.theme;
    const len = z0 - z1;
    const mid = (z0 + z1) / 2;
    this.add(
      { type: 'box', pos: [0, y - 0.2, mid], size: [W + 2 * M, 0.4, len], surface: t.verge.surface, color: t.verge.color, radius: 0.04 },
      { type: 'box', pos: [0, y + 0.006, mid], size: [W, 0.012, len], surface: t.path.surface, color: t.path.color, collide: false, castShadow: false, radius: 0.003 },
      { type: 'box', pos: [0, y - 1.6, mid], size: [W + 2 * M - 0.5, 2.4, len - 0.1], color: t.dirt, collide: false, radius: 0.3 },
    );
    if (edges) this.edges(z0, z1, y);
    if (decor) this.decorate(z0, z1, y);
    this.low = Math.min(this.low, this.f.origin[1] + y);
    this.high = Math.max(this.high, this.f.origin[1] + y);
  }

  /** Something along both sides of the path so nobody wanders off by accident. */
  edges(z0: number, z1: number, y = 0, sides: (-1 | 1)[] = [-1, 1]) {
    const t = this.g.theme;
    const len = z0 - z1;
    const mid = (z0 + z1) / 2;
    for (const s of sides) {
      const x = s * (W / 2 + 0.15);
      if (t.edge === 'rail') this.world(...railing(this.f.p(x, y, z0 - 0.1), this.f.p(x, y, z1 + 0.1), { color: t.edgeColor, height: 0.95 }));
      else if (t.edge === 'hedge') this.add({ type: 'box', pos: [x, y + 0.35, mid], size: [0.5, 0.7, len - 0.2], color: t.edgeColor, radius: 0.2 });
      else this.add({ type: 'box', pos: [x, y + 0.12, mid], size: [0.3, 0.24, len], color: t.edgeColor, radius: 0.05 });
    }
  }

  /** Dot things from the theme along the verges. */
  decorate(z0: number, z1: number, y = 0) {
    const t = this.g.theme;
    const r = this.g.rng;
    for (const s of [-1, 1]) {
      for (let z = z0 - r.range(1, 3); z > z1 + 1; z -= r.range(3, 6)) {
        if (r.chance(0.35)) continue;
        const d = r.weighted(t.decor.map((v) => ({ w: v.w, v })));
        const x = s * (W / 2 + M * r.range(0.5, 0.6));
        // long side along the path, so nothing pokes into it
        const yaw = (r.chance(0.5) ? 0 : 180) + r.range(-15, 15);
        this.add({ type: 'model', model: d.model, pos: [x, y, z], rot: [0, yaw, 0], ...(d.size ? { size: d.size } : {}), ...(d.collider ? { collider: { size: d.collider } } : {}) });
      }
    }
  }

  /** Where the cargo waits at the start or a checkpoint (stand and all), and where everyone appears. */
  kitAt(x: number, z: number, y = 0): SpawnSet {
    const k = this.g.kit;
    for (const o of k.stand()) this.add({ ...o, pos: [o.pos[0] + x, o.pos[1] + y, o.pos[2] + z] });
    const f = this.f;
    const spawn: SpawnSet = {
      p1: f.p(x + k.movers[0][0], y, z + k.movers[0][1]),
      p2: f.p(x + k.movers[1][0], y, z + k.movers[1][1]),
      cargo: f.p(x, y + k.y, z),
      yaw: f.yaw(180),
    };
    if (k.yaws) spawn.yaws = [f.yaw(k.yaws[0]), f.yaw(k.yaws[1])];
    if (k.rot) spawn.cargoRot = [k.rot[0], k.rot[1] + f.heading, k.rot[2]];
    else spawn.cargoYaw = (k.yaw ?? 0) + f.heading;
    return spawn;
  }
}

export interface Piece {
  id: string;
  /** How often it comes up (0 = not for this cargo / heading). */
  weight(g: GenCtx, heading: number, corners: number): number;
  build(b: Build): Exit;
}

const north = (h: number) => h === 0;

// ---------------------------------------------------------------- the pieces

const flat: Piece = {
  id: 'flat',
  weight: () => 1,
  build(b) {
    const r = b.g.rng;
    const L = r.range(8, 12);
    b.ground(0, -L);
    // a few loose things near the edges to steer round
    for (let i = r.int(0, 2); i > 0; i--) {
      const s = r.chance(0.5) ? -1 : 1;
      const x = s * r.range(2.3, 2.9);
      const z = -r.range(2, L - 2);
      if (r.chance(0.5)) b.add({ type: 'model', model: 'cone', pos: [x, 0, z], dynamic: { mass: 2 } });
      else b.add({ type: 'box', pos: [x, 0.3, z], size: [0.7, 0.6, 0.6], surface: 'cardboard', dynamic: { mass: 6 } });
    }
    b.go(0, -L);
    return { length: L, calm: true };
  },
};

const rampPiece: Piece = {
  id: 'ramp',
  weight: () => 1.2,
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const up = r.chance(0.55);
    const rise = r.range(1.0, 2.0) * (up ? 1 : -1);
    const slope = Math.min(b.g.kit.maxSlope, 10) * r.range(0.75, 1) * DEG;
    const L = Math.abs(rise) / Math.tan(slope);
    const f = b.f;
    b.world(
      ramp(f.p(0, 0, 0), f.p(0, rise, -L), W + 2 * M, { surface: t.verge.surface, color: t.verge.color, thickness: 0.4 }),
      ramp(f.p(0, 0.012, 0), f.p(0, rise + 0.012, -L), W, { surface: t.path.surface, color: t.path.color, thickness: 0.02, collide: false, castShadow: false }),
    );
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.15);
      b.world(...railing(f.p(x, 0, -0.1), f.p(x, rise, -L + 0.1), { color: t.edgeColor, height: 0.95 }));
    }
    b.low = Math.min(b.low, f.origin[1] + Math.min(0, rise));
    b.go(0, -L * 0.5);
    b.go(0, -L);
    if (b.g.kit.stairs === false && b.g.cargo === 'piano') b.tip(0, -L * 0.3, up ? 'Push together up the slope!' : 'Hold it back on the way down!', 3);
    return { length: L, dy: rise };
  },
};

const stairsPiece: Piece = {
  id: 'stairs',
  weight: (g) => (g.kit.stairs ? 0.8 : 0),
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    // (a long load only goes down stairs: carried end to end, it can't get up them)
    const up = r.chance(0.5) && b.g.kit.stairs === 'both';
    const n = r.int(5, 8);
    // gentle steps, like the fire escape: steep ones stop a long load
    const rise = 0.16;
    const run = 0.5;
    const H = n * rise;
    const L = n * run;
    const f = b.f;
    const opts = { surface: t.path.surface, color: t.path.color };
    if (up) b.world(...stairs(f.p(0, 0, 0), f.yawOf(0, -1), n, rise, run, W, opts));
    else b.world(...stairs(f.p(0, -H, -L), f.yawOf(0, 1), n, rise, run, W, opts));
    const dy = up ? H : -H;
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + 0.1);
      b.world(...railing(f.p(x, up ? 0 : 0, 0), f.p(x, dy, -L), { color: t.edgeColor, height: 0.95 }));
    }
    b.low = Math.min(b.low, f.origin[1] + Math.min(0, dy));
    b.go(0, -L);
    b.tip(0, 0, up ? 'Stairs: up together, one step at a time' : 'Stairs down: slowly does it', 3);
    return { length: L, dy };
  },
};

const door: Piece = {
  id: 'door',
  weight: () => 0.9,
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const k = b.g.kit;
    const L = 8.5;
    const z = -4.5;
    const gap = k.door;
    const dx = Math.max(-(W / 2 - gap / 2 - 0.2), Math.min(W / 2 - gap / 2 - 0.2, r.range(-1.4, 1.4)));
    b.ground(0, -L);
    const half = W / 2 + M;
    const frac = (dx + half) / (2 * half);
    b.world(...wall(b.f.p(-half, 0, z), b.f.p(half, 0, z), 2.8, { surface: t.wall.surface, color: t.wall.color, thickness: 0.25, fade: true, doors: [[frac, gap, 2.45]] }));
    // line up with the doorway in good time (a sharp sideways jink swings a wide load into the frame)
    b.go(dx * 0.6, -1.5);
    b.go(dx, z + 1.8, k.tight);
    b.go(dx, z - 1.8, k.tight);
    b.go(0, -L);
    return { length: L, calm: true };
  },
};

const slalom: Piece = {
  id: 'slalom',
  weight: () => 0.9,
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const k = b.g.kit;
    const n = 3;
    const step = r.range(3.6, 4.4);
    const L = step * (n + 1);
    b.ground(0, -L);
    const pass = Math.min(W - 1.4, k.door + 0.6);
    const len = W - pass;
    let side = r.chance(0.5) ? 1 : -1;
    for (let i = 1; i <= n; i++) {
      const z = -step * i;
      const cx = side * (W / 2 - len / 2);
      if (t.edge === 'hedge' || t.name === 'park' || t.name === 'snow') b.add({ type: 'box', pos: [cx, 0.45, z], size: [len, 0.9, 0.7], color: t.name === 'snow' ? 0xf2f5fa : 0x3f7f3a, radius: 0.3 });
      else b.add({ type: 'box', pos: [cx, 0.5, z], size: [len, 1.0, 0.4], surface: t.wall.surface, color: t.wall.color, radius: 0.05 });
      const pc = -side * (W / 2 - pass / 2);
      b.go(pc * 0.7, z + 1.2, k.tight);
      b.go(pc * 0.7, z - 1.2, k.tight);
      side = -side;
    }
    b.go(0, -L);
    return { length: L };
  },
};

const wreckingBall: Piece = {
  id: 'ball',
  weight: (g) => 0.5 + g.difficulty * 0.7,
  build(b) {
    const r = b.g.rng;
    const L = 11;
    const z = -L / 2;
    b.ground(0, -L);
    const pivot = b.f.p(0, 8.4, z);
    // a load carried end to end is three metres long, and the piano is slow: both take longer to get clear,
    // so the ball swings slower for them
    const inline = b.g.kit.form === 'inline';
    const slow = inline || b.g.cargo === 'piano';
    b.world({
      type: 'hazard',
      kind: 'wreckingBall',
      pos: pivot,
      // a slow, wide swing: about three seconds clear after each pass, enough to carry something heavy across
      params: { length: 7.2, amp: 52, period: (slow ? 11.8 : 8.8) - b.g.difficulty * 1.3 + r.range(-0.3, 0.3), yaw: b.f.yaw(90), radius: 0.55, phase: r.next() },
    });
    // wait well clear (a wide load sways when it stops), go the moment it has swung past
    b.go(0, z + 1.8);
    b.wait({ wait: 'ball', at: [pivot[0], pivot[2]] });
    // (end to end the bot steers the leader: take it far enough that the back mover is clear too)
    b.go(0, z - 2.0 - (inline ? 2.8 : 0));
    b.go(0, -L);
    b.tip(0, z + 2, 'Wait for the ball to swing past, then go!', 3.5);
    return { length: L };
  },
};

const traffic: Piece = {
  id: 'traffic',
  // the bot's gap-spotting assumes cars run along X: heading north only
  weight: (g, h) => (north(h) ? 0.5 + g.difficulty * 0.6 : 0),
  build(b) {
    const r = b.g.rng;
    const f = b.f;
    const lane = 3.6;
    // a traffic island between the lanes, deep enough to stand on with the load
    const med = b.g.kit.form === 'inline' ? 5 : 2.8;
    const z0 = -3;
    const laneA = z0 - lane / 2;
    const medA = z0 - lane;
    const medB = medA - med;
    const laneB = medB - lane / 2;
    const z1 = medB - lane;
    const L = -z1 + 3;
    b.ground(0, z0);
    b.ground(z1, -L);
    const reach = 40;
    const t = b.g.theme;
    // the road, straight across, and the island in the middle
    b.add(
      { type: 'box', pos: [0, -0.2, (z0 + z1) / 2], size: [reach * 2, 0.4, z0 - z1], surface: 'asphalt', radius: 0.03 },
      { type: 'box', pos: [0, -1.6, (z0 + z1) / 2], size: [reach * 2 - 0.5, 2.4, z0 - z1 - 0.2], color: t.dirt, collide: false, radius: 0.3 },
      { type: 'box', pos: [0, 0.006, (medA + medB) / 2], size: [W + 1, 0.012, med], surface: t.path.surface, color: t.path.color, collide: false, castShadow: false, radius: 0.003 },
      // kerbs either end of the island so cars can't clip it, and posts to mark it
      { type: 'box', pos: [-(W / 2 + 1.2), 0.25, (medA + medB) / 2], size: [1.2, 0.5, med - 0.3], color: 0xf2f2ee, radius: 0.1 },
      { type: 'box', pos: [W / 2 + 1.2, 0.25, (medA + medB) / 2], size: [1.2, 0.5, med - 0.3], color: 0xf2f2ee, radius: 0.1 },
    );
    for (const z of [laneA, laneB]) for (let i = 0; i < 6; i++) b.add({ type: 'box', pos: [-1.9 + i * 0.76, 0.008, z], size: [0.42, 0.012, lane - 0.6], color: 0xf4f4f0, collide: false, castShadow: false });
    const speed = r.range(3.4, 4.4) + b.g.difficulty * 1.2;
    const count = b.g.difficulty > 0.7 ? 3 : 2;
    b.world(
      { type: 'hazard', kind: 'car', pos: f.p(-reach, 0, laneA), params: { dirYaw: f.yaw(90), length: reach * 2, speed, count, phase: r.next() } },
      { type: 'hazard', kind: 'car', pos: f.p(reach, 0, laneB), params: { dirYaw: f.yaw(-90), length: reach * 2, speed: speed * r.range(0.85, 1.1), count, phase: r.next() } },
    );
    const x = f.p(0, 0, 0)[0];
    const zr = (z: number) => {
      const a = f.p(0, 0, z + lane / 2 + 0.6)[2];
      const c = f.p(0, 0, z - lane / 2 - 0.6)[2];
      return [Math.min(a, c), Math.max(a, c)];
    };
    // one lane at a time, waiting on the island in between
    // a gap means the next car is at least three seconds of carrying away (and the last one well past)
    const ahead = 6 + speed * 3.4;
    b.go(0, z0 + 0.7);
    b.wait({ wait: 'gap', x, z: zr(laneA), ahead, behind: 5 });
    b.go(0, (medA + medB) / 2);
    b.wait({ wait: 'gap', x, z: zr(laneB), ahead, behind: 5 });
    b.go(0, z1 - 1.2);
    b.go(0, -L);
    b.tip(0, z0 + 1, 'Look both ways! One lane at a time: wait on the island.', 3);
    return { length: L };
  },
};

const lasers: Piece = {
  id: 'lasers',
  // the bot finds a gate by its z: heading north only
  // a long load carried end to end can't get its whole length through while they're off
  weight: (g, h) => (north(h) && g.kit.form !== 'inline' ? 0.4 + g.difficulty * 0.6 : 0),
  build(b) {
    const r = b.g.rng;
    const L = 12;
    const zs = [-L * 0.33, -L * 0.7];
    b.ground(0, -L);
    zs.forEach((z, i) => {
      b.world({ type: 'hazard', kind: 'laser', pos: b.f.p(0, 0, z), rot: [0, b.f.yaw(0), 0], params: { width: W, beams: 4, on: 2.2, off: 3.2, phase: i * 1.7 + r.range(0, 1) } });
    });
    for (const z of zs) {
      b.go(0, z + 1.4);
      b.wait({ wait: 'laser', z: b.f.p(0, 0, z)[2] });
      b.go(0, z - 1.4);
    }
    b.go(0, -L);
    b.tip(0, zs[0] + 1.5, 'Lasers! Go when they blink off.', 3);
    return { length: L };
  },
};

const ice: Piece = {
  id: 'ice',
  // slipping with a cake or an egg is just cruel; a piano would never stop
  weight: (g) => (g.cargo === 'piano' || g.cargo === 'cake' || g.cargo === 'egg' ? 0 : 0.6),
  build(b) {
    const r = b.g.rng;
    const L = r.range(9, 13);
    b.ground(0, -L);
    b.add({ type: 'box', pos: [0, 0.012, -L / 2], size: [W, 0.03, L - 3], surface: 'ice', radius: 0.01 });
    b.go(0, -L);
    b.tip(0, -1, 'Slippery! Small steps.', 2.5);
    return { length: L, calm: true };
  },
};

const people: Piece = {
  id: 'people',
  weight: () => 0.5,
  build(b) {
    const r = b.g.rng;
    const f = b.f;
    const L = 16;
    // two zebra crossings, far enough apart to wait between them; the walkers wait at the kerb, off the path,
    // while anyone is near their crossing (and the edges have gaps for them)
    const rows = [-3.8, -12];
    b.ground(0, -L, { edges: false, decor: false });
    b.edges(0, rows[0] + 0.8);
    b.edges(rows[0] - 0.8, rows[1] + 0.8);
    b.edges(rows[1] - 0.8, -L);
    b.decorate(0, rows[0] + 1.2);
    b.decorate(rows[0] - 1.2, rows[1] + 1.2);
    b.decorate(rows[1] - 1.2, -L);
    for (const z of rows) for (let x = -W / 2 + 0.55; x < W / 2; x += 0.95) b.add({ type: 'box', pos: [x, 0.014, z], size: [0.5, 0.012, 1.3], color: 0xf4f1ea, collide: false, castShadow: false, radius: 0.003 });
    const colors = [0xff8fab, 0x52d39a, 0x4dd0e1, 0xb085f5, 0xffd23f, 0x2b2b33];
    const pigeons = r.chance(0.5) ? r.range(-2, 2) : null;
    const kerb = W / 2 + 0.9;
    rows.forEach((z, i) => {
      const s = i % 2 ? 1 : -1;
      b.world({
        type: 'hazard',
        kind: 'pedestrian',
        pos: f.p(s * kerb, 0.02, z),
        params: { points: [[0, 0, 0], f.v(-s * 2 * kerb, 0, 0)], speed: r.range(0.35, 0.55), color: r.pick(colors), polite: true },
      });
    });
    if (pigeons !== null) b.world({ type: 'hazard', kind: 'pigeons', pos: f.p(pigeons, 0, -7.9), params: { count: r.int(4, 7), radius: 1.2 } });
    // the bot waits (near enough that the walkers hold at the kerb) until each crossing is clear; end to end,
    // the leader goes further so the back mover is well past the first crossing
    const inline = b.g.kit.form === 'inline';
    const row = (z: number) => {
      const at = f.p(0, 0, z);
      b.wait({ wait: 'walkers', at: [at[0], at[2]], along: [f.v(1, 0, 0)[0], f.v(1, 0, 0)[2]] });
    };
    b.go(0, -0.9);
    row(rows[0]);
    b.go(0, inline ? -9.4 : -7.9);
    row(rows[1]);
    b.go(0, -L);
    b.tip(0, -1, 'Zebra crossing! Pedestrians wait for you at the kerb, so wait for them to finish crossing.', 3);
    return { length: L, calm: true };
  },
};

const corner: Piece = {
  id: 'corner',
  weight: (_g, h, corners) => (corners >= 2 ? 0 : h === 0 ? 0.5 : 0.9),
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const h = b.f.heading;
    // turn left (+90) or right (-90), never back toward the camera
    const turn = h === 0 ? (r.chance(0.5) ? 90 : -90) : h > 0 ? -90 : 90;
    const S = W + 2 * M;
    const side = turn > 0 ? -1 : 1; // the side we leave by
    b.add(
      { type: 'box', pos: [0, -0.2, -S / 2], size: [S, 0.4, S], surface: t.verge.surface, color: t.verge.color, radius: 0.04 },
      { type: 'box', pos: [0, -1.6, -S / 2], size: [S - 0.5, 2.4, S - 0.5], color: t.dirt, collide: false, radius: 0.3 },
      // the path: in, the corner square, out
      { type: 'box', pos: [0, 0.006, -M / 2], size: [W, 0.012, M], surface: t.path.surface, color: t.path.color, collide: false, castShadow: false, radius: 0.003 },
      { type: 'box', pos: [0, 0.006, -S / 2], size: [W, 0.012, W], surface: t.path.surface, color: t.path.color, collide: false, castShadow: false, radius: 0.003 },
      { type: 'box', pos: [side * (W / 2 + M / 2), 0.006, -S / 2], size: [M, 0.012, W], surface: t.path.surface, color: t.path.color, collide: false, castShadow: false, radius: 0.003 },
    );
    // walls of the bend: the far side and the side we don't leave by
    const f = b.f;
    const far = -(M + W) - 0.15;
    const outer = -side * (W / 2 + 0.15);
    if (t.edge === 'rail') {
      b.world(...railing(f.p(-S / 2 + 0.1, 0, far), f.p(S / 2 - 0.1, 0, far), { color: t.edgeColor, height: 0.95 }));
      b.world(...railing(f.p(outer, 0, -0.1), f.p(outer, 0, far), { color: t.edgeColor, height: 0.95 }));
    } else {
      const hgt = t.edge === 'hedge' ? 0.7 : 0.24;
      b.add(
        { type: 'box', pos: [0, hgt / 2, far], size: [S, hgt, 0.3], color: t.edgeColor, radius: 0.08 },
        { type: 'box', pos: [outer, hgt / 2, far / 2], size: [0.3, hgt, -far], color: t.edgeColor, radius: 0.08 },
      );
    }
    b.go(0, -S / 2);
    b.go(side * (S / 2), -S / 2);
    return { length: S / 2, dx: side * (S / 2), turn };
  },
};

const conveyor: Piece = {
  id: 'conveyor',
  // (a piano on castors just rolls off with the belt)
  weight: (g) => (g.cargo === 'piano' ? 0 : 0.6),
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const L = 10;
    const z0 = -3;
    const belt = r.range(3.4, 4.6);
    const z1 = z0 - belt;
    b.ground(0, z0);
    b.ground(z1, -L);
    // a belt across the path, flush with the floor, running to one side
    const speed = (r.chance(0.5) ? 1 : -1) * (0.75 + b.g.difficulty * 0.6);
    b.world({ type: 'hazard', kind: 'conveyor', pos: b.f.p(0, -0.15, (z0 + z1) / 2), rot: [0, b.f.yaw(90), 0], params: { size: [belt, 0.3, W + 2 * M], speed } });
    b.add({ type: 'box', pos: [0, -1.6, (z0 + z1) / 2], size: [W + 2 * M - 0.5, 2.4, belt - 0.1], color: t.dirt, collide: false, radius: 0.3 });
    b.edges(z0, z1);
    // (it carries things toward local +x when speed > 0): start a little upstream and lean into it, ending up
    // mid-path (only a little: a sideways step turns a wide load side-on to the walk)
    const up = -Math.sign(speed);
    b.go(up * 0.7, z0 + 0.4);
    b.go(up * 0.2, z1 - 0.8);
    b.go(0, -L);
    b.tip(0, z0 + 1, 'A moving belt: lean into it as you cross!', 3);
    return { length: L };
  },
};

const lift: Piece = {
  id: 'lift',
  weight: (g) => (g.cargo === 'piano' ? 0.3 : 0.5),
  build(b) {
    const r = b.g.rng;
    const k = b.g.kit;
    const f = b.f;
    // room for both movers and the load: end to end needs a deeper car
    const w = 4.6;
    const d = k.form === 'inline' ? 5.0 : 3.8;
    const H = r.range(2.4, 3.6);
    const z0 = -3;
    const z1 = z0 - d;
    const L = -z1 + 7;
    b.ground(0, z0);
    b.ground(z1, -L, { y: H });
    b.world({
      type: 'hazard',
      kind: 'elevator',
      pos: f.p(0, 0, (z0 + z1) / 2),
      rot: [0, f.yaw(0), 0],
      params: { size: [w, d], height: H, speed: 0.9, wall: 1.1, walls: ['+x', '-x'], landing: 4.2 },
    });
    // ride in the usual formation (the car is wide enough for it; changing over in the doorway snags).
    // End to end, the bot steers the leader: put the load (not the leader) in the middle so both movers are aboard
    b.go(0, (z0 + z1) / 2 - (k.form === 'inline' ? 1.4 : 0));
    // it sets off once both movers have been aboard a moment
    const at = f.p(0, 0, (z0 + z1) / 2);
    b.wait({ wait: 'rise', at: [at[0], at[2]] });
    b.go(0, z1 - 2.2);
    b.go(0, -L);
    b.tip(0, z0 + 1, 'All aboard: stand on the lift together and up it goes.', 3);
    return { length: L, dy: H };
  },
};

const swingDoors: Piece = {
  id: 'swing',
  weight: () => 0.5,
  build(b) {
    const r = b.g.rng;
    const t = b.g.theme;
    const k = b.g.kit;
    const f = b.f;
    const L = 9;
    const z = -4.5;
    b.ground(0, -L);
    // a doorway as wide as the load needs, with a spring door either side meeting in the middle
    const leaf = Math.max(1.3, k.door / 2);
    const hx = leaf + 0.04;
    const half = W / 2 + M;
    b.world(...wall(f.p(-half, 0, z), f.p(half, 0, z), 2.8, { surface: t.wall.surface, color: t.wall.color, thickness: 0.25, fade: true, doors: [[0.5, 2 * (hx + 0.06), 2.45]] }));
    // they rest part-open (less on harder jobs) and flap back after you; hinges just past the wall and off
    // the floor, so the leaves never rub on either (as in the ski lodge)
    const open = 85 - b.g.difficulty * 20 + r.range(-3, 3);
    const color = r.pick([0xc98f5a, 0x8fb8de, 0xd96b6b, 0x7fbf7f, 0xe0c25a]);
    for (const s of [-1, 1]) b.world({ type: 'hazard', kind: 'swingDoor', pos: f.p(s * hx, 0.02, z - 0.16), rot: [0, f.yaw(0), 0], params: { width: leaf, height: 2.3, side: -s, open, spring: 3, color } });
    b.go(0, z + 2.6);
    b.go(0, z - 2.4);
    b.go(0, -L);
    b.tip(0, z + 3, 'Swing doors: push through, and mind they swing back.', 3);
    return { length: L, calm: true };
  },
};

const bridge: Piece = {
  id: 'bridge',
  weight: (g) => 0.35 + g.difficulty * 0.4,
  build(b) {
    const r = b.g.rng;
    const k = b.g.kit;
    const gap = r.range(5, 7.5);
    const z0 = -2.5;
    const z1 = z0 - gap;
    const mid = (z0 + z1) / 2;
    const L = -z1 + 3;
    b.ground(0, z0);
    b.ground(z1, -L);
    // as wide as the movers walk (each one's distance from the load, plus a body) and some room to wobble
    const reach = k.form === 'inline' ? 0.4 : (k.broad?.[1] ?? Math.abs(k.movers[0][0])) + 0.4;
    const bw = Math.min(W - 1, Math.max(2.6, 2 * reach + 1.6 - b.g.difficulty * 0.5));
    b.add(
      // the deck (no railings: that's the point)
      { type: 'box', pos: [0, -0.12, mid], size: [bw, 0.24, gap + 0.8], surface: 'wood', color: 0xa0703f, radius: 0.03 },
      // beams underneath and a post at each corner
      { type: 'box', pos: [-(bw / 2 - 0.2), -0.5, mid], size: [0.22, 0.5, gap + 0.8], color: 0x6b4a2b, collide: false, radius: 0.04 },
      { type: 'box', pos: [bw / 2 - 0.2, -0.5, mid], size: [0.22, 0.5, gap + 0.8], color: 0x6b4a2b, collide: false, radius: 0.04 },
    );
    for (const sx of [-1, 1]) for (const z of [z0 - 0.15, z1 + 0.15]) b.add({ type: 'box', pos: [sx * (bw / 2 + 0.2), 0.35, z], size: [0.18, 0.7, 0.18], color: 0x6b4a2b, radius: 0.04 });
    b.go(0, z0 + 1.2);
    b.go(0, z1 - 1.2);
    b.go(0, -L);
    b.tip(0, z0 + 2, 'No railings! Keep it straight and steady.', 3);
    return { length: L };
  },
};

const ferry: Piece = {
  id: 'ferry',
  // (a piano on castors would roll off the back as it sets off; a clock carried end to end snags getting off)
  weight: (g) => (g.cargo === 'piano' || g.kit.form === 'inline' ? 0 : 0.4),
  build(b) {
    const r = b.g.rng;
    const k = b.g.kit;
    const f = b.f;
    // a cable car platform across a chasm: it waits at the near edge and sets off once both movers are aboard
    const w = 4.6;
    const d = k.form === 'inline' ? 5.0 : 3.8;
    const gap = r.range(d + 4, d + 7);
    const z0 = -2.5;
    const z1 = z0 - gap;
    const c0 = z0 - d / 2 - 0.05;
    const travel = gap - d - 0.1;
    const L = -z1 + 4;
    b.ground(0, z0);
    b.ground(z1, -L);
    b.world({
      type: 'hazard',
      kind: 'elevator',
      pos: f.p(0, 0, c0),
      rot: [0, f.yaw(0), 0],
      params: { size: [w, d], travel: f.v(0, 0, -travel), speed: 0.7, wall: 1.1, walls: ['+x', '-x'], landing: 4.2, style: 'gondola' },
    });
    // a gantry at each end carries the cable
    const steel = 0x5a5f69;
    for (const z of [z0 + 0.45, z1 - 0.45]) {
      for (const sx of [-1, 1]) b.add({ type: 'box', pos: [sx * (w / 2 + 0.4), 2.05, z], size: [0.22, 4.1, 0.22], color: steel, radius: 0.04 });
      b.add({ type: 'box', pos: [0, 4.05, z], size: [w + 1.0, 0.22, 0.26], color: steel, radius: 0.04, collide: false });
    }
    // end to end, the bot steers the leader: put the load in the middle of the car
    b.go(0, c0 - (k.form === 'inline' ? 1.4 : 0));
    const lead = k.form === 'inline' ? 1.4 : 0;
    const land = f.p(0, 0, c0 - travel - lead);
    b.wait({ wait: 'rise', at: [f.p(0, 0, c0)[0], f.p(0, 0, c0)[2]], land: [land[0], land[2]] });
    b.go(0, z1 - 2.2);
    b.go(0, -L);
    b.tip(0, z0 + 2, 'All aboard the cable car: step on together and it carries you over.', 3);
    return { length: L };
  },
};

const seesaw: Piece = {
  id: 'seesaw',
  // nothing on castors, no tiered cake or egg on a tipping plank, and no load carried end to end (the plank
  // tips with one mover on each side of it)
  // (water and a pane take a knock when it tips: rarer for them)
  weight: (g) => (g.cargo === 'piano' || g.cargo === 'cake' || g.cargo === 'egg' || g.kit.form === 'inline' ? 0 : g.cargo === 'aquarium' || g.cargo === 'glass' ? 0.15 : 0.4),
  build(b) {
    const r = b.g.rng;
    const k = b.g.kit;
    const f = b.f;
    const len = r.range(6.4, 7.4);
    // gentle: tips no steeper than the load can take on a ramp, and slowly (a slammed plank jolts the load)
    const maxA = Math.min(8, k.maxSlope);
    const reach = k.form === 'inline' ? 0.4 : (k.broad?.[1] ?? Math.abs(k.movers[0][0])) + 0.35;
    const width = Math.max(2.4, 2 * reach + 0.8);
    const z0 = -1.2;
    const zc = z0 - len / 2;
    const z1 = z0 - len;
    const L = len + 3.6;
    b.ground(0, -L);
    // pivot high enough that each end just rests on the ground when it's down; it starts with our end down
    const h = (len / 2) * Math.sin((maxA * Math.PI) / 180);
    b.world({ type: 'hazard', kind: 'seesaw', pos: f.p(0, h, zc), rot: [0, f.yaw(90), 0], params: { length: len, width, maxAngle: maxA, mass: 55, tilt: maxA, damping: 6 } });
    // a little wedge at each end to step up onto the plank
    const wedge = (z: number, dir: 1 | -1) => b.add({ type: 'box', pos: [0, 0.03, z], size: [width, 0.12, 1.4], rot: [dir * 6, 0, 0], color: 0xb98a5a, surface: 'wood', radius: 0.02 });
    wedge(z0 + 0.65, 1);
    wedge(z1 - 0.65, -1);
    // stop just past the middle and let it tip under you, then walk down
    b.go(0, z0 + 0.6);
    b.go(0, zc - 0.5);
    b.wait({ wait: 'time', s: 2.5 });
    b.go(0, z1 - 1.0);
    b.go(0, -L);
    b.tip(0, z0 + 1, 'See-saw! Walk to the middle, stop and let it tip, then walk down.', 3);
    return { length: L };
  },
};

export const PIECES: Piece[] = [flat, rampPiece, stairsPiece, door, slalom, wreckingBall, traffic, lasers, ice, people, corner, conveyor, lift, swingDoors, bridge, ferry, seesaw];

// ---------------------------------------------------------------- start, checkpoint, finish

/** The start: the cargo waiting on its stand, with the job's name on a sign. */
export function startPiece(b: Build, title: string): { exit: Exit; spawn: SpawnSet } {
  const L = 8;
  b.ground(4, -L);
  // something behind, so nobody backs off the edge
  b.add({ type: 'box', pos: [0, 0.45, 3.85], size: [W + 0.6, 0.9, 0.3], color: b.g.theme.edgeColor, radius: 0.08 });
  const spawn = b.kitAt(0, -2);
  b.add({ type: 'sign', pos: [-(W / 2 + 1.2), 2.0, -1.5], rot: [0, 20, 0], size: [3.2, 0.9, 0.06], text: title.toUpperCase(), color: 0x2f5d4a, post: true, fontSize: 0.32 });
  b.go(0, -L);
  return { exit: { length: L, calm: true }, spawn };
}

/** A checkpoint: a flat stretch with a spare stand off to the side for restarts. */
export function checkpointPiece(b: Build): { exit: Exit; zone: { pos: Vec3; size: Vec3; spawn: SpawnSet } } {
  const L = 9;
  b.ground(0, -L);
  const spawn = b.kitAt(W / 2 - 1.7, -L / 2 - 1);
  const pos = b.f.p(0, 1, -L / 2);
  // zone dimensions in level axes
  const across = Math.abs(b.f.heading) === 90;
  const zone = { pos, size: (across ? [3, 2, W] : [W, 2, 3]) as Vec3, spawn };
  // (the bot keeps to the far side of the spare stand)
  b.go(-1.3, -L / 2);
  b.go(0, -L);
  return { exit: { length: L, calm: true }, zone };
}

/** The finish: a drop-off pad. */
export function goalPiece(b: Build): { goal: { pos: Vec3; size: Vec3; label: string } } {
  const L = 10;
  b.ground(0, -L);
  b.add({ type: 'box', pos: [0, 0.45, -L + 0.15], size: [W + 0.6, 0.9, 0.3], color: b.g.theme.edgeColor, radius: 0.08 });
  const pos = b.f.p(0, 0.7, -L / 2);
  const across = Math.abs(b.f.heading) === 90;
  const goal = { pos, size: (across ? [3.2, 1.4, 3.6] : [3.6, 1.4, 3.2]) as Vec3, label: 'DROP-OFF' };
  // a pane can't stand on its own: lean it on a rack, bar on the far side. Pushed in, its foot meets a ledge
  // first while the top carries on to the bar, so it ends up leaning forward onto the bar (pushed straight
  // into a bar alone, the top stops and the foot swings on: it leans back and falls)
  if (b.g.cargo === 'glass') {
    const zc = -L / 2 - 0.35;
    b.add(
      { type: 'box', pos: [0, 0.06, zc], size: [2.6, 0.12, 0.8], surface: 'wood', color: 0x8a5a36 },
      { type: 'box', pos: [0, 0.18, zc + 0.14], size: [2.0, 0.12, 0.05], color: 0x2a2a30, radius: 0.01 },
      { type: 'box', pos: [-1.08, 0.6, zc - 0.12], size: [0.08, 0.96, 0.08], color: 0x8a5a36, radius: 0.035, grabbable: false },
      { type: 'box', pos: [1.08, 0.6, zc - 0.12], size: [0.08, 0.96, 0.08], color: 0x8a5a36, radius: 0.035, grabbable: false },
      { type: 'box', pos: [0, 1.0, zc - 0.104], size: [2.3, 0.06, 0.06], color: 0x3d6fb0, radius: 0.028, grabbable: false, friction: 0.05 },
    );
  }
  // things that start on a stand are set down on one too (nobody can lower a cake gently all the way to the floor)
  else if (b.g.cargo === 'cake' || b.g.cargo === 'swan' || b.g.cargo === 'egg') for (const o of b.g.kit.stand()) b.add({ ...o, pos: [o.pos[0], o.pos[1], o.pos[2] - L / 2] });
  // the painting goes on job 9's gallery easel (picture facing back down the course), leaning back on its board
  else if (b.g.cargo === 'painting') b.add(...galleryEasel(0, 0, -L / 2 - 0.3));
  // the balloons get tied onto a party table: long and narrow, so the movers walk either side of it
  else if (b.g.cargo === 'balloons')
    b.add(
      { type: 'box', pos: [0, 0.335, -L / 2 - 0.3], size: [0.62, 0.67, 1.9], color: 0xffd6e0, radius: 0.02 },
      { type: 'box', pos: [0, 0.7, -L / 2 - 0.3], size: [0.7, 0.06, 2.0], color: 0xfbfaf6, radius: 0.015, tie: true },
    );
  b.add({ type: 'sign', pos: [W / 2 + 1.2, 2.2, -L / 2], rot: [0, -20, 0], size: [2.6, 0.7, 0.06], text: 'DELIVERIES', color: 0x2a6f4a, post: true });
  // glass: push it right in (the bot stops within 0.2 m of its target, so aim past the bar); the painting onto the
  // easel's ledge; the bouquet over the middle of the table
  const end = b.g.cargo === 'glass' ? -L / 2 - 0.6 : b.g.cargo === 'painting' ? -L / 2 - 0.4 : b.g.cargo === 'balloons' ? -L / 2 - 0.3 : -L / 2;
  b.go(0, end);
  return { goal };
}
