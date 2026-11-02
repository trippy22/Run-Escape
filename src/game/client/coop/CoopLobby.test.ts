// @vitest-environment jsdom
import { MAX_LOADOUT_BYTES } from "../../../../server/coop-relay.mjs";
import { getUpgradeLine } from "../../content/armoury";
import { CASKET_GEAR } from "../../content/items";
import { SHOP_UPGRADES } from "../../content/shop";
import { LOCKABLE_ITEMS } from "../../content/unlocks";
import { createSave } from "../../core/save";
import { GameStore } from "../GameStore";
import { CoopLobby, makeLoadout, parseRoomCode } from "./CoopLobby";
import { ServerMessage } from "./protocol";

describe("maintenance protocol", () => {
    it("only acknowledges the current run, after its maintenance exit succeeds", () => {
        const lobby = new CoopLobby(new GameStore(createSave()));
        const send = vi.fn();
        Object.assign(lobby, { socket: { readyState: WebSocket.OPEN, send } });
        const receive = (message: object) =>
            (lobby as unknown as { receive(m: ServerMessage): void }).receive(
                message as ServerMessage,
            );
        receive({ t: "start", runId: "2", game: {} });
        lobby.onMaintenanceExit = vi.fn(() => false);
        receive({ t: "maintenanceExit", runId: "1" });
        expect(lobby.onMaintenanceExit).not.toHaveBeenCalled();
        receive({ t: "maintenanceExit", runId: "2" });
        expect(send).not.toHaveBeenCalled();
        lobby.onMaintenanceExit = vi.fn(() => true);
        receive({ t: "maintenanceExit", runId: "2" });
        expect(send).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ t: "finished", runId: "2" }));
        receive({ t: "maintenanceExit", runId: "2" });
        lobby.finished();
        expect(send).toHaveBeenCalledTimes(1);
        expect(lobby.onMaintenanceExit).toHaveBeenCalledTimes(1);
    });

    it("updates and clears the maintenance notice on cancellation", () => {
        const store = new GameStore(createSave());
        const lobby = new CoopLobby(store);
        const receive = (message: ServerMessage) =>
            (lobby as unknown as { receive(m: ServerMessage): void }).receive(message);
        receive({ t: "maintenance", draining: true, endlessDeadline: Date.now() + 300_000 });
        expect(store.getSnapshot().coop.draining).toBe(true);
        expect(store.getSnapshot().coop.endlessDeadline).toBeDefined();
        receive({ t: "maintenance", draining: false });
        expect(store.getSnapshot().coop.draining).toBe(false);
        expect(store.getSnapshot().coop.endlessDeadline).toBeUndefined();
    });
});

describe("room codes", () => {
    it("takes the code out of a pasted invite link", () => {
        expect(parseRoomCode("https://example.com/game/?room=NVKDS")).toBe("NVKDS");
        expect(parseRoomCode("http://localhost:5173/?bgtick&room=nvkds#x")).toBe("NVKDS");
    });

    it("tidies up a typed one", () => {
        expect(parseRoomCode(" nv-kds ")).toBe("NVKDS");
        expect(parseRoomCode("ABCDEFGHIJ")).toBe("ABCDEFGH");
        expect(parseRoomCode("")).toBe("");
    });
});

describe("loadouts", () => {
    // The relay drops a loadout over its cap, and the player would play without
    // their shop bonuses and Armoury, so the biggest a save can make (every
    // upgrade bought, every item unlocked, all gear upgraded all the way) keeps
    // well under it. Lots more gear could need the cap raised.
    it("stay well under the relay's cap, even for a save with everything", () => {
        const metaStats: Record<string, number> = {};
        for (const upgrade of SHOP_UPGRADES) {
            metaStats[upgrade.stat] =
                (metaStats[upgrade.stat] ?? 0) + upgrade.perRank * upgrade.maxRank;
        }
        const loadout = makeLoadout(
            metaStats,
            LOCKABLE_ITEMS.map((item) => item.id),
            Object.fromEntries(CASKET_GEAR.map((g) => [g.id, getUpgradeLine(g.id).length - 1])),
        );
        expect(JSON.stringify(loadout).length).toBeLessThan(MAX_LOADOUT_BYTES / 2);
    });
});
