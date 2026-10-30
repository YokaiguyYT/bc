/** Small seeded random numbers (mulberry32): the same seed always makes the same job. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  /** 0 ≤ x < 1 */
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
  /** Pick by weight. */
  weighted<T>(list: readonly { w: number; v: T }[]): T {
    const total = list.reduce((a, b) => a + b.w, 0);
    let r = this.next() * total;
    for (const e of list) {
      r -= e.w;
      if (r <= 0) return e.v;
    }
    return list[list.length - 1].v;
  }
  /** A new independent stream (so adding a decoration doesn't change the course). */
  fork(salt: number) {
    return new Rng((this.next() * 4294967296) ^ Math.imul(salt + 1, 0x9e3779b1));
  }
}

/** A seed from text (a date, a code someone typed). */
export function hashSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
