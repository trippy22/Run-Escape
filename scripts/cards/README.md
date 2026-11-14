# Run Escape card generator

Generate 1073 × 1466 transparent PNGs from the game's pinned OSRS cache, fonts, matte front frame and shared vampire back. Run `bun install --frozen-lockfile` and `bun run download-caches` from the repository root if the dependencies or full cache are missing.

## Command line

```sh
bun run cards 841 2415 22481
bun run cards 22481 --foil --new --out build/foil-cards
bun run cards 2415 --preview
bun run cards 4151 --title "Abyssal whip" --number 42/267
bun run cards 22324 --key trophy:ghrazi_rapier
bun run cards --help
```

The default output directory is `build/cards/`. Each invocation writes one front per card and a shared `back.png`. A front's filename includes the cache ID and any foil or New flags, for example `22481-foil-new.png`. Generating the same variant in that directory replaces it. Use `--out` for separate sets and `--back FILE` to supply another finished PNG back of the same dimensions.

The generator reads the inventory model, pose and lighting from the cache. Weapon, passive, gear, utility and trophy definitions supply the game text. Some models serve multiple game entries. In that case the command prints the matching keys so you can select one. Other drawable cache items use their cache name and examine text when available. Use `--title`, `--type`, `--rarity`, `--description` and `--set-name` to set the printed copy. Long text wraps and shrinks inside its field. If it still cannot fit legibly the generator reports the field text.

The three reference cards retain their collector numbers: Saradomin Strike (2415) is 16/267, Shortbow (841) is 21/267 and the uncharged Sanguinesti staff (22481) is 231/267. A single card without an assigned collector number prints its cache ID as “Item 4151”, for example. Supply `--number N/TOTAL` to print a collector number instead.

## Generate a set

Save an ordered JSON array as `deck.json` and run `bun run cards --deck deck.json --out build/my-deck`.

```json
[841, { "itemId": 2415, "foil": true }, { "itemId": 22481, "isNew": true }]
```

This set prints 1/3, 2/3 and 3/3. The filenames have the collection number as a prefix so multiple variants can share an item ID. To render a subset of a larger checklist, give each entry its own `number` and common `total`. Entry objects accept the same fields as the library. CLI overrides apply to the whole invocation, including `--matte` and `--no-new`.

## Library

Import the Node/TypeScript generator from a script and reuse one instance across renders. The PNG buffers can go straight to disk, an HTTP response or another image compositor.

```ts
import { writeFile } from "node:fs/promises";

import { createCardGenerator } from "./scripts/cards";

const cards = await createCardGenerator();
const { front, back, face } = await cards.render(
    { itemId: 22481, foil: true, isNew: false },
    { foilPosition: 0.35 },
);
await writeFile("staff.png", front);
await writeFile("back.png", back);
console.log(face.footer); // 231/267
```

`CardSpec` accepts `itemId`, `key`, `title`, `type`, `rarity`, `description`, `setName`, `number`, `total`, `foil` and `isNew`. The rarity keys are `common`, `uncommon`, `rare` and `veryRare`. Both effects default to off. Foil is an iridescent highlight confined to the matte window beneath the item. Each PNG captures one reflection angle. Set `foilPosition` from 0 to 1 to move the highlight across successive renders. The New marker is a separate layer.

Use `--preview` or `await cards.renderFoilPreview({ itemId: 2415 })` for a looping WebP. Its warm gold reflection travels across the item window, with small glints at the brightest angle. The CLI also saves the full-size foil PNG.

`createCardGenerator({ cacheDir, backPath })` accepts an alternative cache root containing `caches.json` and an alternative full-size back PNG. By default the generator resolves the project's own cache and assets relative to the library.
