/**
 * A 2D damped spring for wobbly decorations (antennas, cake tiers, toppers).
 * Feed it the sideways "felt gravity" and it leans and jiggles accordingly.
 */
export class Wobble {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;

  constructor(
    public freq = 3, // Hz
    public damping = 0.15, // ratio
    public limit = 0.8,
  ) {}

  /** `fx, fy` = forcing (e.g. lateral felt gravity / g). */
  step(dt: number, fx: number, fy: number) {
    const w = Math.PI * 2 * this.freq;
    const k = w * w;
    const c = 2 * this.damping * w;
    this.vx += (k * (fx - this.x) - c * this.vx) * dt;
    this.vy += (k * (fy - this.y) - c * this.vy) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const l = Math.hypot(this.x, this.y);
    if (l > this.limit) {
      this.x *= this.limit / l;
      this.y *= this.limit / l;
      this.vx *= 0.5;
      this.vy *= 0.5;
    }
  }

  kick(vx: number, vy: number) {
    this.vx += vx;
    this.vy += vy;
  }
}
