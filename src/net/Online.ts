import { openSignal, Signal } from './signal';
import { CtlMsg, NET_VERSION, PeerLink, Pipe } from './peer';
import { RelayLink } from './relay';
import { GuestSync, HostSync, NetEvent } from './sync';
import type { Keyboard, MoveState } from '../input/Keyboard';
import type { LevelSession } from '../game/LevelSession';
import type { GenParams } from '../levels/types';
import * as THREE from 'three';

/**
 * Online play: each player on their own laptop. The host's laptop runs the
 * game; the guest's sends its keys for Player 2 and shows the game one of two
 * ways:
 *
 * - "light" (the default): the host sends where everything is, a couple of
 *   kilobytes 15–30 times a second, and the guest draws the level itself. Works
 *   on any network, even through a relay.
 * - "video": the host streams its screen. Easy on a slow guest laptop, but it
 *   needs a direct connection and a few megabits.
 *
 * Connecting: a free public matchmaking server (PeerJS) introduces the two
 * laptops and, while they try to connect directly, relays their messages, so
 * play starts at once and carries on even where a direct link never comes.
 */

/** No look-alikes (0/O, 1/I/L), so a code read out loud or off a screen survives. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;
const hostId = (code: string) => `fragile-freight-${code.toLowerCase()}`;

function makeCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/** Tests: ?p2p=0 skips the direct link, ?relay=0 skips the relay. */
function allowed(name: 'p2p' | 'relay') {
  return new URLSearchParams(location.search).get(name) !== '0';
}

/** Combine two move states (each laptop's player can use either key layout). */
export function mergeMoves(a: MoveState, b: MoveState): MoveState {
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  return { x: c(a.x + b.x), y: c(a.y + b.y), jump: a.jump || b.jump, jumpPressed: a.jumpPressed || b.jumpPressed, grab: a.grab || b.grab };
}

export type NetMode = 'light' | 'video';
export type Via = 'direct' | 'relay';

/**
 * Host and guest's connection: a relay and/or a direct link, using the best one
 * that's open. Losing one is fine while the other works.
 */
class Conn {
  relay: RelayLink | null = null;
  direct: PeerLink | null = null;
  onCtl: ((m: CtlMsg) => void) | null = null;
  onFast: ((m: CtlMsg | ArrayBuffer) => void) | null = null;
  /** The best open route changed (or opened for the first time). */
  onChange: (() => void) | null = null;
  onLost: ((why: string) => void) | null = null;
  lost = false;

  get via(): Via | null {
    return this.direct?.open ? 'direct' : this.relay?.open ? 'relay' : null;
  }
  /** Round trip on the route in use (ms), once measured. */
  get rtt(): number | null {
    const p = this.direct?.open ? this.direct : this.relay?.open ? this.relay : null;
    return p?.rtt ?? null;
  }
  get open() {
    return !!this.via;
  }
  /** Seconds since anything arrived on either route. */
  get quiet() {
    return (performance.now() - Math.max(this.direct?.lastHeard ?? 0, this.relay?.lastHeard ?? 0)) / 1000;
  }
  private best(): Pipe | null {
    return this.direct?.open ? this.direct : this.relay?.open ? this.relay : null;
  }
  sendCtl(m: CtlMsg) {
    this.best()?.sendCtl(m);
  }
  sendFast(m: CtlMsg | ArrayBuffer) {
    this.best()?.sendFast(m);
  }

  attach(p: Pipe) {
    if (p.via === 'direct') {
      this.direct?.close(false);
      this.direct = p as PeerLink;
    } else {
      this.relay?.close(false);
      this.relay = p as RelayLink;
    }
    p.onCtl = (m) => this.onCtl?.(m);
    p.onFast = (m) => this.onFast?.(m);
    p.onOpen = () => this.onChange?.();
    p.onLost = (why) => {
      if (this.lost) return;
      if (why === 'left' || !this.open) this.lose(why);
      else this.onChange?.();
    };
  }

  lose(why: string) {
    if (this.lost) return;
    this.lost = true;
    this.relay?.close(false);
    this.direct?.close(false);
    this.onLost?.(why);
  }

  close() {
    if (this.lost) return;
    this.lost = true;
    this.relay?.close(true);
    this.direct?.close(true);
  }
}

export type HostStatus = 'waiting' | 'connecting' | 'connected';

