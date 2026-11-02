// Co-op's relay: players find each other in rooms here, and the host's game
// reaches everyone else through it. It runs no game of its own (every player's
// browser runs the same sim from the same inputs) and keeps nothing once a
// room's empty. Plain Node with no packages, so it runs anywhere Node 20 does:
//
//   node server/coop-relay.mjs            # on port 8787, or PORT
//   PROXY=cloudflare node server/coop-relay.mjs    # behind a proxy (client-ip.mjs)
//
// The dev server and `vite preview` run one too, at /coop (vite.config.ts),
// and so does server/serve.mjs, which serves a build along with it. A plain
// GET of the relay's path says it's there, which is how the game knows to
// offer co-op.
// The messages are JSON; src/game/client/coop/protocol.ts has their shapes.
import { isUtf8 } from "node:buffer";
import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { clientAddress, proxyMode, viaProxy, watchCloudflareRanges } from "./client-ip.mjs";
import { playerName, roomName } from "./name-gen.mjs";
import { createAdminControl } from "./relay-admin.mjs";

export const RELAY_PATH = "/coop";

// Whether a server that has the relay in it (serve.mjs, and the dev and
// preview servers) runs it. On unless it's turned off: MULTIPLAYER=off, the
// :singleplayer npm scripts, or --no-multiplayer. Off, the game hides co-op.
export function isMultiplayerOn(env = process.env, argv = process.argv) {
    return !(
        ["off", "0", "false", "no"].includes((env.MULTIPLAYER ?? "").trim().toLowerCase()) ||
        (env.npm_lifecycle_event ?? "").endsWith(":singleplayer") ||
        argv.includes("--no-multiplayer")
    );
}

// Aggregate counts on a separate loopback listener, on by default. Nothing is kept on disk.
export function isMetricsOn(env = process.env) {
    return ["true", "on", "1"].includes((env.MULTIPLAYER_METRICS ?? "true").trim().toLowerCase());
}

export function metricsPortSetting(env = process.env) {
    const value = env.MULTIPLAYER_METRICS_PORT;
    if (value === undefined || value.trim() === "") {
        return 8788;
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        console.warn(`MULTIPLAYER_METRICS_PORT "${value}" isn't a valid port: taking 8788.`);
        return 8788;
    }
    return port;
}

// Whether players can join rooms on maps they haven't unlocked (and so open
// them by winning there): MULTIPLAYER_ANY_MAP=on or --any-map. Off by default, so nobody
// skips ahead: a room only takes players with its map unlocked (and its
// endless, for an endless room), and the host can only pick maps everyone in
// it has. Each player's game says which maps it has; with no accounts that's
// its word, so this keeps fair players fair rather than stopping a cheat.
export function isAnyMapOn(env = process.env, argv = process.argv) {
    return (
        ["on", "1", "true"].includes((env.MULTIPLAYER_ANY_MAP ?? "").toLowerCase()) ||
        argv.includes("--any-map")
    );
}

// Rooms on the relay at once: MULTIPLAYER_MAX_ROOMS=1000 or --max-rooms=1000,
// or MAX_ROOMS. Each room of four is about 12 KB/s each way through the relay.
export function maxRoomsSetting(env = process.env, argv = process.argv) {
    const flag = argv.find((arg) => arg.startsWith("--max-rooms="))?.slice("--max-rooms=".length);
    const value = flag ?? env.MULTIPLAYER_MAX_ROOMS;
    if (value === undefined || value.trim() === "") {
        return MAX_ROOMS;
    }
    const rooms = Number(value);
    if (!Number.isInteger(rooms) || rooms < 1) {
        console.warn(
            `MULTIPLAYER_MAX_ROOMS "${value}" isn't a whole number of rooms: taking ${MAX_ROOMS}.`,
        );
        return MAX_ROOMS;
    }
    return rooms;
}

const MAX_PARTY = 4;
// No game has more maps than this
const MAX_UNLOCKED_MAPS = 200;
// Rooms on the relay at once unless the server sets it (see maxRoomsSetting);
// past that, a new one waits for one to go
const MAX_ROOMS = 500;
// Limits on each address (see client-ip.mjs for who a connection's from), so
// one machine can't take the relay over. Generous enough for a household or
// a LAN party behind one address.
const MAX_CONNECTIONS_PER_ADDRESS = 16;
const MAX_ROOMS_PER_ADDRESS = 4;
const MAX_CREATES_PER_MINUTE = 10;
// Joining's a room update for everyone in it, and so's leaving: enough to look
// round a few rooms, not enough to flood one by going in and out
const MAX_JOINS_PER_MINUTE = 12;
// Connections in all, below a server's usual limit of 1,024 open files
const MAX_CONNECTIONS = 800;
// A connection that's in no room and has done nothing for this long is closed
// (a room left alone goes by IDLE_MS)
const IDLE_CONNECTION_MS = 10 * 60_000;
// Room codes that don't exist, tried from one address, before it has to wait
const MAX_WRONG_CODES_PER_MINUTE = 20;
// A room nobody's done anything in for this long is closed
const IDLE_MS = 30 * 60_000;
// Bigger than any real loadout (the shop's bonuses, unlocked items and
// Armoury); a bigger one is dropped rather than sent round the room
export const MAX_LOADOUT_BYTES = 16 * 1024;
const FULL_TEXT = "All rooms are taken right now. Try again when one opens.";
const OTHER_BUILD_TEXT =
    "That room's on another version of the game. Reload the page to get the latest.";
