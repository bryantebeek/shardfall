import type { AccessoryIcon, UiIcon } from '../art/icons';
import type { TargetKind } from './types';

export type AccId = AccessoryIcon;

export interface AccDef { id: AccId; name: string; text: string; price: number; starter?: boolean }

// Effects are implemented where they trigger (battle.ts / run.ts), keyed by id.
export const ACCESSORIES: Record<AccId, AccDef> = {
  charm: { id: 'charm', name: 'Traveler\'s Charm', text: 'After each battle, living heroes heal 3 HP.', price: 0, starter: true },
  powerRing: { id: 'powerRing', name: 'Power Ring', text: 'Knight starts each battle with 1 Strength.', price: 150 },
  magusCirclet: { id: 'magusCirclet', name: 'Magus Circlet', text: 'Black Mage starts each battle with 1 Strength.', price: 150 },
  angelFeather: { id: 'angelFeather', name: 'Angel Feather', text: 'Once per battle, the first hero who would be KO\'d survives with 1 HP.', price: 170 },
  etherStone: { id: 'etherStone', name: 'Ether Stone', text: 'Gain 1 extra energy on the first turn of each battle.', price: 140 },
  swiftBoots: { id: 'swiftBoots', name: 'Swift Boots', text: 'Draw 2 extra cards on the first turn of each battle.', price: 140 },
  limitGem: { id: 'limitGem', name: 'Limit Gem', text: 'The Limit gauge fills 30% faster.', price: 160 },
  breakerMark: { id: 'breakerMark', name: 'Breaker\'s Mark', text: 'Whenever you Break an enemy, gain 1 energy and draw 1 card.', price: 170 },
  prismLens: { id: 'prismLens', name: 'Prism Lens', text: 'All enemy weaknesses are revealed.', price: 130 },
  luckyCoin: { id: 'luckyCoin', name: 'Lucky Coin', text: 'Gain 12 extra gold after each battle.', price: 120 },
  guardianBangle: { id: 'guardianBangle', name: 'Guardian Bangle', text: 'At the start of your turn, the most wounded hero gains 4 Block.', price: 160 },
  phoenixPlume: { id: 'phoenixPlume', name: 'Phoenix Plume', text: 'Heroes KO\'d in battle return with 50% HP instead of 1.', price: 150 },
  tome: { id: 'tome', name: 'Tome of Insight', text: 'Gain 25% more XP.', price: 130 },
  chalice: { id: 'chalice', name: 'Holy Chalice', text: 'All healing is increased by 2.', price: 160 },
};

export const ACC_POOL = (Object.keys(ACCESSORIES) as AccId[]).filter(a => !ACCESSORIES[a].starter);

export type ItemId = 'potion' | 'ether' | 'phoenix' | 'elixir' | 'bomb' | 'wind' | 'tonic';

export interface ItemDef { id: ItemId; name: string; text: string; icon: UiIcon; price: number; target: TargetKind; combatOnly: boolean }

export const ITEMS: Record<ItemId, ItemDef> = {
  potion: { id: 'potion', name: 'Potion', text: 'Heal a hero 20 HP.', icon: 'potion', price: 40, target: 'ally', combatOnly: false },
  ether: { id: 'ether', name: 'Ether', text: 'Gain 2 energy.', icon: 'ether', price: 50, target: 'none', combatOnly: true },
  phoenix: { id: 'phoenix', name: 'Phoenix Down', text: 'Revive a KO\'d hero with 50% HP.', icon: 'phoenix', price: 60, target: 'deadAlly', combatOnly: true },
  elixir: { id: 'elixir', name: 'Elixir', text: 'Fully heal a hero and remove their debuffs.', icon: 'elixir', price: 90, target: 'ally', combatOnly: false },
  bomb: { id: 'bomb', name: 'Bomb Fragment', text: 'Deal 18 Fire damage to ALL enemies.', icon: 'bomb', price: 55, target: 'none', combatOnly: true },
  wind: { id: 'wind', name: 'Arctic Wind', text: 'Deal 14 Ice damage to ALL enemies. Apply 1 Weak.', icon: 'wind', price: 55, target: 'none', combatOnly: true },
  tonic: { id: 'tonic', name: 'Swift Tonic', text: 'Draw 3 cards.', icon: 'tonic', price: 45, target: 'none', combatOnly: true },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const MAX_ITEMS = 3;
