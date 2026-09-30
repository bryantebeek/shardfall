import { accessoryIconUrl, cardArtUrl, portraitUrl, uiIconUrl } from '../art';
import { canUpgrade, cardDef } from '../game/cards';
import { HEROES, xpToNext } from '../game/heroes';
import { ACCESSORIES, ITEMS, type AccId, type ItemId } from '../game/loot';
import {
  EVENTS, ROWS, addAcc, addItem, battleRewards, gainXp, healHero, levelUpChoices, newCard, nodeById, pickEvent, reachable, removeCard,
  restHeal, shopStock, treasure, upgradeCard, type EventFollowUp, type NodeType, type Run,
} from '../game/run';
import type { CardArt, CardInst, HeroId } from '../game/types';
import { app, banner, btn, modal, mount, toast } from './app';
import { cardEl } from './card';
import { h, img, wait } from './dom';
import { refreshTopBar, topBar } from './hud';

// ───────────────────────── title ─────────────────────────
export function titleScreen(hasSave: boolean): Promise<'new' | 'continue'> {
  app.stage.setMode('title', 'ruins');
  app.audio.music('title');
  return new Promise(resolve => {
    mount(h('div.title-screen',
      h('div.logo',
        h('div.logo-sub-top', 'A Crystal Spire Chronicle'),
        h('h1.logo-text', 'Shardfall'),
        h('div.logo-rule'),
      ),
      h('div.title-menu',
        hasSave ? btn('Continue Journey', () => resolve('continue'), 'title-btn primary') : null,
        btn('New Journey', () => resolve('new'), 'title-btn' + (hasSave ? '' : ' primary')),
        btn('Settings', () => settings(), 'title-btn'),
      ),
      h('div.title-foot', 'Drag cards onto targets · Hit weaknesses to BREAK · Unleash Limit Breaks'),
    ));
  });
}

export function partyIntro(): Promise<void> {
  app.stage.setMode('map', 'ruins');
  return new Promise(resolve => {
    mount(h('div.intro-screen',
      h('h2.screen-title', 'The Party'),
      h('p.screen-sub', 'Three wanderers climb the Shardfall Spire, where the crystal that once lit the world has turned to ruin.'),
      h('div.intro-cards', (['knight', 'bmage', 'wmage'] as HeroId[]).map((id, i) => {
        const d = HEROES[id];
        return h('div.intro-hero.hero-' + id, { style: `animation-delay:${i * 0.15}s` },
          h('div.intro-portrait', img(portraitUrl(id))),
          h('div.intro-name', d.name), h('div.intro-job', d.job),
          h('div.intro-hp', `${d.hp} HP`),
          h('p.intro-blurb', d.blurb));
      })),
      btn('Begin the Ascent', () => resolve(), 'big-btn'),
    ));
  });
}

// ───────────────────────── map ─────────────────────────
const NODE_NAMES: Record<NodeType, string> = { battle: 'Battle', elite: 'Elite Battle', event: 'Mystery', inn: 'Inn', shop: 'Merchant', treasure: 'Treasure', boss: 'Boss' };
const NODE_TIPS: Record<NodeType, string> = {
  battle: 'Fight a group of monsters.', elite: 'A powerful foe. Guards an Accessory and more XP.', event: 'Something unusual awaits...',
  inn: 'Rest to heal, or train to upgrade a card.', shop: 'Spend gold on cards, Accessories and Items.', treasure: 'A chest with gold and an Accessory.', boss: 'The master of this spire.',
};
const ROW_H = 118, MAP_W = 860;

