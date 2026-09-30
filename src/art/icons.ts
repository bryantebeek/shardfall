// Procedural 16x16 pixel icons + the small pixel engine shared by textures.ts and cardart.ts.
import type { Element, IntentKind, StatusId } from '../game/types';

export type UiIcon = 'gold' | 'energy' | 'deck' | 'discard' | 'exhaust' | 'heart' | 'shield' | 'sword' | 'crystal' | 'potion' | 'ether' | 'phoenix' | 'elixir' | 'bomb' | 'wind' | 'tonic'
  | 'battle' | 'elite' | 'event' | 'inn' | 'shop' | 'treasure' | 'boss' | 'star' | 'map' | 'lock' | 'skull' | 'xp' | 'card' | 'gear';
export type AccessoryIcon = 'charm' | 'powerRing' | 'magusCirclet' | 'angelFeather' | 'etherStone' | 'swiftBoots' | 'breakerMark' | 'prismLens' | 'luckyCoin' | 'guardianBangle' | 'phoenixPlume' | 'tome' | 'chalice';

// ============================================================================================
// Pixel engine (exported for textures.ts / cardart.ts)
// ============================================================================================
export type RGB = [number, number, number];
const hexCache = new Map<string, RGB>();
export function rgb(c: string): RGB {
  let v = hexCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(c, v);
  }
  return v;
}
export function hex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b);
  return hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}
function rgb2hsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return hex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}
/** Hue-shifted ramp dark→light: shadows drift toward blue/violet, lights toward warm yellow. */
export function ramp(h: number, s: number, n = 6, lo = 0.1, hi = 0.9): string[] {
  const out: string[] = [];
  const toward = (a: number, b: number, t: number) => { let d = ((b - a + 540) % 360) - 180; return a + d * t; };
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const hh = t < 0.5 ? toward(h, 250, (0.5 - t) * 0.5) : toward(h, 55, (t - 0.5) * 0.45);
    const ss = s * (0.75 + 0.35 * Math.sin(t * Math.PI)) * (t > 0.85 ? 0.8 : 1);
    out.push(hsl(hh, Math.min(1, ss), lo + (hi - lo) * t));
  }
  return out;
}
/** Dark tinted outline color derived from a fill color. */
export function darkOf(c: string, k = 0.28): string {
  const [h, s, l] = rgb2hsl(rgb(c));
  const d = ((250 - h + 540) % 360) - 180;
  return hsl(h + d * 0.25, Math.min(1, s * 0.7 + 0.15), Math.min(0.13, l * k));
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Mask {
  b: Uint8Array;
  constructor(public w: number, public h: number, public wrap = false) { this.b = new Uint8Array(w * h); }
  private i(x: number, y: number): number {
    x = Math.floor(x); y = Math.floor(y);
    if (this.wrap) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; }
    else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return y * this.w + x;
  }
  has(x: number, y: number): boolean { const i = this.i(x, y); return i >= 0 && this.b[i] === 1; }
  set(x: number, y: number, v = 1): this { const i = this.i(x, y); if (i >= 0) this.b[i] = v; return this; }
  /** Set every pixel whose center satisfies fn. */
  test(fn: (x: number, y: number) => boolean): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (fn(x + 0.5, y + 0.5)) this.b[y * this.w + x] = 1;
    return this;
  }
  circle(cx: number, cy: number, r: number): this { return this.test((x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r); }
  ellipse(cx: number, cy: number, rx: number, ry: number): this { return this.test((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1); }
  ring(cx: number, cy: number, r0: number, r1: number): this {
    return this.test((x, y) => { const d = (x - cx) ** 2 + (y - cy) ** 2; return d <= r1 * r1 && d >= r0 * r0; });
  }
  rect(x: number, y: number, w: number, h: number): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j);
    return this;
  }
  poly(...p: number[]): this {
    return this.test((x, y) => {
      let c = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    });
  }
  /** Capsule from (x0,y0) to (x1,y1) with radius r. */
  seg(x0: number, y0: number, x1: number, y1: number, r: number): this {
    const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1;
    return this.test((x, y) => {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L));
      return (x - x0 - t * dx) ** 2 + (y - y0 - t * dy) ** 2 <= r * r;
    });
  }
  /** 1px Bresenham line on integer coordinates. */
  line(x0: number, y0: number, x1: number, y1: number): this {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  /** Any non '.'/space char sets a pixel (or only chars in `only`). */
  grid(rows: string[], ox = 0, oy = 0, only?: string): this {
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && ch !== ' ' && (!only || only.includes(ch))) this.set(ox + x, oy + y); }));
    return this;
  }
  add(m: Mask): this { for (let i = 0; i < this.b.length; i++) this.b[i] |= m.b[i]; return this; }
  sub(m: Mask): this { for (let i = 0; i < this.b.length; i++) if (m.b[i]) this.b[i] = 0; return this; }
  and(m: Mask): this { for (let i = 0; i < this.b.length; i++) this.b[i] &= m.b[i]; return this; }
  clone(): Mask { const m = new Mask(this.w, this.h, this.wrap); m.b.set(this.b); return m; }
  invert(): this { for (let i = 0; i < this.b.length; i++) this.b[i] ^= 1; return this; }
  erode(): Mask {
    const m = this.clone();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++)
      if (this.has(x, y) && !(this.has(x - 1, y) && this.has(x + 1, y) && this.has(x, y - 1) && this.has(x, y + 1))) m.b[y * this.w + x] = 0;
    return m;
  }
  grow(diag = false): Mask {
    const m = this.clone();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.has(x, y)) continue;
      if (this.has(x - 1, y) || this.has(x + 1, y) || this.has(x, y - 1) || this.has(x, y + 1) ||
        (diag && (this.has(x - 1, y - 1) || this.has(x + 1, y - 1) || this.has(x - 1, y + 1) || this.has(x + 1, y + 1)))) m.b[y * this.w + x] = 1;
    }
    return m;
  }
  shift(dx: number, dy: number): Mask {
    const m = new Mask(this.w, this.h, this.wrap);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.b[y * this.w + x]) m.set(x + dx, y + dy);
    return m;
  }
  flipX(): Mask {
    const m = new Mask(this.w, this.h, this.wrap);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.b[y * this.w + x]) m.set(this.w - 1 - x, y);
    return m;
  }
  bbox() {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.b[y * this.w + x]) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
}

export interface FillOpts {
  /** rim: edge-lit bevel (default); sphere: round volume; vgrad: top→bottom; flat: single mid color */
  mode?: 'rim' | 'sphere' | 'vgrad' | 'flat';
  base?: number; grad?: number; edge?: number; dither?: boolean; a?: number;
  cx?: number; cy?: number; r?: number; bias?: number;
}

