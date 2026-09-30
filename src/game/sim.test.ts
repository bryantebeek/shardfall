// Balance simulator: a greedy one-ply bot plays full acts. Run with `npm run sim`.
// Skipped in the normal test run (SIM=1 enables it).
import { describe, it } from 'vitest';
import { Battle, type EnemyF } from './battle';
import { cardDef, CARDS } from './cards';
import { Rng } from './rng';
import { afterBattle, battleInit, battleRewards, encounter, gainXp, levelUpChoices, newCard, newRun, restHeal, upgradable, upgradeCard, type NodeType, type Run } from './run';

function clone(b: Battle): Battle {
  const c = Object.assign(Object.create(Battle.prototype), structuredClone({ ...b, rng: { s: b.rng.s } })) as Battle;
  c.rng = new Rng(b.rng.s);
  return c;
}

function score(b: Battle): number {
  if (b.over === 'win') return 1e6;
  if (b.over === 'lose') return -1e6;
  let s = 0;
  const incoming = new Map<string, number>();
  for (const e of b.aliveEnemies()) {
    s -= e.hp * 1.0 + e.block * 0.6;
    if (e.broken && !e.skipped) s += 12;
    s += (e.maxShield - e.shield) * 2;
    s -= (e.st.str ?? 0) * 3;
    s += (e.st.vuln ?? 0) * 2 + (e.st.weak ?? 0) * 2 + (e.st.burn ?? 0) * 1.2;
    const it = b.intent(e);
    if (it.dmg === undefined) continue;
    const m = b.moveOf(e);
    const total = it.dmg * (it.hits ?? 1);
    if (m.target === 'all') b.aliveHeroes().forEach(h => incoming.set(h.id, (incoming.get(h.id) ?? 0) + total));
    else if (m.target === 'each') b.aliveHeroes().forEach(h => incoming.set(h.id, (incoming.get(h.id) ?? 0) + total / b.aliveHeroes().length));
    else if (it.target) incoming.set(it.target, (incoming.get(it.target) ?? 0) + total);
  }
  for (const h of b.heroes) {
    if (h.hp <= 0) { s -= 60; continue; }
    const dmg = Math.max(0, (incoming.get(h.id) ?? 0) - h.block);
    s += Math.min(h.hp, h.hp - dmg) * 1.2;
    if (dmg >= h.hp) s -= 40;
    s += (h.st.str ?? 0) * 6 + (h.st.regen ?? 0) * 1.5 + (h.st.thorns ?? 0) * 2 + (h.st.ironwall ?? 0) * 4 + (h.st.prayer ?? 0) * 5 + (h.st.ward ?? 0) * 8 + (h.st.rampart ? 10 : 0);
    s -= (h.st.weak ?? 0) * 2 + (h.st.vuln ?? 0) * 2 + (h.st.burn ?? 0);
  }
  s += b.aliveHeroes().reduce((n, h) => n + h.acts, 0) * 0.5 + b.hand.length * 0.3;
  return s;
}

function botTurn(b: Battle) {
  for (let guard = 0; guard < 20 && !b.over; guard++) {
    const base = score(b);
    let best: { uid: string; t?: string; s: number } | null = null;
    for (const c of b.hand) {
      if (!b.canPlay(c).ok) continue;
      const d = cardDef(c.id);
      const targets = d.target === 'enemy' ? b.aliveEnemies().map(e => e.id) : d.target === 'ally' ? b.aliveHeroes().map(h => h.id) : d.target === 'deadAlly' ? b.heroes.filter(h => h.hp <= 0).map(h => h.id) : [undefined];
      for (const t of targets) {
        const sim = clone(b);
        sim.play(c.uid, t);
        const sc = score(sim);
        if (!best || sc > best.s) best = { uid: c.uid, t, s: sc };
      }
    }
    if (!best || best.s <= base) break;
    b.play(best.uid, best.t);
  }
  if (!b.over) b.endTurn();
}

interface FightStat { won: boolean; turns: number; lostPct: number; kos: number; enemyHp: number; level: number; partyMax: number }

function fight(run: Run, type: NodeType, row: number): FightStat {
  const before = run.heroes.reduce((s, h) => s + h.hp, 0);
  const partyMax = run.heroes.reduce((s, h) => s + h.maxHp, 0);
  run.at = run.map.find(n => n.row === row)?.id ?? null;
  const b = new Battle(battleInit(run, encounter(run, type)));
  const enemyHp = b.enemies.reduce((s, e) => s + e.maxHp, 0);
  b.start();
  let kos = 0;
  while (!b.over && b.turn < 40) { const alive = b.aliveHeroes().length; botTurn(b); kos += Math.max(0, alive - b.aliveHeroes().length); }
  const endHp = b.heroes.reduce((s, h) => s + Math.max(0, h.hp), 0);
  const level = run.level;
  afterBattle(run, b);
  return { won: b.over === 'win', turns: b.turn, lostPct: (before - endHp) / partyMax, kos, enemyHp, level, partyMax };
}

