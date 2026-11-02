import { Camera } from "../../mapviewer/Camera";
import { MapViewer } from "../../mapviewer/MapViewer";
import { ActorRenderer } from "../../mapviewer/webgl/actor/ActorRenderer";
import { RegionData, RegionDataInput } from "../../mapviewer/worker/RegionData";
import { RegionDataLoader } from "../../mapviewer/worker/RegionDataLoader";
import massacre from "../../media/music/massacre.ogg";
import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { isCoarsePointer } from "../../util/DeviceUtil";
import { CHARACTERS, getCharacter } from "../content/characters";
import { MAX_PARTY } from "../content/coop";
import { upgradedName } from "../content/endless";
import { getEnemy } from "../content/enemies";
import { CASKETS, getItem } from "../content/items";
import { getMapEnemies } from "../content/mapEnemies";
import {
    FUN_MAPS,
    MAPS,
    MAP_BY_ID,
    getArenaRegion,
    getMap,
    isDevMap,
    isFunMap,
} from "../content/maps";
import { formatPassiveValue, getPassive } from "../content/passives";
import { getPowerUp } from "../content/powerups";
import { QUESTS, canDoQuestOn, describeQuest } from "../content/quests";
import { RARITIES, Rarity } from "../content/rarity";
import { SHOP_UPGRADES } from "../content/shop";
import { formatStats } from "../content/stats";
import { TROPHY_BY_ID } from "../content/trophies";
import { Stats, emptyStats } from "../content/types";
import { LOCKABLE_ITEMS, describeUnlockTask, isAvailable } from "../content/unlocks";
import { formatWeaponStat, weaponStats } from "../content/weaponStats";
import { getWeapon } from "../content/weapons";
import { ChestAction } from "../core/Loot";
import { HeroOptions, Sim, TICKS_PER_SECOND } from "../core/Sim";
import { canEvolve, describeChoice, getEvolutionHint } from "../core/Upgrades";
import { SimEvent, WeaponState } from "../core/entities";
import { usePortableMath } from "../core/fmath";
import { CoopAction, applyAction, hasBadNumber } from "../core/lockstep";
import {
    SaveData,
    SaveStore,
    buyArmouryUpgrade,
    buyUpgrade,
    exportSave,
    getEarnedUnlocks,
    getFinishedQuests,
    getMetaStats,
    getQuestProgress,
    isEndlessRecord,
    isEndlessUnlocked,
    isMapUnlocked,
    recordRun,
    refundUpgrades,
} from "../core/save";
import { ArenaGrid } from "../core/world/ArenaGrid";
import { CameraRig } from "../render/CameraRig";
import { GameFrameHandler, GameWebGLRenderer } from "../render/GameWebGLRenderer";
import { installRecipe } from "../scaperune/squares";
import { DisplaySettings, loadDisplaySettings, saveDisplaySettings } from "./DisplaySettings";
import {
    GameAssets,
    HITSPLAT_SPRITES,
    getCharacterAppearance,
    getRunAppearance,
} from "./GameAssets";
import { GameAudio } from "./GameAudio";
import { GameInput } from "./GameInput";
import { ChestCue, GameSounds, getGameSoundIds } from "./GameSounds";
import { ChoiceView, GameStore, HudView, QuestTrackView, Screen, SlotView } from "./GameStore";
import { GameView } from "./GameView";
import {
    getBuffViews,
    getChestView,
    getEventView,
    getGearViews,
    getInventoryViews,
} from "./ItemViews";
import { Minimap } from "./Minimap";
import { Overlay, ScreenPoint } from "./Overlay";
import { getBossKillViews, getDamageViews } from "./RunStatsViews";
import { CoopLobby, makeLoadout } from "./coop/CoopLobby";
import { CoopRun, GUEST_BUFFER_FRAMES } from "./coop/CoopRun";
import { GameStart, GoneReason, Loadout, Unlocks, isGameStart } from "./coop/protocol";

// 20ms: the OSRS client tick, also the unit of animation frame lengths
export const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 10;
// A co-op guest that's fallen well behind the host catches up this fast
const MAX_CATCH_UP_TICKS = 120;
// A frame spends this long at most on catching up, so a slow phone stays
// responsive while it does (the ticks that are due in real time still run)
const CATCH_UP_BUDGET_MS = 8;
// What can wait for a co-op run whose copy is still being made: far more
// than a slow load brings in
const MAX_COOP_INBOX = 50_000;
const HUD_INTERVAL_MS = 100;
// The damage meter's number holds this long, so it can be read
const DPS_HOLD_TICKS = TICKS_PER_SECOND / 2;

// The title screen is in the first map (Lumbridge castle's courtyard)
const TITLE_MAP = MAPS[0];

// Recordings of the OSRS music tracks maps play (MapDef.music), from the OSRS
// Wiki
const MUSIC: Record<string, string> = {
    Massacre: massacre,
};

// Title screen camera: lower and slowly circling the character (RS angle units
// per tick), or settling in front of them when it's not to spin
const ATTRACT_PITCH = -260;
const ATTRACT_DISTANCE = 9;
const ATTRACT_SPIN = 1.2;
const ATTRACT_SETTLE = 0.96;
const RUN_PITCH = -400;
// Tiles past a dev map's arena the world's drawn: a map square of scenery, less a fade
const OPEN_WORLD_MARGIN = 56;
const RUN_DISTANCE = 18;
// How long the camera takes to follow the ground up a slope on a dev map, in ms: without this,
// it lurches at every crease in tall ground
const CAMERA_GROUND_EASE = 110;
// Closer on a phone held sideways: it shows as much to each side as a desktop
// window does, and the player stays big enough to see
const PHONE_RUN_DISTANCE = 15;
const PHONE_MAX_HEIGHT = 520;

// The level up's rewards, as the UI shows them
// What a new endless round brings, for its toast
function describeRound(sim: Sim): string {
    const times = (n: number) => `${Math.round(n * 10) / 10}x`;
    return (
        `Round ${sim.round} begins! Monsters have ${times(sim.roundHp)} the hitpoints and hit ` +
        `${times(sim.roundDamage)} as hard, and caskets' gear comes +${sim.round - 1}.`
    );
}

function getQuestTrackViews(save: SaveData, sim: Sim): QuestTrackView[] {
    // Quests don't count on the fun maps, so there's nothing to track there
    if (isFunMap(sim.map.id)) {
        return [];
    }
    const run = sim.getResult();
    const quests = QUESTS.filter(
        (quest) => canDoQuestOn(quest, sim.map) && !save.questsDone.includes(quest.id),
    );
    // The map's own first (QUESTS has the ones done all over last)
    return quests.map((quest) => {
        const { done, of } = getQuestProgress(save, quest, run);
        return {
            id: quest.id,
            name: quest.name,
            task: describeQuest(quest.objective),
            done,
            of,
            finished: done >= of,
        };
    });
}

// How far a weapon has got towards its evolution, for the HUD and pause menu
function getEvolutionView(sim: Sim, weapon: WeaponState): SlotView["evolution"] {
    const evolution = weapon.def.evolution;
    if (!evolution || !isAvailable(getWeapon(evolution.into), sim.unlockedItems)) {
        return undefined;
    }
    const owned = new Set(sim.passives.map((p) => p.id));
    return {
        passive: getPassive(evolution.requiresPassive).name,
        maxed: weapon.level >= weapon.def.levels.length,
        hasPassive: owned.has(evolution.requiresPassive),
        ready: canEvolve(weapon, owned, sim.unlockedItems),
    };
}

function getChoiceViews(sim: Sim): ChoiceView[] {
    const style = getCharacter(sim.characterId).style;
    return sim.choices.map((choice) => {
        const { title, text, iconObjId, iconSpriteId, quality, stats } = describeChoice(choice);
        const rarity = quality ? RARITIES[quality] : undefined;
        return {
            title,
            text,
            iconObjId,
            iconSpriteId,
            isNew: choice.kind === "newWeapon" || choice.kind === "newPassive",
            isEvolution: choice.kind === "evolve",
            isHilt: choice.kind === "hilt",
            isSpell: choice.kind === "hilt" && getWeapon(choice.into).family === "ancient_burst",
            rarity: rarity && { name: rarity.name, color: rarity.color },
            stats,
            evolves: getEvolutionHint(choice, sim.weapons, sim.passives, style, sim.unlockedItems),
        };
    });
}