export function mapScreen(run: Run, theme: 'ruins' | 'depths' | 'boss'): Promise<number> {
  app.stage.setMode('map', theme);
  app.audio.music('map');
  const avail = new Set(reachable(run));
  const visited = new Set(run.path);
  const height = (ROWS + 1) * ROW_H + 160;
  const pos = (id: number) => {
    const n = nodeById(run, id);
    const jx = ((id * 37) % 23) - 11, jy = ((id * 53) % 19) - 9;
    return n.type === 'boss' ? { x: MAP_W / 2, y: 110 } : { x: 90 + n.col * ((MAP_W - 180) / 6) + jx, y: height - 90 - n.row * ROW_H + jy };
  };
  return new Promise(resolve => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(MAP_W));
    svg.setAttribute('height', String(height));
    svg.setAttribute('class', 'map-lines');
    for (const n of run.map) for (const to of n.next) {
      const a = pos(n.id), b = pos(to);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y));
      const walked = visited.has(n.id) && visited.has(to) && run.path.indexOf(to) === run.path.indexOf(n.id) + 1;
      const next = (run.at === n.id || (run.at === null && false)) && avail.has(to);
      line.setAttribute('class', walked ? 'walked' : next ? 'next' : '');
      svg.append(line);
    }
    const nodes = run.map.map(n => {
      const p = pos(n.id);
      const cls = ['map-node', `t-${n.type}`, avail.has(n.id) ? 'avail' : '', visited.has(n.id) ? 'visited' : '', run.at === n.id ? 'current' : ''].filter(Boolean).join('.');
      const el = h('div.' + cls, { style: `left:${p.x}px; top:${p.y}px`, 'data-tip': `<b>${NODE_NAMES[n.type]}</b><br>${NODE_TIPS[n.type]}` },
        h('div.map-node-ring'), img(uiIconUrl(n.type)));
      if (avail.has(n.id)) el.addEventListener('click', () => { app.audio.sfx('map'); resolve(n.id); });
      el.addEventListener('pointerenter', () => avail.has(n.id) && app.audio.sfx('hover'));
      return el;
    });
    const scroller = h('div.map-scroll', h('div.map-canvas', { style: `height:${height}px; width:${MAP_W}px` }, svg as unknown as HTMLElement, nodes));
    const root = mount(h('div.map-screen',
      topBar(run, { onItem: slot => useItemOutside(run, slot) }),
      h('div.map-title', h('div.map-title-name', 'Shardfall Spire'), h('div.map-title-sub', 'Choose your path')),
      h('div.map-frame', scroller),
      h('div.map-legend', h('div.legend-title', 'Legend'), (Object.keys(NODE_NAMES) as NodeType[]).map(t => h('div.legend-row', img(uiIconUrl(t)), NODE_NAMES[t]))),
    ));
    void root;
    requestAnimationFrame(() => {
      const row = run.at === null ? 0 : nodeById(run, run.at).row + 1;
      scroller.scrollTop = height - 90 - row * ROW_H - scroller.clientHeight * 0.65;
    });
  });
}

function useItemOutside(run: Run, slot: number) {
  const id = run.items[slot];
  if (!id) return;
  const it = ITEMS[id];
  if (it.combatOnly) { toast(`${it.name} can only be used in battle`); return; }
  const close = modal(h('div.picker',
    h('h3', `Use ${it.name} on...`),
    h('div.hero-pick', run.heroes.map(hr => btn(h('div.hero-pick-inner', img(portraitUrl(hr.id)), h('div', HEROES[hr.id].name), h('small', `${hr.hp} / ${hr.maxHp}`)), () => {
      healHero(run, hr.id, id === 'elixir' ? hr.maxHp : 20);
      run.items[slot] = null;
      app.audio.sfx('heal');
      close();
      refreshTopBar(run, { onItem: s => useItemOutside(run, s) });
    }, 'hero-pick-btn'))),
  ));
}

