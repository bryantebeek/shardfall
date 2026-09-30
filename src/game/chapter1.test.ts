import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { MEMORIES, beginAttempt, emberfallEnemies, emberfallMap, newStory, rewind, stepsRun } from './chapter1';
import { battleInit } from './run';

describe('Chapter 1: Emberfall', () => {
  it('every path through the village reaches the hill', () => {
    const map = emberfallMap();
    const byId = new Map(map.map(n => [n.id, n]));
    const reaches = (id: number): boolean => byId.get(id)!.type === 'boss' || (byId.get(id)!.next.length > 0 && byId.get(id)!.next.every(reaches));
    for (const n of map.filter(n => n.row === 0)) expect(reaches(n.id)).toBe(true);
    for (const n of map) for (const to of n.next) expect(byId.get(to)!.row).toBe(n.row + 1);
  });

  it('each fall returns to dawn with the next Memory, and undoes what was done', () => {
    let run = beginAttempt(newStory());
    run.flags!.push('bridgeDown');
    run.shards = 999;
    const got: string[] = [];
    for (let i = 0; i < MEMORIES.length + 1; i++) {
      const r = rewind(run);
      if (r.memory) got.push(r.memory.id);
      run = r.run;
    }
    expect(got).toEqual(MEMORIES.map(m => m.id));
    expect(run.story!.attempt).toBe(MEMORIES.length + 2);
    expect(run.flags).toEqual([]);
    expect(run.shards).toBe(60);
  });

  it('bringing down the north bridge keeps the soldiers off the hill', () => {
    const run = beginAttempt(newStory());
    const hill = run.map.find(n => n.type === 'boss')!;
    expect(emberfallEnemies(run, hill)).toEqual(['soldier', 'ashknight', 'soldier']);
    run.flags!.push('bridgeDown');
    expect(emberfallEnemies(run, hill)).toEqual(['ashknight']);
  });

  it('on the hill, the Ashen Knight stops at half health', () => {
    const run = beginAttempt(newStory());
    const b = new Battle(battleInit(run, { enemies: ['ashknight'], hpScale: 1 }));
    b.start();
    const k = b.enemies[0];
    k.hp = k.maxHp / 2 + 1;
    b.hand.push({ uid: 'x', id: 'slash', upgraded: false });
    b.hero('knight').acts = 1;
    b.play('x', k.id);
    expect(b.over).toBe('win');
    expect(k.dead).toBe(false);
  });

  it('on the shrine steps, Aldric falls on the third stroke however he guards', () => {
    const b = new Battle(battleInit(stepsRun(), { enemies: ['ashsteps'], hpScale: 1 }));
    b.start();
    for (let t = 0; t < 3 && !b.over; t++) {
      for (const c of [...b.hand]) if (c.id === 'guard') b.play(c.uid, 'knight');
      b.endTurn();
    }
    expect(b.over).toBe('lose');
  });
});
