import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { GAME_CACHE_NAME } from "../../src/game/cache";
import { resolveFace } from "./catalog";
import { createCardGenerator } from "./index";

// Exercise the same cache codecs that the Node CLI loads.
vi.mock("../../src/rs/compression/Gzip", () => vi.importActual("../../src/rs/compression/Gzip.ts"));
vi.mock("../../src/rs/compression/Bzip2", () =>
    vi.importActual("../../src/rs/compression/Bzip2.ts"),
);

const item = { name: "Cache item", examine: "Cache examine text." };
test("the approved examples retain their identities and collector numbers", () => {
    expect(resolveFace({ itemId: 841 }, item)).toMatchObject({
        title: "Shortbow",
        type: "Weapon",
        rarity: "common",
        footer: "21/267",
        description: "Shoots arrows at the nearest enemy.",
    });
    expect(resolveFace({ itemId: 2415 }, item)).toMatchObject({
        title: "Saradomin Strike",
        footer: "16/267",
    });
    expect(resolveFace({ itemId: 22481 }, item)).toMatchObject({
        title: "Sanguinesti staff (uncharged)",
        type: "Trophy",
        rarity: "rare",
        footer: "231/267",
    });
});
test("cache fallback, overrides and shared model IDs", () => {
    expect(resolveFace({ itemId: 2147483647 }, item)).toMatchObject({
        title: item.name,
        description: item.examine,
        footer: "Item 2147483647",
        foil: false,
        isNew: false,
    });
    expect(
        resolveFace({ itemId: 841, number: 2, total: 6, title: "Bow & arrows" }, item),
    ).toMatchObject({ footer: "2/6", title: "Bow & arrows" });
    expect(() => resolveFace({ itemId: 22324 }, item)).toThrow(/weapon:ghrazi_rapier/);
    expect(resolveFace({ itemId: 22324, key: "trophy:ghrazi_rapier" }, item).type).toBe("Trophy");
    expect(() => resolveFace({ itemId: 841, number: 3, total: 2 }, item)).toThrow(/exceeds/);
});

const cacheFile = fileURLToPath(
    new URL(`../../caches/${GAME_CACHE_NAME}/main_file_cache.dat2`, import.meta.url),
);
test.skipIf(!existsSync(cacheFile))(
    "foil affects only the well, New toggles independently, and the back is shared",
    async () => {
        const gen = await createCardGenerator();
        const [matte, foil, marked, both] = await Promise.all([
            gen.render({ itemId: 841 }),
            gen.render({ itemId: 841, foil: true }),
            gen.render({ itemId: 841, isNew: true }),
            gen.render({ itemId: 841, isNew: true, foil: true }),
        ]);
        const expected = await readFile(
            fileURLToPath(
                new URL("../../src/media/run-escape-card-back-vampire.png", import.meta.url),
            ),
        );
        expect(both.back.equals(expected)).toBe(true);
        const raw = await Promise.all(
            [matte, foil, marked, both].map((card) =>
                sharp(card.front).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
            ),
        );
        const { width, height } = raw[0].info;
        expect([width, height]).toEqual([1073, 1466]);
        const [a, b, c, d] = raw.map((image) => image.data);
        let foilPixels = 0,
            markPixels = 0,
            leaks = 0;
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4,
                    well = x >= 126 && x < 950 && y >= 323 && y < 867,
                    badge = x >= 168 && x < 288 && y >= 354 && y < 408;
                const symbol = a.readUInt32BE(i),
                    gloss = b.readUInt32BE(i),
                    newMark = c.readUInt32BE(i);
                if (gloss !== symbol) {
                    foilPixels++;
                    if (!well) leaks++;
                }
                if (newMark !== symbol) {
                    markPixels++;
                    if (!badge) leaks++;
                }
                if (!badge && d.readUInt32BE(i) !== gloss) leaks++;
            }
        expect(foilPixels).toBeGreaterThan(10000);
        expect(markPixels).toBeGreaterThan(1000);
        expect(leaks).toBe(0);
    },
    30000,
);

test.skipIf(!existsSync(cacheFile))(
    "foil previews loop and move the gold reflection",
    async () => {
        const gen = await createCardGenerator();
        const webp = await gen.renderFoilPreview({ itemId: 2415 });
        const meta = await sharp(webp, { animated: true }).metadata();
        expect(meta).toMatchObject({
            format: "webp",
            width: 360,
            pageHeight: 492,
            loop: 0,
        });
        // WebP can combine adjacent identical frames near the ends of the sweep.
        expect(meta.pages).toBeGreaterThan(24);
        expect(meta.delay?.reduce((sum, ms) => sum + ms, 0)).toBe(3600);
        const sample = { left: 144, top: 164, width: 24, height: 24 };
        const [catchLight, rest] = await Promise.all(
            [0, 10].map((page) =>
                sharp(webp, { page }).extract(sample).removeAlpha().raw().toBuffer(),
            ),
        );
        const meanRed = (pixels: Buffer) => {
            let sum = 0;
            for (let i = 0; i < pixels.length; i += 3) sum += pixels[i];
            return sum / (pixels.length / 3);
        };
        expect(meanRed(catchLight) - meanRed(rest)).toBeGreaterThan(20);
    },
    60000,
);