// ───────────────────────── rewards ─────────────────────────
export async function rewardsScreen(run: Run, type: NodeType): Promise<void> {
  const r = battleRewards(run, type);
  const lvBefore = run.level, xpBefore = run.xp;
  const ups = gainXp(run, r.xp);
  app.audio.music('map');
  await new Promise<void>(resolve => {
    const list = h('div.reward-list');
    const addRow = (icon: string, label: string, onTake: (row: HTMLElement) => boolean | void) => {
      const row = btn(h('div.reward-row-inner', img(icon), h('span', label)), () => { if (onTake(row) !== false) { row.classList.add('taken'); row.setAttribute('disabled', ''); } }, 'reward-row');
      list.append(row);
    };
    addRow(uiIconUrl('gold'), `${r.gold} Gold`, () => { run.gold += r.gold; app.audio.sfx('gold'); refresh(); });
    if (r.item) addRow(uiIconUrl(ITEMS[r.item].icon), ITEMS[r.item].name, () => {
      if (!addItem(run, r.item!)) { toast('Item pouch is full'); app.audio.sfx('error'); return false; }
      app.audio.sfx('select'); refresh();
    });
    if (r.acc) addRow(accessoryIconUrl(r.acc), ACCESSORIES[r.acc].name, () => { addAcc(run, r.acc!); app.audio.sfx('chest'); refresh(); });
    if (r.cards.length) addRow(cardArtUrl('slash'), 'Learn a new card', row => {
      cardChoice(run, r.cards, 'Choose a card').then(taken => { if (taken) { row.classList.add('taken'); row.setAttribute('disabled', ''); } });
      return false;
    });
    const xpNeeded = xpToNext(run.level);
    const xpBox = h('div.xp-box',
      h('div.xp-line', h('span', `Party Lv ${lvBefore}`), h('span.xp-gain', r.xp ? `+${r.xp} XP` : '')),
      h('div.xp-bar', h('div.xp-fill', { style: `width:${(xpBefore / xpToNext(lvBefore)) * 100}%` })));
    const topSlot = h('div', topBar(run));
    const refresh = () => topSlot.replaceChildren(topBar(run));
    mount(h('div.reward-screen', topSlot,
      h('div.window.reward-window',
        h('h2.window-title', type === 'elite' ? 'Elite Vanquished' : 'Spoils of Battle'),
        r.xp ? xpBox : null,
        list,
        btn('Continue', () => resolve(), 'big-btn'))));
    // animate the xp bar filling (and wrapping on level up)
    setTimeout(() => {
      const fill = xpBox.querySelector('.xp-fill') as HTMLElement;
      if (ups) {
        fill.style.width = '100%';
        setTimeout(() => { xpBox.querySelector('.xp-line span')!.textContent = `Party Lv ${run.level}`; xpBox.classList.add('leveled'); fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = ''; fill.style.width = `${(run.xp / xpNeeded) * 100}%`; app.audio.sfx('levelUp'); }, 700);
      } else fill.style.width = `${(run.xp / xpNeeded) * 100}%`;
    }, 400);
  });
  for (let i = 0; i < ups; i++) await levelUpScreen(run, lvBefore + i + 1);
}

export async function levelUpScreen(run: Run, level: number): Promise<void> {
  app.audio.sfx('levelUp');
  const choices = levelUpChoices(run);
  await new Promise<void>(resolve => {
    mount(h('div.levelup-screen',
      h('div.levelup-burst'),
      h('h2.levelup-title', 'Level Up!'),
      h('div.levelup-level', `Party Level ${level}`),
      h('div.levelup-heroes', run.heroes.map(hr => h('div.levelup-hero', img(portraitUrl(hr.id)), h('div', HEROES[hr.id].name), h('b', `+${HEROES[hr.id].hpPerLevel} Max HP`)))),
      h('div.levelup-prompt', 'Choose a new technique to learn'),
      h('div.card-row', choices.map(id => {
        const c: CardInst = { uid: 'preview-' + id, id, upgraded: false };
        const el = cardEl(c);
        el.classList.add('pickable');
        el.addEventListener('pointerenter', () => app.audio.sfx('hover'));
        el.addEventListener('click', () => { run.deck.push(newCard(run, id)); app.audio.sfx('select'); resolve(); });
        return el;
      })),
      btn('Skip', () => resolve(), 'skip-btn'),
    ));
  });
}

/** Offer cards; resolves true if one was taken. */
export function cardChoice(run: Run, ids: string[], title: string): Promise<boolean> {
  return new Promise(resolve => {
    let done = false;
    const close = modal(h('div.card-choice',
      h('h3.window-title', title),
      h('div.card-row', ids.map(id => {
        const el = cardEl({ uid: 'preview-' + id, id, upgraded: false });
        el.classList.add('pickable');
        el.addEventListener('pointerenter', () => app.audio.sfx('hover'));
        el.addEventListener('click', () => { done = true; run.deck.push(newCard(run, id)); app.audio.sfx('select'); close(); refreshTopBar(run); resolve(true); });
        return el;
      })),
      btn('Skip', () => close(), 'skip-btn'),
    ), { onClose: () => { if (!done) resolve(false); } });
  });
}

