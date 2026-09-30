import { cardArtUrl, elementIconUrl } from '../art';
import type { Battle, EnemyF } from '../game/battle';
import { cardCost, cardDef, cardName, cardText, cardVal } from '../game/cards';
import { HEROES } from '../game/heroes';
import type { CardInst } from '../game/types';
import { fmtText, h, img } from './dom';

const TYPE_NAMES = { attack: 'Attack', skill: 'Skill', power: 'Power', status: 'Status' };

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

const SWIFT_SVG = '<svg viewBox="0 0 20 16"><path d="M2 2l6 6-6 6M10 2l6 6-6 6"/></svg>';
/** How much of the hero's time a card takes: Swift (none), one Action, or Heavy (the Action and their next turn(s)). */
function timeBadge(cost: number): HTMLElement {
  if (cost === 0) return h('div.card-time.swift', { 'data-tip': '<b>Swift</b><br>Doesn\'t use the hero\'s Action.', html: SWIFT_SVG });
  const tip = cost > 1 ? `<b>${cost} Actions</b><br>Hold this hero for a turn to save up for it.` : '<b>1 Action</b><br>A hero gains 1 Action each turn, and can hold 2.';
  return h('div.card-time' + (cost > 1 ? '.heavy' : ''), { 'data-tip': tip }, Array.from({ length: cost }, () => h('i')));
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
    d.unplayable ? null : timeBadge(cardCost(c)),
  );
  return el;
}

export function refreshCardText(el: HTMLElement, c: CardInst, b?: Battle, target?: EnemyF) {
  const t = el.querySelector('.card-text');
  if (t) t.innerHTML = cardTextHtml(c, b, target);
}