export class Pix {
  d: Uint8ClampedArray;
  wrap = false;
  constructor(public w: number, public h: number) { this.d = new Uint8ClampedArray(w * h * 4); }
  mask(): Mask { return new Mask(this.w, this.h, this.wrap); }
  i(x: number, y: number): number {
    x = Math.floor(x); y = Math.floor(y);
    if (this.wrap) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; }
    else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }
  px(x: number, y: number, c: string, a = 1, add = false): this {
    const i = this.i(x, y);
    if (i < 0 || a <= 0) return this;
    const [r, g, b] = rgb(c), d = this.d;
    if (add) {
      d[i] += r * a; d[i + 1] += g * a; d[i + 2] += b * a; d[i + 3] = Math.max(d[i + 3], a * 255);
      return this;
    }
    const da = d[i + 3] / 255, oa = a + da * (1 - a);
    d[i] = (r * a + d[i] * da * (1 - a)) / oa;
    d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
    d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
    d[i + 3] = oa * 255;
    return this;
  }
  alpha(x: number, y: number): number { const i = this.i(x, y); return i < 0 ? 0 : this.d[i + 3] / 255; }
  color(x: number, y: number): string { const i = this.i(x, y); return i < 0 ? '#000000' : hex(this.d[i], this.d[i + 1], this.d[i + 2]); }
  rect(x: number, y: number, w: number, h: number, c: string, a = 1): this {
    for (let j = y; j < y + h; j++) for (let k = x; k < x + w; k++) this.px(k, j, c, a);
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, a = 1): this {
    return this.paint(this.mask().line(x0, y0, x1, y1), c, a);
  }
  paint(m: Mask, c: string, a = 1): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (m.b[y * this.w + x]) this.px(x, y, c, a);
    return this;
  }
  /** Chars map to colors; '.' and ' ' are skipped. */
  grid(rows: string[], map: Record<string, string>, ox = 0, oy = 0): this {
    rows.forEach((r, y) => [...r].forEach((ch, x) => { const c = map[ch]; if (c) this.px(ox + x, oy + y, c); }));
    return this;
  }
  /** Shade a mask with a dark→light ramp. */
  fill(m: Mask, pal: string | string[], o: FillOpts = {}): this {
    if (typeof pal === 'string') return this.paint(m, pal, o.a ?? 1);
    const n = pal.length, bb = m.bbox();
    if (bb.x1 < 0) return this;
    const mode = o.mode ?? 'rim', base = o.base ?? (n - 1) / 2, grad = o.grad ?? 1.2, edge = o.edge ?? 1;
    const cx = o.cx ?? bb.x0 + bb.w / 2, cy = o.cy ?? bb.y0 + bb.h / 2, r = o.r ?? Math.max(bb.w, bb.h) / 2;
    for (let y = bb.y0; y <= bb.y1; y++) for (let x = bb.x0; x <= bb.x1; x++) {
      if (!m.b[y * this.w + x]) continue;
      let v: number;
      if (mode === 'sphere') {
        const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const l = -0.5 * nx - 0.62 * ny + 0.6 * nz;
        v = ((l + 0.45) / 1.35) * (n - 1) + (o.bias ?? 0);
      } else if (mode === 'vgrad') {
        v = (1 - (y - bb.y0 + 0.5) / bb.h) * (n - 1) + (o.bias ?? 0);
      } else if (mode === 'flat') {
        v = base;
      } else {
        const t = ((x - bb.x0 + 0.5) / bb.w) * 0.4 + ((y - bb.y0 + 0.5) / bb.h) * 0.6;
        v = base + (0.5 - t) * grad;
        if (!m.has(x, y - 1)) v += edge;
        if (!m.has(x - 1, y)) v += edge * 0.5;
        if (!m.has(x, y + 1)) v -= edge;
        if (!m.has(x + 1, y)) v -= edge * 0.5;
      }
      const k = Math.max(0, Math.min(n - 1, o.dither ? Math.floor(v + bayer(x, y)) : Math.round(v)));
      this.px(x, y, pal[k], o.a ?? 1);
    }
    return this;
  }
  /** Selective outline: transparent pixels touching opaque ones get a dark tint of their neighbour. */
  outline(c?: string, diag = false): this {
    const add: [number, number, string][] = [];
    const nb = diag ? [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] : [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 0.3) continue;
      for (const [dx, dy] of nb) if (this.alpha(x + dx, y + dy) > 0.5) { add.push([x, y, c ?? darkOf(this.color(x + dx, y + dy))]); break; }
    }
    for (const [x, y, col] of add) this.px(x, y, col);
    return this;
  }
  /** Soft pixel halo around everything opaque (for glowy icons). */
  halo(c: string, a = 0.45, diag = true): this {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) > 0.05) continue;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!diag && dx && dy) continue;
        if (this.alpha(x + dx, y + dy) > 0.5) { hit = true; break; }
      }
      if (hit) add.push([x, y]);
    }
    for (const [x, y] of add) this.px(x, y, c, a);
    return this;
  }
  /** Composite another Pix on top. */
  draw(src: Pix, dx = 0, dy = 0, a = 1): this {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4, sa = src.d[i + 3] / 255;
      if (sa > 0) this.px(x + dx, y + dy, hex(src.d[i], src.d[i + 1], src.d[i + 2]), sa * a);
    }
    return this;
  }
  canvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.d);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  url(): string { return this.canvas().toDataURL(); }
}

// ============================================================================================
// Palettes (dark → light, hue shifted)
// ============================================================================================
export const PAL = {
  steel: ['#161a2b', '#2c3550', '#4a5877', '#7888a3', '#aebdd0', '#e9f0f6'],
  silver: ['#23222e', '#46495a', '#737b8c', '#a4adb9', '#d2d8de', '#fbfcfd'],
  gold: ['#3a1a14', '#7a3c1a', '#b8701f', '#e8a93a', '#f8d66a', '#fff6c8'],
  bronze: ['#2a1210', '#5a2a18', '#8c5024', '#b87a34', '#dca65a', '#f6d6a0'],
  red: ['#260a1a', '#5a1028', '#9a1c30', '#d4383a', '#f2705a', '#ffb89a'],
  blue: ['#0e1236', '#1b2d6b', '#2a55a8', '#3d8ad8', '#6fc1f0', '#c8f2ff'],
  cyan: ['#0c2340', '#14507a', '#1f8aa8', '#3fc4d4', '#8eeee8', '#eafffb'],
  green: ['#0b2320', '#14472e', '#20703a', '#3fa045', '#86cf5a', '#d8f59e'],
  violet: ['#1a0c2e', '#3a1656', '#6a2a8a', '#9a4ac0', '#c98ae6', '#f4d8ff'],
  fire: ['#3a0c10', '#8a1e14', '#d0461a', '#f28a24', '#fcc848', '#fff6c0'],
  wood: ['#221210', '#4a2618', '#7a4424', '#a86a38', '#d49a5a', '#f2cf94'],
  leather: ['#23140f', '#4a2a1c', '#734530', '#9c6a48', '#c89a6c', '#ecc89a'],
  bone: ['#2c2530', '#5a4e58', '#8e8290', '#c2b8ba', '#e6e0d6', '#fffdf4'],
  parch: ['#3a2418', '#6e4a2c', '#a8804e', '#d4b27a', '#eed8a4', '#fff6d8'],
  white: ['#2c2a44', '#5a5a80', '#9098b8', '#c8cee0', '#eef0f8', '#ffffff'],
  ink: ['#0a0a14', '#161a2a', '#262c44', '#3c4664', '#5e6c90', '#9aa8c8'],
  stone: ['#1a1a26', '#33354a', '#50546a', '#71778a', '#9aa0ae', '#c8ccd4'],
  orange: ['#3a120c', '#7c2a12', '#c4521a', '#ee8a2a', '#fbbf52', '#fff0b0'],
  pink: ['#2e0c24', '#5c1640', '#9a2a60', '#d44a86', '#f28ab4', '#ffd4e6'],
};

// ============================================================================================
// Icon drawing helpers
// ============================================================================================
const S = 16;
type Draw = (p: Pix) => void;

