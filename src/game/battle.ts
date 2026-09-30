// Pure combat engine. Mutates its own state and records an event log that the
// presentation layer plays back (animations, numbers, sounds). No DOM here.
import { cardCost, cardDef, cardExhausts, cardVal, type CardDef } from './cards';
import { ENEMIES, type EnemyDef, type Move } from './enemies';
import { HAND_SIZE, HEROES, MAX_ACTIONS, MAX_HAND } from './heroes';
import { ITEMS, type AccId, type ItemId } from './loot';
import { Rng } from './rng';
import type { CardInst, Element, HeroId, Intent, SpriteId, StatusId, Statuses } from './types';
import type { CastKind } from '../render/api';

export interface Fighter { id: string; name: string; hp: number; maxHp: number; block: number; st: Statuses }
export interface HeroF extends Fighter {
  side: 'hero'; id: HeroId;
  /** Actions held: one more each turn, up to MAX_ACTIONS; unused ones carry over */
  acts: number;
}
export interface EnemyF extends Fighter {
  side: 'enemy';
  def: string;
  sprite: SpriteId;
  shield: number;
  maxShield: number;
  weak: Element[];
  known: Element[];
  broken: boolean;
  /** broken enemies skip one action, then recover at the start of their following turn */
  skipped: boolean;
  move: string;
  target: HeroId | null;
  history: string[];
  phase: number;
  dead: boolean;
}

export type Ev =
  | { t: 'turn'; side: 'player' | 'enemy'; turn: number }
  | { t: 'play'; card: CardInst; owner: HeroId }
  | { t: 'item'; item: ItemId }
  | { t: 'attack'; from: string; to: string | null }
  | { t: 'cast'; from: string; to: string[]; kind: CastKind }
  | { t: 'move'; id: string; name: string }
  | { t: 'dmg'; id: string; amount: number; blocked: number; el: Element; weakHit: boolean; hp: number; block: number; big: boolean }
  | { t: 'hpLoss'; id: string; amount: number; hp: number; cause: StatusId }
  | { t: 'shield'; id: string; shield: number }
  | { t: 'reveal'; id: string; el: Element }
  | { t: 'break'; id: string }
  | { t: 'recover'; id: string; shield: number }
  | { t: 'phase'; id: string; name: string }
  | { t: 'block'; id: string; amount: number; block: number }
  | { t: 'heal'; id: string; amount: number; hp: number }
  | { t: 'status'; id: string; s: StatusId; delta: number; value: number }
  | { t: 'ko'; id: string }
  | { t: 'revive'; id: string; hp: number }
  | { t: 'text'; id: string; text: string }
  | { t: 'actions' }
  | { t: 'shards'; id: string; amount: number }
  | { t: 'draw'; count: number }
  | { t: 'shuffle' }
  | { t: 'addCard'; id: string; pile: 'discard' | 'hand' | 'draw' }
  | { t: 'end'; win: boolean };

export interface PlayCtx { owner: HeroF; target?: HeroF | EnemyF; up: boolean; D: number; B: number; H: number; M: number; card: CardInst }

export interface BattleInit {
  seed: number;
  heroes: { id: HeroId; hp: number; maxHp: number }[];
  deck: CardInst[];
  enemies: string[];
  accessories: AccId[];
  items: (ItemId | null)[];
  hpScale?: number;
  uidStart: number;
}

export interface BattleStats { damage: number; breaks: number; kills: number; cardsPlayed: number; maxHit: number }

const TURN_STATUSES: StatusId[] = ['weak', 'vuln', 'taunt'];
const DEBUFFS: StatusId[] = ['weak', 'vuln', 'burn'];

export class Battle {
  rng: Rng;
  heroes: HeroF[];
  enemies: EnemyF[];
  drawPile: CardInst[];
  hand: CardInst[] = [];
  discard: CardInst[] = [];
  exhaust: CardInst[] = [];
  /** Crystal Shards gathered this battle (every Break pays) */
  shards = 0;
  turn = 0;
  items: (ItemId | null)[];
  acc: Set<AccId>;
  over: null | 'win' | 'lose' = null;
  stats: BattleStats = { damage: 0, breaks: 0, kills: 0, cardsPlayed: 0, maxHit: 0 };
  uid: number;
  phase: 'player' | 'enemy' = 'player';
  private log: Ev[] = [];
  private fresh = new Set<string>();
  private featherUsed = false;
  private dmgScale: number;

