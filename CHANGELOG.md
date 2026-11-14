# Changelog

What's changed in Run Escape, newest first. The game shows this on its title screen too (click
the version in the corner).

## Unreleased

### Added

- A card generator that renders cache items on the Run Escape frame, with deck numbering,
  optional foil and a shared vampire back.

## 0.30.0 - 2026-11-09

### Added

- The Keris partisan, by Okaeri: a new melee weapon, unlocked by killing the Kalphite Queen in
  the Desert. Its quick stabs hit kalphites and scarabs harder, Kephri included.
- Tombs of Amascut rewards, by Okaeri: the jewels and the Thread of Elidinis from the raid's
  chest now unlock things. Each jewel unlocks its own keris partisan with a power of its own, and
  the Thread unlocks the Divine rune pouch, which gives you an extra weapon slot for a magic
  weapon, whatever your style.
- Invocation presets, by Okaeri: save up to five sets of Tombs of Amascut invocations and load
  one with a tap.
- A puzzle helper for the Scabaras room, by Okaeri: like the ToA plugin, it shows the order to
  step on the plates, which plates to press, a way to make the tablet's number, and the name of
  each matching symbol. It's on at Entry, and at any raid level once you've beaten the room. You
  can turn it off in Settings.
- Languages, by Iakee: play in English or Português (BR). Pick one with the globe on the
  title screen, in Settings or in the pause menu. Only English is checked: the others may be wrong
  or have text missing.

### Changed

- Boss instructions, by Okaeri: they show once per run, one at a time, and stay up long enough
  to read.
- The Apmeken room's arrow, by Okaeri: the arrow to a pillar or vent that needs fixing is now on
  the floor next to you, not at the edge of the screen.
- The Scabaras room's puzzles, by Okaeri: the screen now lists all four, where each one is, and
  which are done.
- Theatre of Blood's closing rings, by trippy22: a ring of blood, flies or Verzik's blasts that
  closes in round you waits a second where it forms, so there's time to find the way out.

### Fixed

- The Theatre of Blood's expert chest could give a Lil' Zik look you already had. It now gives
  one you haven't got until you have all five. Fixed by Okaeri.
- On phones, the name of your special attack button was cut off. It now sits under the button.
  Fixed by Okaeri.
- Beating a boss in the Tombs of Amascut now heals your whole party to full. Fixed by Okaeri.
- Ba-Ba no longer gets stunned every time she charges into a boulder. Only her Rampage does that
  now. Fixed by Okaeri.
- In the Crondis room, standing under a waterfall now keeps you safe from the poison, like in
  OSRS. Fixed by Okaeri.
- In the Scabaras room, the matching tiles now show their symbols, like in OSRS. Fixed by Okaeri.
- In the Crondis room, the floor now lights up where a spear statue is about to strike. Fixed by
  Okaeri.
- Akkha's room is no longer dark. His symbols light up brightly in their own colours, and a
  quadrant bursts into glowing orbs when it explodes. Fixed by Okaeri.
- Zebak's roar: you're now safe straight behind a boulder, like in OSRS. The safe spots glow
  before he roars, and a wave of dust shows the roar. Fixed by Okaeri.
- Akkha could get stuck repeating Simon says forever once his shadows were out. He now follows
  you into a quarter whose shadow you've killed. Fixed by Okaeri.
- On phones, the Scabaras slate no longer covers the middle of the screen. It's a thin bar along
  the top. Fixed by Okaeri.
- On phones in the Tombs of Amascut, the DPS sat over the special attack button and took some of
  its taps. It's now beside the button.
- A co-op run keeps going when the host's window is covered and stops drawing. Fixed by trippy22.
- In a co-op room, an adventurer picked while the connection was dropping is sent again, and you're
  told if the room never gets it. Fixed by trippy22.
- A co-op player who changes adventurer after readying up is no longer started on their old one:
  changing it un-readies them, and the host waits for them to ready again. Fixed by trippy22.
- Co-op rooms on servers in the UK and France show their flags rather than letters, and rooms in
  Russia, Serbia and Burkina Faso the right letters. Fixed by trippy22.

## 0.29.1 - 2026-11-08

### Changed

- Beneath Cursed Sands, by Okaeri: the quest's bosses hit twice as hard, and armour doesn't stop
  their hits.

## 0.29.0 - 2026-11-08

### Added

- Beneath Cursed Sands, by Okaeri: a new quest, open once the desert's beaten. Fight Coenus, the
  Scarab Mages, the Champion of Scabaras and the Menaphite Akh to open the Tombs of Amascut.
- The Tombs of Amascut, by Okaeri: a new raid, solo or in co-op. Four paths, each a puzzle room
  and a boss (Ba-Ba, Akkha, Kephri and Zebak), then the Wardens, with invocations to set how hard
  it is.

### Fixed

- A casket carried into the next room of the Theatre of Blood could be set down in a wall, out of
  reach. Fixed by Okaeri.

## 0.28.1 - 2026-11-07

### Changed

- Room flags, by trippy22: a room's flag in the co-op list shows where its server is, not where
  its host is.

### Fixed

- Cloud save is in the Windows app and the Android app: 0.28.0's downloads were built without it.
  On Windows, download this release's zip, as updating from inside the app doesn't add it.
- Co-op sends stops promptly and handles quick taps and direction changes with less sliding.
  Fixed by trippy22.

## 0.28.0 - 2026-11-07

### Added

- Android updates, by trippy22: opening the app checks GitHub and offers to download a newer APK,
  then asks before installing it. Offline play still works when the check is unavailable.
