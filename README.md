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
- **34 adventurers**, each with a starting weapon and a bonus, unlocked by beating maps and doing
  tasks on them.
- **Weapons that upgrade the OSRS way** (bronze to dragon, Fire Strike to Fire Wave) and
  **evolve** with the right passive (a maxed dragon scimitar with Piety becomes the Abyssal whip),
  plus raid weapons from the Scythe of Vitur to Tumeken's shadow, and a Godsword whose hilt you
  pick.
- **Gear from reward caskets**, worn on your character, with **set bonuses** (Void, Torva, Virtus,
  Inquisitor's, Crystal) and an **Armoury** to upgrade it for good between runs.
- **Co-op** for up to four players: rooms by invite code or open to all, everyone with their own
  adventurer, shared levels, and the run going on while anyone's standing.
- **Phosani's Nightmare**, a boss fight on its own once Hallowed Night's beaten: no waves, no
  picks and no items, only the Inquisitor's crossbow and her, quicker and with more at once.
- **Justiciar Zachariah**, the next boss fight, in a court hung in the Hallowed Sepulchre's dark
  that's his weapon: read its statues, its floor and its fire, with Saradomin Strike, which only
  reaches him from close by.
- **Endless mode** and **hard mode** for every map you've beaten, **skills** to train with the coins
  you bank on independent Melee, Ranged and Magic pages, and **quests** that pay out over many runs.

[docs/GAMEPLAY.md](docs/GAMEPLAY.md) goes through all of it, map by map. [CHANGELOG.md](CHANGELOG.md)
has what changed in each version.

## Cache version

The game is built on one Old School RuneScape cache, and only runs on that one: every NPC, item,
animation and spot animation id in `src/game/content/` was checked against it.

| Cache                 | Game build        | Date            | OpenRS2 Archive                                                 |
| --------------------- | ----------------- | --------------- | --------------------------------------------------------------- |
| `osrs-242_2026-11-03` | OSRS revision 242 | 3 November 2026 | [cache 2757](https://archive.openrs2.org/caches/runescape/2757) |

It's set by `GAME_CACHE_NAME` in [`src/game/cache.ts`](src/game/cache.ts), and a test checks this
table names the same cache. Moving to a newer cache means checking the content against it first,
then changing both: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#a-newer-cache) has the steps.

## Getting started

You need [Bun](https://bun.com/) (the version in `package.json`'s `packageManager`) and
[Node.js](https://nodejs.org/) 20 or newer. Bun installs the packages and runs the project's
commands, and Node runs Vite, Vitest and the co-op relay.

```sh
bun install --frozen-lockfile
bun run download-caches
bun run start
```

and open http://localhost:5173.

`bun run download-caches` fetches the game's cache (see [Cache version](#cache-version)) from the
[OpenRS2 Archive](https://archive.openrs2.org/) into `caches/`; you can also copy a `caches/` folder
over from another checkout. The download gives up when nothing has arrived for a minute; on a
connection that drops out for longer, set `CACHE_DOWNLOAD_TIMEOUT_MS` to a longer wait in
milliseconds. The first load copies the 227 MB cache into the browser's cache storage, so later
loads are quick.

### Controls

**WASD** or the arrow keys to move; weapons fire on their own. **1-4** use your utility items (and
pick on a level up, where **R** rerolls and **X** skips for coins), **Esc** pauses, **Q** shows or
hides the quest tracker, **Tab** (or clicking the DPS) shows each weapon's damage, **M** mutes and
the mouse wheel zooms. In a boss fight with its own button (Justiciar Zachariah's Smite),
**Space** uses it; on a controller it's A (cross), and on a touch screen the round button.

Hover over bag items, weapons, passives, worn equipment or Armoury pieces (including their
upgrades) to read their descriptions.

On a phone or tablet, hold it sideways and drag anywhere to move. The buttons on screen pause and
use your items: tap an item to use it, or hold it to read its description without using it.
Hold weapons, passives and Armoury pieces to inspect them too, without selecting or buying them.
On small screens, worn equipment and its descriptions are in the pause menu.
Everything else is a tap. To open it full screen from its own icon, pick Add to
Home Screen or Install app in your browser's menu.

A controller works too, in the browser and the desktop app. The left stick or d-pad moves, the
shoulder buttons and triggers use your four items, Start pauses (and enters the map you've picked), View (Share on PlayStation) shows
the damage panel and pressing the left stick the quest tracker. On a level up, a casket or any menu,
the d-pad moves a highlight and A (cross) presses it; B (circle) goes back, X (square) rerolls and
Y (triangle) skips. Its buttons show on screen while you're using it. A controller the browser
doesn't recognise the layout of only moves.

### Tests and tools

```sh
bun run test               # the game's tests (vitest)
bun run tsc --noEmit -p .  # type check
bun run lint               # format everything with Prettier
```

`scripts/game/simulate-run.ts` has a bot play full runs for balancing, and `scripts/cache/` has
tools for finding NPCs, items, animations and scenery in the cache.
Generate collectible card PNGs from the same cache with `bun run cards 841 22481 --foil`.
The [card generator guide](scripts/cards/README.md) covers deck files, numbering and the library API.
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) lists them all, with how the code is laid out and how
to host a build.

## Hosting

```sh
bun run build
bun run slim-cache
```

writes the game to `dist/` with a slim copy of the cache in `dist/caches/` (only what the game
reads, about 22 MB instead of 227 MB, in chunks so an update downloads only what changed). The
page has to be served with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`, over HTTPS, and `caches/caches.json` with
`Cache-Control: no-cache`. [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#hosting) has the details,
with nginx and Apache examples. `bun run serve` serves the build with those headers from one Node
process with no packages, co-op's relay included (`bun run serve:singleplayer` leaves it out). The
game only offers Multiplayer where a relay answers, so a plain static host serves it as a
single-player game; see [Co-op relay](docs/DEVELOPMENT.md#co-op-relay).
`bun run serve` and the relay also serve player and room counts for monitoring (Prometheus), on the
server itself only, at `http://127.0.0.1:8788/coop/metrics`; `MULTIPLAYER_METRICS=off` turns them
off. See [multiplayer metrics](docs/DEVELOPMENT.md#optional-multiplayer-metrics).

## Desktop

There's a Windows version too: unzip `Run-Escape-<version>-win-x64.zip` from a
[release](https://github.com/Dynrothe/Run-Escape/releases) anywhere and run `Run Escape.exe`. It
plays offline, and updates the game by itself when it can. Saves are kept apart from a browser's,
and Export and Import in Settings carry one across, as cloud save does where it's set up.
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#desktop) covers building and releasing it.

## Android

And an Android one, only here on GitHub: open `Run-Escape-<version>-android.apk` from a
[release](https://github.com/Dynrothe/Run-Escape/releases) on your phone, and let your browser
install apps when Android asks. The whole game's in it, so it plays offline, even the first time,
and co-op works when there's a connection. On opening, it checks GitHub for a newer release and
offers to download its APK, then asks before installing it. Android asks you to allow installs from
Run Escape, then confirm the update. If the check fails or you're offline, the current game keeps
working. You can also install a new APK over the old one yourself (uninstalling first deletes your
progress). It needs a current Android System
WebView, and says so if the phone's is too old. Its saves are apart from a browser's too, and
Export and Import carry one across, as cloud save does where it's set up.
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#android) covers building it and setting up its releases.

## Contributing

Issues and pull requests are welcome. Before you open a pull request, go through
[docs/PR-REVIEW.md](docs/PR-REVIEW.md), which lists what review looks for, and give it to your agent
if you work with one.

- Base your branch on the current `release-<version>` branch (or `main` if there isn't one), and
  point the pull request at it.
- Format what you changed with Prettier (`bun run prettier --write <files>`), and keep
  `bun run test` and the type check passing.
- Content is plain data in `src/game/content/`, with real cache ids; the tools in `scripts/cache/`
  find them. Say in the pull request if it uses anything new from the cache.
- Note what you change under Unreleased in [CHANGELOG.md](CHANGELOG.md). It's written for players,
  and the game shows it on its title screen.

## Credits

- Jagex, for Old School RuneScape
- [dennisdev/rs-map-viewer](https://github.com/dennisdev/rs-map-viewer) (BSD-2-Clause, see
  [LICENSE](LICENSE))
- [RuneLite](https://github.com/runelite/runelite)
- [OpenRS2 Archive](https://archive.openrs2.org/) and [RuneScape Archive](https://rs-archive.github.io/) - caches
- [OSRS Wiki](https://oldschool.runescape.wiki/) - item spawns, sound ids and music recordings
- [2004scape](https://github.com/2004scape/Server) and [2009scape](https://gitlab.com/2009scape/2009scape) - NPC spawns
- [RuneStar](https://github.com/RuneStar/fonts) - fonts
- [Blurite](https://github.com/blurite/pathfinder) - pathfinding
- [RuneApps Model Viewer](https://github.com/skillbert/rsmv) - procedural textures

## License

[BSD-2-Clause](LICENSE).