  constructor(init: BattleInit) {
    this.rng = new Rng(init.seed);
    this.uid = init.uidStart;
    this.acc = new Set(init.accessories);
    this.items = [...init.items];
    this.heroes = init.heroes.map(h => ({ side: 'hero', id: h.id, name: HEROES[h.id].name, hp: h.hp, maxHp: h.maxHp, block: 0, st: {}, acts: 0 }));
    this.enemies = init.enemies.map((id, i) => this.makeEnemy(ENEMIES[id], i, init.hpScale ?? 1));
    this.dmgScale = init.hpScale ?? 1;
    this.drawPile = this.rng.shuffle(init.deck.map(c => ({ ...c })));
  }

  private makeEnemy(d: EnemyDef, i: number, scale: number): EnemyF {
    const hp = Math.round(this.rng.range(d.hp[0], d.hp[1]) * scale);
    return {
      side: 'enemy', id: `e${i}`, def: d.id, name: d.name, sprite: d.sprite, hp, maxHp: hp, block: 0, st: {},
      shield: d.shield, maxShield: d.shield, weak: [...d.weak], known: [], broken: false, skipped: false,
      move: '', target: null, history: [], phase: 0, dead: false,
    };
  }

  // ───────────────────────── queries ─────────────────────────
  aliveHeroes(): HeroF[] { return this.heroes.filter(h => h.hp > 0); }
  aliveEnemies(): EnemyF[] { return this.enemies.filter(e => !e.dead); }
  unit(id: string): HeroF | EnemyF | undefined { return (this.heroes as (HeroF | EnemyF)[]).concat(this.enemies).find(u => u.id === id); }
  hero(id: HeroId): HeroF { return this.heroes.find(h => h.id === id)!; }
  enemyDef(e: EnemyF): EnemyDef { return ENEMIES[e.def]; }
  moveOf(e: EnemyF): Move { return this.enemyDef(e).moves[e.move]; }

  /** Displayed intent, reflecting strength/weak/vulnerable and taunt redirection. */
  intent(e: EnemyF): Intent {
    if (e.dead || !e.move) return { kind: 'unknown' };
    if (e.broken && !e.skipped) return { kind: 'stunned', label: 'Broken' };
    const m = this.moveOf(e);
    const it: Intent = { kind: m.kind, label: m.name };
    if (m.dmg !== undefined) {
      it.hits = m.hits ?? 1;
      const t = m.target === 'single' || m.target === 'lowest' ? this.resolveTarget(e) : undefined;
      it.target = t?.id;
      it.dmg = this.calcEnemyDmg(e, m.dmg, t);
    }
    return it;
  }

  canPlay(c: CardInst): { ok: boolean; reason?: string } {
    const d = cardDef(c.id);
    if (this.over || this.phase !== 'player') return { ok: false, reason: 'Not your turn' };
    if (d.unplayable) return { ok: false, reason: 'Unplayable' };
    if (d.hero && this.hero(d.hero).hp <= 0) return { ok: false, reason: `${HEROES[d.hero].name} is KO'd` };
    if (d.hero && cardCost(c) > this.hero(d.hero).acts) {
      const h = this.hero(d.hero);
      return { ok: false, reason: h.acts ? `${h.name} needs ${cardCost(c)} Actions` : `${h.name} has no Actions left` };
    }
    if (d.target === 'deadAlly' && !this.heroes.some(h => h.hp <= 0)) return { ok: false, reason: 'No KO\'d ally' };
    return { ok: true };
  }

  validTarget(c: CardInst | ItemId, id: string): boolean {
    const target = typeof c === 'string' ? ITEMS[c].target : cardDef(c.id).target;
    const u = this.unit(id);
    if (!u) return false;
    if (target === 'enemy') return u.side === 'enemy' && !(u as EnemyF).dead;
    if (target === 'ally') return u.side === 'hero' && u.hp > 0;
    if (target === 'deadAlly') return u.side === 'hero' && u.hp <= 0;
    return false;
  }

