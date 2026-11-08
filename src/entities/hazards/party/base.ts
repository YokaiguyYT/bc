import * as THREE from 'three';
import type { Sim } from '../../../game/Sim';
import type { HazardObj } from '../../../levels/types';
import type { BuiltLevel } from '../../../levels/LevelBuilder';
import type { Player } from '../../Player';
import type { Hazard } from '../registry';
import { num } from '../common';

export type Phase = 'ready' | 'play' | 'point' | 'over';
const PHASES: Phase[] = ['ready', 'play', 'point', 'over'];
/** step(): nobody has won the round yet. */
export const ON = -2;

const _a = new THREE.Vector3();

/**
 * A 1v1 party game, run as the arena's one hazard: rounds, a score, a clock,
 * a countdown, the computer player, and the shoving everybody can do.
 *
 * The host runs it (preStep); the online guest only shows it, from netState
 * (the numbers) and game events (the banners). Bodies it moves are made up
 * front, in the same order on both laptops, so the guest's copies follow the
 * host's snapshots like any other moving thing.
 */
export abstract class PartyGame implements Hazard {
  readonly isParty = true;
  score: [number, number] = [0, 0];
  round = 0;
  phase: Phase = 'ready';
  phaseT = 0;
  /** Seconds left in this round (round games with a clock), and in the whole game (football). */
  clock = 0;
  gameClock = 0;
  /** The round's winner while a point is shown, the game's once it's over; -1 a draw. */
  winner = -1;
  /** First to this many. */
  target: number;
  /** P2 is the computer: 0 no, 1 easy, 2 normal, 3 hard. */
  cpu = 0;
  /** Per-game numbers for the scoreboard (tiles painted, cash in the truck). */
  tally: [number, number] = [0, 0];
  /** What the round clock does: 'none', 'down' (time's up decides by the tally). */
  protected roundTime: number;
  /** Football: one clock for the whole game (0: none); then a golden goal if level. */
  protected gameTime: number;
  /** Belly bumps: running into the other mover shoves them (on unless a game says not). */
  protected bumps = true;
  protected readyTime = 3;
  protected pointTime = 2.6;
  protected readonly root = new THREE.Group();
  private started = false;
  private lastCount = 0;
  private bumpAt = [-9, -9];
  private golden = false;

  constructor(
    protected o: HazardObj,
    protected sim: Sim,
    protected level: BuiltLevel,
  ) {
    sim.scene.add(this.root);
    this.target = Math.max(1, Math.round(num(o.params, 'target', 3)));
    this.roundTime = num(o.params, 'time', 0);
    this.gameTime = num(o.params, 'gameTime', 0);
  }

  /** The game's name on the scoreboard. */
  abstract readonly title: string;
  /** Put everything back for a new round (host). */
  protected abstract setup(): void;
  /** Each physics step of a round (host): the round's winner (0, 1, -1 a draw) or ON. */
  protected abstract step(dt: number, now: number): number;
  /** The computer's moves for P2, each frame while a round is on. */
  protected abstract cpuMove(me: Player, foe: Player, dt: number): void;
  /** What happens between rounds and after (a ball still rolling, a fuse still lit): each physics step. */
  protected idle(_dt: number, _now: number) {}
  /** Clock ran out: who won. */
  protected timeUp(): number {
    return this.tally[0] > this.tally[1] ? 0 : this.tally[1] > this.tally[0] ? 1 : -1;
  }
  /** The banner when a round's won (`w` -1 for a draw). */
  protected roundText(w: number): string {
    return w < 0 ? 'DRAW!' : `${this.name(w)} WINS THE ROUND!`;
  }
  /** For the results card: the last round's numbers (cash in the trucks, tiles painted), if they say more than the score. */
  finalLine(): string {
    return '';
  }
  /** A line under the score (whose turn, what to do). */
  line(): string {
    return '';
  }
  /** The scoreboard shows the tally (tiles, cash) instead of rounds won. */
  showTally(): string | null {
    return null;
  }
  /** Extra numbers to send the guest, and taking them. */
  protected netExtra(): number[] {
    return [];
  }
  protected applyExtra(_v: number[]) {}
  /** What else the camera should keep in view (the ball, the load). */
  focus(): THREE.Vector3[] {
    return [];
  }
  /** Looks, every rendered frame (both laptops). */
  protected looks(_dt: number, _time: number) {}