const W = '#ffffff';
const SWORD = [
  '................',
  '..............c.',
  '.............ab.',
  '............ab..',
  '...........ab...',
  '..........ab....',
  '.........ab.....',
  '........ab......',
  '...g...ab.......',
  '....g.ab........',
  '.....Gb.........',
  '.....hG.........',
  '....h..G........',
  '..ph....G.......',
  '.pP.............',
  '................',
];
function sword(p: Pix, ox = 0, oy = 0, blade = PAL.steel, flip = false) {
  const rows = flip ? SWORD.map((r) => [...r].reverse().join('')) : SWORD;
  p.grid(rows, { c: W, a: blade[5], b: blade[3], g: PAL.gold[4], G: PAL.gold[3], h: PAL.leather[2], p: PAL.gold[4], P: PAL.gold[2] }, ox, oy);
}
export function kiteMask(p: Pix, s = 1, ox = 0, oy = 0): Mask {
  const k = (v: number, o: number) => o + (v - 8) * s + 8;
  return p.mask().poly(k(2.5, ox), k(2, oy), k(13.5, ox), k(2, oy), k(13.5, ox), k(7.5, oy), k(11.8, ox), k(11, oy), k(8, ox), k(14.3, oy), k(4.2, ox), k(11, oy), k(2.5, ox), k(7.5, oy));
}
export function shield(p: Pix, face = PAL.blue, rim = PAL.silver, s = 1, ox = 0, oy = 0, emblem = true) {
  const m = kiteMask(p, s, ox, oy);
  p.fill(m, rim, { base: 3.2 });
  const inner = m.erode();
  p.fill(inner, face, { base: 2.6, grad: 1.6 });
  if (emblem) {
    const b = inner.bbox(), cx = Math.floor(b.x0 + b.w / 2);
    const e = p.mask().rect(cx - 1, b.y0 + 1, 2, b.h - 3).rect(b.x0 + 1, b.y0 + 3, b.w - 2, 2).and(inner.erode());
    p.fill(e, PAL.gold, { base: 3.4 });
  }
}
export function tongue(p: Pix, cx: number, by: number, w: number, h: number, lean = 0): Mask {
  const r = w / 2, tb = Math.min(0.6, r / h);
  return p.mask().test((x, y) => {
    const t = (by - y) / h;
    if (t < 0 || t > 1) return false;
    const hw = t < tb ? r * Math.sqrt(Math.max(0, 1 - ((tb - t) / tb) ** 2)) : r * Math.pow(1 - (t - tb) / (1 - tb), 1.3);
    return Math.abs(x - (cx + lean * Math.sin(t * Math.PI * 0.85) * t)) <= hw;
  });
}
export function flame(p: Pix, cx: number, by: number, w: number, h: number, pal = PAL.fire, lean = 1) {
  const outer = tongue(p, cx, by, w, h, lean)
    .add(tongue(p, cx - w * 0.3, by - h * 0.1, w * 0.45, h * 0.62, -lean * 1.2))
    .add(tongue(p, cx + w * 0.3, by - h * 0.06, w * 0.42, h * 0.5, lean * 1.2));
  p.paint(outer, pal[2]);
  p.paint(outer.and(p.mask().rect(0, Math.round(by - 2), 64, 3)), pal[1], 0.6);
  p.paint(tongue(p, cx + 0.2, by - 0.6, w * 0.66, h * 0.7, lean * 0.8), pal[3]);
  p.paint(tongue(p, cx + 0.3, by - 1, w * 0.4, h * 0.42, lean * 0.5), pal[4]);
  p.paint(tongue(p, cx + 0.3, by - 1.2, w * 0.18, h * 0.2, 0), pal[5]);
}
function flask(p: Pix, liquid: string[], shape: 'round' | 'tall' | 'fancy' = 'round') {
  const glass = PAL.white;
  const body = p.mask();
  if (shape === 'round') body.circle(8, 10, 4.6).rect(6, 3, 4, 4);
  else if (shape === 'tall') body.poly(5.5, 6, 10.5, 6, 10.5, 13.5, 9.5, 14.5, 6.5, 14.5, 5.5, 13.5).rect(6, 3, 4, 3);
  else body.poly(8, 5.5, 13, 11, 11.5, 14.5, 4.5, 14.5, 3, 11).rect(6.5, 3, 3, 3);
  p.fill(body, [glass[2], glass[3], glass[4]], { base: 1 });
  const liq = body.erode().and(p.mask().rect(0, shape === 'tall' ? 8 : 8, 16, 8));
  p.fill(liq, liquid, shape === 'round' ? { mode: 'sphere', cx: 8, cy: 10, r: 4.6, bias: 0.3 } : { base: 2.8, grad: 2 });
  // cork
  p.fill(p.mask().rect(6, 1, 4, 2), PAL.wood, { base: 3 });
  // glass glint
  p.px(shape === 'round' ? 5 : 6, shape === 'round' ? 8 : 7, W).px(shape === 'round' ? 5 : 6, shape === 'round' ? 9 : 8, glass[4]);
}
export function star(p: Pix, cx: number, cy: number, r: number, ri: number, pal: string[], points = 5, rot = -Math.PI / 2): Mask {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points, rr = i % 2 ? ri : r;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  const m = p.mask().poly(...pts);
  p.fill(m, pal, { base: 3.3, grad: 1.6 });
  return m;
}
function sparkle(p: Pix, x: number, y: number, c = W, big = false) {
  p.px(x, y, c).px(x - 1, y, c, 0.7).px(x + 1, y, c, 0.7).px(x, y - 1, c, 0.7).px(x, y + 1, c, 0.7);
  if (big) p.px(x - 2, y, c, 0.35).px(x + 2, y, c, 0.35).px(x, y - 2, c, 0.35).px(x, y + 2, c, 0.35);
}
function coin(p: Pix, cx: number, cy: number, rx: number, ry: number, pal = PAL.gold) {
  const m = p.mask().ellipse(cx, cy, rx, ry);
  p.fill(m, pal, { base: 3.4, grad: 1.5 });
  p.fill(p.mask().ellipse(cx, cy, rx - 1.3, ry - 1.3).sub(p.mask().ellipse(cx + 0.5, cy + 0.5, rx - 1.3, ry - 1.3)), [pal[5]], { mode: 'flat' });
  p.fill(p.mask().ellipse(cx, cy, rx - 1.3, ry - 1.3).sub(p.mask().ellipse(cx - 0.5, cy - 0.5, rx - 1.3, ry - 1.3)), [pal[1]], { mode: 'flat' });
}
function skull(p: Pix, oy = 0, pal = PAL.bone, horns = false) {
  if (horns) {
    const h = p.mask().poly(3.5, 6, 1, 2.5, 1.2, 0.8, 3.5, 3, 5.5, 4.5).add(p.mask().poly(12.5, 6, 15, 2.5, 14.8, 0.8, 12.5, 3, 10.5, 4.5));
    p.fill(h.shift(0, oy), PAL.red, { base: 3 });
  }
  const m = p.mask().circle(8, 7 + oy, 5.4).rect(5, 10 + oy, 6, 4);
  p.fill(m, pal, { base: 3.4, grad: 1.8 });
  const dark = darkOf(pal[1], 0.8);
  p.grid(['.xx...xx.', '.xx...xx.', '....x....'], { x: dark }, 4, 7 + oy);
  p.grid(['x.x.x'], { x: dark }, 6, 12 + oy);
  p.px(5, 7 + oy, pal[2]).px(10, 7 + oy, pal[2]);
}
const Q_MARK = ['.xxxx.', 'xx..xx', '....xx', '...xx.', '..xx..', '..xx..', '......', '..xx..', '..xx..'];
function qmark(p: Pix, ox: number, oy: number, pal: string[]) {
  const m = p.mask().grid(Q_MARK, ox, oy);
  p.fill(m, pal, { base: 3.4, grad: 1.2 });
}
function cardStack(p: Pix, n: number, face: string[], emblem = PAL.gold) {
  for (let i = 0; i < n; i++) {
    const x = 2 + (n - 1 - i) * 2, y = 5 - (n - 1 - i) * 2;
    const m = p.mask().rect(x, y, 8, 10);
    p.paint(m.grow(), darkOf(face[1]));
    p.fill(m, face, { base: 2.4, grad: 1.2 });
    p.paint(m.erode().sub(m.erode().erode()), face[4], 0.5);
    if (i === n - 1) {
      const cx = x + 4, cy = y + 5;
      p.fill(p.mask().poly(cx, cy - 2.6, cx + 2.1, cy, cx, cy + 2.6, cx - 2.1, cy), emblem, { base: 3.5 });
    }
  }
}
function arrow(p: Pix, cx: number, cy: number, ang: number, size: number, pal: string[]) {
  const pts = [[0, -4.5], [4, -0.5], [1.6, -0.5], [1.6, 4.5], [-1.6, 4.5], [-1.6, -0.5], [-4, -0.5]];
  const c = Math.cos(ang), sn = Math.sin(ang), out: number[] = [];
  for (const [x, y] of pts) out.push(cx + (x * c - y * sn) * size, cy + (x * sn + y * c) * size);
  p.fill(p.mask().poly(...out), pal, { base: 3.3, grad: 1.6 });
}
function feather(p: Pix, pal: string[], quill: string, tip?: string[]) {
  // Pixel-exact diagonal feather. Spine on x+y=15; vanes are the anti-diagonal layers either side.
  const ul: [number, number][] = [[3, 13], [3, 12], [4, 11], [5, 9], [6, 7]];
  const lr: [number, number][] = [[3, 13], [4, 12], [5, 11], [7, 10]];
  const ulShade = [3, 4, 4, 5, 5], lrShade = [3, 2, 2, 1];
  const put = (x: number, y: number, k: number) => {
    const P = tip && x >= 10 ? tip : pal;
    if ((x - y + 40) % 4 === 0) k = Math.max(0, k - 1);
    p.px(x, y, P[k]);
  };
  ul.forEach(([a, b], i) => { for (let x = a; x <= b; x++) if (!(x === 8 && i >= 2)) put(x, 15 - (i + 1) - x, ulShade[i]); });
  lr.forEach(([a, b], i) => { for (let x = a; x <= b; x++) if (!(x === 9 && i >= 1)) put(x, 15 + (i + 1) - x, lrShade[i]); });
  for (let x = 1; x <= 12; x++) p.px(x, 15 - x, quill);
  put(13, 2, 5); put(14, 1, 4);
}
function boot(p: Pix) {
  const m = p.mask().poly(5, 2.5, 10, 2.5, 10, 10, 14, 11.5, 14, 14, 4.5, 14, 4.5, 8);
  p.fill(m, PAL.leather, { base: 3 });
  p.fill(p.mask().rect(5, 3, 5, 2), PAL.bronze, { base: 3.4 });
  p.fill(p.mask().rect(4, 13, 10, 1), PAL.leather, { base: 1 });
  // wing
  const w = p.mask().poly(10, 5, 15, 2, 14.5, 4.5, 15.2, 5, 13.5, 7, 14, 7.5, 11, 9);
  p.fill(w, PAL.white, { base: 3.6 });
  p.px(12, 6, PAL.white[2]).px(13, 5, PAL.white[2]);
}
function gem(p: Pix, cx: number, cy: number, r: number, pal: string[]) {
  const m = p.mask().poly(cx - r, cy - r * 0.3, cx - r * 0.5, cy - r, cx + r * 0.5, cy - r, cx + r, cy - r * 0.3, cx, cy + r);
  p.fill(m, pal, { base: 2.6, grad: 1.5 });
  const top = p.mask().poly(cx - r * 0.5, cy - r * 0.35, cx - r * 0.25, cy - r * 0.9, cx + r * 0.25, cy - r * 0.9, cx + r * 0.5, cy - r * 0.35).and(m);
  p.fill(top, [pal[4]], { mode: 'flat' });
  p.fill(p.mask().poly(cx, cy + r, cx + r, cy - r * 0.3, cx + r * 0.5, cy - r * 0.3).and(m), [pal[1]], { mode: 'flat' });
  p.px(Math.floor(cx - r * 0.3), Math.floor(cy - r * 0.6), W);
}
function ringBand(p: Pix, cx: number, cy: number, rx: number, ry: number, th: number, pal: string[]) {
  const m = p.mask().ellipse(cx, cy, rx, ry).sub(p.mask().ellipse(cx, cy + 0.3, rx - th, ry - th));
  p.fill(m, pal, { base: 3, grad: 2 });
}
function bolt(p: Pix, pal: string[], s = 1, ox = 0, oy = 0) {
  const k = (v: number, o: number) => o + (v - 8) * s + 8;
  const m = p.mask().poly(k(10, ox), k(1, oy), k(3.5, ox), k(9, oy), k(7.5, ox), k(9, oy), k(5.5, ox), k(15, oy), k(12.8, ox), k(6.5, oy), k(8.6, ox), k(6.5, oy), k(11, ox), k(1, oy));
  p.fill(m, pal, { base: 3.6, grad: 1.5 });
}
function leaf(p: Pix, pal: string[], ox = 0, oy = 0) {
  const m = p.mask().test((x, y) => {
    x -= ox; y -= oy;
    const u = ((x - 2) + (13 - y)) / Math.SQRT2, v = ((x - 2) - (13 - y)) / Math.SQRT2;
    const L = 13.5;
    if (u < 1 || u > L) return false;
    return Math.abs(v) <= 3.4 * Math.sin((Math.PI * u) / L);
  });
  p.fill(m, pal, { base: 3, grad: 1.8 });
  p.paint(p.mask().line(3 + ox, 12 + oy, 10 + ox, 5 + oy), pal[1]);
}
function drip(p: Pix, cx: number, cy: number, r: number, pal: string[]) {
  const m = p.mask().circle(cx, cy, r).poly(cx - r * 0.85, cy - r * 0.4, cx, cy - r * 2.3, cx + r * 0.85, cy - r * 0.4);
  p.fill(m, pal, { mode: 'sphere', cx, cy, r, bias: 0.4 });
  p.px(Math.floor(cx - r * 0.45), Math.floor(cy - r * 0.35), W, 0.9);
}
function helm(p: Pix, pal: string[], open = false) {
  const m = p.mask().circle(8, 7.5, 5.6).rect(2.5, 7, 11, 6).poly(2.5, 12, 13.5, 12, 12, 14.5, 4, 14.5);
  p.fill(m, pal, { base: 3, grad: 2 });
  // crest + visor
  const slit = p.mask().rect(4, 8, 8, 1).rect(7, 8, 2, 4);
  if (open) slit.rect(5, 11, 6, 3);
  p.paint(slit, darkOf(pal[1], 0.5));
  if (open) p.paint(p.mask().rect(6, 12, 4, 1), PAL.red[3]);
  p.paint(p.mask().rect(7, 2, 2, 4), pal[5], 0.8);
}

