// CONTRACT — the 3D HD-2D stage. Implemented by ./stage.ts (createStage).
// The game/UI layer only talks to the renderer through this interface.
import type { Element, SpriteId } from '../game/types';

export type StageMode = 'title' | 'map' | 'battle';

export interface StageUnit {
  /** Hero ids are 'knight' | 'bmage' | 'wmage'; enemies use uids like 'e0', 'e1', 'e2'. */
  id: string;
  sprite: SpriteId;
  side: 'hero' | 'enemy';
}

export type CastKind = Element | 'heal' | 'buff' | 'debuff' | 'shield';

export interface Stage {
  /** Canvas is sized to the 16:9 letterboxed game rect (CSS px); called on window resize. */
  resize(w: number, h: number): void;
  /** title: slow cinematic camera orbit; map: dimmed/heavily blurred backdrop drift; battle: framed battle camera.
   *  theme changes the diorama lighting: 'ruins' (warm torches + teal crystals), 'depths' (colder, deeper floors), 'boss' (violet/crimson). */
  setMode(mode: StageMode, theme?: 'ruins' | 'depths' | 'boss'): void;
  /** Replace all battle units. Heroes on the left, enemies on the right, JRPG side-view formation. Units animate in. */
  setUnits(units: StageUnit[]): void;
  /** Normalized [0..1] position in the game rect (x from left, y from top) of a unit anchor. */
  screenPos(id: string, anchor: 'head' | 'center' | 'feet'): { x: number; y: number };
  /** Melee: unit dashes toward target and back. Promise resolves at the moment of impact (~250ms). target null = in place. */
  attack(fromId: string, toId: string | null): Promise<void>;
  /** Spell: caster channels, an element-themed effect travels to / erupts on targets. Resolves on impact (~450ms). */
  cast(fromId: string, toIds: string[], kind: CastKind): Promise<void>;
  /** Impact reaction: white flash, knockback wobble, element particles. big = heavy/weakness hit (bigger fx + hit-stop). */
  hit(id: string, element: Element, big?: boolean): void;
  heal(id: string): void;
  block(id: string): void;
  buff(id: string): void;
  debuff(id: string): void;
  /** BREAK: crystal-shard burst, brief slow-motion, bloom pulse. */
  shatter(id: string): void;
  /** Broken units visibly slump (tilt/squash, dimmed, stars/sparks). */
  setBroken(id: string, broken: boolean): void;
  /** Hover/target highlight (ground ring + rim light). null clears. */
  setTargeted(id: string | null): void;
  /** Currently acting unit gets a subtle ground glow. null clears. */
  setActive(id: string | null): void;
  /** Heroes collapse (lie down, grey) and stay; enemies dissolve into particles and are removed. */
  ko(id: string): Promise<void>;
  revive(id: string): void;
  /** Limit Break cinematic (~1.2s): scene darkens, camera pushes toward hero, light burst. */
  limit(heroId: string): Promise<void>;
  shake(intensity: number): void;
  /** Full-screen additive flash, e.g. '#ffffff', '#ff5533'. */
  flash(color?: string): void;
  /** Battle speed multiplier for action animations (attack/cast/ko...); idle motion is unaffected. */
  setSpeed(mult: number): void;
}
