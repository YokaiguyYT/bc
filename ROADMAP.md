# Roadmap

Independent work items, each small enough for one agent, each with how to
check it. Work on branch `claude/brave-meitner-74ar9h`; commit small, run the
checks, push.

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
  Bump `NET_VERSION` (`src/net/peer.ts`) whenever random jobs come out
  differently: the online guest rebuilds them from their number.

## How to check things

```sh
npx vite --port 5199 --strictPort &      # dev server for the tests
npx tsc --noEmit -p .                    # types
FF_URL=http://localhost:5199/ node tests/browser/run.mjs <scenario> [outdir]
```

Key scenarios: `online` (also `ONLY=relay`, `ONLY=direct`), `online-errors`,
`online-gen`, `netcheck` (needs local servers, see the file), `genbuild`
(SEEDS=n), `genflow`, `deliver` (ROUTE=<route> or GEN=<number> CARGO=<kind>
PIECES=<n>), `pickup`, `carryall`, `coop`, `p2layout`, `levelnav`, `menus`.
The test machine renders on the CPU, so the game runs in slow motion there;
judge speeds per simulated second. **Editing source reloads pages on the dev
server**: run long batches (bot sweeps) against `npm run build` + `npx vite
preview --port 4199` instead. A sweep loops `GEN=<n> CARGO=<kind> … deliver`
over many numbers and greps each log for `"state":"delivered"`.

## Done recently

- Random jobs: 18 kinds of course piece (ramps, stairs, doors, slaloms,
  wrecking balls, traffic, laser gates, ice, pedestrians, conveyor belts,
  lifts, swing doors, a railless bridge, a cable car, corners…), checkpoints,
  stands at the drop-off, job numbers, daily job, endless shift, and sunset
  and night versions. Bot sweeps deliver nearly every job; see NOTES.
- Online: relay + direct, MQTT backup matchmaking, round-trip time in the
  badges and the guest menu, and **Check this network** on the Play Online
  screen.
- Jobs 9 and 10: **Gone With the Wind** (a painting that catches the wind) and
  **Up, Up and Away** (a balloon bouquet that floats off and pops); bot routes
  deliver both.
- Touch controls for phones and tablets (mainly as the online guest), and
  emotes (number keys) on both screens.

## Work items (independent; pick any)

### A. More random-job pieces (one agent per 1–2 pieces)
`src/levels/gen/pieces.ts`. A piece builds one stretch of course in its own
frame (enter at the origin heading -Z, floor at y 0, +X on the right), says
where the next one starts, and writes the bot's route (`b.go(x, z)`,
`b.wait({...})`). Use `b.f.p()/v()/yaw()` for hazard positions and directions.
Then: `genbuild` passes, and `GEN=` bot runs through jobs that use it deliver
(find some with a quick in-page scan of `__FF.gen.generateJob`).
Ideas: **see-saw** (hazard `seesaw`, job 4; needs a deck wide enough for the
formation), **fans / gusts** across a railed bridge (`fan`), **moving
platform** (`mover`), **spinner** to time (`spinner`), **revolving door**
(`revolvingDoor`, job 2), **dog** square (`dog`), **skiers/riders** crossing
(snow theme; like traffic). Weight each per cargo (`KITS` in `kits.ts`: stairs,
slopes, door widths), and keep the piano off anything it rolls off.

### B. Random-job polish
1. **Themes:** rain/wet floors, a market, a building site.
2. **Landmarks** at the drop-off per theme (a truck to load, a shop door, a stage).
3. **A client line** per job ("Mrs Patel needs her aquarium by noon").
4. Run a big bot sweep (all cargo × 20 seeds) and fix pieces that fail often.

### C. More for the new cargo, and more hand-made jobs
1. The painting and the balloons are in random jobs (build 9). Next: pieces
   made for them: wind (fans/gusts across a railed stretch) for the painting,
   sharp things and low ceilings for the balloons; and let the painting take
   corners (the bot, or players, can turn it round and it then leans off the
   easel: a two-sided easel would fix that).
2. More hand-made jobs: ideas — a chandelier through a ballroom, a beehive,
   a wobbling jelly, a snowman in the sun.

### D. Mobile / touch
Done (`input/Touch.ts`, `touch` scenario). Still to do: try it on a real
iPhone and Android phone; maybe a lower default quality on phones.

### E. Online polish
1. Let the guest (P2) also pick jobs / open the pause menu actions.
2. Rejoin automatically (no button) after a short drop.

### F. Performance on weak laptops
1. Measure frame time on "Fast" with a CPU-throttled browser; find the worst
   levels and random-job themes.
2. Instance repeated decorations (trees, rails, posts); fewer shadow casters.

### G. Testing and robustness
1. Make `online` run the guest at a low frame rate (throttle) and check play.
2. A long soak: host plays three jobs in a row with a guest connected.
3. WebKit runs of the new menus (`levelnav`, `menus`, `genflow`, `netcheck`, `touch`).
4. `pickup`: two long-standing misses when grab is held while walking up: job 2's
   start (in the truck bed, P1's hands catch the truck wall before the
   aquarium) and job 1's start (the crate only lifts 3 cm in the test's
   1.2 s). Consider letting a hand that's about to touch the cargo skip the
   scenery on the way.
