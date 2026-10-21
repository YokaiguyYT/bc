import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { LevelSession } from '../game/LevelSession';
import { keyLabel } from '../config/bindings';
import { CARGO_INFO } from '../entities/cargo/info';
import { formatMoney, formatTime } from '../util/math';

const _v = new THREE.Vector3();

/** In-game overlay: cargo condition, timer, payout, per-player grab state. */
export class Hud {
  private el: HTMLDivElement;
  private fill: HTMLElement;
  private pct: HTMLElement;
  private payout: HTMLElement;
  private time: HTMLElement;
  private status: HTMLElement;
  private cargoCard: HTMLElement;
  private hands: HTMLElement[][] = [];
  private states: HTMLElement[] = [];
  private tags: HTMLElement[] = [];
  private hint: HTMLElement;
  private goalMeter: HTMLElement;
  private goalFill: HTMLElement;
  private goalLabel: HTMLElement;
  private lastHealth = 1;
  private hintIdx = -1;
  private hintTimer = 0.6;
  private offs: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    private game: Game,
    private s: LevelSession,
  ) {
    const info = CARGO_INFO[s.def.cargo];
    const b = game.keyboard.bindings;
    const k = (codes: string[], cls: string) => codes.slice(0, 1).map((c) => `<kbd class="${cls}">${keyLabel(c)}</kbd>`).join('');
    const pcard = (i: number) => {
      const pb = i === 0 ? b.p1 : b.p2;
      const cls = i === 0 ? 'p1' : 'p2';
      const moveKeys = i === 0 ? `${k(pb.up, cls)}${k(pb.left, cls)}${k(pb.down, cls)}${k(pb.right, cls)}` : `${k(pb.up, cls)}${k(pb.left, cls)}${k(pb.down, cls)}${k(pb.right, cls)}`;
      return `<div class="card player-card ${cls}">
        <div class="badge" style="background:${i === 0 ? 'var(--p1)' : 'var(--p2)'}">P${i + 1}</div>
        <div class="hands"><div class="hand"></div><div class="hand"></div></div>
        <div><div class="keys">move ${moveKeys}<br>jump ${k(pb.jump, cls)} grab ${k(pb.grab, cls)}</div><div class="state"></div></div>
      </div>`;
    };
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="card cargo-card">
        <div class="title"><span>${info.icon} ${info.name}</span><span>${formatMoney(info.value)}</span></div>
        <div class="bar"><div class="fill"></div><div class="pct">100%</div></div>
        <div class="payout"><span>Payout if delivered</span><b>$0</b></div>
      </div>
      <div class="card timer-card"><div class="lvl">${s.def.name}</div><div class="time">0:00.0</div></div>
      <div class="card status-card"></div>
      ${pcard(0)}${pcard(1)}
      <div class="tags"><div class="tag">P1</div><div class="tag">P2</div></div>
      <div class="hint" style="opacity:0"></div>
      <div class="card goal-meter" style="display:none"><div class="goal-label" style="font-size:14px;text-align:center">DELIVERING…</div><div class="bar"><div class="fill" style="background:var(--good)"></div></div></div>
    `;
    parent.appendChild(this.el);
    const q = <T extends HTMLElement>(sel: string) => this.el.querySelector(sel) as T;
    this.cargoCard = q('.cargo-card');
    this.fill = q('.cargo-card .fill');
    this.pct = q('.cargo-card .pct');
    this.payout = q('.payout b');
    this.time = q('.timer-card .time');
    this.status = q('.status-card');
    this.hint = q('.hint');
    this.goalMeter = q('.goal-meter');
    this.goalFill = q('.goal-meter .fill');
    this.goalLabel = q('.goal-meter .goal-label');
    this.el.querySelectorAll('.player-card').forEach((pc) => {
      this.hands.push([...pc.querySelectorAll<HTMLElement>('.hand')]);
      this.states.push(pc.querySelector('.state') as HTMLElement);
    });
    this.tags = [...this.el.querySelectorAll<HTMLElement>('.tags .tag')];
    this.tags.forEach((t, i) => (t.style.color = i === 0 ? '#ffd2bd' : '#cfe5ff'));

    this.offs.push(
      s.events.on('checkpoint', () => this.banner('CHECKPOINT!', true)),
      s.events.on('goal', () => this.banner('DELIVERED!')),
      s.events.on('cargoBreak', () => this.banner(breakLine(s.def.cargo))),
      s.events.on('respawn', () => this.banner('WHOOPS!', true)),
    );
    this.banner(s.def.name.toUpperCase(), true);
  }

  banner(text: string, small = false) {
    const d = document.createElement('div');
    d.className = 'banner' + (small ? ' small' : '');
    d.textContent = text;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }

  update(dt: number) {
    const s = this.s;
    const h = s.cargo.destroyed ? 0 : s.cargo.health;
    this.fill.style.transform = `scaleX(${h})`;
    this.fill.style.background = h > 0.75 ? 'var(--good)' : h > 0.4 ? 'var(--warn)' : 'var(--bad)';
    this.pct.textContent = s.cargo.destroyed ? 'DESTROYED' : `${Math.round(h * 100)}%`;
    if (h < this.lastHealth - 0.004) {
      this.cargoCard.classList.remove('hit');
      void this.cargoCard.offsetWidth;
      this.cargoCard.classList.add('hit');
    }
    this.lastHealth = h;
    this.payout.textContent = formatMoney(s.currentPayout());
    this.time.textContent = formatTime(s.time);
    const cps = s.def.checkpoints.length;
    this.status.innerHTML = `${cps ? `🚩 ${Math.max(0, s.checkpoint + 1)}/${cps}<br>` : ''}${s.falls ? `☁️ falls: ${s.falls}` : ''}`;
    this.status.style.display = cps || s.falls ? '' : 'none';

    s.players.forEach((p, i) => {
      p.hands.forEach((hand, j) => {
        const el = this.hands[i][j];
        el.classList.toggle('grip', !!hand.grip);
        el.classList.toggle('reach', !hand.grip && !!hand.reach);
      });
      this.states[i].textContent = p.state === 'knocked' ? 'KNOCKED OUT! (mash jump)' : p.maxGripStretch() > 0.35 ? 'slipping!' : '';
      // name tags above heads
      const cam = this.game.renderer.camera;
      s.physics.interpolatedPosition(p.parts.head, _v);
      _v.y += 0.55;
      _v.project(cam);
      const tag = this.tags[i];
      const w = this.el.clientWidth;
      const hh = this.el.clientHeight;
      if (_v.z < 1) {
        tag.style.left = `${((_v.x + 1) / 2) * w}px`;
        tag.style.top = `${((1 - _v.y) / 2) * hh}px`;
        tag.style.opacity = '1';
      } else tag.style.opacity = '0';
    });

    // goal meter
    const g = s.goalProgress / s.goalNeeded;
    this.goalMeter.style.display = (g > 0.01 || s.goalHeld) && s.state === 'playing' ? '' : 'none';
    this.goalFill.style.transform = `scaleX(${g})`;
    this.goalLabel.textContent = s.goalHeld && g < 0.01 ? 'LET GO TO DELIVER' : 'DELIVERING…';

    // hints
    const hints = [...(s.def.hints ?? []), s.cargo.tip];
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) {
      this.hintIdx++;
      if (this.hintIdx < hints.length) {
        this.hint.textContent = hints[this.hintIdx];
        this.hint.style.opacity = '1';
        this.hintTimer = 5;
      } else {
        this.hint.style.opacity = '0';
        this.hintTimer = 9999;
      }
    }
  }

  /** A one-off message on the hint line; the regular hints carry on after it. */
  say(text: string, seconds = 6) {
    this.hint.textContent = text;
    this.hint.style.opacity = '1';
    this.hintTimer = seconds;
  }

  dispose() {
    for (const off of this.offs) off();
    this.el.remove();
  }
}

function breakLine(kind: string) {
  switch (kind) {
    case 'glass':
      return 'SHATTERED!';
    case 'tv':
      return 'NO SIGNAL!';
    case 'aquarium':
      return 'SPLOOSH!';
    case 'clock':
      return 'TIME’S UP!';
    case 'cake':
      return 'SPLAT!';
    default:
      return 'SMASHED!';
  }
}
