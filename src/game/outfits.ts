import { loadJSON, saveJSON } from '../util/storage';
import { loadProgress, totalEarnings } from './progress';

/**
 * What the movers wear, what's for sale in the Locker, and the quests that
 * unlock the rest. Cash comes from deliveries (every mode); quests from
 * playing (see `track`). Everything is local to this laptop; online, each
 * laptop brings its own mover's outfit.
 */

export interface Outfit {
  color: string;
  hat: string;
  face: string;
  back: string;
}

export type Slot = 'color' | 'hat' | 'face' | 'back';

export interface Item {
  name: string;
  /** Price in the Locker, or 0 if it's free from the start. */
  price: number;
  /** Won from this quest instead of bought. */
  quest?: string;
  /** Colours: the mover's body colour. */
  hex?: number;
  icon: string;
}

export const ITEMS: Record<Slot, Record<string, Item>> = {
  color: {
    orange: { name: 'Mover orange', price: 0, hex: 0xff7a3d, icon: '🟧' },
    blue: { name: 'Mover blue', price: 0, hex: 0x3d9bff, icon: '🟦' },
    green: { name: 'Leaf green', price: 300, hex: 0x4cc46a, icon: '🟩' },
    purple: { name: 'Grape', price: 300, hex: 0x9a6bff, icon: '🟪' },
    pink: { name: 'Bubblegum', price: 300, hex: 0xff7ab8, icon: '🌸' },
    yellow: { name: 'Banana', price: 300, hex: 0xffcf3d, icon: '🟨' },
    red: { name: 'Fire-truck red', price: 600, hex: 0xe8433b, icon: '🟥' },
    teal: { name: 'Lagoon', price: 600, hex: 0x2bbfb3, icon: '🌊' },
    white: { name: 'Snowball', price: 900, hex: 0xf3f1ec, icon: '⬜' },
    black: { name: 'Midnight', price: 900, hex: 0x3a3a46, icon: '⬛' },
    gold: { name: 'Solid gold', price: 0, quest: 'alljobs', hex: 0xe5b53a, icon: '🥇' },
  },
  hat: {
    cap: { name: 'Mover cap', price: 0, icon: '🧢' },
    none: { name: 'No hat', price: 0, icon: '🙂' },
    beanie: { name: 'Beanie', price: 400, icon: '🧶' },
    cowboy: { name: 'Cowboy hat', price: 900, icon: '🤠' },
    tophat: { name: 'Top hat', price: 1500, icon: '🎩' },
    chef: { name: 'Chef hat', price: 1200, icon: '👨‍🍳' },
    wizard: { name: 'Wizard hat', price: 2500, icon: '🧙' },
    propeller: { name: 'Propeller cap', price: 0, quest: 'streak3', icon: '🚁' },
    party: { name: 'Party hat', price: 0, quest: 'first', icon: '🥳' },
    hardhat: { name: 'Hard hat', price: 0, quest: 'five', icon: '👷' },
    crown: { name: 'Crown', price: 0, quest: 'stars', icon: '👑' },
    viking: { name: 'Viking helmet', price: 0, quest: 'shift5', icon: '⚔️' },
  },
  face: {
    none: { name: 'Nothing', price: 0, icon: '🙂' },
    shades: { name: 'Shades', price: 0, quest: 'tips', icon: '😎' },
    mustache: { name: 'Mustache', price: 500, icon: '🥸' },
    monocle: { name: 'Monocle', price: 800, icon: '🧐' },
    nose: { name: 'Clown nose', price: 400, icon: '🤡' },
    goggles: { name: 'Chaos goggles', price: 0, quest: 'chaos', icon: '🥽' },
  },
  back: {
    none: { name: 'Nothing', price: 0, icon: '🙂' },
    backpack: { name: 'Backpack', price: 700, icon: '🎒' },
    cape: { name: 'Cape', price: 1800, icon: '🦸' },
    scarf: { name: 'Friendship scarf', price: 0, quest: 'online', icon: '🧣' },
    wings: { name: 'Angel wings', price: 0, quest: 'flawless', icon: '🪽' },
  },
};

export const SLOTS: { slot: Slot; name: string }[] = [
  { slot: 'color', name: 'Colour' },
  { slot: 'hat', name: 'Hat' },
  { slot: 'face', name: 'Face' },
  { slot: 'back', name: 'On the back' },
];

export const DEFAULT_OUTFITS: [Outfit, Outfit] = [
  { color: 'orange', hat: 'cap', face: 'none', back: 'none' },
  { color: 'blue', hat: 'cap', face: 'none', back: 'none' },
];

