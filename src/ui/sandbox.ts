// Development sandbox (title screen → Development): play any card on any set against the Training Dummy, or any enemy.
import { CARDS } from '../game/cards';
import { ENEMIES } from '../game/enemies';
import { HEROES } from '../game/heroes';
import { newRun } from '../game/run';
import { HERO_IDS, type HeroId, type Rarity } from '../game/types';
import type { StageSet } from '../render/api';
import { app, btn } from './app';
import { battleScreen, type SandboxCtl } from './battle';
import { cardTextHtml } from './card';
import { h } from './dom';

type Theme = 'ruins' | 'depths' | 'boss' | 'dusk';
const SETS: StageSet[] = ['shrine', 'village', 'forest', 'bridge', 'hill'];
const THEMES: Theme[] = ['ruins', 'dusk', 'depths', 'boss'];
const RARITY: Rarity[] = ['starter', 'common', 'uncommon', 'rare', 'special'];

/** survives the battle restarting (a new opponent, a win or a loss) */
const st = { open: true, enemy: 'dummy', set: 'village' as StageSet, theme: 'ruins' as Theme, hero: null as HeroId | null, sort: 'rarity' as 'rarity' | 'name' };

/** Resolves when the player goes Back. */
export async function sandbox() {
  let back = false;
  while (!back) {
    const run = newRun();
    run.deck = [];
    run.stats.cardsPlayed = 1; // no first-battle hint
    await battleScreen(run, 'battle', [st.enemy], {
      set: st.set, theme: st.theme,
      sandbox: ctl => panel(ctl, () => { back = true; ctl.exit(); }),
    });
  }
}

/** a row of toggle chips */
function chips<T>(opts: [T, string][], cur: T, pick: (v: T) => void): HTMLElement {
  const row = h('div.dev-row');
  for (const [v, label] of opts) {
    const b = btn(label, () => { row.querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); pick(v); }, 'dev-chip' + (v === cur ? ' on' : ''));
    row.append(b);
  }
  return row;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function panel(ctl: SandboxCtl, back: () => void): HTMLElement {
  const setStage = () => app.stage.setMode('battle', st.theme, st.set);

  const foe = h('select.dev-select') as HTMLSelectElement;
  foe.append(...Object.values(ENEMIES).sort((a, b) => a.name.localeCompare(b.name))
    .map(d => h('option', { value: d.id }, `${d.name} (${d.id}, ${d.tier})`)));
  foe.value = st.enemy;
  foe.addEventListener('change', () => { st.enemy = foe.value; ctl.exit(); });

  const list = h('div.dev-cards');
  const renderList = () => list.replaceChildren(...Object.values(CARDS)
    .filter(d => !st.hero || d.hero === st.hero)
    .sort((a, b) => (st.sort === 'rarity' ? RARITY.indexOf(a.rarity) - RARITY.indexOf(b.rarity) : 0) || a.name.localeCompare(b.name))
    .map(d => {
      const tip = [false, true].map(upgraded => `<b>${d.name}${upgraded ? '+' : ''}</b><br>${cardTextHtml({ uid: '', id: d.id, upgraded })}`).join('<br>');
      const cost = d.costUp !== undefined ? `${d.cost}→${d.costUp}` : String(d.cost);
      const row = btn(h('span', d.name), () => ctl.give(d.id), `dev-card rarity-${d.rarity}`);
      row.dataset.tip = tip;
      row.style.borderLeftColor = d.hero ? HEROES[d.hero].color : '#888';
      row.append(h('span.dev-meta', `${d.rarity} · ${cost}`));
      return row;
    }));
  renderList();

  const toggle = btn(st.open ? 'Hide' : 'Show', () => {
    st.open = !st.open;
    el.classList.toggle('collapsed', !st.open);
    toggle.textContent = st.open ? 'Hide' : 'Show';
  }, 'dev-chip dev-toggle');
  const el = h('div.dev-panel' + (st.open ? '' : '.collapsed'),
    h('div.dev-head', h('b', 'Development'), h('div.dev-row', toggle, btn('Back', back, 'dev-chip'))),
    h('label', 'Set'), chips(SETS.map(s => [s, cap(s)]), st.set, v => { st.set = v; setStage(); }),
    h('label', 'Lighting'), chips(THEMES.map(t => [t, cap(t)]), st.theme, v => { st.theme = v; setStage(); }),
    h('label', 'Opponent'), foe,
    h('div.dev-row', btn('Reset', () => ctl.reset(), 'dev-chip'), btn('Clear hand', () => ctl.clearHand(), 'dev-chip'),
      ...HERO_IDS.map(id => btn(`KO ${HEROES[id].name}`, () => ctl.ko(id), 'dev-chip'))),
    h('label', 'Cards · click to deal it and its upgrade'),
    chips<HeroId | null>([[null, 'All'], ...HERO_IDS.map(id => [id, HEROES[id].job] as [HeroId, string])], st.hero, v => { st.hero = v; renderList(); }),
    chips<'rarity' | 'name'>([['rarity', 'Rarity'], ['name', 'A–Z']], st.sort, v => { st.sort = v; renderList(); }),
    list,
  );
  return el;
}
