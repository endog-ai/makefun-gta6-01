# makefun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/endog-ai/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/endog-ai/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

VELMORA — Streets of Velmora: an original open-world crime game for the make.fun **gta6-01** bounty ("Make GTA 6"). Nothing here comes from Rockstar's GTA or any other commercial game: the city of Velmora, its districts, characters, cars and story are all invented.

Velmora is built to be played, not just looked at: driving, traffic, the wanted level, combat and missions all run off one live simulation, so a car you steal on the Neon Mile is still the car the police are chasing three streets later, and the city never quietly resets behind your back. Days turn to neon nights while you play, and every district keeps its own rhythm — the Marina at golden hour feels nothing like Dockside after dark.

## The game

You are **Jax Carter**, fresh out of county jail with $150 and one contact: Rico,
who runs a garage on the Neon Mile. Explore the sun-soaked coastal city of Velmora
on foot and by car, steal cars, take jobs from Rico and Mara, and dodge the
Velmora PD.

- **Open city** — six districts (Neon Mile downtown, Old Town, Marina Bay, Dockside,
  Palm Heights, Uptown), Palmera Park, South Beach and the harbour, with a full
  day/night cycle and neon that comes alive after dark.
- **Driving** — arcade car physics with acceleration, steering, handbrake drifts and
  skid marks. Steal any parked or traffic car (E) and drive it.
- **Traffic & pedestrians** — cars cruise the grid and stop for each other;
  pedestrians stroll the sidewalks and flee from gunfire.
- **Wanted level** — 1–5 stars. Stealing, hitting pedestrians and shooting bring
  the heat; Velmora PD cruisers chase and ram you, and try to bust you on foot.
  Break line of sight to cool off.
- **Combat** — fists (F) and a pistol (mouse aim, click to shoot), with ammo
  pickups, muzzle flashes and Viper gang members who shoot back.
- **Story missions** — four jobs with phone-call dialogue: *First Wheels*,
  *The Pickup*, *Dockside Deal* and the timed *Neon Getaway*. Rewards in cash,
  health and ammo.
- **HUD & minimap** — health, money, wanted stars, speed, mission objective with
  distance, and a live minimap showing the city, cops and the mission marker.
- **Save** — pause (P) and press S to save; continue from the title screen.
- **Sound** — everything is synthesised with WebAudio: engine hum, sirens,
  gunshots, crashes and a bass loop. M mutes.

## Run it

```sh
node serve.ts        # serves game/ on http://localhost:8080
```

Open `http://localhost:8080` in desktop Chrome. No build step, no network
requests — every file the game loads lives under `game/`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=v6hdjfv5&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Run |
| E | Enter / exit car, pick up |
| Mouse + click | Aim and shoot |
| F / Space | Punch |
| 1 / 2 | Fists / pistol |
| P / Esc | Pause |
| S (in pause) | Save |
| M | Mute |

## Screenshots

The cover and the three scenes in `screenshots/` are real renders of the
game's own code, staged by `game/src/shots.js` and captured by the driver
below (one fixed seed per capture, so each frame is reproducible from its seed):

- `1-start.jpg` — title screen over downtown Velmora at dusk
- `2-drive.jpg` — golden-hour drive down the Neon Mile in a Falco GT
- `3-chase.jpg` — night police chase, three wanted stars, downtown
- `4-mission.jpg` — the Dockside Deal shootout at Warehouse 7

## Play-test + screenshots

```sh
node tools/shoot-velmora.mjs            # 22 checks, then re-captures screenshots/
node tools/shoot-velmora.mjs --port 8909 # same, on another port
```

The driver serves `game/` on localhost, plays the real game in headless
Chromium (walk, steal a car, drive, shoot, pause, save, wanted decay),
checks for console errors and network requests, and re-takes all four
screenshots. It needs `playwright-core` resolvable — run it from a directory
that has it in `node_modules`, or copy it next to one that does.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored `vendor/makefun-game.ts` library.

## Layout

- `game/index.html` — the page; `game/src/` — one file per system
  (`city`, `player`, `vehicles`, `pedestrians`, `police`, `combat`,
  `missions`, `render`, `hud`, `audio`, `effects`, `save`, `shots`, `main`)
- `screenshots/` — 4 screenshots of the game itself (cover first)
- `main.ts` — hands the game in; `serve.ts` — local static server
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