- Cloud save, by trippy22: keep a copy of your progress online, and bring it to another browser,
  the Windows app or a phone with a code. No account, name or email. Its button beside Settings
  on the title screen shows whether it's synced and opens it; it's in Settings too.
- Co-op choice countdown, by Deivid Smarzaro: everyone can see when the next automatic reward
  choice is due while the party is still choosing.
- Descriptions, by Deivid Smarzaro: worn equipment and Armoury pieces, and each upgrade along a
  piece's line, show what they do when you point at them. On a touch screen, hold a weapon,
  passive, worn piece or Armoury piece to read it.
- Revives on the HUD, by Deivid Smarzaro: a Ring of life shows beside your active effects until
  it saves you, and the Pyromancer's own revive shows as a phoenix.
- Stat icons, by Iakee: each stat shows its icon from the game's cache wherever it's
  listed, from descriptions and level ups to the pause menu, caskets and the Armoury.

### Changed

- Blocking jungle plants, by Deivid Smarzaro: low wooden bases help distinguish them from
  passable foliage.
- Empty worn-equipment slots show OSRS's equipment silhouettes instead of letters, by Deivid
  Smarzaro.
- The Armadyl crossbow, by Deivid Smarzaro: clearer bolts that upgrade from bronze to dragon as it
  levels.
- The Dragon hunter crossbow fires the same clearer bolts: dragon bolts.
- Co-op's out-of-step message, by trippy22: a guest whose game stops matching the host's is now
  told an integrity check failed.
- Cheat checks on co-op relays, by trippy22: a relay can note a run its checks flag, with no
  names, whether or not Share run stats is on. The setting now says so.
- Preparing game updates, by Deivid Smarzaro: quicker, since only what changed is read from the
  game's cache again.
- The release page, by trippy22: the Windows and Android downloads are linked at the top, above
  the long list of the game's files.
- Theatre of Blood, by Okaeri: the Nylocas are slower, and half as many come in their hall before
  Nylocas Vasilias: there were too many to fight through.
- The game's on the newest Old School RuneScape cache, from 3 November 2026: Lumbridge has an oak
  and a yew by its castle, there are market stalls north-west of the Grand Exchange, and Karil's
  leather has its new colours.

### Fixed

- Thrown knives and the Eclipse atlatl's darts fly point-first, not tail-first.
- Co-op could freeze for half an hour when a connection died without closing (a network that
  dropped, a laptop asleep). Your game now notices within seconds and reconnects, and a player
  who's gone silent is dropped after about five minutes. Fixed by trippy22.
- A co-op run that can't go on (a guest too far behind to catch up, or an error in the game) ends
  with a message instead of freezing everyone. Fixed by trippy22.
- The Armadyl crossbow shows each shot while you run, not only when you stand still: your
  adventurer aims it for a moment as the legs keep running. Fixed by trippy22.
- Melee weapons swing at a big enemy (more than two tiles across) from beside it, as they hit
  it: they waited for its middle to come into reach. Auras, spells, arrows and the rest hit its
  edge every time too, not only some of the time. Fixed by Okaeri.
- Scenery made of overlapping pieces, like the God Wars entrance rock, blocks less of the empty
  ground round its base. Fixed by Deivid Smarzaro.
- Xarpus's exhumeds are smothered as you step on them, rather than after a second's stand, and one
  you miss heals him less: in threes, they got through faster than anyone could reach them. Fixed
  by Okaeri.
- The results screen and the map screen's Enter button say Expert for a Theatre of Blood run on
  expert mode, not Hard. Fixed by Okaeri.
- On a phone, the damage a second and its panel no longer show on top of level ups, caskets,
  random events and the menus.

## 0.27.0 - 2026-11-05

### Added

- Power-up timers, by Deivid Smarzaro: a circle over each power-up on the ground drains from green
  to orange to red as its 30 seconds run out. Settings and the pause menu can turn them off.
- An Android app, by Duplicity: the APK on the release page. The whole game's in it, so
  solo play works offline, even on the first launch, and co-op works online. It doesn't update
  itself: install a new version's APK over the old one. Export and Import in Settings carry a save
  between it and a browser.
- Export reminder, by Okaeri: your progress is kept only on your device, so once you've played a
  run, the title screen offers to export a copy on any day you haven't yet. Not today hides it
  until tomorrow, and an exported save now says when it was made.

### Changed

- Smaller game updates, by trippy22: the game's files from the cache come in parts, and an update
  downloads only the parts that changed, on the website and in the desktop app. The first download
  is smaller too.
- Co-op rooms cost much less to keep running, by trippy22: they sleep between messages on the
  relay, which changes nothing in play.
- The Skills page, by trippy22: every skill fits on the screen at once, without a scroll bar,
  on most computers and tablets.
- Skill prices, by trippy22: the same skills cost the same whatever order you buy them in. Most
  pages of several skills cost less, a whole page about a quarter less, but a cheap skill costs
  more once dearer ones are bought.
- Skills, by Deivid Smarzaro: clearer preset names and an explanation of which adventurers use them.
- The Toxic blowpipe, by Deivid Smarzaro: its darts visibly upgrade from bronze to dragon as it
  levels.
- Co-op caskets, by Okaeri: everyone who's up gets an item of their own from a casket, not just
  whoever picks it up, and the run waits for each of them. Its coins still go to the party once.
  Ordinary kills drop fewer caskets the bigger the party, so each player gets about as many items
  as on their own, and the party about as many casket coins. A player who's down when one's picked
  up misses out.

