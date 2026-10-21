// Two movers carry a long load end to end (in line) across open ground and we
// measure how far each drifts sideways. env KIND (default clock), DIST (m).
export default async function ({ page, base, shot }) {
  const kind = process.env.KIND ?? 'clock';
  await page.goto(base + `?level=playground&manual=1&cargo=${kind}`);
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate(() => { window.__FF.game.session.scriptedInput = true; });
  await adv(0.8);
  // lay the load on its back along X, movers at each end facing it
  if (process.env.RAMP) await page.evaluate(() => { window.__rampTest = true; });
  const half = await page.evaluate((kind) => {
    const s = window.__FF.game.session;
    const V = s.cargo.lastHitPos.constructor;
    const Q = s.cargo.body.rotation().constructor;
    const c = s.cargo.body.translation();
    const len = { clock: 1.03, glass: 0.88, crate: 0.45, tv: 0.32, aquarium: 0.45, cake: 0.37 }[kind] ?? 0.5;
    const lying = kind === 'clock';
    const q = new window.__FF.game.renderer.camera.quaternion.constructor();
    if (lying) q.setFromEuler(new window.__FF.game.renderer.camera.rotation.constructor(-Math.PI / 2, Math.PI / 2, 0, 'YXZ'));
    // RAMP=1: line up along Z in front of the practice ramp and carry up it (-Z)
    const ramp = !!window.__rampTest;
    if (ramp && lying) q.setFromEuler(new window.__FF.game.renderer.camera.rotation.constructor(-Math.PI / 2, 0, 0, 'YXZ'));
    s.cargo.reset(new V(0, lying ? 0.3 : c.y, ramp ? -3.6 : 0), lying ? q : Math.PI / 2);
    void Q;
    if (ramp) {
      s.players[0].teleport(new V(0, 0, -3.6 + len + 0.55), Math.PI);
      s.players[1].teleport(new V(0, 0, -3.6 - len - 0.55), 0);
    } else {
      s.players[0].teleport(new V(-len - 0.55, 0, 0), Math.PI / 2);
      s.players[1].teleport(new V(len + 0.55, 0, 0), -Math.PI / 2);
    }
    s.physics.snapLinks();
    return len;
  }, kind);
  await adv(0.5);
  // grab, stepping in until both have both hands on
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const s = window.__FF.game.session;
      const c = s.cargo.body.translation();
      let all = true;
      for (const p of s.players) {
        p.intent.grab = true;
        const empty = p.hands.some((h) => !h.grip);
        all &&= !empty;
        const b = p.body.translation();
        const dx = c.x - b.x;
        const dz = c.z - b.z;
        const l = Math.hypot(dx, dz) || 1;
        p.intent.moveX = empty ? (dx / l) * 0.25 : 0;
        p.intent.moveZ = empty ? (dz / l) * 0.25 : 0;
      }
      return all;
    });
    if (done) break;
    await adv(0.1);
  }
  await adv(0.8);
  const st = () =>
    page.evaluate(() => {
      const s = window.__FF.game.session;
      const r = (v) => [+v.x.toFixed(2), +v.z.toFixed(2)];
      const q = s.cargo.body.rotation();
      const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
      return {
        t: +s.physics.time.toFixed(1),
        cargo: r(s.cargo.body.translation()),
        yaw: +((yaw * 180) / Math.PI).toFixed(1),
        p: s.players.map((p) => r(p.body.translation())),
        face: s.players.map((p) => +((p.facingYaw * 180) / Math.PI).toFixed(0)),
        grips: s.players.map((p) => p.hands.map((h) => (h.grip ? h.grip.kind[0] : '-')).join('')),
      };
    });
  console.log('start', JSON.stringify(await st()));
  const dist = +(process.env.DIST ?? 6);
  // both press the same direction at 70%: P2 leads, P1 follows
  const ramp = !!process.env.RAMP;
  await page.evaluate((ramp) => window.__FF.game.session.players.forEach((p) => Object.assign(p.intent, ramp ? { moveX: 0, moveZ: -0.7 } : { moveX: 0.7, moveZ: 0 })), ramp);
  for (let i = 0; i < 16; i++) {
    await adv(0.5);
    const s = await st();
    console.log(JSON.stringify(s));
    if (ramp ? s.cargo[1] < -13 : s.cargo[0] > dist) break;
  }
  await shot(`inline_${kind}`);
}
