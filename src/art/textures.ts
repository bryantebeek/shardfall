// Seamless 32x32 pixel textures for the 3D diorama (NearestFilter + RepeatWrapping).
// All drawing wraps at the edges (Pix.wrap / toroidal distances), so tiles are seamless by construction.
import { Pix, rng, bayer } from './icons';

export type TextureId = 'stone' | 'stoneTop' | 'brick' | 'moss' | 'dirt' | 'grass' | 'crystal' | 'wood' | 'rune' | 'water';

const N = 32;

// Hue-shifted ramps tuned for lit 3D surfaces (mid values, not too contrasty).
const STONE = ['#1c1d2b', '#2a2d40', '#3a3f55', '#4d546b', '#636b82', '#7d8699', '#9ea6b6', '#c3c9d3'];
const SLAB = ['#1d1c28', '#2c2b3b', '#3d3d50', '#525468', '#6a6d80', '#868a9a', '#a8abb7'];
const MASON = ['#1f1a22', '#302830', '#453a40', '#5c4f52', '#766866', '#92847c', '#b2a598'];
const MOSS = ['#0f2419', '#18381f', '#255126', '#3a6d2c', '#5a8a34', '#84a845', '#b3c969'];
const DIRT = ['#1f1210', '#3a2218', '#553221', '#6e442a', '#875836', '#a06f45', '#bf9163'];
const GRASS = ['#0d2418', '#153520', '#1f4a26', '#2d622c', '#447d32', '#63983c', '#8cb54c', '#bcd66a'];
const CRYS = ['#1a1040', '#2e1c6a', '#4a2f9a', '#4f59c8', '#3f8ee0', '#4cc6ec', '#8ef0f4', '#e6fffe'];
const WOOD = ['#1e100e', '#351c14', '#4e2b1a', '#6a3d22', '#86512c', '#a26a3a', '#c08a52'];
const RUNE = ['#0e3a4e', '#1a6f8a', '#34b4cc', '#7ff0f4', '#e8ffff'];
const WATER = ['#06141c', '#0a2029', '#0e2d36', '#123b43', '#1a4d52', '#2a6668', '#4e9290', '#9fd8cc'];

const wrap = (v: number) => ((v % N) + N) % N;
const wd = (a: number, b: number) => { const d = Math.abs(a - b) % N; return Math.min(d, N - d); };

/** Tileable value noise (lattice period divides N). */
function noise(seed: number, cell: number): (x: number, y: number) => number {
  const r = rng(seed), g = N / cell, v: number[] = [];
  for (let i = 0; i < g * g; i++) v.push(r());
  const at = (i: number, j: number) => v[(((j % g) + g) % g) * g + (((i % g) + g) % g)];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), tx = s(fx - i), ty = s(fy - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/** Wrapped Voronoi with a jittered grid of sites. Returns cell ids; -1 = mortar gap. */
function voronoi(seed: number, grid: number, gap: number, sx = 1, sy = 1) {
  const r = rng(seed), pts: [number, number][] = [], c = N / grid;
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) pts.push([(i + 0.15 + r() * 0.7) * c, (j + 0.15 + r() * 0.7) * c]);
  const id = new Int16Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9, k = 0;
    pts.forEach(([px, py], i) => {
      const d = Math.hypot(wd(x + 0.5, px) * sx, wd(y + 0.5, py) * sy);
      if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
    });
    id[y * N + x] = d2 - d1 < gap ? -1 : k;
  }
  return { id, pts };
}

/** Quantize v to a ramp index; dithering only in a narrow band around each step (no screen-door). */
const q = (v: number, x: number, y: number, n: number, d = 0.5) => Math.max(0, Math.min(n - 1, Math.floor(v + (bayer(x, y) - 0.5) * d + 0.5)));
const at = (id: Int16Array, x: number, y: number) => id[wrap(y) * N + wrap(x)];

