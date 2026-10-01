# Shardfall

A story-driven JRPG deckbuilder with an HD-2D (Octopath Traveler-like) look, running in the browser. How it plays: [MECHANICS.md](MECHANICS.md). The story: [STORY.md](STORY.md).

- **Story mode**: New Journey plays the Prologue and Chapter 1, *Emberfall* (see [STORY.md](STORY.md)). Fall, and Seren's Hourglass sends the party back to dawn with a new **Memory** (Foresight, Pathfinding, People) that changes the next attempt.
- **A new Emberfall every attempt**: a place map with roads, drawn fresh after every fall (places, side trips, events, shops, rests, elites, ambushes). Fights happen on the roads, fog hides what's ahead, and Memories show where their places are.
- **Party of three**: Aldric the Knight, Lyra the Black Mage, Seren the White Mage. Separate HP, one shared deck. KO'd heroes' cards go dead.
- **Actions per hero**: each hero gains an Action every turn and can hold two; a card costs its dots, Swift cards are free. Hold a hero to afford a 2-dot card or to act twice.
- **Break system**: enemies have shields and hidden elemental weaknesses. Hit weaknesses to break them: they lose a turn, take +50% damage, and pay out **Crystal Shards**, the currency.
- **Party levels**, accessories, items (Potion, Ether, Phoenix Down...), events, a market and inns.
- **Installable** as an app (PWA) from any HTTPS address or localhost, and playable offline once loaded.
- Everything is procedural: pixel art is drawn in code, the 3D sets (shrine, village, forest road, bridge, hill) are built in Three.js, and all music/SFX are synthesized with WebAudio.

## Run

```sh
npm install
npm run dev        # http://localhost:7427 (also on the tailnet; HTTPS via `tailscale serve --bg --https=7428 http://127.0.0.1:7427`)
npm run build      # typecheck + production build in dist/
npm test           # rules engine tests
npm run sim        # balance simulator (greedy bot plays full acts)
```

Controls: drag a card onto a target (or click a card, then click the target). Number keys select cards, `E` ends the turn, `Esc`/right-click cancels.
Touch: drag, or tap a card then tap the target. Controller: D-pad/stick to move, `A` select, `B` back, `X` deck, `Y` end turn, `Start` settings.
Battle speed (1×/1.5×/2×) is in Settings.

## Layout

- `src/game/` — pure rules engine (battle, cards, enemies, run/map/economy). No DOM.
- `src/render/` — Three.js HD-2D stage (diorama, sprites, FX, post-processing). Contract: `render/api.ts`.
- `src/art/` — procedural pixel art (sprites, icons, textures, card art).
- `src/audio/` — synthesized music and sound effects. Contract: `audio/api.ts`.
- `src/ui/` — DOM screens and the battle controller that plays back engine events.

Development menu (title screen, `npm run dev` only): a sandbox battle against a Training Dummy that never fights back or runs out of HP. Pick the set and lighting, swap the dummy for any enemy, and click any card (filter by hero, sort by rarity or A–Z) to deal it and its upgrade into your hand; Actions refill after every play. Reset, Clear hand, and KO a hero (to try Raise) are there too.
Dev pages: `art-preview.html`, `art2-preview.html`, `stage-preview.html`, `audio-preview.html`.
Dev shortcuts: `/?dev=opening`, `/?dev=map&memories=guard,bridge,well&seed=7&flags=towerClimbed`, `/?dev=ending`, `/?dev=battle&enemies=soldier,ashknight,soldier&type=boss`, `/?dev=event&event=mill`, `/?dev=shop`, `/?dev=inn`, `/?dev=rewards`, `/?dev=levelup`.
Automated UI tests (need `npm run build && npx vite preview --port 5320`): `node scripts/playtest.mjs`, `node scripts/fullrun.mjs`.
