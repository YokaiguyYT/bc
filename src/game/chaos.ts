import type * as THREE from 'three';
/**
 * Chaos jobs: random courses where crazy things keep happening (see
 * entities/hazards/chaos.ts). How much and what kinds are picked on the Chaos
 * screen; both travel in the job's recipe (GenParams.chaos / chaosMask) so an
 * online guest gets the very same job.
 */

export interface ChaosLevel {
  name: string;
  icon: string;
  /** Seconds between surprises, on average. */
  every: number;
  /** The payout is multiplied by this. */
  pay: number;
  text: string;
}

export const CHAOS_LEVELS: ChaosLevel[] = [
  { name: 'Mild', icon: '🙂', every: 16, pay: 1.25, text: 'A surprise now and then, never too close' },
  { name: 'Wild', icon: '😬', every: 12, pay: 1.5, text: 'Something every few corners' },
  { name: 'Bonkers', icon: '🤪', every: 9, pay: 2, text: 'Hardly a quiet moment' },
  { name: 'Mayhem', icon: '😱', every: 6.5, pay: 2.5, text: 'Constant chaos, aimed right at you' },
  { name: 'ULTRA CHAOS', icon: '💀', every: 4.5, pay: 3, text: 'Everything, all at once, all the time' },
];

export interface ChaosKind {
  bit: number;
  name: string;
  icon: string;
  text: string;
}

export const CHAOS_KINDS: ChaosKind[] = [
  { bit: 1, name: 'From the sky', icon: '☄️', text: 'meteors, beach balls, boxes, money' },
  { bit: 2, name: 'Ground & weather', icon: '🌪️', text: 'earthquakes, hurricanes, ice, barrels, fog' },
  { bit: 4, name: 'Weird physics', icon: '🌙', text: 'moon gravity, speed shoes, super jumps, a UFO' },
  { bit: 8, name: 'Critters', icon: '🐔', text: 'chicken stampedes, chicken rain' },
];

export const ALL_CHAOS = 15;

export interface ChaosEvent {
  id: string;
  /** Which CHAOS_KINDS bit it belongs to. */
  kind: number;
  text: string;
  /** Seconds it lasts. */
  dur: number;
  /** Only from this chaos level up. */
  min?: number;
}

export const CHAOS_EVENTS: ChaosEvent[] = [
  { id: 'meteors', kind: 1, text: '☄️ METEOR SHOWER!', dur: 5 },
  { id: 'balls', kind: 1, text: '🏐 BEACH BALL BARRAGE!', dur: 7 },
  { id: 'boxes', kind: 1, text: "📦 IT'S RAINING BOXES!", dur: 4 },
  { id: 'money', kind: 1, text: '💸 MONEY RAIN! GRAB IT!', dur: 7 },
  { id: 'quake', kind: 2, text: '🌋 EARTHQUAKE!', dur: 5 },
  { id: 'gust', kind: 2, text: '🌪️ HURRICANE!', dur: 5 },
  { id: 'ice', kind: 2, text: '🧊 FLASH FREEZE!', dur: 7 },
  { id: 'barrels', kind: 2, text: '🛢️ ROLLING BARRELS!', dur: 7 },
  { id: 'moon', kind: 4, text: '🌙 MOON GRAVITY!', dur: 8 },
  { id: 'speed', kind: 4, text: '👟 SPEED SHOES!', dur: 7 },
  { id: 'jump', kind: 4, text: '🦘 SUPER JUMPS!', dur: 8 },
  { id: 'stampede', kind: 8, text: '🐔 CHICKEN STAMPEDE!', dur: 6 },
  { id: 'chickenRain', kind: 8, text: "🐔 IT'S RAINING CHICKENS!", dur: 9 },
  { id: 'ufo', kind: 4, text: '🛸 UFO! HOLD ON TO IT!', dur: 7 },
  { id: 'fog', kind: 2, text: '🌫️ PEA-SOUPER FOG!', dur: 10 },
  // (these are played by the companion hazard, entities/hazards/chaos2.ts)
  { id: 'blackout', kind: 2, text: '🌑 BLACKOUT!', dur: 9 },
  { id: 'boulder', kind: 1, text: '🪨 BOULDER! RUN!', dur: 10 },
  { id: 'tornado', kind: 2, text: '🌪️ TORNADO!', dur: 8 },
  { id: 'bananas', kind: 1, text: '🍌 BANANA PEELS!', dur: 14 },
  { id: 'lava', kind: 2, text: '🔥 THE FLOOR IS LAVA!', dur: 9 },
  { id: 'bees', kind: 8, text: '🐝 BEES!!', dur: 8 },
  { id: 'swap', kind: 4, text: '🔁 SWAP!', dur: 2, min: 2 },
  { id: 'mirror', kind: 4, text: '🔄 MIRROR CONTROLS! LEFT IS RIGHT!', dur: 6, min: 5 },
  { id: 'disco', kind: 4, text: '🕺 DISCO! EVERYBODY DANCE!', dur: 5 },
  { id: 'flood', kind: 2, text: '🌊 FLOOD!', dur: 10 },
  { id: 'dino', kind: 8, text: '🦖 DINO STOMP!', dur: 9 },
  { id: 'slowmo', kind: 4, text: '🐌 SLOW-MO!', dur: 3 },
  { id: 'fastfwd', kind: 4, text: '⏩ FAST-FORWARD!', dur: 8 },
];