### Fixed

- From this version on, when the website's updated, a copy of the page the browser kept from
  before reloads itself, rather than stopping partway through loading on a "missing from the
  cache" error. Fixed by trippy22.
- In Phosani's Nightmare, the yellow arrow over her Parasitic eggs now shows on the website and in
  the desktop app. It was missing from their copy of the game's files.
- Any class page can refund single skill ranks, including the ones that needed Refund all first.
  Fixed by trippy22.
- In co-op, the boss health bar shows the boss closest to you, even over the final boss, rather
  than sticking to one copy of it. Fixed by Deivid Smarzaro.

## 0.26.1 - 2026-11-05

### Added

- Overhead prayers, by Okaeri: bosses that pray show OSRS's overhead prayer for it, as the Theatre
  of Blood's do, Protect from Missiles and Magic. Nylocas Vasilias's shows the two styles its colour
  holds back, and changes with it.
- Boss prayer warnings, by Okaeri: in the Theatre of Blood, a ranged or magic weapon's level up
  card says in red how much less damage it does to the bosses, as they pray against it.

### Changed

- Theatre of Blood, by Okaeri: the Maiden was killing nearly every party. She has less than half
  the hitpoints, her blood hits softer and a second apart, her pools are smaller, tick slower and
  fade sooner, and her Blood burst comes half as often, so melee can stay in on her.
- Theatre of Blood, by Okaeri: the bosses after the Maiden hit a third softer, losing the extra
  half 0.25.0 gave their hits, on every mode (expert's own attacks keep theirs).
- Theatre of Blood expert mode, by Okaeri: the small and big Nylocas take three times the damage
  from their own colour's style, so the right weapon brings them down quickly. Nylocas Vasilias is
  unchanged.
- Theatre of Blood, by Okaeri: the Pestilent Bloat goes down only once his flies are out, rather
  than in the middle of his swarm, so there's the whole of his nap to reach him.
- Theatre of Blood, by Okaeri: in a boss room the camera stays on you, as in the halls, moving up
  only as far as keeps the boss below its health bar, rather than leaning towards the boss.

### Fixed

- The Collection log has a tab for each place with finds of its own: the Theatre of Blood's has
  its chest's finds, Lil' Zik and the weapons it brings in, Justiciar Zachariah's has the Dark
  squirrel, and Phosani's Nightmare's has her staff, rather than them all sitting under the
  Hallowed Night or missing. Fixed by Okaeri.
- Theatre of Blood expert mode: the blue Nylocas come in to a couple of tiles to shoot, rather
  than hanging back out of reach of auras like Ice Barrage, which left a mage nothing to hit them
  with. Fixed by Okaeri.
- Theatre of Blood on Safari: the first hall drew as a flat dark red over everything, with
  nothing of the world showing. Fixed by Okaeri.
- Hard and expert mode: a boss's fan of shots (the Maiden's Blood throw) shows a line for every
  shot, rather than fewer lines than shots, which left shots between them. Fixed by Okaeri.
- Justiciar Zachariah: the great owls' plinths no longer flicker against the floor.

## 0.26.0 - 2026-11-05

### Added

- Justiciar Zachariah, a new boss fight on the Bosses tab, open once Phosani's Nightmare is
  beaten: a trial in the Owl's Court, hung in the Hallowed Sepulchre's dark, where the court
  itself is his weapon. You play the Saradominist, with Saradomin Strike, which only reaches him
  from close by. With its own track, Blade of Forgotten Justice.
  - Fight back: dodge his lunge or his shock wave and his guard drops, for double damage; lead
    him into his own court's bolts, or make him lunge into a pillar and he's stunned (not again
    for a few seconds after, as he'll tell you).
  - Smite, the fight's own button (Space, a controller's A, or the button on a touch screen):
    a heavy blow from right beside him, twice as hard while his guard's down. A press a moment
    early still lands.
  - Each phase has its own full health bar.
  - His gaze lights up the court, and the pillars' shadows are where it can't see you.
  - Dust and flashes where his blows land, and a little camera shake. Each of his swings and
    slams lands as his sword falls, and you face him as he comes down. Each new phase is marked:
    a burst of light as he kneels, and a ring across the court as he rises.
  - A pet, the Dark squirrel: 1 in 10 for beating him, and always on hard mode.
- A Screen shake setting, on unless your system asks for less motion.
- Retry on a boss fight's results, to go straight into it again.

### Changed

- Boss fights don't show the item bar: there are no items in them.

## 0.25.0 - 2026-11-05

### Added

- Auto equip, by Deivid Smarzaro: an option in Settings and the pause menu that wears casket gear
  in an empty slot, or gear that beats what's worn without being worse at anything. Anything else
  still asks, as does replacing a piece of a set. Auto alch comes first if both are on.
- Pets, by Okaeri: a pet you've found (the Little Nightmare, Lil' Zik and its looks) can follow
  you around on your runs. Pick one under the adventurers. They're only for looks, and your party
  sees yours in co-op.
- A favourite adventurer, by Okaeri: pick Make favourite in an adventurer's details, and the game
  starts on them every time you open it.
- Item descriptions, by Deivid Smarzaro: hover over an item in your bag, or hold it on a phone,
  to read what it does without using it.
- Run stats, by trippy22: when a run ends, the game sends its map, mode, adventurers and result,
  with nothing that says who played, to help balance the game. Turn it off with Share run stats
  in Settings.

### Changed

