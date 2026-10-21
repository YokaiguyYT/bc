// Scripted co-op carry through a level, segment by segment.
// env LEVEL (default delivery), SEG (comma list of segment names to run).
//
// Each segment teleports the cargo + both movers to a start pose (movers on
// either side of the cargo, across the direction of travel), grabs, then
// steers the pair through waypoints and reports cargo health.
// Waypoints are [x, z, formation?]: 'inline' (one mover leads), 'broad'
// (side by side), 'front' (both movers on the same side, load in front).
// Without a formation both movers just push the same direction.
const ROUTES = {
  // one continuous run, no teleports after the first grab
  'delivery-full': {
    unload: { wait: 15, cargo: null, path: [[3.5, -35, 'broad']] },
    door: { keep: true, path: [[5.4, -35], [6.3, -34.3], [7.2, -33.4], [8, -33.2], [8.8, -33.4], [9.7, -34.3], [10.4, -35]] },
    lobby: { keep: true, path: [[10.4, -30.2, 'inline'], [15.6, -30.2, 'broad'], [15.6, -38.6, 'inline'], [16.05, -41.4, 'inline']] },
    lift: { keep: true, path: [], ride: 9.5 },
    walkway: { keep: true, path: [[13.6, -41.3, 'inline'], [3, -41.3, 'inline'], [0, -41.3, 'inline'], [-2, -41.6, 'inline'], [-2, -47.4, 'broad'], [-2, -48.42, 'broad']], place: true },
  },
  // just the van ramp: clock lying along Z at the foot of the ramp, both press forward
  'mansion-van': {
    van: { cargo: [6, 0.4, 10.6], yaw: 0, lying: true, path: [[6, 22.6, 'inline']], place: true },
  },
  // inline waypoints are for the leading mover
  'mansion-full': {
    study: { start: true, path: [[-4.6, -8.8, 'inline'], [2.6, -8.8, 'inline']] },
    stairs: { keep: true, path: [[8, -8.8, 'inline'], [12.4, -8.8, 'inline'], [12.4, -6.2, 'inline']] },
    hall: { keep: true, path: [[11.6, 3.4, 'inline'], [6.6, 4.6, 'inline'], [6, 7.0, 'inline'], [6, 12.5, 'inline'], [6, 18.6, 'inline'], [6, 22.6, 'inline']], place: true },
  },
  delivery: {
    // after the truck ride: out of the truck bed onto the dock
    unload: { wait: 15, cargo: null, path: [[3.5, -35]] },
    // follow the revolving door round through its south half (hub at 8, -35)
    door: { cargo: [4.0, 1.4, -35], yaw: 90, path: [[5.4, -35], [6.3, -34.3], [7.2, -33.4], [8, -33.2], [8.8, -33.4], [9.7, -34.3], [10.6, -35], [11.6, -35]] },
    lobby: { cargo: [11, 1.4, -31.2], yaw: 90, path: [[15.2, -31.2], [15.6, -38.5], [16.1, -41.3]] },
    lift: { cargo: [16.1, 1.4, -41.2], yaw: 0, path: [], ride: 9 },
    // along the walkway in line, through the flat door, then broadside up to the stand
    walkway: { cargo: [12.6, 7.6, -41.3], yaw: 0, path: [[3, -41.3, 'inline'], [0, -41.3, 'inline'], [-2, -41.6, 'inline'], [-2, -47.4, 'broad'], [-2, -48.42, 'broad']] },
  },
};