// ============================================================================================
// Icon definitions
// ============================================================================================
const ELEMENT: Record<Element, Draw> = {
  phys: (p) => { sword(p); p.outline(); },
  fire: (p) => { flame(p, 8, 14.6, 10, 13.6); p.outline(); },
  ice: (p) => {
    const m = p.mask();
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3 - Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
      m.seg(8, 8, 8 + ca * 6.2, 8 + sa * 6.2, 0.75);
      const bx = 8 + ca * 4.2, by = 8 + sa * 4.2;
      m.seg(bx, by, bx + Math.cos(a + 0.95) * 1.7, by + Math.sin(a + 0.95) * 1.7, 0.55).seg(bx, by, bx + Math.cos(a - 0.95) * 1.7, by + Math.sin(a - 0.95) * 1.7, 0.55);
    }
    p.fill(m, PAL.cyan, { mode: 'sphere', cx: 8, cy: 8, r: 7, bias: 1.4 });
    p.paint(p.mask().circle(8, 8, 1.6), W);
    p.outline();
  },
  thunder: (p) => { bolt(p, PAL.gold); p.outline(); },
  holy: (p) => {
    const rays = p.mask();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4, L = k % 2 ? 5.6 : 6.6;
      rays.line(8 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, 8 + Math.cos(a) * L, 8 + Math.sin(a) * L);
    }
    p.paint(rays, PAL.gold[4]);
    p.fill(p.mask().circle(8.5, 8.5, 3.9), PAL.gold, { mode: 'sphere', bias: 1.5 });
    p.outline();
  },
  dark: (p) => {
    const c = p.mask().circle(8, 8, 6);
    p.fill(c, PAL.violet, { mode: 'sphere', bias: 0.8 });
    const shadow = p.mask().circle(9.8, 6.6, 5).and(c);
    p.fill(shadow, [PAL.ink[0], PAL.ink[1], PAL.violet[1]], { mode: 'sphere', cx: 9.8, cy: 6.6, r: 5 });
    p.outline();
    p.px(3, 3, PAL.violet[4]).px(13, 13, PAL.violet[3]);
  },
};

