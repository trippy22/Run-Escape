import { MAP_BY_ID } from "../../content/maps";
import { GameStore } from "../GameStore";
import {
    ClientMessage,
    DownMessage,
    GameStart,
    GoneReason,
    Loadout,
    Member,
    MissingMap,
    RoomListing,
    RoomView,
    ServerMessage,
    UpMessage,
} from "./protocol";

// The co-op menus' view of things, for the UI
export type CoopView = {
    status: "offline" | "connecting" | "online";
    // Why the last thing didn't work, shown until the next try
    error?: string;
    // Open rooms to join, while not in one: a page of them, which one, of
    // how many, and how many rooms in all
    rooms: RoomListing[];
    roomsPage: number;
    roomsPages: number;
    roomsTotal: number;
    // No room for another one on the relay until one goes
    roomsFull: boolean;
    room?: RoomView;
    // This player's id in the room
    you?: string;
    // This player's name, given by the relay on connecting ("" till then)
    name: string;
    // There's a relay to play co-op through (the game only offers it then);
    // undefined until it's been asked
    available?: boolean;
    // The relay lets players into rooms on maps they haven't unlocked
    anyMap: boolean;
    draining: boolean;
    endlessDeadline?: number;
};

export const OFFLINE: CoopView = {
    status: "offline",
    rooms: [],
    roomsPage: 0,
    roomsPages: 1,
    roomsTotal: 0,
    roomsFull: false,
    name: "",
    anyMap: false,
    draining: false,
};

// How long to wait for the relay to say it's there
const AVAILABLE_TIMEOUT_MS = 4000;

const LIST_INTERVAL_MS = 5000;
const PING_INTERVAL_MS = 15_000;

const GONE_TEXT: Record<GoneReason, string> = {
    left: "",
    kicked: "The host removed you from the party.",
    disbanded: "The host disbanded the party.",
    hostLeft: "The host left, so the party's over.",
    idle: "The room closed after half an hour with nothing happening.",
};

