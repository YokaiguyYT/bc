// Two "monkeys" mash the real keyboard in every job: random walking, jumping and
// grabbing, half the time heading for the cargo. Fails on page errors, NaN
// physics, movers lost below the world, or very slow simulation steps.
// env SECONDS (per job, default 120), LEVELS (comma list), SEED.
export default async function ({ page, base }) {
  const seconds = Number(process.env.SECONDS ?? 120);
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app, null, { timeout: 90000 });
  const levels = process.env.LEVELS ? process.env.LEVELS.split(',') : await page.evaluate(() => window.__FF.game.levels.map((l) => l.id));
  const problems = [];
  for (const id of levels) {
    await page.evaluate((id) => window.__FF.app.playLevel(id), id);
    const report = { id, steps: 0, slowest: 0, respawns: 0, grabs: 0, states: {}, health: 1 };
    for (let chunk = 0; chunk < seconds / 10; chunk++) {
      const r = await page.evaluate(
        ([seed, chunk]) => {
          const g = window.__FF.game;
          const s = g.session;
          const kb = g.keyboard;
          let rnd = (seed * 9301 + chunk * 49297 + 7) % 233280;
          const rand = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
          const KEYS = [
            { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', grab: 'ShiftLeft' },
            { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', jump: 'ShiftRight', grab: 'Slash' },
          ];
          const shiftHeld = () => kb.down.has('ShiftLeft') || kb.down.has('ShiftRight');
          const key = (type, code) => {
            if (type === 'keydown' && kb.down.has(code)) return;
            if (type === 'keyup' && !kb.down.has(code)) return;
            const isShift = code.startsWith('Shift');
            const shift = isShift ? type === 'keydown' || (code === 'ShiftLeft' ? kb.down.has('ShiftRight') : kb.down.has('ShiftLeft')) : shiftHeld();
            window.dispatchEvent(new KeyboardEvent(type, { code, key: code, shiftKey: shift, bubbles: true, cancelable: true }));
          };
          const st = (window.__monkey ??= [0, 1].map(() => ({ next: 0, grabUntil: 0, dir: [] })));
          const out = { steps: 0, slowest: 0, nan: null, lost: 0 };
          const camF = s.cameraRig.forward(new (s.cargo.lastHitPos.constructor)());
          const camR = s.cameraRig.right(new (s.cargo.lastHitPos.constructor)());
          for (let t = 0; t < 10; t += 0.1) {
            const now = s.physics.time;
            s.players.forEach((p, i) => {
              const k = KEYS[i];
              const m = st[i];
              if (now >= m.next) {
                m.next = now + 0.2 + rand() * 1.2;
                for (const d of m.dir) key('keyup', k[d]);
                m.dir = [];
                let wx;
                let wz;
                if (rand() < 0.5) {
                  // head for the cargo
                  const c = s.cargo.body.translation();
                  const b = p.body.translation();
                  wx = c.x - b.x;
                  wz = c.z - b.z;
                } else {
                  const a = rand() * Math.PI * 2;
                  wx = Math.cos(a);
                  wz = Math.sin(a);
                }
                const mx = wx * camR.x + wz * camR.z;
                const my = wx * camF.x + wz * camF.z;
                const l = Math.hypot(mx, my) || 1;
                if (rand() > 0.15) {
                  if (mx / l > 0.38) m.dir.push('right');
                  if (mx / l < -0.38) m.dir.push('left');
                  if (my / l > 0.38) m.dir.push('up');
                  if (my / l < -0.38) m.dir.push('down');
                }
                for (const d of m.dir) key('keydown', k[d]);
                if (rand() < 0.25) {
                  key('keydown', k.jump);
                  m.jumpUp = now + 0.1 + rand() * 0.3;
                }
                if (rand() < 0.35) m.grabUntil = now + rand() * 4;
              }
              if (m.jumpUp && now >= m.jumpUp) {
                key('keyup', k.jump);
                m.jumpUp = 0;
              }
              if (now < m.grabUntil) key('keydown', k.grab);
              else key('keyup', k.grab);
            });
            const t0 = performance.now();
            g.advance(0.1, 60, false);
            out.slowest = Math.max(out.slowest, performance.now() - t0);
            out.steps++;
            const bad = (v) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z);
            for (const p of s.players) {
              const v = p.body.translation();
              if (bad(v)) out.nan = 'player';
              if (v.y < s.def.killY - 30) out.lost++;
            }
            if (bad(s.cargo.body.translation())) out.nan = 'cargo';
            if (out.nan) break;
          }
          out.state = s.state;
          out.health = +s.cargo.health.toFixed(3);
          out.falls = s.falls;
          out.grips = s.players.map((p) => p.hands.filter((h) => h.grip).length).join('');
          return out;
        },
        [Number(process.env.SEED ?? 1) + levels.indexOf(id) * 17, chunk],
      );
      report.steps += r.steps;
      report.slowest = Math.max(report.slowest, r.slowest);
      report.states[r.state] = (report.states[r.state] ?? 0) + 1;
      report.health = r.health;
      report.falls = r.falls;
      if (r.nan) problems.push(`${id}: NaN ${r.nan} in chunk ${chunk}`);
      if (r.lost) problems.push(`${id}: a mover fell far below the world without respawning (chunk ${chunk})`);
      if (r.nan) break;
      // a broken or delivered job just restarts, like players would
      if (r.state !== 'playing') await page.evaluate((id) => window.__FF.app.playLevel(id), id);
    }
    report.slowest = Math.round(report.slowest);
    console.log(id.padEnd(10), JSON.stringify(report));
    if (report.slowest > 400) problems.push(`${id}: a 0.1 s step took ${report.slowest} ms`);
  }
  await page.evaluate(() => {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftRight', 'Slash'])
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
  });
  if (problems.length) throw new Error('monkey found problems:\n' + problems.join('\n'));
}