const INTENT: Record<IntentKind, Draw> = {
  attack: (p) => { sword(p); p.outline(); },
  attackAll: (p) => {
    for (let i = 0; i < 3; i++) {
      const cx = -1.2 + i * 4.6;
      const m = p.mask().circle(cx, 8, 6.2).sub(p.mask().circle(cx - 2.1, 8, 6.5)).and(p.mask().rect(1, 1, 14, 14));
      p.fill(m, PAL.red, { base: 3.4, grad: 2 });
      p.paint(m.clone().sub(p.mask().circle(cx - 1.1, 8, 6.3)), PAL.red[5]);
    }
    p.outline();
  },
  defend: (p) => { shield(p, PAL.blue, PAL.silver); p.outline(); },
  buff: (p) => { arrow(p, 8, 8, 0, 1.4, PAL.orange); p.outline(); p.px(2, 12, PAL.orange[4]).px(13, 3, PAL.orange[5]).px(12, 12, PAL.orange[3]); },
  debuff: (p) => {
    arrow(p, 7, 7.5, Math.PI, 1.25, PAL.violet);
    drip(p, 12.5, 12.5, 1.9, PAL.violet);
    p.outline();
  },
  attackDebuff: (p) => { sword(p, -1, 0); drip(p, 11.5, 12, 2.4, PAL.violet); p.outline(); },
  defendBuff: (p) => { shield(p, PAL.blue, PAL.silver, 0.8, -2, 1.2); arrow(p, 12, 5, 0, 0.75, PAL.orange); p.outline(); },
  special: (p) => {
    star(p, 8, 8, 7, 3.1, PAL.violet, 4);
    p.px(8, 4, PAL.violet[5]).px(8, 5, PAL.violet[5]).px(7, 7, W).px(8, 7, W);
    p.outline();
    p.px(2, 2, PAL.violet[4]).px(13, 13, PAL.violet[4]).px(13, 2, PAL.violet[3]);
  },
  stunned: (p) => {
    p.paint(p.mask().ellipse(8, 10.5, 6.8, 3).sub(p.mask().ellipse(8, 10.3, 5.6, 2)), PAL.gold[2]);
    p.outline();
    star(p, 3.5, 9.5, 3, 1.3, PAL.gold, 5);
    star(p, 11.5, 5.2, 3.6, 1.5, PAL.gold, 5);
    star(p, 9.2, 13, 2.4, 1.1, PAL.gold, 5);
    p.outline();
  },
  unknown: (p) => { qmark(p, 5, 3, PAL.silver); p.outline(); },
};

function crackedSword(p: Pix, blade = PAL.stone) {
  const lo = new Pix(S, S), hi = new Pix(S, S);
  sword(lo, -1, 1, blade); sword(hi, -1, 1, blade);
  for (let y = 0; y < 7; y++) for (let x = 0; x < S; x++) lo.d.fill(0, lo.i(x, y), lo.i(x, y) + 4);
  for (let y = 5; y < S; y++) for (let x = 0; x < S; x++) hi.d.fill(0, hi.i(x, y), hi.i(x, y) + 4);
  p.draw(lo).draw(hi, 1, -1);
}

