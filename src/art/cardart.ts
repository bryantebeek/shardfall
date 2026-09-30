// 64x40 painted pixel card illustrations, returned as PNG data URLs (cached).
import type { CardArt } from '../game/types';
import { Pix, Mask, PAL, rng, bayer, darkOf, flame, star, kiteMask } from './icons';

const CW = 64, CH = 40;
type P = Pix;

// ============================================================================================
// Themes: sky gradient (top → horizon), glow colour, particle colour, vignette colour
// ============================================================================================
interface Theme { sky: string[]; glow: string; mote: string; dark: string }
const TH = {
  kRed: { sky: ['#0d0710', '#1f0b17', '#3a111d', '#5c1b22', '#7a2a24'], glow: '#ff7a4a', mote: '#ffb080', dark: '#07030a' },
  kSteel: { sky: ['#070a16', '#0f1628', '#1a2640', '#28395a', '#3a5074'], glow: '#9cc4ff', mote: '#cfe4ff', dark: '#04050c' },
  kGold: { sky: ['#140904', '#2e1608', '#5a2e0e', '#8c5216', '#c07c22'], glow: '#ffe79a', mote: '#fff4c8', dark: '#0a0402' },
  fire: { sky: ['#0e0508', '#26090c', '#4a1410', '#782614', '#a24418'], glow: '#ffb24a', mote: '#ffd080', dark: '#070204' },
  ice: { sky: ['#040a16', '#08182e', '#0f2c4c', '#18466c', '#26648a'], glow: '#aef4ff', mote: '#e0fcff', dark: '#02050c' },
  thunder: { sky: ['#07061a', '#110e2c', '#1e1844', '#2e2462', '#43347e'], glow: '#fff08a', mote: '#fff8c0', dark: '#03020c' },
  arcane: { sky: ['#08051a', '#140b2e', '#241448', '#381e66', '#4e2a84'], glow: '#c99aff', mote: '#e8d0ff', dark: '#04020c' },
  cata: { sky: ['#07030a', '#1a0612', '#3a0a1c', '#621424', '#8c2a22'], glow: '#ffc46a', mote: '#ffe0a0', dark: '#040106' },
  holy: { sky: ['#100a05', '#261a0a', '#463110', '#6e4e1a', '#9a7228'], glow: '#fff2b8', mote: '#fffbe0', dark: '#080502' },
  green: { sky: ['#040d0a', '#0a2016', '#123620', '#1e502c', '#2e6c38'], glow: '#d4ffb8', mote: '#eaffd8', dark: '#020604' },
  dawn: { sky: ['#0a0c1c', '#161d38', '#28345a', '#46547a', '#727c92'], glow: '#fff6dc', mote: '#ffffff', dark: '#04050c' },
  aqua: { sky: ['#030e14', '#082230', '#0e3a4a', '#185664', '#28767e'], glow: '#c8fff4', mote: '#e8fffc', dark: '#02060a' },
  grey: { sky: ['#0a0a0e', '#16161c', '#23232c', '#32323e', '#444452'], glow: '#b8b8c8', mote: '#d8d8e4', dark: '#050507' },
} satisfies Record<string, Theme>;

// ============================================================================================
// Background + lighting helpers
// ============================================================================================
/** Alpha quantized to 1/steps with ordered dithering: reads as crafted pixel glow, not blur. */
const qa = (a: number, x: number, y: number, steps = 5) => Math.max(0, Math.floor(a * steps + (bayer(x, y) - 0.5) * 0.12 + 0.5)) / steps;

function sky(p: P, t: Theme, horizon = 0.8) {
  const n = t.sky.length;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const f = y / (CH - 1);
    const v = f < horizon ? (f / horizon) * (n - 1) : (n - 1) - ((f - horizon) / (1 - horizon)) * 1.6;
    p.px(x, y, t.sky[Math.max(0, Math.min(n - 1, Math.floor(v + (bayer(x, y) - 0.5) * 0.6 + 0.5)))]);
  }
}
function glow(p: P, cx: number, cy: number, r: number, c: string, a = 0.6, ry = r, steps = 6) {
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const d = Math.hypot((x + 0.5 - cx) / r, (y + 0.5 - cy) / ry);
    if (d >= 1) continue;
    p.px(x, y, c, qa(a * (1 - d) ** 1.5, x, y, steps));
  }
}
/** Distance-field glow around a mask. */
function glowMask(p: P, m: Mask, c: string, r: number, a = 0.6) {
  const dist = new Float32Array(CW * CH).fill(99);
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (m.has(x, y)) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const X = x + i, Y = y + j;
      if (X < 0 || Y < 0 || X >= CW || Y >= CH) continue;
      const d = Math.hypot(i, j);
      if (d < dist[Y * CW + X]) dist[Y * CW + X] = d;
    }
  }
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const d = dist[y * CW + x];
    if (d > 0 && d <= r) p.px(x, y, c, qa(a * (1 - d / (r + 1)) ** 1.3, x, y));
  }
}
function vignette(p: P, t: Theme, k = 0.85) {
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const e = ((x + 0.5 - 32) / 34) ** 2 + ((y + 0.5 - 20) / 22) ** 2;
    const v = Math.max(0, Math.min(1, (e - 0.42) / 0.75));
    p.px(x, y, t.dark, qa(v * v * k, x, y, 4));
  }
}
function motes(p: P, t: Theme, seed: number, n = 10, up = true) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * CW), y = Math.floor(r() * CH * (up ? 0.9 : 1)), a = 0.4 + r() * 0.6;
    p.px(x, y, t.mote, a);
    if (r() < 0.25) p.px(x, y + 1, t.mote, a * 0.4);
  }
}
function ground(p: P, y0: number, c: string, rim: string, seed = 1, rough = 1) {
  const r = rng(seed);
  let h = 0;
  for (let x = 0; x < CW; x++) {
    if (r() < 0.3 * rough) h = Math.max(-1, Math.min(1, h + (r() < 0.5 ? -1 : 1)));
    const top = y0 + h;
    for (let y = top; y < CH; y++) p.px(x, y, y === top ? rim : c, y === top ? 0.9 : 1);
    if (r() < 0.2) p.px(x, top + 2 + Math.floor(r() * 4), rim, 0.25);
  }
}
function sparkle(p: P, x: number, y: number, s: number, c: string, core = '#ffffff') {
  for (let i = 1; i <= s; i++) {
    const a = 1 - (i - 1) / s;
    p.px(x + i, y, c, a).px(x - i, y, c, a).px(x, y + i, c, a).px(x, y - i, c, a);
  }
  if (s >= 3) p.px(x + 1, y + 1, c, 0.35).px(x - 1, y - 1, c, 0.35).px(x + 1, y - 1, c, 0.35).px(x - 1, y + 1, c, 0.35);
  p.px(x, y, core);
}
function rays(p: P, cx: number, cy: number, n: number, r0: number, r1: number, c: string, a = 0.45, rot = 0, width = 0.09) {
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d < r0 || d > r1) continue;
    const ang = Math.atan2(dy, dx) - rot, seg = (2 * Math.PI) / n;
    const off = Math.abs((((ang % seg) + seg) % seg) - seg / 2) / (seg / 2); // 1 at ray centre
    const w = 1 - width * n;
    if (off < w) continue;
    const f = ((off - w) / (1 - w)) * (1 - (d - r0) / (r1 - r0));
    p.px(x, y, c, qa(a * f, x, y, 4));
  }
}
const layer = () => new Pix(CW, CH);
/** Outline a motif layer (selective dark tint) and composite it. */
function stamp(p: P, L: P, outline: string | undefined | false = undefined) {
  if (outline !== false) L.outline(outline);
  p.draw(L);
}

