# Fragile Freight

A goofy **2-player** physics game: share **one keyboard**, play **online** with each of you on your own laptop, or play **solo** with a robot buddy. You and a friend are two wobbly movers in work overalls. Your job: carry very expensive, very fragile things (a CRT TV, a full aquarium, a grandfather clock, a pane of glass, a wedding cake, a melting ice swan, a dinosaur egg, an upright piano, a masterpiece, a bunch of helium balloons, a crystal chandelier, a beehive, a giant jelly, a snowman, a space rocket) through chaotic obstacle courses without breaking them. Race other crews in **Versus**, and chase the fastest times on the **leaderboards**.

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
- **Won't connect?** **Play Online → Check this network** (on both laptops) tests the two matchmaking servers and whether a direct link looks possible, and says in plain words whether online play will work there. If the network blocks both servers, a phone's hotspot works.
- **Both laptops need the same version of the game** (the same link, or files from the same day): a random job's number only makes the same course in the same version.
- **Keys:** online, each of you can use **WASD** *or* the **arrows** (with either player's jump and grab keys), whichever is comfier. Each of you has your own camera (`Q`/`E` to spin it).
- **The friend's `Esc`** opens a small menu: keep playing, pause the game, graphics quality, the picture mode, or leave. The host runs the pause menu and picks the jobs.
- **A slow Chromebook?** In the friend's `Esc` menu, try **Graphics: Fast**, or **Picture: stream it from my friend** (the host's laptop sends a video instead; that needs a direct connection).
- If your friend's Wi-Fi drops, the line at the bottom says so within a few seconds. Their screen offers **Rejoin**, straight back in with the same code.
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
- `1` `2` `3` `4`: say something over your mover (👋 Hi! · 👍 Nice! · 😬 Careful! · ✋ Wait!). Player 2 on the same keyboard uses `7` `8` `9` `0`; online, you both use `1`–`4`.
- `Esc` or `P`: pause

You can change every key under **Controls**. That screen also has a **key tester**. Mac keyboards can't always register lots of keys at once ("ghosting"), so both players should hold their keys together there and check they all light up.

### Playing on your own (🤖 Solo)

No one to play with? On the **Play** screen, switch **👥 Two players** to **🤖 Solo + robot buddy**. You're Player 1 (`W` `A` `S` `D` or the arrows, `Space` or `K` to jump, `Left Shift` or `L` to grab) and Player 2 is a **robot** that helps: it waits on the other side of the load, grabs it when you do, walks with you, and sets it down when you let go. Away from the load it tags along behind you. To **turn the load round** (for doors and corners), hold `Z` or `C` (or `,` / `.`): you both walk round it, opposite ways. Solo works in every mode (jobs, the Daily, random jobs, chaos, the endless shift, Versus), loads are a bit tougher when you're on your own, and solo times have their own leaderboards.

### On a phone or tablet

Mostly for joining a friend's game online (they host on a laptop): open the same link, **Play Online → Join a friend**, and type the code. On a touch screen, controls appear while you play: drag anywhere on the left half to move (a stick appears under your thumb), hold **GRAB**, tap **JUMP**, the small round arrows turn the camera, and the **‖** button in the top corner opens the menu. Pressing any key hides them again, so laptops are unaffected. It also works for hosting on a tablet (you're P1, your friend on their laptop is P2). A phone renders the whole game, so pick **Graphics: Fast** if it's choppy.

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
9. **Gone With the Wind** (a gilt-framed painting): a sail in the wind. Out of a rooftop studio past the extractor fans, single file over the gangway in a lull, along the windy cliff path and over the causeway to the lighthouse keeper's cottage. Keep its thin edge to the wind or the gusts rip the canvas.
10. **Up, Up and Away** (a balloon bouquet): a birthday delivery through the funfair. Let go and it floats off; anything pointy pops a balloon. Weave past the darts stall and the cacti, duck through the pin-studded Tunnel of Love (the bouquet wants to rise), past the hedgehog topiary and onto the party table.

