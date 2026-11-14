import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp, { OverlayOptions } from "sharp";

import { RARITIES, Rarity } from "../../src/game/content/rarity";
import { renderItemModel } from "../../src/mapviewer/worker/ItemIconLoader";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { ObjModelLoader } from "../../src/rs/config/objtype/ObjModelLoader";
import { loadGameCache } from "../cache/scene-util";
import { CardFace, CardSpec, resolveFace, validateCard } from "./catalog";

export type { CardSpec } from "./catalog";

const media = fileURLToPath(new URL("../../src/media/", import.meta.url));
const cacheRoot = fileURLToPath(new URL("../../caches/", import.meta.url));
const width = 1073;
const height = 1466;
const canvas = { width, height, channels: 4 as const };
const well = { left: 126, top: 323, width: 824, height: 544 };
const inks: Record<Rarity, string> = {
    common: "#8CC878",
    uncommon: "#EAC874",
    rare: "#EB9B63",
    veryRare: "#ED8580",
};
// Inside the brass bevel, in the front template's native coordinates.
const windowPath = "M146 323 H928 L950 344 V848 L931 867 H145 L126 848 V343 Z";

type TextBox = {
    x: number;
    y: number;
    w: number;
    h: number;
    size: number;
    color: string;
    bold?: boolean;
    align?: "left" | "right" | "center";
};
async function typeset(text: string, box: TextBox): Promise<OverlayOptions[]> {
    if (!text.trim()) return [];
    const face = box.bold ? "Bold" : "Plain";
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Wrap before reducing the point size. Pango measures with the same font it paints.
    for (let size = box.size; size >= 24; size -= 2) {
        const { data, info } = await sharp({
            text: {
                text: `<span foreground="${box.color}">${escaped}</span>`,
                font: `RuneScape ${face} 12 ${size}`,
                fontfile: path.join(media, `RuneScape-${face}-12.ttf`),
                width: box.w,
                wrap: "word-char",
                align: box.align ?? "center",
                rgba: true,
                dpi: 72,
            },
        })
            .png()
            .toBuffer({ resolveWithObject: true });
        if (info.height > box.h || info.width > box.w) continue;
        const free = box.w - info.width;
        const offset =
            box.align === "left" ? 0 : box.align === "right" ? free : Math.round(free / 2);
        return [
            {
                input: data,
                left: box.x + offset,
                top: box.y + Math.round((box.h - info.height) / 2),
            },
        ];
    }
    throw new Error(`Text does not fit the card at a readable size: ${text.slice(0, 80)}`);
}

async function lettering(face: CardFace): Promise<OverlayOptions[]> {
    const title = face.title.match(/^(.*) (\([^()]+\))$/u);
    const titleBox = { x: 138, y: 111, w: 797, h: 193, size: 101, color: "#F3C67E", bold: true };
    const labels: Promise<OverlayOptions[]>[] = [];
    if (title) {
        labels.push(
            typeset(title[1], { ...titleBox, y: 112, h: 108, size: 96 }),
            typeset(title[2], { ...titleBox, y: 205, h: 72, size: 64 }),
        );
    } else {
        labels.push(typeset(face.title, titleBox));
    }
    labels.push(
        typeset(face.type, {
            x: 157,
            y: 899,
            w: 349,
            h: 90,
            size: 66,
            color: "#E5D6B8",
            align: "left",
        }),
    );
    if (face.rarity) {
        labels.push(
            typeset(RARITIES[face.rarity].name, {
                x: 545,
                y: 899,
                w: 371,
                h: 90,
                size: 66,
                color: inks[face.rarity],
                align: "right",
            }),
        );
    }
    labels.push(
        typeset(face.description, { x: 160, y: 1018, w: 753, h: 228, size: 67, color: "#F0E8D6" }),
        typeset(face.setName, {
            x: 158,
            y: 1308,
            w: 438,
            h: 45,
            size: 42,
            color: "#CABA98",
            align: "left",
        }),
        typeset(face.footer, {
            x: 607,
            y: 1308,
            w: 309,
            h: 45,
            size: 42,
            color: "#CABA98",
            align: "right",
        }),
    );
    const layers = (await Promise.all(labels)).flat();
    layers.push({
        input: Buffer.from(
            '<svg width="760" height="2"><rect width="760" height="2" fill="#8a6e44" opacity=".8"/></svg>',
        ),
        left: 156,
        top: 997,
    });
    return layers;
}

