import type { Battle, PlayCtx } from './battle';
import type { CardArt, CardInst, CardType, Element, HeroId, Rarity, TargetKind } from './types';
import type { CastKind } from '../render/api';

type Val = 'D' | 'B' | 'H' | 'M';

export interface CardDef {
  id: string;
  name: string;
  hero: HeroId | null;
  cost: number;
  costUp?: number;
  type: CardType;
  rarity: Rarity;
  target: TargetKind;
  el?: Element;
  art: CardArt;
  /** {D} damage, {B} block, {H} heal, {M} magic number. *Word* = keyword. */
  text: string;
  textUp?: string;
  v?: Partial<Record<Val, [number, number]>>;
  exhaust?: boolean;
  exhaustUp?: boolean;
  ethereal?: boolean;
  unplayable?: boolean;
  /** animation for non-attack cards */
  fx?: CastKind;
  play: (b: Battle, c: PlayCtx) => void;
}

const defs: CardDef[] = [
  // ───────────── Knight ─────────────
  { id: 'slash', name: 'Slash', hero: 'knight', cost: 1, type: 'attack', rarity: 'starter', target: 'enemy', el: 'phys', art: 'slash',
    text: 'Deal {D} damage.', v: { D: [6, 9] }, play: (b, c) => b.attack(c, c.D, 'phys') },
  { id: 'guard', name: 'Guard', hero: 'knight', cost: 1, type: 'skill', rarity: 'starter', target: 'ally', art: 'shield', fx: 'shield',
    text: 'Grant an ally {B} *Block*.', v: { B: [5, 8] }, play: (b, c) => b.gainBlock(c.target!.id, c.B) },
  { id: 'provoke', name: 'Provoke', hero: 'knight', cost: 1, type: 'skill', rarity: 'common', target: 'self', art: 'taunt', fx: 'buff',
    text: 'Gain {B} *Block* and *Taunt*.', v: { B: [7, 10] },
    play: (b, c) => { b.gainBlock(c.owner.id, c.B); b.apply(c.owner.id, 'taunt', 1); } },
  { id: 'cleave', name: 'Cleave', hero: 'knight', cost: 1, type: 'attack', rarity: 'common', target: 'allEnemies', el: 'phys', art: 'cleave',
    text: 'Deal {D} damage to ALL enemies.', v: { D: [7, 10] }, play: (b, c) => b.attackAll(c, c.D, 'phys') },
  { id: 'twinstrike', name: 'Twin Strike', hero: 'knight', cost: 1, type: 'attack', rarity: 'common', target: 'enemy', el: 'phys', art: 'twin',
    text: 'Deal {D} damage twice.', v: { D: [4, 6] }, play: (b, c) => b.attack(c, c.D, 'phys', 2) },
  { id: 'shieldbash', name: 'Shield Bash', hero: 'knight', cost: 1, costUp: 0, type: 'attack', rarity: 'common', target: 'enemy', el: 'phys', art: 'bash',
    text: 'Deal damage equal to Knight\'s *Block*.', play: (b, c) => b.attack(c, c.owner.block, 'phys') },
  { id: 'bulwark', name: 'Bulwark', hero: 'knight', cost: 2, type: 'skill', rarity: 'common', target: 'ally', art: 'shield', fx: 'shield',
    text: 'Grant an ally {B} *Block*. Knight gains {M} *Block*.', v: { B: [11, 14], M: [4, 6] },
    play: (b, c) => { b.gainBlock(c.target!.id, c.B); b.gainBlock(c.owner.id, c.M); } },
  { id: 'cover', name: 'Cover', hero: 'knight', cost: 2, type: 'skill', rarity: 'uncommon', target: 'allAllies', art: 'cover', fx: 'shield',
    text: 'ALL allies gain {B} *Block*.', v: { B: [7, 10] }, play: (b, c) => b.aliveHeroes().forEach(h => b.gainBlock(h.id, c.B)) },
  { id: 'flametongue', name: 'Flame Tongue', hero: 'knight', cost: 1, type: 'attack', rarity: 'uncommon', target: 'enemy', el: 'fire', art: 'flameblade',
    text: 'Deal {D} Fire damage. Apply {M} *Burn*.', v: { D: [7, 10], M: [3, 4] },
    play: (b, c) => { b.attack(c, c.D, 'fire'); b.apply(c.target!.id, 'burn', c.M); } },
  { id: 'warcry', name: 'War Cry', hero: 'knight', cost: 1, type: 'power', rarity: 'uncommon', target: 'self', art: 'warcry', fx: 'buff',
    text: 'Knight gains {M} *Strength*.', v: { M: [2, 3] }, play: (b, c) => b.apply(c.owner.id, 'str', c.M) },
  { id: 'ironwall', name: 'Iron Wall', hero: 'knight', cost: 1, type: 'power', rarity: 'uncommon', target: 'self', art: 'wall', fx: 'shield',
    text: 'At the end of your turn, Knight gains {M} *Block*.', v: { M: [4, 6] }, play: (b, c) => b.apply(c.owner.id, 'ironwall', c.M) },
  { id: 'crushingblow', name: 'Crushing Blow', hero: 'knight', cost: 2, type: 'attack', rarity: 'uncommon', target: 'enemy', el: 'phys', art: 'crush',
    text: 'Deal {D} damage. Apply {M} *Vulnerable*.', v: { D: [13, 17], M: [2, 3] },
    play: (b, c) => { b.attack(c, c.D, 'phys'); b.apply(c.target!.id, 'vuln', c.M); } },
  { id: 'retaliate', name: 'Retaliate', hero: 'knight', cost: 1, type: 'power', rarity: 'uncommon', target: 'self', art: 'thorns', fx: 'buff',
    text: 'Knight gains {M} *Thorns*.', v: { M: [3, 5] }, play: (b, c) => b.apply(c.owner.id, 'thorns', c.M) },
  { id: 'rampart', name: 'Rampart', hero: 'knight', cost: 2, costUp: 1, type: 'power', rarity: 'rare', target: 'self', art: 'rampart', fx: 'shield',
    text: 'Knight\'s *Block* no longer expires at the start of your turn.', play: (b, c) => b.apply(c.owner.id, 'rampart', 1) },
  { id: 'sworddance', name: 'Sword Dance', hero: 'knight', cost: 2, type: 'attack', rarity: 'rare', target: 'randomEnemy', el: 'phys', art: 'sworddance',
    text: 'Deal {D} damage to a random enemy {M} times.', v: { D: [4, 4], M: [4, 6] }, play: (b, c) => b.attackRandom(c, c.D, 'phys', c.M) },
  { id: 'laststand', name: 'Last Stand', hero: 'knight', cost: 2, type: 'attack', rarity: 'rare', target: 'enemy', el: 'phys', art: 'laststand',
    text: 'Deal {D} damage. Double if Knight is below half HP.', v: { D: [15, 21] },
    play: (b, c) => b.attack(c, c.owner.hp * 2 < c.owner.maxHp ? c.D * 2 : c.D, 'phys') },

  // ───────────── Black Mage ─────────────
  { id: 'fire', name: 'Fire', hero: 'bmage', cost: 1, type: 'attack', rarity: 'starter', target: 'enemy', el: 'fire', art: 'fire',
    text: 'Deal {D} Fire damage.', v: { D: [7, 10] }, play: (b, c) => b.attack(c, c.D, 'fire') },
  { id: 'blizzard', name: 'Blizzard', hero: 'bmage', cost: 1, type: 'attack', rarity: 'starter', target: 'enemy', el: 'ice', art: 'ice',
    text: 'Deal {D} Ice damage. Apply {M} *Weak*.', v: { D: [5, 7], M: [1, 2] },
    play: (b, c) => { b.attack(c, c.D, 'ice'); b.apply(c.target!.id, 'weak', c.M); } },
  { id: 'thunder', name: 'Thunder', hero: 'bmage', cost: 1, type: 'attack', rarity: 'starter', target: 'enemy', el: 'thunder', art: 'thunder',
    text: 'Deal {D} Thunder damage twice.', v: { D: [3, 5] }, play: (b, c) => b.attack(c, c.D, 'thunder', 2) },
  { id: 'scan', name: 'Scan', hero: 'bmage', cost: 0, type: 'skill', rarity: 'starter', target: 'enemy', art: 'scan', fx: 'buff', exhaust: true,
    text: 'Reveal an enemy\'s weaknesses. Draw {M} card. *Exhaust*.', textUp: 'Reveal an enemy\'s weaknesses. Draw {M} cards. *Exhaust*.', v: { M: [1, 2] },
    play: (b, c) => { b.reveal(c.target!.id); b.draw(c.M); } },
  { id: 'chainlightning', name: 'Chain Lightning', hero: 'bmage', cost: 1, type: 'attack', rarity: 'common', target: 'allEnemies', el: 'thunder', art: 'chain',
    text: 'Deal {D} Thunder damage to ALL enemies twice.', v: { D: [2, 3] }, play: (b, c) => b.attackAll(c, c.D, 'thunder', 2) },
  { id: 'frostnova', name: 'Frost Nova', hero: 'bmage', cost: 1, type: 'attack', rarity: 'common', target: 'allEnemies', el: 'ice', art: 'frostnova',
    text: 'Deal {D} Ice damage to ALL enemies. ALL allies gain {B} *Block*.', v: { D: [4, 6], B: [3, 4] },
    play: (b, c) => { b.attackAll(c, c.D, 'ice'); b.aliveHeroes().forEach(h => b.gainBlock(h.id, c.B)); } },
  { id: 'ignite', name: 'Ignite', hero: 'bmage', cost: 1, type: 'attack', rarity: 'common', target: 'enemy', el: 'fire', art: 'ignite',
    text: 'Deal {D} Fire damage. Apply {M} *Burn*.', v: { D: [3, 4], M: [5, 7] },
    play: (b, c) => { b.attack(c, c.D, 'fire'); b.apply(c.target!.id, 'burn', c.M); } },
  { id: 'manashield', name: 'Mana Shield', hero: 'bmage', cost: 1, type: 'skill', rarity: 'common', target: 'self', art: 'manashield', fx: 'shield',
    text: 'Black Mage gains {B} *Block*. Draw 1 card.', v: { B: [6, 9] }, play: (b, c) => { b.gainBlock(c.owner.id, c.B); b.draw(1); } },
  { id: 'fira', name: 'Fira', hero: 'bmage', cost: 2, type: 'attack', rarity: 'uncommon', target: 'allEnemies', el: 'fire', art: 'firestorm',
    text: 'Deal {D} Fire damage to ALL enemies.', v: { D: [9, 13] }, play: (b, c) => b.attackAll(c, c.D, 'fire') },
  { id: 'glacier', name: 'Glacier', hero: 'bmage', cost: 2, type: 'attack', rarity: 'uncommon', target: 'enemy', el: 'ice', art: 'ice',
    text: 'Deal {D} Ice damage. Apply {M} *Weak*.', v: { D: [13, 17], M: [2, 3] },
    play: (b, c) => { b.attack(c, c.D, 'ice'); b.apply(c.target!.id, 'weak', c.M); } },
  { id: 'thunderstorm', name: 'Thunderstorm', hero: 'bmage', cost: 2, type: 'attack', rarity: 'uncommon', target: 'randomEnemy', el: 'thunder', art: 'thunder',
    text: 'Deal {D} Thunder damage to a random enemy {M} times.', v: { D: [4, 5], M: [4, 4] }, play: (b, c) => b.attackRandom(c, c.D, 'thunder', c.M) },
  { id: 'manasurge', name: 'Mana Surge', hero: 'bmage', cost: 0, type: 'skill', rarity: 'uncommon', target: 'none', art: 'surge', fx: 'buff', exhaust: true,
    text: 'Give back {M} *Action*. *Exhaust*.', v: { M: [1, 2] }, play: (b, c) => b.ready(c.M, c.owner.id) },
  { id: 'focus', name: 'Arcane Focus', hero: 'bmage', cost: 1, type: 'power', rarity: 'uncommon', target: 'self', art: 'focus', fx: 'buff',
    text: 'Black Mage gains {M} *Strength*.', v: { M: [2, 3] }, play: (b, c) => b.apply(c.owner.id, 'str', c.M) },
  { id: 'prism', name: 'Prismatic Ray', hero: 'bmage', cost: 2, type: 'attack', rarity: 'rare', target: 'enemy', el: 'fire', art: 'prism',
    text: 'Deal {D} Fire, {D} Ice and {D} Thunder damage.', v: { D: [6, 8] },
    play: (b, c) => { b.attack(c, c.D, 'fire'); b.attack(c, c.D, 'ice'); b.attack(c, c.D, 'thunder'); } },
  { id: 'flare', name: 'Flare', hero: 'bmage', cost: 2, type: 'attack', rarity: 'rare', target: 'enemy', el: 'fire', art: 'flare',
    text: 'Deal {D} Fire damage.', v: { D: [24, 32] }, play: (b, c) => b.attack(c, c.D, 'fire') },

  // ───────────── White Mage ─────────────
  { id: 'cure', name: 'Cure', hero: 'wmage', cost: 1, type: 'skill', rarity: 'starter', target: 'ally', art: 'cure', fx: 'heal',
    text: 'Heal an ally {H} HP.', v: { H: [5, 7] }, play: (b, c) => b.heal(c.target!.id, c.H) },
  { id: 'protect', name: 'Protect', hero: 'wmage', cost: 1, type: 'skill', rarity: 'starter', target: 'allAllies', art: 'protect', fx: 'shield',
    text: 'ALL allies gain {B} *Block*.', v: { B: [3, 5] }, play: (b, c) => b.aliveHeroes().forEach(h => b.gainBlock(h.id, c.B)) },
  { id: 'holy', name: 'Holy', hero: 'wmage', cost: 1, type: 'attack', rarity: 'starter', target: 'enemy', el: 'holy', art: 'holy',
    text: 'Deal {D} Holy damage.', v: { D: [6, 9] }, play: (b, c) => b.attack(c, c.D, 'holy') },
  { id: 'cura', name: 'Cura', hero: 'wmage', cost: 2, type: 'skill', rarity: 'common', target: 'allAllies', art: 'cura', fx: 'heal',
    text: 'Heal ALL allies {H} HP.', v: { H: [5, 7] }, play: (b, c) => b.aliveHeroes().forEach(h => b.heal(h.id, c.H)) },
  { id: 'regen', name: 'Regen', hero: 'wmage', cost: 1, type: 'skill', rarity: 'common', target: 'ally', art: 'regen', fx: 'heal',
    text: 'Grant an ally {M} *Regen*.', v: { M: [4, 6] }, play: (b, c) => b.apply(c.target!.id, 'regen', c.M) },
  { id: 'purify', name: 'Purify', hero: 'wmage', cost: 0, type: 'skill', rarity: 'common', target: 'allAllies', art: 'purify', fx: 'heal',
    text: 'Remove *Weak*, *Vulnerable* and *Burn* from ALL allies. Draw {M} card.', textUp: 'Remove *Weak*, *Vulnerable* and *Burn* from ALL allies. Draw {M} cards.', v: { M: [1, 2] },
    play: (b, c) => { b.aliveHeroes().forEach(h => b.cleanse(h.id)); b.draw(c.M); } },
  { id: 'holynova', name: 'Holy Nova', hero: 'wmage', cost: 1, type: 'attack', rarity: 'common', target: 'allEnemies', el: 'holy', art: 'holynova',
    text: 'Deal {D} Holy damage to ALL enemies. Heal ALL allies {H} HP.', v: { D: [4, 6], H: [2, 3] },
    play: (b, c) => { b.attackAll(c, c.D, 'holy'); b.aliveHeroes().forEach(h => b.heal(h.id, c.H)); } },
  { id: 'bless', name: 'Blessing', hero: 'wmage', cost: 1, costUp: 0, type: 'skill', rarity: 'uncommon', target: 'allAllies', art: 'bless', fx: 'buff', exhaust: true,
    text: 'ALL allies gain {M} *Strength*. *Exhaust*.', v: { M: [1, 1] }, play: (b, c) => b.aliveHeroes().forEach(h => b.apply(h.id, 'str', c.M)) },
  { id: 'banish', name: 'Banish', hero: 'wmage', cost: 2, type: 'attack', rarity: 'uncommon', target: 'enemy', el: 'holy', art: 'banish',
    text: 'Deal {D} Holy damage.', v: { D: [14, 19] }, play: (b, c) => b.attack(c, c.D, 'holy') },
  { id: 'sanctuary', name: 'Sanctuary', hero: 'wmage', cost: 2, type: 'skill', rarity: 'uncommon', target: 'allAllies', art: 'sanctuary', fx: 'shield',
    text: 'ALL allies gain {B} *Block* and heal {H} HP.', v: { B: [5, 7], H: [3, 4] },
    play: (b, c) => b.aliveHeroes().forEach(h => { b.gainBlock(h.id, c.B); b.heal(h.id, c.H); }) },
  { id: 'raise', name: 'Raise', hero: 'wmage', cost: 1, type: 'skill', rarity: 'uncommon', target: 'deadAlly', art: 'raise', fx: 'heal', exhaust: true,
    text: 'Revive a KO\'d ally with {M}% HP. *Exhaust*.', v: { M: [40, 60] }, play: (b, c) => b.revive(c.target!.id, c.M / 100) },
  { id: 'prayer', name: 'Prayer', hero: 'wmage', cost: 1, type: 'power', rarity: 'uncommon', target: 'self', art: 'prayer', fx: 'heal',
    text: 'At the start of your turn, heal the most wounded ally {M} HP.', v: { M: [3, 4] }, play: (b, c) => b.apply(c.owner.id, 'prayer', c.M) },
  { id: 'miracle', name: 'Miracle', hero: 'wmage', cost: 1, costUp: 0, type: 'skill', rarity: 'rare', target: 'none', art: 'miracle', fx: 'buff', exhaust: true,
    text: 'Give back 2 *Action*. Draw 2 cards. *Exhaust*.', play: (b, c) => { b.ready(2, c.owner.id); b.draw(2); } },
  { id: 'benediction', name: 'Benediction', hero: 'wmage', cost: 2, type: 'skill', rarity: 'rare', target: 'allAllies', art: 'benediction', fx: 'heal', exhaust: true,
    text: 'Heal ALL allies {H} HP. *Exhaust*.', v: { H: [14, 20] }, play: (b, c) => b.aliveHeroes().forEach(h => b.heal(h.id, c.H)) },
  { id: 'angelward', name: 'Angel Ward', hero: 'wmage', cost: 2, costUp: 1, type: 'power', rarity: 'rare', target: 'self', art: 'angel', fx: 'shield',
    text: 'At the start of your turn, ALL allies gain {M} *Block*.', v: { M: [3, 3] }, play: (b, c) => b.apply(c.owner.id, 'ward', c.M) },

  // ───────────── Status ─────────────
  { id: 'daze', name: 'Daze', hero: null, cost: 0, type: 'status', rarity: 'special', target: 'none', art: 'daze', unplayable: true, ethereal: true,
    text: 'Unplayable. *Ethereal*.', play: () => {} },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(defs.map(d => [d.id, d]));

export function cardDef(id: string): CardDef {
  const d = CARDS[id];
  if (!d) throw new Error(`Unknown card ${id}`);
  return d;
}

export function cardCost(c: CardInst): number {
  const d = cardDef(c.id);
  return c.upgraded && d.costUp !== undefined ? d.costUp : d.cost;
}

export function cardVal(c: CardInst, k: Val): number {
  const v = cardDef(c.id).v?.[k];
  return v ? v[c.upgraded ? 1 : 0] : 0;
}

export function cardExhausts(c: CardInst): boolean {
  const d = cardDef(c.id);
  if (d.type === 'power') return true;
  return c.upgraded && d.exhaustUp !== undefined ? d.exhaustUp : !!d.exhaust;
}

export function cardName(c: CardInst): string {
  return cardDef(c.id).name + (c.upgraded ? '+' : '');
}

export function cardText(c: CardInst): string {
  const d = cardDef(c.id);
  return (c.upgraded && d.textUp) || d.text;
}

export function canUpgrade(c: CardInst): boolean {
  const d = cardDef(c.id);
  return !c.upgraded && d.type !== 'status';
}

export const STARTER_DECK = ['slash', 'slash', 'guard', 'guard', 'fire', 'blizzard', 'thunder', 'scan', 'cure', 'protect', 'holy', 'holy'];

/** Cards that can appear as rewards. */
export const REWARD_POOL = defs.filter(d => d.hero && d.rarity !== 'starter' && d.rarity !== 'special');

export const KEYWORDS: Record<string, string> = {
  Block: 'Prevents damage. Removed at the start of your turn.',
  Taunt: 'Single-target enemy attacks are redirected to this hero this round.',
  Burn: 'Loses HP equal to Burn at the start of its turn, then Burn decreases by 1.',
  Weak: 'Deals 25% less damage.',
  Vulnerable: 'Takes 50% more damage.',
  Strength: 'Increases damage dealt by each hit.',
  Regen: 'Heals HP equal to Regen at the start of turn, then Regen decreases by 1.',
  Thorns: 'Attackers take this much damage.',
  Exhaust: 'Removed until the end of combat.',
  Action: 'Each hero gains 1 Action per turn and can hold 2. A card costs as many Actions as it has dots. Hold a hero for a turn to afford a 2-dot card, or to act twice.',
  Ethereal: 'Exhausted if still in hand at the end of your turn.',
};
