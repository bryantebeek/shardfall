import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { MEMORIES, PLACES, START, beginAttempt, exits, newStory, placeEnemies, rewind, stepsRun, travel } from './chapter1';
import { battleInit } from './run';

describe('Chapter 1: Emberfall', () => {
  it('every way out of the village reaches the hill, and side trips lead back', () => {
    const ends = new Set<string>();
    const walk = (path: number[]) => {
      const run = beginAttempt(newStory());
      for (const id of path.slice(1)) travel(run, id);
      const opts = exits(run);
      if (PLACES[run.at!].kind === 'boss') { ends.add(path.join('>')); return; }
      expect(opts.length, `stuck at ${PLACES[run.at!].name}`).toBeGreaterThan(0);
      for (const o of opts) walk([...path, o.to.id]);
    };
    walk([START]);
    expect(ends.size).toBeGreaterThan(4);
    // a side trip: the Mill, then back to the square (no second ambush on the way back)
    const run = beginAttempt(newStory());
    expect(travel(run, 2).ambush).toBe(true);
    expect(travel(run, 3).ambush).toBe(true);
    expect(exits(run).map(e => e.to.id)).toEqual([2]);
    const back = travel(run, 2);
    expect(back.ambush).toBe(false);
    expect(back.arrive).toBe(false);
    expect(exits(run).map(e => e.to.id)).not.toContain(3);
  });

  it('each fall returns to dawn with the next Memory, and undoes what was done', () => {
    let run = beginAttempt(newStory());
    travel(run, 2);
    run.flags!.push('bridgeDown');
    run.shards = 999;
    const got: string[] = [];
    for (let i = 0; i < MEMORIES.length + 1; i++) {
      const r = rewind(run);
      if (r.memory) got.push(r.memory.id);
      run = r.run;
    }
    expect(got).toEqual(MEMORIES.map(m => m.id));
    // the route and where it ended stay on the map; Memories reveal places
    expect(run.story!.trails[0]).toEqual([START, 2]);
    expect(run.story!.falls[0]).toEqual({ attempt: 1, from: 2, to: 2 });
    expect(run.story!.known).toEqual(expect.arrayContaining([START, 2, 5, 3]));
    expect(run.path).toEqual([START]);
    expect(run.story!.attempt).toBe(MEMORIES.length + 2);
    expect(run.flags).toEqual([]);
    expect(run.shards).toBe(60);
  });

  it('bringing down the north bridge keeps the soldiers off the hill', () => {
    const run = beginAttempt(newStory());
    const hill = PLACES.find(p => p.kind === 'boss')!;
    expect(placeEnemies(run, hill)).toEqual(['soldier', 'ashknight', 'soldier']);
    run.flags!.push('bridgeDown');
    expect(placeEnemies(run, hill)).toEqual(['ashknight']);
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