const STATUS: Record<StatusId, Draw> = {
  str: (p) => {
    const blade = p.mask().poly(8, 1, 9.6, 3, 9.6, 10, 6.4, 10, 6.4, 3);
    p.fill(blade, PAL.steel, { base: 3.4 });
    p.paint(p.mask().rect(8, 3, 1, 7), PAL.steel[5]);
    p.fill(p.mask().rect(4, 10, 8, 2), PAL.gold, { base: 3.2 });
    p.fill(p.mask().rect(7, 12, 2, 2), PAL.leather, { base: 2.5 });
    p.fill(p.mask().rect(6.5, 14, 3, 1), PAL.gold, { base: 3 });
    p.fill(p.mask().grid(['.x.', 'xxx'], 1, 3).grid(['.x.', 'xxx'], 12, 3).grid(['.x.', 'xxx'], 1, 7).grid(['.x.', 'xxx'], 12, 7), PAL.orange, { base: 4 });
    p.outline();
  },
  weak: (p) => { crackedSword(p); p.outline(); p.px(11, 6, PAL.red[4]).px(12, 7, PAL.red[3]).px(9, 3, PAL.red[3]); },
  vuln: (p) => {
    shield(p, PAL.violet, PAL.stone, 1, 0, 0, false);
    p.paint(p.mask().grid(['..x.', '..x.', '.x..', '.xx.', '..x.', '..xx', '...x', '..x.', '..x.'], 5, 3), PAL.ink[0]);
    p.paint(p.mask().grid(['...x', '...x', '..x.', '....', '...x', '....', '....', '...x'], 5, 3), PAL.violet[5], 0.6);
    p.outline();
  },
  regen: (p) => {
    const m = p.mask().test((x, y) => {
      const u = ((x - 1.5) + (14.5 - y)) / Math.SQRT2, v = ((x - 1.5) - (14.5 - y)) / Math.SQRT2 + 0.5 * Math.sin(u / 3);
      const L = 13.2;
      if (u < 2 || u > L) return false;
      const t = (u - 2) / (L - 2);
      return Math.abs(v) <= 3.5 * Math.pow(Math.sin(Math.PI * t), 0.8) * (1 - 0.25 * t);
    });
    p.fill(m, PAL.green, { base: 3, grad: 1.8 });
    p.paint(p.mask().line(2, 14, 4, 12).line(4, 12, 9, 7), PAL.green[4]);
    p.paint(p.mask().line(6, 10, 5, 7).line(8, 8, 7, 5).line(6, 10, 9, 11).line(8, 8, 11, 9), PAL.green[2]);
    const plus = p.mask().rect(11, 1, 2, 6).rect(9, 3, 6, 2);
    p.paint(plus, PAL.green[5]);
    p.paint(p.mask().rect(11, 3, 2, 2), W);
    p.outline();
  },
  burn: (p) => {
    flame(p, 8, 14.6, 9, 11.5, PAL.fire, -1);
    p.outline();
    p.px(3, 3, PAL.fire[4]).px(12, 2, PAL.fire[3]).px(13, 6, PAL.fire[4]);
  },
  taunt: (p) => {
    p.fill(p.mask().poly(5, 3, 8, 0.5, 11, 3, 8, 4), PAL.red, { base: 3.5 });
    helm(p, PAL.steel, true);
    p.outline();
    p.fill(p.mask().grid(['x..', '.x.', '...', 'xx.'], 0, 2).grid(['..x', '.x.', '...', '.xx'], 13, 2), PAL.orange, { base: 4.5 });
  },
  thorns: (p) => {
    const vine = p.mask().ring(8, 8, 2.6, 4.3);
    const spikes = p.mask();
    for (let k = 0; k < 6; k++) {
      const a = (k * 2 * Math.PI) / 6 - 1.2, x0 = 8 + Math.cos(a) * 3.8, y0 = 8 + Math.sin(a) * 3.8, t = a + 0.45;
      spikes.poly(x0 + Math.cos(t + 1.5) * 1.4, y0 + Math.sin(t + 1.5) * 1.4, x0 + Math.cos(t) * 4.2, y0 + Math.sin(t) * 4.2, x0 + Math.cos(t - 1.5) * 1.4, y0 + Math.sin(t - 1.5) * 1.4);
    }
    p.fill(spikes.sub(vine).and(p.mask().rect(1, 1, 14, 14)), PAL.bone, { base: 3.6 });
    p.fill(vine, [PAL.wood[0], PAL.wood[1], PAL.wood[2], PAL.green[2], PAL.green[3], PAL.green[4]], { base: 2.6, grad: 2 });
    p.paint(p.mask().ring(8, 8, 3.2, 3.6).and(p.mask().test((x, y) => (x + y) % 3 < 1)), PAL.wood[1]);
    p.outline();
  },
  ironwall: (p) => {
    const bricks = [[1, 2, 6, 4], [8, 2, 7, 4], [1, 7, 3, 3], [5, 7, 6, 3], [12, 7, 3, 3], [1, 11, 6, 3], [8, 11, 7, 3]];
    p.rect(1, 2, 14, 12, PAL.steel[0]);
    for (const [x, y, w, h] of bricks) {
      p.fill(p.mask().rect(x, y, w - (x + w >= 15 ? 0 : 0), h), PAL.steel, { base: 2.6, grad: 1.5 });
      p.px(x + 1, y + 1, PAL.steel[5]);
      if (w > 4) p.px(x + w - 2, y + h - 1, PAL.steel[1]);
    }
    p.outline();
  },
  rampart: (p) => {
    const m = p.mask().rect(2, 6, 12, 9).rect(1, 2, 3, 5).rect(6, 2, 4, 5).rect(12, 2, 3, 5);
    p.fill(m, PAL.stone, { base: 3, grad: 1.6 });
    p.paint(p.mask().rect(7, 10, 2, 5), PAL.ink[0]);
    p.paint(p.mask().line(2, 9, 6, 9).line(10, 12, 13, 12).line(3, 12, 5, 12), PAL.stone[1]);
    p.outline();
  },
  prayer: (p) => {
    p.fill(p.mask().rect(6, 7, 4, 7), PAL.bone, { base: 3.5, grad: 1.8 });
    p.px(9, 8, PAL.bone[5]).px(9, 9, PAL.bone[5]);
    p.fill(p.mask().ellipse(8, 14.5, 5, 1.3), PAL.gold, { base: 3 });
    p.paint(p.mask().rect(8, 6, 1, 1), PAL.ink[1]);
    flame(p, 8.5, 6.2, 3.2, 5.5, PAL.fire, 0.4);
    p.outline();
    p.px(3, 4, PAL.gold[5]).px(13, 5, PAL.gold[4]).px(12, 2, PAL.gold[5]);
  },
  ward: (p) => {
    const wingL = p.mask().poly(5, 5, 0.8, 2.5, 1, 5, 1.8, 6, 1.1, 7.5, 2.3, 8.5, 1.8, 10, 5, 10);
    p.fill(wingL, PAL.white, { base: 3.6 }); p.fill(wingL.flipX(), PAL.white, { base: 3.4 });
    shield(p, PAL.cyan, PAL.gold, 0.62, 0, 0.5, false);
    p.px(8, 7, W).px(7, 8, W).px(8, 8, W).px(9, 8, W).px(8, 9, W);
    p.outline();
  },
  ritual: (p) => {
    p.fill(p.mask().circle(8, 8, 6.6), [PAL.ink[0], PAL.violet[0], PAL.violet[1]], { mode: 'sphere' });
    p.fill(p.mask().ring(8, 8, 5.5, 6.8), PAL.violet, { base: 3.2 });
    const pent = p.mask(), pts: [number, number][] = [];
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5; pts.push([7.5 + Math.cos(a) * 4.4, 7.8 + Math.sin(a) * 4.4]); }
    for (let k = 0; k < 5; k++) { const [a, b] = pts[k], [c, d] = pts[(k + 2) % 5]; pent.line(a, b, c, d); }
    p.paint(pent, PAL.violet[4]);
    p.px(7, 7, PAL.red[4]).px(8, 7, PAL.red[3]);
    p.outline();
  },
};