/** Things the game counts for quests. */
export interface Stats {
  deliveries: number;
  flawless: number;
  tips: number;
  dailies: number;
  bestShift: number;
  online: number;
  chaos: number;
  /** Hand-made jobs delivered, and with three stars. */
  jobs: string[];
  threeStars: string[];
}

export interface Quest {
  id: string;
  name: string;
  text: string;
  /** Progress toward it: [done, needed]. */
  progress(s: Stats, streak: number): [number, number];
}

/** Hand-made jobs (not counting the Practice Yard): set by the level list at start. */
let jobCount = 10;
export function setJobCount(n: number) {
  jobCount = n;
}

export const QUESTS: Quest[] = [
  { id: 'first', name: 'First day on the job', text: 'Deliver anything', progress: (s) => [Math.min(1, s.deliveries), 1] },
  { id: 'five', name: 'Regular', text: 'Deliver 5 jobs (any kind)', progress: (s) => [Math.min(5, s.deliveries), 5] },
  { id: 'tips', name: 'Big tipper', text: 'Pocket 25 tips', progress: (s) => [Math.min(25, s.tips), 25] },
  { id: 'flawless', name: 'Not a scratch', text: 'Deliver 3 jobs at 100%', progress: (s) => [Math.min(3, s.flawless), 3] },
  { id: 'streak3', name: 'Every day', text: "Deliver today's job 3 days in a row", progress: (_s, streak) => [Math.min(3, streak), 3] },
  { id: 'shift5', name: 'Long shift', text: 'Deliver 5 jobs in one endless shift', progress: (s) => [Math.min(5, s.bestShift), 5] },
  { id: 'stars', name: 'Five-star movers', text: 'Get three stars on 5 hand-made jobs', progress: (s) => [Math.min(5, s.threeStars.length), 5] },
  { id: 'alljobs', name: 'Seen it all', text: 'Deliver every hand-made job', progress: (s) => [Math.min(jobCount, s.jobs.length), jobCount] },
  { id: 'online', name: 'Long-distance friends', text: 'Deliver a job online', progress: (s) => [Math.min(1, s.online), 1] },
  { id: 'chaos', name: 'Agent of chaos', text: 'Deliver a chaos job on Ultra', progress: (s) => [Math.min(1, s.chaos), 1] },
];

// ---------------------------------------------------------------- storage

interface Wardrobe {
  cash: number;
  owned: string[];
  outfits: [Outfit, Outfit];
  /** Quests already celebrated (their reward handed over). */
  done: string[];
}

const KEY = 'ff.wardrobe';
const STATS = 'ff.stats';
const id = (slot: Slot, item: string) => `${slot}:${item}`;

function fresh(startCash: number): Wardrobe {
  return { cash: startCash, owned: [], outfits: [{ ...DEFAULT_OUTFITS[0] }, { ...DEFAULT_OUTFITS[1] }], done: [] };
}

export function loadWardrobe(): Wardrobe {
  const w = loadJSON<Wardrobe>(KEY);
  if (!w) {
    // the first time: what this laptop earned before the Locker existed goes in the wallet
    const n = fresh(totalEarnings());
    saveJSON(KEY, n);
    return n;
  }
  // anything unknown (an older or newer version) falls back to the defaults
  w.outfits = [0, 1].map((i) => {
    const o = { ...DEFAULT_OUTFITS[i], ...(w.outfits?.[i] ?? {}) };
    for (const { slot } of SLOTS) if (!ITEMS[slot][o[slot]]) o[slot] = DEFAULT_OUTFITS[i][slot];
    return o;
  }) as [Outfit, Outfit];
  return { ...fresh(0), ...w };
}

function saveWardrobe(w: Wardrobe) {
  saveJSON(KEY, w);
}

export function loadStats(): Stats {
  const base: Stats = { deliveries: 0, flawless: 0, tips: 0, dailies: 0, bestShift: 0, online: 0, chaos: 0, jobs: [], threeStars: [] };
  const saved = loadJSON<Partial<Stats>>(STATS);
  if (saved) return { ...base, ...saved };
  // the first time: count what this laptop did before the Locker existed
  const prog = loadProgress();
  for (const [id, b] of Object.entries(prog)) {
    if (!b?.completed) continue;
    base.deliveries++;
    if (b.bestCondition >= 0.995) base.flawless++;
    if (id === 'playground' || id.startsWith('daily')) continue;
    base.jobs.push(id);
    if (b.stars >= 3) base.threeStars.push(id);
  }
  saveJSON(STATS, base);
  return base;
}

