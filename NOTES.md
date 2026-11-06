# Notes

Design decisions, what still needs tuning, and known limitations.

## Status

| Area | State |
| --- | --- |
| Fifteen hand-made jobs and the Practice Yard | Playable start to finish; a bot route delivers each one |
| Hand-made job variety (time of day, rain or snow) and bonus goals | Done |
| Ghost of your best run (hand-made jobs) | Done (not shown online) |
| Solo play with a robot buddy | Done; works best on open routes (see Solo below) |
| Speedrun leaderboards (this laptop + a world board) | Done; the world board tested against a local broker only |
| Versus (rival crews, friend races by code, quick match) | Done; tested in Chromium with two windows, not between two real laptops |
| Phones and tablets (touch controls, solo with turn buttons, hosting and joining online phone to phone, Add to Home Screen) | Done; tested in Chromium's phone emulation (`touch`, `phones`), not on a real phone yet |
| Keyboard controls, rebinding, key tester | Done |
| Online play (one laptop each, school networks too) | Done; tested in Chromium (direct and relay), not yet between two real laptops |
| Random jobs (more obstacles, 17 settings, twists, hilly routes), endless shift | Done |
| Play screen (Jobs, Daily, Chaos Daily, Quick job, Chaos, Endless shift) | Done |
| Daily (Wordle-style: number, twist, streak, shareable squares) | Done |
| Cash tips on random courses | Done |
| Chaos jobs (slider Mild → ULTRA, 28 kinds of chaos, a siren before each, combos, chaos-only obstacles) | Done; online too |
| The Locker (outfits, trails, dances, emote packs, cargo skins, wallet, 14 quests) and the company rank (Trainee → CEO) | Done; online too |
| Menus, HUD, results, saved bests | Done |
| Way-finding arrow, location tips, auto-pause | Done |
| Single-file build (double-click), GitHub Pages from `/docs` | Done |
| Dev panel | Hidden: only with `?dev` in the address, then the `` ` `` key |
| Gamepad | Not planned (by request) |
| **Audio** | **Planned, not yet implemented** |

## Audio: planned, not yet implemented

The game is silent for now. Audio was deferred on purpose, and everything it needs is already wired in:

- `src/audio/AudioEngine.ts` is a stub with the final interface (`unlock`, `setVolumes`, `music`, `ui`, `sfx`, `attach`, `update`). Every method does nothing yet. Menus and the game loop already call it.
- Gameplay already emits every event audio needs on the typed event bus in `src/game/events.ts`. That covers steps, jumps, landings, grabs, slips and knockdowns. It also covers impacts (with the surface material), cargo damage, breaks and wobble, splashes, checkpoints and the goal. Hazards emit barks and honks, and the clock emits ticks and chimes.
- The Master, Music and Effects sliders in Settings are saved and passed to `setVolumes`, but have no effect yet.
- Plan: synthesize all of it with the Web Audio API inside `AudioEngine`, so no sound files are needed. Subscribe to the events in `attach()`. Call `unlock()` on the first key press, because Safari only starts audio after a user gesture. Nothing outside `src/audio/` should need to change.

## Design decisions

**Stack.** The game uses Vite, TypeScript, three.js and Rapier (`rapier3d-compat`). Rapier is a fast physics engine whose WebAssembly is inlined, so the whole game can ship as one HTML file that Safari opens from `file://` with no server.

