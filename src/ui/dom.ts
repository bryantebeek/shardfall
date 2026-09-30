import { elementIconUrl, statusIconUrl } from '../art';
import { KEYWORDS } from '../game/cards';
import type { Element, StatusId } from '../game/types';

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string };

/** Tiny hyperscript: h('div.card.big#id', { onclick }, ...children) */
export function h(sel: string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  const [tagPart, ...rest] = sel.split(/(?=[.#])/);
  const el = document.createElement(tagPart || 'div');
  for (const r of rest) r[0] === '.' ? el.classList.add(r.slice(1)) : (el.id = r.slice(1));
  if (attrs !== undefined && (attrs === null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs as Child); attrs = undefined; }
  for (const [k, v] of Object.entries((attrs as Attrs) ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'style') typeof v === 'string' ? (el.style.cssText = v) : Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'class') el.className += ' ' + v;
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, c: Child) {
  if (c === null || c === undefined || c === false) return;
  if (Array.isArray(c)) c.forEach(x => append(el, x));
  else el.append(c instanceof Node ? c : String(c));
}

export const img = (src: string, cls = '') => h('img.px' + (cls ? '.' + cls : ''), { src, draggable: 'false', alt: '' });

export const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

export const ELEMENT_NAMES: Record<Element, string> = { phys: 'Physical', fire: 'Fire', ice: 'Ice', thunder: 'Thunder', holy: 'Holy', dark: 'Dark' };

export const STATUS_INFO: Record<StatusId, { name: string; buff: boolean; text: (n: number) => string }> = {
  str: { name: 'Strength', buff: true, text: n => `Deals ${n} additional damage per hit.` },
  weak: { name: 'Weak', buff: false, text: n => `Deals 25% less damage for ${n} round${n > 1 ? 's' : ''}.` },
  vuln: { name: 'Vulnerable', buff: false, text: n => `Takes 50% more damage for ${n} round${n > 1 ? 's' : ''}.` },
  regen: { name: 'Regen', buff: true, text: n => `Heals ${n} HP at the start of turn, then Regen decreases by 1.` },
  burn: { name: 'Burn', buff: false, text: n => `Loses ${n} HP at the start of turn, then Burn decreases by 1.` },
  taunt: { name: 'Taunt', buff: true, text: () => 'Single-target enemy attacks are redirected to this hero this round.' },
  thorns: { name: 'Thorns', buff: true, text: n => `Attackers take ${n} damage.` },
  ironwall: { name: 'Iron Wall', buff: true, text: n => `Gains ${n} Block at the end of your turn.` },
  rampart: { name: 'Rampart', buff: true, text: () => 'Block does not expire.' },
  prayer: { name: 'Prayer', buff: true, text: n => `At the start of your turn, heals the most wounded ally ${n} HP.` },
  ward: { name: 'Angel Ward', buff: true, text: n => `At the start of your turn, all allies gain ${n} Block.` },
  ritual: { name: 'Ritual', buff: true, text: n => `Gains ${n} Strength at the end of its turn.` },
};

const ELEMENT_WORDS: [RegExp, Element][] = [[/\bFire\b/g, 'fire'], [/\bIce\b/g, 'ice'], [/\bThunder\b/g, 'thunder'], [/\bHoly\b/g, 'holy']];

/** Card/description markup → HTML. vals: {D: [value, base]} colors boosted values green, reduced red. */
export function fmtText(text: string, vals: Partial<Record<string, [number, number]>> = {}): string {
  let s = text.replace(/\{([DBHM])\}/g, (_, k) => {
    const v = vals[k];
    if (!v) return '?';
    const cls = v[0] > v[1] ? 'up' : v[0] < v[1] ? 'down' : '';
    return `<b class="num ${cls}">${v[0]}</b>`;
  });
  s = s.replace(/\*([A-Za-z ]+?)\*/g, (_, w) => `<span class="kw" data-tip="${esc(`<b>${w}</b><br>${KEYWORDS[w] ?? ''}`)}">${w}</span>`);
  for (const [re, el] of ELEMENT_WORDS) s = s.replace(re, m => `<span class="el el-${el}"><img class="px" src="${elementIconUrl(el)}">${m}</span>`);
  s = s.replace(/\bLIMIT\./, '<span class="limit-tag">LIMIT</span>');
  return s;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function statusChip(s: StatusId, n: number): HTMLElement {
  const info = STATUS_INFO[s];
  const showNum = s !== 'taunt' && s !== 'rampart';
  return h('div.status' + (info.buff ? '.buff' : '.debuff'), { 'data-tip': `<b>${info.name}</b><br>${info.text(n)}` },
    img(statusIconUrl(s)), showNum ? h('span', n) : null);
}

// ───────────── tooltips ─────────────
let tipEl: HTMLElement;
export function initTooltips(root: HTMLElement, toVirtual: (x: number, y: number) => [number, number]) {
  tipEl = h('div.tooltip');
  root.append(tipEl);
  let cur: HTMLElement | null = null;
  document.addEventListener('pointerover', e => {
    const t = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
    if (t === cur) return;
    cur = t;
    if (!t) return tipEl.classList.remove('show');
    tipEl.innerHTML = t.dataset.tip!;
    tipEl.classList.add('show');
  });
  document.addEventListener('pointermove', e => {
    if (!cur) return;
    if (!cur.isConnected) { cur = null; tipEl.classList.remove('show'); return; }
    const [x, y] = toVirtual(e.clientX, e.clientY);
    const w = tipEl.offsetWidth, hgt = tipEl.offsetHeight;
    tipEl.style.left = Math.min(1920 - w - 10, x + 18) + 'px';
    tipEl.style.top = (y + hgt + 30 > 1080 ? y - hgt - 14 : y + 22) + 'px';
  });
}
export function hideTip() { tipEl?.classList.remove('show'); }
