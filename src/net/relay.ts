import type { Signal } from './signal';
import type { CtlMsg, Pipe } from './peer';

/** No word from the other side for this long and we call it lost (s): generous, as a slow laptop can freeze for a while building a big level. */
const TIMEOUT = 25;

function toB64(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string) {
  const bin = atob(s);
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b.buffer;
}

/**
 * Messages between host and guest passed through the matchmaking server, for
 * networks (school Wi-Fi, mostly) that won't let two laptops connect directly.
 * Slower than a direct link and it can't carry video, but the "light" online
 * mode only needs a couple of kilobytes per snapshot.
 *
 * Each side keeps saying hi until the other answers, so it doesn't matter who
 * sets up first.
 */
export class RelayLink implements Pipe {
  readonly via = 'relay' as const;
  open = false;
  closed = false;
  rtt: number | null = null;
  onCtl: ((m: CtlMsg) => void) | null = null;
  onFast: ((m: CtlMsg | ArrayBuffer) => void) | null = null;
  onOpen: (() => void) | null = null;
  onLost: ((why: string) => void) | null = null;
  /** When we last heard anything from the other side (performance.now()). */
  lastHeard = performance.now();
  private timer: number;
  private beat = 0;

  constructor(
    private sig: Signal,
    readonly remote: string,
  ) {
    this.send({ c: 'hi' });
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  /** Swap in a new signalling connection (the old one dropped and came back). */
  useSignal(sig: Signal) {
    this.sig = sig;
  }

  private tick() {
    if (this.closed) return;
    if (!this.open) {
      this.send({ c: 'hi' });
      return;
    }
    if (++this.beat % 2 === 0) this.send({ c: 'p', t: performance.now() });
    if (performance.now() - this.lastHeard > TIMEOUT * 1000) this.lose('timeout');
  }

  /** A relayed message from the other side (the owner routes {k:'rl'} signals here). */
  receive(d: Record<string, unknown>) {
    if (this.closed) return;
    this.lastHeard = performance.now();
    if (!this.open) {
      this.open = true;
      // they might not have heard us yet: answer, so they open too
      if (d.c === 'hi') this.send({ c: 'hi' });
      this.onOpen?.();
    }
    switch (d.c) {
      case 'p':
        this.send({ c: 'q', t: d.t });
        break;
      case 'q': {
        const ms = performance.now() - Number(d.t);
        if (ms >= 0 && ms < 30000) this.rtt = this.rtt === null ? ms : this.rtt * 0.7 + ms * 0.3;
        break;
      }
      case 'c':
        this.onCtl?.(d.m as CtlMsg);
        break;
      case 'f':
        if (typeof d.b === 'string') this.onFast?.(fromB64(d.b));
        else if (d.m) this.onFast?.(d.m as CtlMsg);
        break;
      case 'bye':
        this.lose('left');
        break;
    }
  }

  sendCtl(m: CtlMsg) {
    if (this.open) this.send({ c: 'c', m });
  }

  sendFast(m: CtlMsg | ArrayBuffer) {
    if (!this.open) return;
    if (m instanceof ArrayBuffer) this.send({ c: 'f', b: toB64(m) });
    else this.send({ c: 'f', m });
  }

  private send(x: Record<string, unknown>) {
    if (!this.closed) this.sig.send(this.remote, { k: 'rl', ...x });
  }

  private lose(why: string) {
    if (this.closed) return;
    this.close(false);
    this.onLost?.(why);
  }

  close(sayBye = true) {
    if (this.closed) return;
    if (sayBye && this.open) this.send({ c: 'bye' });
    this.closed = true;
    this.open = false;
    clearInterval(this.timer);
  }
}