- Co-op has moved to a new server, with each room close to its host. In the Windows app, download
  the new zip to keep Multiplayer: older ones can't reach it.
- The co-op rooms list, by trippy22: it updates by itself when rooms open, fill or start, rather
  than every few seconds.
- The co-op menu disconnects after about 10 minutes with nothing happening. Try again reconnects.
- The Theatre of Blood's bosses, by Okaeri: each one a real fight, with a mechanic of its own.
  - Each boss has a mechanic from the real raid: the Maiden's Nylocas crawl to her and feed her,
    Nylocas Vasilias changes colour on normal too, Sotetseg drags you into his shadow realm,
    Xarpus can't be hurt until his exhumeds are smothered, and Verzik's spider throws her yellows.
  - They're much tougher: two and a half to six times their hitpoints, harder hits, and their
    bullets can hit twice as often. They take 15% from missiles and magic, from 30%.
  - Armour takes off at most half of a boss's hit, so Protect from Melee no longer turns them all
    to 1s.
  - Standing on a boss is no longer safe: its bullets start from its middle, and each has an
    attack all round it for whoever's up close, the Maiden, Xarpus and Verzik on her throne a new
    one marked on the ground first.
  - Keeping away isn't safe either: the Pestilent Bloat's flies and Verzik's power blasts close in
    round you, and Verzik's spider leaps on you. The Bloat naps for less of the fight.
  - Hard and expert mode fire half as many bullets again, with the space between them as wide:
    spreads fan out wider, and rings with no way through stay as they are.
  - The raid's green and blue Nylocas shoot from range, Verzik's too.
  - A room's raid points for speed go by how long its boss is meant to take, so a later, longer
    fight is worth as much as a quick early one.
  - The Theatre is brighter, the woods outside Canifis most of all.
- Expert mode in the Theatre of Blood, by Okaeri:
  - Weapons don't aim at, poison or burn a Nylocas they can't hurt, and venom stops when Nylocas
    Vasilias turns to a colour its weapon can't hurt.
  - The Maiden's Nylocas feed her more.
  - Verzik's doom-ball circle is bigger, lasts as long as the ball, and is always somewhere you
    can reach. Her yellows wait until it's landed, and she can't be hurt meanwhile.
  - Nylocas Vasilias's colours take their own style through its prayer, as on normal.
- The Theatre of Blood's weapons come from its chest, by Okaeri: a Ghrazi rapier in the chest
  unlocks the rapier, and on hard or expert the chest can hold the Holy Scythe of Vitur, which
  unlocks the Holy Scythe. Beating the raid no longer unlocks them. Weapons already unlocked stay
  unlocked.

### Fixed

- Augury and Rigour show their prayer icons instead of prayer scrolls. Fixed by Deivid Smarzaro.
- Refunding a skill also gives back what it added to the price of every skill bought after it. Some
  class pages from older saves need Refund all once before single ranks can be refunded again.
  Fixed by Deivid Smarzaro.
- On a phone held sideways, the Multiplayer screen fits, so its Back button is always in reach,
  even with an error showing. Fixed by trippy22.
- Controller button icons showed as broken images in the Windows app. Fixed by Okaeri.
- A PlayStation controller through DS4Windows showed as two controllers taking turns, and its
  buttons did nothing on the menus. Fixed by Okaeri.
- Exporting your save on an iPhone downloads the file, rather than opening it as a page in
  older versions of Safari. Fixed by Okaeri.
- On the Theatre of Blood's expert mode, Xarpus's stare hurts properly. A moment before he turns
  he faces where he'll stare, and says which side. Fixed by Okaeri.
- Turning hard mode off turns expert off with it. Fixed by Okaeri.
- The Theatre of Blood: a room's waves always last five minutes. Killing a boss quickly, or taking
  a portal, used to make the next room's waves longer by the time saved. Fixed by Okaeri.

## 0.24.1 - 2026-11-04

### Changed

- The map screen has a tab for each kind of map: Campaign, Bosses (boss fights and raids) and
  Fun. A map's details have a box of their own under the list, which scrolls for a long one.

### Fixed

- The Theatre of Blood couldn't be picked on the map screen: pointing at it pushed it out from
  under the pointer.

## 0.24.0 - 2026-11-03

### Added

- Raids, by Okaeri: the Theatre of Blood, a new section on the map screen. Six rooms one after
  another, each with its own waves and then its boss in its real room from OSRS, fought as a
  bullet hell. It's a melee raid: its bosses take far less from missiles and magic.
  - Raid points for each room, more for a fast, clean kill: they pay coins, buy food and potions from
    a supply chest between rooms, and better your chance of a purple from the chest at the end.
  - The Theatre's uniques for the Collection log, Lil' Zik, and two weapons: the Ghrazi rapier for
    beating it, and the Holy Scythe of Vitur for beating it on hard.
  - The raid runs through Morytania: each room fights its waves in a real place, from the woods
    outside Canifis to Vampyrium. Bones and coins left on a hall floor go with you to its boss.
  - Teleporters: once you've killed a room's boss, its hall has a portal straight to it (three a raid),
    to get back to the boss you're learning quicker.
  - Beat the raid on hard for expert mode, with more of the real raid's mechanics, twice the coins
    and Lil' Zik's looks.
- Phosani's Nightmare: a boss fight on its own, open once Hallowed Night's beaten. One fight in
  the Sisterhood Sanctuary under Slepe, with no waves, picks or items: everything The Nightmare
  has, quicker, plus bullet hell patterns, eggs that hatch parasites and husks that hold you where
  you stand. Everyone plays the Inquisitor, an adventurer made for the fight, with the Armadyl
  crossbow. It has a hard mode and a quest, and beating her brings the Nightmare staff, whose
  claws come up under enemies around you.