  /** Damage preview for card text: base + owner's strength, weak/vuln/broken modifiers. */
  previewDamage(owner: HeroId, base: number, target?: EnemyF): number {
    const h = this.hero(owner);
    let d = base + (h.st.str ?? 0);
    if (h.st.weak) d *= 0.75;
    if (target?.st.vuln) d *= 1.5;
    if (target?.broken) d *= 1.5;
    return Math.max(0, Math.floor(d));
  }

  // ───────────────────────── flow ─────────────────────────
  start(): Ev[] {
    if (this.acc.has('powerRing')) this.apply('knight', 'str', 1);
    if (this.acc.has('magusCirclet')) this.apply('bmage', 'str', 1);
    if (this.acc.has('prismLens')) this.enemies.forEach(e => this.reveal(e.id));
    this.enemies.forEach(e => this.planMove(e));
    this.startPlayerTurn();
    return this.flush();
  }

  play(uid: string, targetId?: string): Ev[] {
    const c = this.hand.find(h => h.uid === uid);
    if (!c) return [];
    const d = cardDef(c.id);
    if (!this.canPlay(c).ok) return [];
    const needsTarget = d.target === 'enemy' || d.target === 'ally' || d.target === 'deadAlly';
    if (needsTarget && (!targetId || !this.validTarget(c, targetId))) return [];
    const owner = this.hero(d.hero!);
    const target = targetId ? this.unit(targetId) : undefined;

    const cost = cardCost(c);
    owner.acts -= cost;
    this.hand.splice(this.hand.indexOf(c), 1);
    this.stats.cardsPlayed++;
    this.emit({ t: 'play', card: c, owner: owner.id });
    this.emit({ t: 'actions' });
    this.cardFx(d, owner, target);
    const up = c.upgraded;
    d.play(this, { owner, target, up, card: c, D: cardVal(c, 'D'), B: cardVal(c, 'B'), H: cardVal(c, 'H'), M: cardVal(c, 'M') });
    (cardExhausts(c) ? this.exhaust : this.discard).push(c);
    return this.flush();
  }

  useItem(slot: number, targetId?: string): Ev[] {
    const id = this.items[slot];
    if (!id || this.over || this.phase !== 'player') return [];
    const it = ITEMS[id];
    if ((it.target === 'ally' || it.target === 'deadAlly') && (!targetId || !this.validTarget(id, targetId))) return [];
    this.items[slot] = null;
    this.emit({ t: 'item', item: id });
    const h = targetId ? (this.unit(targetId) as HeroF) : undefined;
    switch (id) {
      case 'potion': this.emit({ t: 'cast', from: h!.id, to: [h!.id], kind: 'heal' }); this.heal(h!.id, 20); break;
      case 'elixir': this.emit({ t: 'cast', from: h!.id, to: [h!.id], kind: 'heal' }); this.heal(h!.id, h!.maxHp); this.cleanse(h!.id); break;
      case 'phoenix': this.revive(h!.id, 0.5); break;
      case 'ether': this.ready(2); break;
      case 'tonic': this.draw(3); break;
      case 'bomb': case 'wind': {
        const el: Element = id === 'bomb' ? 'fire' : 'ice';
        this.emit({ t: 'cast', from: 'knight', to: this.aliveEnemies().map(e => e.id), kind: el });
        for (const e of this.aliveEnemies()) {
          this.hitEnemy(null, e, id === 'bomb' ? 18 : 14, el);
          if (id === 'wind' && !e.dead) this.apply(e.id, 'weak', 1);
        }
        break;
      }
    }
    return this.flush();
  }

  endTurn(): Ev[] {
    if (this.over || this.phase !== 'player') return [];
    for (const h of this.aliveHeroes()) if (h.st.ironwall) this.gainBlock(h.id, h.st.ironwall);
    for (const c of this.hand) (cardDef(c.id).ethereal ? this.exhaust : this.discard).push(c);
    this.hand = [];
    this.enemyPhase();
    if (!this.over) this.startPlayerTurn();
    return this.flush();
  }

