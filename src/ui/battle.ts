import { elementIconUrl, intentIconUrl, portraitUrl, uiIconUrl } from '../art';
import { Battle, type EnemyF, type Ev, type HeroF } from '../game/battle';
import { cardCost, cardDef } from '../game/cards';
import { HEROES } from '../game/heroes';
import { ITEMS } from '../game/loot';
import { afterBattle, battleInit, encounter, theme, type NodeType, type Run } from '../game/run';
import type { CardInst, Element, HeroId, Intent, StatusId } from '../game/types';
import type { Sfx } from '../audio/api';
import { app, banner, btn, mount, toast } from './app';
import { cardEl, refreshCardText } from './card';
import { ELEMENT_NAMES, STATUS_INFO, h, img, statusChip, wait } from './dom';
import { topBar } from './hud';
import { deckView } from './screens';

const CARD_W = 200, CARD_H = 280;
const HAND_Y = 1080 - 150; // card centre at rest
const PLAY_LINE = 740; // releasing above this plays an untargeted card
const EL_SFX: Record<Element, Sfx> = { phys: 'slash', fire: 'fire', ice: 'ice', thunder: 'thunder', holy: 'holy', dark: 'dark' };

type Aim = { kind: 'card'; uid: string; sticky: boolean } | { kind: 'item'; slot: number };

