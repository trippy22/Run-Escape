import { useEffect, useState } from "react";

import { GameClient } from "../client/GameClient";
import { TeammateView, UiSnapshot } from "../client/GameStore";
import { describeMissing, parseRoomCode } from "../client/coop/CoopLobby";
import { RoomView } from "../client/coop/protocol";
import { CHARACTERS, getCharacter } from "../content/characters";
import { MAX_PARTY } from "../content/coop";
import { FUN_MAPS, MAPS, MAP_BY_ID, getMap } from "../content/maps";
import { isEndlessUnlocked, isMapUnlocked } from "../core/save";
import "./CoopScreen.css";
import { AdventurerPanel, Toggle, getStartingWeaponIcon } from "./GameUi";
import { ItemIcon } from "./ItemIcon";

// Co-op: finding a room or making one, then the room itself, where everyone
// picks their adventurer and readies up and the host picks the map. In a run,
// the party's frames and who it's waiting on.

type Props = { ui: UiSnapshot; client: GameClient };

export function CoopScreen({ ui, client }: Props): JSX.Element {
    const room = ui.coop.room;
    return room ? (
        <CoopLobby ui={ui} client={client} room={room} />
    ) : (
        <CoopMenu ui={ui} client={client} />
    );
}

function CoopMenu({ ui, client }: Props): JSX.Element {
    const coop = ui.coop;
    const [code, setCode] = useState("");
    const [open, setOpen] = useState(false);
    const online = coop.status === "online";
    const canJoin = online && !coop.draining;
    // Rooms on maps this game hasn't got (a newer game's) can't be joined
    const rooms = coop.rooms.filter((listing) => MAP_BY_ID.has(listing.mapId));
    // Unless the relay takes anyone, a room on a map this player hasn't got
    // can't be joined: what's missing, or nothing
    const missing = (mapId: string, endless: boolean) =>
        coop.anyMap ||
        (isMapUnlocked(ui.save, mapId) && (!endless || isEndlessUnlocked(ui.save, mapId)))
            ? undefined
            : describeMissing({ mapId, endless });
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === "Escape" && !(e.target instanceof HTMLInputElement)) {
                client.closeCoop();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [client]);
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-coop">
                <h2>Multiplayer</h2>
                {coop.draining && (
                    <p role="status" className="ui-coop-error">
                        Server maintenance is pending. New rooms and runs are temporarily
                        unavailable.
                    </p>
                )}
                <p className="ui-subtle">
                    A run with up to {MAX_PARTY - 1} friends. Each of you brings your own
                    adventurer, skills and Armoury.
                </p>
                <div className="ui-coop-rows">
                    <div className="ui-coop-row">
                        <span className="ui-coop-label">Your name</span>
                        {/* The relay gives everyone a name; another's a click away */}
                        <span className="ui-coop-name">{coop.name || "..."}</span>
                        <button
                            className="ui-button ui-button-small"
                            disabled={!online}
                            onClick={() => client.renameCoop()}
                        >
                            New name
                        </button>
                    </div>
                    <div className="ui-coop-row">
                        <span className="ui-coop-label">New room</span>
                        <div className="ui-coop-choice" role="radiogroup" aria-label="Who can join">
                            <button
                                className={
                                    "ui-button ui-button-small" + (open ? "" : " ui-toggle-on")
                                }
                                aria-pressed={!open}
                                onClick={() => setOpen(false)}
                            >
                                Invite only
                            </button>
                            <button
                                className={
                                    "ui-button ui-button-small" + (open ? " ui-toggle-on" : "")
                                }
                                aria-pressed={open}
                                onClick={() => setOpen(true)}
                            >
                                Open to all
                            </button>
                        </div>
                        <button
                            className="ui-button ui-button-go"
                            disabled={!canJoin || coop.roomsFull}
                            title={
                                coop.roomsFull
                                    ? "All rooms are taken right now. Try again when one opens."
                                    : undefined
                            }
                            onClick={() => client.createRoom(open)}
                        >
                            Create
                        </button>
                    </div>
                    <form
                        className="ui-coop-row"
                        onSubmit={(e) => {
                            e.preventDefault();
                            client.joinRoom(code);
                        }}
                    >
                        <span className="ui-coop-label">Room code</span>
                        <input
                            className="ui-coop-input ui-coop-code-input"
                            value={code}
                            placeholder="ABCDE"
                            spellCheck={false}
                            autoCapitalize="characters"
                            // An invite link pasted in leaves just its code
                            onChange={(e) => setCode(parseRoomCode(e.target.value))}
                        />
                        <button
                            className="ui-button"
                            type="submit"
                            disabled={!canJoin || code.trim().length === 0}
                        >
                            Join
                        </button>
                    </form>
                </div>
                <h3 className="ui-coop-heading">
                    Open rooms
                    <span className="ui-select-count">
                        {coop.status === "connecting"
                            ? "Connecting..."
                            : online
                              ? `${coop.roomsTotal} open`
                              : "Offline"}
                    </span>
                </h3>
                <div className="ui-coop-rooms">
                    {rooms.map((listing) => (
                        <div
                            key={listing.code}
                            className="ui-coop-room"
                            title={`Hosted by ${listing.host}`}
                        >
                            <ItemIcon objId={getMap(listing.mapId).iconObjId} size={20} />
                            <span className="ui-coop-room-name">
                                <span className="ui-coop-room-host">{listing.name}</span>
                                <span className="ui-coop-room-code">{listing.code}</span>
                                <span className="ui-coop-room-map">
                                    {getMap(listing.mapId).name}
                                    {listing.endless && !getMap(listing.mapId).fun && ", endless"}
                                </span>
                            </span>
                            <span className="ui-coop-room-count">
                                {listing.players} / {listing.max}
                            </span>
                            <button
                                className="ui-button ui-button-small"
                                disabled={!canJoin || !!missing(listing.mapId, listing.endless)}
                                title={missing(listing.mapId, listing.endless)}
                                onClick={() => client.joinRoom(listing.code)}
                            >
                                {missing(listing.mapId, listing.endless) ? "Locked" : "Join"}
                            </button>
                        </div>
                    ))}
                    {online && !coop.draining && coop.rooms.length === 0 && (
                        <div className="ui-coop-empty">No open rooms right now. Make one!</div>
                    )}
                    {coop.status === "offline" && (
                        <div className="ui-coop-empty">
                            The co-op server isn't answering.{" "}
                            <button
                                className="ui-button ui-button-small"
                                onClick={() => client.openCoop()}
                            >
                                Try again
                            </button>
                        </div>
                    )}
                </div>
                {online && coop.roomsPages > 1 && (
                    <div className="ui-coop-pages">
                        <button
                            className="ui-button ui-button-small"
                            aria-label="Previous page"
                            disabled={coop.roomsPage === 0}
                            onClick={() => client.showRoomsPage(coop.roomsPage - 1)}
                        >
                            ‹
                        </button>
                        <span>
                            Page {coop.roomsPage + 1} of {coop.roomsPages}
                        </span>
                        <button
                            className="ui-button ui-button-small"
                            aria-label="Next page"
                            disabled={coop.roomsPage >= coop.roomsPages - 1}
                            onClick={() => client.showRoomsPage(coop.roomsPage + 1)}
                        >
                            ›
                        </button>
                    </div>
                )}
                {coop.roomsFull && online && (
                    <div className="ui-coop-error">
                        All rooms are taken right now. Try again when one opens.
                    </div>
                )}
                {coop.error && <div className="ui-coop-error">{coop.error}</div>}
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.closeCoop()}>
                        Back
                    </button>
                </div>
            </div>
        </div>
    );
}

