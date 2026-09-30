// Run-level state: party, deck, map, economy, progression, persistence. Pure (no DOM besides localStorage).
import type { Battle } from './battle';
import { CARDS, REWARD_POOL, STARTER_DECK, canUpgrade } from './cards';
import { ENCOUNTERS } from './enemies';
import { HEROES, xpToNext } from './heroes';
import { ACC_POOL, ACCESSORIES, ITEM_IDS, ITEMS, type AccId, type ItemId } from './loot';
import { Rng } from './rng';
import { HERO_IDS, type CardInst, type HeroId, type Rarity } from './types';

export type NodeType = 'battle' | 'elite' | 'event' | 'inn' | 'shop' | 'treasure' | 'boss';
export interface MapNode { id: number; row: number; col: number; type: NodeType; next: number[] }
export interface RunHero { id: HeroId; hp: number; maxHp: number }

export interface RunStats { floors: number; kills: number; damage: number; breaks: number; cardsPlayed: number; elites: number; maxHit: number; limits: number; startedAt: number }

export interface Run {
  v: 1;
  seed: number;
  rng: number;
  heroes: RunHero[];
  level: number;
  xp: number;
  deck: CardInst[];
  gold: number;
  items: (ItemId | null)[];
  acc: AccId[];
  limit: number;
  map: MapNode[];
  at: number | null;
  path: number[];
  uid: number;
  removeCost: number;
  seenEvents: string[];
  stats: RunStats;
}

export const ROWS = 15; // + boss row
const COLS = 7;
const SAVE_KEY = 'shardfall.run';

export function withRng<T>(run: Run, f: (r: Rng) => T): T {
  const r = new Rng(run.rng);
  const out = f(r);
  run.rng = r.s;
  return out;
}

export function newCard(run: Run, id: string, upgraded = false): CardInst {
  return { uid: `c${run.uid++}`, id, upgraded };
}

export function newRun(seed = (Math.random() * 2 ** 31) | 0): Run {
  const run: Run = {
    v: 1, seed, rng: seed,
    heroes: HERO_IDS.map(id => ({ id, hp: HEROES[id].hp, maxHp: HEROES[id].hp })),
    level: 1, xp: 0, deck: [], gold: 99, items: ['potion', null, null], acc: ['charm'], limit: 0,
    map: [], at: null, path: [], uid: 1, removeCost: 75, seenEvents: [],
    stats: { floors: 0, kills: 0, damage: 0, breaks: 0, cardsPlayed: 0, elites: 0, maxHit: 0, limits: 0, startedAt: Date.now() },
  };
  run.deck = STARTER_DECK.map(id => newCard(run, id));
  run.map = withRng(run, genMap);
  return run;
}

// ───────────────────────── map ─────────────────────────
export function genMap(r: Rng): MapNode[] {
  const grid = new Map<string, MapNode>();
  let id = 0;
  const node = (row: number, col: number) => {
    const k = `${row},${col}`;
    if (!grid.has(k)) grid.set(k, { id: id++, row, col, type: 'battle', next: [] });
    return grid.get(k)!;
  };
  for (let p = 0; p < 6; p++) {
    let col = p === 0 ? r.range(0, 2) : p === 1 ? r.range(4, 6) : r.int(COLS);
    let prev = node(0, col);
    for (let row = 1; row < ROWS; row++) {
      col = Math.min(COLS - 1, Math.max(0, col + r.range(-1, 1)));
      const n = node(row, col);
      if (!prev.next.includes(n.id)) prev.next.push(n.id);
      prev = n;
    }
  }
  const nodes = [...grid.values()];
  const boss: MapNode = { id: id++, row: ROWS, col: 3, type: 'boss', next: [] };
  nodes.filter(n => n.row === ROWS - 1).forEach(n => n.next.push(boss.id));
  nodes.push(boss);

  const byId = new Map(nodes.map(n => [n.id, n]));
  const parents = (n: MapNode) => nodes.filter(p => p.next.includes(n.id));
  for (const n of nodes.sort((a, b) => a.row - b.row)) {
    if (n.type === 'boss') continue;
    if (n.row === 0) { n.type = 'battle'; continue; }
    if (n.row === 8) { n.type = 'treasure'; continue; }
    if (n.row === ROWS - 1) { n.type = 'inn'; continue; }
    for (let tries = 0; tries < 10; tries++) {
      const t = r.weighted<NodeType>({ battle: 46, event: 22, elite: n.row >= 5 ? 10 : 0, inn: n.row >= 5 && n.row < ROWS - 2 ? 11 : 0, shop: n.row >= 3 ? 7 : 0 });
      const clash = t !== 'battle' && t !== 'event' && parents(n).some(p => p.type === t);
      if (!clash) { n.type = t; break; }
    }
  }
  nodes.forEach(n => n.next.sort((a, b) => byId.get(a)!.col - byId.get(b)!.col));
  return nodes.sort((a, b) => a.id - b.id);
}

