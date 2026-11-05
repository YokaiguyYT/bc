import { openSignal, type Signal } from './signal';
import { NET_VERSION, type CtlMsg } from './peer';
import { RelayLink } from './relay';
import { allowed, Conn, makeCode } from './Online';
import { MqttClient } from './mqtt';
import { boardUrls } from '../game/board';

/**
 * Versus online: two laptops, each with its own crew (two players on one
 * keyboard, or one player and the robot buddy), race the same job. Each
 * laptop plays its own copy; all that goes between them is where each crew is
 * (about ten times a second) and when they finish. The other crew shows as
 * see-through ghosts.
 *
 * Connecting is like co-op (a five-letter code on the free matchmaking
 * server, relayed through it), under codes of its own. Quick match finds a
 * stranger who's also looking, through the same free public brokers as the
 * leaderboard: whoever's been waiting hosts, the other joins their code.
 */

const raceId = (code: string) => `fragile-freight-race-${code.toLowerCase()}`;

export interface RaceMsg extends CtlMsg {
  k: string;
}

export class RaceLink {
  onMsg: ((m: RaceMsg) => void) | null = null;
  onLost: (() => void) | null = null;
  /** The other crew's name (their board name, or "Friend"). */
  theirName = 'Friend';
  private closed = false;

  private constructor(
    readonly role: 'host' | 'guest',
    readonly code: string,
    private sig: Signal,
    private conn: Conn,
  ) {
    conn.onCtl = (m) => this.onMsg?.(m as RaceMsg);
    conn.onFast = (m) => {
      if (!(m instanceof ArrayBuffer)) this.onMsg?.(m as RaceMsg);
    };
    conn.onLost = () => {
      if (!this.closed) this.onLost?.();
    };
  }

  /** Host a race: get a code, and resolve once someone joins it. `onCode` shows the code meanwhile. */
  static async host(onCode: (code: string, stop: () => void) => void, code = makeCode()): Promise<RaceLink> {
    const sig = await openSignal(raceId(code));
    return new Promise((resolve, reject) => {
      let conn: Conn | null = null;
      let guest = '';
      let done = false;
      const stop = () => {
        if (done) return;
        done = true;
        conn?.close();
        sig.close();
        reject(new Error('stopped'));
      };
      onCode(code, stop);
      sig.onMessage = (m) => {
        const d = m.data;
        if (d.k === 'hello') {
          if (d.v !== NET_VERSION) return sig.send(m.from, { k: 'version', v: NET_VERSION });
          if (conn && guest !== m.from) return sig.send(m.from, { k: 'busy' });
          if (conn) return sig.send(m.from, { k: 'welcome', v: NET_VERSION });
          guest = m.from;
          const c = new Conn();
          conn = c;
          c.onChange = () => {
            if (!c.open || done) return;
            done = true;
            const link = new RaceLink('host', code, sig, c);
            link.theirName = typeof d.name === 'string' ? d.name.slice(0, 14) : 'Friend';
            resolve(link);
          };
          sig.send(m.from, { k: 'welcome', v: NET_VERSION });
          if (allowed('relay')) c.attach(new RelayLink(sig, m.from));
        } else if (conn && m.from === guest && d.k === 'rl') conn.relay?.receive(d);
      };
    });
  }

  /** Join a friend's race by its code. */
  static async join(code: string, name: string | null): Promise<RaceLink> {
    const sig = await openSignal(`fragile-freight-rg${Math.random().toString(36).slice(2, 12)}`);
    const target = raceId(code);
    return new Promise((resolve, reject) => {
      let conn: Conn | null = null;
      let done = false;
      const fail = (msg: string) => {
        if (done) return;
        done = true;
        clearInterval(hello);
        clearTimeout(timer);
        conn?.close();
        sig.close();
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail('No race found with that code.'), 15000);
      const sayHello = () => sig.send(target, { k: 'hello', v: NET_VERSION, name });
      const hello = setInterval(() => !conn && sayHello(), 2500);
      sig.onMessage = (m) => {
        if (m.from !== target) return;
        const d = m.data;
        if (d.k === 'busy') fail('That race already has two crews.');
        else if (d.k === 'version') fail('Your friend has a different version of the game. You both need the same file.');
        else if (d.k === 'welcome' && !conn) {
          clearInterval(hello);
          const c = new Conn();
          conn = c;
          c.onChange = () => {
            if (!c.open || done) return;
            done = true;
            clearTimeout(timer);
            resolve(new RaceLink('guest', code, sig, c));
          };
          if (allowed('relay')) c.attach(new RelayLink(sig, target));
        } else if (d.k === 'rl') conn?.relay?.receive(d);
      };
      sayHello();
    });
  }

  send(m: RaceMsg) {
    this.conn.sendCtl(m);
  }

  /** Positions: dropped if late, that's fine. */
  sendFast(m: RaceMsg) {
    this.conn.sendFast(m);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.conn.sendCtl({ k: 'bye' });
    } catch {
      /* gone already */
    }
    this.conn.close();
    this.sig.close();
  }
}

/**
 * Quick match: find someone else who's looking right now. Everyone looking
 * hosts a race under a fresh code and says so on a public "looking" topic;
 * whoever sees an older announcement than their own joins that code. Gives up
 * after `wait` seconds (then it's the AI rivals).
 */
export async function quickMatch(name: string | null, wait = 20, onStatus?: (msg: string) => void): Promise<RaceLink | null> {
  const urls = boardUrls();
  const mq = await (async () => {
    for (const u of urls) {
      const c = new MqttClient(u);
      try {
        await c.connect(6000);
        return c;
      } catch {
        /* the next one */
      }
    }
    return null;
  })();
  if (!mq) return null;
  const topic = `fragile-freight/lobby1/v${NET_VERSION}`;
  const me = { code: makeCode(), since: Date.now(), id: Math.random().toString(36).slice(2, 10) };
  let stopHost: (() => void) | null = null;
  let settled = false;
  return new Promise((resolve) => {
    const finish = (link: RaceLink | null) => {
      if (settled) {
        link?.close();
        return;
      }
      settled = true;
      clearInterval(say);
      clearTimeout(giveUp);
      mq.close();
      if (!link) stopHost?.();
      resolve(link);
    };
    // host under our code meanwhile
    RaceLink.host((_, stop) => (stopHost = stop), me.code).then(finish, () => {});
    const say = setInterval(() => mq.publish(topic, JSON.stringify(me)), 2000);
    mq.on((t, text) => {
      if (t !== topic || settled) return;
      try {
        const o = JSON.parse(text) as { code?: string; since?: number; id?: string };
        if (!o.code || o.id === me.id || typeof o.since !== 'number') return;
        // the one who's been waiting longer hosts; the other joins
        if (o.since < me.since || (o.since === me.since && String(o.id) < me.id)) {
          onStatus?.('Found someone! Connecting…');
          settled = true;
          clearInterval(say);
          clearTimeout(giveUp);
          mq.close();
          stopHost?.();
          RaceLink.join(o.code, name).then(resolve, () => resolve(null));
        }
      } catch {
        /* not ours */
      }
    });
    void mq.subscribe(topic).then(() => mq.publish(topic, JSON.stringify(me)));
    const giveUp = setTimeout(() => finish(null), wait * 1000);
  });
}
