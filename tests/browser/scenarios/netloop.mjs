// The online link on its own, inside one page: a host PeerLink sends the game
// canvas as video plus messages to a guest PeerLink over an in-memory
// signalling pair. Runs in Chromium and in WebKit (Safari's engine), to check
// the browser supports everything online play needs.
export default async function ({ page, base }) {
  await page.goto(base);
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const out = { rtc: typeof RTCPeerConnection, capture: typeof HTMLCanvasElement.prototype.captureStream, bc: typeof BroadcastChannel };
    if (out.rtc !== 'function' || out.capture !== 'function') return out;
    const wait = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
    const { PeerLink } = window.__FF.net;
    const sigs = {};
    const mk = (id) => ({ id, onMessage: null, onClose: null, send: (to, data) => setTimeout(() => sigs[to].onMessage?.({ from: id, data }), 5), close() {} });
    sigs.h = mk('h');
    sigs.g = mk('g');
    const host = new PeerLink(sigs.h, 'g');
    const guest = new PeerLink(sigs.g, 'h');
    sigs.h.onMessage = (m) => host.signal(m.data);
    sigs.g.onMessage = (m) => (m.data.k === 'offer' ? guest.answer(m.data.sdp) : guest.signal(m.data));
    const canvas = document.querySelector('#game canvas');
    const stream = canvas.captureStream(30);
    let n = 0;
    const opened = new Promise((res) => (host.onOpen = guest.onOpen = () => ++n === 2 && res(true)));
    const gotStream = new Promise((res) => (guest.onStream = res));
    try {
      await host.offer(stream);
    } catch (e) {
      out.offerError = String(e);
      return out;
    }
    out.open = !!(await wait(opened, 15000));
    const ctl = new Promise((res) => (guest.onCtl = res));
    host.sendCtl({ k: 'ui', html: 'x'.repeat(50000) });
    out.bigMessage = (await wait(ctl, 5000))?.html?.length ?? 0;
    const inp = new Promise((res) => (host.onInput = res));
    guest.sendInput({ k: 'in', s: 1, x: 1 });
    out.input = (await wait(inp, 5000))?.x ?? null;
    const s = await wait(gotStream, 10000);
    out.stream = !!s;
    if (s) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      document.body.appendChild(v);
      v.play().catch(() => {});
      for (let i = 0; i < 100 && !v.videoWidth; i++) await new Promise((r) => setTimeout(r, 100));
      out.video = [v.videoWidth, v.videoHeight];
      v.remove();
    }
    try {
      await host.tuneVideo(canvas.width);
      out.tuned = true;
    } catch (e) {
      out.tuned = String(e);
    }
    const lost = new Promise((res) => (guest.onLost = res));
    host.close();
    out.byeSeen = await wait(lost, 5000);
    guest.close();
    return out;
  });
  console.log(JSON.stringify(r));
  if (r.rtc !== 'function') {
    // WebKitGTK builds can leave WebRTC out entirely (Safari always has it)
    console.log('skip  this browser build has no WebRTC');
    return;
  }
  const ok = r.open && r.bigMessage === 50000 && r.input === 1 && r.video?.[0] > 0 && r.tuned === true && r.byeSeen === 'left';
  console.log(ok ? 'ok   online link works in this browser' : 'FAIL online link');
  if (!ok) throw new Error('netloop failed');
}