// The open rooms list comes a page at a time: this many to a page unless the
// game asks for another size, up to the most
const LIST_PAGE_SIZE = 8;
const MAX_LIST_PAGE_SIZE = 20;
// Bigger than any message the game sends (a start with everyone's loadout)
const MAX_MESSAGE_BYTES = 256 * 1024;
// A client sending more than this many frames a second is dropped
const MAX_FRAMES_PER_SECOND = 400;
// Or this many bytes: twice the biggest message, far above what a game sends
const MAX_BYTES_PER_SECOND = 2 * MAX_MESSAGE_BYTES;
// A player's inputs for the host, which are tiny and about 15 a second: more
// or bigger than this goes no further
const MAX_UP_BYTES = 1024;
const MAX_UPS_PER_SECOND = 60;
// What a player says about themselves: a loadout and unlocks at their limits
const MAX_ME_BYTES = 40 * 1024;
// A message in more pieces than this isn't from a browser
const MAX_FRAGMENTS = 16;
// Deeper than anything the game sends; JSON.stringify of a much deeper one
// runs out of stack
const MAX_DEPTH = 16;
// What can wait to go out to one connection before it's dropped: a player
// whose game has stopped reading would otherwise grow the relay's memory
const MAX_BUFFERED_BYTES = 1024 * 1024;
const PING_MS = 20_000;
// How often a room hears what its players say about themselves, however often
// they say it: one player can't flood the rest off a slow line
const MEMBER_UPDATE_MS = 250;
// Room codes leave out letters and digits that look alike
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Long enough that no number of addresses can guess one
const CODE_LENGTH = 8;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

// ---- WebSocket (RFC 6455): just what browsers send ----

class Connection {
    constructor(socket, onMessage, onClose, bytesPerSecond = MAX_BYTES_PER_SECOND) {
        this.socket = socket;
        this.onMessage = onMessage;
        this.onClose = onClose;
        // What's come in and not been read yet, and how much of it the next
        // frame needs: pieces are only joined once there's a whole frame, so a
        // frame sent a byte at a time costs no more than one sent at once
        this.chunks = [];
        this.buffered = 0;
        this.need = 2;
        // A message in pieces (continuation frames), and its size so far
        this.fragments = [];
        this.fragmentBytes = 0;
        this.closed = false;
        this.alive = true;
        this.second = 0;
        this.framesThisSecond = 0;
        this.bytesThisSecond = 0;
        this.bytesPerSecond = bytesPerSecond;
        socket.setNoDelay(true);
        socket.on("data", (data) => this.receive(data));
        socket.on("close", () => this.finish());
        socket.on("error", () => this.finish());
        // The other end's gone without a close frame: nothing to wait for
        socket.on("end", () => socket.destroy());
    }

    receive(data) {
        if (this.closed) {
            return;
        }
        this.startSecond();
        this.bytesThisSecond += data.length;
        if (this.bytesThisSecond > this.bytesPerSecond) {
            this.close(1008);
            return;
        }
        this.chunks.push(data);
        this.buffered += data.length;
        if (this.buffered < this.need) {
            return;
        }
        const buffer = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
        let at = 0;
        while (!this.closed) {
            const frame = this.readFrame(buffer, at);
            if (typeof frame === "number") {
                this.need = frame;
                break;
            }
            at = frame.end;
            this.handleFrame(frame);
        }
        const rest = buffer.subarray(at);
        this.chunks = rest.length > 0 ? [rest] : [];
        this.buffered = rest.length;
    }

    // The frame starting at `at`, or how many bytes from there it needs
    // before it's whole (closing the connection on one no browser sends)
    readFrame(buffer, at) {
        const available = buffer.length - at;
        if (available < 2) {
            return 2;
        }
        const first = buffer[at];
        const second = buffer[at + 1];
        const fin = (first & 0x80) !== 0;
        const opcode = first & 0x0f;
        const short = second & 0x7f;
        const header = 2 + (short === 126 ? 2 : short === 127 ? 8 : 0) + 4;
        if (available < header) {
            return header;
        }
        let length = short;
        if (short === 126) {
            length = buffer.readUInt16BE(at + 2);
        } else if (short === 127) {
            const big = buffer.readBigUInt64BE(at + 2);
            length = big > BigInt(MAX_MESSAGE_BYTES) ? Infinity : Number(big);
        }
        // Browsers always mask, never set the extension bits (none are agreed
        // on), and keep control frames whole and small
        const control = (opcode & 0x08) !== 0;
        if ((second & 0x80) === 0 || (first & 0x70) !== 0 || (control && (!fin || length > 125))) {
            this.close(1002);
            return 0;
        }
        if (length > MAX_MESSAGE_BYTES) {
            this.close(1009);
            return 0;
        }
        if (available < header + length) {
            return header + length;
        }
        const mask = buffer.subarray(at + header - 4, at + header);
        const payload = Buffer.from(buffer.subarray(at + header, at + header + length));
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i & 3];
        }
        return { fin, opcode, payload, end: at + header + length };
    }

    handleFrame({ fin, opcode, payload }) {
        // Every frame counts, so empty ones can't be sent for nothing
        if (this.overLimit()) {
            this.close(1008);
            return;
        }
        switch (opcode) {
            case 0x0:
            case 0x1: {
                // A continuation with nothing to continue, or a new message
                // before the last one's finished
                const continuing = this.fragments.length > 0;
                if ((opcode === 0x0) !== continuing) {
                    this.close(1002);
                    return;
                }
                if (opcode === 0x1 && fin) {
                    // The whole message in one frame, as nearly all are
                    this.receiveMessage(payload);
                    return;
                }
                this.fragments.push(payload);
                this.fragmentBytes += payload.length;
                if (
                    this.fragmentBytes > MAX_MESSAGE_BYTES ||
                    this.fragments.length > MAX_FRAGMENTS
                ) {
                    this.close(1009);
                    return;
                }
                if (fin) {
                    const whole = Buffer.concat(this.fragments, this.fragmentBytes);
                    this.fragments = [];
                    this.fragmentBytes = 0;
                    this.receiveMessage(whole);
                }
                return;
            }
            case 0x8:
                this.close(1000);
                return;
            case 0x9:
                this.sendFrame(0xa, payload);
                return;
            case 0xa:
                this.alive = true;
                return;
            default:
                // Binary and anything else: not something the game sends
                this.close(1003);
        }
    }

    // A whole message: its JSON, with the bytes it came as (to pass on as they
    // are, rather than encoding it again). Anything wrong with one drops this
    // connection, never the relay.
    receiveMessage(payload) {
        // Passed on as it is, so it has to be text a browser will take
        if (!isUtf8(payload)) {
            this.close(1007);
            return;
        }
        let message;
        try {
            message = JSON.parse(payload.toString("utf8"));
        } catch {
            return;
        }
        if (!message || typeof message !== "object" || Array.isArray(message)) {
            return;
        }
        // The host's frames go straight on, and are the only ones sent often
        if (message.t !== "down" && depthOver(payload, MAX_DEPTH)) {
            this.close(1008);
            return;
        }
        try {
            this.onMessage(message, payload);
        } catch (e) {
            console.warn("Co-op relay: dropped a connection over a message it couldn't handle:", e);
            this.close(1011);
        }
    }

    startSecond() {
        const second = Math.floor(Date.now() / 1000);
        if (second !== this.second) {
            this.second = second;
            this.framesThisSecond = 0;
            this.bytesThisSecond = 0;
        }
    }

    overLimit() {
        this.startSecond();
        return ++this.framesThisSecond > MAX_FRAMES_PER_SECOND;
    }

    sendFrame(opcode, payload) {
        this.write(encodeFrame(opcode, payload));
    }

    // A frame from encodeFrame, which can go to any number of connections
    write(frame) {
        if (this.closed) {
            return;
        }
        if (this.socket.writableLength > MAX_BUFFERED_BYTES) {
            // Not reading what it's sent: nothing more will get through
            this.socket.destroy();
            this.finish();
            return;
        }
        this.socket.write(frame);
    }

    send(message) {
        this.sendFrame(0x1, Buffer.from(JSON.stringify(message), "utf8"));
    }

    ping() {
        if (!this.alive) {
            // Nothing back since the last ping
            this.close(1001);
            return;
        }
        this.alive = false;
        this.sendFrame(0x9, Buffer.alloc(0));
    }

    close(code) {
        if (this.closed) {
            return;
        }
        const payload = Buffer.alloc(2);
        payload.writeUInt16BE(code, 0);
        this.sendFrame(0x8, payload);
        this.closed = true;
        this.socket.end();
        // However it's going, it's gone in a few seconds
        setTimeout(() => this.socket.destroy(), 5000).unref?.();
        this.finish();
    }

    finish() {
        this.closed = true;
        this.chunks = [];
        this.fragments = [];
        if (this.onClose) {
            const onClose = this.onClose;
            this.onClose = undefined;
            onClose();
        }
    }
}

