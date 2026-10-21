// Can people pick the cargo up the way they actually do it? At every job's start
// and at every checkpoint, both movers walk up to the cargo, stop, and only then
// hold grab. Fails if either mover can't get a hand on it, or it can't be lifted
// (unless it rolls on castors and isn't meant to be).
// env LEVELS (comma list).
export default async function ({ page, base }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const levels = process.env.LEVELS ? process.env.LEVELS.split(',') : await page.evaluate(() => window.__FF.game.levels.map((l) => l.id));
  const problems = [];
  for (const id of levels) {
    await page.evaluate((id) => window.__FF.app.playLevel(id), id);
    const rows = await page.evaluate(() => {
      const g = window.__FF.game;
      const s = g.session;
      s.scriptedInput = true;
      const spots = [-1, ...s.def.checkpoints.map((_, i) => i)];
      const out = [];
      for (const cp of spots) {
        for (const approach of ['walk up, then grab', 'grab while walking up']) {
          s.checkpoint = cp;
          s.spawn = cp < 0 ? s.def.spawn : s.def.checkpoints[cp].spawn;
          s.players.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0, grab: false }));
          s.respawnAll(false);
          s.falls = 0;
          // the truck job starts on a moving truck: wait for it to arrive
          g.advance(s.def.spawn.attach && cp < 0 ? 17 : 0.8, 60, false);
          const c0 = s.cargo.body.translation();
          const y0 = c0.y;
          const early = approach === 'grab while walking up';
          for (let t = 0; t < 1.6; t += 0.1) {
            s.players.forEach((p) => {
              const b = p.body.translation();
              // head for the nearest bit of the cargo and stop on contact, like people do
              let near = 9;
              let tx = 0;
              let tz = 0;
              for (const col of s.cargo.colliders) {
                const pr = col.projectPoint(b, true);
                if (!pr) continue;
                const d = Math.hypot(pr.point.x - b.x, pr.point.z - b.z);
                if (d < near) {
                  near = d;
                  tx = pr.point.x - b.x;
                  tz = pr.point.z - b.z;
                }
              }
              const l = Math.hypot(tx, tz) || 1;
              const go = near > 0.35;
              Object.assign(p.intent, { moveX: go ? (tx / l) * 0.8 : 0, moveZ: go ? (tz / l) * 0.8 : 0, grab: early });
            });
            g.advance(0.1, 60, false);
          }
          s.players.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0, grab: true }));
          g.advance(1.2, 60, false);
          const grips = s.players.map((p) => p.hands.map((h) => (h.grip ? (h.grip.kind === 'cargo' ? 'c' : h.grip.kind === 'static' ? 's' : 'o') : '-')).join(''));
          const lift = +(s.cargo.body.translation().y - y0).toFixed(2);
          out.push({ spot: cp < 0 ? 'start' : `checkpoint ${cp + 1}`, approach, grips: grips.join(' '), lift, rolls: s.cargo.liftable === false });
          s.players.forEach((p) => Object.assign(p.intent, { grab: false }));
          g.advance(2.5, 60, false);
        }
      }
      return out;
    });
    for (const r of rows) {
      // things on castors are pushed, not lifted: both movers holding on is the test
      const ok = r.grips.split(' ').every((g) => g.includes('c')) && (r.rolls || r.lift > 0.05);
      if (!ok) problems.push(`${id} ${r.spot} (${r.approach}): grips ${r.grips}, lifted ${r.lift} m`);
      console.log((ok ? 'ok  ' : 'FAIL') + ` ${id.padEnd(10)} ${r.spot.padEnd(13)} ${r.approach.padEnd(22)} grips ${r.grips}  lifted ${r.lift} m`);
    }
  }
  if (problems.length) throw new Error('cargo that people would struggle to pick up:\n' + problems.join('\n'));
}
