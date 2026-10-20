import { loadJSON, saveJSON } from '../util/storage';
import type { SessionResult } from './LevelSession';

export interface LevelBest {
  bestPayout: number;
  bestTime: number | null;
  bestCondition: number;
  stars: number;
  completed: boolean;
  attempts: number;
}

type Progress = Record<string, LevelBest>;

const KEY = 'ff.progress.v1';

export function loadProgress(): Progress {
  return loadJSON<Progress>(KEY) ?? {};
}

export function starsFor(r: { success: boolean; condition: number }) {
  if (!r.success) return 0;
  if (r.condition >= 0.9) return 3;
  if (r.condition >= 0.6) return 2;
  return 1;
}

/** Record a finished run; returns which bests were beaten. */
export function recordResult(r: SessionResult) {
  const all = loadProgress();
  const prev: LevelBest = all[r.levelId] ?? { bestPayout: 0, bestTime: null, bestCondition: 0, stars: 0, completed: false, attempts: 0 };
  const next = { ...prev, attempts: prev.attempts + 1 };
  const beat = { payout: false, time: false };
  if (r.success) {
    next.completed = true;
    if (r.payout > prev.bestPayout) {
      next.bestPayout = r.payout;
      beat.payout = prev.completed;
    }
    if (prev.bestTime === null || r.time < prev.bestTime) {
      next.bestTime = r.time;
      beat.time = prev.bestTime !== null;
    }
    next.bestCondition = Math.max(prev.bestCondition, r.condition);
    next.stars = Math.max(prev.stars, starsFor(r));
  }
  all[r.levelId] = next;
  saveJSON(KEY, all);
  return beat;
}

export function totalEarnings() {
  return Object.values(loadProgress()).reduce((s, b) => s + (b.bestPayout || 0), 0);
}
