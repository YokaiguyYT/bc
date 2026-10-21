// Scripted co-op carry through a level, segment by segment.
// env LEVEL (default delivery), SEG (comma list of segment names to run).
//
// Each segment teleports the cargo + both movers to a start pose (movers on
// either side of the cargo, across the direction of travel), grabs, then
// steers the pair through waypoints and reports cargo health.
const ROUTES = {
  delivery: {
    // after the truck ride: out of the truck bed onto the dock
    unload: { wait: 15, cargo: null, path: [[3.5, -35]] },
    // follow the revolving door round through its south half (hub at 8, -35)
    door: { cargo: [4.0, 1.4, -35], yaw: 90, path: [[5.4, -35], [6.3, -34.3], [7.2, -33.4], [8, -33.2], [8.8, -33.4], [9.7, -34.3], [10.6, -35], [11.6, -35]] },
    lobby: { cargo: [11, 1.4, -31.2], yaw: 90, path: [[15.2, -31.2], [15.6, -38.5], [16.1, -41.3]] },
    lift: { cargo: [16.1, 1.4, -41.2], yaw: 0, path: [], ride: 9 },
    walkway: { cargo: [12.6, 7.6, -41.3], yaw: 0, path: [[3, -41.3], [0.6, -41.3], [-1.8, -44.5], [-2.6, -47.8]], place: true },
  },
};

