// CONTRACT — procedural WebAudio sound. Implemented by ./audio.ts (export const audio: Audio).
export type Sfx =
  | 'hover' | 'click' | 'select' | 'error' | 'cardDraw' | 'cardPlay' | 'shuffle' | 'endTurn'
  | 'slash' | 'hit' | 'bigHit' | 'block' | 'fire' | 'ice' | 'thunder' | 'holy' | 'dark'
  | 'heal' | 'buff' | 'debuff' | 'break' | 'ko' | 'revive' | 'limitReady' | 'limit'
  | 'victory' | 'defeat' | 'levelUp' | 'gold' | 'purchase' | 'chest' | 'map' | 'enemyTurn' | 'playerTurn';

export type Track = 'title' | 'map' | 'battle' | 'elite' | 'boss' | 'inn' | 'none';

export interface Audio {
  /** Must be called from a user gesture before anything is audible (creates/resumes AudioContext). */
  unlock(): void;
  sfx(name: Sfx): void;
  /** Crossfade to a looping track (~1s). Same track = no-op. */
  music(track: Track): void;
  /** 0..1 */
  setVolumes(v: { master?: number; music?: number; sfx?: number }): void;
}