/** Shade an id map as bevelled blocks lit from the top-left. */
function blocks(p: Pix, id: Int16Array, pal: string[], o: { seed: number; base: number; tone?: number; grout: [string, string]; amp?: number; bevel?: number }) {
  const r = rng(o.seed), tone: number[] = [];
  for (let i = 0; i < 64; i++) tone.push((r() - 0.5) * 2 * (o.tone ?? 0.7));
  const n = noise(o.seed + 7, 8), n2 = noise(o.seed + 9, 4), amp = o.amp ?? 1.1, bev = o.bevel ?? 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = id[y * N + x];
    if (k < 0) { p.px(x, y, at(id, x, y - 1) >= 0 ? o.grout[0] : o.grout[1]); continue; }
    let v = o.base + tone[k % 64] + (n(x, y) - 0.5) * amp + (n2(x, y) - 0.5) * amp * 0.6;
    if (at(id, x, y - 1) !== k) v += 1.4 * bev; else if (at(id, x, y - 2) !== k) v += 0.5 * bev;
    if (at(id, x - 1, y) !== k) v += 0.7 * bev;
    if (at(id, x, y + 1) !== k) v -= 1.3 * bev; else if (at(id, x, y + 2) !== k) v -= 0.4 * bev;
    if (at(id, x + 1, y) !== k) v -= 0.7 * bev;
    p.px(x, y, pal[q(v, x, y, pal.length)]);
  }
}

/** Random-walk crack: dark line with a lit lip beneath. */
function crack(p: Pix, r: () => number, x: number, y: number, len: number, dark: string, lip: string, isSolid: (x: number, y: number) => boolean) {
  let dx = r() < 0.5 ? 1 : -1;
  for (let i = 0; i < len; i++) {
    if (!isSolid(x, y)) break;
    p.px(x, y, dark);
    if (isSolid(x + 1, y)) p.px(x + 1, y, lip, 0.35);
    y += 1;
    if (r() < 0.6) x += dx;
    if (r() < 0.2) dx = -dx;
  }
}

function speck(p: Pix, r: () => number, n: number, c: string, ok: (x: number, y: number) => boolean, a = 1) {
  for (let i = 0; i < n; i++) { const x = Math.floor(r() * N), y = Math.floor(r() * N); if (ok(x, y)) p.px(x, y, c, a); }
}

// ------------------------------------------------------------------------------------------
function stone(seed = 11): { p: Pix; id: Int16Array } {
  const p = new Pix(N, N); p.wrap = true;
  const { id } = voronoi(seed, 3, 1.4, 1, 1.12);
  blocks(p, id, STONE, { seed, base: 3.4, tone: 0.8, grout: [STONE[0], STONE[1]] });
  const r = rng(seed + 1), solid = (x: number, y: number) => at(id, x, y) >= 0;
  crack(p, r, 6, 9, 5, STONE[1], STONE[5], solid);
  crack(p, r, 22, 20, 4, STONE[1], STONE[5], solid);
  speck(p, r, 14, STONE[6], (x, y) => solid(x, y) && solid(x, y - 1), 0.8);
  speck(p, r, 10, STONE[2], solid, 0.8);
  return { p, id };
}

function stoneTop(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const id = new Int16Array(N * N);
  const slabs = [[0, 0, 18, 14], [18, 0, 14, 10], [18, 10, 14, 13], [0, 14, 10, 18], [10, 14, 8, 11], [10, 25, 8, 7], [18, 23, 14, 9]];
  slabs.forEach(([x0, y0, w, h], k) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) id[y * N + x] = y === y0 || x === x0 ? -1 : k;
  });
  // chipped corners
  for (const [x, y] of [[1, 1], [17, 13], [19, 11], [31, 9], [9, 31], [11, 15], [17, 24]]) id[wrap(y) * N + wrap(x)] = -1;
  blocks(p, id, SLAB, { seed: 23, base: 3.3, tone: 0.55, grout: [SLAB[0], SLAB[1]], amp: 0.8 });
  const r = rng(5), solid = (x: number, y: number) => at(id, x, y) >= 0;
  crack(p, r, 6, 2, 8, SLAB[1], SLAB[5], solid);
  crack(p, r, 24, 12, 6, SLAB[1], SLAB[5], solid);
  crack(p, r, 4, 20, 5, SLAB[1], SLAB[5], solid);
  speck(p, r, 16, SLAB[5], solid, 0.7);
  speck(p, r, 10, SLAB[2], solid, 0.8);
  return p.canvas();
}

