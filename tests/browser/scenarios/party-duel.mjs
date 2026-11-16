// How hard is the computer? A scripted, middling P1 (it keeps moving, goes for
// the ball / the parcel / a jump at them, with no great skill) plays each of
// the newer party games against Easy, Normal and Hard for a while, and the
// score is printed. Not a pass/fail test of the numbers: it fails only if the
// computer never scores at all on Hard, or the scripted player never does on
// Easy. env GAMES (dodge,stomp,keep), SECS (game seconds each, default 120).
export default async function ({ page, base }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(56), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const games = (process.env.GAMES ?? 'dodge,stomp,keep').split(',');
  const secs = Number(process.env.SECS ?? 120);
  for (const game of games) {
    const rows = [];
    for (const cpu of [1, 2, 3]) {
      const r = await page.evaluate(
        ([game, cpu, secs]) => {
          const app = window.__FF.app;
          Object.assign(app.partyOpts, { vs: 'cpu', cpu, len: 2 });
          app.playParty(game);
          const g = window.__FF.game;
          const s = g.session;
          s.scriptedInput = true;
          const p = s.party;
          // (play on and on: count the rounds instead of ending the game)
          p.target = 99;
          const me = s.players[0];
          const foe = s.players[1];
          const half = { dodge: [7, 4], stomp: [5.5, 5.5], keep: [7.5, 5.5] }[game];
          let seed = 12345 + cpu * 77;
          const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          let goal = [me.bodyPos.x, me.bodyPos.z];
          let goalT = 0;
          let armed = 0;
          const pops = [0, 0];
          let last = [3, 3];
          const go = (x, z, k = 1) => {
            const dx = x - me.bodyPos.x;
            const dz = z - me.bodyPos.z;
            const l = Math.hypot(dx, dz);
            Object.assign(me.intent, { moveX: l > 0.1 ? (dx / l) * k : 0, moveZ: l > 0.1 ? (dz / l) * k : 0 });
          };
          const wander = (dt) => {
            goalT -= dt;
            if (goalT <= 0 || Math.hypot(goal[0] - me.bodyPos.x, goal[1] - me.bodyPos.z) < 0.6) {
              goal = [(rnd() * 2 - 1) * half[0], (rnd() * 2 - 1) * half[1]];
              goalT = 0.7 + rnd() * 0.9;
            }
            go(goal[0], goal[1]);
          };
          const dt = 0.1;
          for (let t = 0; t < secs; t += dt) {
            me.intent.jumpPressed = false;
            if (p.phase === 'play' && me.state === 'active') {
              const d = Math.hypot(foe.bodyPos.x - me.bodyPos.x, foe.bodyPos.z - me.bodyPos.z);
              if (game === 'dodge') {
                const mine = p.inHand(me);
                if (mine >= 0) {
                  // armed: a moment walking at them (to face them), then let fly
                  armed += dt;
                  me.intent.grab = !(armed > 0.7 && d < 8);
                  go(foe.bodyPos.x, foe.bodyPos.z, d < 3 ? 0.3 : 1);
                } else {
                  armed = 0;
                  let best = null;
                  let bd = 5;
                  for (const b of p.balls) {
                    if (b.hot >= 0) continue;
                    const at = b.prop.body.translation();
                    const bdist = Math.hypot(at.x - me.bodyPos.x, at.z - me.bodyPos.z);
                    if (bdist < bd && at.y < 1.5 && !foe.hands.some((h) => h.grip?.body?.handle === b.prop.body.handle)) {
                      bd = bdist;
                      best = at;
                    }
                  }
                  // a ball nearby half the time; otherwise keep moving (a sitting duck gets hit)
                  if (best && (bd < 2.5 || Math.floor(t * 0.5) % 2 === 0)) {
                    go(best.x, best.z, bd < 1 ? 0.5 : 1);
                    me.intent.grab = bd < 1.2;
                  } else {
                    wander(dt);
                    me.intent.grab = false;
                  }
                }
              } else if (game === 'stomp') {
                // at them when they're near (and jump from a couple of metres off, some of the time); else keep moving
                if (d < 4 && Math.floor(t) % 3 !== 0) {
                  go(foe.bodyPos.x, foe.bodyPos.z);
                  if (me.grounded && d > 2.2 && d < 3.4 && rnd() < 0.35) me.intent.jumpPressed = true;
                } else wander(dt);
                if (p.tally[0] < last[0]) pops[1]++;
                if (p.tally[1] < last[1]) pops[0]++;
              } else if (game === 'keep') {
                me.intent.grab = true;
                if (p.has === 0) {
                  // got it: away from them, turning off before the walls
                  goalT -= dt;
                  const ax = me.bodyPos.x - foe.bodyPos.x;
                  const az = me.bodyPos.z - foe.bodyPos.z;
                  const l = Math.hypot(ax, az) || 1;
                  let x = me.bodyPos.x + (ax / l) * 2.5;
                  let z = me.bodyPos.z + (az / l) * 2.5;
                  if (Math.abs(x) > half[0] || Math.abs(z) > half[1]) {
                    if (goalT <= 0) {
                      goal = [(rnd() * 2 - 1) * half[0] * 0.8, (rnd() * 2 - 1) * half[1] * 0.8];
                      goalT = 0.8;
                    }
                    x = goal[0];
                    z = goal[1];
                  }
                  go(x, z);
                } else if (p.has === 1) go(foe.bodyPos.x, foe.bodyPos.z);
                else {
                  const at = p.parcel.body.translation();
                  go(at.x, at.z, Math.hypot(at.x - me.bodyPos.x, at.z - me.bodyPos.z) < 1 ? 0.5 : 1);
                }
              }
            } else if (me.state === 'knocked') {
              Object.assign(me.intent, { moveX: 0, moveZ: 0, grab: false, jumpPressed: rnd() < 0.5 });
              armed = 0;
            } else {
              Object.assign(me.intent, { moveX: 0, moveZ: 0, grab: false });
              armed = 0;
            }
            last = [...p.tally];
            g.advance(dt, 60, false);
          }
          return { cpu, rounds: [...p.score], pops, tally: [...p.tally] };
        },
        [game, cpu, secs],
      );
      rows.push(r);
      console.log(`   ${game.padEnd(6)} ${['', 'Easy  ', 'Normal', 'Hard  '][cpu]}  rounds P1 ${r.rounds[0]} – ${r.rounds[1]} CPU` + (game === 'stomp' ? `   pops P1 ${r.pops[0]} – ${r.pops[1]} CPU` : '') + (game === 'keep' ? `   this round ${r.tally[0]}s – ${r.tally[1]}s` : ''));
    }
    const total = (r) => (game === 'stomp' ? r.pops : game === 'keep' ? [r.rounds[0] * 20 + r.tally[0], r.rounds[1] * 20 + r.tally[1]] : r.rounds);
    check(`${game}: the scripted player gets somewhere on Easy`, total(rows[0])[0] > 0, total(rows[0]));
    check(`${game}: the computer gets somewhere on Hard`, total(rows[2])[1] > 0, total(rows[2]));
    check(`${game}: Hard does at least as well as Easy`, total(rows[2])[1] - total(rows[2])[0] >= total(rows[0])[1] - total(rows[0])[0], [total(rows[0]), total(rows[2])]);
  }
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