export function nodeById(run: Run, id: number): MapNode { return run.map.find(n => n.id === id)!; }

export function reachable(run: Run): number[] {
  if (run.at === null) return run.map.filter(n => n.row === 0).map(n => n.id);
  return nodeById(run, run.at).next;
}

export function currentRow(run: Run): number { return run.at === null ? -1 : nodeById(run, run.at).row; }

export function enterNode(run: Run, id: number): MapNode {
  run.at = id;
  run.path.push(id);
  const n = nodeById(run, id);
  run.stats.floors = n.row + 1;
  return n;
}

export function theme(run: Run): 'ruins' | 'depths' | 'boss' {
  const row = currentRow(run);
  return row >= ROWS ? 'boss' : row >= 8 ? 'depths' : 'ruins';
}

// ───────────────────────── battles ─────────────────────────
export function encounter(run: Run, type: NodeType): { enemies: string[]; hpScale: number } {
  const row = Math.max(0, currentRow(run));
  const pool = type === 'boss' ? ENCOUNTERS.boss : type === 'elite' ? ENCOUNTERS.elite : row < 3 ? ENCOUNTERS.easy : ENCOUNTERS.normal;
  const enemies = withRng(run, r => r.pick(pool));
  return { enemies: [...enemies], hpScale: type === 'boss' ? 1 : 1 + row * 0.04 };
}

export function battleInit(run: Run, enc: { enemies: string[]; hpScale: number }) {
  return {
    seed: withRng(run, r => r.int(2 ** 31)),
    heroes: run.heroes.map(h => ({ ...h })),
    deck: run.deck,
    enemies: enc.enemies,
    accessories: run.acc,
    items: run.items,
    limit: run.limit,
    hpScale: enc.hpScale,
    uidStart: run.uid + 10000,
  };
}

/** Copy the battle outcome back into the run. KO'd heroes return with 1 HP (or 50% with Phoenix Plume). */
export function afterBattle(run: Run, b: Battle): void {
  run.limit = b.limit;
  run.items = [...b.items];
  const s = b.stats;
  run.stats.kills += s.kills;
  run.stats.damage += s.damage;
  run.stats.breaks += s.breaks;
  run.stats.cardsPlayed += s.cardsPlayed;
  run.stats.maxHit = Math.max(run.stats.maxHit, s.maxHit);
  for (const bh of b.heroes) {
    const h = run.heroes.find(x => x.id === bh.id)!;
    h.hp = bh.hp > 0 ? bh.hp : run.acc.includes('phoenixPlume') ? Math.ceil(h.maxHp / 2) : 1;
    if (run.acc.includes('charm') && bh.hp > 0) h.hp = Math.min(h.maxHp, h.hp + 3);
  }
}

export interface Rewards { gold: number; xp: number; cards: string[]; item: ItemId | null; acc: AccId | null }