// ============================================================================================
// Motif helpers
// ============================================================================================
function T(x0: number, y0: number, ang: number) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  return (u: number, v: number): [number, number] => [x0 + u * ca - v * sa, y0 + u * sa + v * ca];
}
function polyT(L: P, t: (u: number, v: number) => [number, number], ...uv: number[]): Mask {
  const out: number[] = [];
  for (let i = 0; i < uv.length; i += 2) out.push(...t(uv[i], uv[i + 1]));
  return L.mask().poly(...out);
}
/** Sword with hilt at (x0,y0), blade toward angle `ang`. */
function sword(L: P, x0: number, y0: number, ang: number, len: number, o: { w?: number; blade?: string[]; guard?: string[]; grip?: number } = {}) {
  const w = o.w ?? 1.6, t = T(x0, y0, ang), blade = o.blade ?? PAL.steel, guard = o.guard ?? PAL.gold;
  const nx = Math.sin(ang), ny = -Math.cos(ang); // normal of the -v side
  const aLit = nx * -0.6 + ny * -0.8 > 0;
  const tip = Math.min(len * 0.3, w * 2.6);
  L.fill(polyT(L, t, 1, -w, len - tip, -w, len, 0, 1, 0), blade, { base: aLit ? 4.4 : 2.7, grad: 0.8, edge: 0.3 });
  L.fill(polyT(L, t, 1, 0, len, 0, len - tip, w, 1, w), blade, { base: aLit ? 2.7 : 4.4, grad: 0.8, edge: 0.3 });
  const g = w * 2.7, gl = o.grip ?? Math.max(3, len * 0.22);
  L.fill(polyT(L, t, -1.2, -g, 1, -g, 1, g, -1.2, g), guard, { base: 3.2, grad: 1.5 });
  L.fill(polyT(L, t, -1.2, -w * 0.6, -1.2 - gl, -w * 0.6, -1.2 - gl, w * 0.6, -1.2, w * 0.6), PAL.leather, { base: 2.6 });
  const [px, py] = t(-2 - gl, 0);
  L.fill(L.mask().circle(px, py, Math.max(1.2, w * 0.95)), guard, { mode: 'sphere', bias: 0.5 });
}
/** Tapered crescent streak along a circle (sword arcs). cols: outer → core. */
function streak(p: P, cx: number, cy: number, R: number, a0: number, a1: number, wmax: number, cols: string[], lead = 0.75): Mask {
  const m = p.mask();
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx);
    while (a < Math.min(a0, a1)) a += Math.PI * 2;
    while (a > Math.max(a0, a1)) a -= Math.PI * 2;
    const t = (a - a0) / (a1 - a0);
    if (t < 0 || t > 1) continue;
    const w = wmax * Math.pow(t < lead ? t / lead : (1 - t) / (1 - lead), 0.6);
    const off = Math.abs(d - R) / (w / 2 || 1e-3);
    if (off > 1) continue;
    const k = Math.min(cols.length - 1, Math.floor((1 - off) * cols.length));
    p.px(x, y, cols[k]);
    m.set(x, y);
  }
  return m;
}
function burst(p: P, cx: number, cy: number, n: number, r0: number, r1: number, cols: string[], seed: number, rot = 0): Mask {
  const r = rng(seed), pts: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r0 : r1 * (0.6 + r() * 0.4);
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8);
  }
  const m = p.mask().poly(...pts);
  p.paint(m, cols[0]);
  const inner: number[] = [];
  for (let i = 0; i < pts.length; i += 2) inner.push(cx + (pts[i] - cx) * 0.6, cy + (pts[i + 1] - cy) * 0.6);
  p.paint(p.mask().poly(...inner), cols[1]);
  p.paint(p.mask().ellipse(cx, cy, r0 * 0.9, r0 * 0.75), cols[2]);
  return m;
}
function boltPts(seed: number, x0: number, y0: number, x1: number, y1: number, segs: number, jit: number): [number, number][] {
  const r = rng(seed), pts: [number, number][] = [[x0, y0]];
  const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny);
  for (let i = 1; i < segs; i++) {
    const t = i / segs, o = (r() - 0.5) * 2 * jit;
    pts.push([x0 + (x1 - x0) * t + (nx / nl) * o, y0 + (y1 - y0) * t + (ny / nl) * o]);
  }
  pts.push([x1, y1]);
  return pts;
}
function bolt(p: P, pts: [number, number][], cols: [string, string, string], width = 1.1, glowR = 3) {
  const outer = p.mask(), core = p.mask();
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = pts[i - 1], [c, d] = pts[i];
    const w = width * (1 - (i / pts.length) * 0.4);
    outer.seg(a, b, c, d, w);
    core.line(a - 0.5, b - 0.5, c - 0.5, d - 0.5);
  }
  if (glowR) glowMask(p, outer, cols[0], glowR, 0.5);
  p.paint(outer, cols[1]);
  p.paint(core, cols[2]);
}
function shard(L: P, x: number, y: number, ang: number, len: number, w: number, pal: string[]) {
  const t = T(x, y, ang);
  L.fill(polyT(L, t, 0, 0, len * 0.25, -w, len, 0), pal, { base: 4.2, grad: 1, edge: 0.4 });
  L.fill(polyT(L, t, 0, 0, len, 0, len * 0.25, w), pal, { base: 2.2, grad: 1, edge: 0.4 });
}
function orb(L: P, cx: number, cy: number, r: number, pal: string[], bias = 0.4) {
  L.fill(L.mask().circle(cx, cy, r), pal, { mode: 'sphere', bias, dither: true });
  L.px(Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.5), '#ffffff');
}
function kite(L: P, cx: number, cy: number, s: number, face: string[], rim: string[]): Mask {
  const m = kiteMask(L, s, cx - 8, cy - 8);
  L.fill(m, rim, { base: 3.3, grad: 1.6 });
  const inner = m.erode().erode();
  L.fill(inner, face, { base: 2.6, grad: 2.4 });
  return inner;
}
function figure(L: P, cx: number, by: number, h: number, pal: string[], hood = false) {
  const hw = h * 0.28;
  const m = L.mask().poly(cx - hw, by, cx + hw, by, cx + hw * 0.95, by - h * 0.5, cx + hw * 0.55, by - h * 0.64, cx - hw * 0.55, by - h * 0.64, cx - hw * 0.95, by - h * 0.5);
  m.circle(cx, by - h * 0.82, h * 0.16);
  if (hood) m.poly(cx - h * 0.2, by - h * 0.8, cx, by - h * 1.08, cx + h * 0.2, by - h * 0.8);
  L.fill(m, pal, { base: 2, grad: 1.6 });
}
/** Feathered wing from shoulder (sx,sy); dir = -1 left, +1 right. */
/** Spread wing from shoulder (sx,sy): arched arm with primaries hanging off it. dir -1 = left, +1 = right; rot tilts the tip up. */
function wing(L: P, sx: number, sy: number, dir: number, s: number, pal: string[], rot = 0) {
  const outl = darkOf(pal[2], 0.6), cr = Math.cos(rot), sr = Math.sin(rot);
  const W = (u: number, v: number): [number, number] => [sx + dir * (u * cr + v * sr), sy - u * sr + v * cr];
  const arch = (t: number): [number, number] => [21 * t, -11 * Math.sin(Math.min(1, t * 1.1) * Math.PI / 2) + 2 * t * t];
  const piece = (pts: [number, number][], base: number) => {
    const F = layer(), flat: number[] = [];
    for (const [u, v] of pts) flat.push(...W(u * s, v * s));
    F.fill(F.mask().poly(...flat), pal, { base, grad: 1.3, edge: 0.8 });
    F.outline(outl);
    L.draw(F);
  };
  const feather = (t: number, len: number, w: number, base: number) => {
    const [u, v] = arch(t), phi = ((90 - 58 * t) * Math.PI) / 180, du = Math.cos(phi), dv = Math.sin(phi), pu = -dv, pv = du;
    piece([[u + pu * w * 0.5, v + pv * w * 0.5], [u + du * len * 0.7 + pu * w * 0.6, v + dv * len * 0.7 + pv * w * 0.6], [u + du * len, v + dv * len],
      [u + du * len * 0.75 - pu * w * 0.55, v + dv * len * 0.75 - pv * w * 0.55], [u - pu * w * 0.5, v - pv * w * 0.5]], base);
  };
  for (let i = 0; i < 7; i++) { const t = 1 - i * 0.14; feather(t, 8 + 10 * t, 3.4, 3.2 + i * 0.08); }
  for (let i = 0; i < 5; i++) { const t = 0.85 - i * 0.18; feather(t, 5 + 2 * t, 3.6, 3.8); }
  const band: [number, number][] = [];
  for (let i = 0; i <= 8; i++) { const [u, v] = arch(i / 8 * 0.98); band.push([u, v - 1.4]); }
  for (let i = 8; i >= 0; i--) { const [u, v] = arch(i / 8 * 0.98); band.push([u, v + 1.8 - (i / 8) * 1.2]); }
  piece(band, 4.3);
}
function heart(L: P, cx: number, cy: number, s: number, pal: string[]) {
  const m = L.mask().circle(cx - 2.8 * s, cy - 1.5 * s, 3.2 * s).circle(cx + 2.8 * s, cy - 1.5 * s, 3.2 * s).poly(cx - 5.9 * s, cy - 0.6 * s, cx + 5.9 * s, cy - 0.6 * s, cx, cy + 6.4 * s);
  L.fill(m, pal, { base: 3, grad: 2.2, dither: true });
  L.px(Math.floor(cx - 4 * s), Math.floor(cy - 3 * s), '#ffffff').px(Math.floor(cx - 4 * s) + 1, Math.floor(cy - 3 * s), pal[5]);
  return m;
}
function drop(L: P, cx: number, cy: number, r: number, pal: string[]) {
  const m = L.mask().circle(cx, cy, r).poly(cx - r * 0.92, cy - r * 0.4, cx, cy - r * 2.5, cx + r * 0.92, cy - r * 0.4);
  L.fill(m, pal, { mode: 'sphere', cx, cy: cy - r * 0.3, r: r * 1.3, bias: 0.3, dither: true });
  L.px(Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.2), '#ffffff').px(Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.2) - 1, pal[5]);
  return m;
}
function cloud(L: P, cx: number, cy: number, w: number, pal: string[], seed: number) {
  const r = rng(seed), m = L.mask();
  for (let i = 0; i < 7; i++) m.circle(cx + (r() - 0.5) * w, cy + (r() - 0.6) * w * 0.25, w * (0.14 + r() * 0.1));
  m.ellipse(cx, cy + w * 0.08, w * 0.55, w * 0.14);
  L.fill(m, pal, { base: 2.2, grad: 2.5 });
  return m;
}
function feather(L: P, x0: number, y0: number, ang: number, len: number, w: number, pal: string[], quill: string) {
  const t = T(x0, y0, ang);
  const side = (sgn: number) => {
    const pts: number[] = [];
    for (let i = 0; i <= 10; i++) { const u = len * 0.18 + (len * 0.82 * i) / 10; pts.push(u, sgn * w * Math.pow(Math.sin(Math.PI * (i / 10) * 0.95 + 0.05), 0.7) * (sgn > 0 ? 1 : 0.85)); }
    pts.push(len, 0, len * 0.18, 0);
    return polyT(L, t, ...pts);
  };
  L.fill(side(-1), pal, { base: 4, grad: 1.2, edge: 0.5 });
  L.fill(side(1), pal, { base: 2.8, grad: 1.2, edge: 0.5 });
  const [a, b] = t(0, 0), [c, d] = t(len - 1, 0);
  L.paint(L.mask().line(a, b, c, d), quill);
  // barb notches
  const [nx, ny] = t(len * 0.55, -w * 0.8), [mx, my] = t(len * 0.7, w * 0.7);
  L.d.fill(0, L.i(nx, ny), L.i(nx, ny) + 4); L.d.fill(0, L.i(mx, my), L.i(mx, my) + 4);
}
function helm(L: P, cx: number, cy: number, s: number, pal: string[], mouth: string) {
  const m = L.mask().circle(cx, cy - 1 * s, 7.5 * s).rect(cx - 7.5 * s, cy - 1 * s, 15 * s, 7 * s)
    .poly(cx - 7.5 * s, cy + 5 * s, cx + 7.5 * s, cy + 5 * s, cx + 5.5 * s, cy + 9.5 * s, cx - 5.5 * s, cy + 9.5 * s);
  L.fill(m, pal, { base: 3, grad: 2.4, dither: true });
  const slit = L.mask().rect(cx - 5.5 * s, cy + 0.2 * s, 11 * s, 1.6 * s).rect(cx - 0.8 * s, cy, 1.6 * s, 4 * s);
  L.paint(slit, darkOf(pal[0], 0.5));
  L.paint(L.mask().ellipse(cx, cy + 6.3 * s, 3 * s, 2.2 * s), darkOf(pal[0], 0.5));
  L.paint(L.mask().ellipse(cx, cy + 6.8 * s, 1.9 * s, 1.2 * s), mouth);
  L.paint(L.mask().rect(cx - 0.6 * s, cy - 8.4 * s, 1.2 * s, 7.4 * s), pal[5], 0.7);
  return m;
}
function hexField(p: P, inside: Mask, size: number, edge: string, fill: string, a = 0.5) {
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (!inside.has(x, y)) continue;
    // axial hex coords (pointy-top)
    const px = (x + 0.5) / size, py = (y + 0.5) / size;
    const q = (Math.sqrt(3) / 3) * px - py / 3, r = (2 / 3) * py;
    let rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
    const dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz + q + r);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
    const cxh = size * Math.sqrt(3) * (rx + ry / 2), cyh = size * 1.5 * ry;
    const ddx = Math.abs(x + 0.5 - cxh), ddy = Math.abs(y + 0.5 - cyh);
    const hexd = Math.max(ddx * 2 / Math.sqrt(3), ddx / Math.sqrt(3) + ddy) / size;
    if (hexd > 0.8) p.px(x, y, edge, hexd > 0.88 ? 1 : 0.6);
    else p.px(x, y, fill, qa(a * (0.4 + hexd * 0.6), x, y, 4));
  }
}
function swirl(p: P, cx: number, cy: number, R: number, arms: number, twist: number, cols: string[], ry = R, rot = 0): Mask {
  const m = p.mask();
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const dx = (x + 0.5 - cx) / R, dy = (y + 0.5 - cy) / ry, d = Math.hypot(dx, dy);
    if (d > 1 || d < 0.06) continue;
    const a = Math.atan2(dy, dx) + rot + d * twist, seg = (2 * Math.PI) / arms;
    const off = Math.abs((((a % seg) + seg) % seg) - seg / 2) / (seg / 2);
    const thick = 0.55 * (1 - d * 0.6);
    if (off < 1 - thick) continue;
    const k = (off - (1 - thick)) / thick;
    const idx = Math.min(cols.length - 1, Math.floor((k * 0.7 + (1 - d) * 0.5) * cols.length));
    p.px(x, y, cols[idx]);
    m.set(x, y);
  }
  return m;
}