const ACT: [NodeType, number][] = [
  ['battle', 0], ['battle', 1], ['battle', 2], ['battle', 3], ['battle', 4], ['elite', 5], ['battle', 6], ['inn', 7], ['battle', 8],
  ['battle', 9], ['elite', 10], ['battle', 11], ['battle', 12], ['inn', 14], ['boss', 15],
];

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

describe.skipIf(!env.SIM)('balance sim', () => {
  it('plays acts', () => {
    const N = Number(env.SIM_N ?? 60);
    const stats = new Map<string, FightStat[]>();
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const run = newRun(1000 + i);
      const r = new Rng(i);
      for (const [type, row] of ACT) {
        if (type === 'inn') {
          if (run.heroes.some(h => h.hp < h.maxHp * 0.6)) restHeal(run); else { const u = upgradable(run); if (u.length) upgradeCard(run, r.pick(u).uid); }
          continue;
        }
        const res = fight(run, type, row);
        const key = `${type === 'battle' ? 'normal' : type} f${row + 1}`;
        if (!stats.has(key)) stats.set(key, []);
        stats.get(key)!.push(res);
        if (!res.won) break;
        if (type === 'boss') { wins++; break; }
        const rw = battleRewards(run, type);
        if (rw.cards.length && r.chance(0.7)) run.deck.push(newCard(run, rw.cards[r.int(rw.cards.length)]));
        const ups = gainXp(run, rw.xp);
        for (let u = 0; u < ups; u++) run.deck.push(newCard(run, r.pick(levelUpChoices(run))));
      }
    }
    const rows = [...stats].map(([k, v]) => {
      const died = v.filter(x => !x.won).length;
      return `${k.padEnd(12)} ${String(v.length).padStart(5)} ${(100 * (1 - died / v.length)).toFixed(0).padStart(6)}% ${avg(v.map(x => x.level)).toFixed(1).padStart(6)} ${Math.round(avg(v.map(x => x.partyMax))).toString().padStart(8)} ${Math.round(avg(v.map(x => x.enemyHp))).toString().padStart(8)} ${avg(v.map(x => x.turns)).toFixed(1).padStart(6)} ${(100 * avg(v.map(x => x.lostPct))).toFixed(0).padStart(7)}% ${avg(v.map(x => x.kos)).toFixed(2).padStart(6)}`;
    });
    console.log(`\nruns ${N}   win rate ${(wins / N * 100).toFixed(0)}%\n` +
      'fight        reach  survive  lvl  partyMax  enemyHP  turns  hpLost    KOs\n' + rows.join('\n'));
    void CARDS; void ({} as EnemyF);
  }, 600_000);
});

// Chapter 1: one route out of Emberfall (square → lane → hayloft → forest road → ridge → hill road → the hill), with and without Memories.
describe.skipIf(!env.SIM)('chapter 1 sim', () => {
  it('escapes Emberfall', async () => {
    const { beginAttempt, emberfallEnemies, newStory } = await import('./chapter1');
    const N = Number(env.SIM_N ?? 100);
    const lines: string[] = [];
    for (const mem of [[], ['guard'], ['guard', 'bridge']]) {
      let wins = 0, reach = 0;
      for (let i = 0; i < N; i++) {
        const story = newStory();
        story.memories = mem;
        const run = beginAttempt(story, 3000 + i);
        if (mem.includes('bridge')) run.flags!.push('bridgeDown');
        const r = new Rng(i);
        for (const id of [0, 3, 6, 8, 10, 12, 13]) {
          const node = run.map[id];
          if (node.type === 'inn') { if (run.heroes.some(h => h.hp < h.maxHp * 0.6)) restHeal(run); continue; }
          run.at = id;
          if (node.type === 'boss') reach++;
          const b = new Battle(battleInit(run, { enemies: emberfallEnemies(run, node), hpScale: 1 }));
          if (mem.includes('guard')) for (const e of b.enemies) if (e.def === 'ashknight') { e.known = [...e.weak]; e.shield = e.maxShield = 3; }
          b.start();
          while (!b.over && b.turn < 40) botTurn(b);
          afterBattle(run, b);
          if (b.over !== 'win') break;
          if (node.type === 'boss') { wins++; break; }
          const rw = battleRewards(run, node.type);
            if (rw.cards.length && r.chance(0.7)) run.deck.push(newCard(run, rw.cards[r.int(rw.cards.length)]));
          const ups = gainXp(run, rw.xp);
          for (let u = 0; u < ups; u++) run.deck.push(newCard(run, r.pick(levelUpChoices(run))));
        }
      }
      lines.push(`memories [${mem.join(', ') || 'none'}]`.padEnd(34) + `reach the hill ${Math.round((100 * reach) / N)}%   escape ${Math.round((100 * wins) / N)}%`);
    }
    console.log('\n' + lines.join('\n'));
  }, 600_000);
});
