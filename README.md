# Run Escape

A Vampire Survivors-style game set in the real Old School RuneScape world, in the browser.

Run around Lumbridge while hordes of chickens, goblins, zombies and ghosts close in, pick up their
bones to level up, and survive fifteen minutes until the Wise Old Man comes for you. Beat him and
the Barrows opens up, then the Wilderness, and on through the Kharidian Desert, the Fremennik
Province, Karamja, Kourend, Varlamore, Morytania, the God Wars Dungeon and Prifddinas to the
Inferno.

Everything you see comes straight from the OSRS game cache: the map, every NPC and its animations,
your character (built from body kits and worn items), item icons, spell effects and sounds. It's
built on [rs-map-viewer](https://github.com/dennisdev/rs-map-viewer), the code behind
[osrs.world](https://osrs.world).

> Run Escape is a fan project. It isn't affiliated with or endorsed by Jagex. Old School RuneScape
> and everything in its game cache belong to Jagex, and the cache isn't part of this repository:
> you download it yourself (see below).

## What's in it

- **12 campaign maps**, each opened by beating the one before, each with its own monsters, three
  mid-run bosses and a final boss: from the Wise Old Man and the Barrows brothers to the King
  Black Dragon, TzTok-Jad, Vorkath, Nex, the Corrupted Hunllef and three JalTok-Jads at once.
- **6 fun maps**, open from the start and endless: the Grand Exchange's scammers, East Varrock's
  F2P pkers past the Wilderness Ditch, Falador on 6 June 2006, Last Man Standing, Castle Wars and
  Pest Control.
- **33 adventurers**, each with a starting weapon and a bonus, unlocked by beating maps and doing
  tasks on them.
- **Weapons that upgrade the OSRS way** (bronze to dragon, Fire Strike to Fire Wave) and
  **evolve** with the right passive (a maxed dragon scimitar with Piety becomes the Abyssal whip),
  plus raid weapons from the Scythe of Vitur to Tumeken's shadow, and a Godsword whose hilt you
  pick.
- **Gear from reward caskets**, worn on your character, with **set bonuses** (Void, Torva, Virtus,
  Inquisitor's, Crystal) and an **Armoury** to upgrade it for good between runs.
- **Co-op** for up to four players: rooms by invite code or open to all, everyone with their own
  adventurer, shared levels, and the run going on while anyone's standing.
- **Endless mode** for every map you've beaten, **skills** to train with the coins you bank, and
  **quests** that pay out over many runs.

[docs/GAMEPLAY.md](docs/GAMEPLAY.md) goes through all of it, map by map. [CHANGELOG.md](CHANGELOG.md)
has what changed in each version.

## Cache version

The game is built on one Old School RuneScape cache, and only runs on that one: every NPC, item,
animation and spot animation id in `src/game/content/` was checked against it.

| Cache                 | Game build        | Date              | OpenRS2 Archive                                                 |
| --------------------- | ----------------- | ----------------- | --------------------------------------------------------------- |
| `osrs-241_2026-09-30` | OSRS revision 241 | 30 September 2026 | [cache 2727](https://archive.openrs2.org/caches/runescape/2727) |

It's set by `GAME_CACHE_NAME` in [`src/game/cache.ts`](src/game/cache.ts), and a test checks this
table names the same cache. Moving to a newer cache means checking the content against it first
(`scripts/cache/validate-decoders.ts`, `check-items.ts` and `check-fun-outfits.ts` help), then
changing both.

## Getting started

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
npm install
npm run download-caches
npm start
```

and open http://localhost:5173.

Hosting co-op on Unix? See [planned relay restarts](docs/DEVELOPMENT.md#planned-restarts) for local-only
drain, status and cancel commands. Regular runs finish first; endless and fun modes then get a
five-minute grace period before a maintenance exit.

`npm run download-caches` fetches the game's cache (see [Cache version](#cache-version)) from the
[OpenRS2 Archive](https://archive.openrs2.org/) into `caches/`; you can also copy a `caches/` folder
over from another checkout. The first load copies the 227 MB cache into
the browser's cache storage, so later loads are quick.

### Controls

**WASD** or the arrow keys to move; weapons fire on their own. **1-4** use your utility items (and
pick on a level up, where **R** rerolls and **X** skips for coins), **Esc** pauses, **Q** shows or hides the quest tracker, **M** mutes and the
mouse wheel zooms.

On a phone or tablet, hold it sideways and drag anywhere to move. The buttons on screen pause and
use your items, and everything else is a tap. To open it full screen from its own icon, pick Add to
Home Screen or Install app in your browser's menu.

### Tests and tools

```sh
npm test                   # the game's tests (vitest)
npx tsc --noEmit -p .      # type check
npm run lint               # format everything with Prettier
```

`scripts/game/simulate-run.ts` has a bot play full runs for balancing, and `scripts/cache/` has
tools for finding NPCs, items, animations and scenery in the cache.
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) lists them all, with how the code is laid out and how
to host a build.

## Hosting

```sh
npm run build
npm run slim-cache
```

writes the game to `dist/` with a slim copy of the cache in `dist/caches/` (only what the game
reads, about 26 MB instead of 227 MB). The page has to be served with
`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`, over
HTTPS. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#hosting) has the details, with nginx and Apache
examples. `npm run serve` serves the build with those headers from one Node process with no
packages, co-op's relay included (`npm run serve:singleplayer` leaves it out). The game only offers
Multiplayer where a relay answers, so a plain static host serves it as a single-player game; see
[Co-op relay](docs/DEVELOPMENT.md#co-op-relay).
Lightweight Prometheus player and room metrics are on by default, accessible locally at
`http://127.0.0.1:8788/coop/metrics`
(`MULTIPLAYER_METRICS=false` disables them; [metrics setup](docs/DEVELOPMENT.md#optional-multiplayer-metrics)).

## Desktop

There's a Windows version too: unzip `Run-Escape-<version>-win-x64.zip` from a
[release](https://github.com/Dynrothe/Run-Escape/releases) anywhere and run `Run Escape.exe`. It
plays offline, and updates the game by itself when it can. Saves are kept apart from a browser's,
and Export and Import in Settings carry one across.
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#desktop) covers building and releasing it.

## Contributing

Issues and pull requests are welcome.

- Format with Prettier (`npm run lint`), and keep `npm test` and the type check passing.
- Content is plain data in `src/game/content/`, with real cache ids; the tools in `scripts/cache/`
  find them. After changing content, `npm run slim-cache` checks that everything it needs is in the
  cache.
- Note what you change under a version in [CHANGELOG.md](CHANGELOG.md). It's written for players,
  and the game shows it on its title screen.

## Credits

- Jagex, for Old School RuneScape
- [dennisdev/rs-map-viewer](https://github.com/dennisdev/rs-map-viewer) (BSD-2-Clause, see
  [LICENSE](LICENSE))
- [RuneLite](https://github.com/runelite/runelite)
- [OpenRS2 Archive](https://archive.openrs2.org/) and [RuneScape Archive](https://rs-archive.github.io/) - caches
- [OSRS Wiki](https://oldschool.runescape.wiki/) - item spawns and sound ids
- [2004scape](https://github.com/2004scape/Server) and [2009scape](https://gitlab.com/2009scape/2009scape) - NPC spawns
- [RuneStar](https://github.com/RuneStar/fonts) - fonts
- [Blurite](https://github.com/blurite/pathfinder) - pathfinding
- [RuneApps Model Viewer](https://github.com/skillbert/rsmv) - procedural textures

## License

[BSD-2-Clause](LICENSE).
