# Fragile Freight

A goofy local **2-player** physics game for **one keyboard**. You and a friend are two wobbly movers. Your job: carry very expensive, very fragile things (a CRT TV, a full aquarium, a grandfather clock, a pane of glass, a wedding cake, a melting ice swan, a dinosaur egg, an upright piano) through chaotic obstacle courses without breaking them.

It runs in **Safari on a Mac**. There's nothing to install.

---

## Play it (no command line needed)

### Option 1: download one file and double-click it (works offline)

1. Open **[`play/FragileFreight.html`](play/FragileFreight.html)** here on GitHub.
2. Click the **Download raw file** button (the ↓ icon at the top right of the file view).
3. Find `FragileFreight.html` in your Downloads and **double-click it**. It opens in Safari. That's it.
   - If it opens in a different browser, right-click it → **Open With → Safari**.
   - You can move the file anywhere (the Desktop is fine). Your best payouts are remembered by Safari.
   - For a bigger view, use Safari's **View → Enter Full Screen**.

### Option 2: play from a link (one-time setup)

Once the game is on the `main` branch:

1. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Wait for the **Deploy to GitHub Pages** run to finish (the **Actions** tab).
3. Play at **https://yokaiguyyt.github.io/bc/** and bookmark it. Every update to `main` redeploys automatically.

---

## Controls

| | Player 1 (orange) | Player 2 (blue) |
|---|---|---|
| Move | `W` `A` `S` `D` | `↑` `←` `↓` `→` |
| Jump | `Space` | `K` |
| Grab (hold) | `Left Shift` | `L` |

Player 2 keeps their right hand on the arrows and their left hand on `K` and `L`. If you'd rather keep everything under the right hand, **Controls → Player 2 layout** has **Arrows + Return** (`Right Shift` jump, `Return` grab) and the original **Arrows + /** (`Right Shift` or `Return` jump, `/` grab).

- `Q` / `E`: spin the camera (movement follows the camera)
- `Esc` or `P`: pause
- `` ` `` (backquote): developer tuning panel

You can change every key under **Controls**. That screen also has a **key tester**. Mac keyboards can't always register lots of keys at once ("ghosting"), so both players should hold their keys together there and check they all light up.

## How to play

- **Grab:** hold your grab key near something and your mittens latch on. Heavy things need **both** of you, so grab from opposite sides and walk together.
- **Set it down:** let go of grab and you lower the load gently before letting go. (Jump while setting down if you just want to drop it.)
- **Loads have weight:** they speed up and slow down slowly. Big swings slosh water, tip clocks and squish cakes.
- **Deliver:** set the cargo down inside the **green zone** and let go.
- **Damage:** bumps, drops, slams and wild swings all cost condition. You're paid the cargo's value × its condition, minus a little for every fall, plus a bonus for beating par time.
- **Checkpoints** (yellow zones) save your progress. Fall off the world and you respawn at the last one.
- **Lost?** When the next checkpoint (🚩) or the drop-off (🏁) is off screen, an arrow at the edge of the screen points to it.
- **Switching apps** pauses the game. `Esc` or `P` carries on.

## The jobs

1. **Move-Out Day** (CRT TV): out of the flat, through a very tight door, down the fire escape and into the truck.
2. **Fish Out of Water** (aquarium): ride in the back of the truck, push through a revolving door, cross a wet lobby, take a rattly lift, dodge the neighbour (and his dog) and set the tank on its stand.
3. **Time to Go** (grandfather clock): carry a 2 m clock end to end along a gallery of suits of armour, down the grand staircase and out to the antiques van.
4. **Glass Act** (pane of glass): weave through cones, one plank each over the trench, a see-saw, a sideways conveyor and a wrecking ball.
5. **Piece of Cake** (wedding cake): cross on the green man, get through the park and the pigeons, find a gap in the traffic and set it on the cake table.
6. **Cold Feet** (ice swan): it melts the whole way, faster near anything warm. Dodge the sledges, take the slippery shortcut over the frozen pond or the warm way round, cross between the skiers, ride the gondola up to the lodge and get it onto the buffet.
7. **Jurassic Lark** (dinosaur egg): a museum after dark. Past the T-Rex, behind the swinging pendulum (or round past the night guard), through the laser gates when they blink off, and down to the incubator. Something inside kicks.
8. **Hill Street Blues** (upright piano): too heavy to lift, so you push it on its castors. Hold it back down a steep hill, wait for the cable car to pass, zig-zag down the crooked street and roll it onto the stage. Let go on a slope and it's off!

There's also a **Practice Yard** to learn the controls.

## Settings

- **Graphics:** Fast / Balanced / Pretty. Pick **Fast** if Safari stutters.
- **Cargo toughness:** Normal / Sturdy / Unbreakable, for a relaxed game.
- **Screen shake:** on or off.

---

## For developers

Needs **Node.js 20.19+ or 22.12+**. On a Mac, install it from [nodejs.org](https://nodejs.org) or with `brew install node`.

```sh
npm install
npm run dev            # play at http://localhost:5173 (hot reload)
npm run build          # production build → dist/
npm run preview        #   …and serve it at http://localhost:4173
npm run build:single   # one self-contained file → dist-single/FragileFreight.html (also copied to play/)
npm run typecheck
```

**Stack:** Vite + TypeScript + three.js + Rapier (`@dimforge/rapier3d-compat`, whose WebAssembly is inlined, so the single file works from `file://`).