// What a co-op player brings, as far as any game could have it (another
// player's game could send anything)
function cleanLoadout(loadout: Loadout | undefined): {
    unlockedItems: Set<string>;
    armoury: Record<string, number>;
} {
    const items = Array.isArray(loadout?.unlockedItems) ? loadout.unlockedItems : [];
    const armoury: Record<string, number> = {};
    for (const [id, times] of Object.entries(loadout?.armoury ?? {})) {
        if (Number.isInteger(times) && times > 0) {
            armoury[id] = Math.min(times, 20);
        }
    }
    return {
        unlockedItems: new Set(items.filter((id) => typeof id === "string").slice(0, 5000)),
        armoury,
    };
}

// What a co-op player's loadout gives their hero, no more than the shop can
function loadoutStats(loadout: Loadout | undefined): Stats {
    const stats = emptyStats();
    for (const [key, value] of Object.entries(loadout?.metaStats ?? {})) {
        if (key in stats && typeof value === "number" && Number.isFinite(value)) {
            const most = SHOP_MAX[key as keyof Stats] ?? 0;
            stats[key as keyof Stats] = Math.max(Math.min(0, most), Math.min(most, value));
        }
    }
    return stats;
}

// Each stat with every shop upgrade for it bought
const SHOP_MAX: Partial<Stats> = {};
for (const upgrade of SHOP_UPGRADES) {
    SHOP_MAX[upgrade.stat] = (SHOP_MAX[upgrade.stat] ?? 0) + upgrade.perRank * upgrade.maxRank;
}

// Why a co-op run ended early, on its results
const ENDED_EARLY: Partial<Record<GoneReason, string>> = {
    idle: "The room closed after half an hour with nothing happening.",
    kicked: "The host removed you from the party.",
    disbanded: "The host disbanded the party.",
    hostLeft: "The host left, so the run's over.",
};

export type GameClientOptions = {
    // Extra goblins at the start of a run, for performance testing
    stress: number;
    // Start a run with this character straight away (testing)
    autostart?: string;
};

export class GameClient implements GameFrameHandler {
    static async create(
        mapViewer: MapViewer,
        renderer: GameWebGLRenderer,
        overlayCanvas: HTMLCanvasElement,
        store: GameStore,
        saveStore: SaveStore,
        options: GameClientOptions,
    ): Promise<GameClient> {
        const workerPool = mapViewer.workerPool;
        const regionPromise = workerPool.queueLoad<RegionDataInput, RegionData, RegionDataLoader>(
            new RegionDataLoader(),
            getArenaRegion(TITLE_MAP),
        );

        const audio = new GameAudio();
        const soundsPromise = audio.load(workerPool, getGameSoundIds());

        const actors = await renderer.getActorRenderer();
        const assets = new GameAssets(workerPool, renderer, actors);
        const spritesPromise = assets.loadSprites(Object.values(HITSPLAT_SPRITES));
        store.set({ loadingText: "Summoning monsters", loadingProgress: 10 });
        await assets.loadBase((done, total) => {
            store.set({ loadingProgress: 10 + Math.round((done / total) * 70) });
        });
        store.set({ loadingText: "Dressing up", loadingProgress: 85 });
        await assets.setPlayerAppearance(getCharacterAppearance(store.getSnapshot().characterId));
        store.set({ loadingText: `Building ${TITLE_MAP.name}`, loadingProgress: 95 });
        const grid = new ArenaGrid(await regionPromise);
        await soundsPromise;
        await spritesPromise;

        return new GameClient(
            mapViewer,
            renderer,
            grid,
            assets,
            audio,
            overlayCanvas,
            store,
            saveStore,
            options,
        );
    }

    readonly input: GameInput;
    readonly overlay: Overlay;
    readonly view: GameView;
    readonly minimap: Minimap;
    readonly sounds: GameSounds;
    readonly cameraRig = new CameraRig();

    sim?: Sim;
    paused = false;
    save: SaveData;
    // Co-op: the room and its relay, and the run being played with it
    readonly coop: CoopLobby;
    private coopRun?: CoopRun;
    // The hero the camera follows: this player's, or in co-op while they're
    // down, a teammate's
    private viewHero = 0;
    // What the run's waiting on, last shown (co-op choices come in frames)
    private decisionKey = "";

    private accumulator = 0;
    private lastHudUpdate = 0;
    // Where the camera thinks the ground is, on a dev map
    private cameraGround: number | undefined;
    private shownDps = 0;
    private shownDpsTick = 0;
    // Each hero's look, as last baked
    private appearanceVersions: number[] = [];
    // The casket Auto alch last sent off (a co-op one takes a frame to come
    // back, and shouldn't go twice)
    private autoAlchedUid = -1;
    private runRecorded = false;
    private coopResultsRecorded = false;
    // Adventurers this run has done the task for, already told about
    private tasksAnnounced = new Set<string>();
    private attractTick = 0;
    private attractYaw = 0;
    private display = loadDisplaySettings();
    private readonly move = { x: 0, y: 0 };
    private readonly screen: ScreenPoint = { x: 0, y: 0, visible: false };
    private fps = 60;
    // The HUD's minimap, while it's on screen
    private minimapCanvas?: HTMLCanvasElement;
    // Collision for each map, built the first time a run goes there
    private readonly grids = new Map<string, ArenaGrid>();
    // The current map's: the run's, or the title screen's
    grid: ArenaGrid;

    constructor(
        readonly mapViewer: MapViewer,
        readonly renderer: GameWebGLRenderer,
        titleGrid: ArenaGrid,
        readonly assets: GameAssets,
        readonly audio: GameAudio,
        overlayCanvas: HTMLCanvasElement,
        readonly store: GameStore,
        readonly saveStore: SaveStore,
        readonly options: GameClientOptions,
    ) {
        this.save = store.getSnapshot().save;
        this.grid = titleGrid;
        this.grids.set(TITLE_MAP.id, titleGrid);
        this.sounds = new GameSounds(audio);
        store.set({ audio: audio.settings, display: this.display });
        this.view = new GameView(assets);
        this.minimap = new Minimap(mapViewer);
        this.overlay = new Overlay(overlayCanvas);
        this.input = new GameInput(renderer.canvas);
        this.input.onPress = this.onKeyPress;
        this.input.onBlur = () => {
            this.accumulator = 0;
            // With auto-pause off the run carries on (though a hidden tab
            // stops drawing, so it waits there until it's back). Co-op never
            // pauses for one player.
            if (
                this.sim &&
                !this.coopRun &&
                this.display.pauseOnBlur &&
                this.store.getSnapshot().overlay === "none"
            ) {
                this.pause();
            }
        };
        this.coop = new CoopLobby(store);
        this.coop.onStart = (game) => this.beginCoopRun(game);
        this.coop.onUp = (from, message) => this.toCoopRun((run) => run.receiveUp(from, message));
        this.coop.onDown = (message) => this.toCoopRun((run) => run.receiveDown(message));
        this.coop.onLeft = (id) => this.toCoopRun((run) => run.playerLeft(id));
        this.coop.onGone = (reason) => this.onCoopGone(reason);
        this.coop.onClosed = () => this.onCoopClosed();
        this.coop.onMaintenanceExit = () => this.onCoopMaintenanceExit();
        // Co-op's offered only where there's a relay to play it through
        this.coop.checkAvailable();
        document.addEventListener("visibilitychange", this.onVisibilityChange);
        this.cameraRig.pitch = ATTRACT_PITCH;
        this.cameraRig.distance = ATTRACT_DISTANCE;

        // An invite link (?room=CODE) goes straight to the room
        const invite = new URLSearchParams(window.location.search).get("room");
        if (options.autostart) {
            this.store.set({ characterId: options.autostart });
            this.startRun();
        } else if (invite) {
            this.openCoop().then(() => this.joinRoom(invite));
        } else {
            this.showScreen("title");
        }
    }

    setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
        this.minimapCanvas = canvas ?? undefined;
    }

    dispose(): void {
        document.removeEventListener("visibilitychange", this.onVisibilityChange);
        this.stopBackgroundTicker();
        this.coop.close();
        this.input.dispose();
        this.audio.dispose();
        if (this.renderer.game === this) {
            this.renderer.game = undefined;
        }
    }

    // ---- UI actions ----

    showScreen(screen: Screen): void {
        this.store.set({ screen });
    }

    selectCharacter(characterId: string): void {
        if (!this.save.unlockedCharacters.includes(characterId)) {
            return;
        }
        this.store.set({ characterId });
        if (!this.sim) {
            this.assets.setPlayerAppearance(getCharacterAppearance(characterId));
        }
        this.coop.setMe({ characterId });
    }

    selectMap(mapId: string): void {
        if (isMapUnlocked(this.save, mapId)) {
            const endless = this.store.getSnapshot().endless && isEndlessUnlocked(this.save, mapId);
            this.store.set({ mapId, endless });
            if (this.coop.isHost) {
                this.coop.setMap(mapId, endless);
            }
        }
    }

    // Endless runs, for a map that's been beaten
    toggleEndless(): void {
        const { mapId, endless } = this.store.getSnapshot();
        if (endless || isEndlessUnlocked(this.save, mapId)) {
            this.store.set({ endless: !endless });
            if (this.coop.isHost) {
                this.coop.setMap(mapId, !endless);
            }
        }
    }

    // ---- Co-op menus ----

    // The co-op screen, connected to the relay
    async openCoop(): Promise<void> {
        this.showScreen("coop");
        this.coop.setMe({
            characterId: this.store.getSnapshot().characterId,
            loadout: this.getLoadout(),
            unlocks: this.getUnlocks(),
        });
        await this.coop.connect();
    }

    // Back to the title, out of any room
    closeCoop(): void {
        if (this.coop.room) {
            this.coop.leave();
        }
        this.coop.close();
        this.showScreen("title");
    }

    // Another name from the relay
    renameCoop(): void {
        this.coop.rename();
    }

    // A room of this player's, for the map picked
    createRoom(open: boolean): void {
        const { mapId, endless } = this.store.getSnapshot();
        this.coop.create(open, mapId, endless);
    }

    // Another page of the open rooms
    showRoomsPage(page: number): void {
        this.coop.refresh(page);
    }

    joinRoom(code: string): void {
        this.coop.join(code);
    }

    leaveRoom(): void {
        this.coop.leave();
    }

    setCoopReady(ready: boolean): void {
        this.coop.setReady(ready);
    }

    setRoomOpen(open: boolean): void {
        this.coop.setOpen(open);
    }

    kickPlayer(id: string): void {
        this.coop.kick(id);
    }

    disbandRoom(): void {
        this.coop.disband();
    }

    // The invite link for the room, for its code
    getInviteLink(code: string): string {
        const url = new URL(window.location.href);
        url.search = "";
        url.searchParams.set("room", code);
        return url.toString();
    }

    // The maps this player has, and has endless for, which rooms go by
    private getUnlocks(): Unlocks {
        const ids = [...MAPS, ...FUN_MAPS].map((m) => m.id);
        return {
            maps: ids.filter((id) => isMapUnlocked(this.save, id)),
            endless: ids.filter((id) => isEndlessUnlocked(this.save, id)),
        };
    }

    private getLoadout(): Loadout {
        return makeLoadout(getMetaStats(this.save), [...this.save.unlockedItems], {
            ...this.save.armoury,
        });
    }

    // The host's Start: everyone's ready, so off to the room's map. The relay
    // sends the start back to everyone (this player too), and the run begins
    // there.
    startCoopRun(): void {
        const room = this.coop.room;
        if (!room || !this.coop.isHost) {
            return;
        }
        // Everyone's ready, the host too (on their own, that's a party of one)
        if (room.members.some((m) => !m.ready) || room.members.length > MAX_PARTY) {
            this.sounds.denied();
            return;
        }
        const map = getMap(room.mapId);
        if (!isMapUnlocked(this.save, map.id)) {
            this.sounds.denied();
            return;
        }
        const game: GameStart = {
            seed: (Math.random() * 0x7fffffff) | 0,
            mapId: map.id,
            endless:
                map.fun !== undefined || (room.endless && isEndlessUnlocked(this.save, map.id)),
            heroes: room.members.map((member) => ({
                id: member.id,
                name: member.name,
                characterId:
                    map.fun?.character ??
                    (CHARACTERS.some((c) => c.id === member.characterId)
                        ? member.characterId
                        : CHARACTERS[0].id),
                loadout: member.loadout ?? makeLoadout({}, [], {}),
            })),
        };
        this.coop.start(game);
    }

    // Kicked or disbanded, or the host left: a run that was going ends
    private onCoopGone(reason: GoneReason): void {
        if (reason !== "left") {
            this.store.toast(ENDED_EARLY[reason] ?? "You left the party.", 5000);
        }
        // A run that's still loading never starts
        this.coopInbox = undefined;
        if (this.coopRun && this.sim && !this.sim.runOver) {
            this.endCoopRunEarly(ENDED_EARLY[reason] ?? "You left the party.");
        }
    }

    private onCoopClosed(): void {
        // A run that's still loading never starts
        this.coopInbox = undefined;
        const sim = this.sim;
        const run = this.coopRun;
        if (!sim || !run || sim.runOver) {
            return;
        }
        if (run.isHost) {
            // The run's this copy's: it goes on without the others
            for (const hero of sim.heroes) {
                if (hero.index !== sim.focus) {
                    sim.leave(hero.index);
                }
            }
            this.coopRun = undefined;
            this.store.toast(
                "Lost the connection to the others. The run goes on without them.",
                6000,
            );
        } else {
            this.endCoopRunEarly("Lost the connection to the co-op server.");
        }
    }

    private onCoopMaintenanceExit(): boolean {
        // A loading run must not begin after acknowledging its exit.
        this.coopInbox = undefined;
        if (!this.coopRun || !this.sim) return true;
        if (!this.coopResultsRecorded) {
            this.endCoopRunEarly(
                "Your run ended for server maintenance. Your earned progress has been kept.",
            );
        }
        return this.coopResultsRecorded;
    }

    // A run that can't go on: what was done counts, as if they'd quit
    private endCoopRunEarly(why: string): void {
        // Nothing more of it is stepped, frames still to come included
        this.coopStopped = true;
        this.stopBackgroundTicker();
        this.finishRun(why);
        this.store.set({ overlay: "dead", choices: [], chest: undefined, waitingOn: [] });
        this.updateHud(true);
    }

    buyUpgrade(upgradeId: string): void {
        if (buyUpgrade(this.save, upgradeId)) {
            this.sounds.buy();
            this.persist();
        } else {
            this.sounds.denied();
        }
    }

    // Upgrades a piece of gear in the Armoury, one step
    upgradeGear(itemId: string): void {
        if (buyArmouryUpgrade(this.save, itemId)) {
            this.sounds.buy();
            this.persist();
        } else {
            this.sounds.denied();
        }
    }

    playClick(): void {
        this.sounds.click();
    }

    setVolume(volume: number): void {
        this.audio.setSettings({ volume, muted: false });
        this.store.set({ audio: this.audio.settings });
    }

    setMusicVolume(music: number): void {
        this.audio.setSettings({ music, muted: false });
        this.store.set({ audio: this.audio.settings });
    }

    toggleMute(): void {
        this.audio.setSettings({ muted: !this.audio.settings.muted });
        this.store.set({ audio: this.audio.settings });
    }

    toggleMenuSpin(): void {
        this.setDisplay({ menuSpin: !this.display.menuSpin });
    }

    toggleAutoPause(): void {
        this.setDisplay({ pauseOnBlur: !this.display.pauseOnBlur });
    }

    toggleAutoAlch(): void {
        this.setDisplay({ autoAlch: !this.display.autoAlch });
    }

    toggleQuestTracker(): void {
        this.setDisplay({ questTracker: !this.display.questTracker });
    }

    private setDisplay(changes: Partial<DisplaySettings>): void {
        this.display = { ...this.display, ...changes };
        saveDisplaySettings(this.display);
        this.store.set({ display: this.display });
    }

    refundUpgrades(): void {
        refundUpgrades(this.save);
        this.persist();
    }

    // Downloads the save as a file
    exportSave(): void {
        const blob = new Blob([exportSave(this.save)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "run-escape-save.json";
        link.click();
        // Once the download has its copy
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Swaps in an imported save in place of this one
    replaceSave(save: SaveData): void {
        this.save = save;
        // The adventurer and map picked might not be open in it
        const { characterId, mapId } = this.store.getSnapshot();
        if (!save.unlockedCharacters.includes(characterId)) {
            this.selectCharacter(save.unlockedCharacters[0]);
        }
        if (!isMapUnlocked(save, mapId)) {
            this.store.set({ mapId: MAPS[0].id });
        }
        if (!isEndlessUnlocked(save, this.store.getSnapshot().mapId)) {
            this.store.set({ endless: false });
        }
        this.persist();
    }

    private persist(): void {
        this.saveStore.save(this.save);
        // A fresh object so React sees the change
        this.store.set({ save: structuredClone(this.save) });
    }

    // Builds a map's collision the first time it's played (a scene build of
    // the whole arena, a moment's work)
    private async loadGrid(mapId: string): Promise<ArenaGrid> {
        let grid = this.grids.get(mapId);
        if (!grid) {
            await installRecipe(this.mapViewer, mapId);
            const region = await this.mapViewer.workerPool.queueLoad<
                RegionDataInput,
                RegionData,
                RegionDataLoader
            >(new RegionDataLoader(), getArenaRegion(getMap(mapId)));
            grid = new ArenaGrid(region);
            this.grids.set(mapId, grid);
        }
        return grid;
    }

    // Forgets a map's collision, for a map that's changed
    forgetGrid(mapId: string): void {
        this.grids.delete(mapId);
    }

    // Loads a map's collision and enemies for a run, with the loading screen if
    // it takes a moment. False if it couldn't.
    private async travelTo(mapId: string, back: Screen): Promise<boolean> {
        const map = getMap(mapId);
        const enemies = getMapEnemies(map);
        if (!this.grids.has(mapId) || !this.assets.hasEnemies(enemies)) {
            this.store.set({
                screen: "loading",
                loadingText: `Travelling to ${map.name}`,
                loadingProgress: 25,
            });
        }
        try {
            this.grid = await this.loadGrid(mapId);
            await this.assets.loadEnemies(enemies, (done, total) => {
                this.store.set({ loadingProgress: 25 + Math.round((done / total) * 75) });
            });
            return true;
        } catch (e) {
            console.error("Failed to load map", mapId, e);
            this.store.set({ screen: back });
            this.store.toast(`Couldn't get to ${map.name}.`);
            return false;
        }
    }

    async startRun(mapId: string = this.store.getSnapshot().mapId): Promise<void> {
        if (!isMapUnlocked(this.save, mapId)) {
            return;
        }
        const map = getMap(mapId);
        // Fun maps are always endless, and some have everyone play one
        // adventurer (Durial321 in Falador)
        const endless =
            map.fun !== undefined ||
            (this.store.getSnapshot().endless && isEndlessUnlocked(this.save, mapId));
        const characterId = map.fun?.character ?? this.store.getSnapshot().characterId;
        if (!(await this.travelTo(mapId, "characters"))) {
            return;
        }
        usePortableMath(false);
        const sim = new Sim({
            grid: this.grid,
            mapId,
            characterId,
            metaStats: getMetaStats(this.save),
            seed: (Math.random() * 0x7fffffff) | 0,
            spawnX: map.spawn.x,
            spawnY: map.spawn.y,
            unlockedItems: new Set(this.save.unlockedItems),
            endless,
            armoury: { ...this.save.armoury },
        });
        for (let i = 0; i < this.options.stress; i++) {
            sim.spawnEnemy(getEnemy("goblin"), "normal");
        }
        this.enterRun(sim);
    }

    // A message for the co-op run, kept while its copy is still being made
    // (the map loading, which can take one player longer than the rest) and
    // handed over once it's there
    private toCoopRun(deliver: (run: CoopRun) => void): void {
        if (this.coopRun) {
            deliver(this.coopRun);
        } else if (this.coopInbox && this.coopInbox.length < MAX_COOP_INBOX) {
            this.coopInbox.push(deliver);
        }
    }

    // A co-op run, as the host started it: everyone builds the same Sim, each
    // playing their own hero
    private async beginCoopRun(game: GameStart): Promise<void> {
        if (!isGameStart(game, MAX_PARTY)) {
            this.store.toast("That run needs a map or adventurer your game doesn't have.", 6000);
            this.coopInbox = undefined;
            this.coop.leave();
            return;
        }
        const you = this.coop.id;
        const focus = game.heroes.findIndex((hero) => hero.id === you);
        const room = this.coop.room;
        if (focus === -1 || !room) {
            return;
        }
        this.coopInbox = [];
        // A map or adventurer this game hasn't got (another player's game
        // could be newer, or made up): it can't play along
        if (
            !MAP_BY_ID.has(game.mapId) ||
            !game.heroes.every((hero) => CHARACTERS.some((c) => c.id === hero.characterId))
        ) {
            this.store.toast("That run needs a map or adventurer your game doesn't have.", 6000);
            this.coopInbox = undefined;
            this.coop.leave();
            return;
        }
        if (this.sim) {
            // Still on the last run's results
            this.leaveRun(false);
        }
        if (!(await this.travelTo(game.mapId, "coop"))) {
            this.coopInbox = undefined;
            this.coop.leave();
            return;
        }
        // The room went while the map loaded (the host left, the connection
        // dropped): there's no run to join
        if (!this.coopInbox || this.coop.room?.code !== room.code) {
            this.coopInbox = undefined;
            this.store.set({ screen: this.coop.room ? "coop" : "title" });
            return;
        }
        // Every copy has to work out the same numbers, to the bit
        usePortableMath(true);
        const map = getMap(game.mapId);
        const party: HeroOptions[] = game.heroes.map((hero) => ({
            name: hero.name,
            characterId: hero.characterId,
            metaStats: loadoutStats(hero.loadout),
            ...cleanLoadout(hero.loadout),
        }));
        const sim = new Sim({
            grid: this.grid,
            mapId: game.mapId,
            characterId: party[focus].characterId,
            metaStats: party[focus].metaStats,
            seed: game.seed,
            spawnX: map.spawn.x,
            spawnY: map.spawn.y,
            endless: game.endless,
            party,
            focus,
        });
        const heroes = new Map(game.heroes.map((hero, i) => [hero.id, i]));
        const run = new CoopRun(sim, this.coop.isHost, this.coop, heroes, room.hostId);
        this.coopRun = run;
        this.coopPlayerIds = game.heroes.map((hero) => hero.id);
        const inbox = this.coopInbox ?? [];
        this.coopInbox = undefined;
        for (const deliver of inbox) {
            deliver(run);
        }
        this.enterRun(sim);
        if (!this.coop.isHost) {
            this.coop.sendUp({ loaded: true });
        }
        // Hidden while it loaded: it keeps up from the start
        if (document.hidden) {
            this.onVisibilityChange();
        }
    }

    private enterRun(sim: Sim): void {
        const map = sim.map;
        this.sim = sim;
        this.renderer.setPlane(this.grid.plane);
        this.renderer.setSmoothTerrain(map.scaperune === true);
        this.grid.exactGround = map.scaperune === true;
        this.cameraGround = undefined;
        this.renderer.setBrightness(map.brightness ?? 1);
        this.minimap.setMap(map);
        const music = map.music && MUSIC[map.music];
        if (music) {
            this.audio.playMusic(music);
        } else {
            this.audio.stopMusic();
        }
        this.paused = false;
        this.runRecorded = false;
        this.coopResultsRecorded = false;
        this.tasksAnnounced.clear();
        this.accumulator = 0;
        this.shownDps = 0;
        this.shownDpsTick = 0;
        this.appearanceVersions = [];
        this.decisionKey = "";
        this.autoAlchedUid = -1;
        this.coopStopped = false;
        this.viewHero = sim.focus;
        this.assets.dropPlayers(sim.heroes.length);
        this.view.reset();
        this.cameraRig.pitch = RUN_PITCH;
        this.cameraRig.distance =
            isCoarsePointer && window.innerHeight <= PHONE_MAX_HEIGHT
                ? PHONE_RUN_DISTANCE
                : RUN_DISTANCE;
        this.cameraRig.yaw = 0;
        this.store.set({
            screen: "run",
            overlay: "none",
            choices: [],
            chest: undefined,
            result: undefined,
            toasts: [],
            party: [],
            waitingOn: [],
        });
        this.updateHud(true);
        if (this.coopRun?.isHost && this.coopRun.waitingForLoad) {
            this.store.toast("Waiting for everyone to arrive...", 3000);
        }
    }

    // Co-op sends what the player does to the host, to be done in the frame
    // it goes in (on every copy at once); on your own it's done now. Returns
    // false when it can't be done.
    private act(action: CoopAction): boolean {
        const sim = this.sim;
        if (!sim) {
            return false;
        }
        if (this.coopRun) {
            this.coopRun.act(action);
            return true;
        }
        const done = applyAction(sim, action);
        this.afterAction(action, done);
        return done;
    }

    // What follows something the player did, once it's done
    private afterAction(action: CoopAction, done: boolean): void {
        const sim = this.sim;
        if (!sim) {
            return;
        }
        switch (action.kind) {
            case "choose":
                this.syncOverlay();
                break;
            case "chest":
                this.handleEvents(sim, sim.takeEvents());
                this.syncOverlay();
                break;
            case "reroll":
                if (done) {
                    this.afterReroll(sim);
                } else {
                    this.sounds.denied();
                }
                break;
            case "skip":
                if (done) {
                    this.sounds.buy();
                    this.syncOverlay();
                } else {
                    this.sounds.denied();
                }
                break;
            case "item":
                if (done) {
                    this.handleEvents(sim, sim.takeEvents());
                    if (sim.state !== "playing") {
                        // A lamp's level up, or a blast that killed the boss
                        this.syncOverlay();
                    }
                }
                break;
            case "event":
                if (!done) {
                    this.sounds.denied();
                    return;
                }
                this.handleEvents(sim, sim.takeEvents());
                this.syncOverlay();
                break;
            case "leaveEvent":
                this.handleEvents(sim, sim.takeEvents());
                this.syncOverlay();
                break;
        }
        this.updateHud(true);
    }

    choose(index: number): void {
        const sim = this.sim;
        if (!sim || !sim.isChoosing()) {
            return;
        }
        this.act({ kind: "choose", index });
    }

    // What the player chose with the open casket's item
    resolveChest(action: ChestAction): void {
        const sim = this.sim;
        if (!sim || sim.state !== "chest" || !sim.chest) {
            return;
        }
        this.act({ kind: "chest", action });
    }

    // Takes one of what a random event's visitor has on offer
    chooseEvent(index: number): void {
        const sim = this.sim;
        if (!sim || sim.state !== "event") {
            return;
        }
        this.act({ kind: "event", index });
    }

    // Walks away from what a random event's visitor has on offer
    leaveEvent(): void {
        const sim = this.sim;
        if (!sim || sim.state !== "event") {
            return;
        }
        this.act({ kind: "leaveEvent" });
    }

    // Rolls the level up's rewards or the open casket's item again, for one of
    // the run's rerolls. False when there's none left.
    reroll(): boolean {
        const sim = this.sim;
        if (!sim) {
            return false;
        }
        if (this.coopRun && sim.rerollsLeft <= 0) {
            this.sounds.denied();
            return false;
        }
        return this.act({ kind: "reroll" });
    }

    private afterReroll(sim: Sim): void {
        if (sim.state === "chest") {
            const chest = getChestView(sim);
            // The UI bursts the casket open again for the new item
            if (chest) {
                this.sounds.chest("open", chest.rarity);
            }
            this.store.set({ chest });
        } else {
            this.sounds.reroll();
            this.store.set({ choices: getChoiceViews(sim) });
        }
    }

    // Takes none of the level up's rewards, for coins from the run. False when
    // it can't be skipped or there aren't the coins.
    skip(): boolean {
        const sim = this.sim;
        if (!sim || sim.state !== "levelUp") {
            return false;
        }
        if (this.coopRun && (!sim.canSkip || sim.coins < sim.skipCost)) {
            this.sounds.denied();
            return false;
        }
        return this.act({ kind: "skip" });
    }

    // Uses the utility item in an inventory slot (0-3)
    useItem(index: number): void {
        const sim = this.sim;
        if (!sim || (this.paused && !this.coopRun) || !sim.inventory[index]) {
            return;
        }
        this.act({ kind: "item", index });
    }

    // The opening animation's sounds, timed by the UI
    playChestSound(cue: ChestCue, rarity: Rarity): void {
        this.sounds.chest(cue, rarity);
    }

    // Co-op's menu doesn't stop the run: the others play on
    pause(): void {
        if (this.sim && !this.sim.runOver) {
            this.paused = true;
            this.syncOverlay();
        }
    }

    resume(): void {
        this.paused = false;
        this.accumulator = 0;
        this.syncOverlay();
    }

    // Ends the run where it stands (from the pause menu); coins found are kept.
    // In co-op that's leaving the party (the host's leaving ends it for
    // everyone).
    quitRun(): void {
        if (this.sim) {
            this.finishRun();
        }
        if (this.coopRun) {
            this.coop.leave();
        }
        this.leaveRun();
    }

    // Back to the title screen after the results, or after a co-op run, back
    // to the room. show: false when the next run's starting straight away.
    leaveRun(show = true): void {
        const wasCoop = this.coopRun !== undefined;
        if (show && this.coopRun && this.coopResultsRecorded) {
            // Results can be dismissed before the next update sends the acknowledgement.
            this.coopRun.flush(true);
            this.coop.finished();
        }
        if (wasCoop && show && this.coop.isHost) {
            // The room's open for the next run
            this.coop.end();
        }
        this.coopRun = undefined;
        this.stopBackgroundTicker();
        usePortableMath(false);
        this.assets.dropPlayers(1);
        this.sim = undefined;
        this.paused = false;
        this.audio.stopMusic();
        this.grid = this.grids.get(TITLE_MAP.id)!;
        this.renderer.setPlane(this.grid.plane);
        this.renderer.setSmoothTerrain(false);
        this.renderer.setBrightness(1);
        this.view.reset();
        this.cameraRig.pitch = ATTRACT_PITCH;
        this.cameraRig.distance = ATTRACT_DISTANCE;
        this.assets.setPlayerAppearance(
            getCharacterAppearance(this.store.getSnapshot().characterId),
        );
        if (!show) {
            return;
        }
        this.store.set({
            screen: wasCoop && this.coop.room ? "coop" : "title",
            overlay: "none",
            hud: undefined,
            choices: [],
            chest: undefined,
            result: undefined,
            party: [],
            waitingOn: [],
        });
    }

    // endedEarly: why a co-op run ended before anyone won or fell
    private finishRun(endedEarly?: string): void {
        const sim = this.sim;
        if (!sim || this.runRecorded) {
            return;
        }
        this.runRecorded = true;
        const result = sim.getResult();
        const locked = MAPS.filter((m) => !isMapUnlocked(this.save, m.id));
        const lockedCharacters = CHARACTERS.filter(
            (c) => !this.save.unlockedCharacters.includes(c.id),
        );
        const lockedItems = LOCKABLE_ITEMS.filter((i) => !this.save.unlockedItems.includes(i.id));
        const endlessRecord = result.endless && isEndlessRecord(this.save, result);
        const newGear = isDevMap(sim.map.id)
            ? []
            : result.gearFound.filter((id) => !this.save.foundGear.includes(id));
        const newTrophies = isDevMap(sim.map.id)
            ? []
            : result.trophies.filter((id) => !this.save.trophies.includes(id));
        // A co-op run's numbers can come from another player's modified game
        const quests =
            sim.heroes.length > 1 && hasBadNumber(result) ? [] : recordRun(this.save, result);
        this.persist();
        const unlockedMap = locked.find((m) => isMapUnlocked(this.save, m.id));
        const unlockedCharacters = lockedCharacters.filter((c) =>
            this.save.unlockedCharacters.includes(c.id),
        );
        const unlockedItems = lockedItems.filter((i) => this.save.unlockedItems.includes(i.id));
        if (unlockedMap) {
            // Ready for the next run
            this.store.set({ mapId: unlockedMap.id, endless: false });
        }
        this.store.set({
            result: {
                ...result,
                characterName: getCharacter(sim.characterId).name,
                damage: getDamageViews(sim, result.stats),
                bossKills: getBossKillViews(result.stats),
                endlessRecord,
                unlockedMap: unlockedMap?.name,
                unlockedCharacters: unlockedCharacters.map((c) => c.name),
                unlockedItems: unlockedItems.map((i) => i.name),
                newGear: newGear.map((id) => getItem(id).name),
                newTrophies: newTrophies.map((id) => TROPHY_BY_ID.get(id)!.name),
                quests: quests.map((q) => ({ name: q.name, coins: q.coins })),
                ...(sim.heroes.length > 1 && {
                    party: sim.heroes.filter((h) => h.index !== sim.focus).map((h) => h.name),
                }),
                endedEarly,
            },
        });
        // The room sees this player's new unlocks and upgrades next run
        this.coop.setMe({ loadout: this.getLoadout(), unlocks: this.getUnlocks() });
        this.coopResultsRecorded = true;
    }

    // A task or quest done mid-run: the adventurer or item joins, and the
    // quest pays out, once the run is over, however it ends (beating the map
    // shows on the results instead)
    private announceTasks(sim: Sim): void {
        if (sim.runOver || isDevMap(sim.map.id)) {
            return;
        }
        const result = sim.getResult();
        const earned = getEarnedUnlocks(this.save, result);
        const news = [
            ...earned.characters.map((c) => ({
                key: `character:${c.id}`,
                task: c.unlock!,
                text: `The ${c.name} joins you after this run.`,
            })),
            ...earned.items.map((i) => ({
                key: `item:${i.id}`,
                task: i.unlock,
                text: `${i.name} ${i.kind === "item" ? "joins the loot" : "can be found"} after this run.`,
            })),
        ];
        for (const { key, task, text } of news) {
            if (!this.tasksAnnounced.has(key)) {
                this.tasksAnnounced.add(key);
                this.sounds.taskDone();
                this.store.toast(`Task done: ${describeUnlockTask(task)}! ${text}`, 6000);
            }
        }
        for (const quest of getFinishedQuests(this.save, result)) {
            const key = `quest:${quest.id}`;
            if (!this.tasksAnnounced.has(key)) {
                this.tasksAnnounced.add(key);
                this.sounds.taskDone();
                this.store.toast(
                    `Quest complete: ${quest.name}! ${quest.coins.toLocaleString()} coins ` +
                        "are yours after this run.",
                    6000,
                );
            }
        }
    }

    private onKeyPress = (code: string): void => {
        if (code === "F3") {
            this.store.set({ debug: !this.store.getSnapshot().debug });
            return;
        }
        if (code === "KeyM") {
            this.toggleMute();
            return;
        }
        if (code === "KeyQ" && this.sim) {
            this.toggleQuestTracker();
            return;
        }
        const sim = this.sim;
        if (!sim) {
            return;
        }
        const overlay = this.store.getSnapshot().overlay;
        if (code === "Escape" || code === "KeyP") {
            if (overlay === "paused") {
                this.resume();
            } else if (overlay === "none") {
                this.pause();
            } else if (overlay === "event" && code === "Escape") {
                this.leaveEvent();
            }
        } else if (overlay === "event" && code.startsWith("Digit")) {
            this.chooseEvent(parseInt(code.slice(5)) - 1);
        } else if (overlay === "levelUp" && code.startsWith("Digit")) {
            const index = parseInt(code.slice(5)) - 1;
            if (index >= 0 && index < sim.choices.length) {
                this.choose(index);
            }
        } else if (overlay === "paused" && this.coopRun && code.startsWith("Digit")) {
            // The run goes on behind co-op's menu
            this.useItem(parseInt(code.slice(5)) - 1);
        } else if (overlay === "levelUp" && code === "KeyR") {
            this.reroll();
        } else if (overlay === "levelUp" && code === "KeyX") {
            this.skip();
        } else if (overlay === "none" && code.startsWith("Digit")) {
            // The casket screen has its own keys (it knows when its animation
            // is done)
            this.useItem(parseInt(code.slice(5)) - 1);
        }
    };

    // ---- Frame ----

    update(deltaTimeMs: number, camera: Camera): void {
        this.fps = this.fps * 0.95 + (deltaTimeMs > 0 ? 1000 / deltaTimeMs : 0) * 0.05;
        const wheel = this.input.takeWheel();
        if (wheel !== 0 && this.sim) {
            this.cameraRig.zoom(wheel);
        }
        this.store.expireToasts();

        // The world fades out past the edge of the map
        const { baseX, baseY, sizeX, sizeY } = this.grid;
        // The world fades out past the arena's edge. A ScapeRune map's world carries on: it
        // has scenery there (scaperune/CLAUDE.md).
        const open = this.sim?.map.scaperune === true ? OPEN_WORLD_MARGIN : 0;
        const playArea = this.renderer.playArea;
        playArea[0] = baseX - open;
        playArea[1] = baseY - open;
        playArea[2] = baseX + sizeX + open;
        playArea[3] = baseY + sizeY + open;

        const sim = this.sim;
        if (!sim) {
            this.updateAttract(deltaTimeMs, camera);
            return;
        }

        if (this.coopRun) {
            this.updateCoop(deltaTimeMs, sim, this.coopRun);
        } else if (!this.paused && (sim.state === "playing" || sim.runOver)) {
            const wasOver = sim.runOver;
            this.accumulator += Math.min(deltaTimeMs, TICK_MS * MAX_TICKS_PER_FRAME);
            while (this.accumulator >= TICK_MS && (sim.state === "playing" || sim.runOver)) {
                this.accumulator -= TICK_MS;
                const move = this.input.getMoveVector(this.move);
                sim.step(move.x, move.y);
                this.handleEvents(sim, sim.takeEvents());
            }
            if (sim.state !== "playing" && !wasOver) {
                this.syncOverlay();
                // Auto alch can have the run going again, with no time lost
                if (!sim.runOver && this.store.getSnapshot().overlay !== "none") {
                    this.accumulator = 0;
                }
            }
        }

        for (const hero of sim.heroes) {
            if (hero.appearanceVersion !== this.appearanceVersions[hero.index]) {
                this.appearanceVersions[hero.index] = hero.appearanceVersion;
                this.assets.setPlayerAppearance(getRunAppearance(sim, hero.index), hero.index);
            }
        }

        const now = performance.now();
        if (now - this.lastHudUpdate > HUD_INTERVAL_MS) {
            this.updateHud(false);
            this.announceTasks(sim);
        }

        this.viewHero = this.getViewHero(sim);
        this.view.viewHero = this.viewHero;
        const alpha = this.getAlpha();
        const player = sim.heroes[this.viewHero].player;
        const px = player.prevX + (player.x - player.prevX) * alpha;
        const py = player.prevY + (player.y - player.prevY) * alpha;
        // Aim at the player's chest, not their feet
        let ground = this.grid.getHeight(px, py) / 128;
        if (sim.map.scaperune) {
            const last = this.cameraGround ?? ground;
            ground = last + (ground - last) * (1 - Math.exp(-deltaTimeMs / CAMERA_GROUND_EASE));
            this.cameraGround = ground;
        }
        this.cameraRig.apply(camera, px, ground - 0.6, py);
    }

    // A co-op run: frames step at the run's pace, the host's whenever it
    // likes, a guest's as the host's arrive (catching up if it's fallen
    // behind). The menu doesn't stop it, and neither does a level up: the
    // frames carry everyone's choices.
    private updateCoop(deltaTimeMs: number, sim: Sim, run: CoopRun): void {
        if (this.coopStopped) {
            return;
        }
        const move = this.input.getMoveVector(this.move);
        // Standing still while choosing (the menu doesn't stop the run, so
        // moving goes on behind it)
        const deciding = this.store.getSnapshot().overlay !== "none" && !this.paused;
        run.setMove(deciding ? 0 : move.x, deciding ? 0 : move.y);
        this.accumulator += Math.min(deltaTimeMs, TICK_MS * MAX_TICKS_PER_FRAME);
        const catchUp = run.isHost ? 0 : Math.max(0, run.behind - GUEST_BUFFER_FRAMES);
        const started = performance.now();
        let steps = 0;
        while (run.canStep() && steps < MAX_CATCH_UP_TICKS) {
            if (this.accumulator >= TICK_MS) {
                this.accumulator -= TICK_MS;
            } else if (steps >= catchUp || performance.now() - started > CATCH_UP_BUDGET_MS) {
                break;
            }
            steps++;
            const events = run.stepFrame();
            this.handleEvents(sim, sim.takeEvents());
            for (const event of events) {
                if (event.action && event.hero === sim.focus) {
                    this.afterCoopAction(sim, event.action);
                    if (event.auto) {
                        this.store.toast(
                            "Everyone was waiting, so that was decided for you.",
                            4000,
                        );
                    }
                }
            }
        }
        if (!run.canStep()) {
            // Waiting on the host: no time to make up once it's back
            this.accumulator = Math.min(this.accumulator, TICK_MS);
        }
        run.flush(sim.runOver);
        if (sim.runOver && this.coopResultsRecorded) {
            this.coop.finished();
        }
        if (run.desynced && !this.runRecorded) {
            // Nothing brings the copies back together, so this one stops
            // rather than everyone waiting on it
            this.coop.leave();
            this.endCoopRunEarly("Your game fell out of step with the host's, so your run ended.");
            return;
        }
        // Choices and caskets come and go with the frames
        const key = this.getDecisionKey(sim);
        if (key !== this.decisionKey) {
            this.decisionKey = key;
            this.syncOverlay();
        }
    }

    // What's come for a co-op run before its copy's made (toCoopRun), and
    // each hero's player id
    private coopInbox?: ((run: CoopRun) => void)[];
    private coopPlayerIds: string[] = [];
    // A co-op run that's ended early for this player (endCoopRunEarly)
    private coopStopped = false;
    // Ticks for a co-op player whose tab is hidden (see onVisibilityChange)
    private backgroundTicker?: Worker;
    private backgroundTime = 0;

    // A hidden tab isn't drawn, and its frames stop with it, so a co-op
    // player keeps stepping off a worker's timer (a page's own timers are
    // slowed right down in a hidden tab, a worker's aren't): the host keeps
    // the run going for everyone, and a guest keeps up rather than having
    // minutes to catch up on when they're back
    private onVisibilityChange = (): void => {
        this.stopBackgroundTicker();
        if (document.hidden && this.coopRun) {
            this.backgroundTime = performance.now();
            const source = `setInterval(() => postMessage(0), ${TICK_MS});`;
            const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
            this.backgroundTicker = new Worker(url);
            URL.revokeObjectURL(url);
            this.backgroundTicker.onmessage = () => {
                const sim = this.sim;
                const run = this.coopRun;
                const now = performance.now();
                if (sim && run && document.hidden) {
                    this.updateCoop(now - this.backgroundTime, sim, run);
                }
                this.backgroundTime = now;
            };
        } else {
            this.stopBackgroundTicker();
        }
    };

    private stopBackgroundTicker(): void {
        this.backgroundTicker?.terminate();
        this.backgroundTicker = undefined;
    }

    // A co-op action of this player's, now it's been done in its frame
    private afterCoopAction(sim: Sim, action: CoopAction): void {
        if (action.kind === "reroll") {
            this.afterReroll(sim);
        } else if (action.kind === "skip") {
            this.sounds.buy();
        }
        this.updateHud(true);
    }

    // What the run's waiting on, in a form that changes when any of it does
    private getDecisionKey(sim: Sim): string {
        const hero = sim.heroes[sim.focus];
        return [
            sim.state,
            hero.down,
            hero.pendingLevelUps,
            hero.choices.map((c) => c.kind + ("weaponId" in c ? c.weaponId : "")).join(),
            sim.chest?.uid ?? 0,
            sim.chest?.itemId ?? "",
            sim.offer?.uid ?? 0,
            sim.offer?.options.filter((o) => o.kind === "powerUp" && o.sold).length ?? 0,
            sim.waitingOn.map((h) => h.index).join(),
        ].join("|");
    }

    // The camera's on this player, or on a teammate who's still up while
    // they're down
    private getViewHero(sim: Sim): number {
        const own = sim.heroes[sim.focus];
        if (sim.isUp(own) || sim.runOver) {
            return sim.focus;
        }
        const current = sim.heroes[this.viewHero];
        if (current && current !== own && sim.isUp(current)) {
            return current.index;
        }
        const up = sim.heroes.find((hero) => sim.isUp(hero));
        return up?.index ?? sim.focus;
    }

    private getAlpha(): number {
        const sim = this.sim;
        if (!sim || (this.paused && !this.coopRun) || sim.state !== "playing") {
            return 1;
        }
        return Math.min(1, this.accumulator / TICK_MS);
    }

    // Title screen: the character idles in the courtyard while the camera
    // circles them (unless that's turned off)
    private updateAttract(deltaTimeMs: number, camera: Camera): void {
        const ticks = deltaTimeMs / TICK_MS;
        this.attractTick += ticks;
        if (this.display.menuSpin) {
            this.attractYaw = (this.attractYaw + ticks * ATTRACT_SPIN) % 2048;
        } else {
            // Back round to the front the short way
            const offset = this.attractYaw > 1024 ? this.attractYaw - 2048 : this.attractYaw;
            const settled = offset * Math.pow(ATTRACT_SETTLE, ticks);
            this.attractYaw = Math.abs(settled) < 1 ? 0 : (settled + 2048) % 2048;
        }
        this.cameraRig.yaw = this.attractYaw & 2047;
        const { x, y } = TITLE_MAP.spawn;
        this.cameraRig.apply(camera, x, this.grid.getHeight(x, y) / 128 - 0.8, y);
    }

    private handleEvents(sim: Sim, events: SimEvent[]): void {
        if (events.length === 0) {
            return;
        }
        this.view.onEvents(sim, events);
        this.sounds.onEvents(sim, events, this.viewHero);
        for (const event of events) {
            // Co-op: a teammate's own events, said with their name if at all
            if (event.hero !== undefined && event.hero !== sim.focus) {
                this.teammateToast(sim, sim.heroes[event.hero].name, event);
                continue;
            }
            switch (event.type) {
                case "casketDropped":
                    this.store.toast(`A ${CASKETS[event.tier].name.toLowerCase()} drops!`);
                    break;
                case "bossSpawned":
                case "bossRose":
                case "bossEnraged":
                case "bossStage":
                    // Bosses that turn up together say so once (Pest Control's
                    // portals, on the first)
                    if (event.message) {
                        this.store.toast(event.message, 6000);
                    }
                    break;
                case "coinsStolen":
                    this.store.toast(
                        `The ${getEnemy(event.enemyId).name} grabs ${event.amount} of your coins!`,
                    );
                    break;
                case "coinsReturned":
                    this.store.toast(`You get your ${event.amount} coins back!`);
                    break;
                case "revive":
                    this.store.toast("Your ring of life saves you!");
                    break;
                case "roundStarted":
                    this.store.toast(describeRound(sim), 7000);
                    break;
                case "powerUp":
                case "notice":
                    this.store.toast(event.message);
                    break;
                case "heroDown":
                    this.store.toast("You're down! Watch the rest of your party fight on.", 5000);
                    break;
                case "visitor":
                    if (event.message) {
                        this.store.toast(event.message);
                    }
                    break;
                case "alch":
                    // There was no casket screen to show what it was
                    if (this.display.autoAlch) {
                        this.store.toast(
                            `High alched ${getItem(event.itemId).name} for ${event.coins.toLocaleString()} coins`,
                        );
                    }
                    break;
            }
        }
    }

    private teammateToast(sim: Sim, name: string, event: SimEvent): void {
        switch (event.type) {
            case "heroDown":
                this.store.toast(`${name} is down!`, 5000);
                break;
            case "heroLeft":
                this.store.toast(`${name} left the game.`);
                break;
            case "revive":
                this.store.toast(`${name}'s ring of life saves them!`);
                break;
            case "powerUp":
                this.store.toast(`${name} picked up the ${getPowerUp(event.id).name}!`);
                break;
        }
    }

    // Shows whichever modal the run's state calls for
    private syncOverlay(): void {
        const sim = this.sim;
        if (!sim) {
            return;
        }
        // Co-op: who else the run's waiting on
        const waitingOn = sim.waitingOn
            .filter((hero) => hero.index !== sim.focus)
            .map((hero) => hero.name);
        if (sim.state === "dead" || sim.state === "victory") {
            if (sim.state === "dead" && !this.runRecorded) {
                this.sounds.playerDied();
            }
            this.finishRun();
            this.store.set({ overlay: sim.state, choices: [], chest: undefined, waitingOn: [] });
            this.updateHud(true);
        } else if (sim.state === "chest" && sim.chest && this.display.autoAlch) {
            // As if the High alch button had been clicked; this comes back here
            // for whatever's next. Co-op's comes back a frame later, so once
            // for each casket.
            if (sim.chest.uid !== this.autoAlchedUid) {
                this.autoAlchedUid = sim.chest.uid;
                this.resolveChest("alch");
            }
        } else if (sim.state === "chest" && sim.chest) {
            const chest = getChestView(sim);
            const shown = this.store.getSnapshot();
            // Co-op: the same casket again keeps its animation where it is
            if (!this.coopRun || shown.overlay !== "chest" || chest?.uid !== shown.chest?.uid) {
                this.store.set({ overlay: "chest", chest, choices: [], waitingOn });
            }
        } else if (sim.state === "event" && sim.offer?.hero === sim.focus) {
            this.store.set({
                overlay: "event",
                event: getEventView(sim),
                choices: [],
                chest: undefined,
                waitingOn,
            });
        } else if (sim.isChoosing()) {
            const was = this.store.getSnapshot().overlay;
            if (was !== "levelUp" || !this.coopRun) {
                this.sounds.levelUp();
            }
            this.store.set({
                overlay: "levelUp",
                choices: getChoiceViews(sim),
                chest: undefined,
                waitingOn,
            });
        } else if (this.paused) {
            this.store.set({ overlay: "paused", choices: [], chest: undefined, waitingOn });
        } else {
            this.store.set({ overlay: "none", choices: [], chest: undefined, waitingOn });
        }
    }

    private updateHud(force: boolean): void {
        const sim = this.sim;
        if (!sim) {
            return;
        }
        this.lastHudUpdate = performance.now();
        const thisLevel = sim.xpForThisLevel;
        const nextLevel = sim.xpForNextLevel;
        let boss: HudView["boss"];
        const shownBoss = sim.shownBoss;
        if (shownBoss) {
            const phase = shownBoss.bossState?.phase;
            const parasite = sim.parasite;
            boss = {
                name: shownBoss.def.name,
                fraction: shownBoss.dead ? 0 : shownBoss.hp / shownBoss.maxHp,
                enraged: !shownBoss.dead && (shownBoss.bossState?.enraged ?? false),
            };
            if (phase && !shownBoss.dead) {
                boss.fraction = phase.shield / phase.shieldMax;
                boss.fight = {
                    phase: phase.index + 1,
                    phases: shownBoss.def.boss?.phases?.phases.length ?? 1,
                    stage: phase.stage,
                    totems: phase.totems.map((totem) =>
                        phase.stage === "shield" ? 0 : 1 - Math.max(0, totem.hp) / totem.maxHp,
                    ),
                    curseAttacks: sim.curse?.attacksLeft,
                    parasiteSeconds: parasite
                        ? Math.max(0, (parasite.burstTick - sim.tick) / TICKS_PER_SECOND)
                        : undefined,
                };
            }
        }
        if (sim.tick - this.shownDpsTick >= DPS_HOLD_TICKS) {
            this.shownDps = sim.dps;
            this.shownDpsTick = sim.tick;
        }
        const hud: HudView = {
            mapId: sim.map.id,
            round: sim.endless ? sim.round : undefined,
            bossIn: sim.timeLeftForBoss,
            hp: Math.max(0, Math.round(sim.player.hp)),
            maxHp: sim.player.maxHp,
            poisoned: sim.player.poisonEnd !== -1,
            level: sim.level,
            xpFraction: Math.min(
                1,
                Math.max(0, (sim.xp - thisLevel) / Math.max(1, nextLevel - thisLevel)),
            ),
            seconds: sim.seconds,
            kills: sim.kills,
            coins: sim.coins,
            dps: this.shownDps,
            maxWeapons: sim.maxWeapons,
            maxPassives: sim.maxPassives,
            weapons: sim.weapons.map((w) => {
                const last = w.def.levels.length;
                const level = w.def.levels[Math.min(w.level, last) - 1];
                return {
                    id: w.def.id,
                    name: upgradedName(level.name ?? w.def.name, w.level - last),
                    level: w.level,
                    maxLevel: w.def.levels.length,
                    iconObjId: level.objId ?? w.def.iconObjId,
                    detail: w.bonus > 0 ? `+${Math.round(w.bonus * 100)}% damage` : "",
                    stats: weaponStats(w.def, level).map(formatWeaponStat),
                    evolution: getEvolutionView(sim, w),
                    rarityColor: RARITIES[w.def.rarity].color,
                };
            }),
            passives: sim.passives.map((p) => {
                const def = getPassive(p.id);
                return {
                    id: p.id,
                    name: upgradedName(def.name, p.level - def.maxLevel),
                    level: p.level,
                    maxLevel: def.maxLevel,
                    iconObjId: def.iconObjId,
                    iconSpriteId: def.iconSpriteId,
                    detail: formatPassiveValue(def, p.value),
                    rarityColor: RARITIES[def.rarity].color,
                };
            }),
            stats: formatStats(sim.stats),
            gear: getGearViews(sim),
            inventory: getInventoryViews(sim),
            buffs: getBuffViews(sim),
            rerolls: sim.rerollsLeft,
            skip: sim.canSkip
                ? { cost: sim.skipCost, affordable: sim.coins >= sim.skipCost }
                : undefined,
            boss,
            quests: getQuestTrackViews(this.save, sim),
        };
        const previous = this.store.getSnapshot().hud;
        if (force || !previous || JSON.stringify(previous) !== JSON.stringify(hud)) {
            this.store.set({ hud });
        }
        if (sim.heroes.length > 1) {
            const party = sim.heroes
                .filter((hero) => hero.index !== sim.focus)
                .map((hero) => ({
                    name: hero.name,
                    characterId: hero.characterId,
                    hp: Math.max(0, Math.round(hero.player.hp)),
                    maxHp: hero.player.maxHp,
                    down: hero.down,
                    left: hero.left,
                    id: this.coopPlayerIds[hero.index],
                }));
            if (JSON.stringify(party) !== JSON.stringify(this.store.getSnapshot().party)) {
                this.store.set({ party });
            }
        }
    }

    submitActors(actors: ActorRenderer, _camera: Camera): void {
        const sim = this.sim;
        if (sim) {
            this.view.submitActors(actors, sim, this.getAlpha());
            return;
        }
        // Title screen: just the character
        const model = this.assets.getPlayer();
        if (model) {
            const anim = model.getAnim(this.assets.getPlayerStance().idle);
            const tick = Math.floor(this.attractTick);
            actors.draw(
                model,
                anim,
                anim.getFrame(tick),
                TITLE_MAP.spawn.x,
                this.grid.getHeight(TITLE_MAP.spawn.x, TITLE_MAP.spawn.y) / 128,
                TITLE_MAP.spawn.y,
                0,
            );
        }
    }

    drawOverlay(camera: Camera): void {
        const overlay = this.overlay;
        overlay.begin(camera);
        const sim = this.sim;
        if (sim) {
            this.view.drawOverlay(overlay, sim, this.getAlpha());
            if (this.minimapCanvas) {
                this.minimap.draw(this.minimapCanvas, sim, this.getAlpha(), this.viewHero);
            }
        }
        if (this.store.getSnapshot().debug) {
            this.drawDebug(sim);
        }
    }

    private drawDebug(sim: Sim | undefined): void {
        const overlay = this.overlay;
        const ctx = overlay.ctx;
        const x = sim ? sim.player.x : TITLE_MAP.spawn.x;
        const y = sim ? sim.player.y : TITLE_MAP.spawn.y;
        this.drawCollisionDebug(Math.floor(x), Math.floor(y));
        ctx.font = "16px OSRS Small, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "#ffff00";
        const alive = sim ? sim.enemies.filter((e) => !e.dead).length : 0;
        const timeLeft = sim ? Math.round(sim.timeLeftForBoss) : 0;
        ctx.fillText(
            `${this.fps.toFixed(0)} fps  enemies ${alive}  projectiles ${sim?.projectiles.length ?? 0}  ` +
                `pickups ${sim?.pickups.length ?? 0}  tile ${Math.floor(x)}, ${Math.floor(y)}  ` +
                `flags 0x${this.grid.getFlags(Math.floor(x), Math.floor(y)).toString(16)}  boss in ${timeLeft}s`,
            12,
            overlay.height - 12,
        );
    }

    private drawCollisionDebug(cx: number, cy: number): void {
        const overlay = this.overlay;
        const ctx = overlay.ctx;
        const grid = this.grid;
        const range = 14;

        const corner = (x: number, y: number) => {
            const height = grid.getHeight(x, y) / 128;
            const p = overlay.project(x, height, y, this.screen);
            return [p.x, p.y, p.visible ? 1 : 0];
        };
        const box = { x0: 0, y0: 0, x1: 0, y1: 0 };

        ctx.lineWidth = 2;
        for (let ty = cy - range; ty <= cy + range; ty++) {
            for (let tx = cx - range; tx <= cx + range; tx++) {
                const flags = grid.getFlags(tx, ty);
                if (flags === 0) {
                    continue;
                }
                const sw = corner(tx, ty);
                const se = corner(tx + 1, ty);
                const ne = corner(tx + 1, ty + 1);
                const nw = corner(tx, ty + 1);
                if (!sw[2] && !ne[2]) {
                    continue;
                }
                if (grid.isSolid(tx, ty)) {
                    ctx.fillStyle =
                        flags & CollisionFlag.FLOOR
                            ? "rgba(0, 120, 255, 0.35)"
                            : "rgba(255, 0, 0, 0.35)";
                    // Objects only block part of their tile
                    const { x0, y0, x1, y1 } = grid.getSolidBox(tx, ty, box);
                    const bsw = corner(x0, y0);
                    const bse = corner(x1, y0);
                    const bne = corner(x1, y1);
                    const bnw = corner(x0, y1);
                    ctx.beginPath();
                    ctx.moveTo(bsw[0], bsw[1]);
                    ctx.lineTo(bse[0], bse[1]);
                    ctx.lineTo(bne[0], bne[1]);
                    ctx.lineTo(bnw[0], bnw[1]);
                    ctx.closePath();
                    ctx.fill();
                    continue;
                }
                ctx.strokeStyle = "#ffff00";
                ctx.beginPath();
                if (flags & CollisionFlag.WALL_NORTH) {
                    ctx.moveTo(nw[0], nw[1]);
                    ctx.lineTo(ne[0], ne[1]);
                }
                if (flags & CollisionFlag.WALL_SOUTH) {
                    ctx.moveTo(sw[0], sw[1]);
                    ctx.lineTo(se[0], se[1]);
                }
                if (flags & CollisionFlag.WALL_EAST) {
                    ctx.moveTo(se[0], se[1]);
                    ctx.lineTo(ne[0], ne[1]);
                }
                if (flags & CollisionFlag.WALL_WEST) {
                    ctx.moveTo(sw[0], sw[1]);
                    ctx.lineTo(nw[0], nw[1]);
                }
                ctx.stroke();
            }
        }
    }
}