**Physics loop.** Physics runs at a fixed 120 Hz, separate from rendering. Movers are controlled only with forces and impulses on dynamic bodies (they're only teleported to respawn), so everything they touch reacts physically.

**Movers (active ragdolls).**
- A spring ray-cast to the ground holds the torso up, Very Very Valet style (the "floating capsule").
- Motors drive the jointed head, arms and legs, and a balance torque keeps the torso upright.
- A mover goes limp, then gets back up, if it tips past `balance.fallAngle` or takes a big hit (`knock.impact`).

This keeps walking reliable while still looking floppy.

**Grabbing.** Hands latch onto whatever they touch. The hold is a spring with a force limit, not a rigid joint: one hand can pull at most `grip.handForce` (118 N). As a result, one mover can't carry the heavy cargo alone, loads sag and swing, and an over-stretched grip slips. These details made carrying feel right:

- A held load follows only the carrier's heading, not their lean or waddle. Otherwise the aquarium copied every wobble and spilled.
- Loads have momentum. As the held mass grows, acceleration drops toward `move.carryAccel`, so slamming to a stop sloshes water and tips clocks. Light but delicate cargo can ask for the same gentle handling with `Cargo.care`. The cake does: two movers sharing its 7.8 kg used to start and stop at about 20 m/s², and a keyboard can't do anything gentler, so every start slid the frosting.
- Picking something up lifts it at least `grip.liftExtra` above where it was grabbed, so tall loads like the glass and the clock clear the floor.
- Letting go of grab lowers the load gently first. Jumping drops it instead.
- A hand that slips can only re-grab the load the other hand holds, until grab is pressed again. This stops movers latching onto walls by accident.
- Round loads are "snug" (`Cargo.snug`, the egg): each hand holds exactly where it grips, re-settling whenever a hand latches. Normally a hand anchors where it was when it latched, which can be 0.2 m off a round surface, and the first hand often latches before its mover turns to face the load. On the narrow egg that left both hands pulling sideways for good, so the pair crawled. It's opt-in because the older cargo was tuned without it: with it, the TV jams in its hallway.
- Whoever carries the egg keeps it upright (a righting torque while held). Mittens on a round shell grip wherever they land, and lifting from low down would tip it right over.

**Damage.**
- Each physics step, every cargo measures "shock": its sudden change in velocity, ignoring gravity. Sudden changes in spin count too, scaled by the cargo's size.
- Shock above the cargo's `safeShock` costs condition, capped per hit. Spinning too fast costs a little over time.
- Each cargo adds its own behaviour on top:
  - TV: static and cracks.
  - Glass: flexes and cracks.
  - Aquarium: water sloshes and spills, and lost water is lost condition.
  - Clock: the pendulum swings.
  - Cake: it squishes.
  - Ice swan: melts all the time (`MELT` in `IceSwan.ts`, ~0.07% a second), faster near heaters (each adds `power` × falloff), not at all in cold spots. It shrinks and drips as it goes, and a hard knock snaps its neck off.
  - Dinosaur egg: cracks where it's hit (an eye peeks out below 60%), and something inside kicks every 7–13 s while it's carried.
  - Upright piano: can't be lifted (`Cargo.liftable = false`); it rolls on low-friction castors, so it runs away down any slope nobody is holding it on. Knocks pop keys out and throw the lid open.
- **Cargo toughness** in Settings scales all damage (`damage.scale`).

**Payout.**
- The base pay is the cargo's value × its condition.
- Each fall costs 5% of the value, and the cargo falling off counts as two falls.
- Finishing under par time adds 10% of the base pay.
- A delivery counts only once the cargo is set down inside the green zone and let go, so walking through the zone doesn't count.

**Levels are data.**
- Each job is a `LevelDef` in `src/levels/defs/`, picked up automatically and built by `LevelBuilder`. It lists boxes, ramps, stairs, models, hazards, the spawn, checkpoints and the goal.
- Hazards come from a registry keyed by `kind`:
  - Machines: movers, trucks, lifts, revolving and swing doors, conveyors, see-saws, fans, spinners, a wrecking ball and a chandelier.
  - Street: cars and traffic lights.
  - Creatures: pedestrians, a dog, a drunk and pigeons.
  - Newer: heaters (fireplace, patio heater, heat lamp, or an invisible cold spot), skiers and sledges crossing a run, a gondola (the lift riding a slope on a cable), laser gates that knock movers flat while they're on, a brass Foucault pendulum (the wrecking ball restyled), and lamps.
- Spawns and checkpoints can ride on a moving hazard, like the truck in job 2.

**Job order** goes from easiest to hardest, as measured with the delivery bot: TV, aquarium, clock, glass, cake. The newer jobs follow in the order they were made: the ice swan, the egg, then the piano.

**Castors.** Rapier averages the friction of two touching surfaces unless told otherwise, so the piano's castor balls use the `Min` combine rule; with the default it barely moved. Movers push it side-on (both on one long side), not end-on.

**Swing doors** turn on their own hinge spring (`SwingDoor.preStep`), not Rapier's joint motor: the motor settled at the wrong angle. Hinges sit just behind the wall and 2 cm off the floor, because a leaf that touches either gets kicked by the solver.

**Eggs and flat bases.** A convex hull with an 18-sided flat base only ever gets one contact point, so the egg rocked on its pedestal until it fell off. It has a small square foot collider under the base, and its pedestals have a solid ring of straw so a bump tips it against the ring instead of off the edge.

**Player 2's keys.** P2 first had everything under the right hand: arrows to move, Right Shift or Return to jump, `/` to grab. Holding `/` (or Return) while working the arrows is a cramped claw, and playtesters found it uncomfortable. The default is now two-handed: right hand on the arrows, left hand on `K` (jump) and `L` (grab). Saved keys still on one of the old layouts move to the new default once, with a note on the menu. **Controls → Player 2 layout** switches between the layouts in one click.

**Keyboard on a Mac.** Keys are tracked by `KeyboardEvent.code`, so layouts and Shift don't change them. Three macOS quirks are handled in `src/input/Keyboard.ts`:
- Keys released while ⌘ is held never send a keyup, so letting go of ⌘ clears them.
- Safari reports letting go of one Shift key while the other is held as another *keydown*. P1 grabs with Left Shift and, in the Return and / layouts, P2 jumps with Right Shift, so this used to cause phantom jumps and stuck grips. A second keydown of a held modifier now counts as its release.
- A modifier the event says isn't held can't be down, whatever events went missing.

**Helping first-timers.**
- An arrow at the screen edge points to the next checkpoint (🚩) or the drop-off (🏁) whenever it's off screen.
- Levels list `tips` tied to tricky spots (the lift, the wrecking ball, the streets…). Each shows once per attempt when the cargo or a mover gets near. The start-of-job `hints` keep only general handling advice.
- Switching to another app or tab pauses the job, so nobody comes back to a broken cake.
- Jump keys double as "select" in menus, so the results card ignores keys for its first 1.2 s, and menu selection stops at the ends instead of wrapping (a stray W on the pause menu used to land on Quit).
- Leaving the page mid-job (a stray trackpad swipe back, ⌘R) asks first.
- If play stays under 40 fps, a one-time tip suggests Graphics: Fast.

**Testing.** `tests/browser/` drives the real game in headless Chromium. A deterministic `advance()` steps the game, so tests never wait in real time.
- `deliver` is a scripted pair of movers that carries the cargo through a whole level. Most level changes were checked with it. `DIGITAL=1` makes them move like keyboard players: full speed or stopped.
- `monkey` has both movers mash random keys in every job, watching for page errors, NaN physics and lost movers.
- `keys`, `pause`, `rebind`, `restart` and `restarts` cover the keyboard quirks, pausing, changing keys, restarting and memory. `p2layout` covers Player 2's layouts and the one-time move off the old keys; `levelnav` the job list (row-by-row keys, title and Back always on screen).
- `tests/webkit/` runs the same scenarios in WebKitGTK, the engine family Safari uses, through a small Python bridge.

## Online play

Two ways for the guest to see the game; the host's laptop always runs it.

**Light mode (the default): the guest draws the level itself.** Both laptops build the job from the same description, so every moving body with a visual is made in the same order on both. The host sends snapshots (`net/sync.ts`): the pose of every body that moved (all of them in a keyframe once a second), the score and clock, who holds what, and the few numbers bodies don't show (cargo `netState()`: water level and slosh, wobbles, melt; hazard `netState()`: a truck's wheels, the dog's mood). About 1–2 KB each, 30 a second over a direct link, 15 over the relay. The guest buffers them and interpolates, a little behind the host (it estimates the host's clock rate, so a host that can't keep up doesn't make it stutter). Game events and particle bursts made by the game itself are sent too and replayed on time, so banners, cracks, confetti and zaps happen on both screens. The guest has its own HUD and its own camera; it turns its keys into a world direction with that camera before sending them.

