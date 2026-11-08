import * as THREE from 'three';
import type { Game } from '../game/Game';
import type { LevelSession } from '../game/LevelSession';
import { keyLabel } from '../config/bindings';
import { CARGO_INFO } from '../entities/cargo/info';
import { EMOTES } from '../game/events';
import { formatMoney, formatTime } from '../util/math';
import type { Hazard } from '../entities/hazards/registry';

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
    // badges and the like in each mover's own colour (the Locker can change it)
    s.players.forEach((p, i) => this.el.style.setProperty(i === 0 ? '--p1' : '--p2', '#' + p.color.toString(16).padStart(6, '0')));
    this.el.innerHTML = `
      <div class="blackout"></div>
      <div class="card cargo-card">
        <div class="title"><span>${info.icon} ${info.name}</span><span>${formatMoney(info.value)}</span></div>
        <div class="bar"><div class="fill"></div><div class="pct">100%</div></div>
        <div class="payout"><span>Payout if delivered</span><b>$0</b></div>
      </div>
      <div class="card timer-card"><div class="lvl">${s.def.name}</div><div class="time">0:00.0</div></div>
      <div class="chaos-line" style="display:none"></div>
      <div class="card status-card"></div>
      ${pcard(0)}${pcard(1)}
      <div class="tags"><div class="tag"><span class="say"></span>P1</div><div class="tag"><span class="say"></span>P2</div></div>
      <div class="hint" style="opacity:0"></div>
      <div class="objective"><svg class="arrow" viewBox="0 0 24 24" width="22" height="22"><path d="M4 12h13M12 6l6 6-6 6" stroke="currentColor" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span></div>
      <div class="card goal-meter" style="display:none"><div class="goal-label" style="font-size:14px;text-align:center">DELIVERING…</div><div class="bar"><div class="fill" style="background:var(--good)"></div></div></div>
      ${s.party ? `<div class="card party-board"><div class="pb-title">${s.party.title}</div><div class="pb-score"><span class="pb-name p1">P1</span><b class="pb-s0">0</b><i>–</i><b class="pb-s1">0</b><span class="pb-name p2">P2</span></div><div class="pb-line"></div></div>` : ''}
    `;
    if (s.party) this.el.classList.add('party');
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
      s.events.on('respawn', () => !s.party && this.banner('WHOOPS!', true)),
      s.events.on('party', (e) => this.banner(e.text, !!e.small, (/^[0-9]$/.test(e.text) ? 'count ' : '') + (e.who === 0 ? 'pc1' : e.who === 1 ? 'pc2' : ''))),
      s.events.on('emote', (e) => this.bubble(e.player, e.text ?? EMOTES[e.kind] ?? '')),
      s.events.on('tip', (e) => this.tipPop(e.amount)),
      s.events.on('chaos', (e) => {
        // the siren before something happens
        if (e.kind === 'warn') return this.banner(e.text, true, 'chaos warn');
        // two at once: the second one goes underneath
        const now = performance.now();
        const second = now - this.lastChaos < 700;
        this.lastChaos = now;
        this.banner(e.text, false, second ? 'chaos second' : 'chaos');
      }),
    );
    this.chaos = s.hazards.find((h) => h.hudLine) ?? null;
    this.darkener = s.hazards.find((h) => h.dark) ?? null;
    this.blackout = q('.blackout');
    this.chaosLine = q('.chaos-line');
    if (this.chaos) this.chaosLine.style.display = '';
    if (!s.party) this.banner(s.def.name.toUpperCase(), true);
    else {
      this.pb = { s0: q('.pb-s0'), s1: q('.pb-s1'), line: q('.pb-line'), names: [...this.el.querySelectorAll<HTMLElement>('.pb-name')] };
      this.el.querySelectorAll<HTMLElement>('.player-card .badge')[1].textContent = s.party.cpu ? '🤖' : 'P2';
      if (s.party.cpu) this.tags[1].lastChild!.textContent = 'CPU';
    }
  }
  private pb: { s0: HTMLElement; s1: HTMLElement; line: HTMLElement; names: HTMLElement[] } | null = null;
  private pbWas = '';

  /** A party game's scoreboard: the score (or the tally), the clock, what to do. */
  private updateParty() {
    const g = this.s.party!;
    const pb = this.pb!;
    const tally = g.showTally();
    const clock = g.shownClock();
    const key = `${g.score}|${tally}|${clock === null ? '' : Math.ceil(clock)}|${g.line()}|${g.cpu}|${g.target}|${g.goldenGoal}`;
    if (key === this.pbWas) return;
    this.pbWas = key;
    setText(pb.names[1], g.name(1));
    if (tally) {
      const [a, b] = tally.split('|');
      setText(pb.s0, a);
      setText(pb.s1, b);
    } else {
      setText(pb.s0, String(g.score[0]));
      setText(pb.s1, String(g.score[1]));
    }
    const bits = [];
    if (clock !== null) bits.push(`⏱ ${formatClock(clock)}`);
    else if (g.goldenGoal) bits.push('⚡ golden goal');
    if (g.target > 1) bits.push(tally ? `rounds ${g.score[0]}–${g.score[1]} · first to ${g.target}` : `first to ${g.target}`);
    const line = g.line();
    pb.line.innerHTML = `${bits.join(' · ')}${line ? `<br><span>${line}</span>` : ''}`;
  }

  /** "+$20" rising off the payout card when a tip is pocketed. */
  private tipPop(amount: number) {
    const d = document.createElement('div');
    d.className = 'tip-pop';
    d.textContent = `💵 +${formatMoney(amount)}`;
    this.cargoCard.appendChild(d);
    setTimeout(() => d.remove(), 1300);
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

  private lastChaos = -1e9;
  private chaos: Hazard | null = null;
  private chaosLine: HTMLElement;
  private chaosText = '';
  private darkener: Hazard | null = null;
  private blackout: HTMLElement;
  private darkWas = -1;

  banner(text: string, small = false, extra = '') {
    const d = document.createElement('div');
    d.className = 'banner' + (small ? ' small' : '') + (extra ? ' ' + extra : '');
    d.textContent = text;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }

  update(dt: number) {
    const s = this.s;
    if (s.party) this.updateParty();
    if (this.darkener) {
      const k = Math.round((this.darkener.dark?.() ?? 0) * 100) / 100;
      if (k !== this.darkWas) {
        this.darkWas = k;
        this.blackout.style.opacity = String(k);
      }
    }
    if (this.chaos) {
      const t = this.chaos.hudLine?.() ?? '';
      if (t !== this.chaosText) this.chaosLine.textContent = this.chaosText = t;
    }
    const h = s.cargo.destroyed ? 0 : s.cargo.health;
    const tower = (s.cargo as { boxes?: number }).boxes;
    if (tower !== undefined) {
      // a tower: the bar is how tall it is
      this.fill.style.transform = `scaleX(${Math.min(1, tower / 10)})`;
      this.fill.style.background = 'var(--good)';
      setText(this.pct, `🗼 ${tower} box${tower === 1 ? '' : 'es'}`);
    } else {
      this.fill.style.transform = `scaleX(${h})`;
      this.fill.style.background = h > 0.75 ? 'var(--good)' : h > 0.4 ? 'var(--warn)' : 'var(--bad)';
      this.pct.textContent = s.cargo.destroyed ? 'DESTROYED' : `${Math.round(h * 100)}%`;
    }
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
    const hints = [...(s.def.hints ?? []), ...(s.party ? [] : [s.cargo.tip])];
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
    // solo: P2 is the robot buddy, and P1 can also turn the load
    if (i === 1 && this.s.buddy) return '🤖 robot buddy<br>carries the other end';
    if (i === 1 && this.s.party?.cpu) return `🤖 the computer<br>${['', 'easy', 'normal', 'hard'][this.s.party.cpu] ?? ''}`;
    if (i === 0 && this.s.party?.cpu) {
      const k1 = (codes: string[]) => codes.slice(0, 1).map((c) => `<kbd class="p1">${keyLabel(c)}</kbd>`).join('');
      return `move ${k1(b.p1.up)}${k1(b.p1.left)}${k1(b.p1.down)}${k1(b.p1.right)} or arrows<br>jump ${k1(b.p1.jump)} grab ${k1(b.p1.grab)}`;
    }
    if (i === 0 && this.s.buddy) {
      const k1 = (codes: string[]) => codes.slice(0, 1).map((c) => `<kbd class="p1">${keyLabel(c)}</kbd>`).join('');
      return `move ${k1(b.p1.up)}${k1(b.p1.left)}${k1(b.p1.down)}${k1(b.p1.right)} jump ${k1(b.p1.jump)}<br>grab ${k1(b.p1.grab)} turn it <kbd class="p1">Z</kbd><kbd class="p1">C</kbd>`;
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
    case 'chandelier':
      return 'TINKLE… CRASH!';
    case 'beehive':
      return 'BZZZZZZZ!';
    case 'jelly':
      return 'SPLODGE!';
    case 'snowman':
      return 'SLUSH!';
    case 'rocket':
      return 'HOUSTON, PROBLEM!';
    default:
      return 'SMASHED!';
  }
}

/** 1:05, 0:09 (whole seconds, rounded up). */
function formatClock(s: number) {
  const t = Math.ceil(Math.max(0, s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Write text only when it changed (no DOM churn every frame). */
function setText(el: HTMLElement, text: string) {
  if (el.textContent !== text) el.textContent = text;
}
