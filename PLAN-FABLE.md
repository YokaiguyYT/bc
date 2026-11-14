# Plan for a Fable 5.2 session

Fable 5.2 is strongest on long, hard work that needs careful reasoning across lots of code. These are the jobs in Fragile Freight that fit that best, in order. Each one stands alone: start at the top and stop whenever you like.

Effort: **high** for everything unless noted. Use **xhigh** only for job 1. Avoid **max**: it costs a lot more and rarely helps.

## 1. Online without the lag feeling (xhigh)

Even on a good connection, the friend's own mover reacts a round trip late: their key goes to the host, the host moves them, and the result comes back. Fix it with **guest-side prediction**:
- The friend's laptop or phone moves its own mover straight away from its own keys.
- When the host's snapshot arrives, the guest smoothly corrects toward it.
- The load, the other mover and hazards stay host-driven as now.
- Also tune the guest's snapshot delay (`src/net/sync.ts`) per route.
- Done when: the `online` and `party-online` tests pass, plus a new test with a simulated 150 ms ping shows the friend's mover moving the same frame they press a key.

Files: `src/net/sync.ts`, `src/net/Online.ts`, `src/game/LevelSession.ts`, `src/entities/Player.ts`.

## 2. Make phones and Chromebooks run smoother

Profile the busiest jobs and party games (King of the Truck, Lava, chaos jobs) at phone resolution. Then cut draw calls and physics cost by:
- instancing repeated meshes
- merging static scenery
- sleeping idle props
- lowering shadow cost on "Fast"

Done when: the `perf` test shows a measured frame-time drop, and nothing looks worse on "Pretty".

## 3. The test robot's weak spots

The full check still has three known failures:
- The glass job's full route (`glass-full`) fails.
- The clock job's full route (`mansion-full`) stalls.
- Random job 808808 (piano) doesn't finish.

There are also 2 pickup misses in 92. Find out whether each one is the robot or the game. Fix the game where it's the game, so real players never hit the same snag.

## 4. Party games: balance and a second batch

- Playtest each computer opponent at each difficulty against a scripted "decent player". Make Easy beatable by a kid and Hard properly hard.
- Then add 3 new 1v1 games: dodgeball with crates, a carry race over an obstacle course, and king of the hill on a tilting platform.
- Done when: `party-cpu` passes at all three levels and the new games have tests like the others.

## 5. Tidy the code (medium)

`src/ui/App.ts` is about 3,100 lines. Split it into one file per screen (party, builder, online, results, locker) with no behaviour change. The whole test suite must pass unchanged. This makes every later change cheaper.

## 6. Sound (only when you say so)

Audio is still "planned, not yet implemented" by your request. When you want it, say so and a session can build all of it inside `src/audio/AudioEngine.ts`: synthesized music, sound effects for every game event that already fires, and the volume sliders working.

---

How to use it: start a session on Fable 5.2 and paste "Do job 1 in PLAN-FABLE.md". Keep the rules from before: keep secrets out of commits, use free services only, test before shipping, and send the game file at the end.
