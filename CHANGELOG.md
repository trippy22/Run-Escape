# Changelog

What's changed in Run Escape, newest first. The game shows this on its title screen too (click
the version in the corner).

## Unreleased

### Added

- Put the game on your phone's home screen from your browser's menu: it gets its own icon and opens
  full screen.
- Co-op servers provide lightweight Prometheus player and room counts locally by default, with an off switch.
- Co-op servers can wait for games to finish before maintenance, with an optional warned exit for endless runs that keeps earned progress.

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
