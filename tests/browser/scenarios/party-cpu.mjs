// The computer actually plays each party game: against a P1 who just stands
// there, it should win rounds (push them off, score, haul loot, paint the
// floor, outlast them on the lava, blow them up). env GAMES, CPU (1..3), SECS.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(52), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s, 60, false), s);
  const games = process.env.GAMES ? process.env.GAMES.split(',') : await page.evaluate(() => window.__FF.app.partyGames());
  const cpu = Number(process.env.CPU ?? 2);
  const secs = Number(process.env.SECS ?? 40);
  for (const game of games) {
    await page.evaluate(
      ([game, cpu]) => {
        const app = window.__FF.app;
        Object.assign(app.partyOpts, { vs: 'cpu', cpu, len: 1 });
        app.playParty(game);
        window.__FF.game.session.scriptedInput = true;
      },
      [game, cpu],
    );
    let s = null;
    const t0 = Date.now();
    for (let t = 0; t < secs; t += 2) {
      await adv(2);
      s = await page.evaluate(() => {
        const g = window.__FF.game.session.party;
        return { score: [...g.score], tally: [...g.tally], phase: g.phase, round: g.round };
      });
      if (s.score[1] >= 1 && !['king', 'paint'].includes(game)) break;
    }
    await page.screenshot({ path: `${process.argv[3] ?? 'test-shots'}/cpu_${game}.png` });
    const won = s.score[1] >= 1 || (['king', 'paint'].includes(game) && s.tally[1] > 0);
    check(`${game}: the computer gets somewhere`, won, { ...s, real: Math.round((Date.now() - t0) / 1000) });
  }
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