export default async function ({ page, base, shot }) {
  const id = process.env.LEVEL ?? 'delivery';
  const route = ROUTES[id];
  const only = (process.env.SEG ?? '').split(',').filter(Boolean);
  await page.goto(base + `?level=${id}&manual=1`);
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await page.evaluate(() => { window.__FF.game.session.scriptedInput = true; });
  const st = () =>
    page.evaluate(() => {
      const s = window.__FF.game.session;
      const r = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
      return {
        cargo: r(s.cargo.body.translation()),
        health: +s.cargo.health.toFixed(3),
        grips: s.players.map((p) => p.hands.map((h) => (h.grip ? 1 : 0)).join('')),
        players: s.players.map((p) => [...r(p.body.translation()), p.state]),
        state: s.state,
        cp: s.checkpoint,
        goal: +s.goalProgress.toFixed(2),
      };
    });
  const setBoth = (o) => page.evaluate((o) => window.__FF.game.session.players.forEach((p) => Object.assign(p.intent, o)), o);

  /** Put the cargo at `c` (yaw deg) and the movers either side of it, across travel dir `yaw`. */
  async function setup(c, yaw) {
    await page.evaluate(
      ([c, yaw]) => {
        const s = window.__FF.game.session;
        const V = s.cargo.lastHitPos.constructor;
        const y = (yaw * Math.PI) / 180;
        // cargo's long side across the direction of travel d = (sin y, cos y)
        s.cargo.reset(new V(c[0], c[1], c[2]), y);
        const side = new V(Math.cos(y), 0, -Math.sin(y));
        const half = 0.45 + 0.5;
        const foot = c[1] - 0.3;
        const face = Math.atan2(side.x, side.z);
        s.players[0].teleport(new V(c[0] - side.x * half, foot, c[2] - side.z * half), face);
        s.players[1].teleport(new V(c[0] + side.x * half, foot, c[2] + side.z * half), face + Math.PI);
        s.physics.snapLinks();
      },
      [c, yaw],
    );
    await adv(0.6);
  }

  async function grab() {
    await setBoth({ grab: true });
    for (let i = 0; i < 25; i++) {
      await adv(0.1);
      const s = await st();
      if (s.grips.every((g) => g === '11')) break;
    }
    await adv(0.7);
  }

  /** Steer the carrying pair to (tx, tz); runs inside the page (no per-step round trips). */
  async function carryTo(tx, tz, maxT = 16, speed = 0.65) {
    return page.evaluate(
      ([tx, tz, maxT, speed]) => {
        const g = window.__FF.game;
        const s = g.session;
        let t = 0;
        for (; t < maxT; t += 0.1) {
          const c = s.cargo.body.translation();
          const dx = tx - c.x;
          const dz = tz - c.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.25) break;
          const k = Math.min(speed, 0.25 + d * 0.5) / d;
          s.players.forEach((p) => Object.assign(p.intent, { moveX: dx * k, moveZ: dz * k }));
          g.advance(0.1, 60, false);
          if (window.__trace) {
            const cg = s.cargo;
            const q = cg.body.rotation();
            const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
            const w = cg.body.angvel();
            const v = cg.body.linvel();
            window.__trace.push({
              t: +s.physics.time.toFixed(1),
              water: +(cg.water ?? 0).toFixed(3),
              slosh: cg.slosh ? [+cg.slosh.x.toFixed(2), +cg.slosh.y.toFixed(2)] : null,
              g: [+cg.gEff.x.toFixed(1), +cg.gEff.y.toFixed(1), +cg.gEff.z.toFixed(1)],
              tilt: +((Math.acos(Math.max(-1, Math.min(1, upY))) * 180) / Math.PI).toFixed(1),
              w: [+w.x.toFixed(1), +w.y.toFixed(1), +w.z.toFixed(1)],
              v: [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)],
            });
          }
        }
        s.players.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0 }));
        g.advance(0.4, 60, false);
        return t;
      },
      [tx, tz, maxT, speed],
    );
  }

  // debug: record hard impacts and what the cargo was touching
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    window.__impacts = [];
    s.events.on('impact', (e) => {
      if (e.speed < 1.5) return;
      const w = s.physics.world;
      const touching = new Set();
      for (const c of s.cargo.colliders)
        w.contactPairsWith(c, (o) => {
          const inf = s.physics.info(o);
          touching.add(`${inf?.kind ?? '?'}:${inf?.material ?? ''}:${o.parent()?.isDynamic() ? 'dyn' : o.parent()?.isKinematic() ? 'kin' : 'fix'}`);
        });
      const v = s.cargo.body.linvel();
      window.__impacts.push({ t: +s.physics.time.toFixed(2), shock: +e.speed.toFixed(2), at: [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2)], v: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)], touching: [...touching] });
    });
  });
  const dumpImpacts = async () => {
    const list = await page.evaluate(() => window.__impacts.splice(0));
    for (const i of list.slice(0, 12)) console.log('   impact', JSON.stringify(i));
    if (list.length > 12) console.log(`   … ${list.length - 12} more`);
  };

  for (const [name, seg] of Object.entries(route)) {
    if (only.length && !only.includes(name)) continue;
    if (seg.wait) await adv(seg.wait);
    if (seg.cargo) await setup(seg.cargo, seg.yaw ?? 0);
    else {
      const c = (await st()).cargo;
      await setup([c[0], c[1] + 0.05, c[2]], 90);
    }
    await grab();
    if (process.env.TRACE) await page.evaluate(() => { window.__trace = []; });
    const h0 = (await st()).health;
    for (const [x, z] of seg.path) {
      const t = await carryTo(x, z);
      const s = await st();
      console.log(name.padEnd(8), `→ [${x}, ${z}]`, `${t.toFixed(1)}s`, JSON.stringify(s));
      await dumpImpacts();
      if (process.env.TRACE) for (const r of await page.evaluate(() => window.__trace.splice(0))) console.log('   ', JSON.stringify(r));
    }
    if (seg.ride) {
      await adv(seg.ride);
      console.log(name.padEnd(8), 'after ride', JSON.stringify(await st()));
    }
    await shot(`deliver_${name}`);
    if (seg.place || seg.path.length) {
      await setBoth({ grab: false });
      await adv(2.5);
    }
    const end = await st();
    console.log(name.padEnd(8), `done: health ${h0} → ${end.health}`, JSON.stringify(end));
  }
}
