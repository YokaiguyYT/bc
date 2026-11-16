# Roadmap

Independent work items, each small enough for one agent, each with how to
check it. Work on branch `claude/brave-meitner-74ar9h`; commit small, run the
checks, push.

## Ground rules (from the owner)

- **Sound** was built in build 14, on the owner's go-ahead for the plan that
  listed it. Keep it synthesized (no sound files: the single file must stay
  one file) and keep the volume sliders working.
- **No gamepad.** Keyboard only (touch only if the mobile item below is picked).
- **Nothing that costs money.** Free public services only, no accounts.
- **Never commit the Sketchfab token** (`.env` is gitignored).
- Must keep working from a **double-clicked single file** (`npm run build:single`
  → `play/FragileFreight.html` and `docs/index.html`) in Safari and Chrome, and
  on a **school Chromebook** (Chrome, weak GPU, school Wi-Fi).
- **Online play (MacBook + Chromebook, on school-style networks) must keep working.**
  Bump `NET_VERSION` (`src/net/peer.ts`) whenever random jobs come out
  differently (the online guest rebuilds them from their number) or the
  snapshot format changes.

## How to check things

```sh
npx vite --port 5199 --strictPort &      # dev server for the tests
npx tsc --noEmit -p .                    # types
FF_URL=http://localhost:5199/ node tests/browser/run.mjs <scenario> [outdir]
```

Key scenarios: `online` (also `ONLY=relay`, `ONLY=direct`), `online-errors`,
`online-gen`, `netcheck` (needs local servers, see the file), `genbuild`
(SEEDS=n), `genflow`, `deliver` (ROUTE=<route> or GEN=<number> CARGO=<kind>
PIECES=<n> CHAOS=<1..5>), `pickup`, `carryall`, `coop`, `p2layout`, `levelnav`,
`menus`, `locker`, `chaos`.
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
- Build 10: a **Play screen** (Jobs, Daily, Quick job, Chaos, Endless shift)
  instead of one long list; **cash tips** and denser random courses; a
  Wordle-style **Daily** (number, twist, streak, shareable squares); **Chaos
  jobs** (a slider from Mild to ULTRA, 15 kinds of chaos, online too); the
  **Locker** (over 40 things to wear, from the wallet or from 14 quests, online too).
  New scenarios: `locker`, `chaos`; `online` and `online-gen` cover outfits,
  pay and chaos online.
- Build 11: **28 chaos events** (with a siren before each, combos, chaos-only
  obstacles and a **Chaos Daily**; the Chaos screen no longer lists them);
  random jobs got nine more pieces, variants of old ones, eight more settings,
  twists and hilly routes; hand-made jobs come at different times of day and
  weather, with **bonus goals**; **jobs 11–15** (a chandelier, a beehive, a
  giant jelly, a snowman in the sun, a space rocket); the **company rank** up
  to CEO, trails, dances, emote packs and cargo skins in the Locker; a
  **ghost** of your best run; the dev panel hidden behind `?dev`. New
  scenarios: `newjobs`, `variety`, `flair`, `chaoslooks`, `tour`.

- Build 12: **Solo** with a robot buddy (Z / C turn the load), **speedrun
  leaderboards** (this laptop + a world board on free public MQTT brokers,
  nickname only), **Versus** (rival crews at three speeds, races with a
  friend by code, quick match with a stranger, falling back to the rival
  crew), and movers in **work overalls**. New scenarios: `solo`, `board`,
  `versus`.

- Build 13: **party games** (seven 1v1 games on one keyboard, vs the computer
  at three levels, or online; a party mix), **Stack 'Em High** (job 16),
  **Build a job** (pick the pieces, share a code), invite links, and a TURN
  fallback with retries for online play between different networks. New
  scenarios: `party`, `party-cpu`, `party-online`, `tower`, `builder`,
  `invite`, `online-route`.
- Build 14: **sound** (synthesized effects and music), **feel** (money flying
  off a knocked load, slow-motion moments, clean-stretch bonuses, awards, a
  results card that counts up), **online prediction** (the friend's own mover
  answers their keys at once), **Keep it smooth** and less to draw, the test
  robot's weak spots (mud no longer stops the piano; the clock and glass
  jobs' full routes deliver), **three more party games** (Dodgeball, Balloon Stomp,
  Keep-Away) with the computer graded by level, and an **instant replay**
  that can be saved as a video (or sent, on a phone).
  New scenarios: `audio`, `juice`, `online-predict`, `smooth`, `party-duel`,
  `replay`, `replay-online`.

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
2. Jobs 11–15 are done (build 11). Next: let their loads into random jobs
   (each needs a start kit, a drop-off stand and rules in `kits.ts`), and
   playtest their tuning (see NOTES).

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

### H. Chaos and Locker ideas
1. More chaos: a giant rolling snowball, a stampede of shopping trolleys,
   birds that steal your hat (and you chase them).
2. **Mini-games** (the owner said "maybe later"): short party games between
   jobs.
3. Versus: rival crews for the aquarium, clock and glass jobs (needs a
   continuous bot route for each), a race on random jobs and the Daily, and
   a shared ghost of the world record on each board.
3. More Locker items (shoes, held props like a mop or a coffee), outfits that
   change the mover's walk, and a quest for each hand-made job.

### G. Testing and robustness
1. Make `online` run the guest at a low frame rate (throttle) and check play.
2. A long soak: host plays three jobs in a row with a guest connected.
3. WebKit runs of the new menus (`levelnav`, `menus`, `genflow`, `netcheck`, `touch`).
4. `pickup`: two misses in 92, both on job 2 with grab held while walking
   up: the start (in the truck bed P1's hands catch the truck wall, out of
   reach of the aquarium) and checkpoint 2 (one hand catches the scenery).
   Each try now gets a freshly built job. A hand on the scenery
   that swaps to the cargo once it's within reach was tried in build 14 and
   taken out again: it changed where the movers took hold of the TV at job 1's
   start (lower, more strained), and the bot's carry then caught the hallway
   counter.

### I. Left over from the Fable session's plan
1. **Split `src/ui/App.ts`** (about 3,400 lines) into a file per screen. Not
   done on purpose: it's one class whose screens share a lot of state, so a
   split is a big diff with real risk and nothing new for players. If it's
   done, move one screen at a time with the whole suite between each.
2. **More party games:** a carry race over an obstacle course; king of the
   hill on a tilting platform.
3. **Online:** predict jumps too; try it between two real networks (and
   phones on mobile data).
4. **Performance:** instance repeated decorations (rails, posts, trees);
   measure on a real Chromebook and iPhone.
5. **Voice chat** between the two over the direct link (WebRTC audio, louder
   when the movers are close), as in the co-op games everyone's playing.
