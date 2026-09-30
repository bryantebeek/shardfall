# Shardfall — Mechanics

How the game plays, as implemented. The story is in [STORY.md](STORY.md). Code: rules in `src/game/`, Chapter 1 in `src/game/chapter1.ts`.

---

## Structure: chapters you retry

The game is told in chapters (see STORY.md). Each chapter is a short journey to one goal, played as a roguelite:

- **Falling** (the whole party KO'd) returns everyone to the chapter's Anchor: a fresh start with the starting deck, HP, level, Shards and items. What carries over is what they *remember*: Memories, and the map.
- Each fall gives the next **Memory** (see below) and adds 1 to the **Attempt** counter, shown in the top bar.
- **Reaching the goal** ends the chapter; the story moves on.

## The party

| Hero | HP | +HP per level |
|---|---|---|
| Aldric (Knight) | 58 | 6 |
| Lyra (Black Mage) | 38 | 4 |
| Seren (White Mage) | 44 | 5 |

- Separate HP, Block and statuses; **one shared deck**. A KO'd hero's cards can't be played. All three KO'd = the party falls.
- After a battle, KO'd heroes return with 1 HP (50% with the Phoenix Plume). The starting Traveler's Charm heals living heroes 3 HP after each battle.
- **Levels:** XP per battle 20 (elite 45). The next level needs 20 + 12 × level XP. A level raises every hero's max HP and offers one new card from each hero to pick from.

## A turn: Actions per hero

There is no shared energy. **Each living hero has their own Actions.**

- Every hero starts a battle with 0 and **gains 1 Action at the start of each turn, holding up to 2**. Unused Actions carry over.
- A card costs as many **Actions as it has dots** (shown on the card's top-left badge). Most cards cost 1; heavy ones cost 2.
- **Swift** cards (the » badge, cost 0) are free.
- Holding a hero for a turn is a real choice: it pays for a 2-dot card next turn, or two 1-dot cards.
- Each hero's plate shows two pips: gold for each Action held.
- Draw **6** cards a turn (hand limit 10). Unplayed cards are discarded at end of turn (Ethereal ones are exhausted). Block is removed at the start of your turn (unless kept by Rampart).
- "Give back an Action" effects (Mana Surge, Miracle, Ether, Ether Stone, Breaker's Mark) add 1 Action to a hero, the card's owner first, never above 2.
- The hand is one fan, sorted by hero: Aldric, Lyra, Seren.

## Cards

- Types: Attack, Skill, Power (stays in play, exhausts), Status (unplayable, e.g. Daze from enemies).
- Upgrades (at inns, events) improve numbers, sometimes lower the cost.
- After each won battle: choose 1 of 3 cards (or skip), sometimes an item; elites also give an accessory.

## Enemies and Break

- Enemies show their **intent**: what they'll do next, how hard, and which hero a single-target attack is aimed at. Taunt redirects single-target attacks.
- **Break:** every enemy has a shield (points) and hidden elemental weaknesses. A hit with a weakness reveals it and removes 1 shield point. At 0 the enemy is **Broken**: it skips its next action and takes +50% damage, then its shield comes back.
- Weaknesses can be revealed early with Scan, the Prism Lens, or (for the Ashen Knight) a Memory.

## Crystal Shards

Shards are the currency (the war is fought over them).

- **Earned by Breaking enemies:** 8 per Break of a normal enemy, 16 for elites and bosses. Shown as they drop, counted live in the top bar.
- A new attempt starts with 60. The Lucky Coin adds 12 after each battle. Some events give Shards.
- Spent at the market: cards (common 45–55, uncommon 70–85, rare 140–165), accessories, items, and removing a card (75, +25 each time).

## Items and accessories

- Three item slots (Potion, Ether, Phoenix Down, Elixir, Bomb Fragment, Arctic Wind, Swift Tonic). Most are battle-only.
- Accessories are permanent for the attempt. Full lists and texts: `src/game/loot.ts`.

## The chapter map: a place that remembers

A chapter map is a real place, not a ladder of rows.

- **Places joined by roads.** The party token walks along roads.
- **Fights happen on roads** (ambushes, marked with red swords), only the first time a road is walked.
- **Places** hold events, the market, rest (an inn), elite fights and the goal. Their content happens the first time you arrive.
- **Side trips** (dead ends) are free to walk back from; other roads only lead onward.
- **Fog:** you see where you are, where you've been this attempt and the next places along the roads. Everything else is dark.
- **The map remembers across attempts:** places reached in earlier attempts stay visible (in italic blue); Memories can reveal places you haven't reached; the routes of the last three attempts show as faint dotted trails; a crystal marks where each of the last three attempts fell.

## Memories

Gained one per fall, in a fixed order per chapter. Three kinds so far:

- **Foresight:** battle knowledge (e.g. an enemy's weaknesses).
- **Pathfinding:** the map (reveals a place and opens an option there).
- **People:** change someone's fate (reveals a place and an option there).

---

# Chapter 1: Emberfall

**Goal:** get Seren and the Hourglass out of Emberfall alive.

**The opening** (New Journey; the title's **Skip Intro** starts at the map as attempt 2 with the first Memory):
1. The Prologue, then the arrival, then dusk.
2. **The shrine steps:** Aldric alone against the Ashen Knight (999 HP, unbreakable). Two strokes of 20, then the Third Stroke for 99: he falls, as the story requires. This is attempt 1.
3. Dawn: the first Memory, and the escape begins (attempt 2).

**The map:**

| Place | What's there | Reached by |
|---|---|---|
| The Anchorlight | Start | — |
| Shrine Library | Event: choose 1 of 3 cards, or upgrade a card (side trip) | Anchorlight, free |
| Village Square | Crossroads | Anchorlight, ambush |
| The Mill | Event; with the *well* Memory, save Nell (side trip) | Square, ambush |
| Emberfall Market | Shop (side trip) | Square, free |
| The North Bridge | Event; with the *bridge* Memory, bring it down | Square, ambush |
| Wayside Shrine | Event: heal, or an accessory for HP (side trip) | Bridge, ambush |
| Forest Edge | Crossroads | Square, ambush |
| Woodcutter's Camp | Elite: Kaldran Captain + Soldier (side trip) | Forest Edge, free |
| Shepherd's Hut | Rest (inn) | Forest Edge, ambush |
| The Hill | The Ashen Knight | Bridge or Hut, ambush |

Two ways out: the **North Bridge** road (fewer fights, no rest) or the **forest** road (a rest stop and the optional elite). The Bridge, the Wayside Shrine and everything past the Square toward the forest are *far*: fights there are harder and the light turns to dusk.

**Ambushes** draw from: near the village, one Soldier, two Gloom Bats or one Ember Wisp; further out, pairs like two Soldiers, Soldier + Wisp, Soldier + Bat, two Wisps or three Bats.

**Memories, in order:**
1. *The Ashen Knight always guards his left.* (Foresight) His weaknesses (Holy, Thunder) are known from the start and his shield is 3 instead of 8.
2. *The soldiers cross the north bridge at dusk.* (Pathfinding) Reveals the North Bridge; there you can bring it down (Aldric loses 8 HP), and the two Soldiers won't be on the hill.
3. *The miller's daughter hides in the well.* (People) Reveals the Mill; there you can save Nell: 40 Shards, a Potion, an Ether and a random accessory.

**Chapter 1 enemies:**

| Enemy | HP | Shield | Weak to | Moves |
|---|---|---|---|---|
| Kaldran Soldier | 26–30 | 3 | Thunder, Holy | Spear Thrust 9 · Shield Wall (8 Block, +2 Str) · Torch the Thatch (5 to all) |
| Kaldran Captain (elite) | 72–78 | 6 | Holy, Fire | Orders (+3 Str) · Lunge 17 (most wounded) · Halberd Sweep 9 to all · Brace 14 Block |
| The Ashen Knight (the hill) | 90 | 8 | Holy, Thunder | He Knows Your Move (18 Block, +3 Str) · Ashen Blade 12 · Crystal Arc 7 to all · For Her 18 (most wounded) |

**The hill:** the Ashen Knight, plus two Soldiers unless the bridge is down. The battle is won when he's down to **half HP**: he hesitates over Lyra and the party escapes. Then the first Anchor is set and the chapter ends.

**Balance** (`SIM=1 SIM_N=100 npx vitest run src/game/sim.test.ts -t "chapter 1" --disableConsoleIntercept`; a greedy bot takes the forest route with the Mill):

| Memories | Reach the hill | Escape |
|---|---|---|
| None | 99% | 39% |
| The Knight's guard (every real attempt has this) | 99% | 53% |
| + the bridge | 99% | 99% |

---

## Tried and replaced

- **3 shared energy** → Actions per hero. Energy made the party feel like one character.
- **"Heavy" cards that made a hero sit out the next turn** → holding up to 2 Actions. Simpler, and it gives waiting a purpose.
- **Limit Breaks** → removed entirely.
- **Gold** → Crystal Shards earned by Breaking, so fights are about finding weaknesses.
- **A 15-floor branching ladder map (the Spire)** → a place map with fog and memory. The Spire's generator still exists in `run.ts` for the old balance simulator only.
- **A day clock** (every stop cost hours, dusk as a deadline) → removed: it added a second kind of time the story doesn't have.
- **A turn-timeline JRPG combat prototype** (Foresight, a branching "Split" of the battle) → deleted: too complicated compared with the card battles.