// ───────────────────────── deck view / pickers ─────────────────────────
export function deckView(cards: CardInst[], title: string, pick?: { filter?: (c: CardInst) => boolean; preview?: 'upgrade'; onPick: (c: CardInst) => void; onCancel?: () => void }) {
  let picked = false;
  const close = modal(h('div.deck-view',
    h('h3.window-title', title, h('span.deck-count', ` (${cards.length})`)),
    cards.length ? h('div.deck-grid', cards.map(c => {
      const ok = !pick || !pick.filter || pick.filter(c);
      const el = cardEl(c);
      if (pick) {
        el.classList.add(ok ? 'pickable' : 'disabled');
        if (ok) {
          if (pick.preview === 'upgrade') {
            const up = cardEl({ ...c, upgraded: true });
            el.addEventListener('pointerenter', () => { el.replaceChildren(...up.cloneNode(true).childNodes); el.classList.add('upgraded'); });
            el.addEventListener('pointerleave', () => { el.replaceChildren(...cardEl(c).childNodes); if (!c.upgraded) el.classList.remove('upgraded'); });
          }
          el.addEventListener('click', () => { picked = true; close(); pick.onPick(c); });
        }
      }
      return el;
    })) : h('div.empty-note', 'Nothing here.'),
  ), { onClose: () => { if (!picked) pick?.onCancel?.(); } });
}

export function pickCard(run: Run, mode: 'upgrade' | 'remove'): Promise<boolean> {
  return new Promise(resolve => {
    deckView(run.deck, mode === 'upgrade' ? 'Choose a card to upgrade' : 'Choose a card to remove', {
      filter: mode === 'upgrade' ? canUpgrade : undefined,
      preview: mode === 'upgrade' ? 'upgrade' : undefined,
      onPick: c => {
        if (mode === 'upgrade') { upgradeCard(run, c.uid); app.audio.sfx('buff'); toast(`${cardDef(c.id).name} upgraded!`); }
        else { removeCard(run, c.uid); app.audio.sfx('purchase'); toast(`${cardDef(c.id).name} removed`); }
        resolve(true);
      },
      onCancel: () => resolve(false),
    });
  });
}

// ───────────────────────── inn ─────────────────────────
export function innScreen(run: Run): Promise<void> {
  app.audio.music('inn');
  return new Promise(resolve => {
    const topSlot = h('div', topBar(run));
    const heal = run.heroes.map(hr => Math.min(hr.maxHp - hr.hp, Math.round(hr.maxHp * 0.3)));
    const choices = h('div.inn-choices',
      btn(h('div.inn-choice', img(cardArtUrl('cure'), 'inn-art'), h('h3', 'Rest'), h('p', 'Heal all heroes 30% of their max HP.'),
        h('div.inn-preview', run.heroes.map((hr, i) => h('div', img(portraitUrl(hr.id)), h('b', `+${heal[i]}`))))), () => {
        restHeal(run);
        app.audio.sfx('heal');
        done('The party sleeps soundly by the fire. Wounds mend.');
      }, 'inn-btn'),
      btn(h('div.inn-choice', img(cardArtUrl('warcry'), 'inn-art'), h('h3', 'Train'), h('p', 'Upgrade a card in your deck.')), async () => {
        if (await pickCard(run, 'upgrade')) done('Hours of practice by the firelight. Technique sharpened.');
      }, 'inn-btn'),
    );
    const win = h('div.window.inn-window', h('h2.window-title', 'The Wayfarer\'s Rest'), h('p.window-text', 'A crackling campfire in a sheltered alcove. For a moment, the spire is quiet.'), choices);
    const done = (text: string) => {
      topSlot.replaceChildren(topBar(run));
      win.replaceChildren(h('h2.window-title', 'The Wayfarer\'s Rest'), h('p.window-text', text), btn('Continue', () => resolve(), 'big-btn'));
    };
    mount(h('div.inn-screen', topSlot, win));
  });
}

// ───────────────────────── treasure ─────────────────────────
export function treasureScreen(run: Run): Promise<void> {
  const t = treasure(run);
  return new Promise(resolve => {
    const topSlot = h('div', topBar(run));
    const chest = h('div.chest', img(uiIconUrl('treasure')));
    const loot = h('div.chest-loot');
    const win = h('div.window.treasure-window', h('h2.window-title', 'Treasure'), chest, loot, h('p.window-text.hint', 'Click the chest to open it.'));
    chest.addEventListener('click', () => {
      if (chest.classList.contains('open')) return;
      chest.classList.add('open');
      app.audio.sfx('chest');
      run.gold += t.gold;
      if (t.acc) addAcc(run, t.acc);
      setTimeout(() => app.audio.sfx('gold'), 300);
      loot.append(h('div.loot-row', img(uiIconUrl('gold')), `${t.gold} Gold`));
      if (t.acc) loot.append(h('div.loot-row', { 'data-tip': ACCESSORIES[t.acc].text }, img(accessoryIconUrl(t.acc)), h('div', h('b', ACCESSORIES[t.acc].name), h('small', ACCESSORIES[t.acc].text))));
      win.querySelector('.hint')?.remove();
      win.append(btn('Continue', () => resolve(), 'big-btn'));
      topSlot.replaceChildren(topBar(run));
    });
    mount(h('div.treasure-screen', topSlot, win));
  });
}

