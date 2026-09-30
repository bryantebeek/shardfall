// Dev harness for the HD-2D stage. ?shot=battle|title|boss|fx|map|depths auto-stages a scene for headless screenshots.
import { createStage } from '../render/stage';
import type { StageUnit } from '../render/api';
import type { Element } from '../game/types';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const stage = createStage(canvas);
function fit() {
  const w = Math.min(innerWidth, innerHeight * 16 / 9), h = w * 9 / 16;
  stage.resize(Math.round(w), Math.round(h));
}
addEventListener('resize', fit); fit();

const party: StageUnit[] = [
  { id: 'knight', sprite: 'knight', side: 'hero' },
  { id: 'bmage', sprite: 'bmage', side: 'hero' },
  { id: 'wmage', sprite: 'wmage', side: 'hero' },
];
const E = (...s: StageUnit['sprite'][]): StageUnit[] => s.map((sprite, i) => ({ id: 'e' + i, sprite, side: 'enemy' }));
const sets: Record<string, StageUnit[]> = {
  trio: E('slime', 'goblin', 'bat'), ogre: E('ogre'), boss: E('wyrm'), skel: E('skeleton', 'wisp'), sprout: E('sprout', 'paladin'),
};
const ids = () => ['knight', 'bmage', 'wmage', 'e0', 'e1', 'e2'];
let tgt = 'e0';
const dev = stage as unknown as { __step(dt: number): void; __render(): void };
/** headless: advance the simulation deterministically (rAF barely ticks under virtual time) */
async function sim(sec: number) {
  for (let i = 0; i < Math.round(sec * 60); i++) { dev.__step(1 / 60); await Promise.resolve(); await Promise.resolve(); }
  dev.__render();
}

const ui = document.getElementById('ui')!;
const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; ui.appendChild(b); };
btn('title', () => stage.setMode('title', 'ruins'));
btn('map', () => stage.setMode('map'));
btn('battle', () => stage.setMode('battle'));
for (const t of ['ruins', 'depths', 'boss'] as const) btn(t, () => stage.setMode('battle', t));
for (const k of Object.keys(sets)) btn('vs ' + k, () => { stage.setUnits([...party, ...sets[k]]); stage.setMode('battle', k === 'boss' ? 'boss' : undefined); });
btn('target→', () => { const l = ids(); tgt = l[(l.indexOf(tgt) + 1) % l.length]; stage.setTargeted(tgt); });
btn('active knight', () => stage.setActive('knight'));
btn('attack', () => stage.attack('knight', tgt).then(() => stage.hit(tgt, 'phys')));
btn('enemy atk', () => stage.attack('e0', 'knight').then(() => stage.hit('knight', 'phys', true)));
for (const k of ['fire', 'ice', 'thunder', 'holy', 'dark', 'phys'] as Element[]) btn(k, () => stage.cast('bmage', [tgt], k).then(() => stage.hit(tgt, k, k === 'thunder')));
btn('fire all', () => stage.cast('bmage', ['e0', 'e1', 'e2'], 'fire').then(() => ['e0', 'e1', 'e2'].forEach((i) => stage.hit(i, 'fire'))));
for (const k of ['heal', 'buff', 'debuff', 'shield'] as const) btn(k, () => stage.cast('wmage', k === 'debuff' ? [tgt] : ['knight', 'bmage'], k));
btn('big hit', () => stage.hit(tgt, 'phys', true));
btn('shatter', () => stage.shatter(tgt));
btn('broken', () => stage.setBroken(tgt, true));
btn('unbroken', () => stage.setBroken(tgt, false));
btn('ko', () => stage.ko(tgt));
btn('ko knight', () => stage.ko('knight'));
btn('revive knight', () => stage.revive('knight'));
btn('limit', () => stage.limit('knight'));
btn('shake', () => stage.shake(0.6));
btn('flash', () => stage.flash('#ff5533'));
btn('dots', () => showDots = !showDots);