**Video mode (optional): the host streams its screen.** The canvas goes out as a WebRTC video track (`canvas.captureStream(60)`, up to 6 Mbit/s, at most 1600 px wide) and the guest copies the host's whole UI over it (`net/mirror.ts`). Easier on a slow guest laptop but needs a direct connection and a few megabits. If the guest's picture stays black for a few seconds it asks the host to copy each frame to a plain 2D canvas and stream that instead (for browsers that capture WebGL as black).

**Connecting.** The host registers `fragile-freight-<code>` on two free public matchmaking servers at once: PeerJS's (`0.peerjs.com`, port 443) and EMQX's public MQTT broker (`broker.emqx.io`, secure WebSocket on port 8084, a tiny MQTT client in `net/signal.ts`). The guest says hello on both; whichever reaches the host carries on. Play starts at once through that server as a **relay** (`net/relay.ts`), and meanwhile the laptops try a direct WebRTC link (public STUN only; no TURN, which costs money). If it opens, messages switch to it; if it ever drops, they fall back to the relay. School networks that block direct links still play, through the relay. A server that drops is reconnected in the background; one that couldn't be reached at first is retried now and then.

**Drops.** Both badges warn after 3 s without a word from the other laptop. A guest whose connection drops is offered **Rejoin** (same code); the host turns away a second player only while its own guest is still talking, so a rejoining guest (who comes back with a new id) is let straight in once the old one has gone quiet for 4 s. **Check this network** (Play Online screen, `net/check.ts`) opens each matchmaking server under a throwaway id and asks the STUN servers for a public address, then says in plain words what will work.

