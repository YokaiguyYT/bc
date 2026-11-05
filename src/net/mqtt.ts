/**
 * A tiny MQTT 3.1.1 client over a WebSocket (QoS 0 only): connect, subscribe
 * to topic filters (with + and # wildcards), publish (optionally retained, so
 * the broker keeps the last message on a topic for anyone who subscribes
 * later). Used by the world leaderboard and versus matchmaking, on free public
 * brokers: no account, nothing to pay.
 */

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

export type MqttHandler = (topic: string, text: string, retained: boolean) => void;

export class MqttClient {
  private ws: WebSocket | null = null;
  private ping = 0;
  private pending = new Uint8Array(0);
  private nextId = 1;
  private acks = new Map<number, () => void>();
  private handlers = new Set<MqttHandler>();
  /** Connected and ready. */
  open = false;
  onClose: (() => void) | null = null;

  constructor(readonly url: string) {}

  /** Connect (gives up after `timeout` ms). */
  connect(timeout = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(this.url, 'mqtt');
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      let settled = false;
      const done = (err?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          try {
            ws.close();
          } catch {
            /* never opened */
          }
          reject(new Error(err));
        } else resolve();
      };
      const timer = setTimeout(() => done('timed out'), timeout);
      ws.onopen = () => {
        const client = 'ffb' + Math.random().toString(36).slice(2, 14);
        ws.send(packet(0x10, [...utf8('MQTT'), 4, 0x02, 0, 30, ...utf8(client)]));
      };
      ws.onmessage = (ev) => {
        const chunk = new Uint8Array(ev.data as ArrayBuffer);
        const all = new Uint8Array(this.pending.length + chunk.length);
        all.set(this.pending, 0);
        all.set(chunk, this.pending.length);
        let at = 0;
        for (;;) {
          if (all.length - at < 2) break;
          let len = 0;
          let mul = 1;
          let i = at + 1;
          let ok = false;
          for (; i < all.length && i < at + 5; i++) {
            len += (all[i] & 127) * mul;
            mul *= 128;
            if (!(all[i] & 128)) {
              ok = true;
              i++;
              break;
            }
          }
          if (!ok || all.length - i < len) break;
          const type = all[at];
          const body = all.subarray(i, i + len);
          const kind = type >> 4;
          if (kind === 2) {
            // CONNACK
            if (body[1] !== 0) done('refused');
            else {
              this.open = true;
              this.ping = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(new Uint8Array([0xc0, 0])), 20000);
              done();
            }
          } else if (kind === 9) {
            // SUBACK
            const id = (body[0] << 8) | body[1];
            this.acks.get(id)?.();
            this.acks.delete(id);
          } else if (kind === 3) {
            // PUBLISH
            const tl = (body[0] << 8) | body[1];
            const topic = new TextDecoder().decode(body.subarray(2, 2 + tl));
            let p = 2 + tl;
            if ((type >> 1) & 3) p += 2;
            const text = new TextDecoder().decode(body.subarray(p));
            for (const h of this.handlers) h(topic, text, (type & 1) === 1);
          }
          at = i + len;
        }
        this.pending = all.slice(at);
      };
      ws.onerror = () => done('could not connect');
      ws.onclose = () => {
        clearInterval(this.ping);
        const was = this.open;
        this.open = false;
        done('closed');
        if (was) this.onClose?.();
      };
    });
  }

  on(h: MqttHandler) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  /** Subscribe; resolves when the broker has acknowledged (retained messages arrive right after). */
  subscribe(filter: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ws || !this.open) return resolve();
      const id = this.nextId++ & 0xffff || 1;
      this.acks.set(id, resolve);
      this.ws.send(packet(0x82, [id >> 8, id & 255, ...utf8(filter), 0]));
      setTimeout(() => {
        if (this.acks.delete(id)) resolve();
      }, 5000);
    });
  }

  unsubscribe(filter: string) {
    if (!this.ws || !this.open) return;
    const id = this.nextId++ & 0xffff || 1;
    this.ws.send(packet(0xa2, [id >> 8, id & 255, ...utf8(filter)]));
  }

  publish(topic: string, text: string, retain = false) {
    if (!this.ws || !this.open) return;
    const t = utf8(topic);
    const p = new TextEncoder().encode(text);
    const body = new Uint8Array(t.length + p.length);
    body.set(t, 0);
    body.set(p, t.length);
    this.ws.send(packet(retain ? 0x31 : 0x30, body));
  }

  close() {
    clearInterval(this.ping);
    this.onClose = null;
    this.handlers.clear();
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(new Uint8Array([0xe0, 0]));
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.open = false;
  }
}