// Whether JSON nests deeper than max (a byte scan, so it can't run out of
// stack however deep it goes)
function depthOver(payload, max) {
    let depth = 0;
    let inString = false;
    for (let i = 0; i < payload.length; i++) {
        const c = payload[i];
        if (inString) {
            if (c === 0x5c) {
                i++;
            } else if (c === 0x22) {
                inString = false;
            }
        } else if (c === 0x22) {
            inString = true;
        } else if (c === 0x7b || c === 0x5b) {
            if (++depth > max) {
                return true;
            }
        } else if (c === 0x7d || c === 0x5d) {
            depth--;
        }
    }
    return false;
}

// Turns an upgrade away and lets go of its socket, whether or not the other
// end closes its side (one that doesn't would hold it open for good)
function refuse(socket, status) {
    socket.on("error", () => socket.destroy());
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`, () =>
        socket.destroy(),
    );
    setTimeout(() => socket.destroy(), 1000).unref?.();
}

// The path of a request's URL, or undefined for one that isn't a URL
export function requestPath(req) {
    try {
        return new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
        return undefined;
    }
}

// Who limits count against: an IPv6 address by its /64, which is what one
// home or server is given, so it can't just move along its own block
export function addressKey(address) {
    if (isIP(address) !== 6) {
        return address;
    }
    const groups = (part) => (part ? part.split(":") : []);
    const [head, tail] = address.toLowerCase().split("::");
    const before = groups(head);
    const after = groups(tail);
    const all =
        tail === undefined
            ? before
            : [
                  ...before,
                  ...Array(Math.max(0, 8 - before.length - after.length)).fill("0"),
                  ...after,
              ];
    return `${all
        .slice(0, 4)
        .map((group) => parseInt(group, 16).toString(16))
        .join(":")}::/64`;
}

// Who's guessing room codes: an address, or an IPv6 /48, which one person can
// easily have 65,536 /64s of
export function guesserKey(address) {
    return address.endsWith("::/64") ? `${address.split(":").slice(0, 3).join(":")}::/48` : address;
}

// A whole, unmasked frame (as a server sends them), header and payload in
// one buffer
function encodeFrame(opcode, payload) {
    const length = payload.length;
    const headerLength = length < 126 ? 2 : length < 65536 ? 4 : 10;
    const frame = Buffer.allocUnsafe(headerLength + length);
    frame[0] = 0x80 | opcode;
    if (length < 126) {
        frame[1] = length;
    } else if (length < 65536) {
        frame[1] = 126;
        frame.writeUInt16BE(length, 2);
    } else {
        frame[1] = 127;
        frame.writeBigUInt64BE(BigInt(length), 2);
    }
    payload.copy(frame, headerLength);
    return frame;
}

// A message as it came (a JSON object), with one more field put last, so it
// wins over any field of that name already in it (JSON.parse keeps the last)
function withField(payload, name, value) {
    let end = payload.length - 1;
    while (end > 0 && payload[end] !== 0x7d) {
        end--;
    }
    return Buffer.concat([
        payload.subarray(0, end),
        Buffer.from(`,${JSON.stringify(name)}:${JSON.stringify(value)}}`, "utf8"),
    ]);
}

function acceptKey(key) {
    return createHash("sha1")
        .update(key + WS_GUID)
        .digest("base64");
}

// ---- Rooms ----

// The maps a player's game says it has unlocked, and has endless for
function cleanUnlocks(unlocks) {
    const list = (ids) =>
        Array.isArray(ids) ? ids.slice(0, MAX_UNLOCKED_MAPS).map(cleanId).filter(Boolean) : [];
    return { maps: list(unlocks?.maps), endless: list(unlocks?.endless) };
}

function hasUnlocked(unlocks, mapId, endless) {
    return unlocks.maps.includes(mapId) && (!endless || unlocks.endless.includes(mapId));
}

// A whole number from a message, kept within min and max
function clampInt(value, min, max, fallback) {
    const n = Number.isInteger(value) ? value : fallback;
    return Math.max(min, Math.min(max, n));
}

function cleanId(id) {
    return typeof id === "string" ? id.replace(/[^a-z0-9_]/g, "").slice(0, 40) : "";
}

// limits: any of the relay's limits to change (the tests' tighter or looser
// ones); the rest are as above
export function createRelay(limits = {}) {
    const {
        maxRooms = maxRoomsSetting(),
        connectionsPerAddress = MAX_CONNECTIONS_PER_ADDRESS,
        roomsPerAddress = MAX_ROOMS_PER_ADDRESS,
        createsPerMinute = MAX_CREATES_PER_MINUTE,
        wrongCodesPerMinute = MAX_WRONG_CODES_PER_MINUTE,
        joinsPerMinute = MAX_JOINS_PER_MINUTE,
        maxConnections = MAX_CONNECTIONS,
        bytesPerSecond = MAX_BYTES_PER_SECOND,
        idleConnectionMs = IDLE_CONNECTION_MS,
        memberUpdateMs = MEMBER_UPDATE_MS,
        idleMs = IDLE_MS,
        // The proxy in front (see client-ip.mjs), as the server's set it
        proxy = proxyMode(),
        // Rooms take players without their map (see isAnyMapOn)
        anyMap = isAnyMapOn(),
        metrics = isMetricsOn(),
        metricsPort = metricsPortSetting(),
        admin = process.platform !== "win32",
    } = limits;
    // Behind Cloudflare, its addresses, fetched from its API
    const stopCloudflare = proxy === "cloudflare" ? watchCloudflareRanges() : () => {};
    let warnedProxy = false;
    const rooms = new Map();
    const clients = new Set();
    // Only connection, room creation and run start events update these.
    // Live counts come from the rooms when asked, never from game traffic.
    const counters = metrics
        ? {
              startedAt: performance.now(),
              connections: 0,
              roomsCreated: 0,
              runsStarted: 0,
              peakPlayers: 0,
              peakRooms: 0,
          }
        : undefined;
    let metricsServer;
    let stopMetrics = () => {};
    let adminControl;
    let draining = false;
    let nextRunId = 1;
    let endlessGraceSeconds;
    let endlessDeadline;
    let endlessTimer;

    function getDrainStatus() {
        let activeRuns = 0;
        let pendingPlayers = 0;
        let endlessRuns = 0;
        for (const room of rooms.values()) {
            if (room.run?.pending.size) {
                activeRuns++;
                pendingPlayers += room.run.pending.size;
                if (room.run.endless) endlessRuns++;
            }
        }
        return {
            draining,
            ready: draining && activeRuns === 0,
            activeRuns,
            endlessRuns,
            pendingPlayers,
            rooms: rooms.size,
            players: clients.size,
            endlessGraceSeconds: endlessGraceSeconds ?? null,
            endlessDeadline: endlessDeadline ?? null,
        };
    }

    function maintenanceMessage() {
        return { t: "maintenance", draining, endlessDeadline };
    }

    function checkEndlessDrain() {
        if (!draining || !endlessGraceSeconds || endlessDeadline !== undefined) return;
        const status = getDrainStatus();
        if (status.endlessRuns === 0 || status.activeRuns !== status.endlessRuns) return;
        endlessDeadline = Date.now() + endlessGraceSeconds * 1000;
        for (const client of clients) client.connection.send(maintenanceMessage());
        endlessTimer = setTimeout(() => {
            for (const room of rooms.values()) {
                if (!room.run?.endless || !room.run.pending.size) continue;
                room.started = false;
                for (const member of room.members) {
                    member.connection.send({ t: "maintenanceExit", runId: room.run.id });
                }
                broadcastRoom(room);
            }
        }, endlessGraceSeconds * 1000);
        endlessTimer.unref?.();
    }

    function setDraining(value, options = {}) {
        const seconds = options?.endlessGraceSeconds ?? (draining ? endlessGraceSeconds : 300);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400) {
            throw new Error("endlessGraceSeconds must be a whole number from 0 to 86400");
        }
        if (value && draining && seconds !== undefined && seconds !== endlessGraceSeconds) {
            throw new Error("Cancel the current drain before changing the endless grace period");
        }
        if (draining !== value) {
            draining = value;
            clearTimeout(endlessTimer);
            endlessDeadline = undefined;
            endlessGraceSeconds = value ? seconds : undefined;
            for (const client of clients) {
                client.connection.send(maintenanceMessage());
            }
        }
        checkEndlessDrain();
        return getDrainStatus();
    }
    // Every connected player's name, so no two have the same
    const playerNames = new Set();
    let nextId = 1;
    // Connections from each address, and when each made its latest rooms
    const connectionsFrom = new Map();
    const createdFrom = new Map();
    const wrongCodesFrom = new Map();
    const joinedFrom = new Map();
    let nextRoomOrder = 1;
    // The open rooms as the list shows them, worked out again only after a
    // room changes (everyone browsing asks every few seconds)
    let openRooms;

    function metricsText() {
        let lobbyPlayers = 0;
        let playingPlayers = 0;
        let runningRooms = 0;
        let publicRooms = 0;
        for (const room of rooms.values()) {
            if (room.started) {
                runningRooms++;
                playingPlayers += room.members.length;
            } else {
                lobbyPlayers += room.members.length;
            }
            if (room.open) {
                publicRooms++;
            }
        }
        // Prometheus text 0.0.4: fixed names and help, numeric samples only.
        // Each series has HELP and TYPE lines and ends with a newline.
        const metric = (name, help, value, type = "gauge") =>
            `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name} ${value}\n`;
        return [
            metric(
                "coop_draining",
                "Whether new games are blocked for maintenance.",
                Number(draining),
            ),
            metric(
                "coop_drain_ready",
                "Whether maintenance is waiting and all runs have finished.",
                Number(getDrainStatus().ready),
            ),
            metric(
                "coop_uptime_seconds",
                "Seconds since this relay started.",
                Math.floor((performance.now() - counters.startedAt) / 1000),
            ),
            metric("coop_players_connected", "Currently connected player sockets.", clients.size),
            metric(
                "coop_players_browsing",
                "Connected players not in a room.",
                clients.size - lobbyPlayers - playingPlayers,
            ),
            metric("coop_players_lobby", "Players waiting in room lobbies.", lobbyPlayers),
            metric("coop_players_in_run", "Players in started runs.", playingPlayers),
            metric("coop_rooms", "Current rooms, including started runs.", rooms.size),
            metric("coop_rooms_lobby", "Rooms waiting to start a run.", rooms.size - runningRooms),
            metric("coop_rooms_in_run", "Rooms with a started run.", runningRooms),
            metric(
                "coop_rooms_public",
                "Public rooms, including full and started rooms.",
                publicRooms,
            ),
            metric(
                "coop_rooms_private",
                "Invite-only rooms, including started rooms.",
                rooms.size - publicRooms,
            ),
            metric(
                "coop_connections_total",
                "Accepted connections since this relay started.",
                counters.connections,
                "counter",
            ),
            metric(
                "coop_rooms_created_total",
                "Rooms created since this relay started.",
                counters.roomsCreated,
                "counter",
            ),
            metric(
                "coop_runs_started_total",
                "Runs started since this relay started.",
                counters.runsStarted,
                "counter",
            ),
            metric(
                "coop_players_connected_peak",
                "Most simultaneous player sockets since startup.",
                counters.peakPlayers,
            ),
            metric("coop_rooms_peak", "Most simultaneous rooms since startup.", counters.peakRooms),
            metric(
                "coop_connections_limit",
                "Maximum simultaneous connections allowed.",
                maxConnections,
            ),
            metric("coop_rooms_limit", "Maximum simultaneous rooms allowed.", maxRooms),
        ].join("");
    }

    function startMetrics(path) {
        if (!counters || metricsServer) {
            return metricsServer;
        }
        // A local reverse proxy can make public requests look like loopback
        // connections. Keep metrics off the public listener altogether.
        metricsServer = createServer((req, res) => {
            res.setHeader("Cache-Control", "no-store");
            if (requestPath(req) !== `${path}/metrics`) {
                res.writeHead(404);
                res.end();
            } else if (req.method !== "GET" && req.method !== "HEAD") {
                res.writeHead(405, { Allow: "GET, HEAD" });
                res.end();
            } else {
                res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
                res.end(req.method === "HEAD" ? undefined : metricsText());
            }
        });
        const abort = new AbortController();
        stopMetrics = () => {
            abort.abort();
            metricsServer.closeAllConnections();
        };
        metricsServer.on("error", (error) => {
            console.error(
                `Multiplayer metrics unavailable on 127.0.0.1:${metricsPort}: ${error.message}`,
            );
        });
        metricsServer.listen({ host: "127.0.0.1", port: metricsPort, signal: abort.signal }, () => {
            console.log(
                `Multiplayer metrics at http://127.0.0.1:${metricsServer.address().port}${path}/metrics (local only)`,
            );
        });
        metricsServer.unref();
        return metricsServer;
    }

    function newCode() {
        for (;;) {
            let code = "";
            for (let i = 0; i < CODE_LENGTH; i++) {
                code += CODE_CHARS[randomInt(CODE_CHARS.length)];
            }
            if (!rooms.has(code)) {
                return code;
            }
        }
    }

    // What everyone in a room sees of it
    function roomView(room) {
        return {
            code: room.code,
            name: room.name,
            open: room.open,
            hostId: room.hostId,
            mapId: room.mapId,
            endless: room.endless,
            started: room.started,
            members: room.members.map((client) => ({
                id: client.id,
                name: client.name,
                characterId: client.characterId,
                ready: client.ready,
                loadout: client.loadout,
                unlocks: client.unlocks,
            })),
        };
    }

    function broadcastRoom(room) {
        openRooms = undefined;
        const view = roomView(room);
        for (const member of room.members) {
            member.connection.send({ t: "room", room: view, you: member.id });
        }
    }

    // For what players say about themselves. It goes out now if it's been a
    // while, and otherwise once, with the latest. Mid-run nobody's reading it,
    // and the room hears it all when the run ends.
    function broadcastMembers(room) {
        if (room.started) {
            return;
        }
        if (room.updateTimer) {
            room.updateWaiting = true;
            return;
        }
        broadcastRoom(room);
        room.updateTimer = setTimeout(() => {
            room.updateTimer = undefined;
            if (room.updateWaiting && rooms.get(room.code) === room) {
                room.updateWaiting = false;
                broadcastMembers(room);
            }
        }, memberUpdateMs);
        room.updateTimer.unref?.();
    }

    function listing(room) {
        const host = room.members.find((member) => member.id === room.hostId);
        return {
            code: room.code,
            name: room.name,
            host: host?.name ?? "",
            players: room.members.length,
            max: MAX_PARTY,
            mapId: room.mapId,
            endless: room.endless,
        };
    }

    // Rooms anyone can join: open, not under way and not full. The fullest
    // first (they'll start soonest), then the ones waiting longest, so the
    // order holds still while people browse.
    function getOpenRooms() {
        openRooms ??= [...rooms.values()]
            .filter((room) => room.open && !room.started && room.members.length < MAX_PARTY)
            .sort((a, b) => b.members.length - a.members.length || a.order - b.order)
            .map(listing);
        return openRooms;
    }

    // Takes a client out of their room. reason goes to them; the rest are
    // told who's gone.
    function leaveRoom(client, reason) {
        const room = client.room;
        if (!room) {
            return;
        }
        client.room = undefined;
        room.run?.pending.delete(client.id);
        checkEndlessDrain();
        client.ready = false;
        room.members = room.members.filter((member) => member !== client);
        if (reason) {
            client.connection.send({ t: "gone", reason });
        }
        if (room.members.length === 0) {
            rooms.delete(room.code);
            openRooms = undefined;
            return;
        }
        if (room.hostId === client.id) {
            if (room.started) {
                // The host's game is the one everyone's follows, so the run
                // can't go on without them
                disband(room, "hostLeft");
                return;
            }
            room.hostId = room.members[0].id;
        }
        if (room.started) {
            for (const member of room.members) {
                member.connection.send({ t: "left", id: client.id });
            }
        }
        broadcastRoom(room);
    }

    function disband(room, reason) {
        rooms.delete(room.code);
        checkEndlessDrain();
        openRooms = undefined;
        for (const member of room.members) {
            member.room = undefined;
            member.ready = false;
            member.connection.send({ t: "gone", reason });
        }
        room.members = [];
    }

    // A name nobody connected has (name-gen.mjs). Names are a player's own
    // only while they're connected: no accounts, so nothing's kept.
    function newPlayerName() {
        return playerName((name) => playerNames.has(name));
    }

    function newRoomName() {
        const taken = new Set([...rooms.values()].map((room) => room.name));
        return roomName((name) => taken.has(name));
    }

    // Rooms whose host is at this address
    function roomsHostedFrom(address) {
        let count = 0;
        for (const room of rooms.values()) {
            const host = room.members.find((member) => member.id === room.hostId);
            if (host?.address === address) {
                count++;
            }
        }
        return count;
    }

    // Whether this address has done something (made a room, tried a wrong
    // code) fewer than limit times in the last minute, and if so, notes it
    function underLimit(times, address, limit) {
        const now = Date.now();
        const recent = (times.get(address) ?? []).filter((t) => now - t < 60_000);
        const under = recent.length < limit;
        if (under) {
            recent.push(now);
        }
        times.set(address, recent);
        return under;
    }

    // Whether this address has tried too many codes that don't exist lately
    function guessing(address) {
        const now = Date.now();
        return (
            (wrongCodesFrom.get(guesserKey(address)) ?? []).filter((t) => now - t < 60_000)
                .length >= wrongCodesPerMinute
        );
    }

    // What a player's told the room about themselves. Their name isn't theirs
    // to say: the relay gives it.
    function setMember(client, message) {
        if (message.characterId !== undefined) {
            client.characterId = cleanId(message.characterId);
        }
        if (message.ready !== undefined) {
            client.ready = message.ready === true;
        }
        if (message.loadout !== undefined) {
            const size = JSON.stringify(message.loadout)?.length ?? 0;
            client.loadout = size <= MAX_LOADOUT_BYTES ? message.loadout : undefined;
        }
        if (message.unlocks !== undefined) {
            client.unlocks = cleanUnlocks(message.unlocks);
        }
        if (typeof message.build === "string") {
            client.build = message.build.slice(0, 64);
        }
    }

    // A player whose game isn't the host's build, which would fall out of
    // step with it, as an error for whoever's asking
    function otherBuild(players, host, asking) {
        const odd = players.find((client) => client.build !== host.build);
        if (!odd) {
            return undefined;
        }
        return odd === asking
            ? OTHER_BUILD_TEXT
            : `${odd.name}'s game is another version. Everyone needs to reload the page.`;
    }

    // What stops these players (with these unlocks, or their own) playing on a
    // map: the first one without it, as an error for whoever's asking, or
    // nothing. who: the player's name, said when it isn't the one asking.
    function missingMap(players, mapId, endless, asking) {
        if (anyMap) {
            return undefined;
        }
        for (const { client, unlocks = client.unlocks } of players) {
            if (!hasUnlocked(unlocks, mapId, endless)) {
                const need = { mapId, endless, ...(client !== asking && { who: client.name }) };
                const what = `${mapId}${endless ? " (endless)" : ""}`;
                return {
                    t: "error",
                    message:
                        client === asking
                            ? `You need ${what} unlocked to join this room.`
                            : `${client.name} hasn't got ${what} unlocked.`,
                    need,
                };
            }
        }
        return undefined;
    }

    // Whether a guest's input is the size and rate a game sends
    function allowUp(client, payload) {
        const second = Math.floor(Date.now() / 1000);
        if (second !== client.upSecond) {
            client.upSecond = second;
            client.upsThisSecond = 0;
        }
        return payload.length <= MAX_UP_BYTES && ++client.upsThisSecond <= MAX_UPS_PER_SECOND;
    }

    // payload: the message's bytes as they came, for passing on
    function handle(client, message, payload) {
        const room = client.room;
        // Pings, browsing the list and a player's own updates don't keep
        // anything open
        if (message.t !== "ping" && message.t !== "list" && message.t !== "me") {
            client.lastActive = Date.now();
            if (room) {
                room.lastActive = client.lastActive;
            }
        }
        const isHost = room !== undefined && room.hostId === client.id;
        const error = (text) => client.connection.send({ t: "error", message: text });
        if (draining && ["create", "join", "start"].includes(message.t)) {
            error(
                "Server maintenance is pending. Existing runs can finish; new runs will return afterward.",
            );
            return;
        }
        switch (message.t) {
            case "ping":
                client.connection.send({ t: "pong" });
                return;
            case "list": {
                const size = clampInt(message.size, 1, MAX_LIST_PAGE_SIZE, LIST_PAGE_SIZE);
                const list = getOpenRooms();
                const pages = Math.max(1, Math.ceil(list.length / size));
                // Past the last page (rooms filled up or went): the last one
                const page = clampInt(message.page, 0, pages - 1, 0);
                client.connection.send({
                    t: "rooms",
                    rooms: list.slice(page * size, (page + 1) * size),
                    page,
                    pages,
                    total: list.length,
                    // No room for another until one goes
                    full: rooms.size >= maxRooms,
                });
                return;
            }
            case "create": {
                if (rooms.size >= maxRooms) {
                    error(FULL_TEXT);
                    return;
                }
                if (roomsHostedFrom(client.address) >= roomsPerAddress) {
                    error("There are too many rooms from your connection already.");
                    return;
                }
                const hostMissing = missingMap(
                    [{ client, unlocks: cleanUnlocks(message.me?.unlocks ?? client.unlocks) }],
                    cleanId(message.mapId) || "lumbridge",
                    message.endless === true,
                    client,
                );
                if (hostMissing) {
                    client.connection.send(hostMissing);
                    return;
                }
                if (!underLimit(createdFrom, client.address, createsPerMinute)) {
                    error("That's a lot of rooms. Wait a minute before making another.");
                    return;
                }
                leaveRoom(client);
                setMember(client, message.me ?? {});
                client.ready = false;
                const created = {
                    code: newCode(),
                    name: newRoomName(),
                    open: message.open === true,
                    hostId: client.id,
                    mapId: cleanId(message.mapId) || "lumbridge",
                    endless: message.endless === true,
                    started: false,
                    members: [client],
                    order: nextRoomOrder++,
                    lastActive: Date.now(),
                    // Addresses the host's kicked, who can't come back
                    kicked: new Set(),
                };
                rooms.set(created.code, created);
                if (counters) {
                    counters.roomsCreated++;
                    counters.peakRooms = Math.max(counters.peakRooms, rooms.size);
                }
                client.room = created;
                broadcastRoom(created);
                return;
            }
            case "join": {
                if (guessing(client.address)) {
                    error("That's a lot of wrong codes. Wait a minute and try again.");
                    return;
                }
                const code =
                    typeof message.code === "string" ? message.code.toUpperCase().slice(0, 16) : "";
                const target = rooms.get(code);
                if (!target) {
                    underLimit(wrongCodesFrom, guesserKey(client.address), Infinity);
                    error(`There's no room ${code || "with that code"}.`);
                    return;
                }
                if (target.kicked.has(client.address)) {
                    error("The host has removed you from that room.");
                    return;
                }
                if (target.started) {
                    error("That room's run has already started.");
                    return;
                }
                if (target.members.length >= MAX_PARTY) {
                    error("That room is full.");
                    return;
                }
                if (target.members.includes(client)) {
                    return;
                }
                const missing = missingMap(
                    [{ client, unlocks: cleanUnlocks(message.me?.unlocks ?? client.unlocks) }],
                    target.mapId,
                    target.endless,
                    client,
                );
                if (missing) {
                    client.connection.send(missing);
                    return;
                }
                const host = target.members.find((member) => member.id === target.hostId);
                const build =
                    typeof message.me?.build === "string"
                        ? message.me.build.slice(0, 64)
                        : client.build;
                if (host && build !== host.build) {
                    error(OTHER_BUILD_TEXT);
                    return;
                }
                if (!underLimit(joinedFrom, client.address, joinsPerMinute)) {
                    error("That's a lot of joining. Wait a minute and try again.");
                    return;
                }
                leaveRoom(client);
                setMember(client, message.me ?? {});
                client.ready = false;
                target.members.push(client);
                client.room = target;
                broadcastRoom(target);
                return;
            }
            case "leave":
                leaveRoom(client, "left");
                return;
            case "me":
                if (room && payload.length <= MAX_ME_BYTES) {
                    setMember(client, message);
                    broadcastMembers(room);
                }
                return;
            case "rename":
                // Not mid-run: everyone's copy of it has the old name
                if (!room?.started) {
                    // Picked while the old one's still taken, so it's a new one
                    const name = newPlayerName();
                    playerNames.delete(client.name);
                    client.name = name;
                    playerNames.add(name);
                    client.connection.send({ t: "named", name: client.name });
                    if (room) {
                        broadcastMembers(room);
                    }
                }
                return;
            case "settings":
                if (isHost && !room.started) {
                    if (message.open !== undefined) {
                        room.open = message.open === true;
                    }
                    const mapId =
                        message.mapId !== undefined
                            ? cleanId(message.mapId) || room.mapId
                            : room.mapId;
                    const endless =
                        message.endless !== undefined ? message.endless === true : room.endless;
                    // Only a map everyone in the room has
                    const missing = missingMap(
                        room.members.map((member) => ({ client: member })),
                        mapId,
                        endless,
                        client,
                    );
                    if (missing) {
                        client.connection.send(missing);
                    } else {
                        room.mapId = mapId;
                        room.endless = endless;
                    }
                    broadcastRoom(room);
                }
                return;
            case "kick": {
                if (!isHost) {
                    return;
                }
                const kicked = room.members.find((m) => m.id === message.id && m !== client);
                if (kicked) {
                    room.kicked.add(kicked.address);
                    leaveRoom(kicked, "kicked");
                }
                return;
            }
            case "disband":
                if (isHost) {
                    disband(room, "disbanded");
                }
                return;
            case "start":
                if (isHost && !room.started) {
                    const missing = missingMap(
                        room.members.map((member) => ({ client: member })),
                        room.mapId,
                        room.endless,
                        client,
                    );
                    if (missing) {
                        client.connection.send(missing);
                        return;
                    }
                    const versionError = otherBuild(room.members, client, client);
                    if (versionError) {
                        error(versionError);
                        return;
                    }
                    room.started = true;
                    room.run = {
                        id: String(nextRunId++),
                        // Fun maps start endless even when the room's endless toggle is off.
                        endless: room.endless || message.game?.endless === true,
                        pending: new Set(room.members.map((m) => m.id)),
                    };
                    if (counters) {
                        counters.runsStarted++;
                    }
                    for (const member of room.members) {
                        member.ready = false;
                        member.connection.send({
                            t: "start",
                            game: message.game,
                            runId: room.run.id,
                        });
                    }
                    broadcastRoom(room);
                }
                return;
            case "end":
                // The host's back in the lobby: the room is again
                if (isHost && room.started) {
                    room.started = false;
                    broadcastRoom(room);
                }
                return;
            case "finished":
                // Only this member's acknowledgement, for this particular run.
                // Keep waiting after the host returns to the lobby if a guest is still finishing.
                if (room?.run && message.runId === room.run.id) {
                    room.run.pending.delete(client.id);
                    checkEndlessDrain();
                }
                return;
            // The game's own traffic, nearly all of what comes through, goes on
            // as it came rather than encoded again: the same JSON, so every
            // player reads what the relay did
            case "up":
                // A guest's input, for the host, saying who it's from
                if (room?.started && !isHost && allowUp(client, payload)) {
                    const host = room.members.find((m) => m.id === room.hostId);
                    host?.connection.write(encodeFrame(0x1, withField(payload, "from", client.id)));
                }
                return;
            case "down":
                // The host's frames, for everyone else: one frame for them all
                if (isHost && room.started) {
                    const frame = encodeFrame(0x1, payload);
                    for (const member of room.members) {
                        if (member !== client) {
                            member.connection.write(frame);
                        }
                    }
                }
                return;
        }
    }

    function handleUpgrade(req, socket, head) {
        socket.on("error", () => socket.destroy());
        const key = req.headers["sec-websocket-key"];
        if (
            typeof key !== "string" ||
            (req.headers.upgrade ?? "").toLowerCase() !== "websocket" ||
            req.headers["sec-websocket-version"] !== "13"
        ) {
            refuse(socket, "400 Bad Request");
            return;
        }
        const address = addressKey(clientAddress(req, socket, proxy));
        if (proxy === "none" && !warnedProxy && viaProxy(req, socket)) {
            warnedProxy = true;
            console.warn(
                "Co-op players are coming through a proxy, so they all look like it to the " +
                    "relay's limits. Set PROXY=local (or PROXY=cloudflare behind Cloudflare).",
            );
        }
        const connections = connectionsFrom.get(address) ?? 0;
        if (connections >= connectionsPerAddress) {
            refuse(socket, "429 Too Many Requests");
            return;
        }
        if (clients.size >= maxConnections) {
            refuse(socket, "503 Service Unavailable");
            return;
        }
        connectionsFrom.set(address, connections + 1);
        socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`,
        );
        const client = {
            id: `p${nextId++}`,
            name: newPlayerName(),
            characterId: "",
            ready: false,
            loadout: undefined,
            unlocks: cleanUnlocks(undefined),
            build: undefined,
            room: undefined,
            connection: undefined,
            address,
            lastActive: Date.now(),
            upSecond: 0,
            upsThisSecond: 0,
        };
        client.connection = new Connection(
            socket,
            (message, payload) => handle(client, message, payload),
            () => {
                clients.delete(client);
                playerNames.delete(client.name);
                const left = (connectionsFrom.get(address) ?? 1) - 1;
                if (left > 0) {
                    connectionsFrom.set(address, left);
                } else {
                    connectionsFrom.delete(address);
                }
                leaveRoom(client);
            },
            bytesPerSecond,
        );
        clients.add(client);
        if (counters) {
            counters.connections++;
            counters.peakPlayers = Math.max(counters.peakPlayers, clients.size);
        }
        playerNames.add(client.name);
        // anyMap: the game shows rooms on maps the player hasn't got as locked
        // unless it's on
        client.connection.send({
            t: "welcome",
            id: client.id,
            name: client.name,
            anyMap,
            draining,
            endlessDeadline,
        });
        if (head && head.length > 0) {
            client.connection.receive(head);
        }
    }

    const pinger = setInterval(() => {
        for (const client of clients) {
            client.connection.ping();
        }
    }, PING_MS);
    pinger.unref?.();

    // Rooms nobody's done anything in for a long while are closed, and the
    // record of rooms made from each address is kept to the last minute
    const sweeper = setInterval(() => sweep(Date.now()), 60_000);
    sweeper.unref?.();

    function sweep(now) {
        for (const room of [...rooms.values()]) {
            if (now - room.lastActive > idleMs) {
                disband(room, "idle");
            }
        }
        for (const client of clients) {
            if (!client.room && now - client.lastActive > idleConnectionMs) {
                client.connection.close(1001);
            }
        }
        for (const times of [createdFrom, wrongCodesFrom, joinedFrom]) {
            for (const [address, at] of times) {
                if (at.every((t) => now - t >= 60_000)) {
                    times.delete(address);
                }
            }
        }
    }

    return {
        // Takes over an HTTP server's WebSocket upgrades to path, and leaves
        // the rest, like Vite's own, alone, unless closeOthers (for a server
        // with nothing else to upgrade to, where they'd hang open)
        attach(server, path = RELAY_PATH, { closeOthers = false } = {}) {
            server.on("upgrade", (req, socket, head) => {
                if (requestPath(req) === path) {
                    handleUpgrade(req, socket, head);
                } else if (closeOthers) {
                    refuse(socket, "404 Not Found");
                }
            });
            const localMetrics = startMetrics(path);
            server.once("close", stopMetrics);
            if (admin && !adminControl) {
                try {
                    adminControl = createAdminControl({
                        status: getDrainStatus,
                        drain: (options) => setDraining(true, options),
                        cancel: () => setDraining(false),
                    });
                    adminControl.ready.catch((error) =>
                        console.error(`Relay admin unavailable: ${error.message}`),
                    );
                    server.once("close", () => adminControl.close());
                } catch (error) {
                    console.error(`Relay admin unavailable: ${error.message}`);
                }
            }
            return localMetrics;
        },
        handleUpgrade,
        // Answers a plain GET of path with what's going on, for the game to
        // see co-op's there (from another site too, with VITE_COOP_URL).
        // False for any other request, to go to whatever else serves.
        handleRequest(req, res, path = RELAY_PATH) {
            const requestedPath = requestPath(req);
            if (requestedPath === `${path}/metrics`) {
                // Never expose metrics through the public server or its proxy.
                res.setHeader("Cache-Control", "no-store");
                res.writeHead(404);
                res.end();
                return true;
            }
            if (requestedPath !== path || (req.method !== "GET" && req.method !== "HEAD")) {
                return false;
            }
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
            });
            res.end(JSON.stringify({ coop: true }));
            return true;
        },
        // Closes idle rooms as if it were this time (for the tests)
        sweep,
        beginDrain: (options) => setDraining(true, options),
        cancelDrain: () => setDraining(false),
        getDrainStatus,
        close() {
            clearInterval(pinger);
            clearInterval(sweeper);
            stopCloudflare();
            stopMetrics();
            adminControl?.close();
            clearTimeout(endlessTimer);
            for (const client of clients) {
                client.connection.close(1001);
            }
        },
        get roomCount() {
            return rooms.size;
        },
    };
}

// Run on its own
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const port = parseInt(process.env.PORT ?? "8787");
    const path = process.env.MULTIPLAYER_PATH ?? RELAY_PATH;
    const relay = createRelay();
    const server = createServer((req, res) => {
        if (!relay.handleRequest(req, res, path)) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Run Escape co-op relay\n");
        }
    });
    relay.attach(server, path, { closeOthers: true });
    server.listen({ port, host: process.env.HOST }, () => {
        console.log(`Co-op relay on ws://localhost:${port}${path}`);
    });
}