// The room before a run: adventurers on the left like the usual select
// screen, the party and the map on the right
function CoopLobby({ ui, client, room }: Props & { room: RoomView }): JSX.Element {
    const you = ui.coop.you;
    const isHost = room.hostId === you;
    const me = room.members.find((m) => m.id === you);
    // The host readies up too, so a party of one can play
    const everyoneReady = room.members.every((m) => m.ready);
    // Unless the relay takes anyone, the host can only pick what everyone in
    // the room has unlocked: who hasn't, or nothing
    const lacking = (mapId: string, endless: boolean) =>
        ui.coop.anyMap
            ? undefined
            : room.members.find(
                  (m) =>
                      !m.unlocks?.maps.includes(mapId) ||
                      (endless && !m.unlocks.endless.includes(mapId)),
              );
    // A map this game hasn't got (a newer host's) shows as the first
    const map = MAP_BY_ID.get(room.mapId) ?? MAPS[0];
    const [copied, setCopied] = useState(false);
    const copyInvite = () => {
        navigator.clipboard
            ?.writeText(client.getInviteLink(room.code))
            .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {});
    };
    return (
        <div className="ui-fill ui-select">
            <AdventurerPanel ui={ui} client={client} />
            <div className="ui-panel rs-border rs-background ui-select-panel ui-select-maps ui-coop-party">
                <h2 className="ui-select-heading">
                    {room.name || "Party"}
                    <span className="ui-select-count">
                        {room.members.length} / {MAX_PARTY}
                    </span>
                </h2>
                <div className="ui-coop-code">
                    <span className="ui-coop-code-label">Room</span>
                    <span className="ui-coop-code-value">{room.code}</span>
                    <button className="ui-button ui-button-small" onClick={copyInvite}>
                        {copied ? "Copied!" : "Copy invite"}
                    </button>
                    {isHost ? (
                        <span className="ui-coop-open" title="Open rooms are listed for anyone">
                            Open
                            <Toggle
                                on={room.open}
                                label="Open to all"
                                onToggle={() => client.setRoomOpen(!room.open)}
                            />
                        </span>
                    ) : (
                        <span className="ui-coop-open">{room.open ? "Open" : "Invite only"}</span>
                    )}
                </div>
                <div className="ui-coop-members">
                    {room.members.map((member) => {
                        const character = getCharacter(
                            map.fun?.character ??
                                (CHARACTERS.some((c) => c.id === member.characterId)
                                    ? member.characterId
                                    : CHARACTERS[0].id),
                        );
                        const host = member.id === room.hostId;
                        return (
                            <div key={member.id} className="ui-coop-member">
                                <ItemIcon objId={getStartingWeaponIcon(character)} size={28} />
                                <span className="ui-coop-member-name">
                                    <span className="ui-card-title">
                                        {member.name}
                                        {(member.id === you || host) && (
                                            <span className="ui-coop-you">
                                                {" "}
                                                (
                                                {[member.id === you && "you", host && "host"]
                                                    .filter(Boolean)
                                                    .join(", ")}
                                                )
                                            </span>
                                        )}
                                    </span>
                                    <span className="ui-card-style">{character.name}</span>
                                </span>
                                <span
                                    className={
                                        "ui-coop-status" +
                                        (member.ready ? " ui-coop-status-ready" : "")
                                    }
                                >
                                    {member.ready ? "Ready" : "Not ready"}
                                </span>
                                {isHost && !host && (
                                    <button
                                        className="ui-button ui-button-small ui-coop-kick"
                                        title={`Remove ${member.name} from the party`}
                                        aria-label={`Kick ${member.name}`}
                                        onClick={() => client.kickPlayer(member.id)}
                                    >
                                        Kick
                                    </button>
                                )}
                                {member.id === you && (
                                    <button
                                        className="ui-button ui-button-small"
                                        onClick={() => client.renameCoop()}
                                    >
                                        New name
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {Array.from({ length: MAX_PARTY - room.members.length }, (_, i) => (
                        <div key={i} className="ui-coop-member ui-coop-member-empty">
                            Waiting for a player...
                        </div>
                    ))}
                </div>
                <div className="ui-style-name">
                    Map
                    <span className="ui-style-treasure">
                        {isHost ? "the host picks" : `picked by the host`}
                    </span>
                </div>
                {isHost ? (
                    <div className="ui-select-scroll ui-coop-maps">
                        <div className="ui-map-list">
                            {[...MAPS, ...FUN_MAPS].map((m) => {
                                const selected = m.id === room.mapId;
                                // Others in the room who haven't got it
                                const without = lacking(m.id, false);
                                const unlocked = isMapUnlocked(ui.save, m.id) && !without;
                                return (
                                    <button
                                        key={m.id}
                                        className={
                                            "ui-card ui-map-tile" +
                                            (selected ? " ui-card-selected" : "") +
                                            (unlocked ? "" : " ui-card-locked")
                                        }
                                        aria-pressed={selected}
                                        disabled={!unlocked}
                                        title={
                                            without && isMapUnlocked(ui.save, m.id)
                                                ? `${without.name} hasn't got ${m.name} unlocked`
                                                : undefined
                                        }
                                        onClick={() => client.selectMap(m.id)}
                                    >
                                        <ItemIcon objId={m.iconObjId} size={20} />
                                        <span className="ui-map-name">{m.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="ui-select-details">
                        <div className="ui-select-details-head">
                            <ItemIcon objId={map.iconObjId} size={36} />
                            <div>
                                <div className="ui-card-title">{map.name}</div>
                                <div className="ui-card-style">
                                    {map.fun
                                        ? map.fun.character
                                            ? `Fun map. Everyone plays ${getCharacter(map.fun.character).name}.`
                                            : "Fun map, endless"
                                        : room.endless
                                          ? "Endless"
                                          : "Fifteen minutes and the boss"}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                {ui.coop.draining && (
                    <p role="status" className="ui-coop-error">
                        Server maintenance is pending. New runs will return afterward.
                    </p>
                )}
                {ui.coop.error && <div className="ui-coop-error">{ui.coop.error}</div>}
            </div>
            <div className="ui-panel rs-border rs-background ui-select-bar">
                <button className="ui-button" onClick={() => client.leaveRoom()}>
                    Leave
                </button>
                {isHost && (
                    <button
                        className="ui-button"
                        title="Send everyone back to the co-op menu"
                        onClick={() => client.disbandRoom()}
                    >
                        Disband
                    </button>
                )}
                {isHost && !map.fun && (
                    <div
                        className={
                            "ui-endless" +
                            (isEndlessUnlocked(ui.save, map.id) ? "" : " ui-endless-locked")
                        }
                    >
                        <span className="ui-endless-name">Endless</span>
                        {!isEndlessUnlocked(ui.save, map.id) ? (
                            <span className="ui-endless-hint">Beat the map</span>
                        ) : !room.endless && lacking(map.id, true) ? (
                            // It can be turned off, but only on once everyone's beaten it
                            <span className="ui-endless-hint">
                                {lacking(map.id, true)!.name} hasn't beaten it
                            </span>
                        ) : (
                            <Toggle
                                on={room.endless}
                                label="Endless"
                                onToggle={() => client.toggleEndless()}
                            />
                        )}
                    </div>
                )}
                <button
                    className={
                        "ui-button ui-coop-ready" +
                        (isHost ? "" : " ui-select-go") +
                        (me?.ready ? "" : " ui-button-go")
                    }
                    onClick={() => client.setCoopReady(!me?.ready)}
                >
                    {me?.ready ? "Not ready" : "Ready"}
                </button>
                {isHost && (
                    <button
                        className="ui-button ui-button-go ui-select-go"
                        disabled={!everyoneReady || ui.coop.draining}
                        title={everyoneReady ? undefined : "Waiting for everyone to be ready"}
                        onClick={() => client.startCoopRun()}
                    >
                        Start · {map.name}
                    </button>
                )}
            </div>
        </div>
    );
}

// The rest of the party in a run: their adventurer and hitpoints, or that
// they're down or gone
export function PartyFrames({ party }: { party: TeammateView[] }): JSX.Element {
    return (
        <div className="ui-party">
            {party.map((member, i) => (
                <div
                    key={i}
                    className={
                        "ui-party-member rs-border rs-background" +
                        (member.left || member.down ? " ui-party-left" : "")
                    }
                >
                    <ItemIcon
                        objId={getStartingWeaponIcon(getCharacter(member.characterId))}
                        size={24}
                    />
                    <div className="ui-party-body">
                        <div className="ui-party-name">{member.name}</div>
                        {member.left ? (
                            <div className="ui-party-note">Left the game</div>
                        ) : member.down ? (
                            <div className="ui-party-note">Down</div>
                        ) : (
                            <div className="ui-party-bar">
                                <div
                                    className="ui-party-fill"
                                    style={{ width: `${(member.hp / member.maxHp) * 100}%` }}
                                />
                                <span>
                                    {member.hp} / {member.maxHp}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// The run waits for everyone's level up and casket
export function WaitingNote({ names }: { names: string[] }): JSX.Element {
    const list =
        names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return <div className="ui-waiting rs-border rs-background">Waiting for {list}...</div>;
}
