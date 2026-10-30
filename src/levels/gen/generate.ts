import type { CargoKind, GenParams, LevelDef, LevelObject, Vec3 } from '../types';
import { Rng, hashSeed } from './rng';
import { Frame } from './frame';
import { GEN_CARGO, KITS, THEMES } from './kits';
import { Build, BotStep, checkpointPiece, GenCtx, goalPiece, PIECES, startPiece } from './pieces';
import { CARGO_INFO } from '../../entities/cargo/info';

/**
 * Random jobs: a course made from pieces (ramps, stairs, doors, wrecking
 * balls, traffic, lasers…), picked and arranged by a seed, with checkpoints
 * every few obstacles. The same seed (and cargo) always makes the same job,
 * so a job number can be shared, and online the guest just rebuilds it.
 */

const OPENERS = ['The Long Way to', 'Shortcut Through', 'Rush Hour at', 'Sunday Drive to', 'Express to', 'Detour via', 'Special Delivery to', 'The Scenic Route to', 'Handle With Care at', 'No Refunds at'];

/** Extra seconds a hazard costs (waiting for gaps and swings), for par time. */
const WAIT: Record<string, number> = { ball: 6, traffic: 8, lasers: 8, stairs: 4, slalom: 4, door: 2, people: 8, lift: 6, ferry: 8, swing: 2 };

export function generateJob(p: GenParams): LevelDef {
  const rng = new Rng(p.seed);
  // always draw the same numbers, then apply any choices given: otherwise naming
  // the cargo (as the online guest's copy does) would shift everything after it
  const rolled = { cargo: rng.pick(GEN_CARGO), theme: rng.pick(THEMES), difficulty: rng.range(0.25, 0.7), extra: rng.range(0, 2) };
  const cargo: CargoKind = p.cargo && KITS[p.cargo] ? p.cargo : rolled.cargo;
  const kit = KITS[cargo]!;
  const theme = rolled.theme;
  const difficulty = Math.max(0, Math.min(1, p.difficulty ?? rolled.difficulty));
  const count = p.pieces ?? Math.round(4 + difficulty * 6 + rolled.extra);
  const g: GenCtx = { rng, kit, theme, difficulty, cargo };
  const title = `${rng.pick(OPENERS)} ${rng.pick(theme.places)}`;

  const objects: LevelObject[] = [];
  const path: BotStep[] = [];
  const tips: { pos: Vec3; radius: number; text: string }[] = [];
  const checkpoints: LevelDef['checkpoints'] = [];
  let low = 0;
  let par = 20;
  const take = (b: Build) => {
    objects.push(...b.objects);
    path.push(...b.bot);
    tips.push(...b.tips);
    low = Math.min(low, b.low);
  };

  let f = new Frame([0, 0, 0], 0);
  let b = new Build(f, g);
  const start = startPiece(b, title);
  take(b);
  f = f.next(start.exit.length);

  let since = 0;
  let corners = 0;
  let last = '';
  const used: string[] = [];
  for (let i = 0; i < count; i++) {
    const choices = PIECES.filter((x) => x.id !== last)
      .map((x) => ({ w: x.weight(g, f.heading, corners), v: x }))
      .filter((c) => c.w > 0);
    const piece = rng.weighted(choices);
    b = new Build(f, g);
    const e = piece.build(b);
    take(b);
    f = f.next(e.length, e.dx ?? 0, e.dy ?? 0, e.turn ?? 0);
    if (e.turn) corners++;
    last = piece.id;
    used.push(piece.id);
    since++;
    par += e.length * 1.4 + (WAIT[piece.id] ?? 0);
    // a checkpoint every three obstacles or so (not right before the finish)
    if (since >= 3 && i < count - 1) {
      b = new Build(f, g);
      const cp = checkpointPiece(b);
      take(b);
      checkpoints.push(cp.zone);
      f = f.next(cp.exit.length);
      par += cp.exit.length * 1.4;
      since = 0;
    }
  }
  b = new Build(f, g);
  const fin = goalPiece(b);
  take(b);
  par += 10;

  const info = CARGO_INFO[cargo];
  const label = p.label ?? 'Random job';
  return {
    generated: true,
    gen: { seed: p.seed, cargo, difficulty, pieces: count, label },
    id: `gen-${p.seed}-${cargo}`,
    name: title,
    tagline: `${label} #${p.seed}`,
    order: 1000,
    hidden: true,
    cargo,
    theme: theme.sky,
    cameraYaw: 0,
    spawn: start.spawn,
    goal: fin.goal,
    checkpoints,
    killY: low - 7,
    parTime: Math.max(45, Math.round(par / 5) * 5),
    objects,
    hints: [`${label} #${p.seed}: ${info.name}, ${count} obstacles${checkpoints.length ? `, ${checkpoints.length} checkpoint${checkpoints.length > 1 ? 's' : ''}` : ''}.`],
    tips,
    // the bot starts with a mover either side, as in the hand-made routes (picking it up off the stand is the pickup test's job)
    bot: {
      broad: kit.broad ?? null,
      run: { cargo: [start.spawn.cargo[0], start.spawn.cargo[1] + 0.03, start.spawn.cargo[2]], yaw: 180, ...(kit.bot ?? {}), path: fineSteps(path, start.spawn.cargo), place: true },
    },
    pieces: used,
  };
}

/** The bot gets a few seconds per waypoint: break long stretches up so slow, careful carries aren't cut short. */
function fineSteps(path: BotStep[], from: Vec3, most = 3.5): BotStep[] {
  const out: BotStep[] = [];
  let px = from[0];
  let pz = from[2];
  for (const st of path) {
    if (!Array.isArray(st)) {
      out.push(st);
      continue;
    }
    const [x, z, form] = st;
    const n = Math.ceil(Math.hypot(x - px, z - pz) / most);
    for (let k = 1; k < n; k++) out.push([+(px + ((x - px) * k) / n).toFixed(3), +(pz + ((z - pz) * k) / n).toFixed(3), form]);
    out.push(st);
    px = x;
    pz = z;
  }
  return out;
}

/** A fresh random job number (six digits, easy to read out). */
export function randomSeed() {
  return 100000 + Math.floor(Math.random() * 900000);
}

/** Today's job: the same for everyone, all day (local date). */
export function dailySeed(d = new Date()) {
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return 100000 + (hashSeed('daily ' + key) % 900000);
}

export { hashSeed };
