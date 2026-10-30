import type { CargoKind, GenParams, LevelDef, LevelObject, Vec3 } from '../types';
import { Rng, hashSeed } from './rng';
import { Frame } from './frame';
import { GEN_CARGO, KITS, THEMES } from './kits';
import { Build, BotStep, checkpointPiece, GenCtx, goalPiece, PIECES, startPiece } from './pieces';
import { CARGO_INFO } from '../../entities/cargo/info';
import type { Theme } from '../../render/Renderer';

/**
 * Random jobs: a course made from pieces (ramps, stairs, doors, wrecking
 * balls, traffic, lasers…), picked and arranged by a seed, with checkpoints
 * every few obstacles. The same seed (and cargo) always makes the same job,
 * so a job number can be shared, and online the guest just rebuilds it.
 */

const OPENERS = ['The Long Way to', 'Shortcut Through', 'Rush Hour at', 'Sunday Drive to', 'Express to', 'Detour via', 'Special Delivery to', 'The Scenic Route to', 'Handle With Care at', 'No Refunds at'];
const NIGHT_OPENERS = ['Night Shift at', 'Midnight Run to', 'After Hours at', 'Moonlight Delivery to'];

const CLIENTS = ['Mrs. Patel', 'Mr. Okafor', 'Dr. Lindqvist', 'Grandma Rosa', 'Coach Barnes', 'Professor Ito', 'Aunt Mabel', 'Mayor Quill', 'DJ Sparkle', 'Sir Reginald', 'Little Timmy', 'Ms. Moreau'];
const ORDERS: Partial<Record<CargoKind, string[]>> = {
  tv: ['{who} needs this TV at {place} before kick-off.', '{who} is hosting movie night at {place}. No pressure.', '{who} swears this old TV still works. Get it to {place}.'],
  aquarium: ['{who}’s goldfish want a new view: {place}.', '{who} paid extra for “no spills”. Destination: {place}.', 'The fish is called Gerald. Gerald is moving to {place}.'],
  clock: ['{who}’s grandfather clock has to be at {place} by noon. It says so itself.', '{who} inherited this clock. It’s going to {place}, gently.', 'Tick, tock: {who} is waiting at {place}.'],
  glass: ['{who} ordered one (1) pane of glass for {place}. Not two halves.', '{who}’s new window is waiting at {place}.', 'Glass for {place}. {who} has already bought the putty.'],
  cake: ['{who}’s wedding is at {place}. The cake must get there in one piece.', 'Three tiers, one chance: {who} is waiting at {place}.', '{who} says the cake is the best bit. Get it to {place}.'],
  swan: ['{who}’s ice swan for the gala at {place}. It’s melting as you read this.', '{who} wants the swan at {place} before it turns into a puddle.', 'A chilly delivery for {who} at {place}. Hurry!'],
  egg: ['{who} at {place} is expecting a very rare egg.', 'Don’t drop {who}’s dinosaur egg on the way to {place}.', '{who} has a nest ready at {place}.'],
  piano: ['{who} has a recital at {place} tonight.', '{who}’s piano needs to get to {place}. Mind the slopes.', 'Heavy, loud and precious: {who}’s piano, for {place}.'],
};

/** Some jobs happen at sunset or at night (the look only; the course is the same kind). */
const SUNSET: Partial<Theme> = { sunDir: [-0.75, 0.42, 0.3], skyTop: 0x5a78c8, skyHorizon: 0xffbe8a, fog: 0xffd2a8, sun: 0xffc890, sunIntensity: 2.5, hemiSky: 0xffdcb8, hemiGround: 0x8a6a58, cloudColor: 0xffd8c4 };
const NIGHT: Partial<Theme> = { skyTop: 0x16203a, skyHorizon: 0x3a4670, fog: 0x2a3358, sun: 0xc8d6ff, sunIntensity: 1.6, sunDir: [0.3, 0.85, 0.45], hemiSky: 0xa8b4e0, hemiGround: 0x5a5068, hemiIntensity: 1.1, cloudColor: 0x5a6488, exposure: 1.08 };

/** Extra seconds a hazard costs (waiting for gaps and swings), for par time. */
const WAIT: Record<string, number> = { ball: 6, traffic: 8, lasers: 8, stairs: 4, slalom: 4, door: 2, people: 8, lift: 6, ferry: 8, swing: 2, seesaw: 3 };

export function generateJob(p: GenParams): LevelDef {
  const rng = new Rng(p.seed);
  // always draw the same numbers, then apply any choices given: otherwise naming
  // the cargo (as the online guest's copy does) would shift everything after it
  const rolled = { cargo: rng.pick(GEN_CARGO), theme: rng.pick(THEMES), difficulty: rng.range(0.25, 0.7), extra: rng.range(0, 2), hour: rng.next() };
  const cargo: CargoKind = p.cargo && KITS[p.cargo] ? p.cargo : rolled.cargo;
  const kit = KITS[cargo]!;
  const theme = rolled.theme;
  const difficulty = Math.max(0, Math.min(1, p.difficulty ?? rolled.difficulty));
  const count = p.pieces ?? Math.round(4 + difficulty * 6 + rolled.extra);
  const g: GenCtx = { rng, kit, theme, difficulty, cargo };
  const when = rolled.hour < 0.62 ? 'day' : rolled.hour < 0.84 ? 'sunset' : 'night';
  const opener = rng.pick(OPENERS);
  const lead = when === 'night' ? rng.pick(NIGHT_OPENERS) : opener;
  const place = rng.pick(theme.places);
  const title = `${lead} ${place}`;

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
  // who it's for (drawn last, so it never changes the course)
  const who = rng.pick(CLIENTS);
  const client = rng
    .pick(ORDERS[cargo] ?? ['{who} is waiting at {place}.'])
    .replace('{who}', who)
    .replace('{place}', place);
  return {
    generated: true,
    gen: { seed: p.seed, cargo, difficulty, pieces: count, label },
    id: `gen-${p.seed}-${cargo}`,
    name: title,
    tagline: `${label} #${p.seed}`,
    order: 1000,
    hidden: true,
    cargo,
    theme: { ...theme.sky, ...(when === 'sunset' ? SUNSET : when === 'night' ? NIGHT : {}) },
    cameraYaw: 0,
    spawn: start.spawn,
    goal: fin.goal,
    checkpoints,
    killY: low - 7,
    parTime: Math.max(45, Math.round(par / 5) * 5),
    objects,
    hints: [client, `${label} #${p.seed}: ${info.name}, ${count} obstacles${checkpoints.length ? `, ${checkpoints.length} checkpoint${checkpoints.length > 1 ? 's' : ''}` : ''}${when === 'day' ? '' : when === 'night' ? ', at night' : ', at sunset'}.`],
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
      // a ride (the cable car) carries the load on: carry on from where it lands, not back from where it got on
      const land = (st as { land?: [number, number] }).land;
      if (land) [px, pz] = land;
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
