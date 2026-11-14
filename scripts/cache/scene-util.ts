import { GAME_CACHE_NAME } from "../../src/game/cache";
import { LoadedCache } from "../../src/mapviewer/Caches";
import { CacheSystem } from "../../src/rs/cache/CacheSystem";
import { getCacheLoaderFactory } from "../../src/rs/cache/loader/CacheLoaderFactory";
import { LocModelLoader } from "../../src/rs/config/loctype/LocModelLoader";
import { VarManager } from "../../src/rs/config/vartype/VarManager";
import { SceneBuilder } from "../../src/rs/scene/SceneBuilder";
import { loadCache, loadCacheInfos } from "./load-util";

// The game's pinned cache, loaded from ./caches (run scripts from the repo root)
export function loadGameCache(root = "./caches"): LoadedCache {
    const cacheInfo = loadCacheInfos(root).find((c) => c.name === GAME_CACHE_NAME);
    if (!cacheInfo) {
        throw new Error(`Cache ${GAME_CACHE_NAME} not found in ${root}/caches.json`);
    }
    return loadCache(cacheInfo, root);
}

// A scene builder like the render workers use, for building collision and
// heights in Node.
export function createSceneBuilder(loadedCache: LoadedCache): SceneBuilder {
    const cacheSystem = CacheSystem.fromFiles(loadedCache.type, loadedCache.files);
    const factory = getCacheLoaderFactory(loadedCache.info, cacheSystem);
    const locTypeLoader = factory.getLocTypeLoader();
    const locModelLoader = new LocModelLoader(
        locTypeLoader,
        factory.getModelLoader(),
        factory.getTextureLoader(),
        factory.getSeqTypeLoader(),
        factory.getSeqFrameLoader(),
        factory.getSkeletalSeqLoader(),
    );
    return new SceneBuilder(
        loadedCache.info,
        factory.getMapFileLoader(),
        factory.getUnderlayTypeLoader(),
        factory.getOverlayTypeLoader(),
        locTypeLoader,
        locModelLoader,
        loadedCache.xteas,
    );
}

// The vars the render workers draw multilocs with
export function createVarManager(loadedCache: LoadedCache): VarManager {
    const cacheSystem = CacheSystem.fromFiles(loadedCache.type, loadedCache.files);
    const factory = getCacheLoaderFactory(loadedCache.info, cacheSystem);
    const varManager = new VarManager(factory.getVarBitTypeLoader());
    const questTypeLoader = factory.getQuestTypeLoader();
    if (questTypeLoader) {
        varManager.setQuestsCompleted(questTypeLoader);
    }
    return varManager;
}
