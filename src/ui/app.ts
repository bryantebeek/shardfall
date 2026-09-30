import type { Audio } from '../audio/api';
import type { Stage } from '../render/api';
import { h, hideTip, wait } from './dom';

export const app = {} as {
  stage: Stage;
  audio: Audio;
  ui: HTMLElement;
  scale: number;
  /** battle speed multiplier (Settings) */
  speed: number;
  toVirtual(x: number, y: number): [number, number];
};

/** Replace the current screen with a fresh root element (cross-fade). */
export function mount(el: HTMLElement): HTMLElement {
  hideTip();
  const old = app.ui.querySelectorAll('.screen');
  old.forEach(o => { o.classList.add('leaving'); setTimeout(() => o.remove(), 400); });
  el.classList.add('screen');
  app.ui.prepend(el);
  return el;
}

export function modal(content: HTMLElement, opts: { onClose?: () => void; closable?: boolean } = {}): () => void {
  const back = h('div.modal-back', h('div.modal', content));
  const close = () => { back.classList.add('leaving'); setTimeout(() => back.remove(), 250); opts.onClose?.(); };
  if (opts.closable !== false) {
    back.addEventListener('pointerdown', e => { if (e.target === back) { app.audio.sfx('click'); close(); } });
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && back.isConnected) { document.removeEventListener('keydown', esc); close(); } };
    document.addEventListener('keydown', esc);
  }
  app.ui.append(back);
  return close;
}

/** Big centered banner (turn changes, BREAK, victory...). */
export async function banner(text: string, cls = '', ms = 900) {
  const el = h('div.banner.' + (cls || 'plain'), h('div.banner-line'), h('div.banner-text', text), h('div.banner-line'));
  app.ui.append(el);
  await wait(ms);
  el.classList.add('leaving');
  setTimeout(() => el.remove(), 500);
}

export function toast(text: string) {
  const el = h('div.toast', text);
  app.ui.append(el);
  setTimeout(() => el.classList.add('leaving'), 1600);
  setTimeout(() => el.remove(), 2100);
}

/** Button that asks for a second click (showing `armed`) before running onClick, when needsConfirm() is true. */
export function confirmBtn(label: string, armed: string, onClick: () => void, cls = '', needsConfirm = () => true): HTMLElement {
  const b = btn(label, () => {
    if (b.classList.contains('armed') || !needsConfirm()) return onClick();
    b.classList.add('armed');
    b.textContent = armed;
    setTimeout(() => { b.classList.remove('armed'); b.textContent = label; }, 3000);
  }, cls);
  return b;
}

/** Button with hover/click sounds. */
export function btn(label: string | HTMLElement, onClick: () => void, cls = ''): HTMLElement {
  const b = h('button.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), label);
  b.addEventListener('pointerenter', () => app.audio.sfx('hover'));
  b.addEventListener('click', () => { if (b.hasAttribute('disabled')) return; app.audio.sfx('click'); onClick(); });
  return b;
}