function brick(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const id = new Int16Array(N * N);
  const r = rng(31);
  let k = 0;
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 8 : 0, widths = row === 2 ? [10, 12, 10] : [16, 16];
    let x0 = off;
    for (const w of widths) {
      for (let y = row * 8; y < row * 8 + 8; y++) for (let x = x0; x < x0 + w; x++) id[y * N + wrap(x)] = y === row * 8 || x === x0 ? -1 : k;
      x0 += w; k++;
    }
  }
  // ruin: chipped corners + one broken block
  for (let i = 0; i < 7; i++) { const x = Math.floor(r() * N), y = Math.floor(r() * 4) * 8 + (r() < 0.5 ? 1 : 7); id[y * N + x] = -1; id[y * N + wrap(x + 1)] = -1; }
  const broken = new Set<number>();
  for (let y = 17; y < 23; y++) for (let x = 19; x < 25 - (y > 20 ? 2 : 0); x++) broken.add(y * N + x);
  blocks(p, id, MASON, { seed: 31, base: 3.3, tone: 0.9, grout: [MASON[0], MASON[1]] });
  for (const i of broken) { const x = i % N, y = (i / N) | 0; p.px(x, y, (x + y) % 3 ? MASON[1] : MASON[0]); if (!broken.has(i - N)) p.px(x, y, MASON[0]); }
  p.px(21, 21, MASON[4]).px(22, 21, MASON[3]).px(20, 20, MASON[3]);
  const solid = (x: number, y: number) => at(id, x, y) >= 0 && !broken.has(wrap(y) * N + wrap(x));
  crack(p, r, 5, 2, 6, MASON[1], MASON[5], solid);
  crack(p, r, 27, 26, 5, MASON[1], MASON[5], solid);
  speck(p, r, 12, MASON[5], solid, 0.7);
  // a little moss in the mortar
  for (const [x, y] of [[3, 16], [4, 16], [12, 8], [28, 24], [29, 24], [30, 24]]) p.px(x, y, MOSS[3]).px(x, y - 1, MOSS[2], 0.6);
  return p.canvas();
}

function moss(): HTMLCanvasElement {
  const { p, id } = stone(47);
  const n = noise(3, 16), n2 = noise(4, 8), n3 = noise(5, 4);
  const edge = (x: number, y: number) => (at(id, x, y) < 0 ? 0.26 : at(id, x, y - 1) < 0 || at(id, x, y - 2) < 0 ? 0.14 : 0);
  const cover = (x: number, y: number) => n(x, y) * 0.35 + n2(x, y) * 0.35 + n3(x, y) * 0.2 + edge(x, y);
  const m = p.mask();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (cover(x, y) > 0.5 + (bayer(x, y) - 0.5) * 0.08) m.set(x, y);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!m.has(x, y)) { if (m.has(x, y - 1)) p.px(x, y, STONE[1], 0.6); continue; }
    let v = 2.6 + (cover(x, y) - 0.5) * 6;
    if (!m.has(x, y - 1)) v += 1.2;
    if (!m.has(x, y + 1)) v -= 1;
    if (at(id, x, y) < 0) v -= 0.8;
    p.px(x, y, MOSS[q(v, x, y, MOSS.length)]);
  }
  const r = rng(9);
  speck(p, r, 22, MOSS[6], (x, y) => m.has(x, y) && m.has(x, y + 1), 0.9);
  speck(p, r, 6, '#d9e07a', (x, y) => m.has(x, y) && !m.has(x, y - 1));
  return p.canvas();
}

