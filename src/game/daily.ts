import type { CargoKind } from '../levels/types';
import { hashSeed, TWISTS } from '../levels/gen/generate';
import { loadJSON, saveJSON } from '../util/storage';

/**
 * Today's job, the Wordle way: one numbered course a day for everyone, with a
 * twist, a streak of days delivered, a week at a glance, and a result to copy
 * and paste into the group chat (no server: the same date makes the same job
 * on every laptop).
 */

/** Daily #1 was 31 October 2026 (local dates, like the course itself). */
const EPOCH = Date.UTC(2026, 9, 31);
const DAY = 86400000;

const localDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

export function dailyNumber(d = new Date()) {
  return Math.round((localDay(d) - EPOCH) / DAY) + 1;
}

/** Today's twist (one of TWISTS), the same for everyone. */
export function dailyTwist(d = new Date()) {
  const keys = Object.keys(TWISTS);
  return keys[hashSeed(`twist ${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`) % keys.length];
}

export interface DayResult {
  delivered: boolean;
  /** 0..1 */
  condition: number;
  time: number;
  payout: number;
  stars: number;
  cargo: CargoKind;
  /** One square per stretch of the course (see StretchTracker). */
  squares: string;
  twist: string | null;
}

interface Store {
  days: Record<number, DayResult>;
  /** Goes at each day's job (like Wordle's guesses). */
  tries?: Record<number, number>;
}

const KEY = 'ff.daily';
const load = (): Store => loadJSON<Store>(KEY) ?? { days: {} };

export function todaysResult(d = new Date()): DayResult | null {
  return load().days[dailyNumber(d)] ?? null;
}

/** Keep the day's best go: a delivery beats none, then the bigger payout. */
export function recordDaily(r: DayResult, d = new Date()) {
  const s = load();
  const n = dailyNumber(d);
  const old = s.days[n];
  const better = !old || (r.delivered && !old.delivered) || (r.delivered === old.delivered && r.payout > old.payout);
  if (better) s.days[n] = r;
  s.tries = { ...(s.tries ?? {}), [n]: (s.tries?.[n] ?? 0) + 1 };
  saveJSON(KEY, s);
  return better;
}

/** Days in a row with a delivery, up to today (or yesterday, while today is still to play); and the longest ever. */
export function streak(d = new Date()) {
  const s = load();
  const today = dailyNumber(d);
  const ok = (n: number) => !!s.days[n]?.delivered;
  let n = ok(today) ? today : today - 1;
  let current = 0;
  while (ok(n)) {
    current++;
    n--;
  }
  let best = 0;
  let run = 0;
  const nums = Object.keys(s.days)
    .map(Number)
    .sort((a, b) => a - b);
  let prev = -99;
  for (const k of nums) {
    run = ok(k) ? (k === prev + 1 ? run + 1 : 1) : 0;
    if (ok(k)) prev = k;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current) };
}

/** The last seven days, oldest first: delivered, tried, or not played. */
export function lastWeek(d = new Date()): ('done' | 'tried' | 'none')[] {
  const s = load();
  const today = dailyNumber(d);
  return Array.from({ length: 7 }, (_, i) => {
    const r = s.days[today - 6 + i];
    return r ? (r.delivered ? 'done' : 'tried') : 'none';
  });
}

/** How many goes at today's job so far. */
export function triesToday(d = new Date()) {
  return load().tries?.[dailyNumber(d)] ?? 0;
}

/** Time until tomorrow's job, like "5h 12m". */
export function untilNext(d = new Date()) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const m = Math.max(1, Math.round((next.getTime() - d.getTime()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** The result as text to paste anywhere (no spoilers: just how it went, stretch by stretch). */
export function shareText(r: DayResult, cargoLine: string, d = new Date()) {
  const t = r.twist ? TWISTS[r.twist] : null;
  const st = streak(d);
  const mins = Math.floor(r.time / 60);
  const secs = String(Math.floor(r.time % 60)).padStart(2, '0');
  const head = `Fragile Freight · Daily #${dailyNumber(d)}${t ? ` ${t.icon}` : ''}`;
  const how = r.delivered ? `${cargoLine} · ${Math.round(r.condition * 100)}% · ${mins}:${secs} ${'⭐'.repeat(r.stars)}` : `${cargoLine} · 💥 didn't make it`;
  const tries = triesToday(d);
  const goes = !r.delivered || !tries ? '' : tries === 1 ? ' · 🎯 first try' : ` · ${tries} tries`;
  const tail = `💵 $${r.payout.toLocaleString('en-US')}${goes}${st.current > 1 ? ` · 🔥 ${st.current} days` : ''}`;
  return [head, how, r.squares, tail].join('\n');
}

/**
 * Health stretch by stretch for the share card: the course's stretches start
 * at known points (LevelDef.stretches), so note the cargo's health as it gets
 * near each one.
 */
export class StretchTracker {
  private reached = 0;
  private health: number[] = [1];

  constructor(private pts: [number, number][]) {}

  update(x: number, z: number, health: number) {
    // near any later stretch's start counts as passing it (and any it skipped on the way)
    for (let k = this.pts.length - 1; k > this.reached; k--) {
      const [px, pz] = this.pts[k];
      if (Math.hypot(x - px, z - pz) > 3.5) continue;
      for (let i = this.reached + 1; i <= k; i++) this.health[i] = health;
      this.reached = k;
      return;
    }
  }

  /** 🟩 barely a scratch · 🟨 a few knocks · 🟥 took a beating · 💥 broke here · ⬜ never got there. */
  squares(endHealth: number, delivered: boolean, broken: boolean) {
    const n = Math.max(1, this.pts.length - 1);
    const h = [...this.health];
    if (delivered) for (let i = this.reached + 1; i <= n; i++) h[i] = endHealth;
    let out = '';
    for (let i = 0; i < n; i++) {
      if (h[i + 1] === undefined) {
        // the stretch it broke on, then the ones it never got to
        out += broken && i === this.reached ? '💥' : '⬜';
        continue;
      }
      const loss = (h[i] ?? 1) - h[i + 1];
      out += loss < 0.02 ? '🟩' : loss < 0.1 ? '🟨' : '🟥';
    }
    return out;
  }
}