const UI: Record<UiIcon, Draw> = {
  gold: (p) => {
    const stack = (cx: number, n: number, top: number) => {
      for (let i = 0; i < n; i++) {
        const cy = top + (n - 1 - i) * 2;
        p.paint(p.mask().ellipse(cx, cy + 1.5, 3.6, 1.6), PAL.gold[0]);
        p.paint(p.mask().ellipse(cx, cy + 1, 3.6, 1.6), PAL.gold[2]);
        p.paint(p.mask().ellipse(cx, cy, 3.6, 1.6), PAL.gold[4]);
        p.paint(p.mask().ellipse(cx - 0.4, cy - 0.3, 2.2, 0.7), PAL.gold[5]);
      }
    };
    stack(10.6, 5, 4); stack(5, 3, 8.5);
    p.outline();
  },
  energy: (p) => {
    const m = p.mask().circle(8, 8, 6);
    p.fill(m, PAL.cyan, { mode: 'sphere', bias: 0.3 });
    p.fill(p.mask().poly(8, 3.5, 10.8, 8, 8, 12.5, 5.2, 8), [PAL.cyan[4], PAL.cyan[5], W], { mode: 'sphere', cx: 7, cy: 7, r: 5 });
    p.px(5, 4, W).px(4, 5, PAL.cyan[5]);
    p.outline();
  },
  deck: (p) => { cardStack(p, 3, PAL.blue); p.outline(); },
  card: (p) => {
    const m = p.mask().rect(3, 1, 10, 14);
    p.paint(m.grow(), darkOf(PAL.blue[1]));
    p.fill(m, PAL.blue, { base: 2.4, grad: 1.2 });
    p.paint(m.erode().sub(m.erode().erode()), PAL.blue[4], 0.5);
    p.fill(p.mask().poly(8, 4.5, 11, 8, 8, 11.5, 5, 8), PAL.gold, { base: 3.5 });
    p.outline();
  },
  gear: (p) => {
    // centred on (8, 8) so it spins in place
    const m = p.mask().test((x, y) => {
      const dx = x - 8, dy = y - 8, r = Math.hypot(dx, dy);
      return r <= 5.3 || (r <= 7.4 && Math.cos(Math.atan2(dy, dx) * 6) > -0.1);
    }).sub(p.mask().circle(8, 8, 2.2));
    p.fill(m, PAL.silver, { base: 3.2, grad: 1.4 });
    p.outline();
  },
  discard: (p) => {
    const back = p.mask().rect(2, 3, 8, 10);
    p.paint(back.grow(), darkOf(PAL.stone[1]));
    p.fill(back, PAL.stone, { base: 2.2 });
    const c = Math.cos(0.5), sn = Math.sin(0.5), pts: number[] = [];
    for (const [x, y] of [[-4, -5], [4, -5], [4, 5], [-4, 5]]) pts.push(9.5 + x * c - y * sn, 9 + x * sn + y * c);
    const top = p.mask().poly(...pts);
    p.paint(top.grow(), darkOf(PAL.stone[1]));
    p.fill(top, PAL.stone, { base: 3.2 });
    p.fill(p.mask().circle(9.5, 9, 1.6), PAL.stone, { base: 1.5 });
    p.outline();
  },
  exhaust: (p) => {
    const m = p.mask().rect(3, 3, 8, 11);
    p.paint(m.grow(), PAL.ink[0]);
    p.fill(m, PAL.ink, { base: 3 });
    flame(p, 8.5, 14.6, 9, 12, PAL.violet, 0.8);
    p.outline();
    p.px(13, 3, PAL.violet[4]).px(2, 1, PAL.violet[3]).px(12, 1, PAL.violet[5]);
  },
  heart: (p) => {
    const m = p.mask().circle(5.2, 6.3, 3.4).circle(10.8, 6.3, 3.4).poly(1.9, 7.2, 14.1, 7.2, 8, 14.2);
    p.fill(m, PAL.red, { base: 3, grad: 2 });
    p.px(4, 5, PAL.red[5]).px(4, 4, W).px(5, 4, PAL.red[5]);
    p.outline();
  },
  shield: (p) => { shield(p); p.outline(); },
  sword: (p) => { sword(p); p.outline(); },
  crystal: (p) => {
    const m = p.mask().poly(8, 1, 12, 5, 11, 12.5, 8, 15, 5, 12.5, 4, 5);
    p.fill(m, PAL.cyan, { base: 2.4 });
    p.fill(p.mask().poly(8, 1, 8, 15, 5, 12.5, 4, 5).and(m), [PAL.cyan[4]], { mode: 'flat' });
    p.fill(p.mask().poly(8, 1, 8, 15, 6.5, 12.5, 6, 5).and(m), [PAL.cyan[5]], { mode: 'flat' });
    p.outline();
    p.px(13, 2, W).px(2, 10, PAL.cyan[4]);
  },
  potion: (p) => { flask(p, PAL.red); p.outline(); },
  ether: (p) => { flask(p, PAL.blue); p.outline(); },
  elixir: (p) => { flask(p, PAL.gold, 'fancy'); p.outline(); p.px(2, 4, PAL.gold[5]).px(13, 6, PAL.gold[4]); },
  tonic: (p) => { flask(p, PAL.green, 'tall'); p.outline(); },
  wind: (p) => {
    flask(p, [PAL.cyan[2], PAL.cyan[3], PAL.cyan[4]]);
    p.paint(p.mask().grid(['.xxx.', 'x...x', 'x.xx.', '.x...'], 6, 8), W, 0.9);
    p.outline();
  },
  phoenix: (p) => { feather(p, PAL.orange, PAL.gold[5]); p.outline(); p.px(13, 1, PAL.fire[4]); },
  bomb: (p) => {
    const m = p.mask().circle(7, 9.5, 5.3);
    p.fill(m, PAL.ink, { mode: 'sphere', bias: 0.6 });
    p.fill(p.mask().rect(8, 3, 3, 2), PAL.steel, { base: 2.5 });
    p.paint(p.mask().line(10, 3, 11, 2).line(12, 2, 12, 1), PAL.parch[3]);
    p.px(4, 7, PAL.ink[5]).px(5, 6, PAL.ink[5]);
    p.outline();
    p.px(13, 1, PAL.fire[5]).px(14, 1, PAL.fire[4]).px(13, 0, PAL.fire[4]).px(12, 0, PAL.fire[3], 0.6).px(14, 2, PAL.fire[3], 0.6);
  },
  battle: (p) => { sword(p); sword(p, 0, 0, PAL.steel, true); p.outline(); },
  elite: (p) => { skull(p, 1, PAL.bone, true); p.outline(); },
  event: (p) => {
    p.fill(p.mask().rect(3, 2, 10, 12), PAL.parch, { base: 3.3, grad: 1 });
    p.fill(p.mask().rect(2, 1, 12, 2).rect(2, 13, 12, 2), PAL.parch, { base: 2.2 });
    qmark(p, 5, 4, [PAL.red[1], PAL.red[2], PAL.red[2], PAL.red[3], PAL.red[3], PAL.red[4]]);
    p.outline();
  },
  inn: (p) => {
    p.fill(p.mask().seg(2, 13, 14, 11, 1.1), PAL.wood, { base: 2.6 });
    p.fill(p.mask().seg(2, 11, 14, 13, 1.1), PAL.wood, { base: 3.2 });
    flame(p, 8, 12, 8, 11, PAL.fire, 0.6);
    p.outline();
    p.px(4, 3, PAL.fire[4]).px(12, 4, PAL.fire[3]);
  },
  shop: (p) => {
    const m = p.mask().circle(8, 10, 5.2).poly(5.5, 5, 10.5, 5, 9, 7, 7, 7);
    p.fill(m, PAL.leather, { mode: 'sphere', bias: 0.8 });
    p.fill(p.mask().poly(5, 2, 11, 2, 9.5, 5, 6.5, 5), PAL.leather, { base: 3 });
    p.paint(p.mask().rect(6, 5, 4, 1), PAL.gold[3]);
    coin(p, 8, 10.5, 2.6, 2.6);
    p.outline();
  },
  treasure: (p) => {
    const lid = p.mask().rect(2, 3, 12, 4).sub(p.mask().rect(2, 3, 1, 1)).sub(p.mask().rect(13, 3, 1, 1));
    p.fill(lid, PAL.wood, { base: 3.2, grad: 1.5 });
    p.fill(p.mask().rect(2, 8, 12, 6), PAL.wood, { base: 2.4, grad: 1.5 });
    p.fill(p.mask().rect(2, 7, 12, 1).rect(4, 3, 1, 11).rect(11, 3, 1, 11), PAL.gold, { base: 3 });
    p.fill(p.mask().rect(7, 6, 2, 3), PAL.gold, { base: 4.2 });
    p.px(7, 8, PAL.ink[1]);
    p.outline();
  },
  boss: (p) => {
    const head = p.mask().poly(1, 8, 4, 5, 8, 3.5, 12, 4, 14.5, 7, 14.5, 12, 11, 14.5, 7, 12, 3, 12, 1, 10.5);
    p.fill(head, PAL.red, { base: 2.8, grad: 2 });
    p.fill(p.mask().poly(9, 4.5, 11, 1, 12.6, 1, 12, 5).add(p.mask().poly(12, 5.5, 14.8, 2.2, 14.8, 4, 14, 7)), PAL.bone, { base: 3.4 });
    p.paint(p.mask().line(2, 10, 7, 10), PAL.ink[0]);
    p.px(2, 11, W).px(4, 11, W).px(6, 11, W);
    p.px(8, 6, PAL.gold[5]).px(9, 6, PAL.gold[4]).px(9, 7, PAL.ink[0]);
    p.px(3, 7, PAL.ink[0]);
    p.outline();
  },
  star: (p) => { star(p, 8, 8.6, 7.3, 3.1, PAL.gold); p.px(7, 5, W).px(6, 7, PAL.gold[5]); p.outline(); },
  map: (p) => {
    const m = p.mask().poly(1.5, 3, 5.5, 2, 10.5, 3.5, 14.5, 2.5, 14.5, 13, 10.5, 14, 5.5, 12.5, 1.5, 13.5);
    p.fill(m, PAL.parch, { base: 3.4, grad: 1 });
    p.fill(p.mask().poly(5.5, 2, 10.5, 3.5, 10.5, 14, 5.5, 12.5).and(m), [PAL.parch[3]], { mode: 'flat' });
    p.paint(p.mask().grid(['x.x.x', '.....', '....x', '...x.', '..x..'], 3, 5), PAL.red[2]);
    p.grid(['x.x', '.x.', 'x.x'], { x: PAL.red[3] }, 10, 9);
    p.outline();
  },
  lock: (p) => {
    p.fill(p.mask().ring(8, 6.5, 2.2, 4).and(p.mask().rect(0, 0, 16, 8)).rect(4, 6, 1.6, 2).rect(10.4, 6, 1.6, 2), PAL.silver, { base: 3.4 });
    p.fill(p.mask().rect(3, 7, 10, 8), PAL.gold, { base: 2.8, grad: 1.5 });
    p.paint(p.mask().rect(7, 9, 2, 2).rect(7.5, 11, 1, 2), PAL.ink[0]);
    p.outline();
  },
  skull: (p) => { skull(p, 0); p.outline(); },
  xp: (p) => {
    const b = p.mask().circle(8, 8, 6.8);
    p.fill(b, PAL.blue, { mode: 'sphere', bias: 0.3 });
    p.paint(p.mask().ring(8, 8, 5.4, 6.2), PAL.blue[4], 0.5);
    star(p, 8, 8.4, 5, 2.1, PAL.gold);
    p.outline();
  },
};