/** The guest's latest keys, as the host sees them. */
interface RemoteKeys {
  x: number;
  y: number;
  /** x/y are a world direction (the guest steers by its own camera). */
  w: boolean;
  j: boolean;
  jc: number;
  g: boolean;
  c: number;
}
const NO_KEYS: RemoteKeys = { x: 0, y: 0, w: false, j: false, jc: 0, g: false, c: 0 };

/** What the host needs from the app around it. */
export interface HostView {
  canvas: HTMLCanvasElement;
  /** All of the UI (menus and HUD): copied in video mode. */
  ui: HTMLElement;
  /** Just the menus: copied in light mode (the guest has its own HUD). */
  menus: HTMLElement;
}

export class OnlineHost {
  status: HostStatus = 'waiting';
  conn: Conn | null = null;
  mode: NetMode = 'light';
  /** Something changed that the UI should show. */
  onChange: ((what: 'joined' | 'left' | 'status') => void) | null = null;
  /** The guest asked to pause. */
  onPauseRequest: (() => void) | null = null;
  /** The level being played (null in the menus); the app keeps this up to date. */
  level: LevelSession | null = null;
  private stream: MediaStream | null = null;
  private keys: RemoteKeys = { ...NO_KEYS };
  private seq = -1;
  private usedJumps = 0;
  private keysAt = 0;
  private uiTimer = 0;
  private lastHtml = '';
  private lastSize = '';
  private videoW = 0;
  private stopped = false;
  private sync: HostSync | null = null;
  private synced: LevelSession | null = null;
  private snapT = 0;
  /** Fallback when capturing the 3D canvas gives the guest a blank picture: copy each frame to a plain canvas and send that. */
  private copy: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; stream: MediaStream } | null = null;

  private constructor(
    readonly code: string,
    private sig: Signal,
    private view: HostView,
  ) {
    this.wireSignal(sig);
  }

  /** Get a free code from the matchmaking server and wait for a guest. */
  static async start(view: HostView) {
    for (let tries = 0; tries < 4; tries++) {
      const code = makeCode();
      try {
        return new OnlineHost(code, await openSignal(hostId(code)), view);
      } catch (e) {
        if ((e as Error).message !== 'id-taken') throw e;
      }
    }
    throw new Error('Couldn’t get a game code. Try again.');
  }

  get connected() {
    return this.status === 'connected';
  }

  /** How the guest is connected right now. */
  get via(): Via | null {
    return this.conn?.via ?? null;
  }

  /** Round trip to the guest (ms), once measured. */
  get rtt(): number | null {
    return this.conn?.rtt ?? null;
  }

  /** Seconds since the guest was last heard from. */
  get quiet() {
    return this.conn?.quiet ?? 0;
  }

  /** Whether the picture can be streamed (it needs the direct link). */
  get canVideo() {
    return !!this.conn?.direct?.open && this.conn.direct.canVideo && typeof this.view.canvas.captureStream === 'function';
  }

  private wireSignal(sig: Signal) {
    this.sig = sig;
    this.conn?.relay?.useSignal(sig);
    sig.onMessage = (m) => {
      const d = m.data;
      const conn = this.conn;
      const ours = conn && !conn.lost && this.guestId === m.from;
      if (d.k === 'hello') {
        if (d.v !== NET_VERSION) return this.sig.send(m.from, { k: 'version', v: NET_VERSION });
        if (ours) return this.sig.send(m.from, { k: 'welcome', v: NET_VERSION }); // they didn't hear us the first time
        // a second player while ours is still here is turned away; but if ours has gone quiet, this is
        // most likely them again after their Wi-Fi dropped (with a new id): let them straight back in
        if (conn && !conn.lost && conn.open && conn.quiet < 4) return this.sig.send(m.from, { k: 'busy' });
        this.accept(m.from);
      } else if (ours && d.k === 'rl') conn.relay?.receive(d);
      else if (ours && (d.k === 'answer' || d.k === 'ice')) conn.direct?.signal(d);
      else if (ours && d.k === 'bye') conn.lose('left');
    };
    // the matchmaking server hung up (it does, now and then): get back on it under the same code
    sig.onClose = () => {
      const retry = () => {
        if (this.stopped) return;
        openSignal(hostId(this.code)).then(
          (s) => (this.stopped ? s.close() : this.wireSignal(s)),
          () => setTimeout(retry, 4000),
        );
      };
      setTimeout(retry, 1500);
    };
  }

  private guestId = '';

  private setStatus(s: HostStatus) {
    this.status = s;
    this.onChange?.('status');
  }

  private accept(guest: string) {
    this.conn?.close();
    this.endSync();
    const conn = new Conn();
    this.conn = conn;
    this.guestId = guest;
    this.mode = 'light';
    this.setStatus('connecting');
    conn.onChange = () => {
      if (this.conn !== conn) return;
      if (conn.open && this.status !== 'connected') {
        this.keys = { ...NO_KEYS };
        this.seq = -1;
        this.usedJumps = 0;
        this.lastHtml = '';
        this.videoW = 0;
        this.synced = null; // (re)send the level
        this.status = 'connected';
        conn.sendCtl({ k: 'mode', m: this.mode });
        this.onChange?.('joined');
      } else {
        // the route changed: a lost direct link can't carry video
        if (this.mode === 'video' && !this.canVideo) this.setMode('light');
        this.sync?.keyframeSoon();
        this.onChange?.('status');
      }
    };
    conn.onLost = () => {
      if (this.conn !== conn) return;
      const was = this.connected;
      this.conn = null;
      this.guestId = '';
      this.keys = { ...NO_KEYS };
      this.endSync();
      this.mode = 'light';
      this.status = 'waiting';
      this.onChange?.(was ? 'left' : 'status');
    };
    conn.onFast = (m) => {
      if (m instanceof ArrayBuffer || m.k !== 'in') return;
      const s = Number(m.s);
      if (!(s > this.seq)) return; // an older packet that overtook a newer one
      this.seq = s;
      this.keysAt = performance.now();
      this.keys = { x: Number(m.x) || 0, y: Number(m.y) || 0, w: !!m.w, j: !!m.j, jc: Number(m.jc) || 0, g: !!m.g, c: Number(m.c) || 0 };
    };
    conn.onCtl = (m) => {
      if (m.k === 'pause') this.onPauseRequest?.();
      else if (m.k === 'blank') this.useCopy();
      else if (m.k === 'want') this.setMode(m.m === 'video' ? 'video' : 'light');
      else if (m.k === 'kf') this.sync?.keyframeSoon();
    };
    this.sig.send(guest, { k: 'welcome', v: NET_VERSION });
    if (allowed('relay')) conn.attach(new RelayLink(this.sig, guest));
    if (allowed('p2p') && typeof RTCPeerConnection === 'function') {
      const link = new PeerLink(this.sig, guest);
      conn.attach(link);
      link.offer(true).catch((e) => console.warn('offer', e));
    }
    // a guest that never gets through
    setTimeout(() => {
      if (this.conn === conn && !conn.open) {
        conn.close();
        this.conn = null;
        this.setStatus('waiting');
      }
    }, 30000);
  }

  /** Switch between drawing on the guest's laptop and streaming the picture. */
  setMode(m: NetMode) {
    const conn = this.conn;
    if (!conn?.open) return;
    if (m === 'video' && !this.canVideo) m = 'light';
    if (m === this.mode) return conn.sendCtl({ k: 'mode', m });
    this.mode = m;
    if (m === 'video') {
      if (!this.stream) {
        this.stream = this.view.canvas.captureStream?.(60) ?? null;
        const track = this.stream?.getVideoTracks()[0];
        if (track && 'contentHint' in track) track.contentHint = 'motion';
      }
      const track = (this.copy?.stream ?? this.stream)?.getVideoTracks()[0] ?? null;
      conn.direct?.setVideo(track).catch((e) => console.warn('video', e));
      this.endSync();
      this.videoW = 0;
    } else {
      conn.direct?.setVideo(null).catch(() => {});
      this.synced = null; // the guest needs the level again
    }
    this.lastHtml = '';
    conn.sendCtl({ k: 'mode', m });
    this.onChange?.('status');
  }

  private useCopy() {
    if (!this.copy) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream?.(60);
      if (!ctx || !stream) return;
      this.copy = { canvas, ctx, stream };
      console.warn('online: the guest saw a blank picture; sending a copy of each frame instead');
    }
    this.copyFrame();
    if (this.mode === 'video') this.conn?.direct?.setVideo(this.copy.stream.getVideoTracks()[0]).catch((e) => console.warn('replace video', e));
  }

  /** Call right after each frame is drawn. */
  copyFrame() {
    const c = this.copy;
    if (!c || !this.connected || this.mode !== 'video') return;
    const src = this.view.canvas;
    if (c.canvas.width !== src.width || c.canvas.height !== src.height) {
      c.canvas.width = src.width;
      c.canvas.height = src.height;
    }
    c.ctx.drawImage(src, 0, 0);
  }

  /** Player 2's keys, from the guest. */
  input(): MoveState {
    // the guest repeats its keys ten times a second: silence means let go of everything
    if (performance.now() - this.keysAt > 600) this.keys = { ...this.keys, x: 0, y: 0, j: false, g: false, c: 0 };
    const k = this.keys;
    // jumps are counted, so a quick tap is never lost between frames
    if (this.usedJumps > k.jc) this.usedJumps = k.jc;
    const jumpPressed = k.jc > this.usedJumps;
    this.usedJumps = k.jc;
    return { x: k.x, y: k.y, world: k.w, jump: k.j, jumpPressed, grab: k.g };
  }

  /** In video mode the guest can spin the (shared) camera too (-1, 0 or 1). */
  cam() {
    return this.connected && this.mode === 'video' ? Math.max(-1, Math.min(1, this.keys.c)) : 0;
  }

  /** Per frame, after the game has run. */
  update(dt: number) {
    const conn = this.conn;
    if (!conn?.open || !this.connected) return;
    this.sendUi(conn, dt);
    if (this.mode === 'light') this.sendState(conn, dt);
    else if (this.view.canvas.width !== this.videoW) {
      this.videoW = this.view.canvas.width;
      conn.direct?.tuneVideo(this.videoW).catch((e) => console.warn('tune', e));
    }
  }

  /** Menus (and in video mode the HUD) as HTML, when they change, at most 20 times a second. */
  private sendUi(conn: Conn, dt: number) {
    this.uiTimer -= dt;
    if (this.uiTimer > 0) return;
    this.uiTimer = 0.05;
    const all = this.mode === 'video';
    const html = (all ? this.view.ui : this.view.menus).innerHTML;
    const size = `${window.innerWidth}x${window.innerHeight}`;
    if (html !== this.lastHtml || size !== this.lastSize) {
      this.lastHtml = html;
      this.lastSize = size;
      conn.sendCtl({ k: 'ui', html, all, w: window.innerWidth, h: window.innerHeight });
    }
  }

  /** Light mode: the level, then snapshots and events. */
  private sendState(conn: Conn, dt: number) {
    const s = this.level;
    if (s !== this.synced) {
      this.endSync();
      this.synced = s;
      if (s) {
        this.sync = new HostSync(s);
        // a generated job travels as its recipe: the guest makes the very same one
        conn.sendCtl({ k: 'level', id: s.def.id, cargo: s.def.cargo, gen: s.def.gen, name: s.def.name });
      } else conn.sendCtl({ k: 'end' });
      this.snapT = 1;
    }
    if (!this.sync) return;
    this.snapT += dt;
    const every = conn.via === 'direct' ? 1 / 30 : 1 / 15;
    if (this.snapT < every) return;
    const ev = this.sync.takeEvents();
    if (ev.length) conn.sendCtl({ k: 'ev', l: ev });
    conn.sendFast(this.sync.snapshot(this.snapT));
    this.snapT = 0;
  }

  private endSync() {
    this.sync?.dispose();
    this.sync = null;
    this.synced = null;
  }

  /** Tell the guest something. */
  send(m: CtlMsg) {
    this.conn?.sendCtl(m);
  }

  stop() {
    this.stopped = true;
    this.endSync();
    this.conn?.close();
    this.conn = null;
    this.sig.onClose = null;
    this.sig.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.copy?.stream.getTracks().forEach((t) => t.stop());
    this.copy = null;
  }
}