  get players(): Player[] {
    return this.sim.players ?? [];
  }
  name(i: number) {
    return i === 1 && this.cpu ? 'CPU' : `P${i + 1}`;
  }
  /** How good the computer is (0..1). */
  protected get skill() {
    return [0, 0.62, 0.84, 1][this.cpu] ?? 0.84;
  }

  protected say(text: string, small = false, who?: number) {
    this.sim.events.emit('party', { text, small, who });
  }

  /** Put a mover here, facing yaw (radians; 0 = +z). */
  protected place(i: number, x: number, y: number, z: number, yaw: number) {
    const p = this.players[i];
    if (!p) return;
    p.teleport(_a.set(x, y, z), yaw);
    p.speedScale = 1;
    this.sim.physics.snapLinks();
  }

  /** The computer walks toward a spot (k: how keen, 0..1). */
  protected steer(p: Player, x: number, z: number, k = 1) {
    const dx = x - p.bodyPos.x;
    const dz = z - p.bodyPos.z;
    const l = Math.hypot(dx, dz);
    const s = l < 0.08 ? 0 : Math.min(1, l * 2) * k * (0.55 + 0.45 * this.skill);
    p.intent.moveX = l > 1e-6 ? (dx / l) * s : 0;
    p.intent.moveZ = l > 1e-6 ? (dz / l) * s : 0;
  }

  // ---------------------------------------------------------------- the rounds (host)

  private newRound() {
    this.round++;
    this.winner = -1;
    this.clock = this.roundTime;
    this.tally = [0, 0];
    this.setup();
    this.phase = 'ready';
    this.phaseT = 0;
    this.lastCount = 0;
    if (this.round > 1 || this.target > 1) this.say(this.target === 1 ? this.title.toUpperCase() : `ROUND ${this.round}`, true);
  }

  private endRound(w: number) {
    this.winner = w;
    if (w >= 0) {
      this.score[w]++;
      const p = this.players[w];
      if (p) this.sim.events.emit('partyPoint', { who: w, pos: p.bodyPos.clone() });
    }
    this.phase = 'point';
    this.phaseT = 0;
    this.say(this.roundText(w), false, w >= 0 ? w : undefined);
  }

  private over(w: number) {
    this.phase = 'over';
    this.phaseT = 0;
    this.winner = w;
    this.say(w < 0 ? 'IT’S A DRAW!' : `${this.name(w)} WINS!`, false, w >= 0 ? w : undefined);
    if (w >= 0) {
      const p = this.players[w];
      if (p) this.sim.events.emit('partyPoint', { who: w, pos: p.bodyPos.clone() });
    }
  }

  preStep(dt: number) {
    const now = this.sim.time();
    if (!this.started) {
      this.started = true;
      this.gameClock = this.gameTime;
      this.newRound();
    }
    this.phaseT += dt;
    switch (this.phase) {
      case 'ready': {
        const left = Math.ceil(this.readyTime - this.phaseT);
        if (left !== this.lastCount && left > 0 && left <= 3) this.say(String(left));
        this.lastCount = left;
        if (this.phaseT >= this.readyTime) {
          this.phase = 'play';
          this.phaseT = 0;
          this.say('GO!');
        }
        this.idle(dt, now);
        break;
      }
      case 'play': {
        if (this.roundTime > 0) this.clock = Math.max(0, this.clock - dt);
        if (this.gameTime > 0 && !this.golden) this.gameClock = Math.max(0, this.gameClock - dt);
        const w = this.step(dt, now);
        if (w !== ON) this.endRound(w);
        else if (this.roundTime > 0 && this.clock <= 0) this.endRound(this.timeUp());
        else if (this.gameTime > 0 && !this.golden && this.gameClock <= 0) {
          if (this.score[0] === this.score[1]) {
            this.golden = true;
            this.say('GOLDEN GOAL!', false);
          } else this.over(this.score[0] > this.score[1] ? 0 : 1);
        }
        if (this.bumps) this.bump(now);
        break;
      }
      case 'point':
        this.idle(dt, now);
        if (this.bumps) this.bump(now);
        if (this.phaseT >= this.pointTime) {
          const top = this.score[0] >= this.target ? 0 : this.score[1] >= this.target ? 1 : -2;
          if (top >= 0) this.over(top);
          else if (this.golden && this.score[0] !== this.score[1]) this.over(this.score[0] > this.score[1] ? 0 : 1);
          else this.newRound();
        }
        break;
      case 'over':
        this.idle(dt, now);
        break;
    }
  }

