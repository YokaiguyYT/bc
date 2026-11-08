// Party games (1v1): the Party screen, each game against the computer (the
// countdown holds everybody, the computer plays, a round can be won the
// game's own way, the score and the results card), two people on one
// keyboard, and a party mix. env GAMES (comma list; default all of them).
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(60), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const all = await page.evaluate(() => window.__FF.app.partyGames());
  const games = process.env.GAMES ? process.env.GAMES.split(',') : all;

  // the Party screen
  await page.evaluate(() => window.__FF.app.showParty());
  await adv(0.1);
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.party-tile')].map((t) => t.id));
  check('Party screen: a tile for every game', all.every((g) => tiles.includes(`pa-${g}`)), tiles);
  await shot('party_menu');

  const st = () =>
    page.evaluate(() => {
      const s = window.__FF.game.session;
      const g = s.party;
      return {
        phase: g.phase,
        score: [...g.score],
        round: g.round,
        tally: [...g.tally],
        cpu: g.cpu,
        p: s.players.map((p) => [+p.bodyPos.x.toFixed(2), +p.bodyPos.y.toFixed(2), +p.bodyPos.z.toFixed(2)]),
        board: document.querySelector('.party-board')?.textContent.replace(/\s+/g, ' ').trim(),
        screen: window.__FF.app.screen,
      };
    });

  // the game's own way of winning a round, for P1 (or the computer) — see below
  const WIN = {
    // P1 walks off the mat: the computer wins the round
    sumo: { who: 1, act: () => p1walk(1, 0, 4) },
    // the ball rolls into the computer's goal
    // the fuse runs out on whoever has it
    potato: { who: -1, act: () => page.evaluate(() => (window.__FF.game.session.party.fuse = 0.01)).then(() => adv(1)) },
    // P1 walks off the tiles into the lava
    lava: { who: 1, act: () => p1walk(-1, 0, 4) },
    // P1 paints more than the computer before the clock runs out
    paint: {
      who: 0,
      act: () =>
        page.evaluate(() => {
          const g = window.__FF.game.session.party;
          g.owner.fill(1);
          g.clock = 0.05;
        }).then(() => adv(1)),
    },
    // the sofa ends up in P1's truck
    tug: { who: 0, act: () => page.evaluate(() => {
      const s = window.__FF.game.session;
      for (const p of s.players) p.releaseAll();
      s.party.sofa.body.setTranslation({ x: -10.5, y: 0.6, z: 0 }, true);
      s.party.sofa.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      s.players[1].teleport(new s.cargo.lastHitPos.constructor(3, 0, 3), 0);
    }).then(() => adv(2)) },
    // the treasure chest is in P1's truck when the clock runs out
    king: { who: 0, act: () => page.evaluate(() => {
      const s = window.__FF.game.session;
      for (const p of s.players) p.releaseAll();
      const g = s.party;
      for (const l of g.loot) if (l.live && l.body.translation().x > 7) l.body.setTranslation({ x: 0, y: 0.6, z: 3 }, true);
      const chest = g.loot.find((l) => l.kind === 'chest');
      chest.body.setEnabled(true);
      chest.live = true;
      chest.obj.visible = true;
      chest.body.setTranslation({ x: -9.5, y: 0.5, z: 0 }, true);
      g.clock = 0.3;
    }).then(() => adv(1)) },
    football: { who: 0, act: () => page.evaluate(() => window.__FF.game.session.party.ball.body.setTranslation({ x: 10.9, y: 0.7, z: 0 }, true)).then(() => adv(1)) },
  };
  const p1walk = (x, z, secs) =>
    page.evaluate(
      ([x, z]) => {
        const s = window.__FF.game.session;
        s.scriptedInput = true;
        Object.assign(s.players[0].intent, { moveX: x, moveZ: z, grab: false });
      },
      [x, z],
    ).then(() => adv(secs));

  for (const game of games) {
    await page.evaluate((game) => {
      const app = window.__FF.app;
      Object.assign(app.partyOpts, { vs: 'cpu', cpu: 2, len: 1 });
      app.playParty(game);
    }, game);
    await adv(0.3);
    let s = await st();
    check(`${game}: the countdown, against the computer`, s.phase === 'ready' && s.cpu === 2 && /P1/.test(s.board ?? ''), s);
    // nobody moves during the countdown
    const before = s.p;
    await page.evaluate(() => {
      const s = window.__FF.game.session;
      s.scriptedInput = true;
      Object.assign(s.players[0].intent, { moveX: 1, moveZ: 0 });
    });
    await adv(1);
    s = await st();
    check(`${game}: …which holds everybody still`, Math.hypot(s.p[0][0] - before[0][0], s.p[0][2] - before[0][2]) < 0.4, [before[0], s.p[0]]);
    await page.evaluate(() => Object.assign(window.__FF.game.session.players[0].intent, { moveX: 0, moveZ: 0 }));
    await adv(2.2);
    s = await st();
    check(`${game}: GO`, s.phase === 'play', s.phase);
    const c0 = s.p[1];
    await adv(4);
    s = await st();
    await shot(`party_${game}`);
    const cpuMoved = Math.hypot(s.p[1][0] - c0[0], s.p[1][2] - c0[2]);
    // (on the lava, standing still on a safe tile is often right)
    check(`${game}: the computer plays`, cpuMoved > (game === 'lava' ? 0.3 : 0.8), +cpuMoved.toFixed(2));
    // a round won the game's own way
    const w = WIN[game];
    if (w) {
      const sc = s.score;
      await w.act();
      for (let i = 0; i < 20 && (await st()).score.join() === sc.join(); i++) await adv(0.5);
      s = await st();
      const who = w.who >= 0 ? w.who : await page.evaluate(() => window.__FF.game.session.party.winner);
      check(`${game}: a round won the game's way`, who >= 0 && s.score[who] === sc[who] + 1, [sc, s.score]);
      await page.evaluate(() => (window.__FF.game.session.scriptedInput = false));
    }
    // then P1 wins the rest, and the game
    await page.evaluate(() => {
      const g = window.__FF.game.session.party;
      g.score[0] = g.target - 1;
      g.endRound(0);
    });
    for (let i = 0; i < 20 && (await st()).screen !== 'results'; i++) await adv(0.5);
    const res = await page.evaluate(() => ({ screen: window.__FF.app.screen, text: document.querySelector('.party-results')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 140) }));
    check(`${game}: P1 wins: the results card`, res.screen === 'results' && /You win/.test(res.text ?? '') && /\+\$50/.test(res.text ?? ''), res);
    await shot(`party_${game}_won`);
  }

  // two people on one keyboard: no computer
  await page.evaluate((game) => {
    const app = window.__FF.app;
    Object.assign(app.partyOpts, { vs: 'friend' });
    app.playParty(game);
  }, games[0]);
  await adv(0.5);
  const friend = await page.evaluate(() => ({ cpu: window.__FF.game.session.party.cpu, buddy: !!window.__FF.game.session.buddy, p2: document.querySelectorAll('.player-card .badge')[1]?.textContent }));
  check('a friend on this keyboard: P2 is a person', friend.cpu === 0 && !friend.buddy && friend.p2 === 'P2', friend);

  // a party mix: game after game, the running score
  await page.evaluate(() => {
    const app = window.__FF.app;
    Object.assign(app.partyOpts, { vs: 'cpu', len: 0 });
    app.showParty();
    document.getElementById('pa-mix').click();
  });
  await adv(0.5);
  const mix0 = await page.evaluate(() => ({ job: window.__FF.app.job, name: window.__FF.game.session.def.name }));
  await page.evaluate(() => {
    const g = window.__FF.game.session.party;
    g.score[0] = g.target - 1;
    g.endRound(0);
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const mix1 = await page.evaluate(() => ({ text: document.querySelector('.party-mix')?.textContent.replace(/\s+/g, ' ').trim(), next: !!document.getElementById('r-mixnext') }));
  check('party mix: a running score and a next game', /1 – 0/.test(mix1.text ?? '') && (mix1.next || mix0.job.mix.list.length === 1), [mix0.name, mix1]);
  await shot('party_mix');

  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