export async function battleScreen(run: Run, type: NodeType): Promise<boolean> {
  const enc = encounter(run, type);
  const b = new Battle(battleInit(run, enc));
  const { stage, audio } = app;
  stage.setMode('battle', type === 'boss' ? 'boss' : theme(run));
  stage.setUnits([
    ...b.heroes.map(h => ({ id: h.id, sprite: h.id, side: 'hero' as const })),
    ...b.enemies.map(e => ({ id: e.id, sprite: e.sprite, side: 'enemy' as const })),
  ]);
  audio.music(type === 'boss' ? 'boss' : type === 'elite' ? 'elite' : 'battle');

  // ───────────── DOM skeleton ─────────────
  const units = h('div.units');
  const hand = h('div.hand');
  const arrow = svgArrow();
  const energyOrb = h('div.energy', { 'data-tip': '<b>Energy</b><br>Spent to play cards. Refills each turn.' }, h('div.energy-ring'), h('span.energy-num'));
  const limitFill = h('div.limit-fill');
  const limitBtn = btn('LIMIT BREAK', () => doLimit(), 'limit-btn');
  const limitBox = h('div.limit', { 'data-tip': '<b>Limit Gauge</b><br>Fills as your party deals and takes damage. When full, unleash every living hero\'s Limit card. Persists between battles.' },
    h('div.limit-label', 'LIMIT'), h('div.limit-bar', limitFill, h('div.limit-shine')), h('span.limit-num'), limitBtn);
  const drawPile = h('div.pile.draw-pile', { 'data-tip': '<b>Draw Pile</b><br>Click to view.' }, img(uiIconUrl('deck')), h('span'));
  const discardPile = h('div.pile.discard-pile', { 'data-tip': '<b>Discard Pile</b><br>Click to view.' }, img(uiIconUrl('discard')), h('span'));
  const exhaustPile = h('div.pile.exhaust-pile', { 'data-tip': '<b>Exhausted</b><br>Removed for this battle.' }, img(uiIconUrl('exhaust')), h('span'));
  drawPile.addEventListener('click', () => deckView([...b.drawPile].sort((x, y) => x.id.localeCompare(y.id)), 'Draw Pile (random order)'));
  discardPile.addEventListener('click', () => deckView(b.discard, 'Discard Pile'));
  exhaustPile.addEventListener('click', () => deckView(b.exhaust, 'Exhausted'));
  const endBtn = btn(h('span', 'End Turn'), () => endTurn(), 'end-turn');
  const moveBanner = h('div.move-banner');
  const topbarSlot = h('div');
  const root = mount(h('div.battle', topbarSlot, units, moveBanner, h('div.bottom-shade'), hand, energyOrb, limitBox, drawPile, discardPile, exhaustPile, endBtn, arrow.svg));

  let busy = true;
  let finish: (won: boolean) => void = () => {};
  let aim: Aim | null = null;
  let hoverTarget: string | null = null;
  let hovered: string | null = null;
  const cardEls = new Map<string, HTMLElement>();
  const hud = new Map<string, UnitHud>();

  const renderTop = () => topbarSlot.replaceChildren(topBar(run, { items: b.items, onItem: slot => onItem(slot) }));
  renderTop();

  // ───────────── unit HUDs ─────────────
  for (const u of [...b.heroes, ...b.enemies]) {
    const uh = makeHud(u);
    hud.set(u.id, uh);
    units.append(uh.el);
  }
  syncAll();
  let alive = true;
  const track = () => {
    if (!alive || !root.isConnected) return;
    for (const [id, uh] of hud) {
      const head = stage.screenPos(id, 'head'), feet = stage.screenPos(id, 'feet');
      const x = feet.x * 1920, top = head.y * 1080, bottom = feet.y * 1080;
      uh.el.style.transform = `translate(${x}px, ${bottom}px)`;
      uh.hit.style.height = Math.max(60, bottom - top) + 'px';
      uh.hit.style.width = Math.max(110, (bottom - top) * 0.7) + 'px';
      uh.intentBox && (uh.intentBox.style.bottom = Math.max(60, bottom - top) + 12 + 'px');
    }
    requestAnimationFrame(track);
  };
  track();


  // ───────────── HUD construction/sync ─────────────
  interface UnitHud { el: HTMLElement; hit: HTMLElement; hp: HTMLElement; lag: HTMLElement; hpText: HTMLElement; block: HTMLElement; statuses: HTMLElement; shield?: HTMLElement; weak?: HTMLElement; intentBox?: HTMLElement; shown: { hp: number; block: number } }

  function makeHud(u: HeroF | EnemyF): UnitHud {
    const isEnemy = u.side === 'enemy';
    const hp = h('div.hp-fill'), lag = h('div.hp-lag'), hpText = h('span.hp-text');
    const block = h('div.block-badge', { 'data-tip': '<b>Block</b><br>Prevents damage until the start of the next turn.' }, img(uiIconUrl('shield')), h('span'));
    const statuses = h('div.statuses');
    const hit = h('div.hit', { 'data-unit': u.id });
    const plate = h('div.plate',
      h('div.plate-name', isEnemy ? u.name : `${u.name}`, !isEnemy ? h('span.plate-job', HEROES[u.id as HeroId].job) : null),
      h('div.hp-bar', lag, hp, hpText, block),
      statuses);
    const uh: UnitHud = { el: h('div.unit.' + u.side, { 'data-id': u.id }, hit, plate), hit, hp, lag, hpText, block, statuses, shown: { hp: u.hp, block: u.block } };
    if (isEnemy) {
      uh.shield = h('div.shield-badge', { 'data-tip': '<b>Shield</b><br>Hit this enemy\'s weaknesses to reduce its Shield. At 0 it is <b>Broken</b>: it loses its next action and takes 50% more damage.' }, h('span'));
      uh.weak = h('div.weak-row');
      plate.insertBefore(h('div.break-row', uh.shield, uh.weak), statuses);
      uh.intentBox = h('div.intent');
      uh.el.append(uh.intentBox);
    }
    hit.addEventListener('pointerenter', () => { hovered = u.id; onHoverUnit(); });
    hit.addEventListener('pointerleave', () => { if (hovered === u.id) hovered = null; onHoverUnit(); });
    hit.addEventListener('click', () => { if (aim) tryRelease(); });
    return uh;
  }

  function setHp(id: string, hpv: number) {
    const u = b.unit(id)!, uh = hud.get(id)!;
    const pct = Math.max(0, hpv / u.maxHp) * 100;
    uh.hp.style.width = pct + '%';
    if (hpv < uh.shown.hp) setTimeout(() => (uh.lag.style.width = pct + '%'), 350);
    else uh.lag.style.width = pct + '%';
    uh.hpText.textContent = `${Math.max(0, hpv)} / ${u.maxHp}`;
    uh.el.classList.toggle('low', pct < 30);
    uh.shown.hp = hpv;
  }

  function setBlock(id: string, v: number) {
    const uh = hud.get(id)!;
    uh.block.classList.toggle('show', v > 0);
    uh.block.querySelector('span')!.textContent = String(v);
    uh.el.classList.toggle('has-block', v > 0);
    uh.shown.block = v;
  }

  function setStatuses(id: string) {
    const u = b.unit(id)!;
    hud.get(id)!.statuses.replaceChildren(...(Object.entries(u.st) as [StatusId, number][]).map(([s, n]) => statusChip(s, n)));
  }

  function setBreak(e: EnemyF) {
    const uh = hud.get(e.id)!;
    uh.shield!.querySelector('span')!.textContent = e.broken ? '' : String(e.shield);
    uh.shield!.classList.toggle('broken', e.broken);
    uh.el.classList.toggle('is-broken', e.broken);
    uh.weak!.replaceChildren(...e.weak.map(el => e.known.includes(el)
      ? h('div.weak-slot.known', { 'data-tip': `<b>Weak to ${ELEMENT_NAMES[el]}</b>` }, img(elementIconUrl(el)))
      : h('div.weak-slot', { 'data-tip': '<b>Unknown weakness</b><br>Hit it with different elements, or use Scan.' }, '?')));
  }

  function setIntent(e: EnemyF) {
    const uh = hud.get(e.id)!;
    if (e.dead) { uh.intentBox!.replaceChildren(); return; }
    const it = b.intent(e);
    uh.intentBox!.className = 'intent intent-' + it.kind;
    uh.intentBox!.dataset.tip = intentTip(e, it);
    uh.intentBox!.replaceChildren(h('div.intent-inner',
      img(intentIconUrl(it.kind)),
      it.dmg !== undefined ? h('span.intent-dmg', it.hits && it.hits > 1 ? `${it.dmg}×${it.hits}` : String(it.dmg)) : null,
      it.target ? h('div.intent-target', img(portraitUrl(it.target))) : null,
    ));
  }

  function intentTip(e: EnemyF, it: Intent): string {
    if (it.kind === 'stunned') return `<b>${e.name} is Broken!</b><br>It will lose its next action and takes 50% more damage.`;
    const m = b.moveOf(e);
    const parts: string[] = [];
    if (it.dmg !== undefined) {
      const who = m.target === 'all' ? 'ALL heroes' : m.target === 'each' ? 'random heroes' : it.target ? HEROES[it.target].name : 'a hero';
      parts.push(`Attacks ${who} for <b>${it.dmg}</b>${it.hits && it.hits > 1 ? ` × ${it.hits}` : ''}.`);
    }
    if (m.block) parts.push(`Gains ${m.block} Block.`);
    if (m.self) parts.push(`Gains ${m.self.map(([s, n]) => `${n} ${STATUS_INFO[s].name}`).join(', ')}.`);
    if (m.foe) parts.push(`Inflicts ${m.foe.map(([s, n]) => `${n} ${STATUS_INFO[s].name}`).join(', ')}.`);
    if (m.addCards) parts.push(`Shuffles ${m.addCards[1]} ${m.addCards[0] === 'daze' ? 'Daze' : m.addCards[0]} into your discard pile.`);
    return `<b>${it.label}</b><br>${parts.join('<br>')}`;
  }

  function syncAll() {
    for (const u of [...b.heroes, ...b.enemies]) {
      setHp(u.id, u.hp);
      setBlock(u.id, u.block);
      setStatuses(u.id);
      hud.get(u.id)!.el.classList.toggle('ko', u.side === 'hero' ? u.hp <= 0 : (u as EnemyF).dead);
      if (u.side === 'enemy') { setBreak(u as EnemyF); setIntent(u as EnemyF); }
    }
    setEnergy(b.energy);
    setLimit(b.limit);
    drawPile.querySelector('span')!.textContent = String(b.drawPile.length);
    discardPile.querySelector('span')!.textContent = String(b.discard.length);
    exhaustPile.querySelector('span')!.textContent = String(b.exhaust.length);
    exhaustPile.classList.toggle('empty', !b.exhaust.length);
    endBtn.classList.toggle('disabled', busy);
    refreshPlayable();
  }

  function setEnergy(v: number) {
    energyOrb.querySelector('.energy-num')!.textContent = `${v}/${b.maxEnergy}`;
    energyOrb.classList.toggle('empty', v === 0);
  }

  function setLimit(v: number) {
    limitFill.style.width = v + '%';
    limitBox.querySelector('.limit-num')!.textContent = `${Math.floor(v)}%`;
    limitBox.classList.toggle('full', v >= 100);
  }

  // ───────────── hand ─────────────
  function renderHand() {
    const present = new Set(b.hand.map(c => c.uid));
    for (const [uid, el] of cardEls) if (!present.has(uid)) { el.remove(); cardEls.delete(uid); }
    for (const c of b.hand) {
      if (cardEls.has(c.uid)) continue;
      const el = cardEl(c, b);
      el.style.transform = `translate(${160 - CARD_W / 2}px, ${1040 - CARD_H / 2}px) scale(0.3) rotate(-30deg)`;
      el.style.opacity = '0';
      el.addEventListener('pointerenter', () => { if (!aim) { hoverCard = c.uid; layout(); audio.sfx('hover'); } });
      el.addEventListener('pointerleave', () => { if (hoverCard === c.uid) { hoverCard = null; layout(); } });
      el.addEventListener('pointerdown', ev => onCardDown(ev, c));
      hand.append(el);
      cardEls.set(c.uid, el);
    }
    requestAnimationFrame(() => layout());
    refreshPlayable();
  }

  let hoverCard: string | null = null;
  function layout() {
    const n = b.hand.length;
    const spacing = Math.min(170, 980 / Math.max(1, n));
    const hi = b.hand.findIndex(c => c.uid === hoverCard);
    b.hand.forEach((c, i) => {
      const el = cardEls.get(c.uid);
      if (!el || (aim?.kind === 'card' && aim.uid === c.uid)) return;
      const off = i - (n - 1) / 2;
      let x = 960 + off * spacing;
      if (hi >= 0 && i !== hi) x += (i < hi ? -1 : 1) * 60;
      let y = HAND_Y + Math.abs(off) ** 2 * 5;
      let rot = off * 3.5, scale = 1;
      if (i === hi) { y = 1080 - CARD_H * 0.66; rot = 0; scale = 1.28; }
      el.style.transform = `translate(${x - CARD_W / 2}px, ${y - CARD_H / 2}px) rotate(${rot}deg) scale(${scale})`;
      el.style.zIndex = String(i === hi ? 100 : 10 + i);
      el.style.opacity = '1';
    });
  }

  function refreshPlayable() {
    for (const c of b.hand) {
      const el = cardEls.get(c.uid);
      if (!el) continue;
      const ok = !busy && b.canPlay(c).ok;
      el.classList.toggle('playable', ok);
      el.classList.toggle('dead-owner', !!cardDef(c.id).hero && b.hero(cardDef(c.id).hero!).hp <= 0);
      el.querySelector('.card-cost')?.classList.toggle('short', cardCost(c) > b.energy);
    }
  }

  // ───────────── input ─────────────
  let down: { uid: string; x: number; y: number; moved: boolean } | null = null;
  let pointer = { x: 960, y: 540 };

  function onCardDown(ev: PointerEvent, c: CardInst) {
    if (ev.button !== 0) return;
    if (aim) { tryRelease(); return; }
    if (busy) return;
    const check = b.canPlay(c);
    if (!check.ok) {
      audio.sfx('error');
      const el = cardEls.get(c.uid)!;
      el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
      toast(check.reason!);
      return;
    }
    const [x, y] = app.toVirtual(ev.clientX, ev.clientY);
    down = { uid: c.uid, x, y, moved: false };
    startAim(c.uid, false);
  }

  function startAim(uid: string, sticky: boolean) {
    aim = { kind: 'card', uid, sticky };
    hoverCard = null;
    const el = cardEls.get(uid)!;
    el.classList.add('aiming');
    el.style.zIndex = '200';
    audio.sfx('select');
    layout();
    updateAim();
  }

  function needsTarget(): 'enemy' | 'ally' | 'deadAlly' | null {
    if (!aim) return null;
    if (aim.kind === 'item') { const t = ITEMS[b.items[aim.slot]!].target; return t === 'ally' || t === 'deadAlly' ? t : null; }
    const t = cardDef(b.hand.find(c => c.uid === (aim as { uid: string }).uid)!.id).target;
    return t === 'enemy' || t === 'ally' || t === 'deadAlly' ? t : null;
  }

  function validHover(): string | null {
    if (!aim || !hovered) return null;
    const subject = aim.kind === 'item' ? b.items[aim.slot]! : b.hand.find(c => c.uid === (aim as { uid: string }).uid)!;
    return b.validTarget(subject, hovered) ? hovered : null;
  }

  function updateAim() {
    if (!aim) return;
    const tgt = needsTarget();
    const aimCard = aim.kind === 'card' ? b.hand.find(c => c.uid === (aim as { uid: string }).uid) : undefined;
    root.classList.toggle('aim-enemy', tgt === 'enemy');
    root.classList.toggle('aim-ally', tgt === 'ally' || tgt === 'deadAlly');
    if (aimCard && !tgt) {
      const el = cardEls.get(aimCard.uid)!;
      el.style.transform = `translate(${pointer.x - CARD_W / 2}px, ${pointer.y - CARD_H / 2}px) scale(1.1)`;
      el.classList.toggle('will-play', pointer.y < PLAY_LINE);
      root.classList.toggle('aim-all', pointer.y < PLAY_LINE && cardDef(aimCard.id).target === 'allEnemies');
      arrow.hide();
      return;
    }
    let from = { x: 960, y: 800 };
    if (aimCard) {
      const el = cardEls.get(aimCard.uid)!;
      el.style.transform = `translate(${960 - CARD_W / 2}px, ${820 - CARD_H / 2}px) scale(1.15)`;
      from = { x: 960, y: 700 };
    } else if (aim.kind === 'item') {
      const slot = root.querySelectorAll('.tb-item')[aim.slot] as HTMLElement | undefined;
      if (slot) { const r = slot.getBoundingClientRect(); const [x, y] = app.toVirtual(r.left + r.width / 2, r.bottom); from = { x, y }; }
    }
    const v = validHover();
    if (v !== hoverTarget) {
      hoverTarget = v;
      stage.setTargeted(v);
      if (aimCard) refreshCardText(cardEls.get(aimCard.uid)!, aimCard, b, v ? (b.unit(v) as EnemyF).side === 'enemy' ? (b.unit(v) as EnemyF) : undefined : undefined);
      if (v) audio.sfx('hover');
    }
    arrow.draw(from, pointer, !!v);
  }

  function onHoverUnit() { if (aim) updateAim(); }

  function onMove(ev: PointerEvent) {
    const [x, y] = app.toVirtual(ev.clientX, ev.clientY);
    pointer = { x, y };
    if (down && Math.hypot(x - down.x, y - down.y) > 12) down.moved = true;
    if (aim) {
      // pointer-events are off on the aiming card, so find the unit under the pointer ourselves
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const unit = el?.closest?.('.hit') as HTMLElement | null;
      hovered = unit?.dataset.unit ?? null;
      updateAim();
    }
  }

  function onUp() {
    if (!down || !aim || aim.kind !== 'card') { down = null; return; }
    const wasClick = !down.moved;
    down = null;
    if (wasClick) { aim.sticky = true; return; } // click-to-select: wait for a second click
    tryRelease();
  }

  function onContext(ev: Event) { if (aim) { ev.preventDefault(); cancelAim(); } }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') return cancelAim();
    if (busy) return;
    if (ev.key === 'e' || ev.key === 'E') return endTurn();
    const n = ev.key === '0' ? 10 : parseInt(ev.key, 10);
    if (n >= 1 && n <= b.hand.length) {
      const c = b.hand[n - 1];
      if (aim) cancelAim();
      if (!b.canPlay(c).ok) { audio.sfx('error'); toast(b.canPlay(c).reason!); return; }
      startAim(c.uid, true);
    }
  }

  function cancelAim() {
    if (!aim) return;
    if (aim.kind === 'card') cardEls.get(aim.uid)?.classList.remove('aiming', 'will-play');
    aim = null;
    hoverTarget = null;
    stage.setTargeted(null);
    arrow.hide();
    root.classList.remove('aim-enemy', 'aim-ally', 'aim-all');
    for (const c of b.hand) { const el = cardEls.get(c.uid); if (el) refreshCardText(el, c, b); }
    layout();
  }

  function tryRelease() {
    if (!aim) return;
    const tgt = needsTarget();
    if (tgt) {
      const v = validHover();
      if (!v) { if (aim.kind === 'item' || !(aim as { sticky: boolean }).sticky || pointer.y > 760) cancelAim(); return; }
      if (aim.kind === 'item') return useItem(aim.slot, v);
      return playCard(aim.uid, v);
    }
    if (aim.kind === 'card') {
      if (pointer.y < PLAY_LINE) return playCard(aim.uid);
      cancelAim();
    }
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('contextmenu', onContext);
  document.addEventListener('keydown', onKey);
  root.addEventListener('pointerdown', ev => {
    if (!aim || ev.button !== 0) return;
    if ((ev.target as HTMLElement).closest('.card, .hit, .tb-item')) return;
    if (aim.kind === 'card' && aim.sticky) tryRelease();
    else if (aim.kind === 'item') cancelAim();
  });

  // ───────────── actions ─────────────
  async function playCard(uid: string, target?: string) {
    const c = b.hand.find(x => x.uid === uid)!;
    const el = cardEls.get(uid)!;
    aim = null;
    stage.setTargeted(null);
    arrow.hide();
    root.classList.remove('aim-enemy', 'aim-ally', 'aim-all');
    busy = true;
    refreshPlayable();
    const evs = b.play(uid, target);
    if (!evs.length) { busy = false; el.classList.remove('aiming'); layout(); return; }
    cardEls.delete(uid);
    el.classList.remove('aiming', 'will-play');
    el.classList.add('played');
    audio.sfx('cardPlay');
    el.style.transform = `translate(${960 - CARD_W / 2}px, ${440 - CARD_H / 2}px) scale(0.85)`;
    setTimeout(() => el.remove(), 450);
    hoverCard = null;
    layout();
    void c;
    await playback(evs);
    afterAction();
  }

  function onItem(slot: number) {
    if (busy) return;
    const id = b.items[slot];
    if (!id) return;
    if (aim) cancelAim();
    const t = ITEMS[id].target;
    if (t === 'deadAlly' && !b.heroes.some(h => h.hp <= 0)) { audio.sfx('error'); toast('No KO\'d hero'); return; }
    if (t === 'ally' || t === 'deadAlly') { aim = { kind: 'item', slot }; audio.sfx('select'); updateAim(); return; }
    useItem(slot);
  }

  async function useItem(slot: number, target?: string) {
    aim = null;
    stage.setTargeted(null);
    arrow.hide();
    root.classList.remove('aim-enemy', 'aim-ally');
    busy = true;
    const evs = b.useItem(slot, target);
    renderTop();
    await playback(evs);
    afterAction();
  }

  async function doLimit() {
    if (busy || b.limit < 100) return;
    busy = true;
    await playback(b.useLimit());
    run.stats.limits++;
    afterAction();
  }

  async function endTurn() {
    if (busy || b.over) return;
    if (aim) cancelAim();
    busy = true;
    audio.sfx('endTurn');
    endBtn.classList.add('disabled');
    // sweep the hand into the discard pile
    for (const [uid, el] of cardEls) {
      el.classList.add('discarding');
      el.style.transform = `translate(${1800 - CARD_W / 2}px, ${1030 - CARD_H / 2}px) scale(0.2) rotate(40deg)`;
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
      cardEls.delete(uid);
    }
    await wait(250);
    await playback(b.endTurn());
    afterAction();
  }

  function afterAction() {
    renderTop();
    syncAll();
    renderHand();
    if (b.over) return end();
    busy = false;
    syncAll();
  }

  async function end() {
    busy = true;
    for (const el of cardEls.values()) { el.style.opacity = '0'; }
    const won = b.over === 'win';
    await wait(400);
    if (won) {
      audio.music('none');
      audio.sfx('victory');
      await banner('Victory', 'victory', 2200);
    } else {
      audio.music('none');
      audio.sfx('defeat');
      await banner('Defeat', 'defeat', 2600);
    }
    afterBattle(run, b);
    finish(won);
  }

  // ───────────── event playback ─────────────
  async function playback(evs: Ev[]) {
    for (const ev of evs) await step(ev);
    syncAll();
  }

  async function step(ev: Ev): Promise<void> {
    switch (ev.t) {
      case 'turn':
        if (ev.side === 'enemy') { audio.sfx('enemyTurn'); await banner('Enemy Turn', 'enemy', 650); }
        else if (ev.turn > 1) { audio.sfx('playerTurn'); await banner(`Turn ${ev.turn}`, 'player', 550); }
        return;
      case 'play': case 'item': return;
      case 'move': {
        stage.setActive(ev.id);
        moveBanner.textContent = ev.name;
        moveBanner.classList.remove('show'); void moveBanner.offsetWidth; moveBanner.classList.add('show');
        await wait(420);
        return;
      }
      case 'attack':
        audio.sfx('slash');
        await stage.attack(ev.from, ev.to);
        return;
      case 'cast': {
        const s: Sfx = ev.kind === 'heal' ? 'heal' : ev.kind === 'shield' ? 'block' : ev.kind === 'buff' ? 'buff' : ev.kind === 'debuff' ? 'debuff' : EL_SFX[ev.kind];
        audio.sfx(s);
        await stage.cast(ev.from, ev.to, ev.kind);
        return;
      }
      case 'dmg': {
        const isHero = !ev.id.startsWith('e');
        stage.hit(ev.id, ev.el, ev.big);
        audio.sfx(ev.big ? 'bigHit' : 'hit');
        if (ev.amount > 0 || !ev.blocked) popup(ev.id, String(ev.amount), 'dmg' + (isHero ? '.hurt' : '') + (ev.big ? '.big' : '') + (ev.weakHit ? '.weakhit' : ''), ev.weakHit ? elementIconUrl(ev.el) : undefined);
        if (ev.blocked) popup(ev.id, `${ev.blocked} Blocked`, 'blocked');
        if (ev.weakHit) popup(ev.id, 'WEAK!', 'weak-tag');
        setHp(ev.id, ev.hp);
        setBlock(ev.id, ev.block);
        if (isHero && ev.amount > 0) stage.shake(ev.big ? 0.6 : 0.25);
        await wait(ev.big ? 200 : 130);
        return;
      }
      case 'hpLoss':
        popup(ev.id, String(ev.amount), 'dmg.burn');
        stage.hit(ev.id, 'fire', false);
        audio.sfx('fire');
        setHp(ev.id, ev.hp);
        await wait(300);
        return;
      case 'shield': {
        const e = b.unit(ev.id) as EnemyF;
        const uh = hud.get(ev.id)!;
        uh.shield!.querySelector('span')!.textContent = String(ev.shield);
        uh.shield!.classList.remove('chip'); void uh.shield!.offsetWidth; uh.shield!.classList.add('chip');
        void e;
        return;
      }
      case 'reveal': {
        const e = b.unit(ev.id) as EnemyF;
        setBreak(e);
        const slot = [...hud.get(ev.id)!.weak!.children][e.weak.indexOf(ev.el)];
        slot?.classList.add('revealed');
        audio.sfx('select');
        return;
      }
      case 'break': {
        stage.shatter(ev.id);
        stage.setBroken(ev.id, true);
        stage.flash('#bfe8ff');
        audio.sfx('break');
        const e = b.unit(ev.id) as EnemyF;
        setBreak({ ...e, broken: true });
        popup(ev.id, 'BREAK!', 'break-tag');
        await wait(650);
        return;
      }
      case 'recover': {
        stage.setBroken(ev.id, false);
        const e = b.unit(ev.id) as EnemyF;
        setBreak(e);
        popup(ev.id, 'Recovered', 'status-tag');
        await wait(250);
        return;
      }
      case 'phase':
        stage.flash('#e0b0ff');
        stage.shake(1);
        audio.sfx('limit');
        await banner(ev.name, 'boss', 1300);
        syncAll();
        return;
      case 'block':
        setBlock(ev.id, ev.block);
        if (ev.amount > 0) { stage.block(ev.id); audio.sfx('block'); popup(ev.id, `+${ev.amount}`, 'blockpop'); await wait(120); }
        return;
      case 'heal':
        setHp(ev.id, ev.hp);
        stage.heal(ev.id);
        if (ev.amount > 0) popup(ev.id, `+${ev.amount}`, 'healpop');
        await wait(140);
        return;
      case 'status': {
        setStatuses(ev.id);
        if (ev.delta > 0) {
          const info = STATUS_INFO[ev.s];
          popup(ev.id, `${info.name}${ev.s === 'taunt' || ev.s === 'rampart' ? '' : ' ' + ev.delta}`, info.buff ? 'status-tag.buff' : 'status-tag.debuff');
          info.buff ? stage.buff(ev.id) : stage.debuff(ev.id);
          await wait(160);
        }
        return;
      }
      case 'ko': {
        audio.sfx('ko');
        hud.get(ev.id)!.el.classList.add('ko');
        setHp(ev.id, 0);
        setBlock(ev.id, 0);
        setStatuses(ev.id);
        if (ev.id.startsWith('e')) hud.get(ev.id)!.intentBox!.replaceChildren();
        await stage.ko(ev.id);
        refreshPlayable();
        return;
      }
      case 'revive':
        audio.sfx('revive');
        stage.revive(ev.id);
        hud.get(ev.id)!.el.classList.remove('ko');
        setHp(ev.id, ev.hp);
        popup(ev.id, 'Revived', 'healpop');
        await wait(500);
        return;
      case 'text':
        popup(ev.id, ev.text, 'status-tag');
        await wait(400);
        return;
      case 'energy': setEnergy(ev.value); return;
      case 'limit': {
        const was = limitBox.classList.contains('full');
        setLimit(ev.value);
        if (ev.value >= 100 && !was) { audio.sfx('limitReady'); toast('Limit Break ready!'); }
        return;
      }
      case 'limitBreak': {
        audio.sfx('limit');
        banner('Limit Break', 'limit', 1300);
        await stage.limit(ev.heroes[0] ?? 'knight');
        renderHand();
        await wait(300);
        return;
      }
      case 'draw':
        audio.sfx('cardDraw');
        renderHand();
        drawPile.querySelector('span')!.textContent = String(b.drawPile.length);
        await wait(90);
        return;
      case 'shuffle': audio.sfx('shuffle'); return;
      case 'addCard': toast(`${cardDef(ev.id).name} added to your ${ev.pile === 'hand' ? 'hand' : 'discard pile'}`); return;
      case 'end': return;
    }
  }

  function popup(id: string, text: string, cls: string, icon?: string) {
    const pos = stage.screenPos(id, 'head');
    const n = units.querySelectorAll(`.popup[data-for="${id}"]`).length;
    const el = h('div.popup.' + cls, { 'data-for': id, style: `left:${pos.x * 1920 + (n % 3 - 1) * 26}px; top:${pos.y * 1080 - 10 - (n % 4) * 30}px` }, icon ? img(icon) : null, text);
    units.append(el);
    setTimeout(() => el.remove(), 1500);
  }

  // ───────────── intro ─────────────
  const names = [...new Set(b.enemies.map(e => e.name))].join(' & ');
  await wait(500);
  await banner(type === 'boss' ? names : type === 'elite' ? `Elite — ${names}` : names, type === 'boss' ? 'boss' : type === 'elite' ? 'elite' : 'plain', 1100);
  await playback(b.start());
  busy = false;
  syncAll();

  const result = await new Promise<boolean>(resolve => { finish = resolve; });
  alive = false;
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('contextmenu', onContext);
  return result;

}

