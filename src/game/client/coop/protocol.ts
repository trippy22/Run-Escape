// What the game and the co-op relay (server/coop-relay.mjs) say to each other,
// as JSON over a WebSocket
import { CoopAction, FrameEvent } from "../../core/lockstep";

// What a player brings to a run from their save, for everyone's copy of it
export type Loadout = {
    metaStats: Record<string, number>;
    unlockedItems: string[];
    armoury: Record<string, number>;
};

// The maps a player has unlocked, and has endless for, which rooms go by
// unless the relay takes anyone (MULTIPLAYER_ANY_MAP)
export type Unlocks = { maps: string[]; endless: string[] };

export type MemberView = {
    id: string;
    // Given by the relay (server/name-gen.mjs), not picked
    name: string;
    characterId: string;
    ready: boolean;
    loadout?: Loadout;
    unlocks?: Unlocks;
    // The build their game is (__BUILD_ID__): a room only takes the host's
    build?: string;
};

// What a player says about themselves: everything but their id and name,
// which the relay gives
export type Member = Omit<MemberView, "id" | "name">;

// What a player's missing to play on a room's map: the map (its endless too,
// for an endless room), and who, when it's someone else
export type MissingMap = { mapId: string; endless: boolean; who?: string };

export type RoomView = {
    code: string;
    // Given by the relay when the room's made, like a player's
    name: string;
    // Listed for anyone to join, or invite only (by its code)
    open: boolean;
    hostId: string;
    mapId: string;
    endless: boolean;
    // A run is under way
    started: boolean;
    members: MemberView[];
};

// An open room, as the list of them shows it
export type RoomListing = {
    code: string;
    name: string;
    host: string;
    players: number;
    max: number;
    mapId: string;
    endless: boolean;
};

// Everything a player's copy of the run needs, from the host, in the order
// the heroes go
export type GameStart = {
    seed: number;
    mapId: string;
    endless: boolean;
    heroes: { id: string; name: string; characterId: string; loadout: Loadout }[];
};

// Whether a start from the host is one every game could play: a modified one
// could send anything
export function isGameStart(value: unknown, maxParty: number): value is GameStart {
    const game = value as GameStart | undefined;
    return (
        !!game &&
        typeof game === "object" &&
        Number.isSafeInteger(game.seed) &&
        typeof game.mapId === "string" &&
        typeof game.endless === "boolean" &&
        Array.isArray(game.heroes) &&
        game.heroes.length > 0 &&
        game.heroes.length <= maxParty &&
        game.heroes.every(
            (hero) =>
                !!hero &&
                typeof hero === "object" &&
                typeof hero.id === "string" &&
                typeof hero.name === "string" &&
                hero.name.length <= 64 &&
                typeof hero.characterId === "string",
        )
    );
}

// Why a player is out of a room
// (idle: nothing happened in the room for half an hour)
export type GoneReason = "left" | "kicked" | "disbanded" | "hostLeft" | "idle";

// A guest to the host: a move, something they did, or that their copy of the
// run is ready to go (the map's loaded)
export type UpMessage = { move: [number, number] } | { action: CoopAction } | { loaded: true };

// The host to everyone: the frames up to `upTo` are out, with what happened
// at them, and now and then a check that everyone's run still agrees
export type DownMessage = {
    upTo: number;
    events: FrameEvent[];
    hash?: [number, number];
};

export type ClientMessage =
    | { t: "ping" }
    // A page of the open rooms (0 for the first), size to a page
    | { t: "list"; page?: number; size?: number }
    | {
          t: "create";
          open: boolean;
          mapId: string;
          endless: boolean;
          me: Partial<Member>;
      }
    | { t: "join"; code: string; me: Partial<Member> }
    | { t: "leave" }
    | ({ t: "me" } & Partial<Member>)
    // A new name, from the relay (not during a run)
    | { t: "rename" }
    | { t: "settings"; open?: boolean; mapId?: string; endless?: boolean }
    | { t: "kick"; id: string }
    | { t: "disband" }
    | { t: "start"; game: GameStart }
    | { t: "end" }
    | { t: "finished"; runId: string }
    | { t: "up"; d: UpMessage }
    | { t: "down"; d: DownMessage };

export type ServerMessage =
    // name: the one the relay's given this player. anyMap: rooms take players
    // whatever maps they have.
    | {
          t: "welcome";
          id: string;
          name: string;
          anyMap?: boolean;
          draining?: boolean;
          endlessDeadline?: number;
      }
    | { t: "maintenance"; draining: boolean; endlessDeadline?: number }
    | { t: "maintenanceExit"; runId: string }
    // This player's new name, after asking for one
    | { t: "named"; name: string }
    | { t: "pong" }
    // A page of the open rooms, which page it is (the last, if the one asked
    // for has gone), of how many, and how many rooms in all
    | {
          t: "rooms";
          rooms: RoomListing[];
          page: number;
          pages: number;
          total: number;
          // Every room the relay can hold is taken
          full: boolean;
      }
    | { t: "room"; room: RoomView; you: string }
    | { t: "gone"; reason: GoneReason }
    | { t: "error"; message: string; need?: MissingMap }
    | { t: "start"; game: GameStart; runId?: string }
    | { t: "left"; id: string }
    | { t: "up"; from: string; d: UpMessage }
    | { t: "down"; d: DownMessage };
