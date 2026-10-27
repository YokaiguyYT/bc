/**
 * Signalling: how two browsers find each other before they can talk directly.
 * Only a few small messages go through it (who wants to connect, and the
 * WebRTC offer/answer/candidates); the game itself then runs peer-to-peer.
 *
 * The default uses PeerJS's free public server (0.peerjs.com) purely as a
 * relay: no account, no key, nothing to pay for. Tests use a BroadcastChannel
 * between two tabs instead (`?net=local`), so they don't need the internet.
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

export function openSignal(id: string): Promise<Signal> {
  // tests: ?net=local (two tabs), or ?net=ws://… (a PeerJS server of our own)
  const net = new URLSearchParams(location.search).get('net');
  if (net === 'local') return openLocal(id);
  return openPeerServer(id, net?.startsWith('ws') ? net : SERVER);
}