function svgArrow() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'aim-arrow');
  svg.setAttribute('viewBox', '0 0 1920 1080');
  svg.innerHTML = `<defs><linearGradient id="arrowGrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe7a3" stop-opacity="0.2"/><stop offset="1" stop-color="#fff4d0"/></linearGradient>
    <filter id="arrowGlow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path class="aim-path" fill="none" stroke="url(#arrowGrad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22" filter="url(#arrowGlow)"/>
    <polygon class="aim-head" points="0,-20 16,12 0,4 -16,12" filter="url(#arrowGlow)"/>`;
  const path = svg.querySelector('.aim-path')!, head = svg.querySelector('.aim-head')!;
  return {
    svg: svg as unknown as HTMLElement,
    draw(a: { x: number; y: number }, b: { x: number; y: number }, hot: boolean) {
      const cx = a.x + (b.x - a.x) * 0.1, cy = Math.min(a.y, b.y) - 160;
      path.setAttribute('d', `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`);
      const ang = Math.atan2(b.y - cy, b.x - cx) * 180 / Math.PI + 90;
      head.setAttribute('transform', `translate(${b.x},${b.y}) rotate(${ang})`);
      svg.classList.add('show');
      svg.classList.toggle('hot', hot);
    },
    hide() { svg.classList.remove('show'); },
  };
}

