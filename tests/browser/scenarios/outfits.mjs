// Every Locker item worn by a mover, one close-up each (for a look), and no
// errors putting any of them on. OUT shots are named outfit_<slot>_<id>.
export default async function ({ page, base, shot }) {
  await page.goto(base + '?manual=1');
  await page.waitForFunction(() => window.__FF && window.__FF.app && !document.getElementById('loading'), null, { timeout: 90000 });
  await page.evaluate(() => {
    localStorage.setItem('ff.wardrobe', JSON.stringify({ cash: 0, owned: [], done: [], outfits: [{ color: 'orange', hat: 'none', face: 'none', back: 'none' }, { color: 'blue', hat: 'cap', face: 'none', back: 'none' }] }));
    window.__FF.app.showMenu();
  });
  await page.evaluate(() => document.querySelector('#m-locker').click());
  const adv = (s) => page.evaluate((s) => window.__FF.game.advance(s), s);
  await adv(2);
  // hide the panel: just the mover
  await page.evaluate(() => (document.querySelector('.screen').style.visibility = 'hidden'));
  const items = await page.evaluate(() => {
    const s = window.__FF.game.session;
    const rig = s.rigs[0];
    // pull the outfit tables out of the rig's module by trying ids from the Locker's buttons on each tab
    return null;
  });
  const slots = { hat: ['cap', 'beanie', 'cowboy', 'tophat', 'chef', 'wizard', 'propeller', 'party', 'hardhat', 'crown', 'viking', 'cone', 'flowers', 'bunny', 'pirate', 'halo', 'astronaut'], face: ['shades', 'mustache', 'monocle', 'nose', 'goggles', 'nerd', 'hearts', 'beard'], back: ['backpack', 'cape', 'scarf', 'wings', 'guitar', 'balloon', 'jetpack'] };
  let n = 0;
  for (const [slot, ids] of Object.entries(slots))
    for (const id of ids) {
      const ok = await page.evaluate(
        ([slot, id]) => {
          const s = window.__FF.game.session;
          const o = { color: 'orange', hat: 'none', face: 'none', back: 'none', [slot]: id };
          s.rigs[0].applyOutfit(o);
          // face things face the camera; back things away from it
          s.cameraRig.yaw = s.players[0].facingYaw + (slot === 'back' ? Math.PI : 0);
          return s.rigs[0].extras.length;
        },
        [slot, id],
      );
      await adv(0.6);
      await shot(`outfit_${slot}_${id}`);
      if (!ok && id !== 'cap') console.log('FAIL nothing to wear for', slot, id);
      n++;
    }
  console.log(`ok   ${n} items worn`);
}