export function battleRewards(run: Run, type: NodeType): Rewards {
  return withRng(run, r => {
    const elite = type === 'elite';
    let gold = elite ? r.range(30, 40) : type === 'boss' ? 100 : r.range(12, 20);
    if (run.acc.includes('luckyCoin')) gold += 12;
    const xp = Math.round((elite ? 45 : type === 'boss' ? 0 : 20) * (run.acc.includes('tome') ? 1.25 : 1));
    return {
      gold, xp,
      cards: rollCards(r, 3, elite ? { common: 50, uncommon: 38, rare: 12 } : { common: 60, uncommon: 33, rare: 7 }),
      item: r.chance(elite ? 0.6 : 0.35) ? r.pick(ITEM_IDS) : null,
      acc: elite ? rollAcc(run, r) : null,
    };
  });
}

export function rollCards(r: Rng, n: number, w: Partial<Record<Rarity, number>>, hero?: HeroId, exclude: string[] = []): string[] {
  const out: string[] = [];
  for (let guard = 0; out.length < n && guard < 200; guard++) {
    const rarity = r.weighted(w);
    const pool = REWARD_POOL.filter(d => d.rarity === rarity && (!hero || d.hero === hero) && !out.includes(d.id) && !exclude.includes(d.id));
    if (pool.length) out.push(r.pick(pool).id);
  }
  return out;
}

export function rollAcc(run: Run, r: Rng): AccId | null {
  const pool = ACC_POOL.filter(a => !run.acc.includes(a));
  return pool.length ? r.pick(pool) : null;
}

export function addItem(run: Run, id: ItemId): boolean {
  const slot = run.items.indexOf(null);
  if (slot < 0) return false;
  run.items[slot] = id;
  return true;
}

export function addAcc(run: Run, id: AccId) {
  if (!run.acc.includes(id)) run.acc.push(id);
}

// ───────────────────────── progression ─────────────────────────
/** Returns how many levels were gained. */
export function gainXp(run: Run, xp: number): number {
  run.xp += xp;
  let ups = 0;
  while (run.xp >= xpToNext(run.level)) {
    run.xp -= xpToNext(run.level);
    run.level++;
    ups++;
    for (const h of run.heroes) {
      const inc = HEROES[h.id].hpPerLevel;
      h.maxHp += inc;
      h.hp = Math.min(h.maxHp, h.hp + inc);
    }
  }
  return ups;
}

/** One card offer per hero, biased toward stronger rarities. */
export function levelUpChoices(run: Run): string[] {
  return withRng(run, r => HERO_IDS.flatMap(h => rollCards(r, 1, { common: 25, uncommon: 50, rare: 25 }, h)));
}

// ───────────────────────── deck ─────────────────────────
export function upgradeCard(run: Run, uid: string) {
  const c = run.deck.find(c => c.uid === uid);
  if (c && canUpgrade(c)) c.upgraded = true;
}

export function removeCard(run: Run, uid: string) {
  run.deck = run.deck.filter(c => c.uid !== uid);
}

export function upgradable(run: Run): CardInst[] { return run.deck.filter(canUpgrade); }

// ───────────────────────── shop / inn / treasure ─────────────────────────
export interface ShopStock {
  cards: { id: string; price: number; sold: boolean }[];
  accs: { id: AccId; price: number; sold: boolean }[];
  items: { id: ItemId; price: number; sold: boolean }[];
  removeUsed: boolean;
}

const RARITY_PRICE: Record<string, [number, number]> = { common: [45, 55], uncommon: [70, 85], rare: [140, 165] };

export function shopStock(run: Run): ShopStock {
  return withRng(run, r => {
    const cards = HERO_IDS.flatMap(h => rollCards(r, 2, { common: 55, uncommon: 35, rare: 10 }, h));
    const accs: AccId[] = [];
    for (let i = 0; i < 3; i++) { const a = rollAcc({ ...run, acc: [...run.acc, ...accs] }, r); if (a) accs.push(a); }
    const items = r.shuffle([...ITEM_IDS]).slice(0, 3);
    return {
      cards: cards.map(id => { const [a, b] = RARITY_PRICE[CARDS[id].rarity]; return { id, price: r.range(a, b), sold: false }; }),
      accs: accs.map(id => ({ id, price: ACCESSORIES[id].price + r.range(-10, 10), sold: false })),
      items: items.map(id => ({ id, price: ITEMS[id].price + r.range(-5, 5), sold: false })),
      removeUsed: false,
    };
  });
}