export default async function ({ page, base, shot }) {
  const routeId = process.env.ROUTE ?? process.env.LEVEL ?? 'delivery';
  const route = ROUTES[routeId];
  const id = routeId.split('-')[0];
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
        // per hand: c = cargo, s = static, p = prop, n = npc/player, - = empty
        grips: s.players.map((p) => p.hands.map((h) => (h.grip ? (h.grip.kind === 'cargo' ? 'c' : h.grip.kind === 'static' ? 's' : h.grip.kind === 'prop' ? 'p' : 'n') : '-')).join('')),
        players: s.players.map((p) => [...r(p.body.translation()), p.state]),
        state: s.state,
        cp: s.checkpoint,
        goal: +s.goalProgress.toFixed(2),
      };
    });
  const setBoth = (o) => page.evaluate((o) => window.__FF.game.session.players.forEach((p) => Object.assign(p.intent, o)), o);

  /**
   * Put the cargo at `c` with its long side across the travel direction `yaw`
   * (deg) and the movers either side of it ('sides') or both behind it ('front').
   */
  async function setup(c, yaw, mode = 'sides', lying = false) {
    await page.evaluate(
      ([c, yaw, mode, lying]) => {
        const s = window.__FF.game.session;
        const V = s.cargo.lastHitPos.constructor;
        const y = (yaw * Math.PI) / 180;
        if (lying) {
          // on its back, long axis along the travel direction
          const E = window.__FF.game.renderer.camera.rotation.constructor;
          const q = new window.__FF.game.renderer.camera.quaternion.constructor().setFromEuler(new E(-Math.PI / 2, y + Math.PI, 0, 'YXZ'));
          s.cargo.reset(new V(c[0], c[1], c[2]), q);
        } else s.cargo.reset(new V(c[0], c[1], c[2]), y);
        const d = new V(Math.sin(y), 0, Math.cos(y));
        const side = new V(Math.cos(y), 0, -Math.sin(y));
        const foot = c[1] - 0.3;
        if (mode === 'front') {
          for (const [i, sg] of [[0, -1], [1, 1]]) {
            const p = new V(c[0] - d.x * 0.78 + side.x * sg * 0.3, foot, c[2] - d.z * 0.78 + side.z * sg * 0.3);
            s.players[i].teleport(p, y);
          }
        } else if (lying) {
          // movers at the two ends, along the travel direction
          const half = 1.03 + 0.55;
          const face = Math.atan2(d.x, d.z);
          s.players[0].teleport(new V(c[0] - d.x * half, foot - 0.1, c[2] - d.z * half), face);
          s.players[1].teleport(new V(c[0] + d.x * half, foot - 0.1, c[2] + d.z * half), face + Math.PI);
        } else {
          const half = 0.45 + 0.5;
          const face = Math.atan2(side.x, side.z);
          s.players[0].teleport(new V(c[0] - side.x * half, foot, c[2] - side.z * half), face);
          s.players[1].teleport(new V(c[0] + side.x * half, foot, c[2] + side.z * half), face + Math.PI);
        }
        s.physics.snapLinks();
      },
      [c, yaw, mode, lying],
    );
    await adv(0.6);
  }

  /** Both movers get both hands on (stepping in, letting go and retrying if a hand misses). */
  async function grab() {
    for (let attempt = 0; attempt < 4; attempt++) {
      await setBoth({ grab: true });
      for (let i = 0; i < 25; i++) {
        // shuffle toward the load while a hand is still empty, like a person would
        await page.evaluate(() => {
          const s = window.__FF.game.session;
          const c = s.cargo.body.translation();
          for (const p of s.players) {
            const empty = p.hands.some((h) => !h.grip);
            const b = p.body.translation();
            // distance to the load's surface, not its centre
            let near = 9;
            for (const col of s.cargo.colliders) {
              const pr = col.projectPoint(b, true);
              if (pr) near = Math.min(near, Math.hypot(pr.point.x - b.x, pr.point.z - b.z));
            }
            const dx = c.x - b.x;
            const dz = c.z - b.z;
            const l = Math.hypot(dx, dz) || 1;
            const step = empty && near > 0.45;
            Object.assign(p.intent, step ? { moveX: (dx / l) * 0.25, moveZ: (dz / l) * 0.25 } : { moveX: 0, moveZ: 0 });
          }
        });
        await adv(0.1);
        const s = await st();
        if (s.grips.every((g) => g === 'cc')) {
          await setBoth({ moveX: 0, moveZ: 0 });
          await adv(0.7);
          return;
        }
      }
      await setBoth({ grab: false, jumpPressed: true });
      await adv(0.6);
    }
    console.log('   (grab: not every hand latched)', JSON.stringify((await st()).grips));
    await setBoth({ grab: true });
    await adv(0.7);
  }

  /**
   * Steer the carrying pair to (tx, tz) the way two people would; runs inside
   * the page (no per-step round trips).
   *  - 'inline' / 'snake': the mover nearer the target leads along the
   *    waypoints and the other walks where the leader walked (long loads
   *    round corners). Waypoints are for the leader.
   *  - 'broad': side by side, keeping their spacing; waypoints are for the load.
   *  - 'front': both behind the load; waypoints are for the load.
   *  - none: both just push toward the target.
   */
  async function carryTo(tx, tz, form = null, maxT = 16, speed = 0.65) {
    return page.evaluate(
      ([tx, tz, form, maxT, speed]) => {
        const g = window.__FF.game;
        const s = g.session;
        const P = s.players;
        const pos = (p) => p.body.translation();
        const setI = (p, x, z) => {
          const l = Math.hypot(x, z);
          if (l > 1) {
            x /= l;
            z /= l;
          }
          Object.assign(p.intent, { moveX: x, moveZ: z });
        };
        if (form === 'inline' || form === 'snake') {
          // leader/follower bookkeeping persists across waypoints of one carry
          let sn = window.__snake;
          if (!sn) {
            const a = pos(P[0]);
            const b = pos(P[1]);
            const da = Math.hypot(tx - a.x, tz - a.z);
            const db = Math.hypot(tx - b.x, tz - b.z);
            const leader = da < db ? 0 : 1;
            const L = pos(P[leader]);
            const Fp = pos(P[1 - leader]);
            const D = Math.hypot(L.x - Fp.x, L.z - Fp.z);
            const crumbs = [];
            for (let i = 0; i <= 10; i++) crumbs.push([Fp.x + ((L.x - Fp.x) * i) / 10, Fp.z + ((L.z - Fp.z) * i) / 10]);
            sn = window.__snake = { leader, D, crumbs };
          }
          const lead = P[sn.leader];
          const fol = P[1 - sn.leader];
          // the leader follows the line from the previous waypoint (pure pursuit)
          const from = sn.last ?? (() => {
            const L0 = pos(lead);
            return [L0.x, L0.z];
          })();
          const sx0 = tx - from[0];
          const sz0 = tz - from[1];
          const segLen = Math.hypot(sx0, sz0) || 1;
          let t = 0;
          for (; t < maxT; t += 0.1) {
            const L = pos(lead);
            const dToGoal = Math.hypot(tx - L.x, tz - L.z);
            if (dToGoal < 0.3) break;
            // aim 1.2 m ahead of our projection onto the segment
            const proj = Math.max(0, Math.min(segLen, ((L.x - from[0]) * sx0 + (L.z - from[1]) * sz0) / segLen));
            const ahead = Math.min(segLen, proj + 1.2);
            const ax = from[0] + (sx0 / segLen) * ahead;
            const az = from[1] + (sz0 / segLen) * ahead;
            const dx = ax - L.x;
            const dz = az - L.z;
            const d = Math.max(0.05, Math.hypot(dx, dz));
            // leader: walk the path, but wait up if the follower lags (tether)
            const Fp = pos(fol);
            const gap = Math.hypot(L.x - Fp.x, L.z - Fp.z);
            const lag = Math.max(0, gap - sn.D - 0.25);
            // wait for a stuck follower instead of tearing the load out of their hands
            const sp = lag > 0.4 ? 0 : Math.min(speed, 0.2 + dToGoal * 0.5) * Math.max(0.25, 1 - lag * 2);
            setI(lead, (dx / d) * sp, (dz / d) * sp);
            const last = sn.crumbs[sn.crumbs.length - 1];
            if (Math.hypot(L.x - last[0], L.z - last[1]) > 0.05) sn.crumbs.push([L.x, L.z]);
            // follower: aim at the crumb a little less than D behind the leader,
            // so both walk off together (the load can't be dragged by one mover)
            let acc = 0;
            let target = sn.crumbs[0];
            for (let i = sn.crumbs.length - 1; i > 0; i--) {
              const c1 = sn.crumbs[i];
              const c0 = sn.crumbs[i - 1];
              acc += Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
              if (acc >= sn.D - 0.3) {
                target = c0;
                break;
              }
            }
            const fx = target[0] - Fp.x;
            const fz = target[1] - Fp.z;
            const fl = Math.hypot(fx, fz);
            // never crowd the load: hold back when closer to the leader than our spacing
            const crowd = Math.max(0, Math.min(1, (gap - (sn.D - 0.55)) / 0.3));
            const fs = fl > 0.04 ? (Math.min(1, speed * (0.4 + fl * 1.6)) * crowd) / fl : 0;
            setI(fol, fx * fs, fz * fs);
            g.advance(0.1, 60, false);
          }
          sn.last = [tx, tz];
          P.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0 }));
          g.advance(0.3, 60, false);
          return t;
        }
        let t = 0;
        for (; t < maxT; t += 0.1) {
          const c = s.cargo.body.translation();
          const dx = tx - c.x;
          const dz = tz - c.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.2) break;
          const k = Math.min(speed, 0.2 + d * 0.5) / d;
          const ux = dx / d;
          const uz = dz / d;
          P.forEach((p, i) => {
            let mx = dx * k;
            let mz = dz * k;
            if (form) {
              const pp = pos(p);
              let sx;
              let sz;
              if (form === 'front') {
                // both behind the load, shoulder to shoulder
                const sg = i === 0 ? -1 : 1;
                sx = c.x - ux * 0.78 + -uz * -sg * 0.3;
                sz = c.z - uz * 0.78 + ux * -sg * 0.3;
              } else {
                // side by side across the travel direction, keeping the spacing we have
                const ax = -uz;
                const az = ux;
                const rx = pp.x - c.x;
                const rz = pp.z - c.z;
                const r = Math.min(1.8, Math.max(0.8, Math.hypot(rx, rz)));
                const sg = Math.sign(rx * ax + rz * az) || (i === 0 ? -1 : 1);
                sx = c.x + ax * sg * r;
                sz = c.z + az * sg * r;
              }
              mx += (sx - pp.x) * 1.2;
              mz += (sz - pp.z) * 1.2;
            }
            setI(p, mx, mz);
          });
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
        P.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0 }));
        g.advance(0.4, 60, false);
        return t;
      },
      [tx, tz, form, maxT, speed],
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
    if (!seg.keep) await page.evaluate(() => { window.__snake = null; });
    if (seg.start) {
      await adv(1.2);
      await grab();
    } else if (!seg.keep) {
      if (seg.cargo) await setup(seg.cargo, seg.yaw ?? 0, seg.setup, seg.lying);
      else {
        const c = (await st()).cargo;
        await setup([c[0], c[1] + 0.05, c[2]], 90);
      }
      await grab();
    }
    if (process.env.TRACE) await page.evaluate(() => { window.__trace = []; });
    const h0 = (await st()).health;
    for (const [x, z, form] of seg.path) {
      const t = await carryTo(x, z, form ?? null);
      const s = await st();
      console.log(name.padEnd(8), `→ [${x}, ${z}]`, `${t.toFixed(1)}s`, JSON.stringify(s));
      if (process.env.SHOTS) {
        await adv(0.05);
        await shot(`deliver_${name}_${seg.path.findIndex((p) => p[0] === x && p[1] === z)}`);
      }
      await dumpImpacts();
      if (process.env.TRACE) for (const r of await page.evaluate(() => window.__trace.splice(0))) console.log('   ', JSON.stringify(r));
    }
    if (seg.ride) {
      await adv(seg.ride);
      console.log(name.padEnd(8), 'after ride', JSON.stringify(await st()));
    }
    await shot(`deliver_${name}`);
    if (seg.place || (seg.path.length && !route[Object.keys(route)[Object.keys(route).indexOf(name) + 1]]?.keep)) {
      await setBoth({ grab: false });
      await adv(2.5);
    }
    const end = await st();
    console.log(name.padEnd(8), `done: health ${h0} → ${end.health}`, JSON.stringify(end));
  }
}
