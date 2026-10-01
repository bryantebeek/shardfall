// Core domain types shared by engine, UI, renderer, art and audio.

export type Element = 'phys' | 'fire' | 'ice' | 'thunder' | 'holy' | 'dark';
export const PLAYER_ELEMENTS: Element[] = ['phys', 'fire', 'ice', 'thunder', 'holy'];

export type HeroId = 'knight' | 'bmage' | 'wmage';
export const HERO_IDS: HeroId[] = ['knight', 'bmage', 'wmage'];

export type StatusId =
  | 'str'      // +N damage per hit
  | 'weak'     // deals 25% less damage (turns)
  | 'vuln'     // takes 50% more damage (turns)
  | 'regen'    // heal N at start of turn, then N-1
  | 'burn'     // lose N HP at start of turn, then N-1
  | 'taunt'    // single-target enemy attacks hit this unit (turns)
  | 'thorns'   // attackers take N damage
  | 'ironwall' // gain N block at end of turn
  | 'rampart'  // block is not removed at start of turn
  | 'prayer'   // at start of turn heal lowest-HP ally N
  | 'ward'     // at start of turn all allies gain N block
  | 'ritual';  // enemy: gain N str at end of its turn

export type Statuses = Partial<Record<StatusId, number>>;

export type CardType = 'attack' | 'skill' | 'power' | 'status';
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'special';
export type TargetKind = 'enemy' | 'allEnemies' | 'randomEnemy' | 'ally' | 'deadAlly' | 'allAllies' | 'self' | 'none';

/** Art key for procedurally drawn card illustrations (see src/art). */
export type CardArt =
  | 'slash' | 'shield' | 'taunt' | 'cleave' | 'twin' | 'bash' | 'cover' | 'flameblade' | 'warcry'
  | 'wall' | 'crush' | 'rampart' | 'sworddance' | 'laststand' | 'thorns'
  | 'fire' | 'ice' | 'thunder' | 'scan' | 'firestorm' | 'chain' | 'frostnova' | 'ignite'
  | 'prism' | 'flare' | 'manashield' | 'surge' | 'focus'
  | 'cure' | 'protect' | 'holy' | 'cura' | 'regen' | 'bless' | 'banish' | 'sanctuary' | 'raise'
  | 'purify' | 'prayer' | 'holynova' | 'miracle' | 'benediction' | 'angel'
  | 'daze';

export interface CardInst {
  uid: string;
  id: string;
  upgraded: boolean;
}

export type IntentKind = 'attack' | 'attackAll' | 'defend' | 'buff' | 'debuff' | 'attackDebuff' | 'defendBuff' | 'special' | 'stunned' | 'unknown';

export interface Intent {
  kind: IntentKind;
  /** per-hit damage already including enemy strength/weak modifiers (display value) */
  dmg?: number;
  hits?: number;
  /** hero targeted by single-target attacks */
  target?: HeroId;
  label?: string;
}

/** Sprite keys the art module must provide. */
export type SpriteId =
  | 'knight' | 'bmage' | 'wmage'
  | 'slime' | 'goblin' | 'bat' | 'skeleton' | 'wisp' | 'sprout'
  | 'ogre' | 'paladin' | 'wyrm'
  | 'soldier' | 'captain' | 'ashknight' | 'nell'
  | 'dummy';