**Touch** (`input/Touch.ts`). On a touch screen (a coarse pointer, or any touch since the last key press) an overlay shows a stick that appears under the left thumb, GRAB and JUMP buttons, camera buttons and a menu button; their move merges with the keys of this device's one player (`mergeMoves`): the online guest's P2, the online host's P1, or P1 on one device. Jump taps are counted, like the guest's key taps, so a quick tap is never lost between frames. On phones the join screen gets a text box (the on-screen keyboard can't type into the code boxes). Any key press hides it all. Tested with Chromium's touch emulation (`touch` scenario); not yet on a real iPhone or Android phone.

**Balloons** (job 10). One rigid body: a weighted present the movers hold, with the balloons drawn on strings above it and small colliders that pop a balloon on anything marked `sharp`. Upward pull while nobody holds it, so it floats away (above `ceilingY` it's lost, like a fall); set down on something marked `tie` (a stand, the party table) it's tied on. Carried at a fixed height (`Cargo.holdHeight`) so a light load isn't wrenched crooked by one hand closing before the other. Popped balloons go to the guest in `netState`.

**Painting** (job 9). `windScale(dir, accel)` is large face-on and small edge-on; a strong face-on gust strains the canvas and tears it (shown on the canvas, sent to the guest in `netState`) but never rips it out of the movers' hands. Fans now really push: a push applied from inside Rapier's collider query was lost, so the fan collects what's in its zone first and pushes after. Windsocks fill a second before each gust.

**Emotes.** Number keys emit an `emote` game event (player, kind) on the host; it reaches the guest with the other events, and the HUD shows a bubble over that mover. The guest's number keys go to the host as a control message.

**Keys.** The guest sends its key state 30 times a second on a timer (not per frame, so a slow laptop can't stall it) over the fast channel; jump taps are counted from key presses. The host treats 0.6 s of silence as "all keys up". Online, each player can use either key layout.

Tests (two tabs in one browser): `online` (connect, menus copied, the job built on the guest in step with the host, P2 from either layout, cargo damage, pause, video mode and back, the host quitting, leaving); `ONLY=relay` and `ONLY=direct` variants; `NET=ws://127.0.0.1:9000/peerjs` (the official PeerJS server software run locally), `NET=mqtt MQTT=ws://127.0.0.1:8888` (an MQTT broker run locally), both servers at once, and PeerJS unreachable (falls back to MQTT); `online-errors` (wrong code, third player, host stopping); `online-lag` prints how far behind the guest runs. The sandbox these were built in can't open WebSockets to the internet, so the public servers themselves weren't reached from here. WebRTC is untested in Safari's engine (the Linux WebKitGTK build has none), but light mode over the relay needs only WebSockets.

## Jobs 11–15

Each new load has one trick, written in its own cargo class, and a job built around it:

- **Chandelier** (`Chandelier.ts`): twelve crystal drops swing as one damped pendulum. It's driven by the load's real sideways acceleration in the world, not by "felt gravity" in the load's frame: carried loads rock a degree or two with every step, close to the drops' natural swing, and that rocking pumped them up until they clinked all the way. They hang straight down however the chandelier tilts. Swung past `CLINK` they chip (`GAIN` sets how hard starts and stops swing them).
- **Beehive** (`Beehive.ts`): `anger` rises with sideways acceleration above 3 m/s² (jerky starts and stops) and with real bumps, and drains slowly while moving and faster standing still. At 0.7 a swarm comes out, chases a mover, stings (knocks them over) and turns on the other one, until anger falls back under ~0.3 and they go home. The smooth bot never upsets them; the keyboard-style bot peaks at 0.6.
- **Jelly** (`Jelly.ts`): a world-frame 2D spring (2.2 Hz) plus an up-down squish, shown by shearing and squashing the mould. Wobbling past `TEAR` tears it. The smooth bot delivers it at 99%; the keyboard-style bot at about 86%.
- **Snowman** (`Snowman.ts`): melts like the ice swan, but out in the sun all the time (`SUN` is added to the warmth everywhere). Shade is a heater with negative power (under the parasols and trees, in the freezer and the tent); barbecues are a new heater style (`grill`). The bot loses ~10% on the way.
- **Rocket** (`Rocket.ts`): carried lying down like the clock, resting on two of its X-shaped fins so it doesn't roll. Welders (a new heater style, `welder`, with sparks) raise its `heat`; at 100% the engine burns for 1.4 s, pushing it nose-first (an impulse each physics step: a force added in Rapier stays on until it's reset, which once fired it off at 74 m/s) and scorching it 10%. Cold air (the fans) cools it.

The `newjobs` scenario checks each trick on its own. Hand-made jobs also roll a **variant** each play (`levels/variants.ts`: time of day, rain or snow from the job's `variety`), sent to the online guest with the level; and **bonus goals** (`goals`: no falls, under a time, keep it above a condition) pay 15% of the load's value each (at least $50), the first time.

## Solo

`game/Buddy.ts`: with **Solo** on (Play screen, or `?solo`), the app gives the session a `Buddy` that drives Player 2 each frame, after the keys (and either key set drives Player 1). Away from the load it follows you. By the load it goes to the other side from you, round it with a wide berth (bumping the load costs condition), and when you grab (your grab key held and a hand on it), it steps in and grabs too. Carrying, it copies your movement and keeps the angle round the load and the reach it grabbed at, so side-by-side carrying just works. Pushing or pulling along the load (end to end), it lines the load up with the way you're going instead (the one in front leads, like two people with a ladder); copying alone let a long load crab sideways. `Z` / `C` turn the load: both walk round it, opposite ways (otherwise there's no way to turn a load, since the robot copies you). When you let go it sets it down too. Solo loads take 25% less damage.

How well it works depends on the route. With the bot driving Player 1 (`SOLO=1`, steering the way a person would: push the load at the next waypoint, turn it round for doorways), it delivers the chandelier, beehive, jelly, snowman, rocket and clock-to-the-van jobs every time (the cake job sometimes: the bot only turns the load once it's in the road, and a car gets it); it stalls in the tightest places (the move-out flat's hallway, the piano's shop) and on routes where the 2-player route relies on exact formations. People are better at that than the bot, but those are the places to playtest.

## Leaderboards

`game/board.ts`. A board per hand-made job and per Daily, two-player and solo apart (`<job>~duo`, `<job>~solo`). **This laptop** keeps the five best runs per board in local storage. **The world** board is MQTT retained messages, one per player per board (`fragile-freight/board1/<board>/<random player id>`, holding name, time, condition, date, colour), on two free public brokers (EMQX and HiveMQ) at once; reading a board subscribes to `…/<board>/+` and gets every retained run, merged across brokers by player id. No accounts, nothing to pay, and nothing personal: the name is a nickname the player types (2–14 letters, digits, spaces, `-_.`, a short rude-word filter, no long digit strings), off until they pick one. It's an honour system: anyone could post any time to their own id; times under 12 s, bad names and malformed runs are ignored when reading. Public brokers can wipe retained messages; your own best goes up again the next time you beat it. `?board=ws://…` points it at another broker (tests use a local one), `?board=0` turns the world board off, `?boardns=…` gives a test run boards of its own.

## Versus

`game/rival.ts` (the other crew, drawn as see-through movers and load with a name tag) and `net/race.ts` (online). Each crew plays its own copy of the job; nothing physical is shared, so there's no lag in your own play. **Rival crews**: recorded deliveries by the test bot (`GHOST_OUT=…` on the deliver scenario, then `scripts/make-rivals.mjs` writes `levels/rivals.ts`, 8 frames a second as deltas), replayed at 0.7× (Easy), 0.9× (Normal) or 1.1× (Hard). Jobs whose bot route teleports between sections (the aquarium, and the clock and glass whose full routes stall) have no rival crew. **Online**: like co-op, a five-letter code on the free matchmaking server, relayed through it, under codes of its own (`fragile-freight-race-…`); the host picks the job and the time of day and weather, the guest says ready, the host says go and both count down 3 s. Each laptop sends its crew's positions 10 times a second and `done` (time, delivered or not) at the end; positions are shown 0.25 s behind, blended. **Quick match**: everyone looking hosts a race under a fresh code and announces it on a lobby topic on the public brokers every 2 s; whoever sees an older announcement joins that code (ties broken by id); after 20 s with nobody, it's the rival crew.

## Random jobs

`src/levels/gen/`: a seeded generator strings course pieces together (ramps, stairs, doors, slaloms, wrecking balls, traffic with a traffic island, laser gates, ice, pedestrians, conveyor belts, lifts, swing doors, a bridge with no railings, a cable car, a see-saw, corners), in nine settings (docks, suburb, park, snow, office, sky islands, beach, building site, downtown), at day, sunset or night, each with a client line (“Mrs. Patel needs…”) drawn last so it never changes the course, with a start kit for the cargo (the same stands and heights as the hand-made jobs), a checkpoint every three obstacles and a drop-off at the end. Pieces are written in their own frame (enter at the origin heading -Z), so a course can turn west or east (never back toward the camera). Each piece also writes the test bot's route through it, so any job can be checked: `GEN=<number> CARGO=<kind> … run.mjs deliver`.

Fairness rules learned from the bot: wrecking balls swing slowly (7.5–8.8 s a swing) so there are about three seconds to carry something heavy across; the road has a traffic island so you cross one lane at a time, and the gap the bot waits for grows with the cars' speed; stairs are gentle (0.16 m rise, 0.5 m run); no ice for cake, egg or piano; doors are wide for big loads, with a straight run-up; glass gets a rack at the drop-off (a pane can't stand on its own) and cake, swan and egg get a stand; pedestrians cross on two zebra crossings far enough apart to wait between them, and wait at the kerb (off the path, through gaps in the railing) while anyone is within 4.5 m of their crossing: earlier, walkers that stopped for movers stopped in the middle of the path and blocked them; lifts are deep enough for a load carried end to end; no conveyor belts or cable cars for the piano (it rolls off on its castors), and no belts for the glass either (in build 11's check one shoved the pane side-on into the edge and pinned it there) and no see-saws for piano, cake, egg or the clock carried end to end (nor cable cars for the clock); see-saws tip slowly and no steeper than 8° or the load's ramp limit, and the bot stops in the middle to let one tip (as the tip tells players to); swing doors hang just past the wall so the leaves never rub; the glass drop-off rack has a ledge for the pane's foot, so pushed in it tips forward onto the bar (pushed into a bar alone, the top stops, the foot swings on, and the pane falls backwards). Bump `NET_VERSION` when random jobs change: the online guest rebuilds them from the number.

The painting and the balloons are in random jobs too (ten kinds of cargo): the painting starts in job 9's padded slot and goes onto job 9's gallery easel, and never goes round a corner or over a conveyor belt (it leans back from its picture, so turned round on the way it would lean off the easel, not onto it; the belt drags the movers round); the balloons start on job 10's stand, are tied onto a party table at the drop-off, keep away from doorways, swing doors and the cable car (the bouquet floats above door height), and if let go they're lost 9 m above the highest floor (back to the last checkpoint). Both are picked up off their stands by the bot as players do.

Sweeps (the bot plays a batch of numbered jobs, cycling the cargo): the first one delivered 7 of 16; after the fixes above, 13 of 16, and the three failures (pedestrians shoving the movers into a rail, and a lift leaving with one mover still stepping on) led to the pedestrian and lift rules. With all the pieces in build 7, 15 of 16 (the one failure, a belt carrying the glass into the railing, led to the bot starting belts upstream), plus 13 of 13 jobs chosen for crossings, wrecking balls and see-saws. Run one with a loop over `GEN=<n> CARGO=<kind> … run.mjs deliver` and grep each log for `"state":"delivered"`. Build 10 (denser courses with tips): 8 of 8, one of each cargo (TV, aquarium, clock, glass, cake, painting, balloons, piano), all at 94–100%; Mild chaos jobs: 5 of 6 (the glass failure was a gust on ice, since softened).

Build 11 added more pieces (`gen/pieces2.ts`: collapsing planks, a level crossing with trains, a sliding crane beam, sprinklers, an escalator, a narrow ledge, stepping stones, mud, spinning arms), variants of older ones (a four-cone slalom, double wrecking balls, lorries in the traffic, two or three laser gates), eight more settings (market, airport, factory, rooftops at sunset, a haunted graveyard at night, desert, jungle, pirate cove) and twists for random jobs (rain, fog, hilly, extra-fragile ×1.5 pay, no checkpoints ×1.3 pay). Sweeps of the new pieces: the first batch's only failures were the spinners (now further apart), the second 14 of 14. Mud lies flush with the floor: a 3 cm lip stopped the piano's castors dead.

## Daily

`src/game/daily.ts`. Daily #1 was 31 October 2026 (local date); the job number and the twist come from the date, so every laptop makes the same course with no server. The best go of the day is kept (a delivery beats none, then the bigger payout). The share card's squares come from `StretchTracker`: the course's stretches start at known points (`LevelDef.stretches`), and the cargo's health is noted as it passes near each; skipped points (taken in one go) count as passed.

## Chaos jobs

`src/game/chaos.ts` (the levels, kinds and events) and `src/entities/hazards/chaos.ts` (the director). A chaos job is a random course (4 + level obstacles, a bit harder) with one `chaos` hazard holding the course's stretch points, so it knows which way is ahead. On the host, every few seconds (16 s on Mild, 4.5 s on ULTRA, sometimes two at once from Mayhem) it starts one of the enabled events around the cargo (or the movers if the cargo's far off). Meteors aim 4.5 m+ away on Mild and, on Mayhem and ULTRA, sometimes right at the load; spawns look for floor near the movers' level so nothing lands in the void or behind a kerb.

Online: every body it can throw (8 rocks, 4 beach balls, 8 boxes, 4 barrels, 8 chickens) is made up front, disabled and parked far below, in the same order on both laptops, so the guest's copy moves them from the host's snapshots like any other body. What bodies don't show (the quake, the wind, the UFO, the fog, the money notes, what's on) is in `netState`; banners are a game event. Moon gravity and super jumps change the shared tuning while they last; the director puts it back when the event ends and when the job is left. New events stop once the job is delivered or lost. `trigger(id)` starts one on demand (tests).

Build 11 doubled the events (28 in all; the list is `CHAOS_EVENTS` in `src/game/chaos.ts`, kept out of the menus so they stay a surprise). Most of the new ones live in a second hazard, `ChaosCompanion` (`hazards/chaos2.ts`), that the director hands them to. A siren banner comes 1.2–1.8 s before each one, and on Mayhem and ULTRA two sometimes come together as a named combo. Chaos courses can also include four obstacles of their own (a turntable, bumpers, trampolines, cannons). **Chaos Daily** is one chaos course a day for everyone (level 5 at weekends), with its own best and share line.

The bot isn't made for chaos (it doesn't dodge), so sweeps only check that Mild chaos jobs stay deliverable; see the chaos and online-gen scenarios for the rest.

