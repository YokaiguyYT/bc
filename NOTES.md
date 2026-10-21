# Notes

Design decisions, what still needs tuning, and known limitations.

## Status

| Area | State |
| --- | --- |
| Seven jobs and the Practice Yard | Playable start to finish |
| Jobs 8–10 (piano, painting, balloons) | In progress |
| Keyboard controls, rebinding, key tester | Done |
| Menus, HUD, results, saved bests | Done |
| Way-finding arrow, location tips, auto-pause | Done |
| Single-file build (double-click in Safari) and GitHub Pages | Done |
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

**Job order** goes from easiest to hardest, as measured with the delivery bot: TV, aquarium, clock, glass, cake. The newer jobs follow in the order they were made: the ice swan, then the egg.

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

## Tuning still needed

Every number below lives in `src/config/tuning.ts` and has a slider in the dev panel (`` ` `` key). So far they're tuned against the bot and screenshots, not human hands. Playtest these first:

- **Wobbliness:** `balance.uprightK`, `balance.waddle`, `arms.swing`.
- **Grip strength versus cargo weight:** `grip.handForce`, `grip.slipStretch`, `grip.slipTime`. Too strong and one mover can carry everything alone. Too weak and hands keep slipping.
- **How much loads lag:** `move.carryAccel`, `move.carrySpeed`.
- **Set-down speed:** `grip.setDownSpeed`.
- **Camera framing when the movers split up:** `camera.minDistance`, `camera.padding`.
- **Par times:** set per level in its file. They're rough guesses from the bot's runs.
- **Melting:** the swan's `MELT` rate and each heater's `power`/`radius`. The bot loses ~6% to melting; people will be slower.
- **Laser gates:** `on`/`off`/`phase` in the museum level (2.2 s on, 3.2 s off, staggered).
- **The egg's kicks:** strength and interval in `DinoEgg.preStep`.

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

The keyboard-style bot (`DIGITAL=1`) is much cruder than people: it can't stop precisely or re-grab a dropped corner. It delivers the clock at ~87% but often stalls or drops things elsewhere, so treat its numbers as a worst case.

## Known limitations

- **Not yet tested in Safari on a real Mac.** Every job, every menu and the double-clickable file were run in WebKitGTK 2.52 (Safari's engine family) on Linux with no errors, and the build targets Safari 15+. The graphics drivers and the keyboard on a real Mac are the parts still untested. If it stutters, try **Graphics: Fast**; the game suggests it once if play stays under 40 fps.
- **Mac keyboards ghost.** Some key combinations don't register when both players hold many keys at once. That's why the Controls screen has a key tester and lets you change every key.
- **No gamepad support**, by request.
- **Randomness.** Pedestrians, the dog and the drunk wander, so the aquarium job plays out differently each run.
- **The single file is about 9 MB** because the 3D models are embedded in it, so it takes a moment to open. The GitHub Pages version loads the models as separate files.
- **Saved bests** live in Safari's local storage. In Private Browsing, or wherever storage is blocked for local files, the game still runs but forgets bests when it closes.
- **Bot coverage has gaps.** The bot finishes each half of the clock and glass jobs, but its full runs sometimes stall: at the van ramp on the clock job, and somewhere in the glass job when both halves are chained. Those are limits of the bot's steering, but they're the spots most worth a human playtest.
- **Performance** was measured in headless Chromium. Physics and game logic take 1–2.3 ms per frame in every level. Rendering cost on a real Mac is unmeasured. The Graphics setting trades resolution and shadow detail for speed.
