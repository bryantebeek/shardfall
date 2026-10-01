// Story screens: dialogue scenes over the stage, chapter cards, Memories, and the chapter's end.
import { getSprite, portraitUrl } from '../art';
import { MEMORIES, type Line, type Memory, type Scene, type Speaker, type Story } from '../game/chapter1';
import type { HeroId, SpriteId } from '../game/types';
import { app, btn, mount } from './app';
import { h } from './dom';

const faces = new Map<SpriteId, string>();
/** people without a portrait use their sprite's first frame, or its top `h` pixels */
const spriteFace = (id: SpriteId, h?: number) => () => {
  if (!faces.has(id)) {
    const s = getSprite(id), c = document.createElement('canvas');
    c.width = s.w; c.height = h ?? s.h;
    c.getContext('2d')!.drawImage(s.canvas, 0, 0, s.w, c.height, 0, 0, s.w, c.height);
    faces.set(id, c.toDataURL());
  }
  return faces.get(id)!;
};
const hero = (id: HeroId) => () => portraitUrl(id);
const SPEAKERS: Record<Speaker, { name: string; face?: () => string }> = {
  aldric: { name: 'Aldric', face: hero('knight') },
  lyra: { name: 'Lyra', face: hero('bmage') },
  seren: { name: 'Seren', face: hero('wmage') },
  ashen: { name: 'The Ashen Knight', face: spriteFace('ashknight') },
  caravan: { name: 'Caravan master' },
  stranger: { name: 'The knight' },
  nell: { name: 'Nell', face: spriteFace('nell', 34) },
};

/** A dialogue box over the stage. `say` plays lines (click, Enter or Space advances; Skip jumps past them);
 *  `choose` shows choices under the last line. */
export function talk(opts: { cinematic?: boolean; title?: string; top?: HTMLElement } = {}) {
  const face = h('img.dlg-face'), name = h('div.dlg-name'), text = h('p.dlg-text'), choices = h('div.dlg-choices');
  const box = h('div.dlg' + (opts.cinematic ? '.cinematic' : '.window'), face, h('div.dlg-body', name, text, choices));
  let wake: (() => void) | null = null, skipped = false;
  const advance = () => { const w = wake; wake = null; w?.(); };
  const btns = h('div.dlg-btns', btn('Next', advance, 'dlg-next'), btn('Skip', () => { skipped = true; advance(); }, 'dlg-skip'));
  const root = mount(h('div.story-screen' + (opts.cinematic ? '.cinematic' : ''),
    opts.top ?? '', opts.title ? h('div.place-title', opts.title) : '', box, btns));
  root.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('button')) advance(); });
  const key = (e: KeyboardEvent) => {
    if (document.querySelector('.modal-back')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
  };
  document.addEventListener('keydown', key);
  const show = (l: Line) => {
    const sp = l.who ? SPEAKERS[l.who] : null;
    if (l.cast) app.stage.setUnits(l.cast);
    if (l.fx === 'flash') app.stage.flash('#ffffff');
    if (l.fx === 'shake') app.stage.shake(0.6);
    box.classList.toggle('narration', !sp);
    name.textContent = sp?.name ?? '';
    face.style.display = sp?.face ? '' : 'none';
    if (sp?.face) (face as HTMLImageElement).src = sp.face();
    text.textContent = sp && opts.cinematic ? `“${l.text}”` : l.text;
    text.classList.remove('in'); void text.offsetWidth; text.classList.add('in');
    app.audio.sfx('click');
  };
  return {
    async say(lines: Line[]) {
      skipped = false;
      btns.style.visibility = '';
      for (const l of lines) {
        if (skipped) break;
        show(l);
        await new Promise<void>(r => { wake = r; });
      }
    },
    choose<T extends { label: string; desc: string }>(list: T[]): Promise<T> {
      btns.style.visibility = 'hidden';
      return new Promise(resolve => choices.replaceChildren(...list.map(o =>
        btn(h('span.dlg-opt', h('b', o.label), h('span', o.desc)), () => {
          choices.replaceChildren();
          app.audio.sfx('select');
          resolve(o);
        }, 'dlg-choice'))));
    },
    close() { document.removeEventListener('keydown', key); },
  };
}

export async function scene(s: Scene): Promise<void> {
  app.stage.setMode(s.cinematic ? 'title' : 'battle', s.theme, s.set);
  app.stage.setUnits([]);
  app.stage.setUnits(s.cast);
  app.audio.music(s.theme === 'dusk' ? 'elite' : 'inn');
  const t = talk({ cinematic: s.cinematic });
  await t.say(s.lines);
  t.close();
}

/** a title card between scenes */
export function chapterCard(kicker: string, title: string, sub = ''): Promise<void> {
  app.stage.setMode('title', 'ruins', 'village');
  app.stage.setUnits([]);
  return new Promise(resolve => {
    const root = mount(h('div.chapter-card',
      h('div.chapter-kicker', kicker), h('h1.chapter-title', title), sub ? h('p.chapter-sub', sub) : '',
      btn('Continue', () => resolve(), 'big-btn chapter-go')));
    root.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('button')) resolve(); });
  });
}

/** Seren's Hourglass gives something back */
export function memoryCard(m: Memory): Promise<void> {
  app.audio.sfx('chime');
  return new Promise(resolve => {
    mount(h('div.memory-screen',
      h('div.window.memory-card',
        h('div.memory-kicker', `A Memory · ${m.kind}`),
        h('p.memory-text', m.text),
        h('p.memory-use', m.use),
        btn('Remember it', () => resolve(), 'big-btn'))));
  });
}

export function chapterComplete(story: Story): Promise<void> {
  app.stage.setMode('title', 'dusk', 'hill');
  app.stage.setUnits([]);
  app.audio.music('title');
  return new Promise(resolve => {
    mount(h('div.chapter-card.complete',
      h('div.chapter-kicker', 'Chapter 1 complete'),
      h('h1.chapter-title', 'Emberfall'),
      h('div.window.chapter-stats',
        h('div.stat-row', h('span', 'Attempts'), h('b', String(story.attempt))),
        h('div.stat-row', h('span', 'Memories'), h('b', `${story.memories.length} of ${MEMORIES.length}`)),
        ...MEMORIES.map(m => h('div.chapter-memory' + (story.memories.includes(m.id) ? '.got' : ''),
          h('span.chapter-memory-kind', m.kind), story.memories.includes(m.id) ? m.text : '…'))),
      h('p.chapter-sub', 'Next: Chapter 2 — The Road of Lanterns'),
      btn('Return to Title', () => resolve(), 'big-btn')));
  });
}

/** the Memories the party carries (map screen) */
export function memoriesPanel(story: Story): HTMLElement {
  return h('div.map-memories',
    h('div.legend-title', 'Memories'),
    story.memories.length
      ? story.memories.map(id => { const m = MEMORIES.find(x => x.id === id)!; return h('div.map-memory', { 'data-tip': `<b>${m.kind}</b><br>${m.use}` }, h('span.chapter-memory-kind', m.kind), m.text); })
      : h('div.map-memory.none', 'Nothing yet.'),
    h('div.map-dawn', `Attempt ${story.attempt}`));
}
