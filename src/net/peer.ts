import type { Signal } from './signal';

/** Free public STUN servers: they only tell each laptop its public address. */
const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];

/** Bump when host and guest builds can no longer talk to each other. */
export const NET_VERSION = 2;

/** Messages bigger than this go over the control channel in pieces. */
const CHUNK = 16000;
/** No word from the other side for this long and we call it lost. */
const TIMEOUT = 9;
/** More than this queued on the fast channel: drop fast messages rather than send stale ones late. */
const FAST_BACKLOG = 256 * 1024;

export type CtlMsg = { k: string; [key: string]: unknown };

/**
 * One way of getting messages between host and guest: a direct WebRTC link
 * (fast, can carry video) or a relay through the matchmaking server (works on
 * networks that block direct connections). "ctl" messages always arrive, in
 * order; "fast" ones may be dropped (keys, snapshots: a newer one is coming).
 */
export interface Pipe {
  readonly via: 'direct' | 'relay';
  open: boolean;
  closed: boolean;
  onCtl: ((m: CtlMsg) => void) | null;
  onFast: ((m: CtlMsg | ArrayBuffer) => void) | null;
  onOpen: (() => void) | null;
  onLost: ((why: string) => void) | null;
  sendCtl(m: CtlMsg): void;
  sendFast(m: CtlMsg | ArrayBuffer): void;
  close(sayBye?: boolean): void;
}

/**
 * A direct WebRTC connection: a reliable control channel, an unreliable fast
 * one, and (from the host) an optional video track of the game picture.
 */
export class PeerLink implements Pipe {
  readonly via = 'direct' as const;
  readonly pc: RTCPeerConnection;
  readonly ctl: RTCDataChannel;
  readonly fast: RTCDataChannel;
  onCtl: ((m: CtlMsg) => void) | null = null;
  onFast: ((m: CtlMsg | ArrayBuffer) => void) | null = null;
  onStream: ((s: MediaStream) => void) | null = null;
  /** Fires once: the channels opened. */
  onOpen: (() => void) | null = null;
  onLost: ((why: string) => void) | null = null;
  open = false;
  closed = false;
  private pending: RTCIceCandidateInit[] = [];
  private remoteSet = false;
  private parts = new Map<string, string[]>();
  private lastHeard = performance.now();
  private pinger = 0;

