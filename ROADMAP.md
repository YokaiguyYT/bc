# Roadmap: the next session (parallel work)

A plan for a multi-agent session: independent work items, each small enough
for one agent, each with how to check it. Work on branch
`claude/brave-meitner-74ar9h`; commit small, run the checks, push.

## Ground rules (from the owner)

- **No audio.** Don't build music, sound effects or the synth AudioEngine. Keep
  the `AudioEngine` stub and the game events as they are.
- **No gamepad.** Keyboard only (touch only if the mobile item below is picked).
- **Nothing that costs money.** Free public services only, no accounts.
- **Never commit the Sketchfab token** (`.env` is gitignored).
- Must keep working from a **double-clicked single file** (`npm run build:single`
  → `play/FragileFreight.html` and `docs/index.html`) in Safari and Chrome, and
  on a **school Chromebook** (Chrome, weak GPU, school Wi-Fi).
- The owner plays at school: **online play (MacBook + Chromebook) must keep working.**

## How to check things

```sh
npx vite --port 5199 --strictPort &      # dev server for the tests
npx tsc --noEmit -p .                    # types
FF_URL=http://localhost:5199/ node tests/browser/run.mjs <scenario> [outdir]
```

Key scenarios: `online` (also `ONLY=relay`, `ONLY=direct`), `online-errors`,
`genbuild` (SEEDS=n), `genflow`, `deliver` (ROUTE=<route> or GEN=<number>
CARGO=<kind>), `pickup`, `carryall`, `coop`, `p2layout`, `levelnav`, `menus`.
Sweep many random jobs with the bot: see `GEN=` in `tests/browser/scenarios/deliver.mjs`
(a sweep script loops seeds × cargos and greps each log for `"state":"delivered"`).
WebKit (Safari's engine): `tests/webkit/run.mjs` through `tests/webkit/bridge.py`
(see README). The test machine renders on the CPU, so the game runs in slow
motion there; judge speeds per simulated second, not per real second.

## Work items (independent; pick any)

### A. More random-job pieces (one agent per 1–2 pieces)
`src/levels/gen/pieces.ts`. A piece builds one stretch of course in its own
frame (enter at the origin heading -Z, floor at y 0, +X on the right), says
where the next one starts, and writes the bot's route (`b.go(x, z)`,
`b.wait({...})`). Use `b.f.p()/v()/yaw()` for hazard positions and directions.
Then: `genbuild` passes, and `GEN=` bot runs through jobs that use it deliver.
Ideas, roughly easiest first:
1. **See-saw** over a gap (hazard `seesaw`; see job 4 for parameters and the bot's route).
2. **Sideways conveyor** (hazard `conveyor`; job 4).
3. **Lift** up or down a storey (hazard `elevator`; job 2 for the bot's `ride`).
4. **Swing doors** (hazard `swingDoor`, pairs; job 6).
5. **Fans / gusts** blowing across a bridge with rails (hazard `fan`, `gust`).
6. **Moving platform** across a gap (hazard `mover`; ride it like job 2's truck).
7. **Spinner** (hazard `spinner`): a rotating arm to time.
8. **Pigeons / dog** square (hazards `pigeons`, `dog`).
9. **Narrow bridge** without rails (a real fall risk; checkpoint right before).
10. **Revolving door** (hazard `revolvingDoor`; job 2).
Weight new pieces so each cargo still gets a fair course (`weight(g, heading)`):
check `KITS` in `kits.ts` (stairs, slopes, door widths per cargo).

### B. Random-job polish
1. A **job-number entry** on the job list ("Play job #…": type six digits).
2. **Themes:** a night theme (dark sky, lamps on), rain/wet floors, a market.
3. **Landmarks** at the drop-off per theme (a truck to load, a shop door, a stage).
4. **Generated job names**: more variety; a short "client" line per cargo.
5. Run a big bot sweep (all cargo × 20 seeds) and fix pieces that fail often.

### C. Jobs 9 and 10 (hand-made levels, new cargo)
Cargo kinds `painting` and `balloons` are declared (`CargoKind`, `CARGO_INFO`)
but have no classes yet. Groundwork exists: `Cargo.windScale()` (sails), fans
with gusts, `sharp` colliders (pop balloons), `ceilingY` (floating away).
1. **Gone With the Wind:** a big framed painting (catches the wind), windy
   cliffs and rooftops, gusting fans/sea breeze, a lighthouse.
2. **Up, Up and Away:** a balloon bouquet (buoyant: hold it down), a funfair
   with a ferris wheel and circus tent (models exist), sharp things that pop it.
Add a bot route in `deliver.mjs` and check `pickup`.

### D. Mobile / touch (optional: only if it stays simple)
On-screen joystick + jump/grab buttons, shown only on touch devices, feeding
the same intents as the keyboard. Most useful as an **online guest** on a phone
or tablet (light mode). Don't change keyboard play.

### E. Online polish
1. Show connection quality (route, round-trip time) in the guest's Esc menu.
2. Emotes (wave, thumbs-up) both players can trigger, shown over their mover.
3. Let the guest (P2) also pick jobs / open the pause menu actions.
4. Rejoin automatically after a short drop (keep the same code).

### F. Performance on weak laptops
1. Measure frame time on "Fast" with a CPU-throttled browser; find the worst
   levels and random-job themes.
2. Instance repeated decorations (trees, rails, posts); fewer shadow casters.

### G. Testing and robustness
1. Make `online` run the guest at a low frame rate (throttle) and check play.
2. A long soak: host plays three jobs in a row with a guest connected.
3. WebKit runs of the new menus (`levelnav`, `menus`, `genflow`).