- Controller support, by Okaeri: move with the stick or d-pad, use items with the shoulder buttons
  and triggers, and pick level ups, caskets and menus with the d-pad and A. The hints show your
  controller's buttons, Xbox, PlayStation or Switch.
- Firemaking, a new skill, by Okaeri: up to 3 banishes a run. Banish a weapon or passive on a level
  up (pick another instead), or a casket's item (it's alched), and it won't be offered again that
  run. Banishing a set's piece banishes the whole set.
- Separate Melee, Ranged and Magic skill pages, by Deivid Smarzaro. Each can spend the full gold
  budget without taking gold from the others, refunds only touch the page you're on, and exported
  saves keep them.
- Single rank refunds, by Deivid Smarzaro: refund a skill rank with its arrow button, or right-click
  on desktop, without resetting the rest.
- Multiplayer shows where players are from: each open room has its host's flag and each player in
  a room theirs, the world list's own flags (a country without one shows its letters). Turn off
  Co-op flag in Settings to keep yours to yourself, unless you host an open room.
- A Frame rate setting, in Settings and the pause menu: Auto (60 on phones and tablets, no cap on
  a desktop), 30, 60 or Unlimited.

### Changed

- Co-op movement prediction, by trippy22: on by default when you join a game, and smoother: no
  camera nudges as you walk, no creeping or sliding back after you stop, and a glide rather than a
  jump after a dropped connection. It can still be turned off in Settings.
- Evolutions, rebalanced by trippy22: most gain less damage over their maxed base weapons, while
  keeping an upgrade at every level.
- Endless runs, by Okaeri: from about round 4, levels come about a dozen a round rather than
  thirty, so a weapon you pour everything into keeps up with the rounds rather than outgrowing
  them, and a long run gets harder instead of its numbers running away. The first rounds level as
  before.
- The game is lighter, most of all on phones: a run takes less memory to start, each frame does
  less work, and menus draw at 30 frames a second at most.

### Fixed

- Weapon cards and tooltips include fixed damage adjustments, including venom. Fixed by trippy22.
- Weaker poison and burning ground no longer take ownership of a stronger lingering effect. Fixed
  by trippy22.
- Co-op: a guest who misses some of the host's updates gets them again, rather than freezing.
  With a relay that supports it, a dropped connection reconnects within a few seconds and the run
  carries on. Fixed by Okaeri.
- Co-op: an item used just as the connection drops is used once it's back, and someone who joined,
  left or started a run just before a drop is remembered that way. Fixed by trippy22.
- Co-op: after buying from the Mysterious Old Man, or banishing a level up's reward, the menu's
  buttons work straight away, rather than doing nothing for a few seconds.
- Huge numbers stay short: the damage panel, stats and hitsplats go on past trillions to Qa,
  Qi, Sx and on, then powers of ten, rather than growing digit by digit. Fixed by Okaeri.
- In very long endless runs, bones no longer stop dropping once coins and food have built up
  around the map.
- The Nightmare's charge wind-up and sleepwalker animations tore her model apart, on Hallowed
  Night as well: they belonged to her other form.
- A phone taking the graphics away mid-run pauses a solo run, and Reload ends it keeping its coins
  and quests.
- Class skill tabs stay grouped on the left, with the selected page pressed in and green
  immediately, even while hovered. Fixed by Deivid Smarzaro.
- Coin icons stay visible while a changed stack size loads after buying or refunding skills. Fixed
  by Deivid Smarzaro.
- Maxed skills no longer look buyable, and touch long presses no longer refund ranks by accident.
  Fixed by Deivid Smarzaro.

## 0.23.0 - 2026-11-02

### Added

- Co-op revives: stand over a downed teammate for 5 seconds to bring them back. Each player can
  be revived once a run, with 75% of their hitpoints, and comes back untouchable for 5 seconds.
- Extra co-op revives: a Prayer cape, rarely in a casket or for sale from the Mysterious Old Man,
  lets a teammate revive you once more (with 50%, then 25% of your hitpoints).
- Hard mode in co-op: the host can turn it on once everyone in the room has it.
- Co-op results, by trippy22: a page for each player's own kills, damage, weapons and caskets, with
  arrows (or the arrow keys) to flip between them, and the party's totals underneath.
- Each weapon's damage during a run, by Okaeri: press Tab, or click or tap the DPS under the
  minimap, to see what each weapon is doing a second right now (the best first), its share, and
  its total. It stays open or shut as you left it.

### Changed

- Co-op's server holds up better against anyone trying to flood it or take every room.
- Co-op bosses come as a pair, or one for each player on hard mode, by trippy22. Between them
  they have one boss's hitpoints and loot, so a party fights more bosses rather than bigger ones.
- The Bow of Faerdhinen counts as a crystal bow for the Crystal armour set's bonus.
- A weapon level past its last (in endless runs) shows the weapon's damage bonus before and after
  on its card. Each pick multiplies what the weapon has, so a 15% pick at +477% gives +564%.

### Fixed

- With the game open in two tabs, only one saves, so they no longer undo each other's runs, coins
  and unlocks. The other offers to play there instead.
- A tab left open over an update no longer wipes progress from the newer version when it saves. It
  asks you to reload instead, or to save anyway and lose only what was new.
- A save that can't be read is kept rather than lost. The game tells you, and you can export it
  from Settings.
