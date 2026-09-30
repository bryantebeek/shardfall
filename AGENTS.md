# Working on Shardfall

## Keep the design docs current

The design lives in files, not in anyone's head. Any change to gameplay or story updates its file **in the same change**:

| What changed | Update |
|---|---|
| Gameplay mechanics: rules, numbers, cards, enemies, the map, Memories, balance | [MECHANICS.md](MECHANICS.md) |
| Story: plot, characters, chapters, scenes and dialogue, how a chapter is implemented | [STORY.md](STORY.md) |
| Features, controls, how to run or build | [README.md](README.md) |

- Write the current state, not a changelog. When something is removed or replaced, say so briefly in MECHANICS.md's "Tried and replaced" section, with why.
- Numbers in MECHANICS.md must match the code. If a balance pass changes them, update the doc and the balance table.
- `docs/superpowers/specs/2026-09-30-shardfall-design.md` is the original design and is historical; don't update it.

## Checks before calling something done

```sh
npx tsc --noEmit
npx vitest run
SIM=1 SIM_N=100 npx vitest run src/game/sim.test.ts -t "chapter 1" --disableConsoleIntercept   # after balance-relevant changes
npm run build
```

## Layout

- `src/game/`: pure rules (no DOM). `chapter1.ts` holds Chapter 1's map, Memories, events and script.
- `src/ui/`: screens. `story.ts` (scenes, Memories), `placemap.ts` (the chapter map), `battle.ts`.
- `src/render/`, `src/art/`, `src/audio/`: the 3D stage, procedural pixel art, synthesized audio.
