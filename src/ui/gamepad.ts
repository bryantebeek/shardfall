// Controller support. The gamepad moves a focus ring over clickable elements and emulates the mouse/keyboard
// events the screens already listen to (hover, click, Esc, E), so screens need no gamepad-specific code.
// Standard mapping: A select · B back · X deck · Y end turn · Start settings · D-pad/left stick move · right stick scroll.
import { app, toast } from './app';
import { h } from './dom';

const FOCUSABLE = [
  'button.btn:not([disabled]):not(.disabled)', '.card.pickable', '.hand .card', '.map-node.avail', '.shop-slot:not(.sold)',
  '.shop-item:not(.sold)', '.chest:not(.open)', '.tb-item:not(.empty)', '.pile', 'input[type=range]',
].join(', ');
/** Where focus lands when a screen opens, in order of preference. */
const PREFER = ['.dlg-next', '.memory-card .big-btn', '.chapter-card .big-btn', '.hand .card.playable', '.end-turn', '.hand .card', '.map-node.avail', '.reward-row', '.title-btn.primary', '.card.pickable', '.event-btn',
  '.inn-btn', '.chest', '.shop-slot', '.hero-pick-btn', '.big-btn', '.skip-btn'];
/** Virtual point an untargeted card is released at (above the play line in battle.ts). */
const PLAY_AT: [number, number] = [960, 420];

let active = false;
let focused: HTMLElement | null = null;
let placedCard: Element | null = null;
/** focus was placed by sync(), not by the player, so a better default may replace it */
let auto = false;

export function initGamepad() {
  const legend = h('div.pad-legend',
    h('span.pad-key.a', 'A'), 'Select', h('span.pad-key.b', 'B'), 'Back', h('span.pad-key.x', 'X'), 'Deck', h('span.pad-key.y', 'Y'), 'End Turn', h('span.pad-key.s', '≡'), 'Settings');
  app.ui.append(legend);
  window.addEventListener('gamepadconnected', () => toast('Controller connected'));
  // a real mouse move hands control back to the mouse
  window.addEventListener('pointermove', e => {
    if (!e.isTrusted || !active) return;
    active = false;
    focus(null);
    legend.classList.remove('show');
  });

  let last: boolean[] = [], held = '', repeatAt = 0;
  const poll = (now: number) => {
    requestAnimationFrame(poll);
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    if (!pad) return;
    const on = pad.buttons.map(b => b.pressed), prev = last;
    const press = (i: number) => on[i] && !prev[i];
    const [lx = 0, ly = 0, , ry = 0] = pad.axes;
    const dir = on[12] || ly < -0.5 ? 'up' : on[13] || ly > 0.5 ? 'down' : on[14] || lx < -0.5 ? 'left' : on[15] || lx > 0.5 ? 'right' : '';
    const input = !!dir || on.some((b, i) => b && !prev[i]);
    last = on;
    if (!active) {
      if (!input) return;
      // the first input only wakes the focus ring
      active = true;
      legend.classList.add('show');
      held = dir; repeatAt = now + 380;
      return;
    }
    sync();
    if (dir && (dir !== held || now >= repeatAt)) { repeatAt = now + (dir === held ? 110 : 380); move(dir); }
    held = dir;
    if (Math.abs(ry) > 0.2) { const sc = layer()?.querySelector<HTMLElement>('.deck-grid, .map-scroll'); if (sc) sc.scrollTop += ry * 24; }
    if (press(0)) activate();
    if (press(1)) key('Escape');
    if (press(2)) layer()?.querySelector<HTMLElement>('.topbar .tb-btn')?.click();
    if (press(3)) key('e');
    if (press(9)) {
      if (app.ui.querySelector('.modal-back:not(.leaving)')) key('Escape');
      else layer()?.querySelector<HTMLElement>('.topbar .tb-btn:last-of-type, .title-menu .title-btn:last-child')?.click();
    }
  };
  requestAnimationFrame(poll);
}

/** The topmost interactive layer: the last open modal, else the current screen. */
function layer(): HTMLElement | null {
  const modals = app.ui.querySelectorAll<HTMLElement>('.modal-back:not(.leaving)');
  return modals.length ? modals[modals.length - 1] : app.ui.querySelector('.screen:not(.leaving)');
}