- If the game stops saving mid-run, a solo run pauses while it tells you why, and the pause menu
  says so afterwards.
- Killing the final boss wins the run, even if a hit lands in the same instant: it no longer counts
  as a death or uses up a ring of life.
- Co-op: two players with the same orbit weapon, like Elemental runes, no longer wipe out each
  other's circle.
- Co-op: a downed player can't reroll or skip level ups any more, so they can't spend the party's
  coins.
- Co-op: one player's Evil Bob finishing no longer ends another's Evil Bob timer early.
- Co-op: each player's Toktz-mej-tal burns ground of its own: another player's pulse no longer
  takes over your fire or puts it out.
- Durial321's task says what it takes: surviving 6:06 in Falador, not 6 minutes.
- Co-op: a double click or a quick second key on a level up, casket or random event no longer
  answers the next one too, unseen. Fixed by Okaeri.
- Pressing Enter or Space on a focused casket button no longer resolves the next casket as well.
  Fixed by Okaeri.
- Co-op: a tab left in the background no longer builds up effects to draw all at once when you come
  back. Fixed by Okaeri.
- Item icons that failed to draw are tried again, rather than staying blank until the game's
  reopened.
- Endless: a run no longer holds on to every boss it's had, so very long ones use less memory.
- Co-op: waiting on the Multiplayer screen for a room to appear no longer drops the connection
  after 10 minutes.
- Varlamore on a phone: its bosses' animations took several times the memory of any other map's,
  which could crash the game as the run loaded. They now take a third of it.

## 0.22.1 - 2026-11-02

### Added

- Movement prediction, a trial you can turn on in Settings or the pause menu: joining a co-op game,
  you move as soon as you press, then correct to the host. Hits and pickups still follow the host.
  Thanks to trippy22, who built it.

### Changed

- Multiplayer bosses spawn in pairs, or one per player in hard mode; Hallowed Night's final Nightmare fight stays a single boss.

## 0.22.0 - 2026-11-01

### Added

- Hard mode for solo runs on every map, once you've beaten it (fun maps from the start): more
  enemies, tougher and harder hitting, twice the elites, bosses that enrage sooner and attack faster,
  and 25% more coins.
- Put the game on your phone's home screen from your browser's menu: it gets its own icon and opens
  full screen.

### Fixed

- Exporting your save from the home screen on an iPhone or iPad opens the share menu, instead of a
  tiny sheet you had to scroll inside.

## 0.21.0 - 2026-11-01

### Added

- Co-op, built by trippy22: play a run with up to three friends. Make a room that's invite only
  (by its code or an invite link) or open to anyone, ready up, and the host picks the map. Everyone
  brings their own adventurer and progress, levels are shared with a pick each, and the run goes on
  while anyone's still standing. Winning on a map you haven't reached yet in a friend's party opens
  it for you. Anyone who keeps everyone waiting for 20 seconds has their pick made for them.
- Co-op names: everyone gets a readable name to play under, like "Plucky Chinchompa", and rooms get
  one too. New name picks another.
- Co-op on the desktop version too, for anyone with the new download.

### Changed

- A tidier main menu: Singleplayer and Multiplayer up front, smaller tiles for Skills, Armoury,
  Quests and the Collection log, and more of the world in view.

## 0.20.1 - 2026-11-01

### Added

- A Windows desktop version: unzip it, run it, and it plays offline and keeps itself up to date.
- A GitHub link beside the Discord one on the title screen.

### Changed

- The Inferno's Jal-ImKot are fairer: they come up further from you, slowly, one after another, and
  can't hit until they're up. They also have less health and hit a little softer.
- Bats and aviansies now go round cave walls and mountains instead of flying over them. They still
  fly over fences, buildings, trees and water. Only ghosts and the Ankou go through everything.

### Fixed

- The quest tracker no longer shows quests that can't be done on the map you're on, like Ratcatchers
  in the Inferno.

## 0.20.0 - 2026-10-31

### Added

- Hallowed Night, a Halloween map: a graveyard hamlet in a pumpkin patch at night, open to everyone
  from the start. Fifteen minutes of the restless dead, with Slash Bash, The Mimic and The Nightmare.
- The Nightmare: a three-phase final boss fought like a bullet hell. Break her shield, charge the
  four totems, and dodge what she throws at you, all marked on the ground before it lands.
- New boss: Slash Bash. His disease stacks up, a little slower and weaker each dose, and his bile
  leaves pools you won't want to stand in.
- New boss: The Mimic. Not every master casket is what it seems. It flings candy that brings its
  Third Age minions, and its stomp hurts more the longer you stay under it.
- Trick or treat: enemies on Hallowed Night sometimes drop a pumpkin. Walk over it for a treat
  (healing, coins, a sugar rush) or a trick (ghosts, a curse).
- New weapons for killing The Nightmare: the Inquisitor's mace, which crushes the undead, and the
  Volatile Nightmare staff, whose Immolate burns big things hardest.
- The Collection log has a Hallowed Night page: the Jar of Dreams and Little Nightmare from The
  Nightmare, and halloween masks and a Scythe hidden in pumpkins.
- Four new quests on Hallowed Night.

### Changed

- Ancient spells: level ups only offer Ice Burst now. Beat the Desert and its second level lets you
  pick which burst you want for the run.

## 0.19.2 - 2026-10-31

### Fixed

- The Mysterious Old Man's and Quiz Master's screens have room between their choices and buttons.
- Random event visitors come and go in a puff of smoke, not a flash of purple on the ground.