/** Mayhem and ULTRA: two at once, with a name of their own. */
export const CHAOS_COMBOS: { ids: [string, string]; text: string; min?: number }[] = [
  { ids: ['moon', 'gust'], text: '🌙🌪️ SPACE STORM!' },
  { ids: ['blackout', 'chickenRain'], text: '🌑🐔 CHICKENS IN THE DARK!' },
  { ids: ['ice', 'barrels'], text: '🧊🛢️ BARREL BOBSLED!' },
  { ids: ['speed', 'bananas'], text: '👟🍌 SLIPPERY SPRINT!' },
  { ids: ['flood', 'balls'], text: '🌊🏐 POOL PARTY!' },
  { ids: ['fog', 'boulder'], text: "🌫️🪨 SOMETHING'S COMING…" },
  { ids: ['disco', 'meteors'], text: '🕺☄️ METEOR DISCO!' },
  { ids: ['jump', 'lava'], text: '🦘🔥 HOT HOPS!' },
  { ids: ['tornado', 'boxes'], text: '🌪️📦 BOX TWISTER!' },
  { ids: ['dino', 'quake'], text: '🦖🌋 JURASSIC QUAKE!' },
  { ids: ['slowmo', 'meteors'], text: '🐌☄️ BULLET TIME!' },
  { ids: ['bees', 'fog'], text: '🐝🌫️ ANGRY FOG!' },
  { ids: ['mirror', 'speed'], text: '🔄👟 WRONG WAY, FAST!', min: 5 },
  { ids: ['blackout', 'dino'], text: '🌑🦖 WHAT WAS THAT?!' },
];

/** What a chaos job's director hands to its companion (the newer kinds of chaos). */
export interface ChaosActs {
  handles(id: string): boolean;
  start(id: string, a: { t0: number; t1: number; center: THREE.Vector3; fwd: THREE.Vector3; side: THREE.Vector3 }, help: ChaosHelp): void;
  tick(id: string, now: number, dt: number): void;
  end(id: string): void;
}

export interface ChaosHelp {
  level: number;
  rand(): number;
  /** Floor this far from `c` (or null where there's none). */
  spot(c: THREE.Vector3, rMin: number, rMax: number): THREE.Vector3 | null;
  groundAt(x: number, y: number, z: number): number | null;
  center(): THREE.Vector3;
}

export const chaosLevel = (n: number | undefined) => CHAOS_LEVELS[Math.max(1, Math.min(5, Math.round(n ?? 1))) - 1];