function dirt(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const n = noise(61, 16), n2 = noise(62, 8), n3 = noise(63, 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 1.4 + n(x, y) * 1.8 + n2(x, y) * 1.1 + n3(x, y) * 0.6;
    p.px(x, y, DIRT[q(v, x, y, 6, 0.7)]);
  }
  const r = rng(64);
  // pebbles
  const peb: [number, number, number, number][] = [[4, 5, 1, 1], [15, 3, 1, 0], [25, 8, 2, 1], [9, 18, 1, 1], [20, 21, 2, 1], [29, 27, 1, 0], [6, 27, 2, 1], [16, 29, 1, 0], [27, 16, 1, 0], [13, 11, 0, 0]];
  for (const [cx, cy, rx, ry] of peb) {
    const base = r() < 0.5 ? 0 : 1;
    const pal = base ? ['#3d3538', '#6b5e5c', '#8e8078', '#b5a898'] : ['#3a2a22', '#6a5040', '#937460', '#c0a080'];
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x / (rx + 0.5)) ** 2 + (y / (ry + 0.5)) ** 2 > 1) continue;
      const k = y < 0 || (y === 0 && x < 0 && ry === 0) ? 3 : y === ry && ry > 0 ? 1 : 2;
      p.px(cx + x, cy + y, pal[k - (x === rx && k > 1 ? 1 : 0)]);
    }
    for (let x = -rx; x <= rx; x++) p.px(cx + x, cy + ry + 1, DIRT[0], 0.7);
  }
  speck(p, r, 14, DIRT[1], () => true, 0.9);
  speck(p, r, 10, DIRT[5], () => true, 0.8);
  // a root / twig
  for (let i = 0; i < 6; i++) p.px(18 + i, 11 + (i > 2 ? 1 : 0), DIRT[1]).px(18 + i, 10 + (i > 2 ? 1 : 0), DIRT[5], 0.5);
  return p.canvas();
}

function grass(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const n = noise(71, 16), n2 = noise(72, 8);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) p.px(x, y, GRASS[q(1.6 + n(x, y) * 1.6 + n2(x, y) * 0.9, x, y, 5, 0.7)]);
  const r = rng(73);
  // tufts on a jittered 6x6 grid: dark root shadow, blades brightening toward the tips
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const cx = Math.floor(i * 5.33 + r() * 4 + (j % 2) * 2.6), cy = Math.floor(j * 5.33 + r() * 4);
    const lift = n(cx, cy) * 1.5;
    p.px(cx - 1, cy + 1, GRASS[0], 0.7).px(cx, cy + 1, GRASS[0], 0.9).px(cx + 1, cy + 1, GRASS[0], 0.7);
    const blades = 3 + Math.floor(r() * 2);
    for (let b = 0; b < blades; b++) {
      const bx = cx + b - Math.floor(blades / 2), h = 2 + Math.floor(r() * 2) + (b === 1 ? 1 : 0), lean = bx < cx ? -1 : bx > cx ? 1 : 0;
      for (let k = 0; k < h; k++) {
        const x = bx + (k === h - 1 && h > 2 ? lean : 0);
        p.px(x, cy - k, GRASS[Math.min(7, Math.round(2.6 + lift + (k / Math.max(1, h - 1)) * 2.4))]);
      }
    }
  }
  for (const [x, y, c] of [[7, 12, '#f4e7a0'], [23, 4, '#ffffff'], [27, 22, '#f4e7a0'], [12, 27, '#e8b8e8']] as [number, number, string][])
    p.px(x, y, c).px(x, y + 1, GRASS[1]);
  return p.canvas();
}

