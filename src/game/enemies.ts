import type { Battle, EnemyF } from './battle';
import type { Rng } from './rng';
import type { Element, IntentKind, SpriteId, StatusId } from './types';
import type { CastKind } from '../render/api';

export interface Move {
  name: string;
  kind: IntentKind;
  dmg?: number;
  hits?: number;
  /** single: random living hero; lowest: most wounded hero; all: every hero; each: random hero per hit */
  target?: 'single' | 'lowest' | 'all' | 'each';
  block?: number;
  self?: [StatusId, number][];
  /** applied to the attacked hero(s); with no dmg, to all heroes */
  foe?: [StatusId, number][];
  addCards?: [string, number];
  fx?: CastKind;
}

export interface EnemyDef {
  id: string;
  name: string;
  sprite: SpriteId;
  hp: [number, number];
  shield: number;
  weak: Element[];
  tier: 'normal' | 'elite' | 'boss';
  moves: Record<string, Move>;
  pick: (e: EnemyF, rng: Rng, turn: number) => string;
  /** called after the enemy takes damage */
  onHp?: (b: Battle, e: EnemyF) => void;
}

const last = (e: EnemyF, n = 1) => e.history.slice(-n);
/** pick weighted, but never the same move more than `max` times in a row */
function vary(e: EnemyF, rng: Rng, w: Record<string, number>, max = 2): string {
  const recent = last(e, max);
  const ok = Object.fromEntries(Object.entries(w).filter(([k]) => !(recent.length === max && recent.every(r => r === k))));
  return rng.weighted(Object.keys(ok).length ? ok : w);
}

