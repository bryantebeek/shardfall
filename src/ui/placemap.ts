// The chapter map: Emberfall as a place, not a ladder. Roads between real locations (a new map every attempt),
// fog over what the party hasn't seen, and the places their Memories point to.
import { portraitUrl, uiIconUrl, type UiIcon } from '../art';
import { exits, here, revealed, storySet, storyTheme, type Place, type PlaceKind, type Road } from '../game/chapter1';
import { Rng } from '../game/rng';
import type { Run } from '../game/run';
import { app, mount } from './app';
import { h, img } from './dom';
import { topBar } from './hud';
import { memoriesPanel } from './story';

const W = 1320, H = 900;
const NS = 'http://www.w3.org/2000/svg';
function s(tag: string, attrs: Record<string, string | number> = {}, ...kids: SVGElement[]): SVGElement {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
}

const ICON: Record<PlaceKind, UiIcon> = { start: 'crystal', crossroads: 'map', event: 'event', shop: 'shop', inn: 'inn', elite: 'elite', treasure: 'treasure', boss: 'sword' };
const KIND: Record<PlaceKind, string> = { start: 'Start', crossroads: 'Crossroads', event: 'Something to find', shop: 'Market', inn: 'Rest', elite: 'Elite fight', treasure: 'Treasure', boss: 'The end of the road' };

