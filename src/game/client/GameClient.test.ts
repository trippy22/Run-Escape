// @vitest-environment jsdom
import { emptyStats } from "../content/types";
import { Sim } from "../core/Sim";
import { createSave } from "../core/save";
import { makeGrid } from "../core/world/testGrid";
import { DisplaySettings, loadDisplaySettings, saveDisplaySettings } from "./DisplaySettings";
import { GameClient } from "./GameClient";
import { GameStore } from "./GameStore";

function createSim(): Sim {
    const row = ".".repeat(72);
    return new Sim({
        grid: makeGrid(Array(72).fill(row), 1000, 1000),
        mapId: "lumbridge",
        characterId: "warrior",
        metaStats: emptyStats(),
        seed: 5,
        spawnX: 1036.5,
        spawnY: 1036.5,
    });
}

// The client's run flow on its own: nothing it draws or plays is needed
function createClient(sim: Sim, autoAlch: boolean) {
    const save = createSave();
    const store = new GameStore(save);
    const client: GameClient = Object.create(GameClient.prototype);
    Object.assign(client, {
        sim,
        save,
        store,
        paused: false,
        shownDps: 0,
        shownDpsTick: 0,
        lastHudUpdate: 0,
        display: { menuSpin: false, pauseOnBlur: true, questTracker: true, autoAlch },
        sounds: { onEvents() {}, levelUp() {}, playerDied() {} },
        view: { onEvents() {} },
        finishRun() {},
    });
    const sync = () => {
        (client as unknown as { syncOverlay(): void }).syncOverlay();
    };
    return { client, store, sync };
}

describe("auto alch", () => {
    test("is off unless it's been turned on, and is remembered", () => {
        const stored = new Map<string, string>();
        vi.stubGlobal("window", {
            matchMedia: () => ({ matches: false }),
            localStorage: {
                getItem: (key: string) => stored.get(key) ?? null,
                setItem: (key: string, value: string) => stored.set(key, value),
            },
        });
        expect(loadDisplaySettings().autoAlch).toBe(false);
        // Settings saved before there was such a thing
        const key = "rune-survivors-display";
        stored.set(key, JSON.stringify({ menuSpin: false }));
        expect(loadDisplaySettings().autoAlch).toBe(false);
        const settings: DisplaySettings = { ...loadDisplaySettings(), autoAlch: true };
        saveDisplaySettings(settings);
        expect(loadDisplaySettings().autoAlch).toBe(true);
        vi.unstubAllGlobals();
    });

    test("turned off, the casket screen comes up as usual", () => {
        const sim = createSim();
        const { store, sync } = createClient(sim, false);
        sim.openCasket("easy");
        sync();
        expect(store.getSnapshot().overlay).toBe("chest");
        expect(store.getSnapshot().chest).toBeDefined();
        expect(sim.state).toBe("chest");
    });

    test("does just what clicking High alch does, without the casket screen", () => {
        const clicked = createSim();
        const auto = createSim();
        const { store, sync } = createClient(auto, true);
        // A piece of a started set: alching another stops the set, too
        for (const sim of [clicked, auto]) {
            sim.equip("torva_full_helm");
            sim.takeEvents();
        }
        for (const tier of ["easy", "hard", "master"] as const) {
            clicked.openCasket(tier);
            clicked.chests[0].itemId = "torva_platebody";
            clicked.resolveChest("alch");
            auto.openCasket(tier);
            auto.chests[0].itemId = "torva_platebody";
            sync();
            expect(store.getSnapshot().overlay).toBe("none");
            expect(store.getSnapshot().chest).toBeUndefined();
            expect(auto.state).toBe("playing");
        }
        expect(auto.coins).toBe(clicked.coins);
        expect(auto.coins).toBeGreaterThan(0);
        expect([...auto.declinedSets]).toEqual(["torva"]);
        expect(auto.getResult()).toEqual(clicked.getResult());
    });

    test("says what was alched, and for how much", () => {
        const sim = createSim();
        const { store, sync } = createClient(sim, true);
        sim.openCasket("easy");
        sim.chests[0].itemId = "torva_platebody";
        const worth = sim.alchValue("torva_platebody", 0);
        sync();
        expect(store.getSnapshot().toasts.map((t) => t.text)).toEqual([
            `High alched Torva platebody for ${worth.toLocaleString()} coins`,
        ]);
    });

    test("takes several caskets in a row, then carries on", () => {
        const sim = createSim();
        const { store, sync } = createClient(sim, true);
        sim.openCasket("easy");
        sim.openCasket("medium");
        sim.openCasket("hard");
        expect(sim.chests.length).toBe(3);
        sync();
        expect(sim.chests.length).toBe(0);
        expect(sim.casketsOpened).toBe(3);
        expect(sim.state).toBe("playing");
        expect(store.getSnapshot().overlay).toBe("none");
        expect(store.getSnapshot().toasts.length).toBe(3);
    });

    test("leaves a level up that came in on its screen", () => {
        const sim = createSim();
        const { store, sync } = createClient(sim, true);
        sim.openCasket("easy");
        sim.xp = sim.xpForNextLevel;
        sync();
        expect(sim.chests.length).toBe(0);
        expect(sim.state).toBe("levelUp");
        expect(store.getSnapshot().overlay).toBe("levelUp");
    });

    test("waits for an open level up, then alchs the casket", () => {
        const sim = createSim();
        const { client, store, sync } = createClient(sim, true);
        sim.xp = sim.xpForNextLevel;
        sim.step(0, 0);
        expect(sim.state).toBe("levelUp");
        sync();
        const coins = sim.coins;
        sim.openCasket("easy");
        const opened = sim.coins;
        expect(opened).toBeGreaterThanOrEqual(coins);
        sync();
        // The level up is still there, and the casket's waiting
        expect(store.getSnapshot().overlay).toBe("levelUp");
        expect(sim.chests.length).toBe(1);
        client.choose(0);
        expect(sim.chests.length).toBe(0);
        expect(sim.coins).toBeGreaterThan(opened);
        expect(store.getSnapshot().overlay).toBe("none");
    });

    test("a casket the run ended on is left, as it is with the screen", () => {
        const sim = createSim();
        const { store, sync } = createClient(sim, true);
        sim.openCasket("easy");
        const coins = sim.coins;
        sim.state = "dead";
        sync();
        expect(store.getSnapshot().overlay).toBe("dead");
        expect(sim.chests.length).toBe(1);
        expect(sim.coins).toBe(coins);
    });
});