11. **Swing Time** (a crystal chandelier): out of the antiques store, across the ballroom between the waltzing couples, up the grand staircase and onto the stage. Its crystals really swing: start, stop or turn sharply and they clink, chip and fall off.
12. **Mind the Bees** (a beehive, bees and all): across the farm past the chickens and an excitable dog, through the gate, over the footbridge and through the orchard's sprinklers. Jerky starts, stops and bumps make the bees cross; get them angry and they come out and sting you off your feet. Stand still and they calm down.
13. **Wibble Wobble** (a giant jelly): from the hotel kitchen, through the swing doors, between the waiters and up to the birthday table. It wobbles at every start and stop; let it settle, or it tears.
14. **Snow Business** (a snowman): a scorching day in the park. Out in the sun it melts, so dash from shade to shade, keep away from the barbecues and get it into the Winter Wonderland tent.
15. **Lift Off** (a space rocket): carried end to end through a hangar full of welders. Their sparks heat it up, and if it overheats the engine lights and it drags you off nose-first. Cool it by the fans, then up the ramp to the launch pad.

There's also a **Practice Yard** to learn the controls.

**Every play is a bit different:** most jobs come at a different time of day each time (day, sunset or night), and some in the rain (wet, slippery floors) or snow. Most jobs also have **two bonus goals** (no falls, beat a time, keep it above 90%…), named at the start, that pay extra the first time you manage them; the job card shows how many you've done.

**👻 Ghost:** your fastest delivery of each job is kept, and next time a see-through ghost of that run plays alongside you to race against (turn it off in Settings).

### The Play screen

**Play** opens the big choices, so nothing is buried (and the switch at the top picks **two players** or **solo with the robot buddy**):

- **🚚 Jobs:** the hand-made jobs above, with the **Practice Yard** first (marked START HERE the first time).
- **📅 Daily #N:** one course for everyone each day, Wordle-style, with a **twist** (night, rush hour, double tips, an extra-long route, busy streets). Deliver it every day for a 🔥 **streak**; the last seven days show as ticks. The results card gives you a spoiler-free line of squares (🟩 barely a scratch · 🟨 a few knocks · 🟥 a beating · 💥 broke here, one per stretch of course) and a **Copy** button to paste it in the group chat.
- **🎲 Quick job:** a brand-new random course (any cargo, any place, a string of obstacles: ramps, stairs, doors, swing doors, slaloms, wrecking balls, traffic, laser gates, ice, pedestrians, conveyor belts, lifts, cable cars, see-saws, ferries, bridges with no railings, collapsing planks, level crossings with trains, crane beams, sprinklers, escalators, narrow ledges, stepping stones, mud, spinning arms, corners), in all sorts of places (streets, parks, docks, a market, an airport, a factory, rooftops at sunset, a haunted graveyard at night, the desert, the jungle, a pirate cove…). Some come with a **twist**: rain, fog, a hilly route, an extra-fragile load (pays more), or no checkpoints (pays more). Or **type a job number** from a friend's results card to play that exact course.
- **🌀 Chaos Daily #N:** one chaos course for everyone each day (wilder at weekends), with its own share line.
- **💥 Chaos:** courses where crazy things keep happening (below).
- **♾️ Endless shift:** job after job, each one longer and harder, until something breaks. Your best shift is kept.
- **⚔️ Versus:** two crews race the same job, a load each: **first to deliver wins**. The other crew shows as see-through ghosts with a name tag (they can't bump into you). Race the **rival crew** (🐢 Easy, 🚚 Normal or 🏎️ Hard), **host a race** for a friend on another laptop (they pick **Join a friend's race** and type the code), or **quick match** someone else who's looking right now; if nobody is, the rival crew turns up instead. Each laptop can be two players on one keyboard or one player with the robot buddy, so it's 2 v 2, 1 v 1 or anything in between.
- **🏆 Leaderboards:** the fastest deliveries of every hand-made job and of each day's Daily, with two-player crews and solo players on separate boards. **This laptop** keeps its five best runs on each; **the world** board shows everyone's best. To be on the world board, pick a **board name** (a nickname, never your real name: everyone can see it). Your best time goes up when you deliver, and the results card tells you where you came. It works offline too (then you just see this laptop's times).

**💵 Tips:** banknotes float along every random course, some on the easy line and some right where it's risky. Walk through one to pocket it; they're paid with the delivery.

### 💥 Chaos

Separate from the usual jobs: pick **how much chaos** on a slider (🙂 Mild · 😬 Wild · 🤪 Bonkers · 😱 Mayhem · 💀 ULTRA CHAOS; the arrow keys move it) and go. What happens is a surprise: the Chaos screen doesn't spoil it (there's a lot of it, and it happens more often, closer to your load, and sometimes several at once the higher the slider goes). A siren gives you a moment's warning before each one, and a banner says what's going on. Chaos courses also have a few obstacles you'll only meet there. Chaos pays more (×1.25 on Mild up to **×3 on ULTRA**), and your best chaos delivery is kept. Give a friend the job number from your results card (Chaos → 🔢 A friend's number) to play the same chaos. It works online too.

