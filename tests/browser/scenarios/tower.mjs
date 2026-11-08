// Stacking Tower (job "Stack 'Em High"): holding the pallet still on a crane
// pad stacks boxes on it, one after another; the HUD counts them; the pallet's
// worth goes up with each; a box knocked off counts down; delivering the
// tower pays per box standing, and the results card says how tall it was.
// Then the movers carry it for real: two scripted movers lift the pallet
// with a few boxes on and walk it a few metres without losing many.
export default async function ({ page, base, shot }) {
  const checks = [];
  const check = (name, ok, got) => {
    checks.push(ok);
    console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(56), JSON.stringify(got));
  };
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  const st = () =>
    page.evaluate(() => {
      const s = window.__FF.game.session;
      const c = s.cargo.body.translation();
      return { boxes: s.cargo.boxes, value: s.cargo.value, status: s.cargo.status, pallet: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], state: s.state };
    });
  await page.evaluate(() => window.__FF.app.playLevel('tower'));
  await adv(1);
  let s = await st();
  check('the job starts with an empty pallet', s.boxes === 0 && s.value === 40, s);
  // onto the first crane pad, and hold still
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const V = s.cargo.lastHitPos.constructor;
    s.cargo.reset(new V(0, 0.15, -2.6), 0);
  });
  await adv(5.5);
  s = await st();
  check('held still on a crane pad: boxes get stacked on', s.boxes >= 3, s);
  check('…and it says so, and the pallet is worth more', /stack/.test(s.status ?? '') && s.value === 40 + s.boxes * 90, [s.status, s.value]);
  const hud = await page.evaluate(() => document.querySelector('.hud .status-card')?.textContent ?? '');
  check('the HUD shows the stack', /box|stack/i.test(hud), hud);
  await shot('tower_stacked');
  // knock one off
  const n0 = s.boxes;
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.hazards.find((h) => h.boxes);
    const top = g.boxes.filter((b) => b.live).sort((a, b) => b.body.translation().y - a.body.translation().y)[0];
    top.body.setLinvel({ x: 4, y: 1, z: 0 }, true);
  });
  // (off the pad, so no more get stacked meanwhile)
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.hazards.find((h) => h.boxes);
    const V = s.cargo.lastHitPos.constructor;
    // move the pallet and its stack together, off the pad
    const at = s.cargo.body.translation();
    const dz = 2.6;
    for (const b of g.boxes) if (b.live && Math.hypot(b.body.translation().x - at.x, b.body.translation().z - at.z) < 0.8 && b.body.translation().y < at.y + 4 && b.body.linvel().x < 2) {
      const t = b.body.translation();
      b.body.setTranslation({ x: t.x, y: t.y, z: t.z + dz }, true);
    }
    s.cargo.body.setTranslation({ x: at.x, y: at.y, z: at.z + dz }, true);
    void V;
  });
  await adv(2);
  s = await st();
  check('a box knocked off: one fewer', s.boxes === n0 - 1, [n0, s.boxes]);

  // the tower into the truck: pallet and stack moved together, set down
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const g = s.hazards.find((h) => h.boxes);
    const at = s.cargo.body.translation();
    const goal = s.def.goal.pos;
    const dx = goal[0] - at.x;
    const dy = goal[1] - 1 + 0.12 - at.y;
    const dz = goal[2] - at.z;
    for (const b of g.boxes)
      if (b.live && Math.hypot(b.body.translation().x - at.x, b.body.translation().z - at.z) < 0.8) {
        const t = b.body.translation();
        b.body.setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, true);
      }
    s.cargo.body.setTranslation({ x: at.x + dx, y: at.y + dy, z: at.z + dz }, true);
    for (const p of s.players) p.releaseAll();
  });
  for (let i = 0; i < 20 && (await page.evaluate(() => window.__FF.app.screen)) !== 'results'; i++) await adv(0.5);
  const res = await page.evaluate(() => document.querySelector('.results')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 220) ?? '');
  const want = n0 - 1;
  check("delivered: the results card says how tall", new RegExp(`Tower\\s*${want} box`).test(res), res);
  await shot('tower_results');

  // carrying it for real: both movers lift the pallet with a few boxes on and walk it
  await page.evaluate(() => window.__FF.app.playLevel('tower'));
  await adv(0.5);
  await page.evaluate(() => {
    const s = window.__FF.game.session;
    const V = s.cargo.lastHitPos.constructor;
    s.cargo.reset(new V(0, 0.15, -2.6), 0);
    s.players[0].teleport(new V(-1.45, 0, -2.6), Math.PI / 2);
    s.players[1].teleport(new V(1.45, 0, -2.6), -Math.PI / 2);
    s.scriptedInput = true;
  });
  await adv(3.8);
  const before = (await st()).boxes;
  await page.evaluate(() => window.__FF.game.session.players.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0, grab: true })));
  for (let i = 0; i < 30; i++) {
    await adv(0.1);
    const both = await page.evaluate(() => window.__FF.game.session.players.every((p) => p.hands.some((h) => h.grip?.kind === 'cargo')));
    if (both) break;
    await page.evaluate(() => window.__FF.game.session.players.forEach((p, i) => Object.assign(p.intent, { moveX: i ? -0.2 : 0.2 })));
  }
  await page.evaluate(() => window.__FF.game.session.players.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0.45 })));
  await adv(2.5);
  await page.evaluate(() => window.__FF.game.session.players.forEach((p) => Object.assign(p.intent, { moveX: 0, moveZ: 0 })));
  await adv(1);
  s = await st();
  check('carried a few metres with the stack on', s.pallet[2] > -1.2 && s.boxes >= Math.max(1, before - 1), [before, s]);
  await shot('tower_carry');
  console.log(checks.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
}
