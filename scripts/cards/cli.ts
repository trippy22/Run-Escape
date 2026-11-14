import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { Rarity } from "../../src/game/content/rarity";
import { CardSpec, positiveInteger, validateCard } from "./catalog";
import { createCardGenerator } from "./index";

const help = `bun run cards ITEM_ID [ITEM_ID ...] [options]
bun run cards --deck deck.json [options]

--foil / --matte        Enable or disable the art window's sheen
--preview               Also export a looping gold-foil WebP (implies --foil)
--new / --no-new        Show or hide the New marker
--number 21/267         Collector number for a single card
--key weapon:shortbow   Choose a game entry when an item ID has multiple uses
--title TEXT            Override the card title
--type TEXT             Override the type line
--rarity NAME           common, uncommon, rare, or veryRare
--description TEXT      Override the rules text
--set-name TEXT         Override the Run Escape footer
--out DIR               Write PNGs here (default: build/cards)
--back FILE             Use a different completed 1073 × 1466 PNG back

Deck JSON is an array of cache IDs or CardSpec objects. Deck order sets the
collector numbers, unless an entry provides its own number and total.`;

const string = { type: "string" } as const,
    flag = { type: "boolean" } as const;
const fields = new Set([
    "itemId",
    "key",
    "title",
    "type",
    "rarity",
    "description",
    "setName",
    "number",
    "total",
    "foil",
    "isNew",
]);

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            help: flag,
            deck: string,
            foil: flag,
            preview: flag,
            matte: flag,
            new: flag,
            "no-new": flag,
            number: string,
            key: string,
            title: string,
            type: string,
            rarity: string,
            description: string,
            "set-name": string,
            out: string,
            back: string,
        },
    });
    if (values.help) {
        console.log(help);
        return;
    }
    if (((values.foil || values.preview) && values.matte) || (values.new && values["no-new"]))
        throw new Error("Conflicting finish or New options");
    if (values.deck !== undefined && positionals.length)
        throw new Error("Choose a deck or positional item IDs");
    const isDeck = values.deck !== undefined;
    const input: unknown =
        values.deck !== undefined
            ? JSON.parse(await readFile(values.deck, "utf8"))
            : positionals.map((id) => {
                  if (!/^\d+$/.test(id)) throw new Error(`Invalid cache item ID: ${id}`);
                  return Number(id);
              });
    if (!Array.isArray(input) || input.length === 0)
        throw new Error("Supply at least one item ID or a non-empty deck. See --help.");
    const overrides: Partial<CardSpec> = {};
    if (values.foil || values.preview || values.matte) overrides.foil = !values.matte;
    if (values.new || values["no-new"]) overrides.isNew = !!values.new;
    for (const field of ["key", "title", "type", "description"] as const)
        if (values[field] !== undefined) overrides[field] = values[field];
    if (values["set-name"] !== undefined) overrides.setName = values["set-name"];
    if (values.rarity !== undefined) overrides.rarity = values.rarity as Rarity;
    if (values.number !== undefined) {
        if (input.length !== 1 || !/^\d+\/\d+$/.test(values.number))
            throw new Error("--number needs a single card and a value such as 21/267");
        [overrides.number, overrides.total] = values.number.split("/").map(Number);
    }
    const numbers = new Set<number>();
    const cards = input.map((entry: unknown, i: number) => {
        if (
            typeof entry !== "number" &&
            (!entry || typeof entry !== "object" || Array.isArray(entry))
        )
            throw new Error(`Invalid deck entry ${i + 1}`);
        if (typeof entry === "object") {
            for (const k of Object.keys(entry))
                if (!fields.has(k)) throw new Error(`Unknown field ${k} in entry ${i + 1}`);
        }
        const spec: CardSpec = {
            ...(typeof entry === "number" ? { itemId: entry } : (entry as CardSpec)),
            ...overrides,
        };
        if (isDeck && spec.number === undefined && spec.total === undefined) {
            spec.number = i + 1;
            spec.total = input.length;
        }
        validateCard(spec);
        if (isDeck) {
            positiveInteger(spec.number, "number");
            if (numbers.has(spec.number)) throw new Error(`Duplicate deck number ${spec.number}`);
            numbers.add(spec.number);
        }
        return spec;
    });
    if (isDeck && new Set(cards.map((card) => card.total)).size > 1)
        throw new Error("All cards in one deck must use the same set total");
    const out = path.resolve(values.out ?? "build/cards");
    await mkdir(out, { recursive: true });
    const staging = await mkdtemp(path.join(out, ".cardgen-"));
    try {
        const generator = await createCardGenerator({ backPath: values.back });
        const files = new Set<string>();
        for (const card of cards) {
            const prefix = isDeck
                ? String(card.number).padStart(String(card.total).length, "0") + "-"
                : "";
            const entry = card.key ? "-" + card.key.replace(/[^\w-]/g, "-") : "";
            const name = `${prefix}${card.itemId}${entry}${card.foil ? "-foil" : ""}${card.isNew ? "-new" : ""}.png`;
            if (files.has(name)) throw new Error(`Two cards would write ${name}`);
            const { front, back } = await generator.render(card);
            if (!files.size) {
                await writeFile(path.join(staging, "back.png"), back);
                files.add("back.png");
            }
            await writeFile(path.join(staging, name), front);
            files.add(name);
            if (values.preview) {
                const preview = name.replace(/\.png$/, ".webp");
                await writeFile(
                    path.join(staging, preview),
                    await generator.renderFoilPreview(card),
                );
                files.add(preview);
            }
        }
        for (const file of files) await rename(path.join(staging, file), path.join(out, file));
        const previews = values.preview ? `, ${cards.length} foil preview(s)` : "";
        console.log(`Wrote ${cards.length} card front(s)${previews} and back.png to ${out}`);
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
