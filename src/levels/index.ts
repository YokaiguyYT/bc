import type { LevelDef } from './types';

/**
 * Every file in ./defs is a level. Adding a level = adding a file that
 * default-exports a LevelDef.
 */
const mods = import.meta.glob<{ default: LevelDef }>('./defs/*.ts', { eager: true });

export const LEVELS: LevelDef[] = Object.values(mods)
  .map((m) => m.default)
  .sort((a, b) => a.order - b.order);

export function levelById(id: string) {
  return LEVELS.find((l) => l.id === id);
}

export const PLAYABLE_LEVELS = LEVELS.filter((l) => !l.hidden);