function sheen(position: number): OverlayOptions {
    if (!Number.isFinite(position) || position < 0 || position > 1)
        throw new Error("foilPosition must be between 0 and 1");
    // The band runs diagonally. Each fleck lights up as the band passes over it.
    const x = -235 + position * 1530;
    const flecks = [
        [194, 462, 5],
        [291, 696, 3],
        [371, 414, 4],
        [423, 785, 5],
        [532, 565, 3],
        [623, 446, 5],
        [712, 739, 4],
        [848, 527, 5],
        [879, 798, 3],
    ];
    const glints = flecks
        .map(([cx, cy, r]) => {
            const distance = Math.abs(cx - x + (600 - cy) * 0.42);
            const light = Math.max(0, 1 - distance / 145);
            return `<path transform="translate(${cx} ${cy}) scale(${r * light})" d="M0 -1.5 L.23 -.23 1.08 0 .23 .23 0 1.5 -.23 .23 -1.08 0 -.23 -.23Z" fill="#fff3c4" opacity="${light}"/>`;
        })
        .join("");
    const input =
        Buffer.from(`<svg width="824" height="544" viewBox="126 323 824 544" xmlns="http://www.w3.org/2000/svg">
      <defs><clipPath id="well"><path d="${windowPath}"/></clipPath>
      <linearGradient id="gold" gradientUnits="userSpaceOnUse" x1="${x - 232}" y1="698" x2="${x + 232}" y2="502">
        <stop stop-color="#865692" stop-opacity=".09"/><stop offset=".12" stop-color="#b89180" stop-opacity=".19"/>
        <stop offset=".32" stop-color="#e1a84a" stop-opacity=".50"/><stop offset=".43" stop-color="#ffd582" stop-opacity=".70"/>
        <stop offset=".50" stop-color="#fff0b1" stop-opacity=".78"/><stop offset=".60" stop-color="#cfdbb1" stop-opacity=".46"/>
        <stop offset=".77" stop-color="#91b7ab" stop-opacity=".24"/><stop offset="1" stop-color="#81668f" stop-opacity=".09"/></linearGradient></defs>
      <g clip-path="url(#well)"><path d="${windowPath}" fill="url(#gold)"/>${glints}</g></svg>`);
    return { input, left: 0, top: 0 };
}

async function badge(): Promise<Buffer> {
    const labels = await typeset("New", {
        x: 0,
        y: 0,
        w: 120,
        h: 54,
        size: 56,
        color: "#DAEDB6",
        bold: true,
    });
    return sharp({ create: { width: 120, height: 54, channels: 4, background: "#233122e8" } })
        .composite(labels)
        .png()
        .toBuffer();
}

type ItemImage = { input: Buffer; left: number; top: number };
async function itemLayer(pixels: Int32Array, size: number): Promise<ItemImage> {
    const buffer = Buffer.alloc(pixels.length * 4);
    let left = size,
        right = -1,
        top = size,
        bottom = -1;
    for (let i = 0; i < pixels.length; i++) {
        const p = pixels[i];
        if (!p) continue;
        const x = i % size,
            y = Math.floor(i / size);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        buffer.writeUInt32BE(((p << 8) | (p >>> 24)) >>> 0, i * 4);
    }
    if (right < left) throw new Error("Inventory model rendered no visible pixels");
    const item = await sharp(buffer, { raw: { width: size, height: size, channels: 4 } })
        .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
        .resize({ width: 578, height: 478, fit: "inside" })
        .raw()
        .toBuffer({ resolveWithObject: true });
    const raw = { width: item.info.width, height: item.info.height, channels: 4 as const };
    const ink = Buffer.from(item.data);
    for (let i = 0; i < ink.length; i += 4) {
        ink[i] = 25;
        ink[i + 1] = 19;
        ink[i + 2] = 13;
        ink[i + 3] = Math.round(ink[i + 3] * 0.64);
    }
    const shadow = await sharp(ink, { raw })
        .extend({ top: 18, left: 18, bottom: 18, right: 18, background: "#00000000" })
        .blur(6)
        .png()
        .toBuffer();
    const input = await sharp(shadow)
        .composite([{ input: await sharp(item.data, { raw }).png().toBuffer(), left: 15, top: 14 }])
        .png()
        .toBuffer();
    return {
        input,
        left: Math.round((width - raw.width) / 2) - 15,
        top: Math.round(596 - raw.height / 2) - 14,
    };
}