// Where the relay is: VITE_COOP_URL when the build gives one, otherwise
// coop beside the page (the dev server's, or one a host puts there)
function getRelayUrl(): string {
    const configured = import.meta.env.VITE_COOP_URL as string | undefined;
    if (configured) {
        return configured;
    }
    const url = new URL("coop", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.search = "";
    url.hash = "";
    return url.toString();
}

// The relay's address over plain HTTP, which answers whether it's there
function getStatusUrl(): string {
    const url = new URL(getRelayUrl());
    url.protocol = url.protocol === "wss:" ? "https:" : "http:";
    return url.toString();
}

// Room codes are this long (the relay makes them)
export const ROOM_CODE_LENGTH = 8;

// A room code from what was typed or pasted: the code, or an invite link
// with it (https://example.com/?room=ABCDEFGH)
export function parseRoomCode(text: string): string {
    const code = /[?&]room=([A-Za-z0-9]+)/.exec(text)?.[1] ?? text;
    return code
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
        .slice(0, ROOM_CODE_LENGTH);
}

// What's missing for a room's map, by the map's name
export function describeMissing(need: MissingMap): string {
    const map = MAP_BY_ID.get(need.mapId);
    const what = `${map?.name ?? need.mapId}${need.endless ? " endless" : ""}`;
    return need.who
        ? `${need.who} hasn't got ${what} unlocked.`
        : `You need ${what} unlocked to join this room.`;
}

// The connection to the co-op relay, and the room this player is in. What
// the room's run does goes to whoever's set the on* handlers (GameClient).
export class CoopLobby {
    private socket?: WebSocket;
    private listTimer?: number;
    private pingTimer?: number;
    private view: CoopView;
    // What this player looks like to the room, sent on joining and on change
    private me: Partial<Member> = {};
    private runId?: string;

    onStart?: (game: GameStart) => void;
    onUp?: (from: string, message: UpMessage) => void;
    onDown?: (message: DownMessage) => void;
    onLeft?: (id: string) => void;
    onGone?: (reason: GoneReason) => void;
    onClosed?: () => void;
    onMaintenanceExit?: () => boolean;

    constructor(readonly store: GameStore) {
        this.view = OFFLINE;
    }

    get room(): RoomView | undefined {
        return this.view.room;
    }

    get id(): string | undefined {
        return this.view.you;
    }

    get isHost(): boolean {
        return this.view.room !== undefined && this.view.room.hostId === this.view.you;
    }

    get name(): string {
        return this.view.name;
    }

    private update(changes: Partial<CoopView>): void {
        this.view = { ...this.view, ...changes };
        this.store.set({ coop: this.view });
    }

    // Connects, if it isn't, and keeps the list of open rooms fresh while
    // this player's not in one
    connect(): Promise<void> {
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
            return Promise.resolve();
        }
        this.update({ status: "connecting", error: undefined });
        return new Promise((resolve) => {
            let socket: WebSocket;
            try {
                socket = new WebSocket(getRelayUrl());
            } catch (e) {
                this.update({ status: "offline", error: "Couldn't reach the co-op server." });
                resolve();
                return;
            }
            this.socket = socket;
            socket.onmessage = (event) => {
                let message: ServerMessage;
                try {
                    message = JSON.parse(String(event.data));
                } catch {
                    return;
                }
                this.receive(message);
                if (message.t === "welcome") {
                    resolve();
                }
            };
            socket.onclose = () => {
                if (this.socket !== socket) {
                    return;
                }
                const wasOnline = this.view.status === "online";
                this.socket = undefined;
                this.runId = undefined;
                this.stopTimers();
                this.update({
                    status: "offline",
                    draining: false,
                    endlessDeadline: undefined,
                    room: undefined,
                    you: undefined,
                    // A new one comes with the next connection
                    name: "",
                    rooms: [],
                    roomsPage: 0,
                    error: wasOnline
                        ? "Lost the connection to the co-op server."
                        : "Couldn't reach the co-op server.",
                });
                this.onClosed?.();
                resolve();
            };
        });
    }

    close(): void {
        const socket = this.socket;
        this.socket = undefined;
        this.runId = undefined;
        this.stopTimers();
        socket?.close();
        this.update({
            status: "offline",
            draining: false,
            endlessDeadline: undefined,
            room: undefined,
            you: undefined,
            name: "",
            rooms: [],
            roomsPage: 0,
        });
    }

    private stopTimers(): void {
        window.clearInterval(this.listTimer);
        window.clearInterval(this.pingTimer);
        this.listTimer = this.pingTimer = undefined;
    }

    private send(message: ClientMessage): void {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    private receive(message: ServerMessage): void {
        switch (message.t) {
            case "welcome":
                this.update({
                    status: "online",
                    you: message.id,
                    name: message.name,
                    error: undefined,
                    available: true,
                    anyMap: message.anyMap === true,
                    draining: message.draining === true,
                    endlessDeadline: message.endlessDeadline,
                });
                this.refresh();
                this.listTimer = window.setInterval(() => {
                    if (!this.view.room) {
                        this.refresh();
                    }
                }, LIST_INTERVAL_MS);
                this.pingTimer = window.setInterval(
                    () => this.send({ t: "ping" }),
                    PING_INTERVAL_MS,
                );
                break;
            case "maintenance":
                this.update({
                    draining: message.draining,
                    endlessDeadline: message.endlessDeadline,
                });
                this.store.toast(
                    message.draining
                        ? message.endlessDeadline
                            ? `Endless runs will end for maintenance at ${new Date(message.endlessDeadline).toLocaleTimeString()}. Earned progress will be kept.`
                            : "Server maintenance is pending. Your current run can finish."
                        : "Server maintenance cancelled. New runs are available again.",
                    8000,
                );
                break;
            case "maintenanceExit":
                if (message.runId === this.runId && this.onMaintenanceExit?.()) this.finished();
                break;
            case "named":
                this.update({ name: message.name });
                break;
            case "rooms":
                this.update({
                    rooms: message.rooms,
                    roomsPage: message.page,
                    roomsPages: message.pages,
                    roomsTotal: message.total,
                    roomsFull: message.full === true,
                });
                break;
            case "room":
                this.update({ room: message.room, you: message.you, error: undefined });
                break;
            case "gone":
                this.runId = undefined;
                this.update({ room: undefined, error: GONE_TEXT[message.reason] || undefined });
                this.refresh();
                this.onGone?.(message.reason);
                break;
            case "error":
                this.update({
                    error: message.need ? describeMissing(message.need) : message.message,
                });
                // A listed room that's filled up or started since: off the list
                if (!this.view.room) {
                    this.refresh();
                }
                break;
            case "start":
                this.runId = message.runId;
                this.onStart?.(message.game);
                break;
            case "up":
                this.onUp?.(message.from, message.d);
                break;
            case "down":
                this.onDown?.(message.d);
                break;
            case "left":
                this.onLeft?.(message.id);
                break;
        }
    }

    // Asks whether there's a relay, for whether to offer co-op at all: none
    // when the server runs without one or a host doesn't run it
    async checkAvailable(): Promise<boolean> {
        let available = false;
        try {
            const response = await fetch(getStatusUrl(), {
                cache: "no-store",
                signal: AbortSignal.timeout(AVAILABLE_TIMEOUT_MS),
            });
            const status = response.ok ? await response.json() : undefined;
            available = status?.coop === true;
        } catch {
            available = false;
        }
        this.update({ available });
        return available;
    }

    // The open rooms again: this page of them (the one shown, by default)
    refresh(page = this.view.roomsPage): void {
        this.send({ t: "list", page: Math.max(0, page) });
    }

    // Asks the relay for another name
    rename(): void {
        this.send({ t: "rename" });
    }

    // This player's adventurer and what they bring, kept up to date
    setMe(changes: Partial<Member>): void {
        this.me = { ...this.me, ...changes };
        if (this.view.room) {
            this.send({ t: "me", ...changes });
        }
    }

    create(open: boolean, mapId: string, endless: boolean): void {
        this.update({ error: undefined });
        this.send({ t: "create", open, mapId, endless, me: this.joinAs() });
    }

    join(code: string): void {
        const clean = parseRoomCode(code);
        if (!clean) {
            return;
        }
        this.update({ error: undefined });
        this.send({ t: "join", code: clean, me: this.joinAs() });
    }

    private joinAs(): Partial<Member> {
        return { ...this.me, ready: false, build: __BUILD_ID__ };
    }

    leave(): void {
        this.runId = undefined;
        this.send({ t: "leave" });
        this.update({ room: undefined });
    }

    setReady(ready: boolean): void {
        this.setMe({ ready });
    }

    // The host's
    setOpen(open: boolean): void {
        this.send({ t: "settings", open });
    }

    setMap(mapId: string, endless: boolean): void {
        this.send({ t: "settings", mapId, endless });
    }

    kick(id: string): void {
        this.send({ t: "kick", id });
    }

    disband(): void {
        this.send({ t: "disband" });
    }

    start(game: GameStart): void {
        this.send({ t: "start", game });
    }

    // Back in the lobby after a run
    end(): void {
        this.send({ t: "end" });
    }

    // Called after the final frame has been sent/applied and results recorded.
    finished(): void {
        if (this.runId) {
            this.send({ t: "finished", runId: this.runId });
            this.runId = undefined;
        }
    }

    sendUp(message: UpMessage): void {
        this.send({ t: "up", d: message });
    }

    sendDown(message: DownMessage): void {
        this.send({ t: "down", d: message });
    }

    clearError(): void {
        this.update({ error: undefined });
    }
}

export function makeLoadout(
    metaStats: Record<string, number>,
    unlockedItems: string[],
    armoury: Record<string, number>,
): Loadout {
    // Only what's been bought, so it stays small
    const bought = Object.fromEntries(Object.entries(metaStats).filter(([, value]) => value !== 0));
    return { metaStats: bought, unlockedItems, armoury };
}
