# Fragile Freight

A goofy **2-player** physics game: share **one keyboard**, or play **online** with each of you on your own laptop. You and a friend are two wobbly movers. Your job: carry very expensive, very fragile things (a CRT TV, a full aquarium, a grandfather clock, a pane of glass, a wedding cake, a melting ice swan, a dinosaur egg, an upright piano) through chaotic obstacle courses without breaking them.

It runs in **Safari or Chrome**, on a Mac or a **Chromebook**. There's nothing to install.

---

## Play it (no command line needed)

### Option 1: download one file and double-click it (works offline)

1. Open **[`play/FragileFreight.html`](play/FragileFreight.html)** here on GitHub.
2. Click the **Download raw file** button (the ↓ icon at the top right of the file view).
3. Find `FragileFreight.html` in your Downloads and **double-click it**. It opens in Safari. That's it.
   - If it opens in a different browser, right-click it → **Open With → Safari**.
   - You can move the file anywhere (the Desktop is fine). Your best payouts are remembered by Safari.
   - For a bigger view, use Safari's **View → Enter Full Screen**.

### Option 2: play from a link (best for Chromebooks and school)

School Chromebooks often won't open downloaded files, but a link always works. One-time setup on GitHub (a minute, no command line):

1. Open the repository on GitHub → **Settings** → **Pages** (left side).
2. Under **Build and deployment**, set **Source: Deploy from a branch**.
3. Pick the branch **`claude/brave-meitner-74ar9h`** and the folder **`/docs`**, then **Save**.
4. After a minute or two, play at **https://yokaiguyyt.github.io/bc/** (bookmark it, send it to your friend). Every update to that branch updates the link.

(Later, when everything is merged into `main`, you can switch the source to `main` and `/docs`, or to **GitHub Actions**, which also publishes a faster-loading version.)

---

## Play online: one laptop each (works at school)

No more four hands on one keyboard. Both of you need the game: the same link (best) or the same `FragileFreight.html` file. A MacBook and a Chromebook together is fine.

1. **The faster laptop hosts.** Main menu → **Play Online** → **Host a game**. A five-letter code appears, like `K7QXM`.
2. **Your friend joins.** On their laptop: **Play Online** → **Join a friend**, type the code, press **Return**.
3. The host picks a job as usual. The friend plays **P2** (blue).

- **How it works:** the game runs on the host's laptop. The friend's laptop draws the same scene itself from a stream of positions (a couple of kilobytes, many times a second), so it stays sharp and needs very little Wi-Fi.
- **School networks:** if the network won't let the laptops connect directly, the game passes its messages through the matchmaking server instead. It's a little slower, but it works. The friend's `Esc` menu shows which way you're connected.
- **Keys:** online, each of you can use **WASD** *or* the **arrows** (with either player's jump and grab keys), whichever is comfier. Each of you has your own camera (`Q`/`E` to spin it).
- **The friend's `Esc`** opens a small menu: keep playing, pause the game, graphics quality, the picture mode, or leave. The host runs the pause menu and picks the jobs.
- **A slow Chromebook?** In the friend's `Esc` menu, try **Graphics: Fast**, or **Picture: stream it from my friend** (the host's laptop sends a video instead; that needs a direct connection).
- If your friend drops out, the game pauses. They can rejoin with the same code.
- **It's free.** Free public servers (PeerJS, with EMQX's MQTT server as a backup) introduce the two laptops. There's no account and nothing to pay.
- If your Mac asks whether the browser may **find devices on your local network**, say **Allow**.

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

### Endless jobs

At the top of the job list:

- **🎲 Random job:** a brand-new course every time: a random cargo, place and string of obstacles (ramps, stairs, doors, slaloms, wrecking balls, traffic, laser gates, ice, pedestrians, conveyor belts, lifts, corners), with checkpoints along the way. Each one has a **job number** (on the results card): tell a friend and you can both play the same course.
- **📅 Today's job:** the same course for everyone all day; a new one tomorrow. Your best today is kept.
- **🔢 By number:** type a job number from someone's results card to play that exact course.
- **♾️ Endless shift:** job after job, each one longer and harder, until something breaks. Your best shift is kept.

Every random course is checked to be fair: each obstacle is built so the cargo it's paired with can get through (no stairs for the piano, no ice under the cake, wider doors for big loads), and a test robot plays hundreds of them.

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
  net/        online play: matchmaking (PeerJS + MQTT), direct link and relay, snapshots (sync.ts), menu mirror
  audio/      AudioEngine stub (audio is planned, not yet implemented; see NOTES.md)
  ui/         menus, HUD, dev panel
```

**Random jobs:** `src/levels/gen/`. A piece (in `pieces.ts`) builds one stretch of course in its own frame (enter at the origin heading -Z, floor at y 0) and writes the bot's route through it; `generate.ts` strings pieces together from a seed. Adding a piece = writing one more `Piece` and listing it in `PIECES`, then checking it with `genbuild` and a few `GEN=` bot runs.

**Adding a level:** add a file to `src/levels/defs/` that default-exports a `LevelDef` (boxes, ramps, models, hazards, spawn, checkpoints, goal). It's picked up automatically; `order` sets its place in the job list.

**3D models:** curated CC0 / CC-BY models from Sketchfab live in `public/models/` (with `manifest.json`) and are already committed, so you don't need anything to build. To re-fetch or change them, copy `.env.example` to `.env`, put your token in `SKETCHFAB_TOKEN`, and run `npm run fetch-models`. It only accepts CC0 / CC-BY, optimizes the files and rewrites `CREDITS.md`. Missing models fall back to simple shapes. Never commit `.env`.

**Tests:** browser scenarios drive the real game in headless Chromium:

```sh
npx vite --port 5199 &
FF_URL=http://localhost:5199/ node tests/browser/run.mjs deliver   # ROUTE=moveout-full|delivery-full|mansion-full|glass-south|city-full|cold-full|museum-full|hills-full
FF_URL=http://localhost:5199/ node tests/browser/run.mjs carryall  # every cargo: lift, carry, set down
FF_URL=http://localhost:5199/ node tests/browser/run.mjs menus     # screenshots of every menu
FF_URL=http://localhost:5199/ node tests/browser/run.mjs online    # host + guest in two tabs: join, picture, keys, pause, leave
FF_URL=http://localhost:5199/ node tests/browser/run.mjs online-errors   # wrong code, full game, host leaves
FF_URL=http://localhost:5199/ node tests/browser/run.mjs genbuild  # build 24 random jobs and check them (SEEDS=n)
FF_URL=http://localhost:5199/ GEN=123456 CARGO=tv node tests/browser/run.mjs deliver   # the bot plays a random job by number
FF_URL=http://localhost:5199/ node tests/browser/run.mjs genflow   # random / daily / shift menus and results
```

Screenshots go to a scratch folder (pass a folder as the second argument to choose one). The `deliver` scenario is a scripted pair of movers that carries the cargo through a whole level, waiting for traffic lights, gaps in traffic and the wrecking ball. Add `DIGITAL=1` to make them move like keyboard players (full speed or stopped). `keys` replays the key events Safari sends, including its two-Shift-keys quirk.

The same scenarios also run in WebKit (Safari's engine) on Linux, through WebKitGTK. Install `gir1.2-webkit2-4.1 python3-gi-cairo xvfb` with apt, then:

```sh
xvfb-run -a python3 tests/webkit/bridge.py node tests/webkit/run.mjs deliver   # plays play/FragileFreight.html
```

See **NOTES.md** for design decisions and tuning notes, and **CREDITS.md** for model credits.