  constructor(
    private sig: Signal,
    readonly remote: string,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    // both sides create the same two channels by id: no extra round trip
    this.ctl = this.pc.createDataChannel('ctl', { negotiated: true, id: 0 });
    this.fast = this.pc.createDataChannel('fast', { negotiated: true, id: 1, ordered: false, maxRetransmits: 0 });
    this.fast.binaryType = 'arraybuffer';
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.sig.send(this.remote, { k: 'ice', c: e.candidate.toJSON() });
    };
    this.pc.ontrack = (e) => {
      const r = e.receiver as RTCRtpReceiver & { playoutDelayHint?: number; jitterBufferTarget?: number };
      // show frames as soon as they arrive: this is a game, not a film
      try {
        if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0;
        if ('playoutDelayHint' in r) r.playoutDelayHint = 0;
      } catch {
        /* not supported */
      }
      this.onStream?.(e.streams[0] ?? new MediaStream([e.track]));
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed') this.lose('failed');
    };
    this.ctl.onopen = () => {
      this.open = true;
      this.lastHeard = performance.now();
      this.pinger = window.setInterval(() => {
        this.sendCtl({ k: 'ping' });
        if (performance.now() - this.lastHeard > TIMEOUT * 1000) this.lose('timeout');
      }, 1000);
      this.onOpen?.();
    };
    this.ctl.onclose = () => this.lose('closed');
    this.ctl.onmessage = (e) => this.receive(String(e.data));
    this.fast.onmessage = (e) => {
      this.lastHeard = performance.now();
      if (e.data instanceof ArrayBuffer) return this.onFast?.(e.data);
      try {
        this.onFast?.(JSON.parse(String(e.data)));
      } catch {
        /* garbled */
      }
    };
  }

  /** Host: make the offer (with a video slot, filled later if the guest wants the picture streamed). */
  async offer(withVideo: boolean) {
    if (withVideo) this.videoTx = this.pc.addTransceiver('video', { direction: 'sendonly' });
    await this.pc.setLocalDescription(await this.pc.createOffer());
    this.sig.send(this.remote, { k: 'offer', sdp: this.pc.localDescription!.sdp });
  }

  /** Guest: take the host's offer and answer it. */
  async answer(sdp: string) {
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    this.remoteSet = true;
    this.flushIce();
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    this.sig.send(this.remote, { k: 'answer', sdp: this.pc.localDescription!.sdp });
  }

  /** Signalling messages from the other side. */
  async signal(data: Record<string, unknown>) {
    if (this.closed) return;
    try {
      if (data.k === 'answer' && typeof data.sdp === 'string') {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        this.remoteSet = true;
        this.flushIce();
      } else if (data.k === 'ice' && data.c) {
        this.pending.push(data.c as RTCIceCandidateInit);
        this.flushIce();
      }
    } catch (e) {
      console.warn('signal', e);
    }
  }

  private flushIce() {
    if (!this.remoteSet) return;
    for (const c of this.pending.splice(0)) this.pc.addIceCandidate(c).catch((e) => console.warn('ice', e));
  }

  private videoTx: RTCRtpTransceiver | null = null;
  private get videoSender() {
    return this.videoTx?.sender ?? null;
  }

  /** Host: whether a video slot was offered (and so the picture can be streamed). */
  get canVideo() {
    return !!this.videoTx;
  }

  /** Host: start (or stop, with null) sending the game picture. */
  async setVideo(track: MediaStreamTrack | null) {
    await this.videoSender?.replaceTrack(track);
  }

  /** Host: keep the stream light enough to send smoothly. */
  async tuneVideo(width: number) {
    const s = this.videoSender;
    if (!s?.track) return;
    const p = s.getParameters() as RTCRtpSendParameters & { degradationPreference?: string };
    if (!p.encodings?.length) return;
    const e = p.encodings[0];
    e.maxBitrate = 6_000_000;
    e.maxFramerate = 60;
    e.scaleResolutionDownBy = Math.max(1, width / 1600);
    try {
      await s.setParameters({ ...p, degradationPreference: 'maintain-framerate' } as RTCRtpSendParameters);
    } catch {
      await s.setParameters(p).catch((err) => console.warn('video params', err));
    }
  }

  sendCtl(m: CtlMsg) {
    if (!this.open || this.ctl.readyState !== 'open') return;
    const s = JSON.stringify(m);
    if (s.length <= CHUNK) {
      this.ctl.send(s);
      return;
    }
    const id = Math.random().toString(36).slice(2, 8);
    const n = Math.ceil(s.length / CHUNK);
    for (let i = 0; i < n; i++) this.ctl.send(JSON.stringify({ k: 'part', id, i, n, s: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
  }

  sendFast(m: CtlMsg | ArrayBuffer) {
    if (!this.open || this.fast.readyState !== 'open' || this.fast.bufferedAmount > FAST_BACKLOG) return;
    if (m instanceof ArrayBuffer) this.fast.send(m);
    else this.fast.send(JSON.stringify(m));
  }

  private receive(raw: string) {
    this.lastHeard = performance.now();
    let m: CtlMsg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.k === 'ping') return;
    if (m.k === 'bye') return this.lose('left');
    if (m.k === 'part') {
      const id = String(m.id);
      const list = this.parts.get(id) ?? [];
      list[m.i as number] = String(m.s);
      this.parts.set(id, list);
      if (list.filter((x) => x !== undefined).length === m.n) {
        this.parts.delete(id);
        this.receive(list.join(''));
      }
      return;
    }
    this.onCtl?.(m);
  }

  private lose(why: string) {
    if (this.closed) return;
    this.close(false);
    this.onLost?.(why);
  }

  /** Hang up (telling the other side, if asked). */
  close(sayBye = true) {
    if (this.closed) return;
    if (sayBye) this.sendCtl({ k: 'bye' });
    this.closed = true;
    this.open = false;
    clearInterval(this.pinger);
    try {
      this.pc.close();
    } catch {
      /* already closed */
    }
  }
}