## 0.19.1 - 2026-10-31

### Added

- Random events: every few minutes someone turns up near you for 30 seconds. Walk up to them to see
  what they want.
- The Mysterious Old Man sells power-ups for coins, and his prices climb as the run goes on.
- The Quiz Master asks which item is the odd one out, with a power-up for the right answer.
- The Genie grants experience, Rick Turpentine drops a casket, and a Strange plant's fruit makes you
  faster and safe from poison for 20 seconds.
- The Sandwich lady heals you, but ignore her and she throws her baguette at you.
- The Highwayman ambushes you later in a run and steals coins until you take them back.
- New shop upgrade, Runecraft: power-ups drop more often.

## 0.19.0 - 2026-10-31

### Added

- Early support for phones and tablets: drag anywhere to move, and tap on-screen buttons to pause
  and use items.
- Every screen now fits a phone held sideways, with a nudge to turn it if it's held upright.
- A DPS meter under the quests shows how much damage you've been dealing, from everything, over
  the last 8 seconds.
- New setting, Auto alch: high alch every chest as you open it, with no chest screen and no pause.

### Changed

- Past 15 minutes in an endless run, chests are five times as likely to drop (25%, up from 5%), and 25
  can lie on the ground at once, up from 10.
- The game draws far less of the map on busy maps: only what's on screen, not everything nearby.
- The game starts much faster and uses far less memory. Each map's monsters now load when you set
  off for it, so the first run on a map takes a moment longer to start.

### Fixed

- Sound starts properly from the first tap on touch screens.
- Losing the graphics, which phones can do to a game in the background, now says so instead of
  leaving a black screen.

## 0.18.0 - 2026-10-30

### Added

- New power-up: the Sled. Ride for 8 seconds at more than twice the speed, shoving the crowd aside
  with nothing able to hurt you.
- New power-up: the Giant rune essence. A huge rock lands on the thickest crowd nearby.
- New power-up: Evil Bob. A giant cat charges through the crowd three times, throwing it aside.
- New power-up: the Fairy ring. A ring opens at your feet for 12 seconds and warps away whatever
  walks into it.
- New power-up: the Drill Demon. Everything nearby runs laps around you for 9 seconds and can't
  attack.

### Changed

- The player now stands and runs the way their weapon does in OSRS: a two-handed run with 2h swords
  and godswords, staves held out, crossbows at the ready, and so on.
- The same power-up no longer drops twice in a row.
- Toktz-mej-tal's burning ground is real fire now, flickering, with more flames across each patch.
- Past 15 minutes in an endless run, a chest that would drop only has a 5% chance to, and only 10
  can lie on the ground at once. A round's master casket always rolls through, though not past the
  limit.

### Fixed

- Two-handed weapons no longer leave a shield strapped to your arm. The shield still counts, it's
  just not shown while you hold one.
- Prifddinas's walkways and bridges are whole again instead of leaving pieces floating in the air.
  Only the buildings' roofs and the towers' domes are gone. A few stray roof edges went from
  Barrows too.
- Enemies only turn up where you could stand and walk to, so rings of enemies, summons and ghosts
  no longer appear behind walls or inside rock. East Varrock's enemies still come from both sides
  of the ditch, since they jump it.
- In the God Wars Dungeon and Castle Wars, an enemy with a wall between it and the other side for 3
  seconds gives up and comes for you for good, rather than standing at the wall.

## 0.17.2 - 2026-10-30

### Fixed

- Caskets no longer land inside Pest Control's portals or other spots you can't walk to, where you
  couldn't pick them up. Power-ups are fixed the same way.

## 0.17.1 - 2026-10-30

### Changed

- Caskets no longer flood you with a set's missing pieces: the odds of one are down from 30% to
  15%, and a piece can only be one rarity above what the casket rolled, so very rare sets like
  Torva stay rare. Alch or reroll a piece of a set you've started and caskets stop bringing that
  set for the rest of the run.
- Crystal armour now comes in with beating Prifddinas. Saves that have already beaten it keep it.

### Fixed

- The Grand Exchange has its walls and booths back, and scenery that had gone missing from other
  maps' buildings is back too.

## 0.17.0 - 2026-10-30

### Added

- Collection log: every evolution's recipe, and what it makes once you've made it.
- Nine new evolutions for the Scythe of Vitur, godswords, Dragon claws, Dragon warhammer, Dinh's
  bulwark, Twisted bow, Tumeken's shadow, Sanguinesti staff and Harmonised nightmare staff.

### Changed

- Level up cards say what evolves with what.
- The HUD and pause menu show what a weapon needs to evolve, and its slot glows when it's ready.
- Evolved weapons have 3 levels.
- A notice and a sound when a weapon evolves.

## 0.16.0 - 2026-10-30

### Added

- Thunder khopesh: a melee weapon whose special hits everything around you.
- Chivalry: a passive with more melee damage and more max hitpoints.
- Dinh's bulwark: a slow melee weapon that hits everything around you, far out.
- Smithing and Crafting skills: up to 2 more weapon slots and 2 more passive slots.
- Woodcutting skill: more melee knockback.

### Changed

- Melee weapons only swing when something's in reach.
- Melee weapons hit harder, and slashes are wider.
- Melee weapons show their Knockback, and every other level raises it.

## 0.15.0 - 2026-10-30

### Added

- Skip a level up (X) for coins: 25, then doubling each time.
- Run stats when a run ends: damage, kills and DPS per weapon, plus hits, healing and boss times.
- Music volume slider on maps with music.
- Dividers between the pause menu's columns and sections.