// ============================================================================================
// Palettes for light/energy (outer → core)
// ============================================================================================
const FIREC = ['#8a1e14', '#d0461a', '#f28a24', '#fcc848', '#fff6c0'];
const ICEC = ['#1f5a8a', '#3fa0d0', '#8eeef0', '#e8fffe'];
const BOLTC: [string, string, string] = ['#ffe36a', '#fff3a0', '#ffffff'];
const HOLYC = ['#c88a2a', '#f2c85a', '#fff0b0', '#ffffff'];
const SLASHC = ['#c23a3a', '#f28a7a', '#ffe0d8', '#ffffff'];

// ============================================================================================
// Card scenes
// ============================================================================================
type Scene = (p: P) => void;

function base(p: P, t: Theme, gx = 32, gy = 20, gr = 26, ga = 0.45, seed = 1) {
  sky(p, t);
  glow(p, gx, gy, gr, t.glow, ga, gr * 0.75);
  motes(p, t, seed);
}

const SCENES: Record<CardArt, Scene> = {
  // ------------------------------------------------------------------ KNIGHT
  slash: (p) => {
    base(p, TH.kRed, 34, 20, 28, 0.35, 2);
    streak(p, 30, 50, 34, -2.6, -1.05, 4, ['#6a1a2a', '#9a2a3a', '#c24a4a'], 0.7);
    const m = streak(p, 36, 44, 34, -2.75, -0.95, 9, SLASHC, 0.72);
    glowMask(p, m, '#ff9a80', 3, 0.4);
    streak(p, 36, 44, 34, -2.75, -0.95, 9, SLASHC, 0.72);
    sparkle(p, 51, 15, 3, '#ffd0c0'); sparkle(p, 17, 26, 2, '#ff9a80');
    vignette(p, TH.kRed);
  },
  shield: (p) => {
    base(p, TH.kSteel, 32, 19, 26, 0.5, 3);
    rays(p, 32, 19, 12, 10, 30, TH.kSteel.glow, 0.3, 0.2);
    const L = layer();
    const inner = kite(L, 32, 20, 2.15, PAL.blue, PAL.silver);
    const b = inner.bbox();
    L.fill(L.mask().rect(31, b.y0 + 2, 3, b.h - 7).rect(b.x0 + 3, b.y0 + 7, b.w - 6, 3).and(inner), PAL.gold, { base: 3.4 });
    stamp(p, L);
    sparkle(p, 23, 6, 3, '#e0f0ff'); sparkle(p, 43, 30, 2, '#9cc4ff');
    vignette(p, TH.kSteel);
  },
  taunt: (p) => {
    base(p, TH.kRed, 32, 20, 30, 0.55, 4);
    rays(p, 32, 21, 14, 11, 34, '#ff5040', 0.55, 0.1);
    glow(p, 32, 21, 16, '#ff3020', 0.5, 14);
    const L = layer();
    helm(L, 32, 17, 1.35, PAL.steel, '#ff6040');
    L.fill(L.mask().poly(30, 5, 32, 0, 34, 5, 33, 8, 31, 8), PAL.red, { base: 3.6 });
    stamp(p, L);
    p.px(27, 18, '#ffb0a0').px(28, 18, '#ff6040').px(36, 18, '#ff6040').px(37, 18, '#ffb0a0');
    for (const [x, y, dx] of [[12, 12, -1], [14, 22, -1], [50, 12, 1], [48, 22, 1]]) for (let i = 0; i < 4; i++) p.px(x + dx * i, y + (y < 18 ? -i * 0.5 : i * 0.5), '#ff8a6a', 1 - i * 0.2);
    vignette(p, TH.kRed);
  },
  cleave: (p) => {
    base(p, TH.kRed, 32, 24, 32, 0.35, 5);
    ground(p, 33, '#1a0a10', '#5a2028', 5);
    const m = streak(p, 32, 58, 40, -2.6, -0.45, 9, SLASHC, 0.55);
    glowMask(p, m, '#ff7a60', 3, 0.35);
    streak(p, 32, 58, 40, -2.6, -0.45, 9, SLASHC, 0.55);
    const L = layer();
    sword(L, 55, 26, -1.2, 14, { w: 1.4 });
    stamp(p, L);
    for (const [x, y] of [[10, 30], [16, 27], [48, 30], [54, 27], [30, 31]]) p.px(x, y, '#ffb090').px(x + 1, y - 1, '#ff7050', 0.6);
    vignette(p, TH.kRed);
  },
  twin: (p) => {
    base(p, TH.kRed, 32, 20, 26, 0.45, 6);
    const a = streak(p, 10, 58, 50, -1.45, -0.55, 6, SLASHC, 0.7);
    const b = streak(p, 54, 58, 50, -2.6, -1.7, 6, ['#3a64c8', '#8ab8ff', '#e0f0ff', '#ffffff'], 0.7);
    glowMask(p, a.add(b), '#ffc0b0', 2, 0.3);
    streak(p, 10, 58, 50, -1.45, -0.55, 6, SLASHC, 0.7);
    streak(p, 54, 58, 50, -2.6, -1.7, 6, ['#3a64c8', '#8ab8ff', '#e0f0ff', '#ffffff'], 0.7);
    sparkle(p, 32, 14, 4, '#ffe0d0');
    vignette(p, TH.kRed);
  },
  bash: (p) => {
    base(p, TH.kSteel, 40, 20, 26, 0.35, 7);
    glow(p, 44, 20, 16, '#ffd070', 0.6, 14);
    burst(p, 44, 20, 9, 5, 16, ['#f2a030', '#ffe070', '#ffffff'], 7, 0.2);
    const L = layer();
    const inner = kite(L, 26, 20, 1.75, PAL.blue, PAL.silver);
    const bb = inner.bbox();
    L.fill(L.mask().rect(25, bb.y0 + 2, 2, bb.h - 5).rect(bb.x0 + 2, bb.y0 + 5, bb.w - 4, 2).and(inner), PAL.gold, { base: 3.4 });
    stamp(p, L);
    for (const y of [10, 16, 24, 30]) for (let i = 0; i < 6; i++) p.px(6 + i, y, '#9cc4ff', 0.2 + i * 0.1);
    vignette(p, TH.kSteel);
  },
  cover: (p) => {
    base(p, TH.kSteel, 34, 18, 30, 0.35, 8);
    ground(p, 33, '#0a0e1a', '#32466a', 8);
    const dome = p.mask().ellipse(40, 33, 20, 22).sub(p.mask().ellipse(40, 33, 18.5, 20.5)).and(p.mask().rect(0, 0, 64, 33));
    glowMask(p, dome, '#7fb0ff', 2, 0.4);
    p.paint(dome, '#b8d8ff', 0.8);
    const F = layer();
    figure(F, 40, 33, 11, PAL.steel, true); figure(F, 47, 33, 9, PAL.steel); figure(F, 53, 33, 10, PAL.steel, true);
    stamp(p, F);
    const L = layer();
    const inner = kite(L, 24, 21, 2.0, PAL.blue, PAL.silver);
    const b = inner.bbox();
    L.fill(L.mask().rect(23, b.y0 + 2, 3, b.h - 6).rect(b.x0 + 3, b.y0 + 6, b.w - 6, 3).and(inner), PAL.gold, { base: 3.4 });
    stamp(p, L);
    vignette(p, TH.kSteel);
  },
  flameblade: (p) => {
    base(p, TH.fire, 32, 18, 28, 0.5, 9);
    const L = layer();
    sword(L, 22, 34, -1.05, 30, { w: 1.8 });
    const F = layer(), G = layer();
    for (let i = 0; i < 6; i++) {
      const t = 0.12 + i * 0.15, x = 22 + Math.cos(-1.05) * 30 * t, y = 34 + Math.sin(-1.05) * 30 * t;
      flame(F, x + 2, y + 4, 10 - i * 0.9, 16 - i * 1.2, PAL.fire, 1.6);
      if (i % 2) flame(G, x - 1, y + 3, 5 - i * 0.4, 8 - i * 0.5, PAL.fire, -1);
    }
    glowMask(p, maskOf(F), '#ff8a30', 3, 0.45);
    p.draw(F, 0, 0, 0.95);
    stamp(p, L);
    p.draw(G, 0, 0, 0.85);
    motes(p, TH.fire, 19, 14);
    vignette(p, TH.fire);
  },
  warcry: (p) => {
    base(p, TH.kRed, 32, 12, 30, 0.55, 10);
    rays(p, 32, 8, 16, 4, 40, '#ffd080', 0.5, 0);
    ground(p, 34, '#140810', '#4a1c22', 10);
    const L = layer();
    sword(L, 32, 34, -Math.PI / 2, 26, { w: 2 });
    stamp(p, L);
    sparkle(p, 32, 7, 4, '#fff0c0');
    vignette(p, TH.kRed);
  },
  wall: (p) => {
    base(p, TH.kSteel, 32, 10, 30, 0.35, 11);
    const L = layer();
    const rows = [[8, 0], [16, 5], [24, 0], [32, 5]];
    for (const [y, off] of rows) for (let x = -off; x < 64; x += 11) {
      const m = L.mask().rect(Math.max(4, x), y, Math.min(10, 60 - Math.max(4, x)), 7);
      if (Math.min(10, 60 - Math.max(4, x)) <= 1) continue;
      L.fill(m, PAL.steel, { base: 2.8, grad: 1.6, edge: 1 });
      const b = m.bbox();
      L.px(b.x0 + 1, b.y0 + 1, PAL.steel[5]).px(b.x1 - 1, b.y0 + 1, PAL.steel[1]).px(b.x0 + 1, b.y1 - 1, PAL.steel[1]);
    }
    L.fill(L.mask().rect(4, 4, 56, 4), PAL.steel, { base: 3.6 });
    stamp(p, L, PAL.ink[0]);
    for (let x = 4; x < 60; x++) p.px(x, 4, '#e0f0ff', 0.7);
    glow(p, 32, 4, 30, '#9cc4ff', 0.25, 4);
    vignette(p, TH.kSteel);
  },
  crush: (p) => {
    base(p, TH.kRed, 30, 24, 28, 0.4, 12);
    ground(p, 30, '#1a0c10', '#6a3028', 12, 0.5);
    // jagged ground cracks radiating from the impact
    const cm = p.mask();
    for (const pts of [boltPts(12, 30, 31, 6, 34, 5, 1.5), boltPts(13, 30, 31, 56, 33, 5, 1.5), boltPts(14, 30, 31, 42, 39, 3, 1.2), boltPts(15, 30, 31, 18, 39, 3, 1.2)])
      for (let i = 1; i < pts.length; i++) cm.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    p.paint(cm.grow(), '#12060a');
    glowMask(p, cm, '#ff7040', 1, 0.4);
    p.paint(cm, '#ffa060');
    burst(p, 30, 30, 8, 3, 10, ['#a05020', '#e8a050', '#fff0c0'], 12, 0.3);
    const L = layer();
    const t = T(30, 27, -2.2);
    L.fill(polyT(L, t, 0, -1.3, 26, -1.3, 26, 1.3, 0, 1.3), PAL.wood, { base: 3 });
    L.fill(polyT(L, T(30, 27, -2.2 + Math.PI / 2), -8, -4.5, 8, -4.5, 9, 4.5, -9, 4.5), PAL.steel, { base: 3, grad: 2, dither: true });
    stamp(p, L);
    for (const [x, y] of [[20, 22], [40, 20], [16, 26], [45, 25], [34, 18]]) p.px(x, y, '#c08060').px(x, y + 1, '#603020');
    vignette(p, TH.kRed);
  },
  rampart: (p) => {
    base(p, TH.kSteel, 44, 12, 24, 0.4, 13);
    p.paint(p.mask().circle(50, 9, 4), '#e8f0ff', 0.9);
    const L = layer();
    const m = L.mask().rect(4, 22, 56, 18);
    for (let x = 4; x < 60; x += 8) m.rect(x, 17, 5, 5);
    m.rect(14, 8, 12, 14);
    for (let x = 14; x < 26; x += 4) m.rect(x, 4, 3, 4);
    L.fill(m, PAL.stone, { base: 3, grad: 1.8 });
    for (let y = 25; y < 40; y += 4) for (let x = 4 + ((y / 4) % 2) * 4; x < 60; x += 8) L.paint(L.mask().rect(x, y, 1, 3), PAL.stone[1]);
    for (let y = 25; y < 40; y += 4) L.paint(L.mask().rect(4, y + 3, 56, 1), PAL.stone[1]);
    L.paint(L.mask().rect(19, 12, 2, 4), '#ffd070');
    stamp(p, L);
    const F = layer();
    F.paint(F.mask().rect(20, 0, 1, 5), PAL.wood[3]);
    F.fill(F.mask().poly(21, 0, 29, 1.5, 21, 3.5), PAL.red, { base: 3.5 });
    stamp(p, F);
    vignette(p, TH.kSteel);
  },
  sworddance: (p) => {
    base(p, TH.kSteel, 32, 20, 26, 0.45, 14);
    p.paint(p.mask().ellipse(32, 20, 20, 13).sub(p.mask().ellipse(32, 20, 19, 12)), '#9cc4ff', 0.5);
    const L = layer();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6 + 0.5, x = 32 + Math.cos(a) * 18, y = 20 + Math.sin(a) * 11;
      sword(L, x, y, Math.atan2(Math.cos(a) * 0.62, -Math.sin(a)) + 0.35, 11, { w: 1.3, grip: 2 });
    }
    stamp(p, L);
    glow(p, 32, 20, 8, '#e0f0ff', 0.6);
    sparkle(p, 32, 20, 3, '#e0f0ff');
    vignette(p, TH.kSteel);
  },
  laststand: (p) => {
    base(p, TH.kRed, 32, 30, 34, 0.5, 15);
    ground(p, 32, '#12070c', '#5a2228', 15);
    const S = layer();
    kite(S, 22, 21, 1.7, PAL.blue, PAL.silver);
    const r = rng(3), cr = S.mask();
    let x = 23, y = 9;
    for (let i = 0; i < 20; i++) { cr.set(x, y); y++; if (r() < 0.5) x += r() < 0.5 ? -1 : 1; }
    S.paint(cr, PAL.ink[0]);
    stamp(p, S);
    const L = layer();
    sword(L, 40, 12, Math.PI / 2 - 0.08, 24, { w: 1.6 });
    stamp(p, L);
    for (const [px, py] of [[36, 33], [44, 33], [38, 34]]) p.px(px, py, '#8a4a40');
    glow(p, 40, 33, 8, '#ff9060', 0.4, 3);
    vignette(p, TH.kRed);
  },
  thorns: (p) => {
    base(p, TH.kSteel, 32, 20, 26, 0.4, 16);
    const r = rng(16);
    // bramble wreath behind the armour
    const V = layer(), vine = V.mask();
    for (const ph of [0, 2.1]) for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2, rr = 1 + 0.08 * Math.sin(a * 5 + ph);
      vine.circle(32 + Math.cos(a) * 19 * rr, 20 + Math.sin(a) * 13 * rr, 0.9);
    }
    const spikes = V.mask();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2, x = 32 + Math.cos(a) * 19, y = 20 + Math.sin(a) * 13, o = a + (r() < 0.5 ? 0.5 : -0.5), s2 = r() < 0.5 ? 1 : -1;
      spikes.poly(x + Math.cos(o + 1.4) * 1.2, y + Math.sin(o + 1.4) * 1.2, x + Math.cos(o) * 4 * s2, y + Math.sin(o) * 4 * s2, x + Math.cos(o - 1.4) * 1.2, y + Math.sin(o - 1.4) * 1.2);
    }
    V.fill(spikes, PAL.bone, { base: 3.4 });
    V.fill(vine, [PAL.wood[0], PAL.wood[1], PAL.wood[2], PAL.green[2], PAL.green[3], PAL.green[4]], { base: 2.6, grad: 2 });
    stamp(p, V);
    const L = layer();
    const body = L.mask().poly(25, 10, 39, 10, 41, 15, 38.5, 26, 32, 30, 25.5, 26, 23, 15);
    L.fill(body, PAL.steel, { base: 2.8, grad: 2.4 });
    L.paint(L.mask().line(32, 12, 32, 28), PAL.steel[5]).paint(L.mask().line(33, 12, 33, 28), PAL.steel[2]);
    L.paint(L.mask().rect(26, 23, 12, 1), PAL.steel[1]).paint(L.mask().rect(26, 24, 12, 1), PAL.steel[4]);
    const pa = L.mask().ellipse(22.5, 12.5, 4.2, 3.2).sub(body), pb = L.mask().ellipse(41.5, 12.5, 4.2, 3.2).sub(body);
    L.fill(pa, PAL.steel, { base: 3.6 }); L.fill(pb, PAL.steel, { base: 3 });
    L.paint(L.mask().ellipse(32, 10, 3.5, 1.6), PAL.ink[1]);
    stamp(p, L);
    // one strand wrapping the front
    const F = layer(), fv = F.mask();
    for (let x = 20; x < 45; x++) fv.circle(x, 20 + Math.sin(x * 0.45) * 2.2 + (x - 32) * 0.2, 0.8);
    const fs = F.mask();
    for (let x = 22; x < 44; x += 4) { const y = 20 + Math.sin(x * 0.45) * 2.2 + (x - 32) * 0.2, s2 = x % 8 ? -1 : 1; fs.poly(x - 1, y, x + 1, y, x + 0.4, y + s2 * 3.6); }
    F.fill(fs, PAL.bone, { base: 3.6 });
    F.fill(fv, [PAL.wood[1], PAL.wood[2], PAL.green[2], PAL.green[3], PAL.green[4]], { base: 2.4 });
    stamp(p, F);
    vignette(p, TH.kSteel);
  },
  aegis: (p) => {
    base(p, TH.kGold, 32, 20, 34, 0.6, 17);
    rays(p, 32, 20, 18, 6, 44, '#fff0b0', 0.55, 0.1, 0.07);
    glow(p, 32, 20, 22, '#ffffff', 0.45, 18);
    const SL = ['#ffd070', '#fff0b0', '#ffffff', '#ffffff'];
    const L = layer();
    const inner = kite(L, 32, 21, 2.25, PAL.gold, PAL.silver);
    const b = inner.bbox();
    L.fill(L.mask().rect(31, b.y0 + 2, 3, b.h - 6).rect(b.x0 + 3, b.y0 + 7, b.w - 6, 3).and(inner), PAL.white, { base: 4 });
    L.fill(L.mask().circle(32.5, b.y0 + 8.5, 2.2), PAL.red, { mode: 'sphere', bias: 0.6 });
    stamp(p, L, '#3a1a08');
    const m = streak(p, 72, 78, 72, -2.4, -1.72, 6, SL, 0.65);
    glowMask(p, m, '#ffffff', 2, 0.5);
    streak(p, 72, 78, 72, -2.4, -1.72, 6, SL, 0.65);
    sparkle(p, 14, 8, 4, '#fff0b0'); sparkle(p, 51, 30, 3, '#fff0b0'); sparkle(p, 50, 7, 2, '#ffffff'); sparkle(p, 44, 4, 3, '#ffffff');
    motes(p, TH.kGold, 41, 16);
    vignette(p, TH.kGold, 0.7);
  },

  // ------------------------------------------------------------------ BLACK MAGE
  fire: (p) => {
    base(p, TH.fire, 36, 22, 26, 0.5, 18);
    const F = layer();
    for (let i = 0; i < 5; i++) {
      const t = T(38, 24, -2.5 + (i - 2) * 0.13);
      const m = polyT(F, t, 0, -6 + Math.abs(i - 2), 24 - Math.abs(i - 2) * 4, 0, 0, 6 - Math.abs(i - 2));
      F.paint(m, FIREC[Math.min(4, 1 + (i === 2 ? 2 : i % 2))], 0.9);
    }
    const ball = F.mask().circle(38, 24, 8);
    F.fill(ball, [FIREC[0], FIREC[1], FIREC[2], FIREC[3], FIREC[4], '#ffffff'], { mode: 'sphere', bias: 1.2, dither: true });
    glowMask(p, maskOf(F), '#ff9a30', 3, 0.45);
    p.draw(F);
    motes(p, TH.fire, 28, 16);
    vignette(p, TH.fire);
  },
  ice: (p) => {
    base(p, TH.ice, 32, 24, 26, 0.45, 19);
    ground(p, 33, '#06101e', '#4a88b0', 19);
    const L = layer();
    const sh: [number, number, number, number, number][] = [[32, 34, -1.57, 30, 4.2], [24, 34, -2.0, 22, 3.4], [41, 34, -1.1, 24, 3.6], [16, 35, -2.5, 14, 2.6], [49, 35, -0.62, 15, 2.8], [30, 35, -1.3, 13, 2.4]];
    for (const [x, y, a, l, w] of sh) shard(L, x, y, a, l, w, PAL.cyan);
    glowMask(p, maskOf(L), '#8eeef0', 3, 0.4);
    stamp(p, L, '#06203a');
    sparkle(p, 32, 6, 3, '#e8fffe'); sparkle(p, 44, 14, 2, '#e8fffe');
    motes(p, TH.ice, 29, 12);
    vignette(p, TH.ice);
  },
  thunder: (p) => {
    base(p, TH.thunder, 34, 30, 30, 0.35, 20);
    ground(p, 34, '#0a0818', '#6a5aa0', 20);
    glow(p, 34, 34, 20, '#fff08a', 0.6, 7);
    glow(p, 32, 20, 14, '#b8b0ff', 0.35, 16);
    const pts = boltPts(21, 29, 8, 35, 34, 7, 4.5);
    bolt(p, pts, BOLTC, 2.1, 4);
    const br = boltPts(22, pts[3][0], pts[3][1], pts[3][0] + 10, pts[3][1] + 10, 3, 2);
    bolt(p, br, BOLTC, 1, 2);
    const br2 = boltPts(23, pts[2][0], pts[2][1], pts[2][0] - 9, pts[2][1] + 7, 3, 2);
    bolt(p, br2, BOLTC, 0.8, 2);
    const L = layer();
    cloud(L, 30, 5, 54, ['#0c0a1c', '#13102a', '#1c1838', '#262048', '#342c5c', '#463e74'], 4);
    stamp(p, L, false);
    for (let y = 1; y < CH; y++) for (let x = 0; x < CW; x++) if (L.alpha(x, y) > 0.5 && L.alpha(x, y + 1) < 0.5) {
      const near = Math.max(0, 1 - Math.abs(x - 30) / 22);
      p.px(x, y, '#b8b0f0', 0.25 + near * 0.6);
    }
    burst(p, 35, 34, 7, 2, 7, ['#ffe36a', '#fff3a0', '#ffffff'], 20);
    vignette(p, TH.thunder);
  },
  scan: (p) => {
    base(p, TH.arcane, 32, 20, 26, 0.45, 21);
    const ring = p.mask().ring(32, 20, 15, 16.2);
    glowMask(p, ring, '#9a6aff', 2, 0.4);
    p.paint(ring, '#c99aff');
    for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; p.px(Math.floor(32 + Math.cos(a) * 13), Math.floor(20 + Math.sin(a) * 13), '#e8d0ff'); }
    const L = layer();
    const eye = L.mask().test((x, y) => Math.abs(y - 20) <= 7.2 * (1 - ((x - 32) / 13) ** 2));
    L.fill(eye, PAL.white, { base: 3.6 });
    L.fill(L.mask().circle(32, 20, 5.2).and(eye), PAL.cyan, { mode: 'sphere', bias: 0.8, dither: true });
    L.paint(L.mask().ellipse(32, 20, 1.6, 3.2), PAL.ink[0]);
    L.px(30, 17, '#ffffff').px(29, 18, '#ffffff');
    stamp(p, L, '#1a0c30');
    glow(p, 32, 20, 7, '#8eeef0', 0.35);
    vignette(p, TH.arcane);
  },
  firestorm: (p) => {
    base(p, TH.fire, 32, 34, 34, 0.5, 22);
    ground(p, 35, '#160608', '#a8401a', 22);
    const r = rng(22), F = layer();
    for (let i = 0; i < 7; i++) {
      const x = 6 + i * 8.5 + r() * 3, y = 6 + r() * 22, rr = 2 + r() * 1.6;
      const t = T(x, y, -2.1);
      F.paint(polyT(F, t, 0, -rr, 12, 0, 0, rr), FIREC[1], 0.85);
      F.paint(polyT(F, t, 0, -rr * 0.5, 7, 0, 0, rr * 0.5), FIREC[3], 0.9);
      F.fill(F.mask().circle(x, y, rr), [FIREC[1], FIREC[2], FIREC[3], FIREC[4]], { mode: 'sphere', bias: 0.8 });
    }
    for (let i = 0; i < 6; i++) flame(F, 6 + i * 11 + r() * 3, 37, 6, 7 + r() * 5, PAL.fire, 0.6);
    glowMask(p, maskOf(F), '#ff8a30', 2, 0.4);
    p.draw(F);
    vignette(p, TH.fire);
  },
  chain: (p) => {
    base(p, TH.thunder, 32, 20, 30, 0.35, 23);
    const main = boltPts(23, 4, 20, 26, 18, 5, 3);
    const b1 = boltPts(24, 26, 18, 52, 7, 5, 3), b2 = boltPts(25, 26, 18, 56, 22, 5, 3), b3 = boltPts(26, 26, 18, 48, 34, 5, 3);
    for (const pts of [main, b1, b2, b3]) bolt(p, pts, BOLTC, 0.9, 2);
    for (const [x, y] of [[52, 7], [56, 22], [48, 34]]) { glow(p, x, y, 6, '#fff08a', 0.6); sparkle(p, x, y, 3, '#fff3a0'); }
    glow(p, 26, 18, 5, '#ffffff', 0.6);
    vignette(p, TH.thunder);
  },
  frostnova: (p) => {
    base(p, TH.ice, 32, 24, 30, 0.5, 24);
    ground(p, 30, '#081424', '#3a78a8', 24, 0.5);
    p.paint(p.mask().ellipse(32, 30, 24, 7).sub(p.mask().ellipse(32, 30, 22, 6)), '#8eeef0', 0.6);
    glow(p, 32, 28, 12, '#e8fffe', 0.7, 8);
    const back = layer(), front = layer();
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12, x = 32 + Math.cos(a) * 22, y = 30 + Math.sin(a) * 6.5;
      const Ld = Math.sin(a) < 0 ? back : front, s = Math.sin(a) < 0 ? 0.75 : 1;
      shard(Ld, x, y + 1, -Math.PI / 2 + Math.cos(a) * 0.5, (11 + (i % 3) * 3) * s, 2.4 * s, PAL.cyan);
    }
    stamp(p, back, '#06203a');
    sparkle(p, 32, 27, 4, '#e8fffe');
    stamp(p, front, '#06203a');
    vignette(p, TH.ice);
  },
  ignite: (p) => {
    base(p, TH.fire, 32, 28, 24, 0.5, 25);
    ground(p, 32, '#12060a', '#4a1a12', 25);
    const L = layer();
    L.fill(L.mask().seg(20, 33, 44, 30, 2).seg(20, 30, 44, 34, 2), PAL.wood, { base: 2.2 });
    stamp(p, L);
    const r = rng(25);
    for (let i = 0; i < 14; i++) p.px(20 + Math.floor(r() * 24), 30 + Math.floor(r() * 5), r() < 0.5 ? '#ff7a30' : '#ffc050');
    glow(p, 32, 24, 16, '#ffa040', 0.65, 14);
    const F = layer();
    flame(F, 32, 31, 11, 18, PAL.fire, 0.8);
    p.draw(F);
    for (let i = 0; i < 8; i++) p.px(26 + Math.floor(r() * 12), 6 + Math.floor(r() * 12), '#ffc050', 0.5 + r() * 0.5);
    vignette(p, TH.fire);
  },
  prism: (p) => {
    base(p, TH.arcane, 32, 20, 26, 0.3, 26);
    glow(p, 22, 14, 14, '#ff8a30', 0.45); glow(p, 42, 14, 14, '#8eeef0', 0.45); glow(p, 32, 30, 14, '#fff08a', 0.45);
    const L = layer();
    const o = L.mask().circle(32, 20, 11);
    const cols = [PAL.red, PAL.cyan, PAL.gold];
    for (let k = 0; k < 3; k++) {
      const seg = o.clone().and(L.mask().test((x, y) => {
        const a = Math.atan2(y - 20, x - 32) + Math.hypot(x - 32, y - 20) * 0.12 + Math.PI * 2;
        return Math.floor(((a + Math.PI / 2) % (Math.PI * 2)) / ((Math.PI * 2) / 3)) === k;
      }));
      L.fill(seg, cols[k], { mode: 'sphere', cx: 32, cy: 20, r: 11, bias: -0.2 });
    }
    L.px(28, 15, '#ffffff').px(27, 16, '#ffffff').px(28, 16, '#ffffff');
    stamp(p, L, '#140828');
    sparkle(p, 14, 8, 2, '#ffb060'); sparkle(p, 51, 9, 2, '#aef4ff'); sparkle(p, 33, 36, 2, '#fff08a');
    vignette(p, TH.arcane);
  },
  flare: (p) => {
    base(p, TH.cata, 32, 20, 34, 0.6, 27);
    glow(p, 32, 20, 26, '#ff60a0', 0.4, 18);
    rays(p, 32, 20, 8, 4, 32, '#ffffff', 0.8, 0.2, 0.05);
    rays(p, 32, 20, 8, 4, 20, '#ffe0a0', 0.7, 0.2 + Math.PI / 8, 0.05);
    glow(p, 32, 20, 14, '#ffe0a0', 0.8);
    star(p, 32, 20, 9, 2.5, ['#ffd070', '#ffe8a0', '#fff4d0', '#ffffff', '#ffffff', '#ffffff'], 4, -Math.PI / 2);
    p.paint(p.mask().circle(32, 20, 3.5), '#ffffff');
    p.paint(p.mask().ring(32, 20, 12, 13), '#ff9ad0', 0.5);
    motes(p, TH.cata, 30, 14);
    vignette(p, TH.cata);
  },
  manashield: (p) => {
    base(p, TH.arcane, 32, 20, 26, 0.35, 28);
    const dome = p.mask().ellipse(32, 22, 22, 17);
    glowMask(p, dome.clone().sub(dome.erode()), '#b080ff', 3, 0.4);
    hexField(p, dome, 4.2, '#d8b8ff', '#8a5ae0', 0.55);
    p.paint(dome.clone().sub(dome.erode()), '#f0e0ff');
    const L = layer();
    figure(L, 32, 36, 13, PAL.ink, true);
    stamp(p, L);
    sparkle(p, 20, 12, 2, '#ffffff'); sparkle(p, 45, 17, 2, '#e8d0ff');
    vignette(p, TH.arcane);
  },
  surge: (p) => {
    base(p, TH.arcane, 32, 20, 26, 0.3, 29);
    glow(p, 32, 20, 22, '#3fa0ff', 0.5, 16);
    const m = swirl(p, 32, 20, 24, 3, 5, ['#1b2d6b', '#2a55a8', '#3d8ad8', '#6fc1f0', '#c8f2ff'], 16);
    glowMask(p, m, '#6fc1f0', 1, 0.3);
    orb(p, 32, 20, 4, PAL.blue, 1.5);
    sparkle(p, 32, 20, 3, '#c8f2ff');
    motes(p, TH.arcane, 31, 14);
    vignette(p, TH.arcane);
  },
  focus: (p) => {
    base(p, TH.arcane, 32, 18, 26, 0.4, 30);
    const L = layer();
    // open tome
    L.fill(L.mask().poly(10, 26, 32, 30, 32, 37, 10, 33), PAL.violet, { base: 2 });
    L.fill(L.mask().poly(54, 26, 32, 30, 32, 37, 54, 33), PAL.violet, { base: 1.6 });
    L.fill(L.mask().poly(12, 24, 32, 28, 32, 34, 12, 30), PAL.parch, { base: 4, grad: 1.2 });
    L.fill(L.mask().poly(52, 24, 32, 28, 32, 34, 52, 30), PAL.parch, { base: 3.2, grad: 1.2 });
    for (let i = 0; i < 4; i++) { L.paint(L.mask().line(15, 26 + i * 1.3, 28, 29.5 + i * 1.3), PAL.parch[2]); L.paint(L.mask().line(36, 29.5 + i * 1.3, 49, 26 + i * 1.3), PAL.parch[1]); }
    stamp(p, L);
    glow(p, 32, 14, 12, '#c99aff', 0.6);
    const E = layer();
    const eye = E.mask().test((x, y) => Math.abs(y - 13) <= 4.5 * (1 - ((x - 32) / 9) ** 2));
    E.fill(eye, PAL.violet, { base: 4.4 });
    E.fill(E.mask().circle(32, 13, 3).and(eye), PAL.cyan, { mode: 'sphere', bias: 1 });
    E.paint(E.mask().rect(31.5, 11, 1, 4), PAL.ink[0]);
    stamp(p, E, '#1a0c30');
    for (let i = 0; i < 5; i++) p.px(32, 19 + i, '#e8d0ff', 0.8 - i * 0.15);
    sparkle(p, 20, 8, 2, '#e8d0ff'); sparkle(p, 45, 9, 2, '#e8d0ff');
    vignette(p, TH.arcane);
  },
  cataclysm: (p) => {
    base(p, TH.cata, 22, 32, 36, 0.5, 31);
    ground(p, 33, '#0e0408', '#b04a20', 31);
    glow(p, 20, 34, 20, '#ffb050', 0.7, 8);
    const trails: [string[], number][] = [[FIREC, -0.35], [['#1f5a8a', '#3fa0d0', '#8eeef0', '#e8fffe'], 0], [['#8a6a10', '#e0c040', '#fff08a', '#ffffff'], 0.35]];
    for (const [cols, off] of trails) {
      const t = T(30, 20, -0.62 + off * 0.35);
      for (let i = 0; i < cols.length; i++) {
        const w = 5 - i * 1.1;
        p.paint(p.mask().poly(...[...t(0, -w), ...t(40, -w * 0.2 + off * 10), ...t(40, w * 0.2 + off * 10), ...t(0, w)]), cols[i], 0.85);
      }
    }
    const L = layer();
    const rock = L.mask().circle(28, 21, 7.5);
    L.fill(rock, ['#140808', '#2a1210', '#46201a', '#6a3424', '#8a4a30', '#a86040'], { mode: 'sphere', bias: -0.3 });
    const hot = rock.clone().and(L.mask().circle(24, 25, 7.5));
    L.fill(hot, ['#a8401a', '#f28a24', '#fcc848', '#fff6c0'], { mode: 'sphere', cx: 22, cy: 27, r: 9, bias: 0.3 });
    L.paint(L.mask().line(27, 16, 30, 20).line(30, 20, 33, 21).line(30, 20, 29, 24), '#ff8a30');
    stamp(p, L, '#200806');
    burst(p, 16, 34, 9, 3, 11, ['#d04a1a', '#ffc050', '#ffffff'], 31);
    for (const [x, y] of [[8, 26], [12, 22], [26, 28], [6, 30], [30, 30]]) p.px(x, y, '#ffc050').px(x, y + 1, '#a8401a');
    motes(p, TH.cata, 32, 18);
    vignette(p, TH.cata, 0.75);
  },

  // ------------------------------------------------------------------ WHITE MAGE
  cure: (p) => {
    base(p, TH.green, 32, 20, 26, 0.55, 33);
    glow(p, 32, 21, 14, '#d4ffb8', 0.6);
    const L = layer();
    heart(L, 32, 20, 1.55, ['#123a1e', '#1f6a2c', '#3fa045', '#86cf5a', '#d8f59e', '#ffffff']);
    L.fill(L.mask().rect(31, 15, 2, 9).rect(28, 18, 8, 2), ['#e8ffd0', '#ffffff'], { base: 1 });
    stamp(p, L, '#06200e');
    for (const [x, y, s] of [[16, 10, 3], [48, 12, 2], [46, 30, 3], [18, 30, 2], [40, 6, 1]]) sparkle(p, x, y, s, '#d8f59e');
    vignette(p, TH.green);
  },
  protect: (p) => {
    base(p, TH.dawn, 32, 22, 30, 0.35, 34);
    ground(p, 33, '#0a0e1c', '#4a5a80', 34);
    const dome = p.mask().ellipse(32, 33, 22, 26).and(p.mask().rect(0, 0, 64, 33));
    p.paint(dome, '#6fc1f0', 0.18);
    hexField(p, dome.clone().sub(dome.erode().erode()), 3.5, '#c8f2ff', '#3d8ad8', 0.3);
    glowMask(p, dome.clone().sub(dome.erode()), '#6fc1f0', 2, 0.5);
    p.paint(dome.clone().sub(dome.erode()), '#e0f8ff');
    p.paint(p.mask().ellipse(24, 16, 3, 6).sub(p.mask().ellipse(25, 16, 3, 6)), '#ffffff', 0.7);
    const L = layer();
    figure(L, 28, 33, 11, PAL.ink); figure(L, 37, 33, 10, PAL.ink, true);
    stamp(p, L);
    vignette(p, TH.dawn);
  },
  holy: (p) => {
    base(p, TH.holy, 32, 28, 30, 0.4, 35);
    ground(p, 34, '#140c06', '#8a6424', 35);
    for (let y = 0; y < 35; y++) for (let x = 20; x < 44; x++) {
      const d = Math.abs(x + 0.5 - 32) / (6 + y * 0.18);
      if (d < 1) p.px(x, y, d < 0.35 ? '#ffffff' : d < 0.65 ? '#fff0b0' : '#f2c85a', qa(d < 0.65 ? 1 : 0.7 * (1 - d) / 0.35 + 0.2, x, y));
    }
    rays(p, 32, 34, 14, 3, 26, '#fff0b0', 0.55, 0);
    glow(p, 32, 34, 18, '#ffffff', 0.7, 5);
    for (const [x, y, s] of [[22, 12, 2], [42, 8, 3], [38, 22, 2], [25, 26, 2]]) sparkle(p, x, y, s, '#fff0b0');
    vignette(p, TH.holy);
  },
  cura: (p) => {
    base(p, TH.green, 32, 20, 28, 0.5, 36);
    const L = layer();
    for (const [x, y, s] of [[20, 14, 0.9], [44, 12, 0.8], [32, 26, 1.1]] as [number, number, number][]) {
      glow(p, x, y, 10 * s, '#d4ffb8', 0.55);
      L.fill(L.mask().rect(x - 1, y - 5 * s, 2, 10 * s).rect(x - 5 * s, y - 1, 10 * s, 2), ['#86cf5a', '#d8f59e', '#ffffff'], { base: 1.4 });
    }
    stamp(p, L, '#0e3a1a');
    for (const [x, y, s] of [[10, 8, 2], [54, 26, 3], [14, 30, 3], [50, 6, 2], [28, 6, 1], [40, 34, 2], [6, 20, 1]]) sparkle(p, x, y, s, '#eaffd8');
    vignette(p, TH.green);
  },
  regen: (p) => {
    base(p, TH.green, 32, 22, 26, 0.5, 37);
    ground(p, 32, '#0e1a0a', '#4a6a2a', 37);
    const L = layer();
    L.fill(L.mask().ellipse(32, 34, 10, 3), PAL.wood, { base: 2.4 });
    L.paint(L.mask().seg(32, 33, 32, 21, 0.8), PAL.green[3]);
    const lf = (sgn: number) => L.mask().test((x, y) => {
      const u = (x - 32) * sgn, v = y - 22;
      const t = u / 13;
      return t > 0 && t < 1 && Math.abs(v + t * 6 - 1) <= 4 * Math.sin(Math.PI * t) ** 0.8;
    });
    L.fill(lf(1), PAL.green, { base: 3.4, grad: 2, dither: true });
    L.fill(lf(-1), PAL.green, { base: 2.8, grad: 2, dither: true });
    L.paint(L.mask().line(33, 21, 43, 16), PAL.green[5]).paint(L.mask().line(31, 21, 21, 16), PAL.green[4]);
    stamp(p, L, '#06200e');
    const D = layer();
    drop(D, 44, 9, 2.6, PAL.cyan);
    stamp(p, D, '#06203a');
    for (const [x, y] of [[42, 14], [46, 13]]) p.px(x, y, '#8eeef0', 0.7);
    sparkle(p, 18, 10, 2, '#eaffd8');
    vignette(p, TH.green);
  },
  bless: (p) => {
    base(p, TH.holy, 32, 16, 28, 0.55, 38);
    const halo = p.mask().ellipse(32, 11, 12, 4).sub(p.mask().ellipse(32, 11, 9.5, 2.4));
    glowMask(p, halo, '#fff0b0', 3, 0.5);
    p.fill(halo, PAL.gold, { base: 4, grad: 1.5 });
    const L = layer();
    feather(L, 22, 34, -0.75, 26, 4.2, PAL.white, PAL.gold[4]);
    stamp(p, L, '#3a2a14');
    for (const [x, y, s] of [[14, 14, 2], [48, 22, 3], [44, 34, 2], [10, 28, 1]]) sparkle(p, x, y, s, '#fff4c8');
    vignette(p, TH.holy);
  },
  banish: (p) => {
    base(p, TH.holy, 32, 30, 32, 0.4, 39);
    ground(p, 34, '#140c06', '#8a6424', 39);
    const t = T(44, 2, 2.1);
    const spear = p.mask().poly(...t(0, -1.2), ...t(28, -1.2), ...t(28, 1.2), ...t(0, 1.2)).poly(...t(28, -3), ...t(38, 0), ...t(28, 3));
    glowMask(p, spear, '#fff0b0', 4, 0.55);
    p.paint(spear, '#fff0b0');
    p.paint(p.mask().poly(...t(0, -0.4), ...t(36, -0.4), ...t(36, 0.4), ...t(0, 0.4)), '#ffffff');
    const [ix, iy] = t(38, 0);
    burst(p, ix, iy, 8, 3, 10, ['#f2c85a', '#fff0b0', '#ffffff'], 39);
    rays(p, ix, iy, 10, 3, 20, '#fff0b0', 0.4);
    for (const [x, y, s] of [[14, 10, 2], [52, 22, 2], [30, 6, 1]]) sparkle(p, x, y, s, '#fff4c8');
    vignette(p, TH.holy);
  },
  sanctuary: (p) => {
    base(p, TH.holy, 32, 26, 32, 0.4, 40);
    ground(p, 22, '#1a1208', '#6e4e1a', 40, 0.3);
    const c = p.mask().ellipse(32, 30, 26, 8).sub(p.mask().ellipse(32, 30, 24.5, 7));
    const c2 = p.mask().ellipse(32, 30, 18, 5.5).sub(p.mask().ellipse(32, 30, 17, 4.6));
    const glyph = p.mask();
    for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; glyph.line(32 + Math.cos(a) * 19.5, 30 + Math.sin(a) * 6, 32 + Math.cos(a) * 23, 30 + Math.sin(a) * 7.2); }
    glyph.add(p.mask().poly(32, 26.5, 41, 30, 32, 33.5, 23, 30).sub(p.mask().poly(32, 27.5, 39, 30, 32, 32.5, 25, 30)));
    const all = c.add(c2).add(glyph);
    glowMask(p, all, '#ffd070', 2, 0.5);
    p.paint(all, '#fff0b0');
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, x = 32 + Math.cos(a) * 25, y = 30 + Math.sin(a) * 7.5;
      for (let yy = 0; yy < 16; yy++) p.px(x, y - yy, '#fff0b0', qa(0.8 * (1 - yy / 16), x, y - yy));
    }
    glow(p, 32, 26, 14, '#fff8e0', 0.4, 10);
    sparkle(p, 32, 14, 3, '#fff4c8');
    vignette(p, TH.holy);
  },
  raise: (p) => {
    base(p, TH.dawn, 32, 20, 28, 0.4, 41);
    for (let y = 0; y < CH; y++) for (let x = 18; x < 46; x++) {
      const d = Math.abs(x + 0.5 - 32) / 12;
      if (d < 1) p.px(x, y, '#fff6dc', qa(0.55 * (1 - d) ** 1.2, x, y));
    }
    const L = layer();
    feather(L, 26, 30, -1.2, 22, 4, PAL.white, PAL.gold[4]);
    stamp(p, L, '#2c2a44');
    const r = rng(41);
    for (let i = 0; i < 10; i++) { const x = 20 + Math.floor(r() * 24), y = Math.floor(r() * 40); p.px(x, y, '#ffffff', 0.8).px(x, y + 1, '#fff6dc', 0.4).px(x, y + 2, '#fff6dc', 0.2); }
    sparkle(p, 37, 7, 3, '#fff6dc');
    vignette(p, TH.dawn);
  },
  purify: (p) => {
    base(p, TH.aqua, 32, 18, 26, 0.5, 42);
    p.paint(p.mask().ellipse(32, 34, 16, 3).sub(p.mask().ellipse(32, 34, 14.5, 2.2)), '#8eeef0', 0.6);
    p.paint(p.mask().ellipse(32, 34, 24, 4.5).sub(p.mask().ellipse(32, 34, 23, 3.8)), '#8eeef0', 0.3);
    glow(p, 32, 20, 14, '#c8fff4', 0.5);
    const L = layer();
    drop(L, 32, 22, 7.5, PAL.cyan);
    stamp(p, L, '#06283a');
    sparkle(p, 40, 12, 4, '#ffffff'); sparkle(p, 22, 28, 2, '#e8fffc'); sparkle(p, 46, 26, 2, '#e8fffc');
    vignette(p, TH.aqua);
  },
  prayer: (p) => {
    base(p, TH.holy, 32, 14, 30, 0.5, 43);
    ground(p, 34, '#140c06', '#6e4e1a', 43, 0.2);
    glow(p, 32, 12, 16, '#ffd070', 0.6);
    const L = layer();
    for (const [x, h, w] of [[32, 18, 3.4], [22, 11, 2.6], [42, 13, 2.6]] as [number, number, number][]) {
      L.fill(L.mask().rect(x - w, 34 - h, w * 2, h), PAL.bone, { base: 3.4, grad: 2 });
      L.paint(L.mask().rect(x - 0.5, 34 - h - 2, 1, 2), PAL.ink[1]);
      L.px(x - w + 1, 34 - h + 1, PAL.bone[5]).px(x + w - 1, 34 - h + 2, PAL.bone[2]);
    }
    L.fill(L.mask().ellipse(32, 34.5, 16, 2.2), PAL.gold, { base: 3 });
    stamp(p, L);
    const F = layer();
    flame(F, 32, 15, 4, 8, PAL.fire, 0.4); flame(F, 22, 22, 3, 6, PAL.fire, -0.3); flame(F, 42, 20, 3, 6, PAL.fire, 0.3);
    p.draw(F);
    motes(p, TH.holy, 44, 12);
    vignette(p, TH.holy);
  },
  holynova: (p) => {
    base(p, TH.holy, 32, 20, 32, 0.5, 45);
    rays(p, 32, 20, 16, 4, 36, '#fff0b0', 0.25, 0.2);
    for (const [r, a] of [[20, 0.5], [14, 0.7], [8, 0.9]] as [number, number][]) {
      const ring = p.mask().ellipse(32, 20, r * 1.4, r).sub(p.mask().ellipse(32, 20, r * 1.4 - 1.2, r - 1));
      glowMask(p, ring, '#ffd070', 2, 0.35 * a);
      p.paint(ring, '#fff0b0', a);
    }
    glow(p, 32, 20, 7, '#ffffff', 0.9);
    sparkle(p, 32, 20, 4, '#ffffff');
    vignette(p, TH.holy);
  },
  miracle: (p) => {
    base(p, TH.holy, 32, 16, 30, 0.5, 46);
    rays(p, 32, 14, 12, 5, 36, '#fff8e0', 0.5, 0.15);
    glow(p, 32, 14, 12, '#ffffff', 0.7);
    const L = layer();
    star(L, 32, 14, 8, 3.4, ['#c88a2a', '#f2c85a', '#fff0b0', '#fff8e0', '#ffffff', '#ffffff']);
    stamp(p, L, '#5a3a10');
    // cupped light: two curved hand-like crescents
    const hands = p.mask().ellipse(32, 24, 14, 9).sub(p.mask().ellipse(32, 21.5, 12.5, 8)).and(p.mask().rect(0, 22, 64, 18));
    glowMask(p, hands, '#ffd070', 3, 0.5);
    p.fill(hands, ['#c88a2a', '#f2c85a', '#fff0b0', '#ffffff'], { mode: 'vgrad' });
    for (const [x, y, s] of [[14, 8, 2], [50, 10, 2], [20, 30, 1], [46, 30, 1]]) sparkle(p, x, y, s, '#fff4c8');
    vignette(p, TH.holy);
  },
  benediction: (p) => {
    base(p, TH.dawn, 32, 18, 30, 0.5, 47);
    rays(p, 32, 18, 14, 4, 30, '#fff6dc', 0.4, 0);
    const L = layer();
    wing(L, 30, 23, -1, 0.95, PAL.white, 0.15);
    wing(L, 34, 23, 1, 0.95, PAL.white, 0.15);
    stamp(p, L, '#2c2a44');
    glow(p, 32, 19, 7, '#fff6dc', 0.8);
    sparkle(p, 32, 19, 3, '#ffffff');
    motes(p, TH.dawn, 47, 12);
    vignette(p, TH.dawn);
  },
  angel: (p) => {
    base(p, TH.holy, 32, 20, 28, 0.5, 48);
    const W = layer();
    wing(W, 28, 20, -1, 0.78, PAL.white, 0.15);
    wing(W, 36, 20, 1, 0.78, PAL.white, 0.15);
    stamp(p, W, '#2c2a44');
    const L = layer();
    const inner = kite(L, 32, 21, 1.55, PAL.cyan, PAL.gold);
    L.fill(L.mask().rect(31, 13, 2, 11).rect(28, 16, 8, 2).and(inner), ['#e8fffe', '#ffffff'], { base: 1 });
    stamp(p, L, '#3a2008');
    sparkle(p, 32, 4, 2, '#fff4c8');
    vignette(p, TH.holy);
  },
  seraphim: (p) => {
    base(p, TH.kGold, 32, 18, 36, 0.6, 49);
    rays(p, 32, 16, 20, 4, 44, '#ffffff', 0.5, 0.1, 0.06);
    glow(p, 32, 17, 20, '#fff4c8', 0.6, 16);
    const W = layer();
    wing(W, 30, 25, -1, 0.55, PAL.white, -0.8);
    wing(W, 34, 25, 1, 0.55, PAL.white, -0.8);
    wing(W, 30, 17, -1, 0.55, PAL.white, 0.9);
    wing(W, 34, 17, 1, 0.55, PAL.white, 0.9);
    wing(W, 30, 21, -1, 0.78, PAL.white, 0.05);
    wing(W, 34, 21, 1, 0.78, PAL.white, 0.05);
    stamp(p, W, '#4a2e10');
    const L = layer();
    const body = L.mask().poly(26.5, 36, 37.5, 36, 35, 19, 32, 17, 29, 19).circle(32, 13.5, 2.6);
    L.fill(body, ['#8a6424', '#c8a050', '#f2d890', '#fff8e0', '#ffffff', '#ffffff'], { base: 3.4, grad: 2.2 });
    L.paint(L.mask().line(32, 20, 32, 35), '#e8c878');
    stamp(p, L, '#4a2e10');
    const halo = p.mask().ellipse(32, 9, 5, 1.6).sub(p.mask().ellipse(32, 9, 3.6, 0.7));
    glowMask(p, halo, '#ffffff', 2, 0.6);
    p.paint(halo, '#fff0a0');
    glow(p, 32, 20, 5, '#ffffff', 0.7);
    for (const [x, y, s] of [[10, 6, 3], [54, 8, 3], [8, 32, 2], [56, 30, 2], [32, 38, 2]]) sparkle(p, x, y, s, '#fff4c8');
    vignette(p, TH.kGold, 0.65);
  },

  // ------------------------------------------------------------------ STATUS
  daze: (p) => {
    base(p, TH.grey, 32, 20, 26, 0.3, 50);
    swirl(p, 32, 20, 22, 2, 7, ['#2a2a34', '#4a4a58', '#7a7a8a', '#b0b0c0'], 14, 0.5);
    const L = layer();
    for (const [x, y, r] of [[17, 12, 5], [47, 13, 5.5], [28, 31, 4.5], [50, 31, 4]] as [number, number, number][]) star(L, x, y, r, r * 0.34, ['#2a2a34', '#5a5a6a', '#8a8a9a', '#b8b8c4', '#e0e0e8', '#ffffff'], 4);
    stamp(p, L, '#0a0a10');
    vignette(p, TH.grey);
  },
};

function maskOf(L: P): Mask {
  const m = L.mask();
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (L.alpha(x, y) > 0.3) m.set(x, y);
  return m;
}

// ============================================================================================
export const CARD_ARTS = Object.keys(SCENES) as CardArt[];
const cache = new Map<CardArt, string>();
export function cardArtUrl(art: CardArt): string {
  let u = cache.get(art);
  if (!u) {
    const p = new Pix(CW, CH);
    (SCENES[art] ?? SCENES.daze)(p);
    u = p.url();
    cache.set(art, u);
  }
  return u;
}
