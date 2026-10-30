import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { LevelSession } from '../game/LevelSession';
import { keyLabel } from '../config/bindings';
import { CARGO_INFO } from '../entities/cargo/info';
import { EMOTES } from '../game/events';
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
  private objective: HTMLElement;
  private objArrow: SVGElement;
  private objText: HTMLElement;
  private lastHealth = 1;
  private tipsShown = new Set<number>();
  private hintIdx = -1;
  private hintTimer = 0.6;
  private offs: (() => void)[] = [];

  constructor(
    parent: HTMLElement,
    private game: Game,
    private s: LevelSession,
  ) {
    const info = CARGO_INFO[s.def.cargo];
    const pcard = (i: number) => {
      const cls = i === 0 ? 'p1' : 'p2';
      return `<div class="card player-card ${cls}">
        <div class="badge" style="background:${i === 0 ? 'var(--p1)' : 'var(--p2)'}">P${i + 1}</div>
        <div class="hands"><div class="hand"></div><div class="hand"></div></div>
        <div><div class="keys">${this.keysHtml(i)}</div><div class="state"></div></div>
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
      <div class="tags"><div class="tag"><span class="say"></span>P1</div><div class="tag"><span class="say"></span>P2</div></div>
      <div class="hint" style="opacity:0"></div>
      <div class="objective"><svg class="arrow" viewBox="0 0 24 24" width="22" height="22"><path d="M4 12h13M12 6l6 6-6 6" stroke="currentColor" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span></div>
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
    this.objective = q('.objective');
    this.objArrow = this.objective.querySelector('.arrow') as SVGElement;
    this.objText = q('.objective span');
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
      s.events.on('emote', (e) => this.bubble(e.player, EMOTES[e.kind] ?? '')),
    );
    this.banner(s.def.name.toUpperCase(), true);
  }

  /** A speech bubble over a mover's name tag for a couple of seconds. */
  private bubble(player: number, text: string) {
    const el = this.tags[player]?.querySelector<HTMLElement>('.say');
    if (!el || !text) return;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth; // restart the pop-in
    el.classList.add('show');
    clearTimeout(this.bubbleTimers[player]);
    this.bubbleTimers[player] = window.setTimeout(() => el.classList.remove('show'), 2200);
  }
  private bubbleTimers: number[] = [];

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
    setText(this.payout, formatMoney(s.currentPayout()));
    setText(this.time, formatTime(s.time));
    const cps = s.def.checkpoints.length;
    const cargoLine = s.cargo.status ? `${s.cargo.status}<br>` : '';
    const status = `${cargoLine}${cps ? `🚩 ${Math.max(0, s.checkpoint + 1)}/${cps}<br>` : ''}${s.falls ? `☁️ falls: ${s.falls}` : ''}`;
    if (this.status.innerHTML !== status) this.status.innerHTML = status;
    this.status.style.display = cargoLine || cps || s.falls ? '' : 'none';
    this.updateObjective();
    this.updateTips();

    s.players.forEach((p, i) => {
      ([0, 1] as const).forEach((j) => {
        const el = this.hands[i][j];
        const look = p.handLook(j);
        el.classList.toggle('grip', look === 'grip');
        el.classList.toggle('reach', look === 'reach');
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

  private keysHtml(i: number) {
    if (i === 1 && this.game.onlineP2) return '🌐 playing from<br>their own laptop';
    if (i === 0 && this.game.onlineGuest) return '🌐 your friend,<br>on their laptop';
    const b = this.game.keyboard.bindings;
    if (i === 1 && this.game.onlineGuest) {
      // online we can use either layout: show the WASD one, and say so
      const k = (codes: string[]) => codes.slice(0, 1).map((c) => `<kbd class="p2">${keyLabel(c)}</kbd>`).join('');
      return `move ${k(b.p1.up)}${k(b.p1.left)}${k(b.p1.down)}${k(b.p1.right)} or arrows<br>jump ${k(b.p1.jump)} grab ${k(b.p1.grab)}`;
    }
    const pb = i === 0 ? b.p1 : b.p2;
    const cls = i === 0 ? 'p1' : 'p2';
    const k = (codes: string[]) => codes.slice(0, 1).map((c) => `<kbd class="${cls}">${keyLabel(c)}</kbd>`).join('');
    return `move ${k(pb.up)}${k(pb.left)}${k(pb.down)}${k(pb.right)}<br>jump ${k(pb.jump)} grab ${k(pb.grab)}`;
  }

  /** Show the current key bindings on the player cards. */
  refreshKeys() {
    this.el.querySelectorAll<HTMLElement>('.player-card .keys').forEach((el, i) => {
      const html = this.keysHtml(i);
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  }

  /** Where to next: while the next checkpoint (or the drop-off) is off screen, an arrow at the edge points to it. */
  private updateObjective() {
    const s = this.s;
    const el = this.objective;
    const next = s.state === 'playing' ? (s.def.checkpoints[s.checkpoint + 1] ?? s.def.goal) : null;
    if (!next) {
      el.style.opacity = '0';
      return;
    }
    const c = s.cargo.body.translation();
    const dist = Math.hypot(next.pos[0] - c.x, next.pos[2] - c.z);
    _v.set(next.pos[0], next.pos[1], next.pos[2]).project(this.game.renderer.camera);
    // behind the camera the projection comes out mirrored
    const behind = _v.z > 1;
    const nx = behind ? -_v.x : _v.x;
    const ny = behind ? -_v.y : _v.y;
    if (!behind && Math.abs(nx) < 0.9 && Math.abs(ny) < 0.85) {
      el.style.opacity = '0';
      return;
    }
    // walk from the screen centre toward it until we hit the free band inside the HUD cards
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const cx = w / 2;
    const cy = h / 2;
    const dx = (nx * w) / 2;
    const dy = (-ny * h) / 2;
    const L = 70;
    const R = w - 70;
    const T = 120;
    const B = h - 120;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (R - cx) / dx);
    if (dx < 0) t = Math.min(t, (L - cx) / dx);
    if (dy > 0) t = Math.min(t, (B - cy) / dy);
    if (dy < 0) t = Math.min(t, (T - cy) / dy);
    if (!isFinite(t)) t = 0;
    el.style.opacity = '1';
    el.style.transform = `translate(${(cx + dx * t).toFixed(1)}px, ${(cy + dy * t).toFixed(1)}px) translate(-50%, -50%)`;
    this.objArrow.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
    setText(this.objText, `${next === s.def.goal ? '🏁' : '🚩'} ${Math.round(dist)} m`);
  }

  /** Location tips: the first time the cargo or a mover gets near a tricky spot. */
  private updateTips() {
    const s = this.s;
    const tips = s.def.tips;
    if (!tips || s.state !== 'playing') return;
    const near = (p: { x: number; y: number; z: number }, t: (typeof tips)[number]) =>
      Math.hypot(p.x - t.pos[0], p.z - t.pos[2]) < t.radius && Math.abs(p.y - t.pos[1]) < 3;
    tips.forEach((t, i) => {
      if (this.tipsShown.has(i)) return;
      if (!near(s.cargo.body.translation(), t) && !s.players.some((p) => near(p.body.translation(), t))) return;
      this.tipsShown.add(i);
      this.say(t.text, 6);
    });
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
    case 'swan':
      return 'JUST A PUDDLE!';
    case 'egg':
      return 'OMELETTE!';
    case 'piano':
      return 'KER-PLUNK!';
    case 'painting':
      return 'RUINED!';
    case 'balloons':
      return 'POP POP POP!';
    default:
      return 'SMASHED!';
  }
}

/** Write text only when it changed (no DOM churn every frame). */
function setText(el: HTMLElement, text: string) {
  if (el.textContent !== text) el.textContent = text;
}