/** A level the host started, as the guest hears about it. */
export interface LevelMsg {
  id: string;
  cargo?: string;
  /** A generated job's recipe. */
  gen?: GenParams;
  name?: string;
}

export class OnlineGuest {
  mode: NetMode = 'light';
  stream: MediaStream | null = null;
  ui: { html: string; all: boolean; w: number; h: number } | null = null;
  /** The level being shown (light mode), and what keeps it in step with the host. */
  sync: GuestSync | null = null;
  onStream: ((s: MediaStream) => void) | null = null;
  onUi: ((html: string, all: boolean, w: number, h: number) => void) | null = null;
  onLevel: ((m: LevelMsg) => void) | null = null;
  onEnd: (() => void) | null = null;
  onMode: ((m: NetMode) => void) | null = null;
  /** The route changed (direct ↔ relay). */
  onVia: (() => void) | null = null;
  onLost: ((why: string) => void) | null = null;
  /** The host's latest level message (it can arrive before the app is listening). */
  lastLevel: LevelMsg | null = null;
  private seq = 0;
  private jumps = 0;
  private lastSent = '';
  private resend = 0;
  /** Events that arrived before the level they belong to was built. */
  private early: NetEvent[] = [];

  private constructor(
    private sig: Signal,
    private target: string,
    readonly conn: Conn,
  ) {
    conn.onCtl = (m) => this.ctl(m);
    conn.onFast = (m) => {
      if (m instanceof ArrayBuffer) this.sync?.push(m);
    };
    conn.onChange = () => this.onVia?.();
    conn.onLost = (why) => {
      this.sig.close();
      this.onLost?.(why);
    };
    sig.onMessage = (m) => {
      if (m.from !== this.target) return;
      const d = m.data;
      if (d.k === 'rl') conn.relay?.receive(d);
      else if (d.k === 'offer' && typeof d.sdp === 'string') this.takeOffer(d.sdp);
      else if (d.k === 'ice') conn.direct?.signal(d);
      else if (d.k === 'bye') conn.lose('left');
    };
  }

