import fs from "fs";
import path from "node:path";

import { CacheList, LoadedCache, XteaMap } from "../../src/mapviewer/Caches";
import { CacheFiles } from "../../src/rs/cache/CacheFiles";
import { CacheInfo, getLatestCache } from "../../src/rs/cache/CacheInfo";
import { detectCacheType } from "../../src/rs/cache/CacheType";

export function loadCacheInfos(root = "./caches"): CacheInfo[] {
    const json = fs.readFileSync(path.join(root, "caches.json"), "utf8");
    return JSON.parse(json);
}

export function loadCacheList(caches: CacheInfo[]): CacheList {
    const latest = getLatestCache(caches);
    if (!latest) {
        throw new Error("No latest cache");
    }
    return {
        caches,
        latest,
    };
}

export function loadCacheFiles(cache: CacheInfo, root = "./caches"): CacheFiles {
    const cachePath = path.join(root, cache.name);

    const files = new Map<string, ArrayBuffer>();

    fs.readdirSync(cachePath).forEach((fileName: string) => {
        const buffer = fs.readFileSync(path.join(cachePath, fileName));

        files.set(
            fileName,
            buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        );
    });

    return new CacheFiles(files);
}

export function loadCache(info: CacheInfo, root = "./caches"): LoadedCache {
    const files = loadCacheFiles(info, root);
    const xteas = loadXteas(info, root);
    return {
        info,
        type: detectCacheType(info),
        files,
        xteas,
    };
}

export function loadXteas(cache: CacheInfo, root = "./caches"): XteaMap {
    const json = fs.readFileSync(path.join(root, cache.name, "keys.json"), "utf8");
    const data: Record<string, number[]> = JSON.parse(json);
    return new Map(Object.keys(data).map((key) => [parseInt(key), data[key]]));
}
