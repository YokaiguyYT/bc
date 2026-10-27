import { openSignal, Signal } from './signal';
import { CtlMsg, NET_VERSION, PeerLink } from './peer';
import type { Keyboard, MoveState } from '../input/Keyboard';

/**
 * Online play, "remote play" style: the host's laptop runs the game as usual
 * and streams the picture to the guest, plus a copy of its menus and HUD; the
 * guest's keys come back and drive Player 2. Nothing runs on a server of ours:
 * a free public relay introduces the two laptops, then they talk directly.
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

/** Combine two move states (each laptop's player can use either key layout). */
export function mergeMoves(a: MoveState, b: MoveState): MoveState {
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  return { x: c(a.x + b.x), y: c(a.y + b.y), jump: a.jump || b.jump, jumpPressed: a.jumpPressed || b.jumpPressed, grab: a.grab || b.grab };
}

export type HostStatus = 'waiting' | 'connecting' | 'connected';

/** The guest's latest keys, as the host sees them. */
interface RemoteKeys {
  x: number;
  y: number;
  j: boolean;
  jc: number;
  g: boolean;
  c: number;
}
const NO_KEYS: RemoteKeys = { x: 0, y: 0, j: false, jc: 0, g: false, c: 0 };

export class OnlineHost {
  status: HostStatus = 'waiting';
  link: PeerLink | null = null;
  /** Something changed that the UI should show. */
  onChange: ((what: 'joined' | 'left' | 'status') => void) | null = null;
  /** The guest asked to pause. */
  onPauseRequest: (() => void) | null = null;
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
  /** Fallback when capturing the 3D canvas gives the guest a blank picture: copy each frame to a plain canvas and send that. */
  private copy: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; stream: MediaStream } | null = null;

  private constructor(
    readonly code: string,
    private sig: Signal,
    private canvas: HTMLCanvasElement,
    private ui: HTMLElement,
  ) {
    this.wireSignal(sig);
  }

  /** Get a free code from the relay and wait for a guest. */
  static async start(canvas: HTMLCanvasElement, ui: HTMLElement) {
    for (let tries = 0; tries < 4; tries++) {
      const code = makeCode();
      try {
        return new OnlineHost(code, await openSignal(hostId(code)), canvas, ui);
      } catch (e) {
        if ((e as Error).message !== 'id-taken') throw e;
      }
    }
    throw new Error('Couldn’t get a game code. Try again.');
  }

  get connected() {
    return this.status === 'connected';
  }

  private wireSignal(sig: Signal) {
    this.sig = sig;
    sig.onMessage = (m) => {
      const d = m.data;
      if (d.k === 'hello') {
        if (d.v !== NET_VERSION) return this.sig.send(m.from, { k: 'version', v: NET_VERSION });
        if (this.link && !this.link.closed && this.link.remote !== m.from && this.connected) return this.sig.send(m.from, { k: 'busy' });
        this.link?.close(false);
        this.connect(m.from);
      } else if (this.link && m.from === this.link.remote) this.link.signal(d);
    };
    // the relay hung up (it does, now and then): get back on it under the same code
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

  private setStatus(s: HostStatus) {
    this.status = s;
    this.onChange?.('status');
  }

  private connect(remote: string) {
    const link = new PeerLink(this.sig, remote);
    this.link = link;
    this.setStatus('connecting');
    if (!this.stream) {
      this.stream = this.canvas.captureStream?.(60) ?? null;
      const track = this.stream?.getVideoTracks()[0];
      if (track && 'contentHint' in track) track.contentHint = 'motion';
    }
    link.onOpen = () => {
      if (this.link !== link) return;
      this.keys = { ...NO_KEYS };
      this.seq = -1;
      this.usedJumps = 0;
      this.lastHtml = '';
      this.videoW = 0;
      this.status = 'connected';
      this.onChange?.('joined');
    };
    link.onLost = () => {
      if (this.link !== link) return;
      const was = this.connected;
      this.link = null;
      this.keys = { ...NO_KEYS };
      this.status = 'waiting';
      this.onChange?.(was ? 'left' : 'status');
    };
    link.onInput = (m) => {
      const s = Number(m.s);
      if (!(s > this.seq)) return; // an older packet that overtook a newer one
      this.seq = s;
      this.keysAt = performance.now();
      this.keys = { x: Number(m.x) || 0, y: Number(m.y) || 0, j: !!m.j, jc: Number(m.jc) || 0, g: !!m.g, c: Number(m.c) || 0 };
    };
    link.onCtl = (m) => {
      if (m.k === 'pause') this.onPauseRequest?.();
      if (m.k === 'blank') this.useCopy(link);
    };
    link.offer(this.stream).catch((e) => {
      console.warn('offer', e);
      link.close(false);
    });
    // a guest that never gets through
    setTimeout(() => {
      if (this.link === link && !link.open) {
        link.close(false);
        this.link = null;
        this.setStatus('waiting');
      }
    }, 30000);
  }

  private useCopy(link: PeerLink) {
    if (!this.copy) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream?.(60);
      if (!ctx || !stream) return;
      this.copy = { canvas, ctx, stream };
      console.warn('online: the guest saw a blank picture; sending a copy of each frame instead');
    }
    this.copyFrame();
    link.replaceVideo(this.copy.stream.getVideoTracks()[0]).catch((e) => console.warn('replace video', e));
  }

  /** Call right after each frame is drawn. */
  copyFrame() {
    const c = this.copy;
    if (!c || !this.connected) return;
    const src = this.canvas;
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
    return { x: k.x, y: k.y, jump: k.j, jumpPressed, grab: k.g };
  }

  /** The guest can spin the camera too (-1, 0 or 1). */
  cam() {
    return this.connected ? Math.max(-1, Math.min(1, this.keys.c)) : 0;
  }

  /** Per frame: send the menus/HUD when they change (at most 20 times a second). */
  update(dt: number) {
    const link = this.link;
    if (!link || !this.connected) return;
    this.uiTimer -= dt;
    if (this.uiTimer > 0) return;
    this.uiTimer = 0.05;
    const html = this.ui.innerHTML;
    const size = `${window.innerWidth}x${window.innerHeight}`;
    if (html !== this.lastHtml || size !== this.lastSize) {
      this.lastHtml = html;
      this.lastSize = size;
      link.sendCtl({ k: 'ui', html, w: window.innerWidth, h: window.innerHeight });
    }
    if (this.canvas.width !== this.videoW) {
      this.videoW = this.canvas.width;
      link.tuneVideo(this.videoW).catch((e) => console.warn('tune', e));
    }
  }

  /** Tell the guest something (e.g. that the host stopped). */
  send(m: CtlMsg) {
    this.link?.sendCtl(m);
  }

  stop() {
    this.stopped = true;
    this.link?.close();
    this.link = null;
    this.sig.onClose = null;
    this.sig.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.copy?.stream.getTracks().forEach((t) => t.stop());
    this.copy = null;
  }
}

