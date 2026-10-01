import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { MEMORIES, START, beginAttempt, exits, newStory, placeEnemies, revealed, rewind, stepsRun, travel } from './chapter1';
import { battleInit } from './run';

describe('Chapter 1: Emberfall', () => {
  it('every attempt draws a new Emberfall: every way out reaches the hill, side trips lead back', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let ends = 0;
      const walk = (path: number[]) => {
        const run = beginAttempt(newStory(), seed);
        for (const id of path.slice(1)) travel(run, id);
        if (run.places![run.at!].kind === 'boss') { ends++; return; }
        const opts = exits(run);
        expect(opts.length, `stuck at ${run.places![run.at!].name} (seed ${seed})`).toBeGreaterThan(0);
        for (const o of opts) walk([...path, o.to.id]);
      };
      walk([START]);
      expect(ends).toBeGreaterThan(1);
      const run = beginAttempt(newStory(), seed), ps = run.places!;
      // the story's places are always somewhere, and there's somewhere to rest before the hill
      expect(ps.filter(p => p.event === 'mill')).toHaveLength(1);
      expect(ps.filter(p => p.event === 'bridge')).toHaveLength(1);
      expect(ps.some(p => p.kind === 'inn')).toBe(true);
      expect(new Set(ps.map(p => p.name)).size).toBe(ps.length);
    }
    // a side trip is free to walk back from, and doesn't come up again
    for (let seed = 1; ; seed++) {
      const run = beginAttempt(newStory(), seed);
      const road = run.roads!.find(r => run.places![r.to].spur && r.from !== START && run.roads!.some(q => q.from === START && q.to === r.from));
      if (!road) continue;
      travel(run, road.from);
      travel(run, road.to);
      expect(exits(run).map(e => e.to.id)).toEqual([road.from]);
      const back = travel(run, road.from);
      expect(back.ambush).toBe(false);
      expect(back.arrive).toBe(false);
      expect(exits(run).map(e => e.to.id)).not.toContain(road.to);
      break;
    }
  });

  it('each fall returns to dawn on a new map, with the next Memory, and undoes what was done', () => {
    let run = beginAttempt(newStory());
    const first = run.places!.map(p => p.name).join();
    run.flags!.push('bridgeDown');
    run.shards = 999;
    const got: string[] = [];
    for (let i = 0; i < MEMORIES.length + 1; i++) {
      const r = rewind(run);
      if (r.memory) got.push(r.memory.id);
      run = r.run;
    }
    expect(got).toEqual(MEMORIES.map(m => m.id));
    expect(run.places!.map(p => p.name).join()).not.toBe(first);
    // Memories show where their places are on the new map
    expect(revealed(run).map(p => p.event).sort()).toEqual(['bridge', 'mill']);
    expect(run.path).toEqual([START]);
    expect(run.story!.attempt).toBe(MEMORIES.length + 2);
    expect(run.flags).toEqual([]);
    expect(run.shards).toBe(60);
  });

  it('the deserter\'s warning spares the next ambush', () => {
    const run = beginAttempt(newStory(), 5);
    const road = run.roads!.find(r => r.from === START && r.ambush)!;
    run.flags!.push('patrolsKnown');
    const step = travel(run, road.to);
    expect(step.ambush).toBe(false);
    expect(step.dodged).toBe(true);
    expect(run.flags).toEqual([]);
  });

  it('bringing down the north bridge keeps the soldiers off the hill', () => {
    const run = beginAttempt(newStory());
    const hill = run.places!.find(p => p.kind === 'boss')!;
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