export function restHeal(run: Run): void {
  for (const h of run.heroes) h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3));
}

export function treasure(run: Run): { gold: number; acc: AccId | null } {
  return withRng(run, r => ({ gold: r.range(25, 45), acc: rollAcc(run, r) }));
}

export function healHero(run: Run, id: HeroId, amount: number) {
  const h = run.heroes.find(h => h.id === id)!;
  h.hp = Math.min(h.maxHp, h.hp + amount);
}

export function damageHero(run: Run, id: HeroId, amount: number) {
  const h = run.heroes.find(h => h.id === id)!;
  h.hp = Math.max(1, h.hp - amount);
}

// ───────────────────────── events ─────────────────────────
export type EventFollowUp = { kind: 'upgrade' | 'remove' } | { kind: 'cards'; cards: string[] } | { kind: 'acc'; acc: AccId } | { kind: 'levels'; ups: number };

export interface EventOption { label: string; desc: string; disabled?: string; go: (run: Run) => { text: string; follow?: EventFollowUp } }
export interface EventDef { id: string; title: string; sprite: 'crystal' | 'book' | 'traveler' | 'dummy' | 'merchant' | 'fountain'; text: string; options: (run: Run) => EventOption[] }

const leave: EventOption = { label: 'Leave', desc: 'Continue on your way.', go: () => ({ text: 'You press onward, deeper into the spire.' }) };