### 👕 The Locker

Every delivery pays into the company **wallet** (an existing save starts with what you'd already earned). In the **Locker** (main menu) each mover gets their own **colour**, **hat**, **face thing** and **something on the back**: beanies, cowboy, top and pirate hats, a traffic cone, bunny ears, a flower crown, shades, big glasses, a beard, a cape, a guitar, a balloon… Some things can't be bought: **14 quests** (deliver five jobs, pocket 25 tips, three flawless deliveries, a three-day daily streak, seven dailies, a five-job shift, deliver online, survive ULTRA CHAOS, survive 50 chaos surprises, a $3,000 payday…) win a propeller cap, a crown, a Viking helmet, a halo, a space helmet, a jetpack, angel wings, chaos goggles, solid gold and more. There are over 40 things to wear in all, and the Quests tab keeps the company records (deliveries, tips, best payout, best streak…). The camera circles the mover you're dressing, and **🎲 Surprise me** picks a random mix of what you own.

Everything you earn also counts toward your **company rank**, from Trainee up through Mover, Senior Mover, Crew Lead, Foreman, Depot Manager, Regional Manager and VP of Moving to **CEO**. A promotion shows on the results card, and some Locker things only unlock at a rank. The Locker also has **trails** (hearts, bubbles, hot feet, sparkles, flower petals, money…) that follow your feet, **dances** your movers do after a delivery (jumping jacks, the wiggle, a conga…), **emote packs** (what your mover says with the emote keys) and **cargo skins** (gold, rainbow, sparkly). Online, your mover wears *your* Locker's outfit on both screens (if you both picked the same colour, the guest's changes), and the guest gets paid into their own wallet too.

Every random course is checked to be fair: each obstacle is built so the cargo it's paired with can get through (no stairs for the piano, no ice under the cake, wider doors for big loads), and a test robot plays hundreds of them.

## Settings

- **Graphics:** Fast / Balanced / Pretty. Pick **Fast** if Safari stutters.
- **Cargo toughness:** Normal / Sturdy / Unbreakable, for a relaxed game.
- **Screen shake:** on or off.
- **Ghost of your best run:** on or off.

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

Screenshots go to a `test-shots` folder (pass a folder as the second argument to choose one). The `deliver` scenario is a scripted pair of movers that carries the cargo through a whole level, waiting for traffic lights, gaps in traffic and the wrecking ball. Add `DIGITAL=1` to make them move like keyboard players (full speed or stopped), `SOLO=1` to drive Player 1 only with the robot buddy as Player 2, and `GHOST_OUT=<file>` to save the run (the rival crews' runs are made that way: `node scripts/make-rivals.mjs <folder>`). `keys` replays the key events Safari sends, including its two-Shift-keys quirk.

The same scenarios also run in WebKit (Safari's engine) on Linux, through WebKitGTK. Install `gir1.2-webkit2-4.1 python3-gi-cairo xvfb` with apt, then:

```sh
xvfb-run -a python3 tests/webkit/bridge.py node tests/webkit/run.mjs deliver   # plays play/FragileFreight.html
```

See **NOTES.md** for design decisions and tuning notes, and **CREDITS.md** for model credits.
