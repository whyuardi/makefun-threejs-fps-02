# EMBERLINE — build notes

## What was built

A complete round-based tactical FPS, single-player against bots, as static
files under `game/` with no build step and no network requests. The
simulation (`game/src/sim.js`) is pure logic on a fixed 60 Hz step and is
kept apart from rendering (`game/src/render.js`); the two talk through a
small event list (tracers, sparks, explosions, sounds, kills). All tuned
numbers — weapons, grenades, economy, round rules, bot skill — live in
`game/src/config.js`.

- **Gunplay:** 5 weapons with distinct damage, fire rate, magazine, spread,
  recoil and falloff; hitscan against body boxes plus a head sphere
  (2× damage, 2.5× on the Longbow); spread grows with movement, bloom and
  being airborne and shrinks with crouching and aiming; semi-auto weapons
  fire once per click, automatics while held.
- **Rounds and objective:** freeze (12 s) → live (100 s) → round end (4 s),
  first to 5 rounds, max 9. EMBER plants (3 s hold-E in a site, 30 s fuse)
  or eliminates ASH; ASH defuses (5 s), eliminates EMBER, or runs the clock
  out. The charge drops on death and a teammate can recover it.
- **Economy:** $800 start, $300 per kill, $300 per plant, $3,250 win /
  $1,900 loss plus loss-streak bonus; buy menu (4 primaries, armor, 3
  grenades) during the freeze, weapons refilled each round.
- **Bots:** 7 bots (3 EMBER + 4 ASH) routing on a 23-node nav graph,
  holding angles, engaging with FOV/line-of-sight/smoke checks, reacting to
  heard gunshots, strafing and burst-firing, converging to defuse after a
  plant, frozen while flashed.
- **Map:** an original 64 × 44 m dusk industrial yard — three lanes, two
  sites, container stacks, crates, low cover walls — with axis-aligned box
  colliders shared by gameplay and visuals, a generated ground texture,
  gradient sky, low sun with shadows, and site markers.
- **Feedback:** DOM HUD (health, armor, ammo, money, timer, score, alive
  counts, killfeed, hitmarker, plant bar, announcements), pooled tracers /
  sparks / smoke / muzzle flash, a rifle viewmodel with bob and recoil, and
  synthesised WebAudio effects (no audio assets).

## What was tested, and the results

- **`node tools/sim-test.mjs` — 25/25 checks pass.** Headless, no DOM:
  match starts in freeze, 4v4, player carries the bomb; buying a rifle,
  armor and HE deducts the right money and an unaffordable buy is refused;
  freeze ends to live; the player moves and the bots leave spawn; aimed
  fire damages a pinned bot and produces tracer events; reload refills the
  magazine; a thrown HE explodes and leaves the world; planting pays the
  reward; a planted charge detonates and scores the round; the next round
  starts; eliminating ASH ends the round for EMBER.
- **Browser playtest (`tools/playtest.mjs`, headless Chromium, SwiftShader)
  — passes with no console errors.** Menu → deploy → freeze; the buy menu
  auto-opens at freeze, B closes and re-opens it, buying armor + HE works;
  freeze runs into live; W moves the player; mouse look changes yaw with
  pointer lock held; firing spends a round; key 4 throws the HE; bots fight
  (the player took damage, one EMBER bot died). The reload check in that
  script looked wrong at first (mag stayed 11 after a quick R tap) — I
  re-tested it with R held down and the reload completes in the browser
  (mag 5 → 12, reserve 48 → 41). See the known limitation below.
- **Determinism:** re-running `MAKEFUN_OUTPUT_DIR=/tmp/fps02-verify node
  main.ts` writes a `dossier.json` byte-identical to `out/dossier.json`.
- **Gate numbers (checked 2026-11-15):** `game/` is 20 entries (16 files +
  4 directories) and 2,242,957 bytes (limits 993 / 48 MiB); `index.html`
  11,075 bytes (limit 1 MiB); `dossier.json` 349,431 bytes (limit 1.5 MiB)
  with 109,340 bytes of source text (limit 163,840 — the whole source fits,
  nothing cut); 4 screenshots, all 1280×720 JPEG, 37,009–51,003 bytes each
  (limit 256 KiB). three.js verified byte for byte against npm 0.187.0:
  the module file equals npm's `build/three.module.js` with only the two
  `./three.core.js` specifiers rewritten to `./three.core.min.js`, and the
  core file is identical.
- **Screenshots viewed:** all four match the code and the game. `1-buy.jpg`
  shows the buy menu with the exact prices from the config ($800, weapons
  marked NO CASH, armor/grenades buyable). `2-combat.jpg` shows the AR-77
  at 23/90, two ASH bots ahead, the Site B marker, round 1 at 1:17 and
  $1,300 (4,000 − 2,700). `3-plant.jpg` shows the plant bar about half
  full (1.6 s of the 3 s plant) with ASH bots closing in. `4-roundend.jpg`
  shows SQUAD ELIMINATED, EMBER 1–0, 4 alive vs 0, and $4,050
  (800 + 3,250 win reward). The screenshots are real renders staged
  deterministically with `?shot=start|play|plant|end&seed=1` (see
  `shots.json` and `main.js` `stageShot`).

## Known limitations

- **Headless playtest timings are wall-clock distorted.** Under SwiftShader
  the sim advances at roughly 0.3× wall speed (the fixed-step loop caps at
  5 steps a frame), so anything measured in wall seconds in the browser
  test — movement distance, grenade fuse, reload duration — reads slow.
  The deterministic sim test is the ground truth for mechanics; on a real
  GPU the game runs at full speed.
- **Semi-auto weapons fire once per click.** Holding the mouse with the P9,
  Longbow or Breacher fires a single shot; this is intended, not a bug.
- **Bots never use grenades** and never buy — only the player shops. Bot
  weapons are assigned at round start.
- **One map, one mode.** No multiplayer, no settings screen, no
  pause menu; the match is always EMBER attacking with the player carrying
  the charge. Reloading while the charge is planted or while dead does
  nothing, and the buy menu is only available during the freeze.
- **Sounds are synthesised**, so gunshots and footsteps are simple by
  design; there are no voice lines or music.
