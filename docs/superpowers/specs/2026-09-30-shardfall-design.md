# Shardfall — Design

Slay-the-Spire-style roguelike deckbuilder with a JRPG party and an HD-2D (Octopath) look. Browser, Vite + TypeScript + Three.js.

## Presentation
- Three.js diorama (pixel-textured blocks, point-lit torches/crystals, fog), billboarded pixel sprites with shadows.
- Post: tilt-shift blur, bloom, vignette, color grading, ambient particles.
- DOM/CSS UI over a 16:9 letterboxed 1920x1080 virtual canvas: gilded JRPG windows, fanned hand, drag-to-target, popups, shake, hit-stop.
- All art procedural pixel art drawn to canvas at runtime; all audio synthesized with WebAudio.

## Rules
- Party: Knight (block/taunt/phys), Black Mage (fire/ice/thunder), White Mage (heal/holy/revive). Separate HP/block/statuses, one shared deck. 3 energy, draw 5.
- KO'd heroes' cards are unplayable. All KO = defeat. KO'd heroes return at 1 HP after combat.
- Enemies show intents incl. the targeted hero; Taunt redirects single-target attacks.
- Break: enemies have shield points + weaknesses (hidden until hit or scanned). Each weakness hit removes 1 shield; 0 = Broken: skips next action, takes +50% damage, shield restores afterwards.
- Limit gauge (persists across fights) fills from damage dealt/taken; when full, Limit Break adds each living hero's Limit card to hand.
- Party XP/levels: level-up raises max HP (+heal) and offers a card from one of the three heroes.
- One act, 15 floors + boss: battle, elite, event, inn (rest/upgrade), shop, treasure. Accessories (relics), Items (potions, 3 slots), gold. Autosave to localStorage.

## Content
~15 cards per hero + Limits; 6 normal enemies, 2 elites, 1 two-phase boss (Crystal Wyrm); 14 accessories; 7 items; 5 events.

## Architecture
- `src/game/*` pure TS rules engine (no DOM), emits an event log that the presentation plays back. Tested with vitest.
- `src/render/*` Stage (contract in render/api.ts), `src/art/*` procedural art, `src/audio/*` synth audio (contract in audio/api.ts).
- `src/ui/*` screens + battle controller wiring engine -> stage/audio/DOM.
