// Story screens: dialogue scenes over the stage, chapter cards, Memories, and the chapter's end.
import { getSprite, portraitUrl } from '../art';
import { MEMORIES, type Memory, type Scene, type Speaker, type Story } from '../game/chapter1';
import type { HeroId } from '../game/types';
import { app, btn, mount } from './app';
import { h } from './dom';

let ashFace = '';
/** the Ashen Knight has no portrait: use his sprite */
function ashenFace(): string {
  if (!ashFace) {
    const s = getSprite('ashknight'), c = document.createElement('canvas');
    c.width = s.w; c.height = s.h;
    c.getContext('2d')!.drawImage(s.canvas, 0, 0, s.w, s.h, 0, 0, s.w, s.h);
    ashFace = c.toDataURL();
  }
  return ashFace;
}
const hero = (id: HeroId) => () => portraitUrl(id);
const SPEAKERS: Record<Speaker, { name: string; face?: () => string }> = {
  aldric: { name: 'Aldric', face: hero('knight') },
  lyra: { name: 'Lyra', face: hero('bmage') },
  seren: { name: 'Seren', face: hero('wmage') },
  ashen: { name: 'The Ashen Knight', face: ashenFace },
  caravan: { name: 'Caravan master' },
  stranger: { name: 'The knight' },
};

/** Click, Enter or Space advances; Skip jumps to the end. */
export function scene(s: Scene): Promise<void> {
  app.stage.setMode(s.cinematic ? 'title' : 'battle', s.theme);
  app.stage.setUnits([]);
  app.stage.setUnits(s.cast);
  app.audio.music(s.theme === 'dusk' ? 'elite' : 'inn');
  return new Promise(resolve => {
    let i = -1;
    const face = h('img.dlg-face'), name = h('div.dlg-name'), text = h('p.dlg-text');
    const box = h('div.dlg' + (s.cinematic ? '.cinematic' : '.window'), face, h('div.dlg-body', name, text));
    const next = btn('Next', () => advance(), 'dlg-next');
    const root = mount(h('div.story-screen' + (s.cinematic ? '.cinematic' : ''), box,
      h('div.dlg-btns', next, btn('Skip', () => done(), 'dlg-skip'))));
    root.addEventListener('click', e => { if (!(e.target as HTMLElement).closest('button')) advance(); });
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-back')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); }
    };
    document.addEventListener('keydown', key);
    function advance() {
      if (++i >= s.lines.length) return done();
      const l = s.lines[i], sp = l.who ? SPEAKERS[l.who] : null;
      if (l.cast) app.stage.setUnits(l.cast);
      if (l.fx === 'flash') app.stage.flash('#ffffff');
      if (l.fx === 'shake') app.stage.shake(0.6);
      box.classList.toggle('narration', !sp);
      name.textContent = sp?.name ?? '';
      face.style.display = sp?.face ? '' : 'none';
      if (sp?.face) (face as HTMLImageElement).src = sp.face();
      text.textContent = sp && s.cinematic ? `“${l.text}”` : l.text;
      text.classList.remove('in'); void text.offsetWidth; text.classList.add('in');
      app.audio.sfx('click');
    }
    function done() {
      document.removeEventListener('keydown', key);
      resolve();
    }
    advance();
  });
}

/** a title card between scenes */
export function chapterCard(kicker: string, title: string, sub = ''): Promise<void> {
  app.stage.setMode('title', 'ruins');
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
  app.stage.setMode('title', 'dusk');
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