**Project layout**

```
src/
  config/     tuning.ts (every feel number, editable live in the ` panel), key bindings
  physics/    Rapier setup, fixed-step world, collision groups, joint motors
  entities/   Player (active ragdoll), PlayerRig (visuals), cargo/ (one class per cargo), hazards/
  levels/     types, LevelBuilder, helpers (ramps, stairs, walls), props, defs/ (one file per level)
  game/       Game, LevelSession (one attempt at a level), progress (best payouts/times)
  render/     renderer, camera, materials, effects, model loading
  input/      keyboard
  audio/      AudioEngine stub (audio is planned, not yet implemented; see NOTES.md)
  ui/         menus, HUD, dev panel
```

**Adding a level:** add a file to `src/levels/defs/` that default-exports a `LevelDef` (boxes, ramps, models, hazards, spawn, checkpoints, goal). It's picked up automatically; `order` sets its place in the job list.

**3D models:** curated CC0 / CC-BY models from Sketchfab live in `public/models/` (with `manifest.json`) and are already committed, so you don't need anything to build. To re-fetch or change them, copy `.env.example` to `.env`, put your token in `SKETCHFAB_TOKEN`, and run `npm run fetch-models`. It only accepts CC0 / CC-BY, optimizes the files and rewrites `CREDITS.md`. Missing models fall back to simple shapes. Never commit `.env`.

**Tests:** browser scenarios drive the real game in headless Chromium:

```sh
npx vite --port 5199 &
FF_URL=http://localhost:5199/ node tests/browser/run.mjs deliver   # ROUTE=moveout-full|delivery-full|mansion-full|glass-south|city-full|cold-full|museum-full|hills-full
FF_URL=http://localhost:5199/ node tests/browser/run.mjs carryall  # every cargo: lift, carry, set down
FF_URL=http://localhost:5199/ node tests/browser/run.mjs menus     # screenshots of every menu
```

Screenshots go to a scratch folder (pass a folder as the second argument to choose one). The `deliver` scenario is a scripted pair of movers that carries the cargo through a whole level, waiting for traffic lights, gaps in traffic and the wrecking ball. Add `DIGITAL=1` to make them move like keyboard players (full speed or stopped). `keys` replays the key events Safari sends, including its two-Shift-keys quirk.

The same scenarios also run in WebKit (Safari's engine) on Linux, through WebKitGTK. Install `gir1.2-webkit2-4.1 python3-gi-cairo xvfb` with apt, then:

```sh
xvfb-run -a python3 tests/webkit/bridge.py node tests/webkit/run.mjs deliver   # plays play/FragileFreight.html
```

See **NOTES.md** for design decisions and tuning notes, and **CREDITS.md** for model credits.