  private startPlayerTurn() {
    this.phase = 'player';
    this.turn++;
    this.emit({ t: 'turn', side: 'player', turn: this.turn });
    for (const h of this.aliveHeroes()) {
      h.acts = Math.min(MAX_ACTIONS, h.acts + 1);
    }
    if (this.turn === 1 && this.acc.has('etherStone')) this.ready(1);
    this.emit({ t: 'actions' });
    for (const h of this.aliveHeroes()) {
      if (h.block && !h.st.rampart) { h.block = 0; this.emit({ t: 'block', id: h.id, amount: 0, block: 0 }); }
    }
    for (const h of this.aliveHeroes()) this.tickDots(h);
    if (this.over) return;
    for (const h of this.aliveHeroes()) {
      if (h.st.prayer) { const w = this.mostWounded(); if (w) this.heal(w.id, h.st.prayer); }
      if (h.st.ward) for (const a of this.aliveHeroes()) this.gainBlock(a.id, h.st.ward);
    }
    if (this.acc.has('guardianBangle')) { const w = this.mostWounded(); if (w) this.gainBlock(w.id, 4); }
    this.draw(HAND_SIZE + (this.turn === 1 && this.acc.has('swiftBoots') ? 2 : 0));
  }

  private enemyPhase() {
    this.phase = 'enemy';
    this.emit({ t: 'turn', side: 'enemy', turn: this.turn });
    for (const e of this.enemies) {
      if (e.dead || this.over) continue;
      if (e.block) { e.block = 0; this.emit({ t: 'block', id: e.id, amount: 0, block: 0 }); }
      this.tickDots(e);
      if (e.dead || this.over) continue;
      if (e.broken) {
        if (!e.skipped) {
          e.skipped = true;
          this.emit({ t: 'text', id: e.id, text: 'Stunned' });
          continue; // keeps its planned move for next turn
        }
        e.broken = false;
        e.skipped = false;
        e.shield = e.maxShield;
        this.emit({ t: 'recover', id: e.id, shield: e.shield });
      }
      this.executeMove(e);
      if (this.over) return;
      if (e.st.ritual) this.apply(e.id, 'str', e.st.ritual);
      e.history.push(e.move);
      this.planMove(e);
    }
    // round end: tick down turn-based statuses (except those applied this enemy phase)
    for (const u of [...this.aliveHeroes(), ...this.aliveEnemies()]) {
      for (const s of TURN_STATUSES) {
        if (u.st[s] && !this.fresh.has(`${u.id}:${s}`)) this.setStatus(u, s, u.st[s]! - 1);
      }
    }
    this.fresh.clear();
  }

  private planMove(e: EnemyF) {
    const d = this.enemyDef(e);
    e.move = d.pick(e, this.rng, e.history.length);
    const m = d.moves[e.move];
    const alive = this.aliveHeroes();
    if (m.target === 'lowest') e.target = this.mostWounded(true)?.id ?? null;
    else if (m.target === 'single') e.target = alive.length ? this.rng.pick(alive).id : null;
    else e.target = null;
  }

  /** Where a single-target attack will land: taunting hero > planned target > random living hero. */
  private resolveTarget(e: EnemyF): HeroF | undefined {
    const alive = this.aliveHeroes();
    const taunter = alive.find(h => h.st.taunt);
    if (taunter) return taunter;
    const planned = alive.find(h => h.id === e.target);
    return planned ?? alive[0];
  }