export class OnlineGuest {
  stream: MediaStream | null = null;
  ui: { html: string; w: number; h: number } | null = null;
  onStream: ((s: MediaStream) => void) | null = null;
  onUi: ((html: string, w: number, h: number) => void) | null = null;
  onLost: ((why: string) => void) | null = null;
  private seq = 0;
  private jumps = 0;
  private lastSent = '';
  private resend = 0;

  private constructor(
    private sig: Signal,
    readonly link: PeerLink,
  ) {
    link.onStream = (s) => {
      this.stream = s;
      this.onStream?.(s);
    };
    link.onCtl = (m) => {
      if (m.k === 'ui' && typeof m.html === 'string') {
        this.ui = { html: m.html, w: Number(m.w) || 1280, h: Number(m.h) || 800 };
        this.onUi?.(this.ui.html, this.ui.w, this.ui.h);
      }
    };
    link.onLost = (why) => {
      this.sig.close();
      this.onLost?.(why);
    };
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
        guest?.link.close();
        sig.close();
        reject(new Error(msg));
      };
      const notFound = 'No game found with that code. Check it, and that your friend is still hosting.';
      let timer = setTimeout(() => fail(notFound), 12000);
      sig.onMessage = (m) => {
        if (m.from !== target) return;
        const d = m.data;
        if (d.k === 'expire' && !guest) fail(notFound);
        else if (d.k === 'busy') fail('That game already has a second player.');
        else if (d.k === 'version') fail('Your friend has a different version of the game. You both need the same file.');
        else if (d.k === 'offer' && typeof d.sdp === 'string' && !guest) {
          onProgress?.('Found your friend’s game. Connecting…');
          clearTimeout(timer);
          timer = setTimeout(
            () => fail('Couldn’t connect directly to your friend’s laptop. Being on the same Wi-Fi usually fixes this (some school and office networks block it).'),
            20000,
          );
          const link = new PeerLink(sig, target);
          guest = new OnlineGuest(sig, link);
          const g = guest;
          link.onOpen = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(g);
          };
          link.answer(d.sdp).catch((e) => fail('Connection failed: ' + (e instanceof Error ? e.message : String(e))));
        } else guest?.link.signal(d);
      };
      sig.send(target, { k: 'hello', v: NET_VERSION });
    });
  }

  /** Per frame: send this laptop's keys (either layout drives our mover). */
  sendKeys(kb: Keyboard | null, dt: number) {
    let m: MoveState = { x: 0, y: 0, jump: false, jumpPressed: false, grab: false };
    let cam = 0;
    if (kb) {
      const b = kb.bindings;
      m = mergeMoves(kb.readPlayer(b.p1), kb.readPlayer(b.p2));
      cam = (kb.isDown(b.camRight) ? 1 : 0) - (kb.isDown(b.camLeft) ? 1 : 0);
    }
    if (m.jumpPressed) this.jumps++;
    const state = `${m.x},${m.y},${+m.jump},${this.jumps},${+m.grab},${cam}`;
    // changes go at once; otherwise a reminder every so often (packets can get lost)
    this.resend -= dt;
    if (state === this.lastSent && this.resend > 0) return;
    this.lastSent = state;
    this.resend = 0.1;
    this.link.sendInput({ k: 'in', s: ++this.seq, x: m.x, y: m.y, j: m.jump, jc: this.jumps, g: m.grab, c: cam });
  }

  requestPause() {
    this.link.sendCtl({ k: 'pause' });
  }

  private blankChecks = 0;
  private blankAsked = false;
  /**
   * Every couple of seconds at first: is the picture actually arriving? If it
   * stays empty or pure black, ask the host for its fallback (some browsers
   * capture a 3D canvas as black frames).
   */
  checkPicture(v: HTMLVideoElement) {
    if (this.blankAsked || this.blankChecks > 8) return;
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
      this.link.sendCtl({ k: 'blank' });
    }
  }

  leave() {
    this.onLost = null;
    this.link.close();
    this.sig.close();
  }
}
