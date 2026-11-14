# EMBERLINE — tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous: two teams, short rounds, a bomb to plant or defuse, money between
rounds, and gunfire where stopping to aim beats spraying on the move. Built
on three.js 0.187.0, as static files with no build step and no network
requests. Single-player against bots, offline in a desktop browser.

Your squad **EMBER** (orange) attacks: plant the charge at Site A or Site B,
or eliminate the **ASH** defenders (teal). First to 5 rounds takes the match
(at most 9 rounds). The map is an original dusk-lit industrial yard — three
lanes, container stacks, crates and low cover walls — with its own names,
art and sounds. Nothing here is copied from an existing commercial game.

## Running it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Then open <http://localhost:8080> in desktop Chrome (or any browser with
WebGL 2) and click **DEPLOY**. Any static file server works too — the game is
plain files under `game/` and loads nothing from the network. No build step,
no install. `node main.ts` (with `MAKEFUN_OUTPUT_DIR` set) is the entry
program that hands the game in; it is not needed to play.

## Controls

| Input | Action |
| --- | --- |
| W A S D / arrows | Move |
| Mouse | Look (click the game to capture the mouse) |
| Left click | Fire |
| Right click (hold) | Aim down sights |
| R | Reload |
| Shift | Sprint |
| Ctrl or C | Crouch |
| Space | Jump |
| E (hold, inside a site) | Plant the charge (3 s) |
| B | Buy menu (open during the freeze) |
| 1 / 2 | Primary / sidearm |
| 4 / 5 / 6 | Throw HE / smoke / flash grenade |

## Weapons and economy

You start each match with $800 and a P9 sidearm. Kills pay $300, planting
pays $300, winning a round pays $3,250, losing pays $1,900 plus up to $1,000
in loss-streak bonus. The buy menu opens automatically during the 12-second
freeze before each round; press B to reopen it. Bought weapons refill to full
magazines at the start of every round.

| Weapon | Price | Damage | Mag / reserve | Notes |
| --- | --- | --- | --- | --- |
| P9 SIDEARM | free | 26 | 12 / 48 | Semi-auto, always carried |
| AR-77 RIFLE | $2,700 | 33 | 30 / 90 | Full-auto, the all-rounder |
| VEX-9 SMG | $1,500 | 24 | 32 / 96 | Full-auto, fast, short range |
| BREACHER-12 | $1,200 | 12 × 8 pellets | 6 / 24 | Pump shotgun, close quarters |
| LONGBOW DMR | $4,750 | 88 | 5 / 15 | Semi-auto, 2.4× zoom, slow |

Headshots deal double damage (2.5× with the Longbow). Damage falls off past
each weapon's range. Firing on the move, in the air, or without aiming widens
your spread; crouching and aiming tighten it. Recoil kicks your aim up and
blooms your spread, so short bursts win fights. A Kevlar vest ($650) absorbs
half of incoming damage.

Grenades, two of each at most: **Popper HE** ($300, 7 m blast), **Veil Smoke**
($300, blocks sight for 16 s) and **Dazzle Flash** ($200, blinds anyone
looking at the pop). Throw with 4, 5 and 6.

## The round

Each round: 12 s freeze (buy), then 100 s live. EMBER wins by eliminating
ASH, or by planting the charge (hold E for 3 s inside a site) and letting its
30 s fuse run out. ASH wins by eliminating EMBER, by running the clock out
while the charge is unplanted, or by defusing a planted charge (5 s channel).
If you die while carrying the charge it drops where you fell and a teammate
can pick it up. The match ends at 5 round wins, or after 9 rounds.

## Bots

Seven bots play with you: three EMBER teammates and four ASH defenders, each
with a name, a skill level and a weapon. They route through the yard on a
hand-placed nav graph, hold angles at their site, engage what they see,
investigate gunshots they hear, strafe while fighting, and fire in bursts
after a reaction delay. After a plant, ASH bots converge on the charge to
defuse it. A flashbang freezes any bot caught looking at the pop. Bots deal
reduced damage so a round stays winnable.

## HUD

Health and armor bars, ammunition, money, round timer (which turns into a
bomb-fuse countdown after a plant), score, alive counts, killfeed, hitmarker
(red on headshots), a crosshair that widens with spread, a plant progress
bar, and announcements for round starts, plants and round results.

## Files

- `game/index.html` — the page: HUD, menus, import map
- `game/src/sim.js` — the whole game simulation (fixed 60 Hz step)
- `game/src/level.js` — the yard: colliders, sites, nav graph, visuals
- `game/src/bots.js` — bot AI: routing, holding, engaging, defusing
- `game/src/weapons.js` — spread, recoil, reload and damage math
- `game/src/config.js` — every tuned number in one place
- `game/src/render.js` — three.js scene, camera, bot meshes, viewmodel
- `game/src/fx.js` — pooled tracers, sparks, smoke, muzzle flash
- `game/src/hud.js` — DOM HUD and buy menu
- `game/src/input.js` — keyboard, mouse and pointer lock
- `game/src/audio.js` — synthesised WebAudio sound effects
- `game/src/rng.js` — deterministic RNG (mulberry32)
- `game/vendor/three/` — three.js 0.187.0, byte for byte from npm
- `main.ts` — entry program: copies the game and writes the dossier
- `serve.ts` — tiny static server for local play
- `tools/` — headless sim test and browser playtest

All sound is synthesised with WebAudio and all textures are generated on
canvas at runtime — the game ships no audio or image assets.