  /** Belly bumps: whoever runs into the other faster shoves them away (hard enough, over). */
  private bump(now: number) {
    const [a, b] = this.players;
    if (!a || !b || a.state !== 'active' || b.state !== 'active') return;
    const dx = b.bodyPos.x - a.bodyPos.x;
    const dz = b.bodyPos.z - a.bodyPos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.95 || d < 1e-4 || Math.abs(a.bodyPos.y - b.bodyPos.y) > 1.1) return;
    const nx = dx / d;
    const nz = dz / d;
    // how fast each is going at the other
    const va = a.bodyVel.x * nx + a.bodyVel.z * nz;
    const vb = -(b.bodyVel.x * nx + b.bodyVel.z * nz);
    const rel = va + vb;
    if (rel < 2.6) return;
    const hitter = va >= vb ? 0 : 1;
    if (now - this.bumpAt[hitter] < 0.7) return;
    this.bumpAt[hitter] = now;
    const victim = this.players[1 - hitter];
    const me = this.players[hitter];
    const sx = hitter === 0 ? nx : -nx;
    const sz = hitter === 0 ? nz : -nz;
    const k = 3.2 + (rel - 2.6) * 2.2;
    victim.applyBlast(_a.set(sx * k, 2.2, sz * k).multiplyScalar(victim.totalMass));
    me.applyBlast(_a.set(-sx * 1.2, 0, -sz * 1.2).multiplyScalar(me.totalMass));
    if (rel > 4.6) victim.knock(rel * 2);
    this.sim.shake?.(Math.min(0.35, rel * 0.05));
    this.sim.fx?.burst('star', victim.bodyPos.clone().setY(victim.bodyPos.y + 0.5), { count: 7, speed: 2.4, up: 2, size: 0.09, life: 0.8, gravity: 6, colors: [0xffffff, 0xffe14a] });
  }

  /** Each frame (host), after the keys and the computer: a game's own use of them (tug of war's heave). */
  protected frameHook(_dt: number) {}

  /** Each frame (host): freeze everybody for the countdown, and drive the computer player. */
  drive(dt: number) {
    const ps = this.players;
    if (this.phase === 'ready' && this.started) {
      for (const p of ps) {
        p.intent.moveX = p.intent.moveZ = 0;
        p.intent.jump = p.intent.jumpPressed = false;
        p.intent.grab = false;
      }
      return;
    }
    if (this.cpu && ps[1] && ps[0]) {
      const me = ps[1];
      me.intent.jump = me.intent.jumpPressed = false;
      if (this.phase === 'play' && me.state === 'active') this.cpuMove(me, ps[0], dt);
      else {
        me.intent.moveX = me.intent.moveZ = 0;
        me.intent.grab = false;
        // knocked down: the computer mashes jump to get up
        if (me.state === 'knocked' && Math.random() < dt * 4 * this.skill) me.intent.jumpPressed = true;
      }
    }
    if (this.phase === 'play') this.frameHook(dt);
  }

  /** The game is done and the winner's had a moment. */
  get finished() {
    return this.phase === 'over' && this.phaseT > 3.2;
  }

  // ---------------------------------------------------------------- online

  netState(): number[] {
    return [this.score[0], this.score[1], this.round, PHASES.indexOf(this.phase), this.phaseT, this.clock, this.gameClock, this.winner, this.target, this.tally[0], this.tally[1], this.cpu, this.golden ? 1 : 0, ...this.netExtra()];
  }

  applyNetState(s: number[]) {
    if (s.length < 13) return;
    this.score = [s[0], s[1]];
    this.round = s[2];
    this.phase = PHASES[s[3]] ?? 'play';
    this.phaseT = s[4];
    this.clock = s[5];
    this.gameClock = s[6];
    this.winner = s[7];
    this.target = s[8];
    this.tally = [s[9], s[10]];
    this.cpu = s[11];
    this.golden = s[12] === 1;
    this.applyExtra(s.slice(13));
  }

  /** The clock to show: this round's, the game's, or none. */
  shownClock(): number | null {
    if (this.gameTime > 0 || this.gameClock > 0) return this.golden ? null : this.gameClock;
    return this.roundTime > 0 || this.clock > 0 ? this.clock : null;
  }
  get goldenGoal() {
    return this.golden;
  }

  update(dt: number, time: number) {
    this.looks(dt, time);
  }

  dispose() {
    this.root.removeFromParent();
  }
}
