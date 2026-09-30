import { describe, expect, it } from 'vitest';
import { Battle, type BattleInit } from './battle';
import type { CardInst } from './types';

const card = (id: string, i: number, upgraded = false): CardInst => ({ uid: `t${i}`, id, upgraded });
const party = [
  { id: 'knight' as const, hp: 58, maxHp: 58 },
  { id: 'bmage' as const, hp: 38, maxHp: 38 },
  { id: 'wmage' as const, hp: 44, maxHp: 44 },
];

function mk(deckIds: string[], enemies: string[], extra: Partial<BattleInit> = {}) {
  const b = new Battle({ seed: 7, heroes: party.map(h => ({ ...h })), deck: deckIds.map((id, i) => card(id, i)), enemies, accessories: [], items: [null, null, null], limit: 0, uidStart: 1000, ...extra });
  b.start();
  return b;
}

describe('battle', () => {
  it('draws 5 cards and gives 3 energy', () => {
    const b = mk(Array(10).fill('slash'), ['slime']);
    expect(b.hand.length).toBe(5);
    expect(b.energy).toBe(3);
  });

  it('weakness hits chip shield and break the enemy, broken enemy skips then recovers', () => {
    const b = mk(Array(10).fill('fire'), ['slime']); // slime: shield 2, weak fire
    const e = b.enemies[0];
    e.hp = e.maxHp = 100;
    e.shield = e.maxShield = 2;
    b.play(b.hand[0].uid, e.id);
    expect(e.shield).toBe(1);
    expect(e.known).toContain('fire');
    const hpBefore = e.hp;
    const ev = b.play(b.hand[0].uid, e.id);
    expect(ev.some(x => x.t === 'break')).toBe(true);
    expect(e.broken).toBe(true);
    // broken takes +50%
    b.play(b.hand[0].uid, e.id);
    expect(hpBefore - e.hp).toBe(7 + 10); // 7 (breaking hit) + floor(7*1.5)
    const heroHp = b.heroes.map(h => h.hp);
    b.endTurn();
    expect(b.heroes.map(h => h.hp)).toEqual(heroHp); // skipped its action
    expect(e.broken).toBe(true); // still broken during next player turn
    b.endTurn();
    expect(e.broken).toBe(false);
    expect(e.shield).toBe(2);
  });

  it('taunt redirects single-target attacks to the knight', () => {
    const b = mk(['provoke', ...Array(9).fill('guard')], ['skeleton'], { seed: 3 });
    const prov = b.hand.find(c => c.id === 'provoke') ?? (b.hand[0] = card('provoke', 99));
    b.play(prov.uid);
    const e = b.enemies[0];
    if (b.moveOf(e).dmg !== undefined && b.moveOf(e).target === 'single') expect(b.intent(e).target).toBe('knight');
    const others = [b.hero('bmage').hp, b.hero('wmage').hp];
    b.endTurn();
    expect([b.hero('bmage').hp, b.hero('wmage').hp]).toEqual(others);
  });

  it('KO\'d hero cards cannot be played and full party KO loses', () => {
    const b = mk(Array(10).fill('fire'), ['slime']);
    b.hero('bmage').hp = 0;
    expect(b.canPlay(b.hand[0]).ok).toBe(false);
    for (const h of b.heroes) h.hp = 1;
    for (let i = 0; i < 5 && !b.over; i++) b.endTurn();
    expect(b.over).toBe('lose');
  });

  it('limit break adds limit cards for living heroes', () => {
    const b = mk(Array(10).fill('slash'), ['slime'], { limit: 100 });
    b.hero('wmage').hp = 0;
    b.useLimit();
    expect(b.hand.map(c => c.id)).toEqual(expect.arrayContaining(['aegisrend', 'cataclysm']));
    expect(b.hand.some(c => c.id === 'seraphim')).toBe(false);
    expect(b.limit).toBe(0);
  });

  it('killing all enemies wins', () => {
    const b = mk(Array(10).fill('slash'), ['bat']);
    const e = b.enemies[0];
    e.hp = 5;
    b.play(b.hand[0].uid, e.id);
    expect(b.over).toBe('win');
  });

  it('boss shifts phase at half HP with new weaknesses', () => {
    const b = mk(Array(10).fill('slash'), ['wyrm']);
    const e = b.enemies[0];
    e.hp = e.maxHp / 2 + 3;
    const ev = b.play(b.hand[0].uid, e.id);
    expect(ev.some(x => x.t === 'phase')).toBe(true);
    expect(e.weak).toEqual(['ice', 'holy']);
  });
});

import { genMap, newRun, reachable, gainXp } from './run';
import { Rng } from './rng';

describe('run', () => {
  it('map: every node on rows 0..14 leads to the boss', () => {
    for (let seed = 1; seed < 30; seed++) {
      const map = genMap(new Rng(seed));
      const boss = map.find(n => n.type === 'boss')!;
      for (const n of map) if (n.type !== 'boss') expect(n.next.length).toBeGreaterThan(0);
      expect(map.filter(n => n.next.includes(boss.id)).length).toBeGreaterThan(0);
      expect(map.filter(n => n.row === 8).every(n => n.type === 'treasure')).toBe(true);
    }
  });
  it('new run starts with 12 cards and row-0 choices', () => {
    const run = newRun(42);
    expect(run.deck.length).toBe(12);
    expect(reachable(run).length).toBeGreaterThan(1);
  });
  it('xp levels up and raises max hp', () => {
    const run = newRun(1);
    const hp = run.heroes[0].maxHp;
    expect(gainXp(run, 32)).toBe(1);
    expect(run.heroes[0].maxHp).toBe(hp + 6);
  });
});