function crystal(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const { id, pts } = voronoi(83, 3, 0.0001, 1, 1);
  const r = rng(84);
  // each facet: a "normal" → base brightness + a slight in-facet gradient along its tilt
  const facet = pts.map(() => ({ b: 2 + r() * 4, gx: (r() - 0.5) * 0.25, gy: (r() - 0.5) * 0.25 - 0.08 }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = id[y * N + x], f = facet[k], [px, py] = pts[k];
    let dx = x + 0.5 - px, dy = y + 0.5 - py;
    if (dx > N / 2) dx -= N; if (dx < -N / 2) dx += N; if (dy > N / 2) dy -= N; if (dy < -N / 2) dy += N;
    let v = f.b + dx * f.gx + dy * f.gy;
    if (at(id, x, y - 1) !== k || at(id, x - 1, y) !== k) v = Math.max(v + 2, 6);
    else if (at(id, x, y + 1) !== k || at(id, x + 1, y) !== k) v = Math.min(v - 2, 1.5);
    p.px(x, y, CRYS[q(v, x, y, 8, 0.6)]);
  }
  // inner streaks + sparkles
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * N), y = Math.floor(r() * N);
    for (let j = 0; j < 4; j++) if (at(id, x + j, y - j) === at(id, x, y)) p.px(x + j, y - j, CRYS[6], 0.6);
  }
  for (const [x, y] of [[6, 7], [21, 3], [26, 19], [11, 24]]) p.px(x, y, CRYS[7]).px(x - 1, y, CRYS[6], 0.7).px(x + 1, y, CRYS[6], 0.7).px(x, y - 1, CRYS[6], 0.7).px(x, y + 1, CRYS[6], 0.7);
  return p.canvas();
}

function wood(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const r = rng(91), n = noise(92, 8);
  const seams = [11, 27, 4, 19];
  for (let plank = 0; plank < 4; plank++) {
    const y0 = plank * 8, tone = (r() - 0.5) * 0.9, ph = r() * 10, sx = seams[plank];
    for (let y = y0; y < y0 + 8; y++) for (let x = 0; x < N; x++) {
      const ly = y - y0;
      if (ly === 7) { p.px(x, y, WOOD[0]); continue; }
      const u = wrap(x - sx);
      if (u === 0) { p.px(x, y, WOOD[1]); continue; }
      const grain = Math.sin((ly + ph + Math.sin((u / N) * Math.PI * 2 * 2 + ph) * 1.3 + n(x, y) * 1.5) * 1.25);
      let v = 3.4 + tone + grain * 0.9;
      if (ly === 0) v += 1.1; else if (ly === 6) v -= 0.9;
      if (u === 1) v += 0.7; else if (u === N - 1) v -= 0.8;
      p.px(x, y, WOOD[Math.max(1, q(v, x, y, 7, 0.5))]);
    }
    // nails at plank ends
    for (const dx of [2, N - 2]) { const x = wrap(sx + dx); p.px(x, y0 + 3, WOOD[0]).px(x, y0 + 2, '#8a8e98').px(x, y0 + 4, WOOD[2]); }
  }
  // knots
  for (const [cx, cy] of [[20, 3], [7, 20], [26, 28]]) {
    p.px(cx, cy, WOOD[0]).px(cx + 1, cy, WOOD[1]).px(cx - 1, cy, WOOD[2]).px(cx, cy - 1, WOOD[5]).px(cx + 1, cy - 1, WOOD[4]).px(cx, cy + 1, WOOD[2]).px(cx - 1, cy + 1, WOOD[2]);
  }
  return p.canvas();
}