const ACCESSORY: Record<AccessoryIcon, Draw> = {
  charm: (p) => {
    p.paint(p.mask().line(3, 1, 7, 5).line(13, 1, 9, 5), PAL.leather[4]);
    p.outline();
    p.fill(p.mask().rect(6, 4, 4, 2), PAL.gold, { base: 3.4 });
    const jade = p.mask().circle(8, 10.5, 3.6).poly(5, 9, 8, 5.5, 11, 9);
    p.fill(jade, PAL.green, { mode: 'sphere', cx: 8, cy: 10, r: 4, bias: 0.6 });
    p.paint(p.mask().ring(8, 10.5, 1.2, 2.2), PAL.green[1]);
    p.px(6, 9, W).px(6, 10, PAL.green[5]);
    p.outline();
  },
  powerRing: (p) => { ringBand(p, 8, 10, 6, 4.4, 1.8, PAL.gold); gem(p, 8, 5, 3.2, PAL.red); p.outline(); },
  magusCirclet: (p) => {
    const band = p.mask().ellipse(8, 9, 7, 4).sub(p.mask().ellipse(8, 8.4, 5.8, 2.8));
    p.fill(band, PAL.silver, { base: 3, grad: 2 });
    p.fill(p.mask().poly(4.5, 6.5, 8, 1.5, 11.5, 6.5, 8, 8), PAL.silver, { base: 3.4 });
    gem(p, 8, 5.4, 2.4, PAL.violet);
    p.outline();
  },
  angelFeather: (p) => { feather(p, PAL.white, PAL.gold[4]); p.outline(); p.px(13, 12, PAL.gold[5]).px(3, 3, PAL.gold[4]); },
  etherStone: (p) => {
    const m = p.mask().ellipse(8, 8.5, 5.4, 6.2);
    p.fill(m, PAL.blue, { mode: 'sphere', bias: 0.4 });
    p.paint(p.mask().grid(['..x..', '.x.x.', 'x...x', '.x.x.', '..x..'], 6, 7), PAL.cyan[5], 0.9);
    p.px(5, 4, W).px(6, 4, PAL.blue[5]).px(5, 5, PAL.blue[5]);
    p.outline();
  },
  swiftBoots: (p) => { boot(p); p.outline(); },
  breakerMark: (p) => {
    const m = p.mask().poly(8, 1, 14.5, 8, 8, 15, 1.5, 8);
    p.fill(m, PAL.cyan, { base: 2.6, grad: 2 });
    p.fill(p.mask().poly(8, 3.5, 11.5, 8, 8, 12.5, 4.5, 8), PAL.violet, { base: 3.4, grad: 1.5 });
    p.paint(p.mask().grid(['x...', '.x..', '.xx.', '...x', '..x.', '..x.', '...x'], 7, 1), PAL.ink[0]);
    p.outline();
  },
  prismLens: (p) => {
    const bands = [PAL.red[3], PAL.orange[4], PAL.gold[4], PAL.green[4], PAL.cyan[4], PAL.violet[4]];
    const lens = p.mask().circle(8, 8, 5.2);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (lens.has(x, y)) p.px(x, y, bands[Math.max(0, Math.min(5, Math.floor((x + y - 5) / 3.4)))]);
    p.px(6, 5, W).px(5, 6, W).px(6, 6, W);
    p.fill(p.mask().ring(8, 8, 5.2, 6.8), PAL.gold, { base: 3 });
    p.outline();
  },
  luckyCoin: (p) => {
    coin(p, 8, 8, 6.6, 6.6);
    p.grid(['.gg.gg.', 'gGGgGGg', 'gGgdgGg', '.gdddg.', 'gGgdgGg', 'gGGgGGg', '.gg.gg.'], { g: PAL.green[2], G: PAL.green[4], d: PAL.green[1] }, 4, 4);
    p.px(10, 10, PAL.green[1]).px(11, 11, PAL.green[1]);
    p.outline();
  },
  guardianBangle: (p) => {
    ringBand(p, 8, 8, 6.8, 5.5, 2.4, PAL.bronze);
    p.fill(p.mask().circle(8, 3.3, 1.4).circle(2, 8, 1.2).circle(14, 8, 1.2), PAL.cyan, { mode: 'sphere', bias: 0.6 });
    p.outline();
  },
  phoenixPlume: (p) => { feather(p, PAL.red, PAL.gold[5]); p.outline(); p.px(13, 1, PAL.fire[5]).px(14, 3, PAL.fire[4]).px(11, 0, PAL.fire[3]); },
  tome: (p) => {
    p.fill(p.mask().rect(3, 2, 11, 12), PAL.violet, { base: 2.6, grad: 1.5 });
    p.fill(p.mask().rect(4, 13, 10, 2), PAL.parch, { base: 4 });
    p.fill(p.mask().rect(2, 2, 2, 13), PAL.violet, { base: 1.4 });
    p.fill(p.mask().rect(3, 2, 2, 2).rect(12, 2, 2, 2), PAL.gold, { base: 3.4 });
    gem(p, 8.5, 7.5, 2.4, PAL.gold);
    p.outline();
  },
  chalice: (p) => {
    const cup = p.mask().poly(2.5, 2, 13.5, 2, 12, 6.5, 8, 9, 4, 6.5);
    p.fill(cup, PAL.gold, { base: 3, grad: 2 });
    p.fill(p.mask().ellipse(8, 2.6, 5, 1), PAL.red, { base: 2 });
    p.fill(p.mask().rect(7, 9, 2, 4).ellipse(8, 14, 4.5, 1.5), PAL.gold, { base: 2.8 });
    p.px(8, 5, PAL.red[4]).px(7, 5, PAL.cyan[4]).px(9, 5, PAL.cyan[4]);
    p.outline();
  },
};

// ============================================================================================
// Exports
// ============================================================================================
const cache = new Map<string, string>();
function icon(key: string, draw: Draw): string {
  let u = cache.get(key);
  if (!u) {
    const p = new Pix(S, S);
    draw(p);
    u = p.url();
    cache.set(key, u);
  }
  return u;
}
export const elementIconUrl = (e: Element): string => icon('el:' + e, ELEMENT[e]);
export const intentIconUrl = (k: IntentKind): string => icon('in:' + k, INTENT[k]);
export const statusIconUrl = (s: StatusId): string => icon('st:' + s, STATUS[s]);
export const uiIconUrl = (i: UiIcon): string => icon('ui:' + i, UI[i]);
export const accessoryIconUrl = (a: AccessoryIcon): string => icon('ac:' + a, ACCESSORY[a]);

/** Lists for previews / preloading. */
export const ICON_KEYS = {
  element: Object.keys(ELEMENT) as Element[],
  intent: Object.keys(INTENT) as IntentKind[],
  status: Object.keys(STATUS) as StatusId[],
  ui: Object.keys(UI) as UiIcon[],
  accessory: Object.keys(ACCESSORY) as AccessoryIcon[],
};
