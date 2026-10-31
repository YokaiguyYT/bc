// Random jobs: build many seeds (every cargo) and check each one: it builds
// without errors, the cargo sits still where it starts, nothing important is
// below the out-of-bounds height, and the pieces vary. SEEDS=n (default 24).
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const n = Number(process.env.SEEDS ?? 24);
  const cargos = ['tv', 'aquarium', 'clock', 'glass', 'cake', 'swan', 'egg', 'piano', 'painting', 'balloons'];
  const rows = [];
  const usage = {};
  for (let i = 0; i < n; i++) {
    const seed = 1000 + i * 7919;
    const cargo = cargos[i % cargos.length];
    const r = await page.evaluate(
      ([seed, cargo]) => {
        const F = window.__FF;
        const def = F.gen.generateJob({ seed, cargo });
        // the online guest rebuilds a job from its recipe: it must come out identical
        const again = F.gen.generateJob({ ...def.gen });
        const same = JSON.stringify(again.objects) === JSON.stringify(def.objects) && again.name === def.name;
        F.app.attract = null; // (the menu's background demo)
        const s = F.game.startLevel(def);
        s.scriptedInput = true;
        const c0 = s.cargo.body.translation();
        F.game.advance(2.0, 60, false);
        const c1 = s.cargo.body.translation();
        const out = {
          seed,
          cargo,
          name: def.name,
          objects: def.objects.length,
          pieces: def.pieces,
          cps: def.checkpoints.length,
          par: def.parTime,
          drift: +Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z).toFixed(3),
          health: +s.cargo.health.toFixed(3),
          players: s.players.map((p) => +p.body.translation().y.toFixed(2)),
          killY: def.killY,
          state: s.state,
          same,
          links: s.physics.linkCount,
        };
        return out;
      },
      [seed, cargo],
    );
    for (const p of r.pieces) usage[p] = (usage[p] ?? 0) + 1;
    const ok = r.same && r.drift < 0.15 && r.health > 0.99 && r.state === 'playing' && r.players.every((y) => y > r.killY + 1);
    rows.push({ ...r, ok });
    console.log(ok ? 'ok  ' : 'FAIL', String(seed).padEnd(7), cargo.padEnd(9), `${r.same ? '' : 'NOT REPRODUCIBLE '}${r.objects} objs ${r.cps} cps par ${r.par}s drift ${r.drift} health ${r.health}`, r.pieces.join(' '), r.name);
    if (i < 4) {
      await page.evaluate(() => window.__FF.game.renderer.render());
      await shot(`gen_${seed}_${cargo}`);
    }
  }
  console.log('piece usage', JSON.stringify(usage));
  const bad = rows.filter((r) => !r.ok).length;
  if (bad) throw new Error(`${bad} job(s) had problems`);
}
