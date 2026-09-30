import type { HeroId } from './types';

export interface HeroDef {
  id: HeroId;
  name: string;
  job: string;
  hp: number;
  hpPerLevel: number;
  color: string;
  blurb: string;
}

export const HEROES: Record<HeroId, HeroDef> = {
  knight: { id: 'knight', name: 'Aldric', job: 'Knight', hp: 58, hpPerLevel: 6, color: '#6fa8ff', blurb: 'Sworn shield of the fallen kingdom. Guards, taunts and cleaves.' },
  bmage: { id: 'bmage', name: 'Lyra', job: 'Black Mage', hp: 38, hpPerLevel: 4, color: '#c58bff', blurb: 'Prodigy of the three elements. Fire, ice and thunder break any guard.' },
  wmage: { id: 'wmage', name: 'Seren', job: 'White Mage', hp: 44, hpPerLevel: 5, color: '#ffd97a', blurb: 'Keeper of the old light. Heals, shields and returns the fallen.' },
};

/** Each living hero gains one Action per turn and can hold up to two; a card's dots are its cost in Actions. */
export const MAX_ACTIONS = 2;
export const HAND_SIZE = 6;
export const MAX_HAND = 10;

export function xpToNext(level: number): number { return 20 + level * 12; }
