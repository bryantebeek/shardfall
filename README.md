# Shardfall

A Slay-the-Spire-style roguelike deckbuilder with a JRPG party and an HD-2D (Octopath Traveler-like) look, running in the browser.

- **Party of three**: Aldric the Knight, Lyra the Black Mage, Seren the White Mage. Separate HP, one shared deck. KO'd heroes' cards go dead.
- **Break system**: enemies have shields and hidden elemental weaknesses. Hit weaknesses to break them — they lose a turn and take +50% damage.
- **Limit Breaks**: a persistent gauge fills from damage dealt and taken; unleash every living hero's ultimate.
- **Party levels**, accessories, items (Potion, Ether, Phoenix Down...), events, shops, inns, a branching 15-floor spire and a two-phase boss.
- Everything is procedural: pixel art is drawn in code, the 3D diorama is built in Three.js, and all music/SFX are synthesized with WebAudio.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
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

Dev pages: `art-preview.html`, `art2-preview.html`, `stage-preview.html`, `audio-preview.html`.
Dev shortcuts: `/?dev=battle&enemies=wyrm&type=boss&row=15&limit=100`, `/?dev=shop`, `/?dev=event&event=library`, `/?dev=inn`, `/?dev=treasure`, `/?dev=rewards`, `/?dev=levelup`, `/?dev=win`.
Automated UI tests (need `npm run build && npx vite preview --port 5320`): `node scripts/playtest.mjs`, `node scripts/fullrun.mjs`.