### Changed

- Level up cards, the pause menu and the HUD show weapon stats.
- The Armoury shows a piece's stats before and after an upgrade.

### Fixed

- Prifddinas's roofs no longer hide its buildings.

## 0.14.0 - 2026-10-29

### Added

- Four campaign maps: Morytania, God Wars Dungeon, Prifddinas and the Inferno.
- Two fun maps: Castle Wars and Pest Control.
- Ten adventurers.
- Twelve quests, and a quest tracker during runs (Q).
- Class weapons: Godsword (pick its hilt), Dragon claws, Ivandis flail, Armadyl crossbow, Crystal
  bow, Crystal staff and Toktz-mej-tal.
- Every weapon can evolve, with eight new evolutions.
- Passives: Rigour, Augury and the Ancient sceptre.
- Gear sets with bonuses: Void knight, Inquisitor's, Crystal, Torva and Virtus.
- New casket gear and Armoury lines, including the Desert Treasure II rings.

### Changed

- Enemy projectiles are bigger and outlined.
- Quests don't count on fun maps.
- The map list is split into campaign and fun maps.
- Ice Barrage counts as an Ancient burst.
- Weapons don't fire at shielded enemies.
- The boss bar shows the nearest boss, or the final boss.

### Fixed

- The minimap could stay black at the start of a run.

## 0.13.0 - 2026-10-29

### Added

- 22 quests that pay banked coins.
- Amulet of blood fury.

### Changed

- Bones and coins gather into piles.
- Blood Burst heals more.
- The King Black Dragon is full size.
- Old-school scroll bars.

### Fixed

- Spell and boss sounds that played Ice Burst's.

## 0.12.0 - 2026-10-28

### Added

- Fun maps, open and endless from the start: Grand Exchange, East Varrock, Falador and Last Man
  Standing.
- Four adventurers from the fun maps.

### Changed

- Monk's weapon speed bonus is down to 15%.
- Endless runs pay fewer coins.
- Endless rounds get harder faster.

## 0.11.0 - 2026-10-28

### Added

- Endless mode for beaten maps.
- Weapons and passives level past their max in endless runs.
- Armoury: upgrade casket gear for good with banked coins.

### Changed

- Scenery only blocks where it stands.
- The world fades out past the map's edge.

### Fixed

- Old bones far away no longer keep their experience for good.

## 0.10.1 - 2026-10-28

### Added

- Auto-pause setting.
- Discord link on the title screen.

### Changed

- New adventurer screen.
- Settings menu on the title screen.

## 0.10.0 - 2026-10-27

### Added

- Five campaign maps: Kharidian Desert, Fremennik Province, Karamja, Kourend and Varlamore.
- Ten adventurers.
- Map tasks that unlock weapons, passives and gear.
- Eight class weapons, the rest of the Ancient bursts and four evolutions.
- Rerolls (R).
- Save export and import.
- Thrownaxes, elemental runes, the Toxic blowpipe and the Sanguinesti staff.

### Changed

- Harmonised nightmare staff nerfed.
- Antipoisons only drop where something poisons you.

## 0.9.0 - 2026-10-26

### Added

- Adventurers unlock by beating maps and doing tasks.
- Six adventurers.
- 2h swords and shortbows.

### Changed

- 25 hitpoints instead of 100.
- The adventurer screen fits smaller windows.

## 0.8.0 - 2026-10-26

### Added

- 48 pieces of gear and 10 utility items.
- Bosses enrage at half their hitpoints.
- Option to stop the menu camera spinning.

### Changed

- Bosses are tougher.
- The hosted game downloads a 12 MB cache.

## 0.7.0 - 2026-10-26

### Added

- Minimap.
- Barrows and Wilderness monsters.

### Changed

- Renamed to Run Escape.
- The interface scales up on bigger windows.
- The game can be hosted in a folder.

## 0.6.0 - 2026-10-26

### Added

- Power-ups: Dwarf multicannon, Book of the Dead, Bot nuke, Magnet and Giant stopwatch.

### Changed

- The Dwarf multicannon is a power-up instead of a weapon.
- Thralls and the cannon are bigger, hitsplats smaller.

### Fixed

- Cannonballs splashed everything in range.
- Hitsplat numbers were off-centre and blurry.

## 0.5.0 - 2026-10-26

### Added

- Class weapons for Melee, Ranged and Magic, from Rare godswords to the Very rare Scythe of
  Vitur, Twisted bow and Tumeken's shadow.

## 0.4.0 - 2026-10-26

### Added

- Maps that open in turn: Lumbridge, the Barrows and the Wilderness.

### Changed

- The Barrows brothers and the King Black Dragon moved to their own maps.

## 0.3.0 - 2026-10-26

### Added

- Bosses, with the Wise Old Man as the final boss.
- Freeze, poison and drain effects on the player.

### Changed

- Count Draynor is a mid-run boss.
- Hitsplats are the client's own.

## 0.2.0 - 2026-10-26

### Added

- Reward caskets.
- Gear, worn on your character.
- Utility items (1-4).
- Loot beams and off-screen casket arrows.

### Fixed

- The multicannon aimed the wrong way.
- Item icons were drawn inside out.
- Health bars look like the client's.

## 0.1.0 - 2026-10-26

### Added

- First playable version: survive fifteen minutes in Lumbridge.
- Weapons, passives, evolutions and rarities.
- Levels on the OSRS experience table.
- Banked coins and skills.
- Sound effects from the cache.