/** Load the cache and templates once per generator. Each render returns its own PNG buffers. */
export async function createCardGenerator(options: { cacheDir?: string; backPath?: string } = {}) {
    const [frame, back, newBadge] = await Promise.all([
        readFile(path.join(media, "run-escape-card-front-frame.png")),
        readFile(options.backPath ?? path.join(media, "run-escape-card-back-vampire.png")),
        badge(),
    ]);
    if (options.backPath) {
        const meta = await sharp(back).metadata();
        if (meta.format !== "png" || meta.width !== width || meta.height !== height)
            throw new Error(`The card back must be a ${width} × ${height} PNG`);
    }
    const matte = await sharp(frame).extract(well).png().toBuffer();
    const cache = loadGameCache(options.cacheDir ?? cacheRoot);
    const factory = getCacheLoaderFactory(
        cache.info,
        CacheSystem.fromFiles(cache.type, cache.files),
    );
    const objTypeLoader = factory.getObjTypeLoader(),
        textureLoader = factory.getTextureLoader();
    const objModelLoader = new ObjModelLoader(
        objTypeLoader,
        factory.getModelLoader(),
        textureLoader,
    );
    const state = { objTypeLoader, textureLoader, objModelLoader };

    // Reusing the most recent layer makes repeated finishes of one card cheap,
    // without retaining high-resolution artwork for a whole set in memory.
    let lastItem: { id: number; layer: Promise<ItemImage> } | undefined;
    function art(itemId: number) {
        if (lastItem?.id === itemId) return lastItem.layer;
        const scale = 20,
            size = 48 * scale;
        const pixels = renderItemModel(state, itemId, 1, size, size, size / 2, size / 2, scale);
        const layer = itemLayer(pixels, size);
        lastItem = { id: itemId, layer };
        return layer;
    }
    async function prepare(spec: CardSpec) {
        validateCard(spec);
        if (spec.itemId >= objTypeLoader.getCount())
            throw new Error(`Cache item ${spec.itemId} is outside the loaded item table`);
        const obj = objTypeLoader.load(spec.itemId);
        if (obj.model === undefined)
            throw new Error(`No inventory model for cache item ${spec.itemId}`);
        const face = resolveFace(spec, obj);
        const [item, labels] = await Promise.all([art(spec.itemId), lettering(face)]);
        const base = await sharp(frame).composite(labels).ensureAlpha().raw().toBuffer();
        async function pixelsAt(position: number) {
            const layers: OverlayOptions[] = [];
            if (face.foil) layers.push(sheen(position));
            layers.push({ ...item, left: item.left - well.left, top: item.top - well.top });
            if (face.isNew)
                layers.push({ input: newBadge, left: 168 - well.left, top: 354 - well.top });
            const artPixels = await sharp(matte).composite(layers).ensureAlpha().raw().toBuffer();
            // Replace just the well. All variants retain the exact pixels of the printed plate.
            const front = Buffer.from(base);
            const stride = well.width * 4;
            for (let row = 0; row < well.height; row++) {
                const offset = ((well.top + row) * width + well.left) * 4;
                artPixels.copy(front, offset, row * stride, (row + 1) * stride);
            }
            return front;
        }
        return { face, pixelsAt };
    }
    return {
        async render(spec: CardSpec, { foilPosition = 0.5 }: { foilPosition?: number } = {}) {
            const { face, pixelsAt } = await prepare(spec);
            const front = await sharp(await pixelsAt(foilPosition), { raw: canvas })
                .png()
                .toBuffer();
            return { front, back: Buffer.from(back), face };
        },
        /** A looping foil proof. The cache model, typography and plate are prepared just once. */
        async renderFoilPreview(spec: CardSpec): Promise<Buffer> {
            const { pixelsAt } = await prepare({ ...spec, foil: true });
            const frames = 48,
                previewWidth = 360,
                previewHeight = Math.round((height * previewWidth) / width);
            const strip = Buffer.alloc(previewWidth * previewHeight * 4 * frames);
            for (let i = 0; i < frames; i++) {
                const position = (1 + Math.sin((2 * Math.PI * i) / frames)) / 2;
                const small = await sharp(await pixelsAt(position), { raw: canvas })
                    .resize(previewWidth, previewHeight)
                    .raw()
                    .toBuffer();
                small.copy(strip, i * small.length);
            }
            return sharp(strip, {
                raw: {
                    width: previewWidth,
                    height: previewHeight * frames,
                    pageHeight: previewHeight,
                    channels: 4,
                },
            })
                .webp({ quality: 84, loop: 0, delay: Array(frames).fill(75) })
                .toBuffer();
        },
    };
}
