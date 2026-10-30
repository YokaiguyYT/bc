/**
 * Signalling: how two browsers find each other, and the relay that carries
 * their messages when the network won't let them connect directly.
 *
 * Two free public servers, no accounts, nothing to pay for, used at once so
 * that a network blocking one still leaves the other:
 * - PeerJS's matchmaking server (0.peerjs.com, port 443),
 * - EMQX's public MQTT broker (broker.emqx.io, secure WebSocket on port 8084).
 * Tests use a BroadcastChannel between two tabs instead (`?net=local`).
 */

export interface SignalMsg {
  /** Sender's id (filled in on receipt). */
  from: string;
  data: Record<string, unknown>;
}

export interface Signal {
  readonly id: string;
  send(to: string, data: Record<string, unknown>): void;
  onMessage: ((m: SignalMsg) => void) | null;
  /** Lost the relay (not fatal once the peers are connected). */
  onClose: ((reason: string) => void) | null;
  close(): void;
}

const SERVER = 'wss://0.peerjs.com:443/peerjs';
/** PeerJS's server only relays these message types; our own `data` rides inside. */
const RELAY_TYPE = 'OFFER';

function token() {
  return Math.random().toString(36).slice(2, 12);
}

/** Connect to the PeerJS relay under `id`. Rejects if the id is taken or the server can't be reached. */
export function openPeerServer(id: string, server = SERVER): Promise<Signal> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${server}?key=peerjs&id=${encodeURIComponent(id)}&token=${token()}&version=1.5.4`);
    } catch (e) {
      reject(e);
      return;
    }
    let open = false;
    let beat = 0;
    const sig: Signal = {
      id,
      onMessage: null,
      onClose: null,
      send(to, data) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: RELAY_TYPE, dst: to, payload: data }));
      },
      close() {
        clearInterval(beat);
        sig.onClose = null;
        try {
          ws.close();
        } catch {
          /* already closed */
        }
      },
    };
    const timer = setTimeout(() => {
      if (!open) {
        ws.close();
        reject(new Error('The matchmaking server didn’t answer. Check the internet connection and try again.'));
      }
    }, 10000);
    ws.onmessage = (ev) => {
      let m: { type?: string; src?: string; payload?: unknown };
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.type === 'OPEN') {
        open = true;
        clearTimeout(timer);
        // the server drops sockets that stay quiet
        beat = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'HEARTBEAT' })), 5000);
        resolve(sig);
      } else if (m.type === 'ID-TAKEN') {
        clearTimeout(timer);
        ws.close();
        reject(new Error('id-taken'));
      } else if (m.type === 'ERROR' && !open) {
        clearTimeout(timer);
        ws.close();
        reject(new Error('The matchmaking server refused the connection.'));
      } else if (m.type === 'EXPIRE' && m.src) {
        // a message to someone who isn't there (a wrong code, or the host left)
        sig.onMessage?.({ from: m.src, data: { k: 'expire' } });
      } else if (m.type === RELAY_TYPE && m.src && m.payload && typeof m.payload === 'object') {
        sig.onMessage?.({ from: m.src, data: m.payload as Record<string, unknown> });
      }
    };
    ws.onerror = () => {
      if (!open) {
        clearTimeout(timer);
        reject(new Error('Couldn’t reach the matchmaking server. Check the internet connection and try again.'));
      }
    };
    ws.onclose = () => {
      clearInterval(beat);
      if (open) sig.onClose?.('closed');
    };
  });
}

/** Same-browser signalling over a BroadcastChannel (tests, or two tabs on one machine). */
export function openLocal(id: string): Promise<Signal> {
  const bc = new BroadcastChannel('fragile-freight-signal');
  const sig: Signal = {
    id,
    onMessage: null,
    onClose: null,
    send(to, data) {
      bc.postMessage({ to, from: id, data });
    },
    close() {
      bc.close();
    },
  };
  bc.onmessage = (ev) => {
    const m = ev.data as { to: string; from: string; data: Record<string, unknown> };
    if (m?.to === id) sig.onMessage?.({ from: m.from, data: m.data });
  };
  return Promise.resolve(sig);
}

// ---------------------------------------------------------------- MQTT

const MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';
const topicOf = (who: string) => `fragile-freight/v2/${who}`;

/** MQTT's "remaining length": 7 bits a byte, high bit = more to come. */
function varLen(n: number) {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 128;
    out.push(b);
  } while (n > 0);
  return out;
}

function utf8(s: string) {
  const b = new TextEncoder().encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function packet(type: number, body: number[] | Uint8Array) {
  const head = [type, ...varLen(body.length)];
  const out = new Uint8Array(head.length + body.length);
  out.set(head, 0);
  out.set(body, head.length);
  return out;
}

/**
 * The few bits of MQTT 3.1.1 we need, over a WebSocket: connect, subscribe to
 * our own topic, publish to someone else's, ping. Everyone gets a topic named
 * after their id; sending to X is publishing to X's topic.
 */
export function openMqtt(id: string, url = MQTT_URL): Promise<Signal> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, 'mqtt');
    } catch (e) {
      reject(e);
      return;
    }
    ws.binaryType = 'arraybuffer';
    let open = false;
    let ping = 0;
    let pending = new Uint8Array(0);
    const sig: Signal = {
      id,
      onMessage: null,
      onClose: null,
      send(to, data) {
        if (ws.readyState !== WebSocket.OPEN) return;
        const payload = new TextEncoder().encode(JSON.stringify({ f: id, d: data }));
        const topic = utf8(topicOf(to));
        const body = new Uint8Array(topic.length + payload.length);
        body.set(topic, 0);
        body.set(payload, topic.length);
        ws.send(packet(0x30, body)); // PUBLISH, QoS 0
      },
      close() {
        clearInterval(ping);
        sig.onClose = null;
        try {
          if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([0xe0, 0])); // DISCONNECT
          ws.close();
        } catch {
          /* already closed */
        }
      },
    };
    const fail = (msg: string) => {
      if (open) return;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* never opened */
      }
      reject(new Error(msg));
    };
    const timer = setTimeout(() => fail('The backup matchmaking server didn’t answer.'), 10000);
    ws.onopen = () => {
      const client = 'ff' + Math.random().toString(36).slice(2, 14);
      // CONNECT: protocol "MQTT" level 4, clean session, keep-alive 30 s
      ws.send(packet(0x10, [...utf8('MQTT'), 4, 0x02, 0, 30, ...utf8(client)]));
    };
    const handle = (type: number, body: Uint8Array) => {
      const kind = type >> 4;
      if (kind === 2) {
        // CONNACK
        if (body[1] !== 0) return fail('The backup matchmaking server refused the connection.');
        ws.send(packet(0x82, [0, 1, ...utf8(topicOf(id)), 0])); // SUBSCRIBE, QoS 0
      } else if (kind === 9) {
        // SUBACK: ready
        if (open) return;
        open = true;
        clearTimeout(timer);
        ping = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(new Uint8Array([0xc0, 0])), 20000);
        resolve(sig);
      } else if (kind === 3) {
        // PUBLISH
        const tl = (body[0] << 8) | body[1];
        let at = 2 + tl;
        if ((type >> 1) & 3) at += 2; // QoS > 0 has a packet id
        try {
          const m = JSON.parse(new TextDecoder().decode(body.subarray(at))) as { f?: string; d?: Record<string, unknown> };
          if (m.f && m.d && typeof m.d === 'object' && m.f !== id) sig.onMessage?.({ from: m.f, data: m.d });
        } catch {
          /* not ours */
        }
      }
    };
    ws.onmessage = (ev) => {
      // packets can be split across WebSocket messages, or several in one
      const chunk = new Uint8Array(ev.data as ArrayBuffer);
      const all = new Uint8Array(pending.length + chunk.length);
      all.set(pending, 0);
      all.set(chunk, pending.length);
      let at = 0;
      for (;;) {
        if (all.length - at < 2) break;
        let len = 0;
        let mul = 1;
        let i = at + 1;
        let done = false;
        for (; i < all.length && i < at + 5; i++) {
          len += (all[i] & 127) * mul;
          mul *= 128;
          if (!(all[i] & 128)) {
            done = true;
            i++;
            break;
          }
        }
        if (!done || all.length - i < len) break;
        handle(all[at], all.subarray(i, i + len));
        at = i + len;
      }
      pending = all.slice(at);
    };
    ws.onerror = () => fail('Couldn’t reach the backup matchmaking server.');
    ws.onclose = () => {
      clearInterval(ping);
      if (open) sig.onClose?.('closed');
      else fail('Couldn’t reach the backup matchmaking server.');
    };
  });
}

// ---------------------------------------------------------------- both at once

/**
 * Several matchmaking servers as one: ready as soon as any of them is, a
 * message to someone goes out through the server they were last heard on (or
 * all of them, until we know), and duplicates are dropped.
 */
export function openMulti(id: string, ways: (() => Promise<Signal>)[]): Promise<Signal> {
  return new Promise((resolve, reject) => {
    const live: Signal[] = [];
    const route = new Map<string, Signal>();
    const seen = new Set<string>();
    const seenOrder: string[] = [];
    let failed = 0;
    let resolved = false;
    let closed = false;
    const sig: Signal = {
      id,
      onMessage: null,
      onClose: null,
      send(to, data) {
        const msg = { ...data, _i: Math.random().toString(36).slice(2, 10) };
        const via = route.get(to);
        if (via && live.includes(via)) via.send(to, msg);
        else for (const s of live) s.send(to, msg);
      },
      close() {
        closed = true;
        sig.onClose = null;
        for (const s of live.splice(0)) s.close();
      },
    };
    const adopt = (s: Signal, way: () => Promise<Signal>) => {
      if (closed) return s.close();
      live.push(s);
      s.onMessage = (m) => {
        route.set(m.from, s);
        const tag = typeof m.data._i === 'string' ? `${m.from}/${m.data._i}` : '';
        if (tag) {
          if (seen.has(tag)) return;
          seen.add(tag);
          seenOrder.push(tag);
          if (seenOrder.length > 500) seen.delete(seenOrder.shift()!);
        }
        sig.onMessage?.(m);
      };
      s.onClose = () => {
        const i = live.indexOf(s);
        if (i >= 0) live.splice(i, 1);
        for (const [k, v] of route) if (v === s) route.delete(k);
        // servers do drop connections now and then: quietly get back on (the other one carries on meanwhile)
        if (!closed) reconnect(way, 1500);
      };
      if (!resolved) {
        resolved = true;
        resolve(sig);
      }
    };
    const reconnect = (way: () => Promise<Signal>, wait: number) => {
      setTimeout(() => {
        if (closed) return;
        way().then(
          (s) => adopt(s, way),
          () => reconnect(way, Math.min(30000, wait * 2)),
        );
      }, wait);
    };
    for (const way of ways)
      way().then(
        (s) => adopt(s, way),
        (e: Error) => {
          // someone else has this code: pick another (once we're up on another server, just do without this one)
          if (e.message === 'id-taken' && !resolved) {
            resolved = true;
            sig.close();
            reject(e);
            return;
          }
          if (++failed === ways.length && !resolved) {
            resolved = true;
            closed = true; // and stop retrying
            reject(new Error('Couldn’t reach the matchmaking servers. Check the internet connection (some school networks block them; “Check this network” on the Play Online screen shows what’s blocked), then try again.'));
            return;
          }
          // up on another server already (or soon): keep trying this one now and then, in case the other laptop can only reach it
          reconnect(way, 5000);
        },
      );
  });
}

/**
 * Tests and troubleshooting, in the page address:
 * ?net=local (two tabs, no internet), ?net=ws://… (our own PeerJS server),
 * ?net=peerjs or ?net=mqtt (just that one), ?mqtt=ws://… (our own MQTT broker),
 * ?mqtt=0 (no MQTT).
 */
export function openSignal(id: string): Promise<Signal> {
  const s = signalServers();
  if (s.local) return openLocal(id);
  const ways: (() => Promise<Signal>)[] = [];
  if (s.peerjs) ways.push(() => openPeerServer(id, s.peerjs!));
  if (s.mqtt) ways.push(() => openMqtt(id, s.mqtt!));
  return openMulti(id, ways);
}

/** Which matchmaking servers this page uses (the address bar can swap or drop them, for tests). */
export function signalServers(): { local: boolean; peerjs: string | null; mqtt: string | null } {
  const q = new URLSearchParams(location.search);
  const net = q.get('net');
  const mqtt = q.get('mqtt');
  return {
    local: net === 'local',
    peerjs: net === 'mqtt' ? null : net?.startsWith('ws') ? net : SERVER,
    mqtt: net === 'peerjs' || mqtt === '0' ? null : mqtt?.startsWith('ws') ? mqtt : MQTT_URL,
  };
}