// ───────────────────────── shop ─────────────────────────
export function shopScreen(run: Run): Promise<void> {
  const stock = shopStock(run);
  return new Promise(resolve => {
    const topSlot = h('div', topBar(run));
    const body = h('div.shop-body');
    const priceTag = (p: number) => h('div.price' + (run.gold < p ? '.poor' : ''), img(uiIconUrl('gold')), p);
    const buy = (price: number, f: () => boolean | void) => {
      if (run.gold < price) { app.audio.sfx('error'); toast('Not enough gold'); return; }
      if (f() === false) return;
      run.gold -= price;
      app.audio.sfx('purchase');
      render();
    };
    const render = () => {
      topSlot.replaceChildren(topBar(run));
      body.replaceChildren(
        h('div.shop-cards', stock.cards.map(s => {
          const el = h('div.shop-slot' + (s.sold ? '.sold' : ''), cardEl({ uid: 'shop-' + s.id, id: s.id, upgraded: false }), s.sold ? h('div.sold-tag', 'Sold') : priceTag(s.price));
          if (!s.sold) el.addEventListener('click', () => buy(s.price, () => { s.sold = true; run.deck.push(newCard(run, s.id)); }));
          return el;
        })),
        h('div.shop-side',
          h('div.shop-section', h('h4', 'Accessories'), stock.accs.map(s => {
            const a = ACCESSORIES[s.id];
            const el = h('div.shop-item' + (s.sold ? '.sold' : ''), { 'data-tip': `<b>${a.name}</b><br>${a.text}` }, img(accessoryIconUrl(s.id)), h('span.shop-item-name', a.name), s.sold ? h('div.sold-tag', 'Sold') : priceTag(s.price));
            if (!s.sold) el.addEventListener('click', () => buy(s.price, () => { s.sold = true; addAcc(run, s.id as AccId); }));
            return el;
          })),
          h('div.shop-section', h('h4', 'Items'), stock.items.map(s => {
            const it = ITEMS[s.id];
            const el = h('div.shop-item' + (s.sold ? '.sold' : ''), { 'data-tip': `<b>${it.name}</b><br>${it.text}` }, img(uiIconUrl(it.icon)), h('span.shop-item-name', it.name), s.sold ? h('div.sold-tag', 'Sold') : priceTag(s.price));
            if (!s.sold) el.addEventListener('click', () => buy(s.price, () => {
              if (!addItem(run, s.id as ItemId)) { app.audio.sfx('error'); toast('Item pouch is full'); return false; }
              s.sold = true;
            }));
            return el;
          })),
          h('div.shop-section', h('h4', 'Services'), (() => {
            const el = h('div.shop-item' + (stock.removeUsed ? '.sold' : ''), { 'data-tip': '<b>Card Removal</b><br>Remove a card from your deck. Price rises with each use.' },
              img(uiIconUrl('exhaust')), h('span.shop-item-name', 'Remove a card'), stock.removeUsed ? h('div.sold-tag', 'Sold') : priceTag(run.removeCost));
            if (!stock.removeUsed) el.addEventListener('click', async () => {
              if (run.gold < run.removeCost) { app.audio.sfx('error'); toast('Not enough gold'); return; }
              if (await pickCard(run, 'remove')) { run.gold -= run.removeCost; run.removeCost += 25; stock.removeUsed = true; render(); }
            });
            return el;
          })()),
        ),
      );
    };
    render();
    mount(h('div.shop-screen', topSlot,
      h('div.shop-head', img(uiIconUrl('shop'), 'shop-icon'), h('div', h('h2.window-title', 'Pom\'s Traveling Emporium'), h('p.window-text', '"Kupo! Finest wares this side of the spire. No refunds!"'))),
      body,
      btn('Leave', () => resolve(), 'big-btn shop-leave')));
  });
}

// ───────────────────────── events ─────────────────────────
const EVENT_ART: Record<string, CardArt> = { crystal: 'prism', book: 'focus', traveler: 'cure', dummy: 'warcry', merchant: 'miracle', fountain: 'purify' };

