import { accessoryIconUrl, portraitUrl, uiIconUrl } from '../art';
import { HEROES, xpToNext } from '../game/heroes';
import { ACCESSORIES, ITEMS } from '../game/loot';
import { ROWS, clearSave, type Run } from '../game/run';
import { app, btn } from './app';
import { h, img } from './dom';
import { deckView, settings, useItemOutside } from './screens';

export interface TopBarOpts {
  /** clicking an item slot (battle uses this for targeting); default uses the item outside battle */
  onItem?: (slot: number) => void;
  items?: (string | null)[];
  hideParty?: boolean;
  /** in battle: the Shards held plus those gathered so far */
  shards?: number;
}

export function topBar(run: Run, o: TopBarOpts = {}): HTMLElement {
  const items = o.items ?? run.items;
  const onItem = o.onItem ?? ((slot: number) => useItemOutside(run, slot));
  const inBattle = !!o.items;
  const row = run.at === null ? 0 : (run.map.find(n => n.id === run.at)?.row ?? -1) + 1; // (the Spire's floor; story mode shows the attempt)
  const xpPct = Math.round((run.xp / xpToNext(run.level)) * 100);
  return h('div.topbar',
    o.hideParty ? h('div.tb-spacer') : h('div.tb-party', run.heroes.map(hr => {
      const def = HEROES[hr.id];
      const f = hr.hp / hr.maxHp;
      return h('div.tb-hero' + (hr.hp <= 0 ? '.ko' : f <= 0.25 ? '.low' : f <= 0.5 ? '.mid' : ''), { 'data-tip': `<b>${def.name}</b> — ${def.job}<br>${hr.hp} / ${hr.maxHp} HP` },
        img(portraitUrl(hr.id), 'tb-portrait'),
        h('div.tb-vitals',
          h('div.tb-hpn', h('b', hr.hp), h('span', `/${hr.maxHp}`)),
          h('div.tb-hp', h('div.tb-hp-fill', { style: `width:${f * 100}%` }))));
    })),
    h('div.tb-level', { 'data-tip': `<b>Party Level ${run.level}</b><br>${run.xp} / ${xpToNext(run.level)} XP to next level` },
      h('span.tb-lv', 'Lv'), h('span.tb-lvn', run.level), h('div.tb-xp', h('div.tb-xp-fill', { style: `width:${xpPct}%` }))),
    h('div.tb-gold', { 'data-tip': '<b>Crystal Shards</b><br>Earned by Breaking enemies. Spent at the market.' }, img(uiIconUrl('crystal')), h('span', o.shards ?? run.shards)),
    h('div.tb-items', items.map((id, i) => {
      const it = id ? ITEMS[id as keyof typeof ITEMS] : null;
      const slot = h('div.tb-item' + (it ? '' : '.empty'), { 'data-tip': it ? `<b>${it.name}</b><br>${it.text}${it.combatOnly && !inBattle ? '<br><i>Usable in battle.</i>' : '<br><i>Click to use.</i>'}` : 'Empty item slot' },
        it ? img(uiIconUrl(it.icon)) : null);
      if (it) slot.addEventListener('click', () => onItem(i));
      return slot;
    })),
    h('div.tb-accs', run.acc.map(a => h('div.tb-acc', { 'data-tip': `<b>${ACCESSORIES[a].name}</b><br>${ACCESSORIES[a].text}` }, img(accessoryIconUrl(a))))),
    h('div.tb-grow'),
    run.story
      ? h('div.tb-floor', { 'data-tip': '<b>Attempt</b><br>How many times Seren\'s Hourglass has brought the party back.' }, img(uiIconUrl('map')), h('span', `Attempt ${run.story.attempt}`))
      : h('div.tb-floor', { 'data-tip': '<b>Spire Floor</b>' }, img(uiIconUrl('map')), h('span', row > ROWS ? 'Boss' : `${row} / ${ROWS + 1}`)),
    btn(h('span', h('span.tb-fan', [0, 1, 2].map(() => img(uiIconUrl('card')))), h('span', run.deck.length)), () => deckView(run.deck, 'Party Deck'), 'tb-btn tb-deck'),
    btn(h('span', img(uiIconUrl('gear'))), () => settings(() => { clearSave(); location.reload(); }), 'tb-btn tb-gear'),
  );
}

export function refreshTopBar(run: Run, o: TopBarOpts = {}) {
  const old = app.ui.querySelector('.screen:not(.leaving) .topbar');
  if (old) old.replaceWith(topBar(run, o));
}