export function owns(w: Wardrobe, slot: Slot, item: string) {
  const it = ITEMS[slot][item];
  if (!it) return false;
  if (it.price === 0 && !it.quest) return true;
  if (it.quest) return w.done.includes(it.quest);
  return w.owned.includes(id(slot, item));
}

/** Buy something (if there's the cash); true if it's now owned. */
export function buy(slot: Slot, item: string) {
  const w = loadWardrobe();
  const it = ITEMS[slot][item];
  if (!it || owns(w, slot, item)) return true;
  if (it.quest || w.cash < it.price) return false;
  w.cash -= it.price;
  w.owned.push(id(slot, item));
  saveWardrobe(w);
  return true;
}

export function wear(player: 0 | 1, slot: Slot, item: string) {
  const w = loadWardrobe();
  if (!owns(w, slot, item)) return false;
  w.outfits[player] = { ...w.outfits[player], [slot]: item };
  saveWardrobe(w);
  return true;
}

/** An outfit from somewhere else (the other laptop): anything unknown becomes the default. */
export function cleanOutfit(o: unknown, player: 0 | 1): Outfit {
  const d = DEFAULT_OUTFITS[player];
  const src = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const out = { ...d };
  for (const { slot } of SLOTS) {
    const v = src[slot];
    if (typeof v === 'string' && ITEMS[slot][v]) out[slot] = v;
  }
  return out;
}

/** Online host: the guest's mover (P2). Online guest: the pair the host built the job with. */
let guest: Outfit | null = null;
let fixed: [Outfit, Outfit] | null = null;
export function setGuestOutfit(o: unknown | null) {
  guest = o ? cleanOutfit(o, 1) : null;
}
export function setActiveOutfits(o: unknown[] | null) {
  fixed = o ? [cleanOutfit(o[0], 0), cleanOutfit(o[1], 1)] : null;
}
/** What the movers wear in the next job: this laptop's pair, or (online) the host's mover and the guest's. */
export function activeOutfits(): [Outfit, Outfit] {
  if (fixed) return fixed;
  const own = loadWardrobe().outfits;
  if (!guest) return own;
  // the two movers mustn't look the same
  const g = { ...guest };
  if (g.color === own[0].color) g.color = own[0].color === 'blue' ? 'orange' : 'blue';
  return [own[0], g];
}

export interface Payday {
  cash: number;
  /** Quests finished just now, with what they unlocked. */
  quests: { quest: Quest; item: { slot: Slot; id: string; item: Item } | null }[];
}

/** After a job: count it, pay the payout into the wallet, and hand over any quest rewards. */
export function track(
  r: { success: boolean; payout: number; condition: number; tipCount: number; stars: number },
  job: { kind: string; levelId?: string; online?: boolean; chaos?: number; shiftRound?: number; daily?: boolean },
  streak: number,
): Payday {
  const s = loadStats();
  if (r.success) {
    s.deliveries++;
    if (r.condition >= 0.995) s.flawless++;
    s.tips += r.tipCount;
    if (job.daily) s.dailies++;
    if (job.shiftRound) s.bestShift = Math.max(s.bestShift, job.shiftRound);
    if (job.online) s.online++;
    if ((job.chaos ?? 0) >= 5) s.chaos++;
    if (job.kind === 'level' && job.levelId && job.levelId !== 'playground') {
      if (!s.jobs.includes(job.levelId)) s.jobs.push(job.levelId);
      if (r.stars >= 3 && !s.threeStars.includes(job.levelId)) s.threeStars.push(job.levelId);
    }
  }
  saveJSON(STATS, s);
  const w = loadWardrobe();
  if (r.success) w.cash += r.payout;
  saveWardrobe(w);
  return { cash: r.success ? r.payout : 0, quests: claimQuests(streak) };
}

/** Hand over the prizes of quests finished since last time (each just once). */
export function claimQuests(streak: number): Payday['quests'] {
  const s = loadStats();
  const w = loadWardrobe();
  const quests: Payday['quests'] = [];
  for (const q of QUESTS) {
    if (w.done.includes(q.id)) continue;
    const [d, n] = q.progress(s, streak);
    if (d < n) continue;
    w.done.push(q.id);
    quests.push({ quest: q, item: rewardOf(q.id) });
  }
  if (quests.length) saveWardrobe(w);
  return quests;
}

export function rewardOf(quest: string) {
  for (const { slot } of SLOTS)
    for (const [k, it] of Object.entries(ITEMS[slot])) if (it.quest === quest) return { slot, id: k, item: it };
  return null;
}