function rune(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const id = new Int16Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) id[y * N + x] = x === 0 || y === 0 ? -1 : 0;
  for (const [x, y] of [[1, 1], [31, 1], [1, 31], [31, 31]]) id[y * N + x] = -1;
  const DARK = ['#16161f', '#1f2030', '#292b3e', '#35394e', '#44495f', '#565c72', '#6c7289'];
  blocks(p, id, DARK, { seed: 101, base: 2.6, tone: 0, grout: [DARK[0], DARK[0]], amp: 0.9 });
  const c = 16.5;
  const d = (x: number, y: number) => Math.hypot(x + 0.5 - c, y + 0.5 - c);
  const line = p.mask();
  line.ring(c, c, 11.2, 12.3).ring(c, c, 7.6, 8.4);
  // triangle inscribed + centre diamond
  const tri: [number, number][] = [];
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3; tri.push([c - 0.5 + Math.cos(a) * 7.8, c - 0.5 + Math.sin(a) * 7.8]); }
  for (let k = 0; k < 3; k++) line.line(tri[k][0], tri[k][1], tri[(k + 1) % 3][0], tri[(k + 1) % 3][1]);
  line.poly(c, c - 2.5, c + 2, c, c, c + 2.5, c - 2, c);
  // rune glyphs between the rings
  const glyphs = [['x.x', 'xxx', '.x.'], ['xx.', '.x.', '.xx'], ['x..', 'xxx', '..x'], ['.x.', 'x.x', '.x.'], ['xxx', '.x.', 'x.x'], ['x.x', '.x.', 'x.x']];
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + Math.PI / 6 + (k * Math.PI) / 3;
    line.grid(glyphs[k], Math.round(c + Math.cos(a) * 9.9 - 1.5), Math.round(c + Math.sin(a) * 9.9 - 1.5));
  }
  // glow halo (dithered) then carved groove + bright core
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (line.has(x, y)) continue;
    let near = 0;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (line.has(x + i, y + j)) near = Math.max(near, 3 - Math.max(Math.abs(i), Math.abs(j)));
    if (near === 2) p.px(x, y, RUNE[1], 0.55);
    else if (near === 1 && bayer(x, y) < 0.5) p.px(x, y, RUNE[0], 0.5);
    else if (d(x, y) < 12.5 && bayer(x, y) < 0.12) p.px(x, y, RUNE[0], 0.35);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (line.has(x, y)) {
    const k = !line.has(x, y - 1) ? 3 : !line.has(x, y + 1) ? 2 : 3;
    p.px(x, y, RUNE[k]);
  }
  p.px(16, 16, RUNE[4]).px(15, 16, RUNE[4]);
  return p.canvas();
}

function water(): HTMLCanvasElement {
  const p = new Pix(N, N); p.wrap = true;
  const n = noise(111, 16), n2 = noise(112, 8);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const band = Math.sin(((y + n(x, y) * 6) / N) * Math.PI * 2 * 2) * 0.5 + 0.5;
    const v = 1.4 + band * 1.6 + n2(x, y) * 1.1;
    p.px(x, y, WATER[q(v, x, y, 6, 0.7)]);
  }
  // ripple highlights: short arcs with a dark trough underneath
  const r = rng(113);
  const rip: [number, number, number][] = [[3, 4, 6], [18, 7, 4], [26, 13, 5], [8, 15, 4], [14, 22, 6], [27, 26, 4], [2, 27, 3], [21, 30, 3]];
  for (const [x, y, len] of rip) {
    for (let i = 0; i < len; i++) {
      const edge = i === 0 || i === len - 1;
      p.px(x + i, y, edge ? WATER[5] : i === 1 ? WATER[7] : WATER[6]);
      if (!edge) p.px(x + i, y + 1, WATER[2], 0.8);
    }
  }
  speck(p, r, 6, WATER[7], () => true, 0.9);
  return p.canvas();
}

const DRAW: Record<TextureId, () => HTMLCanvasElement> = {
  stone: () => stone().p.canvas(), stoneTop, brick, moss, dirt, grass, crystal, wood, rune, water,
};
const cache = new Map<TextureId, HTMLCanvasElement>();
export function getTexture(id: TextureId): HTMLCanvasElement {
  let c = cache.get(id);
  if (!c) { c = DRAW[id](); cache.set(id, c); }
  return c;
}
