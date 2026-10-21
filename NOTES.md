# Notes

Design decisions, what still needs tuning, and known limitations.

## Status

| Area | State |
| --- | --- |
| Five jobs and the Practice Yard | Playable start to finish |
| Keyboard controls, rebinding, key tester | Done |
| Menus, HUD, results, saved bests | Done |
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
- Loads have momentum. As the held mass grows, acceleration drops toward `move.carryAccel`, so slamming to a stop sloshes water and tips clocks.
- Picking something up lifts it at least `grip.liftExtra` above where it was grabbed, so tall loads like the glass and the clock clear the floor.
- Letting go of grab lowers the load gently first. Jumping drops it instead.
- A hand that slips can only re-grab the load the other hand holds, until grab is pressed again. This stops movers latching onto walls by accident.

**Damage.**
- Each physics step, every cargo measures "shock": its sudden change in velocity, ignoring gravity. Sudden changes in spin count too, scaled by the cargo's size.
- Shock above the cargo's `safeShock` costs condition, capped per hit. Spinning too fast costs a little over time.
- Each cargo adds its own behaviour on top:
  - TV: static and cracks.
  - Glass: flexes and cracks.
  - Aquarium: water sloshes and spills, and lost water is lost condition.
  - Clock: the pendulum swings.
  - Cake: it squishes.
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
- Spawns and checkpoints can ride on a moving hazard, like the truck in job 2.

**Job order** goes from easiest to hardest, as measured with the delivery bot: TV, aquarium, clock, glass, cake.

**Testing.** `tests/browser/` drives the real game in headless Chromium. A deterministic `advance()` steps the game, so tests never wait in real time. The `deliver` scenario is a scripted pair of movers that carries the cargo through a whole level. Most level changes were checked with it.

## Tuning still needed

Every number below lives in `src/config/tuning.ts` and has a slider in the dev panel (`` ` `` key). So far they're tuned against the bot and screenshots, not human hands. Playtest these first:

- **Wobbliness:** `balance.uprightK`, `balance.waddle`, `arms.swing`.
- **Grip strength versus cargo weight:** `grip.handForce`, `grip.slipStretch`, `grip.slipTime`. Too strong and one mover can carry everything alone. Too weak and hands keep slipping.
- **How much loads lag:** `move.carryAccel`, `move.carrySpeed`.
- **Set-down speed:** `grip.setDownSpeed`.
- **Camera framing when the movers split up:** `camera.minDistance`, `camera.padding`.
- **Par times:** set per level in its file. They're rough guesses from the bot's runs.

For reference, this is the cargo condition the bot delivered with:

| Job | Bot result |
| --- | --- |
| TV | 100% |
| Aquarium | 39–83% (the neighbour and his dog move randomly) |
| Clock | 95–100% down to the hall; 100% for the van ramp on its own |
| Glass | ~99% (each half run separately) |
| Cake | ~77% |

## Known limitations

- **Not yet tested in Safari on a real Mac.** Development and tests used headless Chromium on Linux. The build targets Safari 15+, and the bundle was checked for APIs Safari lacks. If it stutters, try **Graphics: Fast**.
- **Mac keyboards ghost.** Some key combinations don't register when both players hold many keys at once. That's why the Controls screen has a key tester and lets you change every key.
- **No gamepad support**, by request.
- **Randomness.** Pedestrians, the dog and the drunk wander, so the aquarium job plays out differently each run.
- **The single file is about 9 MB** because the 3D models are embedded in it, so it takes a moment to open. The GitHub Pages version loads the models as separate files.
- **Saved bests** live in Safari's local storage. In Private Browsing, or wherever storage is blocked for local files, the game still runs but forgets bests when it closes.
- **Bot coverage has gaps.** The bot finishes each half of the clock and glass jobs, but its full runs sometimes stall: at the van ramp on the clock job, and somewhere in the glass job when both halves are chained. Those are limits of the bot's steering, but they're the spots most worth a human playtest.
- **Performance** was measured in headless Chromium. Physics and game logic take 1–2.3 ms per frame in every level. Rendering cost on a real Mac is unmeasured. The Graphics setting trades resolution and shadow detail for speed.