  get via(): Via | null {
    return this.conn.via;
  }

  get rtt(): number | null {
    return this.conn.rtt;
  }

  /** Seconds since the host was last heard from. */
  get quiet() {
    return this.conn.quiet;
  }

  private takeOffer(sdp: string) {
    if (!allowed('p2p') || typeof RTCPeerConnection !== 'function') return;
    const link = new PeerLink(this.sig, this.target);
    link.onStream = (s) => {
      this.stream = s;
      this.onStream?.(s);
    };
    this.conn.attach(link);
    link.answer(sdp).catch((e) => console.warn('answer', e));
  }

  private ctl(m: CtlMsg) {
    switch (m.k) {
      case 'ui':
        if (typeof m.html === 'string') {
          this.ui = { html: m.html, all: !!m.all, w: Number(m.w) || 1280, h: Number(m.h) || 800 };
          this.onUi?.(this.ui.html, this.ui.all, this.ui.w, this.ui.h);
        }
        break;
      case 'mode':
        this.mode = m.m === 'video' ? 'video' : 'light';
        this.onMode?.(this.mode);
        break;
      case 'level':
        this.lastLevel = { id: String(m.id), cargo: m.cargo as string | undefined, gen: m.gen as GenParams | undefined, name: m.name as string | undefined };
        this.early = [];
        this.onLevel?.(this.lastLevel);
        break;
      case 'end':
        this.lastLevel = null;
        this.onEnd?.();
        break;
      case 'ev':
        if (Array.isArray(m.l)) {
          if (this.sync) this.sync.pushEvents(m.l as NetEvent[]);
          else this.early.push(...(m.l as NetEvent[]));
        }
        break;
    }
  }