describe("co-op maintenance", () => {
    it("does not acknowledge a new run while clearing the previous run's results", () => {
        const { client } = createClient(createSim(), false);
        const finished = vi.fn();
        const flush = vi.fn();
        Object.assign(client, {
            coopRun: { flush },
            coopResultsRecorded: true,
            coop: { finished, isHost: true },
            assets: { dropPlayers() {}, setPlayerAppearance() {} },
            audio: { stopMusic() {} },
            grids: { get: () => ({ plane: 0 }) },
            renderer: { setPlane() {}, setSmoothTerrain() {}, setBrightness() {} },
            view: { reset() {} },
            cameraRig: {},
        });
        // beginCoopRun has already received the next run's ID at this point.
        client.leaveRun(false);
        expect(finished).not.toHaveBeenCalled();
        expect(flush).not.toHaveBeenCalled();
    });

    it("records earned progress once without killing players or granting a victory", () => {
        const sim = createSim();
        sim.coins = 123;
        const { client, store } = createClient(sim, false);
        delete (client as unknown as { finishRun?: unknown }).finishRun;
        const persist = vi.fn();
        Object.assign(client, {
            coopRun: {},
            coopResultsRecorded: false,
            coop: { setMe: vi.fn() },
            persist,
            updateHud: vi.fn(),
        });
        const exit = () =>
            (client as unknown as { onCoopMaintenanceExit(): boolean }).onCoopMaintenanceExit();
        expect(exit()).toBe(true);
        expect(persist).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot().result).toMatchObject({
            coins: 123,
            endedEarly: expect.stringContaining("maintenance"),
        });
        expect(sim.runOver).toBe(false);
        const result = store.getSnapshot().result;
        expect(exit()).toBe(true);
        expect(persist).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot().result).toBe(result);
    });

    it.each([true, false])(
        "flushes the final frames before acknowledging a saved run (host=%s)",
        (isHost) => {
            const sim = createSim();
            sim.state = "dead";
            const { client } = createClient(sim, false);
            const events: string[] = [];
            const run = {
                isHost,
                behind: 0,
                canStep: () => false,
                setMove: vi.fn(),
                flush: () => events.push("flush"),
            };
            Object.assign(client, {
                coop: { finished: () => events.push("finished") },
                input: { getMoveVector: () => ({ x: 0, y: 0 }) },
                accumulator: 0,
                coopResultsRecorded: false,
                getDecisionKey: () => "unchanged",
                decisionKey: "unchanged",
            });
            const update = () =>
                (
                    client as unknown as { updateCoop(delta: number, sim: Sim, run: unknown): void }
                ).updateCoop(0, sim, run);
            update();
            expect(events).toEqual(["flush"]);
            Object.assign(client, { coopResultsRecorded: true });
            update();
            expect(events).toEqual(["flush", "flush", "finished"]);
        },
    );

    it("cancels a loading run before acknowledging and leaves recorded results intact", () => {
        const { client, store } = createClient(createSim(), false);
        Object.assign(client, { coopInbox: [vi.fn()], coopRun: undefined });
        const exit = () =>
            (client as unknown as { onCoopMaintenanceExit(): boolean }).onCoopMaintenanceExit();
        expect(exit()).toBe(true);
        expect((client as unknown as { coopInbox?: unknown }).coopInbox).toBeUndefined();
        Object.assign(client, { coopRun: {}, coopResultsRecorded: true });
        store.set({ overlay: "victory" });
        expect(exit()).toBe(true);
        expect(store.getSnapshot().overlay).toBe("victory");
    });
});
