# Run Escape

A Vampire Survivors-style browser game set in the real Old School RuneScape world. Everything on
screen comes from the OSRS game cache. It's built on
[rs-map-viewer](https://github.com/dennisdev/rs-map-viewer), so `src/rs/` and `src/mapviewer/` are
the viewer's cache and rendering code, and `src/game/` is the game.

The repository and the localStorage keys still say RuneSurvivors or `rune-survivors-*`. The game is
called Run Escape. **Never rename those keys**: players' saves live under them.

## Keep these files up to date

**After every change, check whether this file, `.claude/rules/`, `README.md` and `docs/` still say
what's true, and update them in the same pull request.** That covers new systems, moved files,
changed commands and anything an agent would otherwise get wrong. Leave out counts and numbers that
go stale. Add anything that cost you time to work out.

## Where things are

| Looking for                                           | Go to                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| How the code is laid out, scripts, URL flags, hosting | `docs/DEVELOPMENT.md`                                                                      |
| The Windows app, its game updates, releases           | `docs/DEVELOPMENT.md`, Desktop                                                             |
| The app's main process and update code                | `desktop/`                                                                                 |
| The release workflow                                  | `.github/workflows/release.yml`                                                            |
| What's in the game, map by map                        | `docs/GAMEPLAY.md`                                                                         |
| Getting it running, controls, cache version           | `README.md`                                                                                |
| What changed in each version                          | `CHANGELOG.md`                                                                             |
| How to add a weapon, enemy, map and so on             | `.claude/rules/adding-content.md`                                                          |
| Weapons, enemies, items, maps, shop (plain data)      | `src/game/content/`                                                                        |
| The game itself: tick, combat, spawning, levels       | `src/game/core/Sim.ts`                                                                     |
| Level up choices, and when a weapon can evolve        | `src/game/core/Upgrades.ts`                                                                |
| Evolution recipes, for the UI                         | `src/game/content/evolutions.ts`                                                           |
| Caskets and the inventory                             | `src/game/core/Loot.ts`                                                                    |
| Random events: who turns up, what they do             | `src/game/content/randomEvents.ts`                                                         |
| Save data and migrations                              | `src/game/core/save.ts`                                                                    |
| Run flow, camera, input, the HUD's data               | `src/game/client/GameClient.ts`                                                            |
| 3D actors, swooshes, hitsplats                        | `src/game/client/GameView.ts`                                                              |
| Touch screens: the stick, its buttons, phone layouts  | `docs/DEVELOPMENT.md`, Touch screens                                                       |
| The game on a phone's home screen (PWA)               | `docs/DEVELOPMENT.md`, Touch screens                                                       |
| React screens and the HUD                             | `src/game/ui/GameUi.tsx`                                                                   |
| Weapon stat lines on cards, pause and tooltips        | `src/game/content/weaponStats.ts`                                                          |
| How the player stands and runs with each weapon       | `src/game/content/stances.ts`                                                              |
| Stat names and types                                  | `src/game/content/stats.ts`, `types.ts`                                                    |
| Balance bot                                           | `scripts/game/simulate-run.ts`                                                             |
| Co-op: how it works, hosting its relay                | `docs/DEVELOPMENT.md` (Co-op)                                                              |
| Co-op relay server                                    | `server/coop-relay.mjs`                                                                    |
| Planned relay restarts, local operator commands       | `server/admin-cli.mjs`, `server/relay-admin.mjs`; `docs/DEVELOPMENT.md` (Planned restarts) |
| Co-op lockstep and rooms; the lobby UI                | `src/game/client/coop/`, `ui/CoopScreen`                                                   |
| Finding ids in the cache                              | `scripts/cache/`                                                                           |
| ScapeRune: making maps that aren't in OSRS            | `src/game/scaperune/CLAUDE.md`                                                             |
| What a frame costs, and what's culled                 | `docs/DEVELOPMENT.md`, `scripts/dev/`                                                      |

`src/game/core/` has no DOM or rendering. The UI reads from `GameClient` and `GameStore`, and never
changes the sim directly.

## Commands

```sh
npm install
npm run download-caches    # the game's cache, into caches/
npm start                  # dev server on http://localhost:5173, with co-op's relay
npm run start:singleplayer # the same without it (or MULTIPLAYER=off): no Multiplayer button
npm test                   # vitest
npx tsc --noEmit -p .      # type check
npx prettier --write <files>
npm run build && npm run slim-cache    # build for hosting (only when deploying)
npm run serve              # serve the build, co-op's relay too (serve:singleplayer without)
npm run server:drain -- --wait # on the server, wait for existing co-op runs before a restart
npm run server:status       # local drain state; server:cancel reopens new games
npm run desktop            # the Windows app, on that build
npm run desktop:dist       # the app's zip, game zip and manifest, into release/
```

There's no pre-commit hook, so run Prettier yourself. `npm run lint` formats the whole repository.

## After every change

1. Run the tests and the type check, and format what you changed.
2. **Run a simulation if the change can affect gameplay or balance** (see below).
3. **If you added anything from the cache** (an item, enemy, map, animation or sprite), say so in the
   pull request. Don't run `npm run slim-cache` as part of a change: it's slow and heavy on memory, and
   it's done when deploying. A deployed game with an old slim cache stops on a "missing from the
   cache" error.
4. Try UI and visual changes in the browser. Tests don't cover how things look.
5. Note the change in `CHANGELOG.md` under Unreleased.
6. Update the docs (see [Keep these files up to date](#keep-these-files-up-to-date)).

## Simulations

Run `scripts/game/simulate-run.ts` after any change to weapons, passives, gear, enemies, waves,
bosses, maps, XP, the shop, the Armoury, or combat in `Sim.ts`. Put the before and after numbers in
the pull request. If a sim wasn't run, say so there.

```sh
npx tsx scripts/game/simulate-run.ts wizard 3                # one adventurer, 3 seeds
MAP=barrows npx tsx scripts/game/simulate-run.ts "" 3        # everyone on one map, 3 seeds
MAP=morytania META=max ARMOURY=max npx tsx scripts/game/simulate-run.ts "" 3    # everything bought
ENDLESS=1 npx tsx scripts/game/simulate-run.ts wizard 3      # endless mode
WEAPON=crystal_bow npx tsx scripts/game/simulate-run.ts ranger 3    # one weapon
PARTY=4 MAP=barrows META=max ARMOURY=max npx tsx scripts/game/simulate-run.ts "" 3    # co-op
```

- **Use at least 3 seeds.** A single seed can move a whole group's results by a lot with no real
  change behind it, and any code change sends the RNG down a new path.
- **Compare like with like**: the same adventurers, maps, seeds and `META`/`ARMOURY` settings, on
  the old and new code. `META=max` buys every shop upgrade, so a new one changes those results.
- **Run every map that's affected**, not only Lumbridge. A change can help one map and hurt another.
- For a change to one combat style, compare all three styles, so you can see the gap between them.
- For a change to co-op's balance (`content/coop.ts`, or anything a party does differently), run
  `PARTY=2` and `PARTY=4` too. The bot plays each player on their own, with no teamwork.
- The bot is simple. It doesn't play strike-based adventurers well, so don't judge those from a sim.
  Treat its numbers as a comparison, not as how a player would do.
- Runs are CPU heavy, and full sweeps can take a while. Run them in the background, and don't edit
  `src/` in the same checkout meanwhile, since each run reads the source when it starts.
- **Run sweeps as one process per map.** The script already loops over adventurers and seeds, so
  use `MAP=x ... "" 3` rather than a process per run.
- Sims don't need the game cache after the first run on a map: `scripts/game/collision-snapshot.ts`
  saves that map's collision to `caches/collision/` (gitignored). A snapshot rebuilds by itself when
  the arena, `RegionDataLoader.ts` or `SceneBuilder.ts` changes. If you change collision anywhere
  else, delete that folder. ScapeRune's dev maps don't get one: they're built each time, from their
  recipes.

After a content change, also run the checks that apply:

```sh
npx tsx scripts/cache/check-items.ts          # casket items are the items they're named after
npx tsx scripts/cache/check-fun-outfits.ts    # fun map outfits are what they're named
npx tsx scripts/cache/validate-decoders.ts    # after touching a decoder or changing the cache
```

## Tests on the release build

The release workflow is the only place `npm test` runs on its own, and a failure there stops the
desktop build.

- **It runs everything, on a busy machine.** It has the game's cache, so `generator.test.ts` runs
  its long map check. A test that takes a few seconds on your machine can pass the 5 second limit
  there, so give a long one its own timeout.
- **"Exit code 1" with no failed test named** means an error with no stack in our code, which
  vitest's annotations leave out. `Timeout calling "onTaskUpdate"` is one: a worker went a minute
  without a turn of the event loop. `src/setupTests.ts` yields between tests so that a long file
  doesn't, which leaves only a single test blocking for that long.
- **`server/coop-relay.test.ts` needs Node 22's `WebSocket`**, as the workflow has. On Node 21, run
  with `NODE_OPTIONS=--experimental-websocket`.

## Testing in the browser

- Anything new on screen needs to work on a phone too: see Touch screens in `docs/DEVELOPMENT.md`.

- In dev, `window.game` is the `GameClient` and `window.game.sim` is the running `Sim`. From the
  console you can call `selectMap(id)`, `startRun()`, `sim.addWeapon(id)` or `sim.spawnBoss(...)`.
- `?autostart=wizard` starts a run right away, `?stress=300` adds goblins, and F3 shows collision.
- `await frameProbe.sample(60)` gives a frame's triangles, draws and CPU time. Compare those rather
  than the frame rate: headless runs on a software rasterizer.
- Enemies are baked per map when a run starts, so an enemy from another map, spawned from the
  console, takes a moment to show up.
- Headless Chromium needs `--use-angle=swiftshader --enable-unsafe-swiftshader`, and a persistent
  profile, or the cache won't fit in its storage quota. The cache can take a while to load.
- A small window isn't a phone: `Mobile.css` needs `(pointer: coarse)` too. Over DevTools,
  `Emulation.setTouchEmulationEnabled` only lasts as long as the session that set it, so keep that
  session open while you test.
- The desktop app's browser pane can stop drawing while it's hidden, and the game then sits at
  "Loading - 0%". Check that `requestAnimationFrame` fires before blaming the game.
- Effects like swooshes only last a moment, so a screenshot can easily miss them. Check game state
  as well, and don't report an effect as seen unless you saw it.
- Don't serve the game from a git worktree with a symlinked `node_modules`. Vite refuses the files,
  and the failed load can leave a bad cache in the browser profile for that port.

## Conventions

- **Show it with real assets, not coloured overlays.** Bosses, hazards, projectiles and effects use the
  game's own models, spot animations and objects, so a player can see what's happening from what's in the
  world. Look in the cache first. Reach for a colour overlay, a flat shape or a sprite only when nothing
  real can do the job, and then keep it small and say so in the pull request.
- **Pull requests**: work on a branch and open a pull request. Don't commit to `main`. Keep one
  topic in each pull request, unless asked to combine them.
- **Stage files by name**, not with `git add -A`. `.gitignore` has `caches/`, which only matches a
  folder, so a `caches` symlink gets committed.
- **Changelog**: written for players, in one-line bullets under Added, Changed or Fixed. Keep it
  short, and never mention secret content (like hidden bosses) in it or in map descriptions.
- **Comments**: short, and they say why or what something's for. Match what's around them.
- **Content** is plain data with real cache ids. Look ids up with the scripts, not from memory. OSRS
  names should be spelled as the cache spells them.
- **Saves**: if `SaveData` changes shape, raise `SAVE_VERSION` and add a step to `migrateSave`.
  New shop upgrades, ids and optional fields don't need one.
- **Determinism**: the sim only uses its seeded `Rng`, never `Math.random`. Co-op runs the same sim
  on every player's browser, so in `src/game/core/` trigonometry goes through `fm` (`fm.sin`,
  `fm.cos`, `fm.atan2`, `fm.hypot`, `fm.acos`, `fm.pow`) from `core/fmath.ts`, never `Math`'s.
- **Heroes**: `sim.player`, `sim.stats`, `sim.weapons` and the like are the current hero's (one for
  each co-op player). Anything a hero leaves behind (a projectile, a thrall) keeps a `hero` index.
  A solo run must play exactly as before; co-op's tests are in `core/coop.test.ts`.
- **Licence**: the cache belongs to Jagex and stays out of the repository.
- **The desktop app's address**: `GAME_ORIGIN`, the user data folder's name and `GAME_PARTITION` are
  where its players' saves are, so never change them. It can't use a custom scheme: the Cache API
  refuses one (see Desktop in `docs/DEVELOPMENT.md`).
- **`minLauncher`**: raise `LAUNCHER_VERSION` in `desktop/version.ts` only if the game can't run on
  launchers already out there. It makes every player download a new zip by hand.