export const EVENTS: EventDef[] = [
  { id: 'shrine', title: 'The Crystal Shrine', sprite: 'crystal',
    text: 'A pillar of living crystal hums in the dark. Its light feels warm on your skin, yet something within it watches.',
    options: () => [
      { label: 'Pray', desc: 'All heroes heal 25% of max HP.', go: run => { run.heroes.forEach(h => healHero(run, h.id, Math.round(h.maxHp * 0.25))); return { text: 'A gentle radiance washes over the party. Wounds close; spirits lift.' }; } },
      { label: 'Attune', desc: 'Gain a random Accessory. All heroes lose 6 HP.', go: run => {
        run.heroes.forEach(h => damageHero(run, h.id, 6));
        const acc = withRng(run, r => rollAcc(run, r));
        if (!acc) return { text: 'The crystal flares and dims. Nothing remains to give.' };
        addAcc(run, acc);
        return { text: 'Shards bite into your palms as the crystal yields a gift.', follow: { kind: 'acc', acc } };
      } },
      leave,
    ] },
  { id: 'library', title: 'The Drowned Library', sprite: 'book',
    text: 'Half-sunken shelves line a flooded hall. A few tomes, sealed in wax, have survived the centuries.',
    options: () => [
      { label: 'Read', desc: 'Choose 1 of 3 powerful cards.', go: run => ({ text: 'Forgotten techniques leap from the page.', follow: { kind: 'cards', cards: withRng(run, r => rollCards(r, 3, { uncommon: 50, rare: 50 })) } }) },
      { label: 'Study', desc: 'Upgrade 2 random cards.', go: run => {
        const picks = withRng(run, r => r.shuffle(upgradable(run)).slice(0, 2));
        picks.forEach(c => upgradeCard(run, c.uid));
        return { text: picks.length ? `Hours of study pay off: ${picks.map(c => CARDS[c.id].name).join(' and ')} upgraded.` : 'There is nothing left for you to learn here.' };
      } },
      leave,
    ] },
  { id: 'traveler', title: 'The Wounded Traveler', sprite: 'traveler',
    text: 'A merchant lies against a broken column, clutching a heavy purse. "Please... the monsters took my escort..."',
    options: run => [
      { label: 'Tend his wounds', desc: 'Seren loses 8 HP. Gain 60 gold and a Potion.', disabled: run.heroes.find(h => h.id === 'wmage')!.hp <= 8 ? 'Seren is too weak' : undefined,
        go: run => { damageHero(run, 'wmage', 8); run.gold += 60; addItem(run, 'potion'); return { text: 'He presses coins into Seren\'s hands. "May the light keep you."' }; } },
      { label: 'Take the purse', desc: 'Gain 110 gold. Add 2 Daze to your deck.', go: run => { run.gold += 110; run.deck.push(newCard(run, 'daze'), newCard(run, 'daze')); return { text: 'His eyes follow you as you walk away. The gold feels heavy.' }; } },
      leave,
    ] },
  { id: 'training', title: 'The Old Training Yard', sprite: 'dummy',
    text: 'Straw dummies still stand in rows, hacked and scorched by knights long dead. A worn plaque reads: "Strength through toil."',
    options: () => [
      { label: 'Spar', desc: 'Aldric loses 10 HP. Gain 40 XP.', go: run => { damageHero(run, 'knight', 10); const ups = gainXp(run, 40); return { text: 'Steel rings until your arms ache. You feel sharper.', follow: ups ? { kind: 'levels', ups } : undefined }; } },
      { label: 'Meditate', desc: 'Gain 20 XP.', go: run => { const ups = gainXp(run, 20); return { text: 'In the stillness, the party reflects on the road so far.', follow: ups ? { kind: 'levels', ups } : undefined }; } },
      leave,
    ] },
  { id: 'merchant', title: 'Pom the Wanderer', sprite: 'merchant',
    text: 'A tiny, fluffy merchant with an enormous pack bows theatrically. "Kupo—er, greetings! Pom trades in lighter burdens!"',
    options: run => [
      { label: 'Lighten your load', desc: 'Remove a card from your deck for free.', go: () => ({ text: '"A wise traveler carries only what matters!"', follow: { kind: 'remove' } }) },
      { label: 'Mystery bundle (50g)', desc: 'Gain a random Item and a 30% chance at an Accessory.', disabled: run.gold < 50 ? 'Not enough gold' : run.items.every(i => i) ? 'Item pouch is full' : undefined,
        go: run => {
          run.gold -= 50;
          const { item, acc } = withRng(run, r => ({ item: r.pick(ITEM_IDS), acc: r.chance(0.3) ? rollAcc(run, r) : null }));
          addItem(run, item);
          if (acc) { addAcc(run, acc); return { text: `Inside: a ${ITEMS[item].name}... and something shiny!`, follow: { kind: 'acc', acc } }; }
          return { text: `Inside: a ${ITEMS[item].name}. "Pleasure doing business!"` };
        } },
      leave,
    ] },
  { id: 'fountain', title: 'Fountain of Aether', sprite: 'fountain',
    text: 'Pale blue water spills from a cracked basin, glowing faintly. The air tastes of lightning.',
    options: run => [
      { label: 'Drink', desc: 'Upgrade a card.', go: () => ({ text: 'Power courses through your veins.', follow: { kind: 'upgrade' } }) },
      { label: 'Bottle it', desc: 'Gain an Ether.', disabled: run.items.every(i => i) ? 'Item pouch is full' : undefined, go: run => { addItem(run, 'ether'); return { text: 'You carefully seal the shimmering water in a flask.' }; } },
      leave,
    ] },
];

export function pickEvent(run: Run): EventDef {
  const unseen = EVENTS.filter(e => !run.seenEvents.includes(e.id));
  const ev = withRng(run, r => r.pick(unseen.length ? unseen : EVENTS));
  run.seenEvents.push(ev.id);
  return ev;
}

// ───────────────────────── persistence ─────────────────────────
export function save(run: Run) { localStorage.setItem(SAVE_KEY, JSON.stringify(run)); }
export function load(): Run | null {
  try { const r = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); return r?.v === 1 ? r : null; } catch { return null; }
}
export function clearSave() { localStorage.removeItem(SAVE_KEY); }