  /** The app built the host's level here: keep it in step. */
  attachSync(sync: GuestSync | null) {
    this.sync = sync;
    if (sync && this.early.length) sync.pushEvents(this.early);
    this.early = [];
    // a fresh start: ask for everything, not just what moved
    if (sync) this.conn.sendCtl({ k: 'kf' });
  }

  /** Find the host with this code and connect. Rejects with a message to show. */
  static async join(code: string, onProgress?: (msg: string) => void): Promise<OnlineGuest> {
    const sig = await openSignal(`fragile-freight-g${Math.random().toString(36).slice(2, 12)}`);
    const target = hostId(code);
    return new Promise((resolve, reject) => {
      let guest: OnlineGuest | null = null;
      let done = false;
      const fail = (msg: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(hello);
        guest?.conn.close();
        sig.close();
        reject(new Error(msg));
      };
      const notFound = 'No game found with that code. Check it, and that your friend is still hosting.';
      let timer = setTimeout(() => fail(notFound), 12000);
      const sayHello = () => sig.send(target, { k: 'hello', v: NET_VERSION });
      // say it again now and then: the first one can get lost while the host's line reconnects
      const hello = setInterval(() => !guest && sayHello(), 3000);
      sig.onMessage = (m) => {
        if (m.from !== target) return;
        const d = m.data;
        if (d.k === 'expire' && !guest) fail(notFound);
        else if (d.k === 'busy') fail('That game already has a second player.');
        else if (d.k === 'version') fail('Your friend has a different version of the game. You both need the same file.');
        else if (d.k === 'welcome' && !guest) {
          clearInterval(hello);
          onProgress?.('Found your friend’s game. Connecting…');
          clearTimeout(timer);
          timer = setTimeout(
            () => fail('Found the game but couldn’t connect to it. Check that both laptops are online, then try again.'),
            20000,
          );
          const conn = new Conn();
          const g = new OnlineGuest(sig, target, conn);
          guest = g;
          // wait for the first route to open (usually the relay, a moment later the direct link)
          conn.onChange = () => {
            if (!conn.open) return;
            conn.onChange = () => g.onVia?.();
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(g);
          };
          if (allowed('relay')) conn.attach(new RelayLink(sig, target));
          // (the direct link starts when the host's offer arrives)
        }
      };
      sayHello();
    });
  }