function candidates(): HTMLElement[] {
  const root = layer();
  if (!root) return [];
  let sel = FOCUSABLE;
  if (root.classList.contains('aim-enemy')) sel = '.unit.enemy:not(.ko) .hit';
  else if (root.classList.contains('aim-ally')) sel = '.unit.hero .hit';
  else if (root.querySelector('.hand .card.aiming')) return []; // untargeted card: A releases it, B cancels
  return [...root.querySelectorAll<HTMLElement>(sel)].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
}

/** Keep focus on something valid as screens, modals and aiming modes change. */
function sync() {
  const cands = candidates();
  if (!cands.length) {
    focus(null);
    const card = layer()?.querySelector('.hand .card.aiming');
    if (card && card !== placedCard) { placedCard = card; const [x, y] = toClient(...PLAY_AT); pointer('pointermove', layer()!, x, y); }
    return;
  }
  placedCard = null;
  const best = PREFER.map(s => cands.find(c => c.matches(s))).find(Boolean) ?? cands[0];
  if (focused && cands.includes(focused) && !(auto && rank(best) < rank(focused))) return;
  focus(best);
  auto = true;
}

const rank = (el: Element) => { const i = PREFER.findIndex(s => el.matches(s)); return i < 0 ? PREFER.length : i; };

function move(dir: string) {
  if (!focused) return;
  if (focused instanceof HTMLInputElement && (dir === 'left' || dir === 'right')) {
    focused.value = String(Number(focused.value) + Number(focused.step || 1) * (dir === 'left' ? -1 : 1));
    focused.dispatchEvent(new Event('input'));
    return;
  }
  const [vx, vy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir as 'up']!;
  const [fx, fy] = center(focused);
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const c of candidates()) {
    const [x, y] = center(c);
    const along = (x - fx) * vx + (y - fy) * vy, across = Math.abs((x - fx) * vy - (y - fy) * vx);
    if (c === focused || along <= 4) continue;
    const score = along + across * 2.5;
    if (score < bestScore) { best = c; bestScore = score; }
  }
  if (best) { focus(best); auto = false; }
}

function activate() {
  const root = layer();
  if (!focused) {
    // an untargeted card is aiming: release it above the play line
    if (root?.querySelector('.hand .card.aiming')) { const [x, y] = toClient(...PLAY_AT); pointer('pointerdown', root, x, y); }
    return;
  }
  if (focused.matches('.hand .card')) {
    // battle.ts picks cards up on pointerdown and treats a press without movement as click-to-select
    const [x, y] = center(focused);
    pointer('pointerdown', focused, x, y);
    pointer('pointerup', focused, x, y);
  } else focused.click();
}

function focus(el: HTMLElement | null) {
  if (el === focused) return;
  if (focused) {
    focused.classList.remove('pad-focus');
    const [x, y] = center(focused);
    pointer('pointerout', focused, x, y);
    pointer('pointerleave', focused, x, y);
  }
  focused = el;
  if (!el) return;
  el.classList.add('pad-focus');
  scrollIntoView(el);
  const [x, y] = center(el);
  pointer('pointerover', el, x, y); // tooltips
  pointer('pointerenter', el, x, y); // hover sfx, hand card raise, battle target highlight
  pointer('pointermove', el, x, y); // aim arrow
}

/** Scroll only our own scroll boxes (scrollIntoView would also scroll the letterbox frame). */
function scrollIntoView(el: HTMLElement) {
  const box = el.closest<HTMLElement>('.map-scroll, .deck-grid');
  if (!box) return;
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= (b.top - r.top + 40) / app.scale;
  else if (r.bottom > b.bottom) box.scrollTop += (r.bottom - b.bottom + 40) / app.scale;
}

function pointer(type: string, target: EventTarget, clientX: number, clientY: number) {
  const bubbles = type !== 'pointerenter' && type !== 'pointerleave';
  target.dispatchEvent(new PointerEvent(type, { bubbles, cancelable: true, clientX, clientY, button: 0, pointerType: 'mouse', isPrimary: true }));
}

const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

function center(el: Element): [number, number] {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

function toClient(vx: number, vy: number): [number, number] {
  const r = document.getElementById('frame')!.getBoundingClientRect();
  return [r.left + vx * app.scale, r.top + vy * app.scale];
}
