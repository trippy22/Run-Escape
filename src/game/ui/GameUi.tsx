import {
    CSSProperties,
    ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import { OsrsLoadingBar } from "../../components/rs/loading/OsrsLoadingBar";
import compass from "../../components/rs/minimap/compass.png";
import minimapFrame from "../../components/rs/minimap/minimap-frame.png";
import { EquipSlot } from "../../rs/model/player/PlayerModelLoader";
import { isCoarsePointer } from "../../util/DeviceUtil";
import { GameClient } from "../client/GameClient";
import {
    BuffView,
    GameStore,
    GearSlotView,
    HudView,
    InventorySlotView,
    QuestTrackView,
    SlotView,
    UiSnapshot,
} from "../client/GameStore";
import { formatTime } from "../client/GameView";
import { CHARACTERS, getCharacter } from "../content/characters";
import { CAMPAIGN_MAPS, DEV_MAPS, FUN_MAPS, MAPS, SEASONAL_MAPS, getMap } from "../content/maps";
import { RARITIES } from "../content/rarity";
import { SHOP_UPGRADES } from "../content/shop";
import { COLLECTION_LOG_OBJ, TITLE_TAB_SPRITES } from "../content/titleIcons";
import { CharacterDef, CombatStyle, MapDef } from "../content/types";
import { MapReward, describeUnlockTask, getMapRewards } from "../content/unlocks";
import { WeaponStatLine } from "../content/weaponStats";
import { WEAPONS, getWeapon } from "../content/weapons";
import {
    SaveData,
    getNextUpgradeCost,
    importSave,
    isEndlessUnlocked,
    isMapUnlocked,
} from "../core/save";
import { MapGeneratorButton } from "../scaperune/MapGeneratorScreen";
import { ArmouryScreen } from "./ArmouryScreen";
import { ChangelogPanel } from "./ChangelogPanel";
import { ChestModal } from "./ChestModal";
import { Coins } from "./Coins";
import { CollectionLogScreen } from "./CollectionLogScreen";
import { CoopScreen, PartyFrames, WaitingNote } from "./CoopScreen";
import { EventModal } from "./EventModal";
import "./GameUi.css";
import { ItemIcon } from "./ItemIcon";
import { NoticePanel } from "./NoticePanel";
import { QuestScreen } from "./QuestScreen";
import { RerollButton } from "./RerollButton";
import { SkipButton } from "./SkipButton";
import { RotateNotice, TouchControls, enterFullscreen } from "./TouchControls";
import { GAME_VERSION } from "./changelog";
import { Notice, loadNotice, markNoticeSeen, shouldShowNotice } from "./notice";

type Props = {
    store: GameStore;
    client?: GameClient;
};

// The UI is laid out for a window about 720 pixels tall; bigger windows draw
// it bigger, up to twice the size, so it isn't lost on a large screen
const UI_BASE_HEIGHT = 720;
const UI_BASE_WIDTH = 1150;
const UI_MAX_SCALE = 2;

function getUiScale(): number {
    const fit = Math.min(window.innerHeight / UI_BASE_HEIGHT, window.innerWidth / UI_BASE_WIDTH);
    // In twentieths, so a small resize doesn't relayout everything
    return Math.round(Math.min(UI_MAX_SCALE, Math.max(1, fit)) * 20) / 20;
}

function useUiScale(): number {
    const [scale, setScale] = useState(getUiScale);
    useEffect(() => {
        const onResize = () => setScale(getUiScale());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return scale;
}

export function GameUi({ store, client }: Props): JSX.Element {
    const ui = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const scale = useUiScale();

    if (ui.screen === "loading" || !client) {
        return (
            <div className="ui-fill ui-center ui-loading">
                <OsrsLoadingBar text={ui.loadingText} progress={ui.loadingProgress} />
            </div>
        );
    }

    // Every button clicks like the client's interface does (but not ones
    // with sounds of their own)
    const onClickCapture = (event: React.MouseEvent) => {
        if ((event.target as HTMLElement).closest("button:not([data-silent])")) {
            client.playClick();
        }
    };
    let screen: JSX.Element = <></>;
    switch (ui.screen) {
        case "title":
            screen = <TitleScreen ui={ui} client={client} />;
            break;
        case "characters":
            screen = <CharacterScreen ui={ui} client={client} />;
            break;
        case "shop":
            screen = <ShopScreen ui={ui} client={client} />;
            break;
        case "armoury":
            screen = <ArmouryScreen ui={ui} client={client} />;
            break;
        case "quests":
            screen = <QuestScreen ui={ui} client={client} />;
            break;
        case "collectionLog":
            screen = <CollectionLogScreen ui={ui} client={client} />;
            break;
        case "coop":
            screen = <CoopScreen ui={ui} client={client} />;
            break;
        case "run":
            screen = <RunScreen ui={ui} client={client} />;
            break;
    }
    return (
        <div
            className="ui-contents"
            style={{ "--ui-scale": scale } as CSSProperties}
            onClickCapture={onClickCapture}
        >
            {screen}
            {isCoarsePointer && <RotateNotice />}
        </div>
    );
}

type ScreenProps = { ui: UiSnapshot; client: GameClient };

// A setting's name and what it does, with its control on the right
function Setting({
    name,
    text,
    children,
}: {
    name: string;
    text?: string;
    children: ReactNode;
}): JSX.Element {
    return (
        <div className="ui-setting">
            <div className="ui-setting-label">
                <div className="ui-setting-name">{name}</div>
                {text && <div className="ui-setting-text">{text}</div>}
            </div>
            <div className="ui-setting-control">{children}</div>
        </div>
    );
}

export function Toggle({
    on,
    label,
    onToggle,
}: {
    on: boolean;
    label: string;
    onToggle: () => void;
}): JSX.Element {
    return (
        <button
            className={"ui-button ui-button-small ui-toggle" + (on ? " ui-toggle-on" : "")}
            aria-label={label}
            aria-pressed={on}
            onClick={(e) => {
                onToggle();
                // Give Enter and Space back to the screen
                e.currentTarget.blur();
            }}
        >
            {on ? "On" : "Off"}
        </button>
    );
}

// music: the run's map has music, so it gets its own volume
function SoundSettings({
    ui,
    client,
    music = false,
}: ScreenProps & { music?: boolean }): JSX.Element {
    const { muted, volume } = ui.audio;
    return (
        <>
            <Setting
                name="Sound"
                text={isCoarsePointer ? undefined : "M turns it on and off at any time"}
            >
                <Toggle on={!muted} label="Sound" onToggle={() => client.toggleMute()} />
            </Setting>
            <VolumeSetting
                name="Volume"
                value={volume}
                muted={muted}
                onChange={(value) => client.setVolume(value)}
            />
            {music && (
                <VolumeSetting
                    name="Music"
                    value={ui.audio.music}
                    muted={muted}
                    onChange={(value) => client.setMusicVolume(value)}
                />
            )}
        </>
    );
}

function VolumeSetting({
    name,
    value,
    muted,
    onChange,
}: {
    name: string;
    value: number;
    muted: boolean;
    onChange: (value: number) => void;
}): JSX.Element {
    return (
        <Setting name={name}>
            <input
                className={"ui-volume" + (muted ? " ui-volume-muted" : "")}
                type="range"
                min={0}
                max={100}
                value={Math.round(value * 100)}
                onChange={(e) => onChange(parseInt(e.target.value) / 100)}
                // Give the keys back to the game once it's set
                onPointerUp={(e) => e.currentTarget.blur()}
                aria-label={name}
            />
            <span className="ui-volume-value">{Math.round(value * 100)}%</span>
        </Setting>
    );
}

function AutoPauseSetting({ ui, client }: ScreenProps): JSX.Element {
    return (
        <Setting
            name="Auto-pause"
            text={`Pause the run when you ${isCoarsePointer ? "leave" : "click away from"} the game`}
        >
            <Toggle
                on={ui.display.pauseOnBlur}
                label="Auto-pause"
                onToggle={() => client.toggleAutoPause()}
            />
        </Setting>
    );
}

function AutoAlchSetting({ ui, client }: ScreenProps): JSX.Element {
    return (
        <Setting name="Auto alch" text="High alch every casket as you open it, without stopping">
            <Toggle
                on={ui.display.autoAlch}
                label="Auto alch"
                onToggle={() => client.toggleAutoAlch()}
            />
        </Setting>
    );
}

// The community server's invite
const DISCORD_INVITE = "https://discord.gg/82gBtKz2Xx";
const GITHUB_REPOSITORY = "https://github.com/Dynrothe/Run-Escape";

function GitHubLink(): JSX.Element {
    return (
        <a
            className="ui-title-link ui-github"
            href={GITHUB_REPOSITORY}
            target="_blank"
            rel="noopener noreferrer"
            title="See the code on GitHub"
            aria-label="See the code on GitHub"
            onClick={(e) => e.currentTarget.blur()}
        >
            <svg className="ui-title-link-logo" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
        </a>
    );
}

function DiscordLink(): JSX.Element {
    return (
        <a
            className="ui-title-link ui-discord"
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            title="Join the Discord"
            aria-label="Join the Discord"
            onClick={(e) => e.currentTarget.blur()}
        >
            <svg className="ui-title-link-logo" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
            </svg>
        </a>
    );
}

// Saves live in this browser; a file carries one to another, or keeps a copy
function SaveSetting({ ui, client }: ScreenProps): JSX.Element {
    const fileInput = useRef<HTMLInputElement>(null);
    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // So picking the same file again still counts
        e.target.value = "";
        if (!file) {
            return;
        }
        let save: SaveData;
        try {
            save = importSave(await file.text());
        } catch {
            window.alert(`${file.name} isn't a Run Escape save.`);
            return;
        }
        const describe = (s: SaveData) =>
            `${s.coins.toLocaleString()} coins, ${s.runs} runs, ${s.victories} wins`;
        const replace = window.confirm(
            `Replace your save (${describe(ui.save)}) with this one (${describe(save)})?\n\n` +
                "Export yours first if you want to keep it.",
        );
        if (replace) {
            client.replaceSave(save);
        }
    };
    return (
        <Setting
            name="Your progress"
            text="Kept in this browser. Export a copy to keep it safe or take it to another one."
        >
            <button
                className="ui-button ui-button-small"
                onClick={(e) => {
                    client.exportSave();
                    e.currentTarget.blur();
                }}
            >
                Export
            </button>
            <button
                className="ui-button ui-button-small"
                onClick={(e) => {
                    fileInput.current?.click();
                    e.currentTarget.blur();
                }}
            >
                Import
            </button>
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={onFile}
            />
        </Setting>
    );
}

// Behind the title screen's Settings button
function SettingsPanel({
    ui,
    client,
    onClose,
}: ScreenProps & { onClose: () => void }): JSX.Element {
    return (
        <div className="ui-panel rs-border rs-background ui-settings">
            <h2>Settings</h2>
            <div className="ui-settings-body">
                <section className="ui-settings-section">
                    <h3>Sound</h3>
                    <SoundSettings ui={ui} client={client} />
                </section>
                <section className="ui-settings-section">
                    <h3>Game</h3>
                    <Setting
                        name="Camera spin"
                        text="The camera circles your adventurer on the menus"
                    >
                        <Toggle
                            on={ui.display.menuSpin}
                            label="Camera spin"
                            onToggle={() => client.toggleMenuSpin()}
                        />
                    </Setting>
                    <AutoPauseSetting ui={ui} client={client} />
                    <AutoAlchSetting ui={ui} client={client} />
                </section>
                <section className="ui-settings-section">
                    <h3>Save</h3>
                    <SaveSetting ui={ui} client={client} />
                </section>
            </div>
            <div className="ui-row">
                <button className="ui-button" onClick={onClose}>
                    Back
                </button>
            </div>
        </div>
    );
}

// A smaller way in, under the play buttons: an item, or a sprite on its own
function TitleTile({
    name,
    objId = -1,
    spriteId,
    onClick,
}: {
    name: string;
    objId?: number;
    spriteId?: number;
    onClick: () => void;
}): JSX.Element {
    return (
        <button className="ui-card ui-title-tile" onClick={onClick}>
            <ItemIcon objId={objId} spriteId={spriteId} />
            {name}
        </button>
    );
}

function TitleStat({ name, value }: { name: string; value: string | number }): JSX.Element {
    return (
        <span className="ui-title-stat">
            {name} <span className="ui-title-stat-value">{value}</span>
        </span>
    );
}

function TitleScreen({ ui, client }: ScreenProps): JSX.Element {
    const save = ui.save;
    const [changelogOpen, setChangelogOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    // The notice, until it's closed (once for each new one)
    const [notice, setNotice] = useState<Notice>();
    useEffect(() => {
        let mounted = true;
        loadNotice().then((loaded) => {
            if (mounted && loaded && shouldShowNotice(loaded)) {
                setNotice(loaded);
            }
        });
        return () => {
            mounted = false;
        };
    }, []);
    const closeNotice = useCallback(() => {
        if (notice) {
            markNoticeSeen(notice);
        }
        setNotice(undefined);
    }, [notice]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (notice) {
                if (e.code === "Enter" || e.code === "Space" || e.code === "Escape") {
                    closeNotice();
                }
            } else if (changelogOpen || settingsOpen) {
                if (e.code === "Escape") {
                    setChangelogOpen(false);
                    setSettingsOpen(false);
                }
            } else if (
                e.code === "Space" ||
                // Enter on something focused from the keyboard is for that instead
                (e.code === "Enter" && !(e.target as HTMLElement).closest("button, a"))
            ) {
                client.showScreen("characters");
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [client, changelogOpen, settingsOpen, notice, closeNotice]);
    if (changelogOpen) {
        return (
            <div className="ui-fill ui-center">
                <ChangelogPanel onClose={() => setChangelogOpen(false)} />
            </div>
        );
    }
    if (settingsOpen) {
        return (
            <div className="ui-fill ui-center">
                <SettingsPanel ui={ui} client={client} onClose={() => setSettingsOpen(false)} />
            </div>
        );
    }
    return (
        <div className="ui-fill ui-title">
            <div className="ui-title-logo">
                <h1>Run Escape</h1>
                <p>
                    Survive fifteen minutes and beat the boss. Wins and tasks bring new places and
                    adventurers.
                </p>
            </div>
            <div className="ui-title-bottom">
                <div className="ui-panel rs-border rs-background ui-title-menu">
                    <div className="ui-title-play">
                        <button
                            className="ui-button ui-button-big"
                            onClick={() => {
                                enterFullscreen();
                                client.showScreen("characters");
                            }}
                        >
                            Singleplayer
                        </button>
                        {ui.coop.available && (
                            <button
                                className="ui-button ui-button-big"
                                onClick={() => client.openCoop()}
                            >
                                Multiplayer
                            </button>
                        )}
                    </div>
                    <div className="ui-title-tiles">
                        <TitleTile
                            name="Skills"
                            spriteId={TITLE_TAB_SPRITES.skills}
                            onClick={() => client.showScreen("shop")}
                        />
                        <TitleTile
                            name="Armoury"
                            spriteId={TITLE_TAB_SPRITES.armoury}
                            onClick={() => client.showScreen("armoury")}
                        />
                        <TitleTile
                            name="Quests"
                            spriteId={TITLE_TAB_SPRITES.quests}
                            onClick={() => client.showScreen("quests")}
                        />
                        <TitleTile
                            name="Collection log"
                            objId={COLLECTION_LOG_OBJ}
                            onClick={() => client.showScreen("collectionLog")}
                        />
                    </div>
                    <div className="ui-title-stats">
                        <Coins amount={save.coins} />
                        <TitleStat name="Runs" value={save.runs} />
                        <TitleStat name="Wins" value={save.victories} />
                        <TitleStat name="Best" value={formatTime(save.bestSeconds)} />
                        <TitleStat name="Best level" value={save.bestLevel} />
                    </div>
                </div>
                <div className="ui-hint">
                    {isCoarsePointer
                        ? "Drag anywhere to move · weapons fire on their own"
                        : "WASD to move · weapons fire on their own · Esc to pause · M to mute"}
                </div>
            </div>
            <div className="ui-title-utils">
                {import.meta.env.DEV && <MapGeneratorButton client={client} />}
                <button className="ui-version" onClick={() => setChangelogOpen(true)}>
                    v{GAME_VERSION} · What's new
                </button>
                <button
                    className="ui-title-link ui-title-settings"
                    title="Settings"
                    aria-label="Settings"
                    onClick={() => setSettingsOpen(true)}
                >
                    <ItemIcon objId={-1} spriteId={TITLE_TAB_SPRITES.settings} />
                </button>
                <DiscordLink />
                <GitHubLink />
            </div>
            {notice && <NoticePanel notice={notice} onClose={closeNotice} />}
        </div>
    );
}

const STYLE_NAMES: Record<CombatStyle, string> = {
    melee: "Melee",
    ranged: "Ranged",
    magic: "Magic",
};

const STYLES: CombatStyle[] = ["melee", "ranged", "magic"];

// The Very rare weapon only this class can find
function getClassTreasure(style: CombatStyle) {
    return WEAPONS.find((w) => w.style === style && w.rarity === "veryRare");
}

export function getStartingWeaponIcon(character: CharacterDef): number {
    const weapon = getWeapon(character.startingWeapon);
    return weapon.levels[0].objId ?? weapon.iconObjId;
}

// Adventurers on the left and maps on the right, so the adventurer picked
// stands in view between them
function CharacterScreen({ ui, client }: ScreenProps): JSX.Element {
    return (
        <div className="ui-fill ui-select">
            <AdventurerPanel ui={ui} client={client} />
            <MapPanel ui={ui} client={client} />
            <div className="ui-panel rs-border rs-background ui-select-bar">
                <button className="ui-button" onClick={() => client.showScreen("title")}>
                    Back
                </button>
                <Coins amount={ui.save.coins} />
                <EndlessSwitch ui={ui} client={client} />
                <button
                    className="ui-button ui-button-go ui-select-go"
                    onClick={() => client.startRun()}
                >
                    Enter {getMap(ui.mapId).name}
                    {ui.endless && !getMap(ui.mapId).fun && " endless"}
                </button>
            </div>
        </div>
    );
}

// Endless runs for the map picked, once it's been beaten (fun maps are
// always endless)
function EndlessSwitch({ ui, client }: ScreenProps): JSX.Element {
    if (getMap(ui.mapId).fun) {
        return (
            <div
                className="ui-endless"
                title="Fun maps are endless: a new round every fifteen minutes."
            >
                <span className="ui-endless-name">Endless</span>
                <span className="ui-endless-hint">Always</span>
            </div>
        );
    }
    const open = isEndlessUnlocked(ui.save, ui.mapId);
    return (
        <div
            className={"ui-endless" + (open ? "" : " ui-endless-locked")}
            title={
                open
                    ? "Round after round, each tougher than the last, until you fall. " +
                      "Your weapons, passives and gear keep getting stronger too."
                    : `Beat ${getMap(ui.mapId).name} to play it endless`
            }
        >
            <span className="ui-endless-name">Endless</span>
            {open ? (
                <Toggle on={ui.endless} label="Endless" onToggle={() => client.toggleEndless()} />
            ) : (
                <span className="ui-endless-hint">Beat the map</span>
            )}
        </div>
    );
}

// A pointer leaving a panel goes back to what's picked. Not a finger: browsers
// follow a tap with a mouse leaving, which would take away what was tapped.
function stopPeeking(setPeek: (id: undefined) => void): (() => void) | undefined {
    return isCoarsePointer ? undefined : () => setPeek(undefined);
}

// Adventurers by how they fight, each a tile of their outfit with the weapon
// they start with in its corner. The details pinned below are for the one
// pointed at (or tapped, so a locked one can say what it takes) until the
// pointer leaves the panel, then the one picked. Only moving the pointer
// changes it: the list scrolling under a still pointer doesn't.
export function AdventurerPanel({ ui, client }: ScreenProps): JSX.Element {
    const unlocked = ui.save.unlockedCharacters;
    const [peek, setPeek] = useState<string>();
    const opened = CHARACTERS.filter((c) => unlocked.includes(c.id)).length;
    return (
        <div
            className="ui-panel rs-border rs-background ui-select-panel ui-select-adventurers"
            onMouseLeave={stopPeeking(setPeek)}
        >
            <h2 className="ui-select-heading">
                Adventurer
                <span className="ui-select-count">
                    {opened} / {CHARACTERS.length}
                </span>
            </h2>
            <div className="ui-select-scroll">
                {STYLES.map((style) => {
                    const treasure = getClassTreasure(style);
                    return (
                        <div key={style} className="ui-style-group">
                            <div className="ui-style-name">
                                {STYLE_NAMES[style]}
                                {treasure && (
                                    <span className="ui-style-treasure">
                                        might find the{" "}
                                        <span style={{ color: RARITIES.veryRare.color }}>
                                            {treasure.name}
                                        </span>
                                    </span>
                                )}
                            </div>
                            <div className="ui-tiles">
                                {CHARACTERS.filter((c) => c.style === style).map((character) => {
                                    const selected = character.id === ui.characterId;
                                    return (
                                        <button
                                            key={character.id}
                                            className={
                                                "ui-card ui-tile" +
                                                (selected ? " ui-card-selected" : "") +
                                                (unlocked.includes(character.id)
                                                    ? ""
                                                    : " ui-card-locked")
                                            }
                                            aria-label={character.name}
                                            aria-pressed={selected}
                                            onMouseMove={() => setPeek(character.id)}
                                            onFocus={() => setPeek(character.id)}
                                            onBlur={() => setPeek(undefined)}
                                            onClick={() => {
                                                setPeek(character.id);
                                                client.selectCharacter(character.id);
                                            }}
                                        >
                                            <ItemIcon
                                                objId={
                                                    character.equipment[EquipSlot.TORSO] ??
                                                    getStartingWeaponIcon(character)
                                                }
                                                size={34}
                                            />
                                            <span className="ui-tile-badge">
                                                <ItemIcon
                                                    objId={getStartingWeaponIcon(character)}
                                                    size={18}
                                                />
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            <AdventurerDetails save={ui.save} character={getCharacter(peek ?? ui.characterId)} />
        </div>
    );
}

function AdventurerDetails({
    save,
    character,
}: {
    save: SaveData;
    character: CharacterDef;
}): JSX.Element {
    const unlocked = save.unlockedCharacters.includes(character.id);
    return (
        <div className="ui-select-details">
            <div className="ui-select-details-head">
                <ItemIcon objId={getStartingWeaponIcon(character)} size={36} />
                <div>
                    <div className="ui-card-title">{character.name}</div>
                    <div className="ui-card-style">{STYLE_NAMES[character.style]}</div>
                </div>
            </div>
            <div className="ui-card-text">{character.description}</div>
            {!unlocked && character.unlock && (
                <div className="ui-card-cost">{describeUnlockTask(character.unlock)} to unlock</div>
            )}
        </div>
    );
}

// The maps in the order they open, two to a row, the campaign's and then the
// fun ones, with details pinned below like the adventurers'
function MapPanel({ ui, client }: ScreenProps): JSX.Element {
    const save = ui.save;
    const [peek, setPeek] = useState<string>();
    const beaten = CAMPAIGN_MAPS.filter((m) => (save.mapVictories[m.id] ?? 0) > 0).length;
    const tile = (map: MapDef) => {
        const selected = map.id === ui.mapId;
        return (
            <button
                key={map.id}
                className={
                    "ui-card ui-map-tile" +
                    (selected ? " ui-card-selected" : "") +
                    (isMapUnlocked(save, map.id) ? "" : " ui-card-locked")
                }
                aria-pressed={selected}
                onMouseMove={() => setPeek(map.id)}
                onFocus={() => setPeek(map.id)}
                onBlur={() => setPeek(undefined)}
                onClick={() => {
                    setPeek(map.id);
                    client.selectMap(map.id);
                }}
            >
                <ItemIcon objId={map.iconObjId} size={20} />
                <span className="ui-map-name">{map.name}</span>
                {(save.mapVictories[map.id] ?? 0) > 0 && (
                    <span className="ui-beaten" aria-label="Beaten" />
                )}
            </button>
        );
    };
    return (
        <div
            className="ui-panel rs-border rs-background ui-select-panel ui-select-maps"
            onMouseLeave={stopPeeking(setPeek)}
        >
            <h2 className="ui-select-heading">
                Map
                <span className="ui-select-count">
                    {beaten} / {CAMPAIGN_MAPS.length} beaten
                </span>
            </h2>
            <div className="ui-select-scroll">
                <div className="ui-style-group">
                    <div className="ui-style-name">
                        Seasonal
                        <span className="ui-style-treasure">open from the start</span>
                    </div>
                    <div className="ui-map-list">{SEASONAL_MAPS.map(tile)}</div>
                </div>
                <div className="ui-style-group">
                    <div className="ui-style-name">Campaign</div>
                    <div className="ui-map-list">{CAMPAIGN_MAPS.map(tile)}</div>
                </div>
                <div className="ui-style-group">
                    <div className="ui-style-name">
                        Fun maps
                        <span className="ui-style-treasure">endless, open from the start</span>
                    </div>
                    <div className="ui-map-list">{FUN_MAPS.map(tile)}</div>
                </div>
                {DEV_MAPS.length > 0 && (
                    <div className="ui-style-group">
                        <div className="ui-style-name">
                            Dev maps
                            <span className="ui-style-treasure">dev server only</span>
                        </div>
                        <div className="ui-map-list">{DEV_MAPS.map(tile)}</div>
                    </div>
                )}
            </div>
            <MapDetails save={save} map={getMap(peek ?? ui.mapId)} />
        </div>
    );
}

function MapDetails({ save, map }: { save: SaveData; map: MapDef }): JSX.Element {
    const wins = save.mapVictories[map.id] ?? 0;
    const unlocked = isMapUnlocked(save, map.id);
    const endless = save.endlessBest[map.id];
    return (
        <div className="ui-select-details">
            <div className="ui-select-details-head">
                <ItemIcon objId={map.iconObjId} size={36} />
                <div>
                    <div className="ui-card-title">{map.name}</div>
                    <div className={unlocked ? "ui-card-style" : "ui-card-cost"}>
                        {map.fun
                            ? map.fun.character
                                ? `Fun map, endless. You play as ${getCharacter(map.fun.character).name}.`
                                : "Fun map, endless"
                            : !unlocked
                              ? `Beat ${MAPS[MAPS.indexOf(map) - 1].name} to unlock`
                              : wins > 0
                                ? `Beaten ${wins === 1 ? "once" : `${wins} times`}`
                                : "Not beaten yet"}
                    </div>
                    {endless && (
                        <div className="ui-card-style">
                            Endless best: round {endless.round}, {formatTime(endless.seconds)}
                        </div>
                    )}
                </div>
            </div>
            <div className="ui-card-text">{map.description}</div>
            <MapTasks save={save} mapId={map.id} />
        </div>
    );
}

// What a map's tasks bring in, task by task: adventurers (by the weapon they
// start with) and items, faded until they're earned
function MapTasks({ save, mapId }: { save: SaveData; mapId: string }): JSX.Element {
    const earned = (reward: MapReward) =>
        reward.kind === "character"
            ? save.unlockedCharacters.includes(reward.id)
            : save.unlockedItems.includes(reward.id);
    const tasks = new Map<string, MapReward[]>();
    for (const reward of getMapRewards(mapId)) {
        const task = describeUnlockTask(reward.unlock, false);
        tasks.set(task, [...(tasks.get(task) ?? []), reward]);
    }
    return (
        <div className="ui-tasks">
            {[...tasks].map(([task, rewards]) => (
                <div
                    key={task}
                    className={"ui-task" + (rewards.every(earned) ? " ui-task-done" : "")}
                >
                    <span className="ui-task-name">{task}:</span>
                    {rewards.map((reward) => (
                        <span
                            key={reward.kind + reward.id}
                            className={"ui-reward" + (earned(reward) ? "" : " ui-reward-locked")}
                        >
                            <ItemIcon objId={reward.iconObjId} size={20} />
                            {reward.name}
                        </span>
                    ))}
                </div>
            ))}
        </div>
    );
}

function ShopScreen({ ui, client }: ScreenProps): JSX.Element {
    const save = ui.save;
    return (
        <div className="ui-fill ui-center">
            <div className="ui-panel rs-border rs-background ui-shop">
                <h2>Skills</h2>
                <p className="ui-subtle">Coins found in runs train your skills for good.</p>
                <div className="ui-shop-grid">
                    {SHOP_UPGRADES.map((upgrade) => {
                        const rank = save.upgrades[upgrade.id] ?? 0;
                        const cost = getNextUpgradeCost(save, upgrade.id);
                        const affordable = cost !== undefined && save.coins >= cost;
                        return (
                            <button
                                key={upgrade.id}
                                className={
                                    "ui-card ui-shop-card" + (affordable ? "" : " ui-card-dim")
                                }
                                disabled={cost === undefined}
                                onClick={() => client.buyUpgrade(upgrade.id)}
                            >
                                <div className="ui-card-title">{upgrade.name}</div>
                                <div className="ui-card-text">{upgrade.description}</div>
                                <div className="ui-pips">
                                    {Array.from({ length: upgrade.maxRank }, (_, i) => (
                                        <span
                                            key={i}
                                            className={i < rank ? "ui-pip ui-pip-on" : "ui-pip"}
                                        />
                                    ))}
                                </div>
                                <div className="ui-card-cost">
                                    {cost === undefined ? "Maxed" : <Coins amount={cost} />}
                                </div>
                            </button>
                        );
                    })}
                </div>
                <div className="ui-row">
                    <button className="ui-button" onClick={() => client.showScreen("title")}>
                        Back
                    </button>
                    <Coins amount={save.coins} />
                    <button
                        className="ui-button"
                        disabled={save.upgradesSpent === 0}
                        onClick={() => client.refundUpgrades()}
                    >
                        Refund all
                    </button>
                </div>
            </div>
        </div>
    );
}

function RunScreen({ ui, client }: ScreenProps): JSX.Element {
    const hud = ui.hud;
    return (
        <div className="ui-fill ui-run">
            {hud && <Hud hud={hud} client={client} questTracker={ui.display.questTracker} />}
            {ui.party.length > 0 && <PartyFrames party={ui.party} />}
            {ui.waitingOn.length > 0 && (ui.overlay === "none" || ui.overlay === "paused") && (
                <WaitingNote names={ui.waitingOn} />
            )}
            {isCoarsePointer && hud && (
                <TouchControls hud={hud} overlay={ui.overlay} client={client} />
            )}
            <div className="ui-toasts">
                {ui.coop.draining && ui.coop.endlessDeadline && ui.coop.room && !ui.result && (
                    <div className="ui-toast" role="status">
                        Maintenance: this run ends at{" "}
                        {new Date(ui.coop.endlessDeadline).toLocaleTimeString()}. Earned progress
                        will be kept.
                    </div>
                )}
                {ui.toasts.map((toast) => (
                    <div key={toast.id} className="ui-toast">
                        {toast.text}
                    </div>
                ))}
            </div>
            {ui.overlay === "levelUp" && <LevelUpModal ui={ui} client={client} />}
            {ui.overlay === "chest" && ui.chest && (
                <ChestModal
                    key={ui.chest.uid}
                    chest={ui.chest}
                    rerolls={hud?.rerolls ?? 0}
                    client={client}
                />
            )}
            {ui.overlay === "event" && ui.event && (
                <EventModal
                    key={ui.event.uid}
                    event={ui.event}
                    coins={hud?.coins ?? 0}
                    client={client}
                />
            )}
            {ui.overlay === "paused" && hud && <PauseModal ui={ui} hud={hud} client={client} />}
            {(ui.overlay === "dead" || ui.overlay === "victory") && (
                <ResultModal ui={ui} client={client} />
            )}
        </div>
    );
}

// "3", "max", and past the last level (endless runs) "+2"
function formatSlotLevel(slot: SlotView): string {
    if (slot.level > slot.maxLevel) {
        return `+${slot.level - slot.maxLevel}`;
    }
    return slot.level === slot.maxLevel ? "max" : String(slot.level);
}

// A weapon or passive in the HUD, with what it does on a card shown while
// it's pointed at
function Slots({ slots, max }: { slots: SlotView[]; max: number }): JSX.Element {
    return (
        <div className="ui-slots">
            {Array.from({ length: max }, (_, i) => {
                const slot = slots[i];
                return (
                    <div
                        key={i}
                        className={"ui-slot" + (slot?.evolution?.ready ? " ui-slot-evolve" : "")}
                        style={slot ? { borderColor: slot.rarityColor } : undefined}
                    >
                        {slot && (
                            <>
                                <ItemIcon
                                    objId={slot.iconObjId}
                                    spriteId={slot.iconSpriteId}
                                    size={30}
                                />
                                <span className="ui-slot-level">{formatSlotLevel(slot)}</span>
                                <div className="ui-slot-tip rs-border rs-background">
                                    <div style={{ color: slot.rarityColor }}>{slot.name}</div>
                                    <div className="ui-slot-tip-level">
                                        {slot.level >= slot.maxLevel
                                            ? "Max level"
                                            : `Level ${slot.level} of ${slot.maxLevel}`}
                                    </div>
                                    {slot.stats?.map((line) => (
                                        <div key={line}>{line}</div>
                                    ))}
                                    {slot.detail && <div>{slot.detail}</div>}
                                    {slot.evolution && <EvolutionLine {...slot.evolution} />}
                                </div>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// How far a weapon has got towards its evolution, each half ticked off
function EvolutionLine({
    passive,
    maxed,
    hasPassive,
    ready,
}: NonNullable<SlotView["evolution"]>): JSX.Element {
    return ready ? (
        <div className="ui-evolve-ready">Ready to evolve</div>
    ) : (
        <div className="ui-evolve-line">
            Evolves with:{" "}
            <span className={maxed ? "ui-evolve-done" : undefined}>
                {maxed ? "✓" : "✗"} Max level
            </span>
            ,{" "}
            <span className={hasPassive ? "ui-evolve-done" : undefined}>
                {hasPassive ? "✓" : "✗"} {passive}
            </span>
        </div>
    );
}

// Worn gear, small, under the weapons and passives
function GearSlots({ gear }: { gear: GearSlotView[] }): JSX.Element {
    return (
        <div className="ui-slots ui-gear-slots">
            {gear.map((slot) => (
                <div
                    key={slot.slot}
                    className="ui-slot ui-gear-slot"
                    style={slot.item ? { borderColor: slot.item.rarity.color } : undefined}
                    title={
                        slot.item
                            ? `${slot.item.name}: ${slot.item.lines.join(", ")}` +
                              (slot.item.set ? `\n${slot.item.set.text}` : "")
                            : `${slot.name} (empty)`
                    }
                >
                    {slot.item ? (
                        <ItemIcon objId={slot.item.objId} size={22} />
                    ) : (
                        <span className="ui-gear-empty">{slot.name[0]}</span>
                    )}
                </div>
            ))}
        </div>
    );
}

// Utility items, used with 1-4 or a click
function Inventory({
    inventory,
    client,
}: {
    inventory: InventorySlotView[];
    client: GameClient;
}): JSX.Element {
    return (
        <div className="ui-inventory">
            {inventory.map((slot, i) => (
                <button
                    key={i}
                    data-silent
                    className="ui-inv-slot"
                    style={slot ? { borderColor: slot.item.rarity.color } : undefined}
                    disabled={!slot}
                    title={slot ? `${slot.item.name}: ${slot.item.lines.join(" ")}` : ""}
                    // Keep focus on the game, so Space doesn't press it again
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => client.useItem(i)}
                >
                    <span className="ui-inv-key">{i + 1}</span>
                    {slot && <ItemIcon objId={slot.item.objId} size={30} />}
                    {slot && slot.count > 1 && <span className="ui-inv-count">{slot.count}</span>}
                </button>
            ))}
        </div>
    );
}

function Buffs({ buffs }: { buffs: BuffView[] }): JSX.Element {
    return (
        <div className="ui-buffs">
            {buffs.map((buff) => (
                <div
                    key={buff.id}
                    className={buff.harmful ? "ui-buff ui-buff-harmful" : "ui-buff"}
                    title={buff.name}
                >
                    <ItemIcon objId={buff.objId} size={24} />
                    <span>{buff.secondsLeft}s</span>
                    <div className="ui-buff-bar" style={{ width: `${buff.fraction * 100}%` }} />
                </div>
            ))}
        </div>
    );
}

function Hud({
    hud,
    client,
    questTracker,
}: {
    hud: HudView;
    client: GameClient;
    questTracker: boolean;
}): JSX.Element {
    const bossIn = hud.bossIn;
    return (
        <>
            <div className="ui-xp">
                <div className="ui-xp-fill" style={{ width: `${hud.xpFraction * 100}%` }} />
                <span className="ui-xp-level">Level {hud.level}</span>
            </div>
            <div className="ui-hud-top">
                <div className="ui-hud-left">
                    <Slots slots={hud.weapons} max={hud.maxWeapons} />
                    <Slots slots={hud.passives} max={hud.maxPassives} />
                    <GearSlots gear={hud.gear} />
                </div>
                <div className="ui-timer">{formatTime(hud.seconds)}</div>
                <div className="ui-hud-right">
                    <Minimap client={client} />
                    <div>
                        <span className="ui-skull">☠</span> {hud.kills.toLocaleString()}
                    </div>
                    <Coins amount={hud.coins} />
                    {hud.round !== undefined && <div className="ui-round">Round {hud.round}</div>}
                    {hud.quests.length > 0 && (
                        <QuestTracker quests={hud.quests} open={questTracker} client={client} />
                    )}
                    <div className="ui-dps">
                        <span className="ui-dps-label">DPS</span> {formatPerSecond(hud.dps)}
                    </div>
                </div>
            </div>
            {hud.boss ? (
                <div className="ui-boss">
                    <div className="ui-boss-name">
                        {hud.boss.name}
                        {hud.boss.enraged && <span className="ui-boss-enraged"> (enraged)</span>}
                        {hud.boss.fight && (
                            <span className="ui-boss-phase">
                                {" "}
                                Phase {hud.boss.fight.phase}/{hud.boss.fight.phases}
                            </span>
                        )}
                    </div>
                    {hud.boss.fight?.stage === "totems" ? (
                        <div className="ui-boss-totems">
                            {hud.boss.fight.totems.map((charge, i) => (
                                <div key={i} className="ui-boss-bar ui-boss-totem">
                                    <div
                                        className="ui-boss-fill ui-boss-fill-totem"
                                        style={{ width: `${charge * 100}%` }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="ui-boss-bar">
                            <div
                                className={
                                    hud.boss.fight
                                        ? "ui-boss-fill ui-boss-fill-shield"
                                        : "ui-boss-fill"
                                }
                                style={{ width: `${hud.boss.fraction * 100}%` }}
                            />
                        </div>
                    )}
                    {hud.boss.fight && (
                        <div className="ui-boss-status">
                            {hud.boss.fight.stage === "totems"
                                ? "Charge the totems!"
                                : "Break her shield!"}
                            {hud.boss.fight.curseAttacks !== undefined && (
                                <span className="ui-boss-curse">
                                    {" "}
                                    Cursed: {hud.boss.fight.curseAttacks}
                                </span>
                            )}
                            {hud.boss.fight.parasiteSeconds !== undefined && (
                                <span className="ui-boss-curse">
                                    {" "}
                                    Parasite: {Math.ceil(hud.boss.fight.parasiteSeconds)}s
                                </span>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                bossIn <= 60 && (
                    <div className="ui-boss-warning">
                        {getMap(hud.mapId).finalBossWarning} {Math.ceil(bossIn)}s
                    </div>
                )
            )}
            <div className="ui-hud-bottom">
                {hud.buffs.length > 0 && <Buffs buffs={hud.buffs} />}
                <Inventory inventory={hud.inventory} client={client} />
                <div className={hud.poisoned ? "ui-hp ui-hp-poisoned" : "ui-hp"}>
                    <div
                        className="ui-hp-fill"
                        style={{ width: `${(hud.hp / hud.maxHp) * 100}%` }}
                    />
                    <span>
                        {hud.hp} / {hud.maxHp}
                    </span>
                </div>
            </div>
        </>
    );
}

// The client's minimap frame and compass around a canvas the game draws on
// (runs face north, so the compass does too)
function Minimap({ client }: { client: GameClient }): JSX.Element {
    const canvasRef = useCallback(
        (canvas: HTMLCanvasElement | null) => client.setMinimapCanvas(canvas),
        [client],
    );
    return (
        <div className="ui-minimap">
            <canvas className="ui-minimap-map" ref={canvasRef} />
            <img className="ui-minimap-frame" src={minimapFrame} />
            <img className="ui-minimap-compass" src={compass} />
        </div>
    );
}

// A weapon's stats on a level up card: "Damage 10 → 13", the new value green
// when it's better
function ChoiceStats({ stats }: { stats: WeaponStatLine[] }): JSX.Element {
    return (
        <div className="ui-choice-stats">
            {stats.map((line) => (
                <span key={line.label} className="ui-choice-stat">
                    <span className="ui-choice-stat-label">{line.label}</span>{" "}
                    {line.from !== undefined && <>{line.from} → </>}
                    <span
                        className={
                            line.from === undefined
                                ? undefined
                                : line.better
                                  ? "ui-choice-stat-up"
                                  : "ui-choice-stat-down"
                        }
                    >
                        {line.value}
                    </span>
                </span>
            ))}
        </div>
    );
}

function LevelUpModal({ ui, client }: ScreenProps): JSX.Element {
    // The godsword's hilt is picked as the rest of the level up that took it
    // to its hilt level
    const hilt = ui.choices.some((choice) => choice.isHilt);
    const spell = ui.choices.some((choice) => choice.isSpell);
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-levelup">
                <h2>
                    {spell
                        ? "Choose your Ancient spell!"
                        : hilt
                          ? "Your godsword needs a hilt!"
                          : "Congratulations, you've advanced a level!"}
                </h2>
                <p className="ui-subtle">
                    {spell
                        ? "It keeps its level, and it's your only burst this run:"
                        : hilt
                          ? "Pick the god whose hilt it takes, and with it its special attack:"
                          : `You are now level ${ui.hud?.level}. Choose a reward:`}
                </p>
                <div className="ui-choices">
                    {ui.choices.map((choice, i) => (
                        <button
                            key={i}
                            className={
                                "ui-card ui-choice" +
                                (choice.isEvolution ? " ui-choice-evolve" : "")
                            }
                            style={choice.rarity ? { borderColor: choice.rarity.color } : undefined}
                            onClick={() => client.choose(i)}
                        >
                            <span className="ui-choice-key">{i + 1}</span>
                            <ItemIcon
                                objId={choice.iconObjId}
                                spriteId={choice.iconSpriteId}
                                size={44}
                            />
                            <div className="ui-card-body">
                                <div className="ui-card-title">
                                    {choice.title}
                                    {choice.isNew && <span className="ui-tag">New!</span>}
                                    {choice.isEvolution && (
                                        <span className="ui-tag ui-tag-evolve">Evolution!</span>
                                    )}
                                    {choice.isHilt && (
                                        <span className="ui-tag ui-tag-evolve">
                                            {choice.isSpell ? "Spell" : "Hilt"}
                                        </span>
                                    )}
                                </div>
                                <div className="ui-card-text">{choice.text}</div>
                                {choice.evolves && (
                                    <div
                                        className={
                                            "ui-card-evolves" +
                                            (choice.evolves.held ? " ui-card-evolves-held" : "")
                                        }
                                    >
                                        {choice.evolves.text}
                                    </div>
                                )}
                                {choice.stats && choice.stats.length > 0 && (
                                    <ChoiceStats stats={choice.stats} />
                                )}
                            </div>
                            {choice.rarity && (
                                <span className="ui-rarity" style={{ color: choice.rarity.color }}>
                                    {choice.rarity.name}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
                {!hilt && (
                    <div className="ui-levelup-actions">
                        <RerollButton
                            rerolls={ui.hud?.rerolls ?? 0}
                            onReroll={() => client.reroll()}
                        />
                        {ui.hud?.skip && (
                            <SkipButton
                                cost={ui.hud.skip.cost}
                                affordable={ui.hud.skip.affordable}
                                onSkip={() => client.skip()}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// The quests this run is getting on with, under the minimap: click the title
// (or press Q) to fold it away
function QuestTracker({
    quests,
    open,
    client,
}: {
    quests: QuestTrackView[];
    open: boolean;
    client: GameClient;
}): JSX.Element {
    return (
        <div className="ui-quest-tracker">
            <button
                className="ui-quest-tracker-title"
                onClick={() => client.toggleQuestTracker()}
                title="Show or hide the quests (Q)"
            >
                Quests {open ? "▾" : "▸"}
            </button>
            {open &&
                quests.map((quest) => (
                    <div
                        key={quest.id}
                        className={"ui-quest-track " + questTrackClass(quest)}
                        title={quest.task}
                    >
                        <span className="ui-quest-track-name">{quest.name}</span>
                        <span className="ui-quest-track-progress">
                            {formatQuestProgress(quest)}
                        </span>
                    </div>
                ))}
        </div>
    );
}

// Coloured like the quest tab: red until started, yellow while under way,
// green once done
function questTrackClass(quest: QuestTrackView): string {
    return quest.finished ? "ui-quest-done" : quest.done > 0 ? "ui-quest-started" : "ui-quest-new";
}

function formatQuestProgress(quest: QuestTrackView): string {
    return quest.finished
        ? "Done"
        : `${quest.done.toLocaleString()} / ${quest.of.toLocaleString()}`;
}

function PauseModal({
    ui,
    hud,
    client,
}: {
    ui: UiSnapshot;
    hud: HudView;
    client: GameClient;
}): JSX.Element {
    // Co-op's menu doesn't stop the run
    const coop = ui.party.length > 0;
    // The host can remove anyone still in the run (one who's stopped playing)
    const kickable =
        coop && ui.coop.room?.hostId === ui.coop.you
            ? ui.party.filter((member) => member.id && !member.left)
            : [];
    return (
        <div className={coop ? "ui-modal ui-modal-clear" : "ui-modal"}>
            <div className="ui-panel rs-border rs-background ui-pause">
                <h2>{coop ? "Menu" : "Paused"}</h2>
                {coop && <p className="ui-subtle">The run carries on while you're in here.</p>}
                <div className="ui-pause-columns">
                    <div className="ui-pause-column">
                        <div className="ui-pause-list">
                            {[...hud.weapons, ...hud.passives].map((slot) => (
                                <div key={slot.id} className="ui-pause-item">
                                    <ItemIcon
                                        objId={slot.iconObjId}
                                        spriteId={slot.iconSpriteId}
                                        size={28}
                                    />
                                    {/* The name, and what it does under it */}
                                    <span className="ui-pause-name">
                                        <span style={{ color: slot.rarityColor }}>{slot.name}</span>
                                        <span className="ui-pause-detail">
                                            {[...(slot.stats ?? []), slot.detail]
                                                .filter((text) => text)
                                                .join(", ")}
                                        </span>
                                        {slot.evolution && <EvolutionLine {...slot.evolution} />}
                                    </span>
                                    <span className="ui-pause-level">
                                        {slot.level >= slot.maxLevel
                                            ? "max"
                                            : `level ${slot.level}`}
                                    </span>
                                </div>
                            ))}
                        </div>
                        {hud.stats.length > 0 && (
                            <>
                                <h3 className="ui-pause-heading">Your stats</h3>
                                <div className="ui-pause-stats">
                                    {hud.stats.map((line) => (
                                        <span key={line}>{line}</span>
                                    ))}
                                </div>
                            </>
                        )}
                        {hud.gear.some((slot) => slot.item) && (
                            <>
                                <h3 className="ui-pause-heading">Worn equipment</h3>
                                <div className="ui-pause-list">
                                    {hud.gear.map(
                                        ({ slot, item }) =>
                                            item && (
                                                <div key={slot} className="ui-pause-item">
                                                    <ItemIcon objId={item.objId} size={28} />
                                                    <span style={{ color: item.rarity.color }}>
                                                        {item.name}
                                                    </span>
                                                    <span className="ui-pause-detail">
                                                        {item.lines.join(", ")}
                                                        {item.set && (
                                                            <span
                                                                className={
                                                                    "ui-pause-set" +
                                                                    (item.set.active
                                                                        ? " ui-pause-set-on"
                                                                        : "")
                                                                }
                                                            >
                                                                {item.set.text}
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            ),
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    <div className="ui-pause-column">
                        {hud.quests.length > 0 && (
                            <>
                                <h3 className="ui-pause-heading">Quests</h3>
                                <div className="ui-pause-list">
                                    {hud.quests.map((quest) => (
                                        <div
                                            key={quest.id}
                                            className={"ui-pause-quest " + questTrackClass(quest)}
                                        >
                                            <span className="ui-quest-name">{quest.name}</span>
                                            <span className="ui-pause-detail">{quest.task}</span>
                                            <span className="ui-quest-progress">
                                                {formatQuestProgress(quest)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        {kickable.length > 0 && (
                            <>
                                <h3 className="ui-pause-heading">Party</h3>
                                <div className="ui-pause-list">
                                    {kickable.map((member) => (
                                        <div key={member.id} className="ui-pause-item">
                                            <span className="ui-pause-name">{member.name}</span>
                                            <button
                                                className="ui-button ui-button-small ui-coop-kick"
                                                title={`Remove ${member.name} from the run`}
                                                aria-label={`Kick ${member.name}`}
                                                onClick={() => client.kickPlayer(member.id!)}
                                            >
                                                Kick
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        <h3 className="ui-pause-heading">Settings</h3>
                        <SoundSettings
                            ui={ui}
                            client={client}
                            music={getMap(ui.mapId).music !== undefined}
                        />
                        <AutoPauseSetting ui={ui} client={client} />
                        <AutoAlchSetting ui={ui} client={client} />
                    </div>
                </div>
                <div className="ui-row">
                    <button
                        className="ui-button"
                        title={
                            coop && ui.coop.room?.hostId === ui.coop.you
                                ? "You're the host: leaving ends the run for everyone"
                                : undefined
                        }
                        onClick={() => client.quitRun()}
                    >
                        {coop ? "Leave the run" : "Give up"}
                    </button>
                    <button className="ui-button ui-button-go" onClick={() => client.resume()}>
                        Resume
                    </button>
                </div>
            </div>
        </div>
    );
}

// Co-op's results name everyone else
const MAX_LISTED_TEAMMATES = 3;

// "Coif, Rune boots and Seers ring", or the first few "and 5 more"
function listNames(names: string[], most = 3): string {
    if (names.length === 1) {
        return names[0];
    }
    const shown = names.length > most ? names.slice(0, most - 1) : names.slice(0, -1);
    const rest =
        names.length > most ? `${names.length - shown.length} more` : names[names.length - 1];
    return `${shown.join(", ")} and ${rest}`;
}

// Damage a second, with a decimal while it's small
function formatPerSecond(perSecond: number): string {
    return perSecond < 100_000
        ? perSecond.toLocaleString(undefined, { maximumFractionDigits: perSecond < 10 ? 1 : 0 })
        : formatBig(perSecond);
}

// Big numbers the way OSRS shows a stack: in full up to 99,999, then 100K,
// then 10M, so an endless run's totals still fit
function formatBig(value: number): string {
    const n = Math.round(value);
    if (n < 100_000) {
        return n.toLocaleString();
    }
    if (n < 10_000_000) {
        return `${Math.floor(n / 1000).toLocaleString()}K`;
    }
    return `${Math.floor(n / 1_000_000).toLocaleString()}M`;
}

// A stat's number, shortened when it's big, in full when pointed at
function Big({ value }: { value: number }): JSX.Element {
    const n = Math.round(value);
    return <span title={n >= 100_000 ? n.toLocaleString() : undefined}>{formatBig(n)}</span>;
}

function ResultModal({ ui, client }: ScreenProps): JSX.Element {
    const result = ui.result;
    const victory = ui.overlay === "victory";
    return (
        <div className="ui-modal">
            <div className="ui-panel rs-border rs-background ui-result">
                <h2 className={victory ? "ui-victory" : "ui-defeat"}>
                    {victory && result
                        ? getMap(result.mapId).victoryText
                        : (result?.endedEarly ?? "Oh dear, you are dead!")}
                </h2>
                {result?.party && (
                    <p className="ui-subtle">
                        With {listNames(result.party, MAX_LISTED_TEAMMATES)}
                    </p>
                )}
                {result?.endlessRecord && (
                    <p className="ui-unlocked">
                        Your furthest endless run in {getMap(result.mapId).name}!
                    </p>
                )}
                {result?.unlockedMap && (
                    <p className="ui-unlocked">{result.unlockedMap} is open to you now!</p>
                )}
                {result?.unlockedCharacters.map((name) => (
                    <p key={name} className="ui-unlocked">
                        The {name} joins you!
                    </p>
                ))}
                {result?.unlockedItems.map((name) => (
                    <p key={name} className="ui-unlocked">
                        {name} can be found now!
                    </p>
                ))}
                {result && result.newTrophies.length > 0 && (
                    <p className="ui-unlocked">
                        New in the Collection log: {listNames(result.newTrophies)}
                    </p>
                )}
                {result && result.newGear.length > 0 && (
                    <p className="ui-unlocked">New in the Armoury: {listNames(result.newGear)}</p>
                )}
                {result?.quests.map((quest) => (
                    <p key={quest.name} className="ui-unlocked">
                        Quest complete: {quest.name}! <Coins amount={quest.coins} />
                    </p>
                ))}
                {result && (
                    <div className="ui-result-columns">
                        <div className="ui-result-column">
                            <table className="ui-result-table">
                                <tbody>
                                    <tr>
                                        <td>Adventurer</td>
                                        <td>{result.characterName}</td>
                                    </tr>
                                    {result.endless && (
                                        <tr>
                                            <td>Endless round</td>
                                            <td>{result.round}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td>Survived</td>
                                        <td>{formatTime(result.seconds)}</td>
                                    </tr>
                                    <tr>
                                        <td>Level</td>
                                        <td>{result.level}</td>
                                    </tr>
                                    <tr>
                                        <td>Kills</td>
                                        <td>
                                            <Big value={result.kills} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Biggest hit</td>
                                        <td>
                                            <Big value={result.stats.highestHit} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Damage taken</td>
                                        <td>
                                            <Big value={result.stats.damageTaken} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Hitpoints healed</td>
                                        <td>
                                            <Big value={result.stats.healed} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Caskets opened</td>
                                        <td>{result.caskets}</td>
                                    </tr>
                                    {(result.stats.rerollsUsed > 0 || result.stats.skips > 0) && (
                                        <tr>
                                            <td>Rerolls / skips</td>
                                            <td>
                                                {result.stats.rerollsUsed} / {result.stats.skips}
                                            </td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td>Coins banked</td>
                                        <td>
                                            <Coins amount={result.coins} />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            {result.bossKills.length > 0 && (
                                <>
                                    <h3 className="ui-pause-heading">Bosses</h3>
                                    <table className="ui-result-table">
                                        <tbody>
                                            {result.bossKills.map((boss, i) => (
                                                <tr key={i}>
                                                    <td>{boss.name}</td>
                                                    <td>{formatTime(boss.seconds)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>
                        {result.damage.length > 0 && (
                            <div className="ui-result-column">
                                <table className="ui-result-damage">
                                    <thead>
                                        <tr>
                                            <th />
                                            <th>Damage</th>
                                            <th>Kills</th>
                                            <th>DPS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.damage.map((row, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <span className="ui-result-source">
                                                        {row.iconObjId !== undefined && (
                                                            <ItemIcon
                                                                objId={row.iconObjId}
                                                                spriteId={row.iconSpriteId}
                                                                size={24}
                                                            />
                                                        )}
                                                        <span
                                                            className="ui-result-name"
                                                            style={{ color: row.color }}
                                                            title={row.name}
                                                        >
                                                            {row.name}
                                                        </span>
                                                    </span>
                                                </td>
                                                <td>
                                                    <Big value={row.damage} />
                                                </td>
                                                <td>
                                                    <Big value={row.kills} />
                                                </td>
                                                <td>
                                                    {row.perSecond !== undefined
                                                        ? formatPerSecond(row.perSecond)
                                                        : ""}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
                <div className="ui-row">
                    <button className="ui-button ui-button-go" onClick={() => client.leaveRun()}>
                        {ui.coop.room ? "Back to the party" : "Back to the title"}
                    </button>
                </div>
            </div>
        </div>
    );
}
