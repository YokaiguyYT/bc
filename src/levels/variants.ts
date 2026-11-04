import type { GoalDef, LevelDef, Variant } from './types';
import type { Theme } from '../render/Renderer';

/**
 * Hand-made jobs come out a bit different each play: the time of day and,
 * for some, rain or snow (LevelDef.variety). Random jobs use the same looks.
 */

export const SUNSET: Partial<Theme> = { sunDir: [-0.75, 0.42, 0.3], skyTop: 0x5a78c8, skyHorizon: 0xffbe8a, fog: 0xffd2a8, sun: 0xffc890, sunIntensity: 2.5, hemiSky: 0xffdcb8, hemiGround: 0x8a6a58, cloudColor: 0xffd8c4 };
export const NIGHT: Partial<Theme> = { skyTop: 0x16203a, skyHorizon: 0x3a4670, fog: 0x2a3358, sun: 0xc8d6ff, sunIntensity: 1.6, sunDir: [0.3, 0.85, 0.45], hemiSky: 0xa8b4e0, hemiGround: 0x5a5068, hemiIntensity: 1.1, cloudColor: 0x5a6488, exposure: 1.08 };
export const RAIN: Partial<Theme> = { skyTop: 0x5d6976, skyHorizon: 0xa6b0ba, fog: 0x9ea8b2, sunIntensity: 1.3, hemiIntensity: 0.95, cloudColor: 0x8a929a };
export const SNOW: Partial<Theme> = { skyTop: 0x8fa4bc, skyHorizon: 0xe2e8ee, fog: 0xdfe5ec, sunIntensity: 1.8, cloudColor: 0xe8ecf0 };

/** Pick this play's look (null: the job doesn't vary). */
export function rollVariant(def: LevelDef, rand = Math.random): Variant | null {
  const v = def.variety;
  if (!v) return null;
  const times = v.times ?? ['day'];
  // mostly day, sometimes sunset, now and then night
  const r = rand();
  const want = r < 0.55 ? 'day' : r < 0.8 ? 'sunset' : 'night';
  const time = times.includes(want) ? want : times[0];
  const weather = v.weather?.length && rand() < 0.35 ? v.weather[Math.floor(rand() * v.weather.length)] : null;
  return { time, weather };
}

/** The job as it looks in this variant. */
export function withVariant(def: LevelDef, v: Variant): LevelDef {
  const time = v.time === 'sunset' ? SUNSET : v.time === 'night' ? NIGHT : {};
  const sky = v.weather === 'rain' ? RAIN : v.weather === 'snow' ? SNOW : {};
  const words = [v.time === 'night' ? '🌙 at night' : v.time === 'sunset' ? '🌇 at sunset' : '', v.weather === 'rain' ? '🌧️ in the rain (wet floors are slippery)' : v.weather === 'snow' ? '🌨️ in the snow' : ''].filter(Boolean);
  return {
    ...def,
    variant: v,
    theme: { ...(def.theme ?? {}), ...time, ...sky },
    ...(v.weather ? { weather: v.weather } : {}),
    hints: words.length ? [`This time: ${words.join(', ')}.`, ...(def.hints ?? [])] : def.hints,
  };
}

/** What a bonus goal asks, in words. */
export function goalText(g: GoalDef) {
  if (g.kind === 'nofalls') return '🦶 No falls';
  if (g.kind === 'under') return `⏱️ Under ${Math.floor(g.s / 60)}:${String(Math.round(g.s % 60)).padStart(2, '0')}`;
  return `✨ Keep it above ${Math.round(g.c * 100)}%`;
}

/** Whether a delivery met a goal. */
export function goalMet(g: GoalDef, r: { success: boolean; falls: number; time: number; condition: number }) {
  if (!r.success) return false;
  if (g.kind === 'nofalls') return r.falls === 0;
  if (g.kind === 'under') return r.time < g.s;
  return r.condition >= g.c;
}

/** Stable id for a level's goal (to remember which were met). */
export const goalId = (level: string, i: number) => `${level}#${i}`;
