import { accessoryIconUrl, cardArtUrl, portraitUrl, uiIconUrl } from '../art';
import { canUpgrade, cardDef } from '../game/cards';
import { HEROES, xpToNext } from '../game/heroes';
import { ACCESSORIES, ITEMS, type AccId, type ItemId } from '../game/loot';
import {
  addAcc, addItem, battleRewards, gainXp, healHero, levelUpChoices, newCard, pickEvent, removeCard,
  restHeal, shopStock, treasure, upgradeCard, type EventDef, type EventFollowUp, type NodeType, type Run,
} from '../game/run';
import type { CardArt, CardInst, HeroId } from '../game/types';
import { app, btn, confirmBtn, modal, mount, toast } from './app';
import { cardEl } from './card';
import { h, img } from './dom';
import { refreshTopBar, topBar } from './hud';

// ───────────────────────── title ─────────────────────────
export function titleScreen(hasSave: boolean): Promise<'new' | 'continue' | 'skip'> {
  app.stage.setMode('title', 'ruins', 'shrine');
  app.audio.music('title');
  app.stage.setUnits([]);
  return new Promise(resolve => {
    mount(h('div.title-screen',
      h('div.logo',
        h('div.logo-sub-top', 'Every fall, they remember a little more'),
        h('h1.logo-text', 'Shardfall'),
        h('div.logo-rule'),
      ),
      h('div.title-menu',
        hasSave ? btn('Continue Journey', () => resolve('continue'), 'title-btn primary') : null,
        btn('New Journey', () => resolve('new'), 'title-btn' + (hasSave ? '' : ' primary')),
        btn('Skip Intro', () => resolve('skip'), 'title-btn'),
        btn('Settings', () => settings(), 'title-btn'),
      ),
      h('div.title-foot', '“Can you create a Slay the Spired inspired card game with a JRPG twist and look/feel? It should be AAA quality.”'),
    ));
  });
}

export function useItemOutside(run: Run, slot: number) {
  const id = run.items[slot];
  if (!id) return;
  const it = ITEMS[id];
  if (it.combatOnly) { toast(`${it.name} can only be used in battle`); return; }
  const close = modal(h('div.picker',
    h('h3', `Use ${it.name} on...`),
    h('div.hero-pick', run.heroes.map(hr => { const b = btn(h('div.hero-pick-inner', img(portraitUrl(hr.id)), h('div', HEROES[hr.id].name), h('small', `${hr.hp} / ${hr.maxHp}`)), () => {
      healHero(run, hr.id, id === 'elixir' ? hr.maxHp : 20);
      run.items[slot] = null;
      app.audio.sfx('heal');
      close();
      refreshTopBar(run);
    }, 'hero-pick-btn'); if (hr.hp >= hr.maxHp) b.setAttribute('disabled', ''); return b; })),
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
        confirmBtn('Continue', 'Leave rewards behind?', () => resolve(), 'big-btn', () => !!list.querySelector('.reward-row:not(.taken)')))));
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
        heal.some(Boolean) ? h('div.inn-preview', run.heroes.map((hr, i) => h('div', img(portraitUrl(hr.id)), h('b', `+${heal[i]}`)))) : h('p.hint', 'The party is already at full health.')), () => {
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
      run.shards += t.shards;
      if (t.acc) addAcc(run, t.acc);
      setTimeout(() => app.audio.sfx('gold'), 300);
      loot.append(h('div.loot-row', img(uiIconUrl('crystal')), `${t.shards} Shards`));
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
    const priceTag = (p: number) => h('div.price' + (run.shards < p ? '.poor' : ''), img(uiIconUrl('crystal')), p);
    const buy = (price: number, f: () => boolean | void) => {
      if (run.shards < price) { app.audio.sfx('error'); toast('Not enough Shards'); return; }
      if (f() === false) return;
      run.shards -= price;
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
              if (run.shards < run.removeCost) { app.audio.sfx('error'); toast('Not enough Shards'); return; }
              if (await pickCard(run, 'remove')) { run.shards -= run.removeCost; run.removeCost += 25; stock.removeUsed = true; render(); }
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

export function eventScreen(run: Run, ev: EventDef = pickEvent(run)): Promise<void> {
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
        // level-ups are full screens that replace this one, so the event ends with them
        if (res.follow?.kind === 'levels') { await followUp(run, res.follow); resolve(); return; }
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
    h('div.slider', h('span', 'Speed'), h('div.speed-opts', [1, 1.5, 2].map(v => {
      const b = btn(`${v}×`, () => {
        app.speed = v;
        app.stage.setSpeed(v);
        localStorage.setItem('shardfall.speed', String(v));
        b.parentElement!.querySelectorAll('.btn').forEach(x => x.classList.toggle('on', x === b));
      }, 'speed-btn' + (app.speed === v ? ' on' : ''));
      return b;
    }))),
    onAbandon ? confirmBtn('Abandon Run', 'Really abandon? Click again', onAbandon, 'danger') : null,
    h('p.settings-help', 'Controls: drag a card onto a target (or click a card, then a target). Number keys select cards, E ends the turn, Esc / right-click cancels.'),
  ));
}

export function endScreen(run: Run, won: boolean): Promise<void> {
  app.stage.setMode('title', won ? 'ruins' : 'boss');
  app.stage.setUnits([]);
  app.audio.music(won ? 'title' : 'none');
  const s = run.stats;
  const mins = Math.round((Date.now() - s.startedAt) / 60000);
  return new Promise(resolve => {
    mount(h('div.end-screen' + (won ? '.won' : '.lost'),
      h('h1.end-title', won ? 'The Spire Is Cleansed' : 'Your Journey Ends'),
      h('p.end-sub', won ? 'The Crystal Wyrm falls, and light returns to Shardfall.' : 'The spire claims another party of hopefuls...'),
      h('div.window.end-stats',
        [['Floor reached', String(s.floors)], ['Party level', String(run.level)], ['Enemies defeated', String(s.kills)], ['Breaks', String(s.breaks)], ['Damage dealt', String(s.damage)], ['Biggest hit', String(s.maxHit)], ['Cards played', String(s.cardsPlayed)], ['Deck size', String(run.deck.length)], ['Time', `${mins} min`]]
          .map(([k, v]) => h('div.stat-row', h('span', k), h('b', v)))),
      btn('Return to Title', () => resolve(), 'big-btn'),
    ));
  });
}