// anchor debug dots
let showDots = false;
const dots = new Map<string, HTMLDivElement>();
function tick() {
  requestAnimationFrame(tick);
  const r = canvas.getBoundingClientRect();
  for (const id of ids()) for (const a of ['head', 'center', 'feet'] as const) {
    const k = id + a;
    let d = dots.get(k);
    if (!d) { d = document.createElement('div'); d.className = 'dot'; d.style.background = a === 'head' ? '#f44' : a === 'center' ? '#ff4' : '#4f4'; document.body.appendChild(d); dots.set(k, d); }
    const p = stage.screenPos(id, a);
    d.style.display = showDots ? 'block' : 'none';
    d.style.left = r.left + p.x * r.width + 'px'; d.style.top = r.top + p.y * r.height + 'px';
  }
}
tick();

// ---------------------------------------------------------------- headless shots
const q = new URLSearchParams(location.search);
const shot = q.get('shot');
if (shot) {
  document.body.classList.add('shot');
  if (q.get('dots')) { document.body.classList.remove('shot'); ui.style.display = 'none'; showDots = true; }
  (async () => {
    const T0 = +(q.get('t0') ?? 0);
    if (shot === 'title') { stage.setMode('title', 'ruins'); await sim(T0 || 3); return; }
    if (shot === 'map') { stage.setMode('map', 'ruins'); await sim(3); return; }
    const theme = shot === 'boss' ? 'boss' : shot === 'depths' ? 'depths' : 'ruins';
    stage.setUnits([...party, ...(shot === 'boss' ? sets.boss : shot === 'ogre' ? sets.ogre : sets.trio)]);
    stage.setMode('battle', theme);
    await sim(3);
    if (q.get('log')) for (const id of ids()) console.log(id, JSON.stringify(stage.screenPos(id, 'head')), JSON.stringify(stage.screenPos(id, 'feet')));
    const fx = q.get('fx');
    if (shot === 'fx' || fx) {
      stage.setTargeted('e1'); stage.setActive('bmage');
      const k = fx ?? 'fire';
      if (k === 'all') {
        // smoke test: every contract method, then report
        const steps: [string, () => unknown][] = [
          ['attack', () => stage.attack('knight', 'e1')], ['enemyAttack', () => stage.attack('e0', 'bmage')], ['attackNull', () => stage.attack('wmage', null)],
          ...(['fire', 'ice', 'thunder', 'holy', 'dark', 'phys', 'heal', 'buff', 'debuff', 'shield'] as const).map((c) => [c, () => stage.cast('bmage', ['e0', 'e1'], c)] as [string, () => unknown]),
          ['hit', () => stage.hit('e0', 'ice', true)], ['heal', () => stage.heal('knight')], ['block', () => stage.block('knight')],
          ['buff', () => stage.buff('knight')], ['debuff', () => stage.debuff('e0')], ['shatter', () => stage.shatter('e0')],
          ['broken', () => stage.setBroken('e0', true)], ['target', () => stage.setTargeted('e2')], ['active', () => stage.setActive('knight')],
          ['limit', () => stage.limit('knight')], ['shake', () => stage.shake(0.5)], ['flash', () => stage.flash('#ff5533')],
          ['koHero', () => stage.ko('wmage')], ['revive', () => stage.revive('wmage')], ['koEnemy', () => stage.ko('e2')],
          ['unbroken', () => stage.setBroken('e0', false)], ['mode', () => stage.setMode('map', 'depths')], ['units', () => stage.setUnits(party)],
        ];
        for (const [name, fn] of steps) { let done = false; Promise.resolve(fn()).then(() => { done = true; }); await sim(1.6); console.log(done ? 'ok' : 'PENDING', name); }
        console.log('ALL DONE');
        return;
      }
      if (k === 'shatter') { stage.shatter('e1'); stage.setBroken('e1', true); }
      else if (k === 'limit') stage.limit('knight');
      else if (k === 'ko') { stage.ko('knight'); stage.ko('e1'); }
      else if (k === 'attack') stage.attack('knight', 'e1');
      else if (['heal', 'buff', 'debuff', 'shield'].includes(k)) stage.cast('wmage', ['knight', 'bmage'], k as 'heal');
      else stage.cast('bmage', ['e0', 'e1', 'e2'], k as Element).then(() => ['e0', 'e1', 'e2'].forEach((i) => stage.hit(i, k as Element, true)));
      await sim(+(q.get('t') ?? 0.5));
    }
  })();
}