/** a road bends a little, always the same way */
function curve(places: Place[], r: Road) {
  const a = places[r.from], b = places[r.to];
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const bend = ((r.from * 7 + r.to * 13) % 2 ? 1 : -1) * len * 0.12;
  const cx = (a.x + b.x) / 2 - (dy / len) * bend, cy = (a.y + b.y) / 2 + (dx / len) * bend;
  return { d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`, mid: { x: (a.x + 2 * cx + b.x) / 4, y: (a.y + 2 * cy + b.y) / 4 } };
}

/** the land around this attempt's places: houses by the village's, trees by the forest's, a river under the bridge, the hill */
function terrain(run: Run): SVGElement {
  const places = run.places!, r = new Rng(run.seed), g = s('g');
  const near = (x: number, y: number, d: number) => places.some(p => Math.hypot(p.x - x, p.y - y) < d);
  const around = (p: Place, n: number, f: (x: number, y: number) => void) => {
    for (let k = 0; k < n; k++) {
      const a = r.next() * Math.PI * 2, d = 55 + r.next() * 60, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.7;
      if (!near(x, y, 48)) f(x, y);
    }
  };
  const tree = (x: number, y: number) => {
    const sc = 0.8 + r.next() * 0.6;
    g.append(s('polygon', { points: `${x},${y - 20 * sc} ${x - 12 * sc},${y + 6 * sc} ${x + 12 * sc},${y + 6 * sc}`, fill: r.next() < 0.5 ? '#1c3a2c' : '#21442f', stroke: '#2e5a40', 'stroke-width': 1 }));
  };
  const house = (x: number, y: number) => {
    const w = 22 + r.next() * 12, hh = 14 + r.next() * 6;
    g.append(s('rect', { x: x - w / 2, y: y - hh / 2, width: w, height: hh, fill: '#3a2e2a', stroke: '#1a1412' }),
      s('polygon', { points: `${x - w / 2 - 3},${y - hh / 2} ${x},${y - hh / 2 - 10} ${x + w / 2 + 3},${y - hh / 2}`, fill: '#6a3e30', stroke: '#1a1412' }));
    if (r.next() < 0.45) g.append(s('rect', { x: x - 3, y: y - 3, width: 5, height: 5, fill: '#ffcf7a', opacity: 0.85 }));
  };
  g.append(s('defs', {}, s('radialGradient', { id: 'pm-ground', cx: '50%', cy: '55%', r: '75%' },
    s('stop', { offset: '0', 'stop-color': '#2e2838' }), s('stop', { offset: '1', 'stop-color': '#110f18' }))));
  g.append(s('rect', { width: W, height: H, fill: 'url(#pm-ground)' }));
  // fields on the village side
  for (let k = 0; k < 5; k++) {
    const w = 140 + r.next() * 120, hh = 80 + r.next() * 40, x = 40 + r.next() * (W - w - 80), y = 560 + r.next() * 260;
    if (near(x + w / 2, y + hh / 2, 110)) continue;
    const f = s('g', { transform: `rotate(${r.range(-14, 14)} ${x + w / 2} ${y + hh / 2})` }, s('rect', { x, y, width: w, height: hh, rx: 6, fill: '#2a2a22', stroke: '#3a3a2c' }));
    for (let l = 1; l < 6; l++) f.append(s('line', { x1: x + 6, y1: y + (hh / 6) * l, x2: x + w - 6, y2: y + (hh / 6) * l, stroke: '#3c3c2e', 'stroke-width': 2 }));
    g.append(f);
  }
  // woods on the far side
  for (let k = 0; k < 110; k++) {
    const x = r.next() * W, y = 150 + r.next() * 330;
    if (!near(x, y, 60)) tree(x, y);
  }
  // the river, under the north bridge
  const br = places.find(p => p.event === 'bridge');
  if (br) {
    const river = `M -20 ${br.y + 150} C ${br.x - 260} ${br.y + 90}, ${br.x - 110} ${br.y + 30}, ${br.x} ${br.y} S ${br.x + 380} ${br.y - 120}, ${W + 20} ${br.y - 60}`;
    g.append(s('path', { d: river, fill: 'none', stroke: '#16304a', 'stroke-width': 50, 'stroke-linecap': 'round' }),
      s('path', { d: river, fill: 'none', stroke: '#2a5a80', 'stroke-width': 30, 'stroke-linecap': 'round' }),
      s('path', { d: river, fill: 'none', stroke: '#7ab8e0', 'stroke-width': 2, 'stroke-dasharray': '14 18', opacity: 0.45 }));
  }
  for (const p of places) {
    if (p.set === 'village') around(p, 7, house);
    else if (p.set === 'forest') around(p, 12, tree);
    else if (p.set === 'shrine') around(p, 4, (x, y) => g.append(s('rect', { x: x - 4, y: y - 14, width: 8, height: 18, rx: 2, fill: '#4a4658', stroke: '#1a1822' })));
    else if (p.set === 'hill') for (const [rx, ry, o] of [[270, 100, 0.25], [195, 72, 0.3], [125, 46, 0.35]]) g.append(s('ellipse', { cx: p.x, cy: p.y + 20, rx, ry, fill: '#241e2e', 'fill-opacity': 0.5, stroke: '#7a6a8a', 'stroke-opacity': o, 'stroke-width': 2 }));
  }
  return g;
}

export function placeMapScreen(run: Run): Promise<number> {
  app.stage.setMode('map', storyTheme(run), storySet(run));
  app.stage.setUnits([]);
  app.audio.music('map');
  const story = run.story!;
  const at = here(run);
  const options = exits(run);
  const open = new Set(options.map(o => o.to.id));
  const seen = new Set([...run.path, ...open]);
  const known = new Set(revealed(run).map(p => p.id));
  const shown = (id: number) => seen.has(id) || known.has(id);
  const PLACES = run.places!, ROADS = run.roads!;
  const walked = (r: Road) => run.path.some((id, i) => i > 0 && ((run.path[i - 1] === r.from && id === r.to) || (run.path[i - 1] === r.to && id === r.from)));
  const pt = (id: number) => PLACES[id];

  return new Promise(resolve => {
    const map = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pmap-svg' }, terrain(run));
    // roads (they fade into the fog where the party hasn't been)
    for (const r of ROADS) {
      if (!shown(r.from) && !shown(r.to)) continue;
      const c = curve(PLACES, r);
      const isOpen = options.some(o => o.road === r);
      map.append(s('path', { d: c.d, class: 'pm-road-case' }), s('path', { d: c.d, class: 'pm-road' + (walked(r) ? ' walked' : isOpen ? ' open' : '') }));
    }
    // fog: soft holes where the party can see now, fainter ones where it remembers
    const holes = s('g', { filter: 'url(#pm-blur)' });
    for (const p of PLACES) if (shown(p.id)) holes.append(s('circle', { cx: p.x, cy: p.y, r: seen.has(p.id) ? 170 : 130, fill: seen.has(p.id) ? '#000' : '#6a6a6a' }));
    map.append(s('defs', {}, s('filter', { id: 'pm-blur', x: '-20%', y: '-20%', width: '140%', height: '140%' }, s('feGaussianBlur', { stdDeviation: 42 })),
      s('mask', { id: 'pm-fog' }, s('rect', { width: W, height: H, fill: '#fff' }), holes)));
    map.append(s('rect', { width: W, height: H, class: 'pm-fog', mask: 'url(#pm-fog)' }));

    const layer = h('div.pmap-layer');
    // ambushes waiting on roads not yet walked
    for (const r of ROADS) {
      if (!r.ambush || walked(r) || !shown(r.from) || !(open.has(r.to) || shown(r.to))) continue;
      const m = curve(PLACES, r).mid;
      layer.append(h('div.pmap-ambush', { style: `left:${m.x}px; top:${m.y}px`, 'data-tip': `<b>${r.ambush}</b><br>A fight on this road.` }, img(uiIconUrl('battle'))));
    }
    // the places
    const token = h('div.pmap-party', ...run.heroes.map(hr => img(portraitUrl(hr.id))));
    const place = (x: number, y: number) => { token.style.transform = `translate(${x + 42}px, ${y}px) translate(0, -50%)`; }; // beside the place, clear of the roads
    place(pt(at).x, pt(at).y);
    for (const p of PLACES) {
      if (!shown(p.id)) continue;
      const opt = options.find(o => o.to.id === p.id);
      const cls = ['map-node', `t-${p.kind}`, opt ? 'avail' : '', run.path.includes(p.id) ? 'visited' : '', p.id === at ? 'current' : '', seen.has(p.id) ? '' : 'remembered'].filter(Boolean).join('.');
      const road = opt && !opt.back && opt.road.ambush ? `<br><i>On the way: ${opt.road.ambush}.</i>` : opt?.back ? '<br><i>Back the way you came.</i>' : '';
      const el = h('div.' + cls, { style: `left:${p.x}px; top:${p.y}px`, 'data-tip': `<b>${p.name}</b><br>${KIND[p.kind]}. ${p.text}${road}` },
        h('div.map-node-ring'), img(uiIconUrl(ICON[p.kind])), h('div.map-node-label', p.name));
      if (opt) el.addEventListener('click', () => {
        if (layer.classList.contains('moving')) return;
        layer.classList.add('moving');
        app.audio.sfx('map');
        place(p.x, p.y);
        setTimeout(() => resolve(p.id), 750);
      });
      el.addEventListener('pointerenter', () => opt && app.audio.sfx('hover'));
      layer.append(el);
    }
    layer.append(token);

    mount(h('div.pmap-screen',
      topBar(run),
      h('div.map-title', h('div.map-title-name', 'Emberfall'), h('div.map-title-sub', 'Get Seren and the Hourglass out alive')),
      memoriesPanel(story),
      h('div.pmap-key',
        h('div', h('span.pmap-key-road'), 'Your route'),
        h('div', img(uiIconUrl('battle')), 'A fight on the road'),
      ),
      h('div.pmap-frame', map as unknown as HTMLElement, layer)));
  });
}