  private executeMove(e: EnemyF) {
    const m = this.moveOf(e);
    this.emit({ t: 'move', id: e.id, name: m.name });
    if (m.dmg !== undefined) {
      const hits = m.hits ?? 1;
      if (m.target === 'all') {
        this.emit(m.fx ? { t: 'cast', from: e.id, to: this.aliveHeroes().map(h => h.id), kind: m.fx } : { t: 'attack', from: e.id, to: null });
        for (let i = 0; i < hits; i++) for (const h of this.aliveHeroes()) this.hitHero(e, h, m.dmg, this.moveElement(m));
        if (m.foe) for (const h of this.aliveHeroes()) for (const [s, n] of m.foe) this.apply(h.id, s, n);
      } else if (m.target === 'each') {
        this.emit(m.fx ? { t: 'cast', from: e.id, to: this.aliveHeroes().map(h => h.id), kind: m.fx } : { t: 'attack', from: e.id, to: null });
        for (let i = 0; i < hits && !this.over && !e.dead; i++) {
          const alive = this.aliveHeroes();
          const taunter = alive.find(h => h.st.taunt);
          this.hitHero(e, taunter ?? this.rng.pick(alive), m.dmg, this.moveElement(m));
        }
      } else {
        const t = this.resolveTarget(e);
        if (!t) return;
        this.emit(m.fx ? { t: 'cast', from: e.id, to: [t.id], kind: m.fx } : { t: 'attack', from: e.id, to: t.id });
        for (let i = 0; i < hits && t.hp > 0 && !e.dead; i++) this.hitHero(e, t, m.dmg, this.moveElement(m));
        if (m.foe && t.hp > 0) for (const [s, n] of m.foe) this.apply(t.id, s, n);
      }
    } else {
      if (m.foe) {
        this.emit({ t: 'cast', from: e.id, to: this.aliveHeroes().map(h => h.id), kind: m.fx ?? 'debuff' });
        for (const h of this.aliveHeroes()) for (const [s, n] of m.foe) this.apply(h.id, s, n);
      } else {
        this.emit({ t: 'cast', from: e.id, to: [e.id], kind: m.block ? 'shield' : 'buff' });
      }
    }
    if (e.dead || this.over) return;
    if (m.block) this.gainBlock(e.id, m.block);
    if (m.self) for (const [s, n] of m.self) this.apply(e.id, s, n);
    if (m.addCards) for (let i = 0; i < m.addCards[1]; i++) this.addCard(m.addCards[0], 'discard');
  }

  private moveElement(m: Move): Element {
    return m.fx === 'fire' || m.fx === 'ice' || m.fx === 'thunder' || m.fx === 'holy' || m.fx === 'dark' ? m.fx : 'phys';
  }

  private cardFx(d: CardDef, owner: HeroF, target?: Fighter) {
    if (d.type === 'attack') {
      const el = d.el ?? 'phys';
      const to = target ? [target.id] : this.aliveEnemies().map(e => e.id);
      if (el === 'phys') this.emit({ t: 'attack', from: owner.id, to: target?.id ?? null });
      else this.emit({ t: 'cast', from: owner.id, to, kind: el });
    } else {
      const to = target ? [target.id] : d.target === 'allAllies' ? this.aliveHeroes().map(h => h.id) : d.target === 'enemy' ? [] : [owner.id];
      this.emit({ t: 'cast', from: owner.id, to, kind: d.fx ?? 'buff' });
    }
  }

  // ───────────────────────── effect API (used by cards) ─────────────────────────
  attack(c: PlayCtx, base: number, el: Element, hits = 1) {
    const e = c.target as EnemyF;
    for (let i = 0; i < hits && !e.dead && !this.over; i++) this.hitEnemy(c.owner, e, base, el);
  }

  attackAll(c: PlayCtx, base: number, el: Element, hits = 1) {
    for (let i = 0; i < hits; i++) for (const e of this.aliveEnemies()) if (!this.over) this.hitEnemy(c.owner, e, base, el);
  }

  attackRandom(c: PlayCtx, base: number, el: Element, hits: number) {
    for (let i = 0; i < hits && !this.over; i++) {
      const alive = this.aliveEnemies();
      if (!alive.length) return;
      this.hitEnemy(c.owner, this.rng.pick(alive), base, el);
    }
  }

  gainBlock(id: string, n: number) {
    const u = this.unit(id);
    if (!u || u.hp <= 0 || n <= 0) return;
    u.block += n;
    this.emit({ t: 'block', id, amount: n, block: u.block });
  }

  heal(id: string, n: number) {
    const u = this.unit(id);
    if (!u || u.hp <= 0) return;
    if (u.side === 'hero' && this.acc.has('chalice')) n += 2;
    const amount = Math.min(n, u.maxHp - u.hp);
    u.hp += amount;
    this.emit({ t: 'heal', id, amount, hp: u.hp });
  }