const defs: EnemyDef[] = [
  { id: 'slime', name: 'Gel Slime', sprite: 'slime', hp: [20, 24], shield: 3, weak: ['fire', 'thunder'], tier: 'normal',
    moves: {
      tackle: { name: 'Tackle', kind: 'attack', dmg: 8, target: 'single' },
      ooze: { name: 'Acid Ooze', kind: 'attackDebuff', dmg: 4, target: 'single', foe: [['weak', 1]] },
    },
    pick: (e, rng) => vary(e, rng, { tackle: 60, ooze: 40 }) },
  { id: 'goblin', name: 'Goblin Cutthroat', sprite: 'goblin', hp: [25, 29], shield: 4, weak: ['phys', 'ice'], tier: 'normal',
    moves: {
      stab: { name: 'Backstab', kind: 'attack', dmg: 10, target: 'lowest' },
      frenzy: { name: 'Frenzy', kind: 'buff', self: [['str', 3]] },
    },
    pick: (e, rng, t) => t === 0 ? 'stab' : vary(e, rng, { stab: 70, frenzy: 30 }, 1) },
  { id: 'bat', name: 'Gloom Bat', sprite: 'bat', hp: [13, 16], shield: 2, weak: ['thunder', 'phys'], tier: 'normal',
    moves: {
      bite: { name: 'Leech Bite', kind: 'attack', dmg: 4, hits: 2, target: 'single' },
      screech: { name: 'Screech', kind: 'debuff', foe: [['vuln', 1]] },
    },
    pick: (e, rng) => vary(e, rng, { bite: 70, screech: 30 }, 1) },
  { id: 'skeleton', name: 'Grave Soldier', sprite: 'skeleton', hp: [32, 36], shield: 4, weak: ['holy', 'phys'], tier: 'normal',
    moves: {
      crush: { name: 'Bone Crush', kind: 'attack', dmg: 13, target: 'single' },
      rattle: { name: 'Rattle', kind: 'attackDebuff', dmg: 7, target: 'single', foe: [['vuln', 1]] },
      guard: { name: 'Shield Up', kind: 'defendBuff', block: 10, self: [['str', 2]] },
    },
    pick: (e, rng) => vary(e, rng, { crush: 45, rattle: 30, guard: 25 }, 1) },
  { id: 'wisp', name: 'Ember Wisp', sprite: 'wisp', hp: [23, 27], shield: 3, weak: ['ice'], tier: 'normal',
    moves: {
      flare: { name: 'Flare Wave', kind: 'attackAll', dmg: 6, target: 'all', fx: 'fire' },
      scorch: { name: 'Scorch', kind: 'attackDebuff', dmg: 7, target: 'single', foe: [['burn', 4]], fx: 'fire' },
      kindle: { name: 'Kindle', kind: 'defendBuff', block: 6, self: [['str', 3]] },
    },
    pick: (e, rng, t) => t === 0 ? 'scorch' : vary(e, rng, { flare: 40, scorch: 35, kindle: 25 }, 1) },
  { id: 'sprout', name: 'Mandrake', sprite: 'sprout', hp: [30, 34], shield: 4, weak: ['fire', 'ice'], tier: 'normal',
    moves: {
      vine: { name: 'Vine Lash', kind: 'attack', dmg: 11, target: 'single' },
      spores: { name: 'Shriek Spores', kind: 'debuff', foe: [['weak', 1], ['burn', 2]], fx: 'debuff' },
      root: { name: 'Take Root', kind: 'defendBuff', block: 8, self: [['regen', 4]] },
    },
    pick: (e, rng) => vary(e, rng, { vine: 50, spores: 25, root: 25 }, 1) },

  // ───── Elites ─────
  { id: 'ogre', name: 'Ironhide Ogre', sprite: 'ogre', hp: [96, 104], shield: 8, weak: ['thunder', 'ice'], tier: 'elite',
    moves: {
      bellow: { name: 'Bellow', kind: 'defendBuff', block: 12, self: [['str', 3]] },
      smash: { name: 'Skull Smash', kind: 'attack', dmg: 24, target: 'single' },
      sweep: { name: 'Club Sweep', kind: 'attackAll', dmg: 11, target: 'all' },
    },
    pick: (e, rng, t) => t === 0 ? 'bellow' : vary(e, rng, { smash: 55, sweep: 45 }, 1) },
  { id: 'paladin', name: 'Fallen Paladin', sprite: 'paladin', hp: [86, 92], shield: 8, weak: ['holy', 'fire'], tier: 'elite',
    moves: {
      darkslash: { name: 'Dark Slash', kind: 'attackDebuff', dmg: 18, target: 'single', foe: [['vuln', 1]], fx: 'dark' },
      unholy: { name: 'Unholy Aura', kind: 'debuff', foe: [['weak', 1]], self: [['str', 3]], fx: 'dark', addCards: ['daze', 1] },
      bulwark: { name: 'Black Bulwark', kind: 'defend', block: 20 },
      reap: { name: 'Reaping Arc', kind: 'attackAll', dmg: 12, target: 'all', fx: 'dark' },
    },
    pick: (e, rng, t) => t === 0 ? 'unholy' : vary(e, rng, { darkslash: 40, reap: 30, bulwark: 20, unholy: 10 }, 1) },

  // ───── Boss ─────
  { id: 'wyrm', name: 'Crystal Wyrm', sprite: 'wyrm', hp: [350, 350], shield: 10, weak: ['thunder', 'phys'], tier: 'boss',
    moves: {
      breath: { name: 'Crystal Breath', kind: 'attackAll', dmg: 11, target: 'all', fx: 'ice', addCards: ['daze', 2] },
      claw: { name: 'Rending Claw', kind: 'attack', dmg: 22, target: 'single' },
      shardrain: { name: 'Shard Rain', kind: 'attack', dmg: 7, hits: 4, target: 'each', fx: 'ice' },
      harden: { name: 'Harden', kind: 'defendBuff', block: 22, self: [['str', 3]] },
      // phase 2
      nova: { name: 'Prism Nova', kind: 'attackDebuff', dmg: 15, target: 'all', foe: [['weak', 1]], fx: 'holy' },
      devour: { name: 'Devour', kind: 'attack', dmg: 32, target: 'lowest', fx: 'dark' },
      refract: { name: 'Refract', kind: 'defendBuff', block: 28, self: [['str', 4]] },
    },
    pick: (e, rng, t) => {
      if (e.phase === 0) return t === 0 ? 'breath' : vary(e, rng, { claw: 35, shardrain: 30, breath: 20, harden: 15 }, 1);
      return vary(e, rng, { nova: 30, devour: 30, claw: 20, refract: 20 }, 1);
    },
    onHp: (b, e) => {
      if (e.phase === 0 && e.hp > 0 && e.hp <= e.maxHp / 2) {
        e.phase = 1;
        b.phaseShift(e, ['ice', 'holy'], 12, 'Prismatic Shift', 'devour');
        b.apply(e.id, 'ritual', 2);
      }
    } },

  // ───── Chapter 1: Emberfall ─────
  { id: 'soldier', name: 'Kaldran Soldier', sprite: 'soldier', hp: [26, 30], shield: 3, weak: ['thunder', 'holy'], tier: 'normal',
    moves: {
      thrust: { name: 'Spear Thrust', kind: 'attack', dmg: 9, target: 'single' },
      wall: { name: 'Shield Wall', kind: 'defendBuff', block: 8, self: [['str', 2]] },
      torch: { name: 'Torch the Thatch', kind: 'attackAll', dmg: 5, target: 'all', fx: 'fire' },
    },
    pick: (e, rng) => vary(e, rng, { thrust: 50, wall: 25, torch: 25 }, 1) },
  { id: 'captain', name: 'Kaldran Captain', sprite: 'captain', hp: [72, 78], shield: 6, weak: ['holy', 'fire'], tier: 'elite',
    moves: {
      orders: { name: 'Orders', kind: 'buff', self: [['str', 3]] },
      lunge: { name: 'Lunge', kind: 'attack', dmg: 17, target: 'lowest' },
      sweep: { name: 'Halberd Sweep', kind: 'attackAll', dmg: 9, target: 'all' },
      brace: { name: 'Brace', kind: 'defend', block: 14 },
    },
    pick: (e, rng, t) => t === 0 ? 'orders' : vary(e, rng, { lunge: 40, sweep: 35, brace: 25 }, 1) },
  // the first night: three strokes, and Aldric falls
  { id: 'ashsteps', name: 'The Ashen Knight', sprite: 'ashknight', hp: [999, 999], shield: 99, weak: [], tier: 'boss',
    moves: {
      stroke: { name: 'Ashen Stroke', kind: 'attack', dmg: 20, target: 'single', fx: 'dark' },
      third: { name: 'The Third Stroke', kind: 'attack', dmg: 99, target: 'single', fx: 'dark' },
    },
    pick: (_e, _rng, t) => (t < 2 ? 'stroke' : 'third') },
  // the hill: he only has to hold them until he can reach Lyra; at half health he hesitates, and they escape
  { id: 'ashknight', name: 'The Ashen Knight', sprite: 'ashknight', hp: [90, 90], shield: 8, weak: ['holy', 'thunder'], tier: 'boss',
    moves: {
      blade: { name: 'Ashen Blade', kind: 'attack', dmg: 12, target: 'single', fx: 'dark' },
      arc: { name: 'Crystal Arc', kind: 'attackAll', dmg: 7, target: 'all', fx: 'ice' },
      foreknow: { name: 'He Knows Your Move', kind: 'defendBuff', block: 18, self: [['str', 3]] },
      forLyra: { name: 'For Her', kind: 'attack', dmg: 18, target: 'lowest', fx: 'dark' },
    },
    pick: (e, rng, t) => t === 0 ? 'foreknow' : vary(e, rng, { blade: 40, arc: 30, forLyra: 15, foreknow: 15 }, 1),
    onHp: (b, e) => { if (e.hp <= e.maxHp / 2) b.finish(true); } },

  // ───── Development ─────
  // the sandbox's target: weak to everything so every element breaks it, and it never fights back
  { id: 'dummy', name: 'Training Dummy', sprite: 'dummy', hp: [999, 999], shield: 3, weak: ['phys', 'fire', 'ice', 'thunder', 'holy'], tier: 'normal',
    moves: { wobble: { name: 'Wobble', kind: 'defend' } },
    pick: () => 'wobble' },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(defs.map(d => [d.id, d]));

export const ENCOUNTERS = {
  easy: [['slime', 'slime'], ['goblin'], ['bat', 'bat'], ['skeleton']],
  normal: [['goblin', 'slime'], ['wisp', 'bat'], ['skeleton', 'sprout'], ['bat', 'bat', 'bat'], ['sprout', 'wisp'], ['goblin', 'goblin'], ['skeleton', 'bat'], ['slime', 'slime', 'slime']],
  elite: [['ogre'], ['paladin']],
  boss: [['wyrm']],
};

/** Chapter 1 (Emberfall): Kaldra's vanguard, and what the Dimming brings to the edge of the village */
export const EMBERFALL = {
  easy: [['soldier'], ['bat', 'bat'], ['wisp']],
  normal: [['soldier', 'soldier'], ['soldier', 'wisp'], ['soldier', 'bat'], ['wisp', 'wisp'], ['bat', 'bat', 'bat']],
  elite: [['soldier', 'captain']],
};