## The Locker

`src/game/outfits.ts` (items, quests, wallet, stats), `src/render/accessories.ts` (hats, face things and back things made of primitives; anything named `spin` or `flap` is animated by the rig) and `PlayerRig.applyOutfit`. The wallet is credited with every successful payout (an existing save starts with the sum of its best payouts); stats for quests start from the saved bests too. Online, the guest sends its P1 outfit when it joins; the host builds the job with `[its P1, the guest's]` (the guest's colour changes if it's the same) and sends the pair with the level, and sends each job's result so the guest's wallet and quests count it too.

**Rank and extras.** Lifetime earnings (`stats.earned`) set the company rank (`RANKS`: Trainee $0 … CEO $90,000); some items need a rank. Trails, dances, emote packs and cargo skins are Locker slots like hats. **Ghosts** (`game/ghost.ts`) record the movers and the load 8 times a second and keep the fastest delivery per hand-made job in local storage.

## Tuning still needed

Every number below lives in `src/config/tuning.ts` and has a slider in the dev panel (`` ` `` key, only with `?dev` in the address). So far they're tuned against the bot and screenshots, not human hands. Playtest these first:

- **Wobbliness:** `balance.uprightK`, `balance.waddle`, `arms.swing`.
- **Grip strength versus cargo weight:** `grip.handForce`, `grip.slipStretch`, `grip.slipTime`. Too strong and one mover can carry everything alone. Too weak and hands keep slipping.
- **How much loads lag:** `move.carryAccel`, `move.carrySpeed`.
- **Set-down speed:** `grip.setDownSpeed`.
- **Camera framing when the movers split up:** `camera.minDistance`, `camera.padding`.
- **Par times:** set per level in its file. They're rough guesses from the bot's runs.
- **Melting:** the swan's `MELT` rate and each heater's `power`/`radius`. The bot loses ~6% to melting; people will be slower.
- **Laser gates:** `on`/`off`/`phase` in the museum level (2.2 s on, 3.2 s off, staggered).
- **The egg's kicks:** strength and interval in `DinoEgg.preStep`.
- **The piano:** castor friction and damping in `UprightPiano.ts`; the cable car's `speed`/`spacing` in the hills level.
- **Solo:** the robot's gains in `Buddy.ts` (how hard it keeps its place, the turn speed), and whether 25% tougher loads is the right help.
- **Rival crews:** the Easy / Normal / Hard speeds in `rival.ts` (Normal is a little slower than the bot).
- **Jobs 11–15:** the chandelier's `GAIN`/`CLINK`, the bees' anger rates, the jelly's `GAIN`/`TEAR`, the snowman's `MELT`/`SUN` and the shade's `power`, the rocket's heat rate and the welders' `radius`/`power`.

For reference, this is the cargo condition the bot delivered with (same in Chromium and WebKit):

| Job | Bot result |
| --- | --- |
| TV | 100% |
| Aquarium | 62–80% (the neighbour and his dog move randomly; 67.5% in the latest run) |
| Clock | 100% down to the hall; 100% for the van ramp on its own |
| Glass | ~99% (each half run separately) |
| Cake | 98.6% |
| Ice swan | 93.8% (almost all of it melting; 93.7% in WebKit) |
| Dinosaur egg | 100% (through the pendulum and all three laser gates; same in WebKit) |
| Upright piano | 100% (down the hill, past the cable car and the crooked street) |
| Chandelier | 100% (keyboard-style: crystals clink, ~1% lost to them) |
| Beehive | 100% (the bees stay calm; keyboard-style they buzz but don't swarm) |
| Giant jelly | 99% (keyboard-style: ~86%) |
| Snowman | ~90% (melting) |
| Space rocket | 100% (down the middle, clear of the sparks) |

The keyboard-style bot (`DIGITAL=1`) is much cruder than people: it can't stop precisely or re-grab a dropped corner. It delivers the clock at ~87% but often stalls or drops things elsewhere, so treat its numbers as a worst case.

## Known limitations

- **Not yet tested in Safari on a real Mac.** Every job, every menu and the double-clickable file were run in WebKitGTK 2.52 (Safari's engine family) on Linux with no errors, and the build targets Safari 15+. The graphics drivers and the keyboard on a real Mac are the parts still untested. If it stutters, try **Graphics: Fast**; the game suggests it once if play stays under 40 fps.
- **Mac keyboards ghost.** Some key combinations don't register when both players hold many keys at once. That's why the Controls screen has a key tester and lets you change every key.
- **No gamepad support**, by request.
- **Online play hasn't been tried between two real Macs yet.** Everything except Safari's own WebRTC was tested (see Online play above). If the friend sees a black picture for more than a few seconds, the automatic fallback should kick in; if they never connect, being on the same Wi-Fi is the usual fix.
- **Online has a little lag for the guest:** their keys travel to the host and the picture comes back, typically 0.1–0.2 s on home Wi-Fi.
- **Randomness.** Pedestrians, the dog and the drunk wander, so the aquarium job plays out differently each run.
- **Solo, Versus and the world leaderboard are new** and so far only played by the test bot and the scenarios. The world board and quick match use free public MQTT brokers that this game doesn't control: if one is down or blocked at school, the other is tried, and without either you still get this laptop's times and the rival crews.
- **Chaos jobs, the Locker and jobs 11–15 are new** and so far only played by the test bot and the scenarios. Chaos is tuned so the bot (which doesn't dodge anything) delivers about 5 in 6 Mild jobs; how wild Mayhem and ULTRA feel to people, and whether the prices in the Locker feel right, need a playtest.
- **The single file is about 11 MB** because the 3D models are embedded in it, so it takes a moment to open. The GitHub Pages version loads the models as separate files.
- **Saved bests** live in Safari's local storage. In Private Browsing, or wherever storage is blocked for local files, the game still runs but forgets bests when it closes.
- **Bot coverage has gaps.** The bot finishes each half of the clock and glass jobs, but its full runs sometimes stall: at the van ramp on the clock job, and somewhere in the glass job when both halves are chained. Those are limits of the bot's steering, but they're the spots most worth a human playtest.
- **Performance** was measured in headless Chromium. Physics and game logic take 1–2.3 ms per frame in every level. Rendering cost on a real Mac is unmeasured. The Graphics setting trades resolution and shadow detail for speed.
