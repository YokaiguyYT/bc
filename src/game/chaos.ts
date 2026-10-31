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
  { bit: 2, name: 'Ground & weather', icon: '🌪️', text: 'earthquakes, hurricanes, ice, barrels' },
  { bit: 4, name: 'Weird physics', icon: '🌙', text: 'moon gravity, speed shoes, super jumps' },
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
];

export const chaosLevel = (n: number | undefined) => CHAOS_LEVELS[Math.max(1, Math.min(5, Math.round(n ?? 1))) - 1];
