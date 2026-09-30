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
  s += b.energy * 0.5 + b.hand.length * 0.3;
  return s;
}

function botTurn(b: Battle) {
  if (b.limit >= 100) b.useLimit();
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

const lost: Record<string, number[]> = {};
function fight(run: Run, type: NodeType, row: number): { won: boolean; turns: number } {
  const before = run.heroes.reduce((s, h) => s + h.hp, 0);
  run.at = run.map.find(n => n.row === row)?.id ?? null;
  const b = new Battle(battleInit(run, encounter(run, type)));
  b.start();
  while (!b.over && b.turn < 40) botTurn(b);
  const endHp = b.heroes.reduce((s, h) => s + Math.max(0, h.hp), 0);
  (lost[`${type}@${row}`] ??= []).push(before - endHp);
  afterBattle(run, b);
  return { won: b.over === 'win', turns: b.turn };
}

const ACT: [NodeType, number][] = [
  ['battle', 0], ['battle', 1], ['battle', 2], ['battle', 3], ['battle', 4], ['elite', 5], ['battle', 6], ['inn', 7], ['battle', 8],
  ['battle', 9], ['elite', 10], ['battle', 11], ['battle', 12], ['inn', 14], ['boss', 15],
];

describe.skipIf(!process.env.SIM)('balance sim', () => {
  it('plays acts', () => {
    const N = Number(process.env.SIM_N ?? 60);
    const deaths: Record<string, number> = {};
    const hpAfter: Record<string, number[]> = {};
    let wins = 0, bossTurns = 0;
    for (let i = 0; i < N; i++) {
      const run = newRun(1000 + i);
      const r = new Rng(i);
      let alive = true;
      for (const [type, row] of ACT) {
        if (type === 'inn') {
          if (run.heroes.some(h => h.hp < h.maxHp * 0.6)) restHeal(run); else { const u = upgradable(run); if (u.length) upgradeCard(run, r.pick(u).uid); }
          continue;
        }
        const res = fight(run, type, row);
        const key = `${type}@${row}`;
        (hpAfter[key] ??= []).push(run.heroes.reduce((s, h) => s + h.hp, 0));
        if (!res.won) { deaths[key] = (deaths[key] ?? 0) + 1; alive = false; break; }
        if (type === 'boss') { wins++; bossTurns += res.turns; break; }
        const rw = battleRewards(run, type);
        run.gold += rw.gold;
        if (rw.cards.length && r.chance(0.7)) run.deck.push(newCard(run, rw.cards[r.int(rw.cards.length)]));
        const ups = gainXp(run, rw.xp);
        for (let u = 0; u < ups; u++) run.deck.push(newCard(run, r.pick(levelUpChoices(run))));
      }
      void alive;
    }
    console.log(`\nwin rate ${(wins / N * 100).toFixed(0)}%  avg boss turns ${(bossTurns / Math.max(1, wins)).toFixed(1)}`);
    console.log('deaths by fight:', deaths);
    console.log('avg party hp after fight:', Object.fromEntries(Object.entries(hpAfter).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)])));
    console.log('avg hp lost in fight:', Object.fromEntries(Object.entries(lost).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)])));
    void CARDS; void ({} as EnemyF);
  });
});
