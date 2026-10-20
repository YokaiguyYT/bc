import type { LevelSession } from '../game/LevelSession';

export type UiSound = 'move' | 'select' | 'back' | 'pause';
export type Sfx = 'payout' | 'fail';
export type Track = 'menu' | 'level' | 'none';

/** Placeholder; the real synth engine is filled in later. */
export class AudioEngine {
  unlock() {}
  setVolumes(_master: number, _music: number, _sfx: number) {}
  music(_t: Track) {}
  ui(_s: UiSound) {}
  sfx(_s: Sfx) {}
  attach(_s: LevelSession) {}
  update(_dt: number, _s: LevelSession | null) {}
}
