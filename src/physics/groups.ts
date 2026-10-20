/**
 * Collision group bits. Rapier packs 16 membership bits and 16 filter bits into
 * one u32: a pair collides when each one's membership is in the other's filter.
 */
export const G = {
  STATIC: 1 << 0,
  PROP: 1 << 1,
  CARGO: 1 << 2,
  P1: 1 << 3,
  P2: 1 << 4,
  P1_ARM: 1 << 5,
  P2_ARM: 1 << 6,
  HAZARD: 1 << 7,
  NPC: 1 << 8,
  SENSOR: 1 << 9,
  DEBRIS: 1 << 10,
  NPC_ARM: 1 << 11,
} as const;

export const ALL = 0xffff;

export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export function playerBodyBit(index: number) {
  return index === 0 ? G.P1 : index === 1 ? G.P2 : G.NPC;
}
export function playerArmBit(index: number) {
  return index === 0 ? G.P1_ARM : index === 1 ? G.P2_ARM : G.NPC_ARM;
}

/** Everything a "solid" thing should bump into. */
export const SOLID = G.STATIC | G.PROP | G.CARGO | G.P1 | G.P2 | G.HAZARD | G.NPC;
/** Things a hand may grab. */
export const GRABBABLE = G.STATIC | G.PROP | G.CARGO | G.P1 | G.P2 | G.NPC;
/** Things you can stand on. */
export const STANDABLE = G.STATIC | G.PROP | G.CARGO | G.P1 | G.P2 | G.HAZARD | G.NPC;
