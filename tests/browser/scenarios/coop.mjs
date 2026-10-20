// Both players walk to opposite ends of the crate, grab, and carry it up the ramp to the goal.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?level=playground&manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.game.session, null, { timeout: 60000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const st = () => page.evaluate(() => window.__FF.game.session.debugState());
  const log = async (label) => { const s = await st(); console.log(label.padEnd(14), JSON.stringify({ t: s.time, cargo: s.cargo, p: s.players.map(p => [p.pos, p.state, p.grips.map(g => g ? 1 : 0).join('')]), goal: s.goalProgress, state: s.state })); return s; };
  const K = page.keyboard;
  await adv(0.5);
  // walk both to crate depth (z≈2)
  const walkTo = async (key, idx, axis, target, max = 3) => {
    await K.down(key);
    for (let t = 0; t < max; t += 0.1) { await adv(0.1); const s = await st(); const v = s.players[idx].pos[axis]; if ((axis === 2 && v <= target) || (axis === 0 && Math.abs(v - target) < 0.05)) break; }
    await K.up(key);
  };
  await walkTo('KeyW', 0, 2, 2.05);
  await walkTo('ArrowUp', 1, 2, 2.05);
  await log('at depth');
  // face the crate and grab: P1 presses D (+x), P2 presses Left
  await K.down('ShiftLeft'); await K.down('Slash');
  await K.down('KeyD'); await K.down('ArrowLeft');
  for (let i = 0; i < 12; i++) { await adv(0.1); const s = await st(); if (s.players.every(p => p.grips.some(Boolean))) break; }
  await K.up('KeyD'); await K.up('ArrowLeft');
  await adv(0.6);
  await log('grabbed');
  await shot('c1_grabbed');
  // carry up the ramp to the goal
  await K.down('KeyW'); await K.down('ArrowUp');
  for (let i = 0; i < 70; i++) {
    await adv(0.1);
    if (i % 10 === 0) await log('carry ' + i);
    if (i === 20) await shot('c2_carry');
    if (i === 40) await shot('c3_ramp');
    const s = await st();
    if (s.cargo.pos[2] < -14.4) break;
  }
  await K.up('KeyW'); await K.up('ArrowUp');
  await adv(0.5);
  await K.up('ShiftLeft'); await K.up('Slash');
  await log('released');
  await adv(2.5);
  await log('end');
  await shot('c4_goal');
}
