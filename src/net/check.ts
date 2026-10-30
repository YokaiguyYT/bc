import { ICE } from './peer';
import { openMqtt, openPeerServer, signalServers, type Signal } from './signal';

/**
 * "Check this network": can this laptop reach the matchmaking servers, and is
 * a direct link between laptops likely? For working out, at school, why two
 * laptops won't connect (and what will happen if they do).
 */

export type CheckState = 'wait' | 'ok' | 'warn' | 'bad';
export interface CheckItem {
  id: 'peerjs' | 'mqtt' | 'direct';
  label: string;
  state: CheckState;
  detail: string;
}

const TIMEOUT = 10000;

/** Run every check at once; `onUpdate` gets the whole list each time one finishes. */
export async function checkNetwork(onUpdate: (items: CheckItem[]) => void): Promise<CheckItem[]> {
  const servers = signalServers();
  const items: CheckItem[] = [
    { id: 'peerjs', label: 'Matchmaking server 1 (PeerJS)', state: 'wait', detail: 'checking…' },
    { id: 'mqtt', label: 'Matchmaking server 2 (EMQX)', state: 'wait', detail: 'checking…' },
    { id: 'direct', label: 'Direct link between laptops', state: 'wait', detail: 'checking…' },
  ];
  const set = (id: CheckItem['id'], state: CheckState, detail: string) => {
    const it = items.find((x) => x.id === id)!;
    it.state = state;
    it.detail = detail;
    onUpdate(items.map((x) => ({ ...x })));
  };
  onUpdate(items.map((x) => ({ ...x })));
  const id = `fragile-freight-check-${Math.random().toString(36).slice(2, 10)}`;
  const server = async (key: 'peerjs' | 'mqtt', url: string | null, open: (id: string, url: string) => Promise<Signal>) => {
    if (!url) return set(key, 'warn', 'turned off on this page');
    const t0 = performance.now();
    try {
      const sig = await withTimeout(open(id, url), TIMEOUT);
      sig.close();
      set(key, 'ok', `reachable (${Math.round(performance.now() - t0)} ms)`);
    } catch (e) {
      const why = e instanceof Error && e.message === 'timeout' ? 'no answer' : 'blocked or down';
      set(key, 'bad', `${why}: this network may block it`);
    }
  };
  await Promise.all([server('peerjs', servers.peerjs, openPeerServer), server('mqtt', servers.mqtt, openMqtt), direct().then((r) => set('direct', r.state, r.detail))]);
  return items;
}

/** One line on what all that means for playing. */
export function checkSummary(items: CheckItem[]): { state: CheckState; text: string } {
  if (items.some((x) => x.state === 'wait')) return { state: 'wait', text: 'Checking this network…' };
  const servers = items.filter((x) => x.id !== 'direct');
  const direct = items.find((x) => x.id === 'direct')!;
  if (!servers.some((x) => x.state === 'ok'))
    return {
      state: 'bad',
      text: "This network blocks both matchmaking servers, so the laptops can't find each other here. Try another network (a phone's hotspot works), or play on one laptop.",
    };
  if (direct.state === 'ok') return { state: 'ok', text: 'Online play should work here, probably over a direct link (the smoothest).' };
  return { state: 'ok', text: "Online play should work here, through the matchmaking server's relay (a little slower, still fine)." };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Ask the free STUN servers for this laptop's public address: if they answer, direct links have a chance. */
async function direct(): Promise<{ state: CheckState; detail: string }> {
  if (typeof RTCPeerConnection === 'undefined') return { state: 'warn', detail: "this browser can't make direct links: the relay will carry the game" };
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const kinds = new Set<string>();
  try {
    pc.createDataChannel('check');
    await new Promise<void>((resolve) => {
      const done = setTimeout(resolve, 6000);
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          clearTimeout(done);
          resolve();
          return;
        }
        const m = / typ (\w+)/.exec(e.candidate.candidate);
        if (m) kinds.add(m[1]);
        if (kinds.has('srflx')) {
          clearTimeout(done);
          resolve();
        }
      };
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(() => resolve());
    });
  } finally {
    pc.close();
  }
  if (kinds.has('srflx')) return { state: 'ok', detail: 'likely to work (found this laptop on the internet)' };
  return { state: 'warn', detail: "uncertain here: if the laptops can't link directly, the relay carries the game" };
}