export function eventScreen(run: Run): Promise<void> {
  const ev = pickEvent(run);
  void EVENTS;
  return new Promise(resolve => {
    const topSlot = h('div', topBar(run));
    const text = h('p.window-text.event-text', ev.text);
    const opts = h('div.event-options');
    const renderOptions = () => opts.replaceChildren(...ev.options(run).map(o => {
      const b = btn(h('div.event-opt', h('b', `[${o.label}]`), h('span', o.desc), o.disabled ? h('em', ` — ${o.disabled}`) : null), async () => {
        const res = o.go(run);
        app.audio.sfx('select');
        text.textContent = res.text;
        opts.replaceChildren();
        topSlot.replaceChildren(topBar(run));
        if (res.follow) await followUp(run, res.follow);
        topSlot.replaceChildren(topBar(run));
        opts.append(btn('Continue', () => resolve(), 'big-btn'));
      }, 'event-btn');
      if (o.disabled) b.setAttribute('disabled', '');
      return b;
    }));
    renderOptions();
    mount(h('div.event-screen', topSlot,
      h('div.window.event-window',
        h('div.event-art', img(cardArtUrl(EVENT_ART[ev.sprite]))),
        h('div.event-body', h('h2.window-title', ev.title), text, opts))));
  });
}

async function followUp(run: Run, f: EventFollowUp) {
  if (f.kind === 'upgrade' || f.kind === 'remove') await pickCard(run, f.kind);
  else if (f.kind === 'cards') await cardChoice(run, f.cards, 'Choose a card');
  else if (f.kind === 'acc') { app.audio.sfx('chest'); toast(`Obtained ${ACCESSORIES[f.acc].name}!`); }
  else if (f.kind === 'levels') for (let i = 0; i < f.ups; i++) await levelUpScreen(run, run.level - f.ups + i + 1);
}

// ───────────────────────── settings / end ─────────────────────────
export function settings(onAbandon?: () => void) {
  const vol = JSON.parse(localStorage.getItem('shardfall.volumes') ?? '{}');
  const slider = (key: 'master' | 'music' | 'sfx', label: string, def: number) => {
    const input = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(vol[key] ?? def) }) as HTMLInputElement;
    input.addEventListener('input', () => { app.audio.setVolumes({ [key]: parseFloat(input.value) }); if (key !== 'music') app.audio.sfx('hover'); });
    return h('label.slider', h('span', label), input);
  };
  modal(h('div.settings',
    h('h3.window-title', 'Settings'),
    slider('master', 'Master', 0.8), slider('music', 'Music', 0.55), slider('sfx', 'Effects', 0.8),
    onAbandon ? btn('Abandon Run', onAbandon, 'danger') : null,
    h('p.settings-help', 'Controls: drag a card onto a target (or click a card, then a target). Number keys select cards, E ends the turn, Esc / right-click cancels.'),
  ));
}

export function endScreen(run: Run, won: boolean): Promise<void> {
  app.stage.setMode('title', won ? 'ruins' : 'boss');
  app.audio.music(won ? 'title' : 'none');
  const s = run.stats;
  const mins = Math.round((Date.now() - s.startedAt) / 60000);
  return new Promise(resolve => {
    mount(h('div.end-screen' + (won ? '.won' : '.lost'),
      h('h1.end-title', won ? 'The Spire Is Cleansed' : 'Your Journey Ends'),
      h('p.end-sub', won ? 'The Crystal Wyrm falls, and light returns to Shardfall.' : 'The spire claims another party of hopefuls...'),
      h('div.window.end-stats',
        [['Floor reached', String(s.floors)], ['Party level', String(run.level)], ['Enemies defeated', String(s.kills)], ['Breaks', String(s.breaks)],
          ['Limit Breaks', String(s.limits)], ['Damage dealt', String(s.damage)], ['Biggest hit', String(s.maxHit)], ['Cards played', String(s.cardsPlayed)], ['Deck size', String(run.deck.length)], ['Time', `${mins} min`]]
          .map(([k, v]) => h('div.stat-row', h('span', k), h('b', v)))),
      btn('Return to Title', () => resolve(), 'big-btn'),
    ));
  });
}

export async function bossIntro() {
  app.audio.music('none');
  await banner('A great presence stirs...', 'boss', 1600);
  await wait(200);
}
