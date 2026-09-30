import { cardArtUrl, elementIconUrl } from '../art';
import type { Battle, EnemyF } from '../game/battle';
import { cardCost, cardDef, cardName, cardText, cardVal } from '../game/cards';
import { HEROES } from '../game/heroes';
import type { CardInst } from '../game/types';
import { fmtText, h, img } from './dom';

const TYPE_NAMES = { attack: 'Attack', skill: 'Skill', power: 'Power', limit: 'Limit Break', status: 'Status' };

function vals(c: CardInst, b?: Battle, target?: EnemyF) {
  const d = cardDef(c.id);
  const out: Partial<Record<string, [number, number]>> = {};
  for (const k of ['D', 'B', 'H', 'M'] as const) {
    if (!d.v?.[k]) continue;
    const base = cardVal(c, k);
    let v = base;
    if (k === 'D' && b && d.hero) v = b.previewDamage(d.hero, base, target);
    if (k === 'H' && b?.acc.has('chalice')) v += 2;
    out[k] = [v, base];
  }
  return out;
}

export function cardTextHtml(c: CardInst, b?: Battle, target?: EnemyF): string {
  return `<span>${fmtText(cardText(c), vals(c, b, target))}</span>`;
}

export function cardEl(c: CardInst, b?: Battle): HTMLElement {
  const d = cardDef(c.id);
  const owner = d.hero ? HEROES[d.hero] : null;
  const cls = ['card', `hero-${d.hero ?? 'none'}`, `type-${d.type}`, `rarity-${d.rarity}`, c.upgraded ? 'upgraded' : ''].filter(Boolean).join('.');
  const el = h('div.' + cls, { 'data-uid': c.uid },
    h('div.card-glow'),
    h('div.card-frame',
      h('div.card-art', img(cardArtUrl(d.art)), d.el && d.type !== 'status' ? h('div.card-el', img(elementIconUrl(d.el))) : null),
      h('div.card-name', cardName(c)),
      h('div.card-type', TYPE_NAMES[d.type], owner ? h('span.card-owner', ' · ' + owner.name) : null),
      h('div.card-text', { html: cardTextHtml(c, b) }),
      h('div.card-gem'),
    ),
    d.unplayable ? null : h('div.card-cost', h('span', cardCost(c))),
  );
  return el;
}

export function refreshCardText(el: HTMLElement, c: CardInst, b?: Battle, target?: EnemyF) {
  const t = el.querySelector('.card-text');
  if (t) t.innerHTML = cardTextHtml(c, b, target);
}
