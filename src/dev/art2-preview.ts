// Dev-only preview of icons / textures / card art: /art2-preview.html?only=icons|textures|cards&s=3
import { ICON_KEYS, elementIconUrl, intentIconUrl, statusIconUrl, uiIconUrl, accessoryIconUrl } from '../art/icons';
import { getTexture, type TextureId } from '../art/textures';
import { cardArtUrl, CARD_ARTS } from '../art/cardart';

const q = new URLSearchParams(location.search);
const only = q.get('only');
const S = Number(q.get('s') ?? 3);
const app = document.getElementById('app')!;
const el = <K extends keyof HTMLElementTagNameMap>(t: K, parent: HTMLElement, text?: string) => {
  const e = document.createElement(t); if (text) e.textContent = text; parent.append(e); return e;
};
const img = (src: string, w: number, h: number, parent: HTMLElement, bg = '') => {
  const i = el('img', parent); i.src = src; i.width = w; i.height = h; if (bg) i.style.background = bg; return i;
};

if (!only || only === 'icons') {
  const groups: [string, readonly string[], (k: never) => string][] = [
    ['element', ICON_KEYS.element, elementIconUrl as (k: never) => string],
    ['intent', ICON_KEYS.intent, intentIconUrl as (k: never) => string],
    ['status', ICON_KEYS.status, statusIconUrl as (k: never) => string],
    ['ui', ICON_KEYS.ui, uiIconUrl as (k: never) => string],
    ['accessory', ICON_KEYS.accessory, accessoryIconUrl as (k: never) => string],
  ];
  for (const [name, keys, fn] of groups) {
    el('h2', app, name);
    const row = el('div', app); row.className = 'row';
    for (const k of keys) {
      const c = el('div', row); c.className = 'cell';
      const u = fn(k as never);
      const pair = el('div', c); pair.style.display = 'flex'; pair.style.gap = '4px'; pair.style.alignItems = 'flex-end';
      img(u, 16, 16, pair);
      img(u, 16 * S, 16 * S, pair, '#2a2336');
      el('span', c, k);
    }
  }
}

if (!only || only === 'textures') {
  el('h2', app, 'textures (3x3 tiled @3x)');
  const row = el('div', app); row.className = 'row';
  const ids: TextureId[] = ['stone', 'stoneTop', 'brick', 'moss', 'dirt', 'grass', 'crystal', 'wood', 'rune', 'water'];
  for (const id of ids) {
    const c = el('div', row); c.className = 'cell';
    const t = getTexture(id);
    const cv = el('canvas', c); cv.width = t.width * 3 * 3; cv.height = t.height * 3 * 3;
    const ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ctx.drawImage(t, x * t.width * 3, y * t.height * 3, t.width * 3, t.height * 3);
    el('span', c, id);
  }
}

if (!only || only === 'cards') {
  el('h2', app, 'card art @' + S + 'x');
  const row = el('div', app); row.className = 'row';
  const list = q.get('cards') ? q.get('cards')!.split(',') : CARD_ARTS;
  for (const a of list) {
    const c = el('div', row); c.className = 'cell';
    img(cardArtUrl(a as never), 64 * S, 40 * S, c);
    el('span', c, a);
  }
}