  apply(id: string, s: StatusId, n: number) {
    const u = this.unit(id);
    if (!u || u.hp <= 0) return;
    if (this.phase === 'enemy' && TURN_STATUSES.includes(s)) this.fresh.add(`${id}:${s}`);
    this.setStatus(u, s, (u.st[s] ?? 0) + n);
  }

  cleanse(id: string) {
    const u = this.unit(id);
    if (!u) return;
    for (const s of DEBUFFS) if (u.st[s]) this.setStatus(u, s, 0);
  }

  reveal(id: string) {
    const e = this.unit(id) as EnemyF;
    for (const el of e.weak) if (!e.known.includes(el)) { e.known.push(el); this.emit({ t: 'reveal', id, el }); }
  }

  /** Give back n Actions: the given hero first, then whoever holds the fewest (never above the cap). */
  ready(n: number, prefer?: HeroId) {
    for (let i = 0; i < n; i++) {
      const room = this.aliveHeroes().filter(x => x.acts < MAX_ACTIONS).sort((a, b) => (a.id === prefer ? -1 : b.id === prefer ? 1 : a.acts - b.acts));
      if (room[0]) room[0].acts++;
    }
    this.emit({ t: 'actions' });
  }

  revive(id: string, frac: number) {
    const h = this.unit(id);
    if (!h || h.side !== 'hero' || h.hp > 0) return;
    h.hp = Math.max(1, Math.round(h.maxHp * frac));
    this.emit({ t: 'revive', id, hp: h.hp });
  }