  /** A jump key went down (counted, so a quick tap is never lost however slowly frames come). */
  tapJump() {
    this.jumps++;
  }

  /** Send this laptop's keys, about 30 times a second (either layout drives our mover). */
  sendKeys(kb: Keyboard | null, dt: number, session: LevelSession | null) {
    let m: MoveState = { x: 0, y: 0, jump: false, jumpPressed: false, grab: false };
    let cam = 0;
    let world = false;
    if (kb) {
      const b = kb.bindings;
      m = mergeMoves(kb.readPlayer(b.p1), kb.readPlayer(b.p2));
      cam = (kb.isDown(b.camRight) ? 1 : 0) - (kb.isDown(b.camLeft) ? 1 : 0);
      // light mode: we have our own camera, so turn the keys into a world direction here
      if (this.mode === 'light' && session) {
        const f = session.cameraRig.forward(new THREE.Vector3());
        const r = session.cameraRig.right(new THREE.Vector3());
        const x = r.x * m.x + f.x * m.y;
        const z = r.z * m.x + f.z * m.y;
        m = { ...m, x: Math.round(x * 1000) / 1000, y: Math.round(z * 1000) / 1000 };
        world = true;
        cam = 0; // our camera is our own business
      }
    }
    const state = `${m.x},${m.y},${+world},${+m.jump},${this.jumps},${+m.grab},${cam}`;
    // changes go at once; otherwise a reminder every so often (packets can get lost)
    this.resend -= dt;
    if (state === this.lastSent && this.resend > 0) return;
    this.lastSent = state;
    this.resend = 0.1;
    this.conn.sendFast({ k: 'in', s: ++this.seq, x: m.x, y: m.y, w: world ? 1 : 0, j: m.jump, jc: this.jumps, g: m.grab, c: cam });
  }

  requestPause() {
    this.conn.sendCtl({ k: 'pause' });
  }

  /** Ask the host to stream the picture, or to go back to drawing it here. */
  requestMode(m: NetMode) {
    this.conn.sendCtl({ k: 'want', m });
  }

  /** Whether the picture could be streamed (needs the direct link). */
  get canVideo() {
    return this.conn.via === 'direct';
  }

  private blankChecks = 0;
  private blankAsked = false;
  /**
   * Every couple of seconds at first in video mode: is the picture actually
   * arriving? If it stays empty or pure black, ask the host for its fallback
   * (some browsers capture a 3D canvas as black frames).
   */
  checkPicture(v: HTMLVideoElement) {
    if (this.mode !== 'video' || this.blankAsked || this.blankChecks > 8) return;
    this.blankChecks++;
    let blank = v.videoWidth === 0;
    if (!blank) {
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let max = 0;
      for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
      blank = max < 10;
    }
    // give it a few seconds to start before deciding
    if (blank && this.blankChecks >= 3) {
      this.blankAsked = true;
      this.conn.sendCtl({ k: 'blank' });
    }
  }

  leave() {
    this.onLost = null;
    this.conn.close();
    this.sig.close();
  }
}
