import { ITEMS } from "../../src/game/content/items";
import { PASSIVES } from "../../src/game/content/passives";
import { RARITIES, Rarity } from "../../src/game/content/rarity";
import { STAT_INFO } from "../../src/game/content/stats";
import { TROPHIES } from "../../src/game/content/trophies";
import { StatKey } from "../../src/game/content/types";
import { WEAPONS } from "../../src/game/content/weapons";

export type CardSpec = {
    itemId: number;
    /** Select a definition when multiple game entries share a cache model. */
    key?: string;
    title?: string;
    type?: string;
    rarity?: Rarity;
    description?: string;
    setName?: string;
    number?: number;
    total?: number;
    foil?: boolean;
    isNew?: boolean;
};
export type CardFace = {
    title: string;
    type: string;
    rarity?: Rarity;
    description: string;
    setName: string;
    footer: string;
    foil: boolean;
    isNew: boolean;
};
type Entry = Pick<CardFace, "title" | "type" | "rarity" | "description"> & {
    key: string;
    itemId: number;
};

const entries: Entry[] = [];
for (const weapon of WEAPONS) {
    entries.push({
        key: "weapon:" + weapon.id,
        itemId: weapon.iconObjId,
        type: "Weapon",
        title: weapon.name,
        rarity: weapon.rarity,
        description:
            weapon.id === "shortbow"
                ? weapon.description.split(/(?<=\.)\s+/)[0]
                : weapon.description,
    });
}
for (const passive of PASSIVES) {
    entries.push({
        key: "passive:" + passive.id,
        itemId: passive.iconObjId,
        type: "Passive",
        title: passive.name,
        rarity: passive.rarity,
        description: passive.description,
    });
}
for (const item of ITEMS) {
    let description: string;
    if (item.kind === "gear") {
        description = Object.entries(item.stats)
            .map(([key, value]) => {
                const stat = STAT_INFO[key as StatKey];
                const percent = stat.unit === "percent";
                const number = Number((value * (percent ? 100 : 1)).toFixed(2));
                return `${number > 0 ? "+" : ""}${number}${percent ? "%" : ""} ${stat.label}`;
            })
            .join(", ");
    } else {
        description = item.description;
    }
    entries.push({
        key: item.kind + ":" + item.id,
        itemId: item.objId,
        type: item.kind === "gear" ? "Gear" : "Utility",
        title: item.name,
        rarity: item.rarity,
        description,
    });
}
for (const trophy of TROPHIES) {
    entries.push({
        key: "trophy:" + trophy.id,
        itemId: trophy.objId,
        type: "Trophy",
        title: trophy.name,
        rarity: trophy.id === "sanguinesti_staff_uncharged" ? "rare" : undefined,
        description: trophy.how,
    });
}

// Collector numbers printed on the three supplied examples. Cache IDs are independent.
const exampleNumbers = new Map([
    ["weapon:saradomin_strike", 16],
    ["weapon:shortbow", 21],
    ["trophy:sanguinesti_staff_uncharged", 231],
]);

export function positiveInteger(value: unknown, field: string): asserts value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${field} must be a positive integer`);
    }
}

export function validateCard(spec: CardSpec): void {
    if (!Number.isSafeInteger(spec.itemId) || spec.itemId < 0)
        throw new Error("itemId must be a non-negative integer");
    for (const field of ["foil", "isNew"] as const) {
        if (spec[field] !== undefined && typeof spec[field] !== "boolean")
            throw new Error(`${field} must be a boolean`);
    }
    for (const field of ["title", "type", "description", "setName", "key"] as const) {
        if (spec[field] !== undefined && typeof spec[field] !== "string")
            throw new Error(`${field} must be text`);
    }
    if (spec.rarity !== undefined && !Object.hasOwn(RARITIES, spec.rarity))
        throw new Error("Unknown rarity: " + spec.rarity);
    if (spec.number !== undefined || spec.total !== undefined) {
        positiveInteger(spec.number, "number");
        positiveInteger(spec.total, "total");
        if (spec.number > spec.total) throw new Error("Card number exceeds set total");
    }
}

export function resolveFace(spec: CardSpec, item: { name: string; examine?: string }): CardFace {
    validateCard(spec);
    const matches = entries.filter(
        (e) => e.itemId === spec.itemId && (spec.key === undefined || spec.key === e.key),
    );
    if (matches.length > 1)
        throw new Error(
            `Item ${spec.itemId} has multiple card entries. Select a key: ${matches.map((e) => e.key).join(", ")}`,
        );
    const entry = matches[0];
    if (spec.key !== undefined && !entry)
        throw new Error(`No entry ${spec.key} for item ${spec.itemId}`);
    const known = entry && exampleNumbers.get(entry.key);
    const number = spec.number ?? known;
    return {
        title: spec.title ?? entry?.title ?? item.name,
        type: spec.type ?? entry?.type ?? "Item",
        rarity: spec.rarity ?? entry?.rarity,
        description: spec.description ?? entry?.description ?? item.examine ?? "",
        setName: spec.setName ?? "Run Escape",
        footer: number === undefined ? `Item ${spec.itemId}` : `${number}/${spec.total ?? 267}`,
        foil: spec.foil ?? false,
        isNew: spec.isNew ?? false,
    };
}