  draw(n: number) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= MAX_HAND) break;
      if (!this.drawPile.length) {
        if (!this.discard.length) break;
        this.drawPile.push(...this.rng.shuffle(this.discard.splice(0)));
        this.emit({ t: 'shuffle' });
      }
      this.hand.push(this.drawPile.pop()!);
      drawn++;
    }
    if (drawn) this.emit({ t: 'draw', count: drawn });
  }

  addCard(id: string, pile: 'discard' | 'hand' | 'draw', silent = false) {
    const c: CardInst = { uid: `c${this.uid++}`, id, upgraded: false };
    if (pile === 'hand') this.hand.push(c);
    else if (pile === 'draw') this.drawPile.splice(this.rng.int(this.drawPile.length + 1), 0, c);
    else this.discard.push(c);
    if (!silent) this.emit({ t: 'addCard', id, pile });
  }

  phaseShift(e: EnemyF, weak: Element[], shield: number, name: string, nextMove: string) {
    e.weak = weak;
    e.known = this.acc.has('prismLens') ? [...weak] : [];
    e.maxShield = shield;
    e.shield = shield;
    e.broken = false;
    e.skipped = false;
    for (const s of DEBUFFS) if (e.st[s]) this.setStatus(e, s, 0);
    e.move = nextMove;
    e.target = this.mostWounded(true)?.id ?? null;
    this.emit({ t: 'phase', id: e.id, name });
    this.emit({ t: 'recover', id: e.id, shield });
  }

  // ───────────────────────── internals ─────────────────────────
  private calcEnemyDmg(e: EnemyF, base: number, t?: HeroF): number {
    let d = Math.round(base * this.dmgScale) + (e.st.str ?? 0);
    if (e.st.weak) d *= 0.75;
    if (t?.st.vuln) d *= 1.5;
    return Math.max(0, Math.floor(d));
  }

  private hitEnemy(src: HeroF | null, e: EnemyF, base: number, el: Element) {
    if (e.dead || this.over) return;
    const d = src ? this.previewDamage(src.id, base, e) : Math.floor(base * (e.st.vuln ? 1.5 : 1) * (e.broken ? 1.5 : 1));
    const weakHit = e.weak.includes(el);
    let broke = false;
    if (weakHit) {
      if (!e.known.includes(el)) { e.known.push(el); this.emit({ t: 'reveal', id: e.id, el }); }
      if (!e.broken && e.shield > 0) {
        e.shield--;
        this.emit({ t: 'shield', id: e.id, shield: e.shield });
        broke = e.shield === 0;
      }
    }
    const blocked = Math.min(e.block, d);
    e.block -= blocked;
    const lost = Math.min(e.hp, d - blocked);
    e.hp -= lost;
    this.stats.damage += lost;
    this.stats.maxHit = Math.max(this.stats.maxHit, d);
    this.emit({ t: 'dmg', id: e.id, amount: lost, blocked, el, weakHit, hp: e.hp, block: e.block, big: weakHit || e.broken || d >= 15 });
    if (e.hp <= 0) return this.killEnemy(e);
    if (broke) this.breakEnemy(e);
    this.enemyDef(e).onHp?.(this, e);
  }

  private breakEnemy(e: EnemyF) {
    e.broken = true;
    e.skipped = false;
    this.stats.breaks++;
    this.emit({ t: 'break', id: e.id });
    if (this.acc.has('breakerMark')) { this.ready(1); this.draw(1); }
    const paid = this.enemyDef(e).tier === 'normal' ? 8 : 16;
    this.shards += paid;
    this.emit({ t: 'shards', id: e.id, amount: paid });
  }

  private killEnemy(e: EnemyF) {
    e.dead = true;
    e.block = 0;
    this.stats.kills++;
    this.emit({ t: 'ko', id: e.id });
    if (!this.aliveEnemies().length) this.finish(true);
  }

  private hitHero(src: EnemyF, h: HeroF, base: number, el: Element) {
    if (h.hp <= 0 || this.over) return;
    const d = this.calcEnemyDmg(src, base, h);
    const blocked = Math.min(h.block, d);
    h.block -= blocked;
    const lost = Math.min(h.hp, d - blocked);
    h.hp -= lost;
    this.emit({ t: 'dmg', id: h.id, amount: lost, blocked, el, weakHit: false, hp: h.hp, block: h.block, big: lost >= 12 });
    if (h.st.thorns && !src.dead) this.hitEnemy(null, src, h.st.thorns, 'phys');
    if (h.hp <= 0) this.heroDown(h);
  }

  private heroDown(h: HeroF) {
    if (this.acc.has('angelFeather') && !this.featherUsed) {
      this.featherUsed = true;
      h.hp = 1;
      this.emit({ t: 'text', id: h.id, text: 'Angel Feather!' });
      this.emit({ t: 'revive', id: h.id, hp: 1 });
      return;
    }
    h.hp = 0;
    h.block = 0;
    h.st = {};
    this.emit({ t: 'ko', id: h.id });
    if (!this.aliveHeroes().length) this.finish(false);
  }

  private tickDots(u: HeroF | EnemyF) {
    if (u.st.regen) { this.heal(u.id, u.st.regen); this.setStatus(u, 'regen', u.st.regen - 1); }
    if (u.st.burn) {
      const amount = Math.min(u.hp, u.st.burn);
      u.hp -= amount;
      this.emit({ t: 'hpLoss', id: u.id, amount, hp: u.hp, cause: 'burn' });
      this.setStatus(u, 'burn', u.st.burn - 1);
      if (u.side === 'enemy') this.stats.damage += amount;
      if (u.hp <= 0) u.side === 'hero' ? this.heroDown(u) : this.killEnemy(u);
    }
  }

  private setStatus(u: Fighter, s: StatusId, v: number) {
    const prev = u.st[s] ?? 0;
    if (v <= 0) delete u.st[s];
    else u.st[s] = v;
    if (v !== prev) this.emit({ t: 'status', id: u.id, s, delta: v - prev, value: Math.max(0, v) });
  }

  private mostWounded(byHp = false): HeroF | undefined {
    const alive = this.aliveHeroes();
    return alive.sort((a, b) => byHp ? a.hp - b.hp : a.hp / a.maxHp - b.hp / b.maxHp)[0];
  }

  /** end the battle (also used by scripted enemies, e.g. one that stops fighting) */
  finish(win: boolean) {
    this.over = win ? 'win' : 'lose';
    this.emit({ t: 'end', win });
  }

  private emit(e: Ev) { this.log.push(e); }
  private flush(): Ev[] { return this.log.splice(0); }
}
