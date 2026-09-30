// Procedural HD-2D pixel-art sprites. Everything is rasterized at true pixel resolution (no AA):
// shapes are painted into "parts" (material + depth order), then a lighting pass auto-shades each
// part from a top-left light using hue-shifted ramps, front parts cast 1px shadows on parts behind,
// details are overlaid, and a selective hue-tinted outline is added last.
import type { HeroId, SpriteId } from '../game/types';

export interface SpriteSheet {
  canvas: HTMLCanvasElement;
  w: number; h: number;
  frames: number;
  footY: number;
  float: number;
}

// ---------------------------------------------------------------- color
type RGB = number;

function hsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Shift hue from h toward target by at most `by` degrees. */
function toward(h: number, target: number, by: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), by);
}

/** 5-step hue-shifted ramp: shadows drift cool/purple and saturate, highlights drift warm. */
function ramp(h: number, s: number, l: number, dl = 0.13, hs = 12): RGB[] {
  const out: RGB[] = [];
  for (let k = -2; k <= 2; k++) {
    const hue = k < 0 ? toward(h, 265, -k * hs) : toward(h, 55, k * hs * 0.8);
    const light = l + (k < 0 ? k * dl : k * dl * 0.9);
    const sat = s + (k < 0 ? -k * 0.05 : -k * 0.04);
    out.push(hsl(hue, sat, light));
  }
  return out;
}

interface Mat { r: RGB[]; ol: RGB; olL: RGB }
const OL_DARK = 0x160d1e;
function mat(r: RGB[], ol?: RGB, olL?: RGB): Mat {
  return { r, ol: ol ?? mix(r[0], OL_DARK, 0.62), olL: olL ?? mix(r[0], OL_DARK, 0.2) };
}
const M = (h: number, s: number, l: number, dl?: number, hs?: number) => mat(ramp(h, s, l, dl, hs));

// ---------------------------------------------------------------- painter
interface PartOpts {
  base?: number;   // ramp index for flat-lit surface (default 2)
  flat?: boolean;  // no auto-shading
  cap?: number;    // shading reach in px (default 5)
  ns?: boolean;    // casts no shadow on parts behind
  nr?: boolean;    // receives no cast shadows
  io?: boolean;    // inner outline where it overlaps parts behind
  no?: boolean;    // no outer outline
  spec?: boolean;  // allow +2 specular on the most-lit pixels
  rim?: RGB;       // back-light color on the right-facing edge
}
interface Part extends PartOpts { m: Mat }

type Pt = [number, number];

class P {
  pid: Int16Array; parts: Part[] = [];
  det: Int32Array; detM: (Mat | null)[]; detOl: Uint8Array;
  adj: Int8Array;
  ox = 0; oy = 0;
  private mode = 0; private dcol = 0; private dmat: Mat | null = null; private dol = 1; private da = 0;
  constructor(public w: number, public h: number, public flip = false, private pad = 0) {
    const n = w * h;
    this.pid = new Int16Array(n).fill(-1);
    this.det = new Int32Array(n).fill(-1);
    this.detM = new Array(n).fill(null);
    this.detOl = new Uint8Array(n);
    this.adj = new Int8Array(n);
  }
  /** start a new shaded part (later parts are in front) */
  p(m: Mat, o: PartOpts = {}): this { this.parts.push({ m, ...o }); this.mode = 0; return this; }
  /** flat detail pixels drawn on top after shading */
  d(m: Mat, lvl: number, outline = false): this { this.mode = 1; this.dmat = m; this.dcol = m.r[Math.max(0, Math.min(m.r.length - 1, lvl))]; this.dol = outline ? 1 : 0; return this; }
  /** raw color detail */
  c(col: RGB, outline = false): this { this.mode = 1; this.dmat = null; this.dcol = col; this.dol = outline ? 1 : 0; return this; }
  /** adjust shade level of existing part pixels */
  sh(delta: number): this { this.mode = 3; this.da = delta; return this; }
  erase(): this { this.mode = 2; return this; }
  at(dx: number, dy: number): this { this.ox = dx; this.oy = dy; return this; }

  set(x: number, y: number): void {
    x += this.ox; y += this.oy + this.pad;
    if (this.flip) x = this.w - 1 - x;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    switch (this.mode) {
      case 0: this.pid[i] = this.parts.length - 1; this.det[i] = -1; this.adj[i] = 0; break;
      case 1: this.det[i] = this.dcol; this.detM[i] = this.dmat; this.detOl[i] = this.dol; break;
      case 2: this.pid[i] = -1; this.det[i] = -1; break;
      case 3: if (this.pid[i] >= 0) this.adj[i] = this.da; break;
    }
  }
  dot(...xy: number[]): this { for (let i = 0; i < xy.length; i += 2) this.set(xy[i], xy[i + 1]); return this; }
  rect(x: number, y: number, w: number, h: number): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j);
    return this;
  }
  /** filled ellipse inside the box x,y,w,h */
  oval(x: number, y: number, w: number, h: number): this {
    const cx = x + w / 2, cy = y + h / 2, rx = w / 2, ry = h / 2;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (x + i + 0.5 - cx) / rx, dy = (y + j + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) this.set(x + i, y + j);
    }
    return this;
  }
  /** filled polygon, flat list x0,y0,x1,y1,... (vertices on pixel corners) */
  poly(...v: number[]): this {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < v.length; i += 2) { y0 = Math.min(y0, v[i]); y1 = Math.max(y1, v[i]); }
    const n = v.length / 2;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const sy = y + 0.5, xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = v[i * 2], ay = v[i * 2 + 1], bx = v[((i + 1) % n) * 2], by = v[((i + 1) % n) * 2 + 1];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) xs.push(ax + ((sy - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y);
    }
    return this;
  }
  /** Bresenham line (pixel centers) */
  line(x0: number, y0: number, x1: number, y1: number, t = 1): this {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (t === 1) this.set(x0, y0); else this.rect(x0 - (t >> 1), y0 - (t >> 1), t, t);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  /** polyline through points */
  path(...v: number[]): this { for (let i = 0; i + 3 < v.length; i += 2) this.line(v[i], v[i + 1], v[i + 2], v[i + 3]); return this; }

  // ---- render
  render(ctx: CanvasRenderingContext2D, ox: number): void {
    const { w, h, pid, parts } = this, n = w * h;
    const col = new Int32Array(n).fill(-1);
    const cm: (Mat | null)[] = new Array(n).fill(null);
    const olOk = new Uint8Array(n);
    const same = (x: number, y: number, id: number) => x >= 0 && y >= 0 && x < w && y < h && pid[y * w + x] === id;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, id = pid[i];
      if (id < 0) continue;
      const pt = parts[id], r = pt.m.r;
      let lv = pt.base ?? 2;
      if (!pt.flat) {
        const cap = pt.cap ?? 5;
        const dist = (dx: number, dy: number) => { let k = 1; while (k < cap && same(x + dx * k, y + dy * k, id)) k++; return k; };
        const dL = dist(-1, 0), dR = dist(1, 0), dU = dist(0, -1), dD = dist(0, 1);
        const b = 0.42 * (dR - dL) / (dR + dL) + 0.58 * (dD - dU) / (dD + dU);
        if (b > 0.34) lv++;
        if (pt.spec && b > 0.6 && (dL === 1 || dU === 1)) lv++;
        if (b < -0.12) lv--;
        if (b < -0.62) lv--;
      }
      if (!pt.nr) {
        for (const [ax, ay] of [[-1, -1], [0, -1]] as Pt[]) {
          const xx = x + ax, yy = y + ay;
          if (xx < 0 || yy < 0 || xx >= w) continue;
          const o = pid[yy * w + xx];
          if (o > id && !parts[o].ns) { lv--; break; }
        }
      }
      if (pt.io) {
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Pt[]) {
          const xx = x + ax, yy = y + ay;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const o = pid[yy * w + xx];
          if (o >= 0 && o < id) { lv = Math.min(lv, 1) - 1; break; }
        }
      }
      lv += this.adj[i];
      col[i] = r[Math.max(0, Math.min(r.length - 1, lv))];
      if (pt.rim !== undefined && !same(x + 1, y, id) && same(x - 1, y, id) && same(x, y - 1, id)) col[i] = pt.rim;
      cm[i] = pt.m; olOk[i] = pt.no ? 0 : 1;
    }
    for (let i = 0; i < n; i++) if (this.det[i] >= 0) {
      col[i] = this.det[i];
      if (this.detM[i]) cm[i] = this.detM[i];
      if (pid[i] < 0) olOk[i] = this.detOl[i];
    }
    // selective outline
    const out = col.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (col[i] >= 0) continue;
      const get = (xx: number, yy: number) => (xx >= 0 && yy >= 0 && xx < w && yy < h && col[yy * w + xx] >= 0 && olOk[yy * w + xx]) ? yy * w + xx : -1;
      const l = get(x - 1, y), r = get(x + 1, y), u = get(x, y - 1), d = get(x, y + 1);
      if (l < 0 && r < 0 && u < 0 && d < 0) continue;
      const lit = l < 0 && u < 0; // empty pixel sits on the top/left side of the shape
      const src = lit ? (d >= 0 ? d : r) : (u >= 0 ? u : l >= 0 ? l : d >= 0 ? d : r);
      const m = cm[src];
      out[i] = m ? (lit ? m.olL : m.ol) : mix(col[src], OL_DARK, lit ? 0.45 : 0.72);
    }
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < n; i++) {
      const c = out[i];
      if (c < 0) continue;
      img.data[i * 4] = (c >> 16) & 255; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, ox, 0);
  }
}

// ---------------------------------------------------------------- palettes
const SKIN = mat([0x7a3e4a, 0xb86f6a, 0xe9a98c, 0xfbd3b4, 0xfff0dc]);
const GOLD = mat([0x6b3a2a, 0xa8612a, 0xd8a03a, 0xf2d060, 0xfff3b0]);
const STEEL = mat([0x3b3a5c, 0x646a8c, 0x9aa3b8, 0xcfd4dc, 0xf7f3e6]);
const STEEL_D = mat([0x241f38, 0x3a3858, 0x585c7c, 0x80869e, 0xb4b8c4]);
const LEATHER = M(22, 0.42, 0.3, 0.08);
const EYE_W = 0xf4efe6;

// ---------------------------------------------------------------- sprite defs
interface Def { w: number; h: number; frames: number; footY: number; float?: number; flip?: boolean; pad?: number; draw(S: P, f: number): void }

const BOB4 = [0, 0, 1, 1];

const DEFS: Record<SpriteId, Def> = {} as Record<SpriteId, Def>;

// ===== Knight (Aldric)
const K_BLUE = M(226, 0.55, 0.36, 0.1);
const K_RED = M(356, 0.66, 0.42, 0.11);
DEFS.knight = {
  w: 48, h: 56, frames: 4, footY: 54, pad: 1,
  draw(S, f) {
    const b = BOB4[f];
    const fl = [0, 1, 2, 1][f];
    const pw = [0, 1, 1, 0][f];
    // cape (behind)
    S.at(0, b).p(K_RED, { cap: 6 }).poly(21, 21, 12, 23, 9, 29, 7, 38, 5 - fl, 45, 2 - fl, 50 - b, 6 - fl, 50 - b, 9, 51 - b - (fl & 1), 13, 50 - b, 17, 51 - b, 21, 49, 22, 30);
    S.sh(-1).line(12, 31, 9, 47).line(16, 33, 15, 49);
    S.sh(1).line(11, 27, 8, 41);
    S.sh(-2).dot(3 - fl, 49 - b, 4 - fl, 49 - b, 5 - fl, 48 - b);
    // far leg
    S.at(0, 0).p(STEEL).rect(24, 40, 5, 5);
    S.p(STEEL).rect(25, 47, 4, 4);
    S.p(STEEL, { spec: true, io: true }).oval(24, 44, 6, 4);
    S.p(STEEL_D).poly(24, 50, 29, 50, 32, 52, 33, 54, 24, 54);
    // far arm + sword
    S.at(0, b).p(STEEL).oval(25, 21, 8, 7);
    S.p(STEEL).rect(28, 27, 4, 5);
    S.p(STEEL, { io: true }).poly(28, 31, 32, 30, 34, 34, 30, 35);
    S.p(STEEL, { spec: true, cap: 2 }).poly(33, 31, 42, 7, 44, 6, 44, 9, 36, 32);
    S.d(STEEL, 4).line(35, 29, 42, 10);
    S.p(LEATHER).line(33, 35, 31, 39, 2);
    S.p(GOLD, { spec: true }).line(30, 30, 38, 33, 2);
    S.p(GOLD, { spec: true }).oval(29, 38, 3, 3);
    S.p(STEEL, { io: true }).oval(31, 31, 5, 5);
    S.sh(-1).dot(34, 33, 34, 34);
    // near leg
    S.at(0, 0).p(STEEL).rect(14, 40, 6, 5);
    S.p(STEEL).rect(15, 47, 4, 4);
    S.p(STEEL, { spec: true, io: true }).oval(14, 44, 6, 4);
    S.p(STEEL_D).poly(13, 50, 19, 50, 22, 52, 23, 54, 13, 54);
    // torso
    S.at(0, b).p(STEEL, { spec: true, cap: 6 }).poly(15, 24, 27, 23, 30, 27, 30, 34, 28, 38, 16, 38, 14, 31);
    S.p(STEEL, { io: true }).poly(15, 38, 29, 38, 30, 42, 14, 42);
    S.p(LEATHER).rect(15, 37, 15, 2);
    // tabard
    S.p(K_BLUE, { cap: 4 }).poly(20, 27, 29, 26, 29, 36, 28, 48 + (fl === 2 ? 1 : 0), 21, 47, 21, 38);
    S.sh(-1).line(25, 39, 25, 46);
    S.d(GOLD, 3).line(21, 47, 28, 48).line(29, 27, 29, 36).line(29, 36, 28, 47);
    S.d(GOLD, 2).line(21, 46, 21, 38);
    S.d(GOLD, 3).dot(25, 30, 26, 31, 25, 32, 24, 31);
    S.d(GOLD, 4).dot(25, 31);
    S.d(GOLD, 3).rect(25, 37, 2, 2);
    S.d(GOLD, 4).dot(25, 37);
    // head: gorget + helm
    S.p(STEEL_D).rect(19, 20, 9, 4);
    S.p(STEEL, { spec: true, cap: 6 }).oval(17, 7, 13, 13);
    S.p(STEEL, { io: true, cap: 4 }).poly(23, 12, 30, 12, 31, 14, 31, 19, 29, 22, 21, 22, 21, 17);
    S.d(STEEL_D, 0).line(25, 15, 31, 15).line(26, 16, 30, 16);
    S.d(STEEL, 4).dot(26, 14, 27, 14);
    S.d(STEEL_D, 1).dot(27, 19, 29, 19, 28, 20, 30, 20);
    S.d(GOLD, 3).line(21, 7, 25, 7).dot(26, 8, 27, 8, 28, 9);
    S.d(GOLD, 2).line(17, 13, 21, 13);
    // plume
    S.p(K_RED, { cap: 3 }).poly(24, 8, 24, 4, 20, 2, 14, 3, 9, 6, 6, 10 + pw, 9, 9 + pw, 12, 8, 10, 12 + pw, 14, 10, 17, 9, 15, 13 + pw, 19, 10, 22, 9);
    S.sh(1).line(22, 3, 15, 4).line(13, 5, 10, 7);
    // near pauldron + shield
    S.p(STEEL, { spec: true, cap: 6 }).oval(11, 21, 12, 8);
    S.p(STEEL, { io: true }).poly(12, 26, 22, 26, 21, 29, 13, 29);
    S.p(K_BLUE, { cap: 4 }).poly(10, 28, 15, 26, 21, 28, 21, 46, 15, 50, 10, 46);
    S.d(GOLD, 2).path(10, 28, 15, 26, 21, 28, 21, 46, 15, 50, 10, 46, 10, 28);
    S.d(GOLD, 4).path(10, 29, 10, 44).path(11, 28, 14, 27);
    S.d(GOLD, 3).dot(12, 30, 19, 30, 12, 45, 19, 45);
    S.d(STEEL, 3).line(15, 29, 15, 46).line(12, 36, 18, 36);
    S.d(STEEL, 1).line(16, 30, 16, 46).line(13, 37, 18, 37);
    S.d(GOLD, 3).dot(15, 34, 14, 35, 16, 35, 13, 36, 17, 36, 14, 37, 16, 37, 15, 38);
    S.d(GOLD, 4).dot(15, 35, 15, 36, 14, 36);
    S.d(GOLD, 1).dot(16, 36, 15, 37);
  },
};


// ===== Black Mage (Lyra)
const L_HAT = M(278, 0.46, 0.4, 0.12);
const L_HAIR = mat([0x4a4a78, 0x7b7fa8, 0xaeb4cc, 0xd8dce6, 0xfbf8f0]);
const L_ROBE = mat([0x120e28, 0x221c48, 0x33306c, 0x4c4a90, 0x7270b0]);
const WOOD = M(24, 0.42, 0.34, 0.09);
const EMBER = mat([0x8a2414, 0xd4501a, 0xff9428, 0xffd25c, 0xfffbe2], 0x5a1a1e, 0x8a3a1a);
const IRIS_V = 0x3a2458;
DEFS.bmage = {
  w: 48, h: 60, frames: 4, footY: 58, pad: 2,
  draw(S, f) {
    const b = BOB4[f];
    const sw = [0, 1, 1, 0][f];
    const hw = [0, 1, 2, 1][f];
    // hair behind
    S.at(0, b).p(L_HAIR, { cap: 4 }).poly(19, 19, 27, 18, 23, 30, 21, 39, 18, 45 - hw, 14, 44 + (hw >> 1), 11 - hw, 42, 13, 36, 14, 28, 16, 22);
    S.sh(-1).line(18, 26, 15, 40).line(21, 30, 18, 43);
    S.sh(1).line(16, 24, 13, 36);
    // robe
    S.at(0, 0).p(L_ROBE, { cap: 7 }).poly(19, 28 + b, 28, 28 + b, 31, 34 + b, 32, 44, 35, 52, 36 + sw, 57, 10 - sw, 57, 12, 50, 15, 40, 17, 32 + b);
    S.sh(-1).line(22, 42, 20, 56).line(27, 44, 28, 56);
    S.sh(1).line(17, 44, 14, 55);
    S.d(GOLD, 2).line(28, 30 + b, 31, 44).line(31, 44, 33, 57);
    S.d(GOLD, 3).line(11 - sw, 55, 35 + sw, 55);
    // hem runes
    for (let x = 13; x < 33; x += 4) S.d(GOLD, 3).dot(x, 53, x + 1, 52, x + 1, 54);
    S.d(STEEL_D, 0).rect(30, 57, 5, 1);
    // sash
    S.at(0, b).p(L_HAT, { cap: 3 }).poly(16, 36, 31, 35, 31, 38, 16, 39);
    S.d(GOLD, 3).rect(28, 35, 2, 3);
    S.d(GOLD, 4).dot(28, 35);
    // near sleeve
    S.p(L_ROBE, { io: true, cap: 4, base: 3 }).poly(18, 29, 23, 30, 25, 38, 26, 46, 20, 46, 13, 43, 15, 36);
    S.d(GOLD, 3).line(14, 43, 19, 45).line(20, 45, 25, 45);
    S.d(SKIN, 3).dot(22, 46, 23, 46);
    // staff + far arm
    S.p(WOOD, { cap: 2 }).line(36, 57 - b, 36, 14).line(37, 57 - b, 37, 14);
    S.p(L_ROBE, { io: true, cap: 4 }).poly(26, 29, 31, 31, 35, 35, 33, 38, 28, 37);
    S.d(GOLD, 3).line(34, 35, 32, 38);
    S.p(SKIN, { cap: 2 }).oval(34, 34, 4, 4);
    // crystal cradle + crystal
    S.p(WOOD, { cap: 2 }).path(36, 15, 33, 12, 33, 8).path(37, 15, 40, 12, 40, 8);
    const g = [0, 1, 0, -1][f];
    S.p(EMBER, { base: 3, spec: true, cap: 3 }).poly(36.5, 3, 39.5, 9, 36.5, 15, 33.5, 9);
    S.d(EMBER, 4).dot(36, 6, 36, 7, 35, 8);
    S.d(EMBER, 1).dot(37, 12, 36, 13);
    if (g >= 0) S.d(EMBER, 3).dot(31, 9, 42, 9, 36, 1);
    if (g > 0) S.d(EMBER, 2).dot(30, 10, 43, 8, 34, 2, 39, 2);
    // embers drifting up
    const em = [[41, 12], [32, 16], [43, 5], [30, 4]];
    em.forEach(([x, y], i) => {
      const t = (f + i * 2) % 4;
      S.d(EMBER, 4 - (t >> 1)).dot(x + (t & 1), y - t * 2);
    });
    // face + hair front
    S.at(0, b).p(SKIN, { flat: true, base: 3 }).oval(20, 18, 10, 11);
    S.sh(-1).dot(20, 24, 20, 25, 21, 27, 22, 28);
    S.p(SKIN).rect(24, 27, 3, 2);
    S.c(IRIS_V).dot(27, 23, 27, 24, 26, 23);
    S.c(0xc59be0).dot(27, 24);
    S.c(EYE_W).dot(28, 24);
    S.d(SKIN, 0).dot(28, 26, 29, 26);
    S.c(0xf08a90).dot(25, 25);
    S.p(L_HAIR, { cap: 3 }).poly(19, 18, 30, 17, 30, 20, 28, 20, 27, 22, 25, 20, 23, 23, 22, 21, 22, 32, 20, 33, 18, 28);
    S.sh(-1).line(21, 22, 21, 31);
    // hat
    S.p(L_HAT, { cap: 4 }).poly(11, 18, 20, 15, 32, 15, 38, 17, 36, 20, 22, 21, 12, 20);
    S.p(L_HAT, { cap: 5, spec: true }).poly(18, 16, 31, 16, 28, 10, 26, 5, 22, 1 + sw, 15, 0 + sw, 9, 3 + sw, 16, 4, 21, 8);
    S.sh(-1).line(22, 9, 24, 14).line(20, 3 + sw, 15, 2 + sw);
    S.p(GOLD, { spec: true, cap: 2 }).poly(18, 13, 29, 13, 30, 16, 18, 16);
    S.d(EMBER, 3).rect(23, 14, 2, 2);
    S.d(EMBER, 4).dot(23, 14);
  },
};

// ===== White Mage (Seren)
const WHITE = mat([0x4a4670, 0x8683aa, 0xc3c1d8, 0xebe9ef, 0xfffcf2]);
const W_RED = M(354, 0.7, 0.45, 0.1);
const HAIR_B = mat([0x8a5a2a, 0xc88c34, 0xecc254, 0xfae48a, 0xfff8d0]);
const HOLY = mat([0x9a6a2a, 0xe0b048, 0xffe890, 0xfff6cc, 0xffffff], 0x5a3a1a, 0x8a6a2a);
const IRIS_G = 0x2f5a4a;
function zigzag(S: P, x0: number, x1: number, y: number, up: boolean) {
  for (let x = x0; x <= x1 - 2; x += 3) S.poly(x, y, x + 3, y, x + 1.5, up ? y - 3 : y + 3);
}
DEFS.wmage = {
  w: 48, h: 56, frames: 4, footY: 54, pad: 1,
  draw(S, f) {
    const b = BOB4[f];
    const sw = [0, 1, 1, 0][f];
    // robe
    S.at(0, 0).p(WHITE, { cap: 7 }).poly(19, 25 + b, 28, 25 + b, 31, 32 + b, 32, 42, 35, 49, 36 + sw, 53, 10 - sw, 53, 12, 47, 15, 38, 17, 30 + b);
    S.sh(-1).line(22, 40, 20, 52).line(27, 42, 28, 52);
    S.d(W_RED, 2); zigzag(S, 11 - sw, 36 + sw, 54, true);
    S.d(W_RED, 1).line(11 - sw, 53, 35 + sw, 53);
    S.d(WHITE, 0).rect(30, 53, 5, 1);
    // sash
    S.at(0, b).p(W_RED, { cap: 3 }).poly(16, 33, 31, 32, 31, 34, 16, 35);
    S.p(W_RED, { cap: 2 }).poly(26, 34, 29, 34, 30, 41 + sw, 27, 40);
    // near sleeve
    S.p(WHITE, { io: true, cap: 4, base: 3 }).poly(18, 26, 23, 27, 25, 37, 24, 42, 14, 42, 15, 33);
    S.d(W_RED, 2); zigzag(S, 14, 24, 42, true);
    // staff + far arm
    S.p(WOOD, { cap: 2 }).line(36, 53 - b, 36, 15).line(37, 53 - b, 37, 15);
    S.d(GOLD, 3).rect(36, 22, 2, 2);
    S.p(WHITE, { io: true, cap: 4 }).poly(26, 26, 31, 28, 35, 32, 33, 35, 28, 34);
    S.d(W_RED, 2).line(34, 32, 32, 35);
    S.p(SKIN, { cap: 2 }).oval(34, 31, 4, 4);
    // crescent + halo
    const g = [0, 1, 0, -1][f];
    S.p(GOLD, { spec: true, cap: 2 }).poly(31, 5, 33, 3, 36, 2, 40, 3, 42, 6, 43, 10, 42, 13, 39, 15, 36, 15, 38, 13, 40, 10, 40, 7, 38, 5, 35, 4, 33, 5);
    S.p(GOLD).rect(36, 14, 2, 2);
    S.p(HOLY, { base: 3, cap: 2 }).oval(34, 7, 5, 5);
    S.d(HOLY, 4).dot(35, 8);
    if (g >= 0) S.d(HOLY, 2).dot(30, 9, 44, 6, 36, 0);
    if (g > 0) S.d(HOLY, 1).dot(29, 12, 45, 12, 32, 1, 41, 0);
    const sp = [[42, 18], [31, 17], [44, 2]];
    sp.forEach(([x, y], i) => {
      const t = (f + i) % 4;
      if (t < 3) S.d(HOLY, 4 - t).dot(x, y - t);
    });
    // hood (back), face, bangs, hood rim
    S.at(0, b).p(WHITE, { cap: 6, base: 3 }).poly(20, 7, 26, 6, 30, 8, 32, 12, 32, 19, 30, 25, 23, 27, 17, 26, 14, 21, 13, 14, 14, 9, 15, 5 + sw, 18, 6);
    S.sh(-1).line(16, 14, 16, 23);
    S.p(SKIN, { flat: true, base: 3 }).oval(22, 13, 9, 11);
    S.sh(-1).dot(22, 20, 23, 22, 24, 23);
    S.c(IRIS_G).dot(27, 18, 28, 18, 27, 19);
    S.c(0x6fb09a).dot(28, 19);
    S.d(SKIN, 1).dot(29, 22);
    S.c(0xf29aa0).dot(26, 20, 30, 20);
    S.p(HAIR_B, { cap: 3 }).poly(22, 12, 31, 12, 31, 14, 29, 15, 28, 14, 26, 16, 25, 14, 23, 18, 23, 24, 21, 24, 21, 14);
    S.p(WHITE, { cap: 3 }).poly(21, 9, 28, 8, 32, 11, 32, 13, 27, 11, 22, 12, 21, 20, 22, 26, 19, 26, 18, 15);
    S.d(W_RED, 2).dot(23, 11, 24, 11, 25, 10, 26, 10, 27, 10, 28, 11, 29, 11, 30, 12, 31, 12).dot(24, 12, 27, 11, 30, 13);
    S.d(W_RED, 2).line(20, 13, 20, 24).dot(21, 16, 21, 20, 21, 24);
  },
};

// ===== Slime
const SLIME = mat([0x173a66, 0x1d6a8a, 0x2ea3a6, 0x62d6c0, 0xd0fff0], 0x0e1c38, 0x1a4a6a);
const INK = 0x10142a;
DEFS.slime = {
  w: 32, h: 28, frames: 4, footY: 26, flip: true,
  draw(S, f) {
    const hw = [12, 12.5, 13.5, 12.5][f], hh = [18, 17, 15, 17][f], top = 26 - hh;
    S.p(SLIME, { cap: 8 });
    for (let y = 0; y < hh; y++) {
      const t = (y + 0.5) / hh;
      let half = hw * Math.sqrt(1 - (1 - t) * (1 - t) * 0.96);
      if (y === hh - 1) half -= 1.2;
      const lean = (1 - t) * 2;
      S.rect(Math.round(16 - half + lean), top + y, Math.round(half * 2), 1);
    }
    // nucleus + translucent depth
    S.sh(-1).oval(9, top + hh * 0.45, 12, Math.round(hh * 0.45));
    S.d(SLIME, 3).line(8, 24, 22, 24);
    for (let x = 9; x < 23; x += 2) S.d(SLIME, 2).dot(x, 23);
    // bubbles
    const by = [0, -1, -2, -1][f];
    S.d(SLIME, 3).dot(8, top + 9 + by, 7, top + 10 + by, 9, top + 10 + by, 8, top + 11 + by);
    S.d(SLIME, 4).dot(12, 21 + by, 20, 18 - by, 7, 20);
    S.d(SLIME, 3).dot(14, 22, 11, top + 7 - by);
    // gloss
    S.d(SLIME, 4).line(9, top + 3, 12, top + 1).dot(8, top + 4, 8, top + 5);
    S.c(0xffffff).dot(10, top + 2, 11, top + 2);
    // face
    const ey = top + Math.round(hh * 0.42);
    S.c(INK).rect(19, ey, 2, 3).rect(24, ey, 2, 3);
    S.c(0xffffff).dot(19, ey, 24, ey);
    S.c(0x7ff7ff).dot(20, ey + 2, 25, ey + 2);
    S.c(INK).line(17, ey - 2, 20, ey - 1).line(26, ey - 2, 24, ey - 1);
    S.c(INK).line(20, ey + 5, 25, ey + 5).dot(19, ey + 4, 26, ey + 4);
    S.c(0xffffff).dot(21, ey + 6, 24, ey + 6);
  },
};

// ===== Goblin
const G_SKIN = mat([0x1c3530, 0x2c6038, 0x528f40, 0x8cbe52, 0xd6ea8c]);
const RAGS = M(28, 0.38, 0.3, 0.08);
const RUST = mat([0x3a2230, 0x6a3a2e, 0x9a5a3a, 0xc4865a, 0xe6c49a]);
const YEL = 0xffd84a;
DEFS.goblin = {
  w: 36, h: 40, frames: 4, footY: 38, pad: 1, flip: true,
  draw(S, f) {
    const b = BOB4[f];
    const ear = [0, 0, 1, 0][f];
    // far arm (behind)
    S.at(0, b).p(G_SKIN).path(12, 18, 10, 24, 9, 27).path(13, 18, 11, 24);
    S.d(G_SKIN, 4).dot(8, 28, 10, 28);
    // legs
    S.at(0, 0).p(G_SKIN, { cap: 3 }).poly(9, 27, 14, 27, 14, 32, 11, 36, 8, 36, 9, 32);
    S.p(G_SKIN, { cap: 3 }).oval(5, 34, 8, 4);
    S.p(G_SKIN, { cap: 3 }).poly(15, 27, 19, 27, 23, 32, 21, 36, 18, 36, 19, 32);
    S.p(G_SKIN, { cap: 3 }).oval(17, 34, 8, 4);
    S.c(0xd6ea8c).dot(24, 36, 12, 36);
    // body
    S.at(0, b).p(G_SKIN, { cap: 6 }).oval(7, 15, 17, 16);
    S.sh(1).oval(16, 21, 7, 8);
    S.p(RAGS, { cap: 3 }).poly(8, 26, 24, 25, 24, 29, 22, 33, 20, 30, 18, 34, 15, 30, 12, 33, 10, 29, 8, 31);
    S.sh(-1).line(12, 27, 12, 31).line(18, 27, 18, 32);
    S.p(RAGS, { cap: 2, base: 1 }).line(10, 16, 22, 26, 2);
    S.d(STEEL, 3).dot(16, 21, 17, 21, 17, 22);
    // far ear
    S.p(G_SKIN, { cap: 2 }).poly(22, 8, 27, 1 + ear, 28, 3 + ear, 26, 9);
    // head
    S.p(G_SKIN, { cap: 6, spec: true }).oval(16, 6, 13, 12);
    S.p(G_SKIN, { cap: 3 }).poly(18, 13, 30, 14, 29, 19, 21, 20, 18, 17);
    S.c(0x1a1420).line(22, 16, 28, 16).dot(21, 15);
    S.c(0xfff4d8).dot(24, 16, 27, 17, 23, 17);
    S.d(G_SKIN, 0).line(22, 10, 26, 11);
    S.c(YEL).rect(23, 11, 3, 3).rect(28, 11, 1, 2);
    S.c(0x3a1a10).dot(25, 11, 25, 12, 25, 13);
    S.c(0xfffbe0).dot(23, 11);
    S.p(G_SKIN, { cap: 2 }).poly(27, 12, 32, 15, 29, 16);
    // near ear
    S.p(G_SKIN, { cap: 3 }).poly(19, 9, 11, 5, 2, 4 + ear, 8, 9, 13, 12, 19, 13);
    S.c(0xc47a78).line(8, 7, 15, 10);
    S.sh(-1).line(6, 6, 14, 9);
    // near arm + dagger
    S.p(G_SKIN, { cap: 3 }).path(18, 18, 21, 24, 26, 24).path(19, 18, 22, 23, 26, 23);
    S.p(IRON, { spec: true, cap: 3 }).poly(28, 21, 31, 19, 33, 16, 34, 12, 36, 11, 36, 15, 34, 19, 31, 23, 28, 24);
    S.d(IRON, 4).line(30, 20, 33, 16).dot(34, 13);
    S.d(RUST, 2).dot(32, 19, 35, 14, 30, 22);
    S.p(LEATHER).rect(26, 22, 3, 4);
    S.d(GOLD, 2).dot(27, 22);
    S.p(G_SKIN, { cap: 2 }).oval(25, 22, 4, 4);
  },
};

// ===== Bat
const BAT = mat([0x1e1430, 0x3a2452, 0x5e3a78, 0x8a5aa2, 0xc48ec8]);
const WING = mat([0x1a1028, 0x301a44, 0x4a2860, 0x6a3a7a, 0x9a5a98]);
const BAT_WINGS: number[][] = [
  [15, 11, 9, 2, 1, 0, 3, 7, 6, 6, 9, 10, 11, 10, 15, 17],
  [15, 11, 7, 7, 0, 10, 3, 15, 6, 13, 9, 17, 12, 15, 15, 18],
  [15, 11, 8, 14, 3, 24, 7, 24, 8, 21, 11, 23, 13, 19, 15, 18],
  [15, 11, 7, 5, 0, 5, 2, 11, 5, 10, 8, 14, 11, 13, 15, 17],
];
DEFS.bat = {
  w: 40, h: 30, frames: 4, footY: 26, pad: 2, float: 14, flip: true,
  draw(S, f) {
    const b = [1, 0, -1, 0][f];
    const wv = BAT_WINGS[f];
    for (const side of [0, 1]) {
      const X = (x: number) => (side ? 41 - x : x), Xl = (x: number) => (side ? 40 - x : x);
      S.at(0, 2 + b).p(WING, { cap: 3, base: side ? 1 : 2 }).poly(...wv.map((v, i) => (i % 2 ? v : X(v))));
      const [sx, sy, wx, wy, tx, ty, f1x, f1y, , , f2x, f2y] = wv;
      S.d(BAT, 3).line(Xl(wx), wy, Xl(tx), ty).line(Xl(wx), wy, Xl(f1x), f1y - 1).line(Xl(wx), wy, Xl(f2x), f2y - 1);
      S.d(BAT, 2).line(Xl(sx), sy, Xl(wx), wy);
      S.d(BAT, 4).dot(Xl(wx), wy);
    }
    S.at(0, 2 + b).p(BAT, { cap: 5 }).oval(15, 9, 11, 14);
    S.sh(1).oval(18, 14, 5, 6);
    S.p(BAT, { cap: 2 }).poly(15, 8, 14, -1, 19, 5).poly(22, 5, 27, -1, 26, 8);
    S.c(0xd07a9a).line(15, 2, 16, 5).line(25, 2, 24, 5);
    S.p(BAT, { cap: 5, spec: true }).oval(14, 4, 13, 10);
    S.c(0xff3a3a).rect(17, 8, 2, 2).rect(22, 8, 2, 2);
    S.c(0xffd0b0).dot(17, 8, 22, 8);
    S.c(0x2a0a18).line(18, 12, 23, 12);
    S.c(0xfffbf0).dot(18, 13, 23, 13);
    S.d(BAT, 1).dot(18, 22, 22, 22).dot(17, 23, 19, 23, 21, 23, 23, 23);
  },
};

// ===== Skeleton
const BONE = mat([0x4e3e56, 0x8a7c82, 0xc4b8a4, 0xe8e0c8, 0xfffcf0]);
const CLOTH = M(350, 0.35, 0.28, 0.08);
const GLOW_B = mat([0x1a3a8a, 0x2a70d0, 0x4aa8ff, 0x9ae0ff, 0xf0ffff]);
const IRON = mat([0x2a2438, 0x4a4252, 0x6e6468, 0x9a8c84, 0xc4b8a8]);
DEFS.skeleton = {
  w: 36, h: 52, frames: 4, footY: 49, flip: true,
  draw(S, f) {
    const b = BOB4[f];
    const sc = [0, 1, 2, 1][f];
    // scarf tail (behind)
    S.at(0, b).p(CLOTH, { cap: 3 }).poly(15, 16, 18, 17, 13, 21, 8 - sc, 24, 5 - sc, 23 + (sc & 1), 9, 21);
    // far arm + sword
    S.p(BONE, { cap: 2 }).path(21, 19, 24, 25, 28, 27);
    S.p(IRON, { spec: true, cap: 2 }).poly(29, 25, 34, 9, 36, 7, 35, 12, 31, 27);
    S.d(RUST, 2).dot(31, 20, 32, 17, 33, 13, 30, 24);
    S.d(RUST, 1).dot(32, 21, 31, 22, 33, 16);
    S.erase().dot(34, 15, 32, 21);
    S.p(RUST, { cap: 2 }).line(27, 26, 32, 28, 2);
    S.p(BONE, { cap: 2 }).oval(28, 26, 3, 3);
    // legs
    S.at(0, 0).p(BONE, { cap: 2 }).path(19, 31, 21, 39, 20, 47).path(20, 31, 22, 39);
    S.p(BONE, { cap: 2 }).poly(18, 47, 22, 47, 25, 49, 18, 49);
    S.p(BONE, { cap: 2 }).path(15, 31, 14, 39, 13, 47).path(16, 31, 15, 39);
    S.p(BONE, { cap: 2 }).poly(11, 47, 15, 47, 17, 49, 11, 49);
    S.p(BONE, { spec: true }).oval(20, 38, 3, 3);
    S.p(BONE, { spec: true }).oval(13, 38, 3, 3);
    // spine, pelvis, rags
    S.at(0, b).p(BONE, { cap: 2 }).rect(17, 17, 2, 13);
    S.sh(-2).dot(17, 19, 17, 22, 17, 25, 17, 28);
    S.p(BONE, { cap: 3 }).poly(13, 29, 22, 29, 23, 32, 18, 34, 12, 32);
    S.p(CLOTH, { cap: 3 }).poly(12, 31, 23, 31, 23, 35, 21, 39, 19, 36, 17, 40, 15, 36, 13, 38, 12, 35);
    // ribcage
    S.p(BONE, { cap: 4, spec: true }).oval(12, 18, 12, 10);
    S.erase().line(13, 21, 22, 22).line(13, 24, 22, 25).line(15, 27, 21, 27);
    S.d(BONE, 1).dot(18, 21, 18, 24);
    S.p(BONE, { cap: 2 }).line(12, 18, 23, 18);
    // skull
    S.p(BONE, { cap: 5, spec: true }).oval(14, 3, 12, 11);
    S.p(BONE, { cap: 3 }).poly(19, 9, 27, 9, 27, 13, 25, 15, 19, 15);
    S.p(BONE, { cap: 2, io: true }).poly(20, 15, 26, 15, 25, 18, 20, 18);
    S.c(0x1a1024).oval(21, 8, 3, 4).rect(26, 9, 1, 2).dot(25, 12, 26, 13);
    S.c(0x1a1024).line(21, 15, 26, 15);
    S.d(BONE, 4).dot(21, 16, 23, 16, 25, 16);
    const eg = [3, 4, 3, 2][f];
    S.d(GLOW_B, eg).dot(22, 9, 22, 10);
    S.d(GLOW_B, eg - 1).dot(26, 10);
    if (eg > 2) S.d(GLOW_B, 2).dot(21, 10, 23, 9);
    // scarf wrap
    S.p(CLOTH, { cap: 3 }).poly(15, 16, 23, 16, 22, 19, 15, 20);
    // near arm + shield
    S.p(BONE, { cap: 2 }).path(14, 19, 12, 25, 10, 27);
    S.p(IRON, { cap: 7, spec: true }).oval(2, 19, 14, 14);
    S.p(RAGS, { cap: 6 }).oval(4, 21, 10, 10);
    S.sh(-1).line(6, 22, 6, 29).line(9, 21, 9, 30).line(12, 22, 12, 29);
    S.p(IRON, { spec: true, cap: 2 }).oval(7, 24, 4, 4);
    S.erase().dot(14, 20, 15, 21, 15, 22);
    S.d(IRON, 0).path(13, 21, 11, 23).dot(11, 24, 4, 28);
    S.d(RUST, 2).dot(3, 25, 4, 29, 14, 27, 12, 31);
  },
};

// ===== Wisp
const FLAME = mat([0x8a1a2a, 0xd84a1a, 0xff8a1e, 0xffd24a, 0xfffbe0], 0x4a0e1e, 0x7a1a24);
DEFS.wisp = {
  w: 28, h: 36, frames: 4, footY: 31, float: 12, flip: true,
  draw(S, f) {
    const t = [[0, 0, 0], [1, -1, 1], [0, 1, 2], [-1, 0, 1]][f];
    const tongue = (d: number) => [
      7, 20, 4 + t[1], 11 + t[0], 8, 15, 9, 7 + t[1], 12, 12, 13 + t[0], 1 + t[2], 16, 10, 19, 4 - t[1], 19, 13, 23 + t[0], 9 + t[2], 22, 20,
    ].map((v, i) => {
      const cx = 14, cy = 22;
      return i % 2 ? cy + (v - cy) * d : cx + (v - cx) * d;
    });
    S.p(FLAME, { flat: true, base: 1, nr: true }).oval(5, 14, 18, 17).poly(...tongue(1));
    S.p(FLAME, { flat: true, base: 2, no: true, nr: true }).oval(7, 16, 14, 13).poly(...tongue(0.75));
    S.p(FLAME, { flat: true, base: 3, no: true, nr: true }).oval(9, 18, 10, 10).poly(...tongue(0.45));
    S.p(FLAME, { flat: true, base: 4, no: true, nr: true }).oval(10, 20, 8, 7);
    S.c(0x5a1410).rect(12, 21, 2, 3).rect(17, 21, 2, 3).dot(11, 20, 19, 20);
    S.c(0xfff4c0).dot(12, 23, 18, 23);
    S.erase().dot(13, 21, 17, 21);
    S.c(0xfffbe2).dot(13, 21, 17, 21);
    S.c(0x5a1410).rect(13, 26, 5, 1).dot(12, 25, 18, 25);
    S.c(0xffd24a).dot(14, 26, 16, 26);
    const em = [[4, 30], [22, 28], [8, 33], [18, 33]];
    em.forEach(([x, y], i) => {
      const k = (f + i) % 4;
      S.d(FLAME, 3 - (k >> 1)).dot(x - (k & 1), y - k * 3);
    });
  },
};

// ===== Sprout (mandragora)
const ROOT = mat([0x482a3c, 0x86584a, 0xbc8a62, 0xe0ba88, 0xf6e2b6]);
const LEAF = mat([0x14362e, 0x266436, 0x4a9a3c, 0x86ca50, 0xd0ee88]);
const PETAL = M(334, 0.72, 0.64, 0.1);
DEFS.sprout = {
  w: 32, h: 38, frames: 4, footY: 36, pad: 2, flip: true,
  draw(S, f) {
    const b = BOB4[f];
    const sw = [0, 1, 0, -1][f];
    // roots
    S.p(ROOT, { cap: 2 }).path(12, 31, 10, 34, 8, 35).path(13, 31, 11, 34);
    S.p(ROOT, { cap: 2 }).path(17, 32, 17, 35).path(18, 32, 18, 35).dot(19, 35);
    S.p(ROOT, { cap: 2 }).path(21, 31, 23, 34, 25, 35).path(20, 31, 22, 34);
    // far vine arm
    S.at(0, b).p(LEAF, { cap: 2 }).path(23, 22, 27, 24, 29, 22 - sw, 29, 20 - sw, 28, 19 - sw);
    S.p(LEAF, { cap: 2 }).poly(26, 24, 29, 26, 27, 27);
    // leaves (back)
    S.p(LEAF, { cap: 3, base: 1 }).poly(15, 15, 8 + sw, 3, 5 + sw, 2, 7 + sw, 7, 12, 15);
    S.p(LEAF, { cap: 3, base: 1 }).poly(17, 15, 23 + sw, 1, 26 + sw, 2, 23 + sw, 8, 19, 15);
    // body
    S.p(ROOT, { cap: 7, spec: true }).oval(7, 14, 18, 19).oval(10, 11, 12, 8);
    S.sh(-1).path(9, 20, 11, 22, 10, 25).path(12, 29, 15, 30);
    S.sh(1).path(11, 15, 13, 14);
    // face
    S.c(0x2a1020).line(16, 19, 19, 21).line(24, 19, 21, 21);
    S.c(0x2a1020).rect(17, 21, 2, 2).rect(21, 21, 2, 2);
    S.c(0xff5a3a).dot(18, 22, 22, 22);
    S.c(0x2a1020).poly(16, 25, 23, 25, 22, 29, 17, 29);
    S.c(0xa8344a).rect(18, 27, 4, 2);
    S.c(0xfff4d8).dot(17, 25, 19, 25, 21, 25, 22, 26, 18, 28);
    // near vine arm
    S.p(LEAF, { cap: 2 }).path(9, 22, 5, 25, 2, 23 + sw, 2, 21 + sw, 4, 20 + sw);
    S.p(LEAF, { cap: 2 }).poly(5, 25, 2, 28, 6, 27);
    // leaves (front)
    S.p(LEAF, { cap: 3, spec: true }).poly(14, 13, 3, 8 - sw, 1, 10 - sw, 5, 12, 12, 15);
    S.p(LEAF, { cap: 3, spec: true }).poly(18, 13, 29, 8 + sw, 31, 10 + sw, 27, 12, 20, 15);
    S.sh(-1).line(4, 9 - sw, 12, 13).line(28, 9 + sw, 20, 13);
    // flower
    S.p(LEAF, { cap: 2 }).line(16, 12, 16, 8);
    S.at(sw >> 1 < 0 ? 0 : 0, b).p(PETAL, { cap: 3 }).oval(12, 2, 4, 4).oval(17, 2, 4, 4).oval(14, 0, 5, 4).oval(12, 5, 4, 4).oval(17, 5, 4, 4);
    S.d(GOLD, 3).rect(15, 4, 3, 3);
    S.d(GOLD, 4).dot(15, 4);
  },
};

// ===== Ogre (elite)
const OGRE = mat([0x1c2230, 0x32403c, 0x52654e, 0x809468, 0xb8c28e]);
const FUR = M(30, 0.3, 0.32, 0.08);
DEFS.ogre = {
  w: 84, h: 84, frames: 4, footY: 82, pad: 2, flip: true,
  draw(S, f) {
    const b = BOB4[f];
    // legs
    S.at(0, 0).p(OGRE, { cap: 6 }).poly(42, 58, 56, 58, 57, 70, 54, 78, 45, 78, 44, 70);
    S.p(OGRE, { cap: 4 }).poly(43, 76, 56, 76, 61, 79, 61, 82, 43, 82);
    S.d(BONE, 2).dot(60, 80, 57, 81, 54, 81);
    S.p(OGRE, { cap: 6 }).poly(22, 60, 36, 60, 37, 70, 34, 78, 25, 78, 23, 70);
    S.p(OGRE, { cap: 4 }).poly(21, 76, 35, 76, 40, 79, 40, 82, 21, 82);
    S.d(BONE, 2).dot(39, 80, 36, 81, 33, 81);
    // club (far hand)
    S.at(0, b).p(WOOD, { cap: 3 }).line(59, 66, 69, 28, 4);
    S.p(WOOD, { cap: 8, spec: true }).poly(64, 32, 62, 22, 63, 12, 67, 5, 74, 2, 80, 4, 83, 10, 82, 19, 77, 28, 70, 34);
    S.sh(-1).path(68, 8, 66, 16, 67, 26).path(75, 6, 76, 14);
    S.p(IRON, { cap: 2, spec: true }).poly(63, 25, 79, 23, 77, 27, 64, 29);
    S.p(IRON, { cap: 2, spec: true }).poly(63, 13, 82, 12, 82, 15, 63, 16);
    const spikes = [[62, 18, -1, 0], [64, 8, -1, -1], [70, 3, 0, -1], [78, 3, 1, -1], [83, 17, 1, 0], [80, 25, 1, 1], [62, 26, -1, 0.3]];
    for (const [x, y, dx, dy] of spikes) {
      S.p(IRON, { cap: 2, spec: true, ns: true }).poly(x - dy * 1.5, y + dx * 1.5, x + dx * 4, y + dy * 4, x + dy * 1.5, y - dx * 1.5);
    }
    // far arm
    S.p(OGRE, { cap: 6 }).oval(46, 22, 16, 20);
    S.p(OGRE, { cap: 5 }).poly(52, 36, 64, 38, 67, 50, 57, 53);
    S.p(OGRE, { cap: 5, spec: true }).oval(56, 44, 12, 11);
    S.sh(-1).line(59, 49, 66, 48).line(60, 51, 66, 50);
    // torso
    S.p(OGRE, { cap: 9, spec: true }).oval(14, 20, 46, 42);
    S.sh(-1).path(36, 34, 42, 38, 50, 36);
    S.p(OGRE, { cap: 8 }).oval(30, 36, 28, 26);
    S.sh(-1).dot(46, 50, 46, 51);
    S.p(LEATHER, { cap: 2 }).line(28, 26, 54, 48, 3);
    S.d(IRON, 3).rect(40, 36, 3, 3);
    // belt + skulls
    S.p(LEATHER, { cap: 3 }).poly(18, 55, 58, 53, 59, 59, 18, 61);
    S.p(IRON, { spec: true, cap: 2 }).rect(46, 53, 6, 7);
    S.d(IRON, 0).rect(48, 55, 2, 3);
    for (const x of [24, 34]) {
      S.p(BONE, { cap: 3, spec: true }).oval(x, 53, 7, 6).rect(x + 2, 58, 3, 2);
      S.c(0x1a1024).dot(x + 2, 55, x + 4, 55, x + 3, 57);
    }
    // loincloth
    S.p(FUR, { cap: 4 }).poly(22, 60, 56, 59, 57, 66, 53, 72, 49, 67, 45, 74, 41, 67, 37, 72, 33, 66, 29, 71, 24, 65);
    S.sh(-1).dot(30, 63, 36, 64, 42, 62, 48, 64, 33, 68, 45, 69, 26, 63);
    S.sh(1).dot(28, 62, 39, 62, 51, 61, 44, 63);
    // head
    S.p(OGRE, { cap: 2 }).poly(44, 15, 38, 10, 43, 20);
    S.p(OGRE, { cap: 6, spec: true }).oval(42, 10, 18, 18);
    S.p(FUR, { cap: 3, base: 1 }).poly(45, 12, 52, 8, 58, 10, 51, 12);
    S.p(OGRE, { cap: 4 }).poly(45, 23, 63, 22, 64, 29, 60, 33, 48, 33, 44, 28);
    S.c(0x1a1024).line(50, 26, 62, 25);
    S.p(BONE, { cap: 2, spec: true }).poly(52, 27, 54, 20, 56, 27);
    S.p(BONE, { cap: 2, spec: true }).poly(59, 26, 61, 20, 63, 26);
    S.p(OGRE, { cap: 3, spec: true }).poly(47, 15, 61, 14, 62, 18, 48, 19);
    S.c(0x1a0a10).rect(55, 19, 4, 2).dot(61, 19);
    S.c(0xff8a2a).dot(56, 19, 57, 19, 61, 19);
    S.c(0xfff0a0).dot(57, 19);
    S.p(OGRE, { cap: 2 }).poly(60, 18, 64, 22, 60, 23);
    S.d(OGRE, 0).path(46, 13, 49, 16, 48, 19);
    // near arm + pauldron
    S.p(OGRE, { cap: 7 }).oval(10, 27, 18, 19);
    S.p(OGRE, { cap: 6 }).oval(10, 41, 17, 18);
    S.p(STEEL_D, { cap: 3, spec: true, io: true }).poly(10, 47, 27, 46, 27, 52, 10, 53);
    S.d(STEEL_D, 4).dot(13, 48, 20, 48);
    S.d(RUST, 2).dot(24, 50, 16, 51);
    S.p(OGRE, { cap: 6, spec: true }).oval(8, 55, 19, 13);
    S.sh(-1).line(11, 61, 24, 61).dot(15, 60, 20, 60);
    S.sh(1).dot(12, 58, 17, 57, 22, 58);
    S.p(STEEL_D, { cap: 2, spec: true }).poly(13, 18, 9, 7, 18, 16).poly(22, 15, 24, 4, 28, 15);
    S.p(STEEL_D, { cap: 4, io: true }).poly(9, 30, 18, 32, 28, 32, 30, 35, 18, 37, 10, 35);
    S.p(STEEL_D, { cap: 4, io: true, spec: true }).poly(6, 24, 20, 24, 32, 25, 35, 29, 26, 32, 16, 32, 7, 30);
    S.p(STEEL_D, { cap: 6, spec: true }).poly(7, 23, 12, 16, 22, 13, 32, 15, 36, 21, 30, 25, 20, 25);
    S.d(STEEL_D, 4).dot(12, 21, 20, 18, 28, 19, 12, 27, 22, 28, 30, 28);
    S.d(STEEL_D, 0).dot(12, 22, 20, 19, 28, 20, 12, 28, 22, 29, 30, 29);
    S.d(RUST, 1).dot(32, 22, 31, 23, 26, 30, 15, 34, 16, 34);
  },
};

// ===== Fallen Paladin (elite)
const DARK = mat([0x0c0816, 0x1c182e, 0x322e48, 0x524c6a, 0x8a82a2]);
const VIO = mat([0x4a1478, 0x8a34d4, 0xc06aff, 0xe6b4ff, 0xfff6ff], 0x1e0a36, 0x3a1a5a);
const CRIM = M(350, 0.62, 0.32, 0.09);
const HORN = mat([0x241818, 0x4a3632, 0x7a6456, 0xb09c84, 0xe4d8c0]);
DEFS.paladin = {
  w: 76, h: 80, frames: 4, footY: 78, pad: 2, flip: true,
  draw(S, f) {
    const b = BOB4[f];
    const fl = [0, 1, 2, 1][f];
    const g = [2, 3, 4, 3][f];
    const crack = (...pts: number[]) => { S.d(VIO, g - 1).path(...pts); S.d(VIO, Math.min(4, g + 1)).dot(pts[2], pts[3]); };
    const R = VIO.r[1];
    // cape
    S.at(0, b).p(CRIM, { cap: 6 }).poly(36, 24, 24, 26, 18, 34, 14, 48, 10, 60, 5 - fl, 73 - b, 9, 70 - b, 11, 76 - b, 14, 71 - b, 17, 77 - b - (fl & 1), 20, 72 - b, 23, 76 - b, 26, 70 - b, 30, 74 - b, 32, 60, 36, 40);
    S.sh(-1).path(22, 36, 18, 50, 16, 66).path(28, 40, 25, 56, 24, 70);
    S.sh(1).path(20, 34, 15, 50, 12, 62);
    S.erase().dot(14, 63, 15, 63, 15, 64, 21, 56, 21, 57, 20, 66);
    // far leg
    S.at(0, 0).p(DARK, { cap: 4, rim: R }).rect(40, 54, 8, 10);
    S.p(DARK, { cap: 4, rim: R }).poly(41, 66, 48, 66, 48, 74, 42, 74);
    S.p(DARK, { cap: 4 }).poly(40, 73, 49, 73, 56, 76, 56, 78, 40, 78);
    S.p(DARK, { cap: 3, spec: true, io: true }).oval(40, 61, 9, 6).poly(47, 62, 53, 61, 48, 66);
    // far pauldron + arm
    S.at(0, b).p(DARK, { cap: 5, spec: true, rim: R }).oval(40, 22, 14, 12).poly(48, 23, 55, 15, 52, 25);
    S.p(DARK, { cap: 4 }).poly(44, 30, 50, 30, 52, 40, 46, 42);
    // greatsword
    S.p(STEEL_D, { cap: 3, spec: true }).poly(50, 38, 57, 41, 75, 5, 74, 0, 71, 2);
    S.d(STEEL_D, 4).line(53, 38, 72, 3);
    S.d(STEEL_D, 0).line(55, 41, 74, 5);
    for (let i = 0; i < 6; i++) S.d(VIO, (i + f) % 3 === 0 ? g : g - 1).dot(56 + i * 3, 36 - i * 6).dot(57 + i * 3, 35 - i * 6);
    S.p(DARK, { cap: 2, spec: true }).line(47, 35, 62, 44, 3);
    S.p(DARK, { cap: 2 }).poly(46, 34, 44, 30, 49, 35).poly(62, 43, 66, 42, 62, 46);
    S.p(LEATHER, { cap: 2 }).line(53, 44, 49, 52, 3);
    S.p(DARK, { cap: 2, spec: true }).oval(46, 51, 5, 5);
    S.d(VIO, g).dot(48, 53);
    // near leg
    S.at(0, 0).p(DARK, { cap: 4 }).rect(26, 54, 9, 10);
    S.p(DARK, { cap: 4 }).poly(27, 66, 34, 66, 34, 74, 28, 74);
    S.p(DARK, { cap: 4 }).poly(25, 73, 35, 73, 41, 76, 41, 78, 25, 78);
    S.p(DARK, { cap: 3, spec: true, io: true }).oval(26, 61, 9, 6).poly(33, 62, 39, 61, 34, 66);
    // torso
    S.at(0, b).p(DARK, { cap: 7, spec: true, rim: R }).poly(26, 26, 44, 24, 50, 30, 50, 44, 46, 54, 28, 54, 24, 40);
    S.p(DARK, { cap: 3, io: true }).poly(26, 52, 48, 52, 50, 58, 49, 62, 25, 62, 24, 58);
    S.d(DARK, 0).line(26, 57, 49, 57).line(37, 52, 37, 62);
    crack(34, 29, 36, 33, 34, 37, 38, 42, 37, 46);
    crack(45, 29, 42, 33, 45, 37);
    crack(30, 55, 33, 59);
    crack(44, 55, 42, 58, 45, 61);
    // helm + horns
    S.p(DARK, { cap: 2 }).rect(33, 22, 10, 5);
    S.p(HORN, { cap: 3, spec: true }).poly(34, 12, 29, 8, 25, 5, 22, -1, 22, 4, 25, 9, 31, 15);
    S.p(HORN, { cap: 2, spec: true }).poly(41, 10, 44, 6, 45, 0, 47, 4, 45, 10);
    S.p(DARK, { cap: 6, spec: true, rim: R }).oval(30, 8, 16, 18);
    S.p(DARK, { cap: 4, io: true }).poly(38, 12, 47, 13, 48, 20, 45, 26, 36, 26, 36, 17);
    S.c(0x06040c).line(39, 17, 48, 17).line(43, 18, 43, 23);
    S.d(VIO, g).dot(44, 17, 46, 17);
    S.d(VIO, g - 1).dot(45, 17, 47, 17);
    if (g > 2) S.d(VIO, 2).dot(49, 16, 50, 16);
    // near pauldron
    S.p(DARK, { cap: 3, spec: true }).poly(20, 25, 13, 15, 25, 22).poly(27, 22, 26, 12, 31, 22);
    S.p(DARK, { cap: 6, spec: true, rim: R }).oval(18, 22, 20, 14);
    S.sh(-1).path(19, 32, 28, 35, 36, 32);
    crack(24, 25, 27, 28, 26, 31);
    // near arm to hilt
    S.p(DARK, { cap: 4 }).poly(26, 32, 34, 32, 36, 42, 28, 44);
    S.p(DARK, { cap: 4, io: true }).poly(30, 40, 36, 38, 49, 42, 48, 48, 32, 47);
    S.p(DARK, { cap: 3, spec: true, io: true }).oval(46, 41, 7, 8);
    S.sh(-1).line(50, 43, 50, 47);
  },
};

// ===== Crystal Wyrm (boss)
const AMETH = mat([0x1a0e3a, 0x36206c, 0x5e3aa4, 0x9a6ed8, 0xdcc6ff], 0x0e0620, 0x2a1450);
const CYAN = mat([0x0c2446, 0x16547c, 0x2896b8, 0x68d6ec, 0xdcfcff], 0x08142c, 0x103a5a);
const CORE = mat([0x7a1462, 0xc8348e, 0xff6ec4, 0xffc4ec, 0xffffff], 0x3a0a30, 0x5a1446);
const LIGHT: Pt = [-0.6, -0.8];
/** facet level from an outward normal */
function facet(nx: number, ny: number, bias = 0): number {
  const l = Math.hypot(nx, ny) || 1, d = (nx * LIGHT[0] + ny * LIGHT[1]) / l + bias;
  return d > 0.55 ? 4 : d > 0.15 ? 3 : d > -0.3 ? 2 : d > -0.7 ? 1 : 0;
}
type Seg = [number, number, number];
/** crystal tube along a path: back strip amethyst, belly strip cyan, hard facet shading per segment */
function crystalTube(S: P, pts: Seg[], spikes: boolean) {
  const N = pts.length;
  const nrm = (i: number): Pt => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(N - 1, i + 1)];
    const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  };
  if (spikes) for (let i = 1; i < N - 1; i++) {
    const [x, y, r] = pts[i], [nx, ny] = nrm(i);
    if (r < 5) continue;
    const a = pts[i - 1], dx = x - a[0], dy = y - a[1], dl = Math.hypot(dx, dy) || 1;
    const len = r * 0.9 + (i % 2) * 3, bw = r * 0.4;
    const bx = x + nx * r * 0.8, by = y + ny * r * 0.8;
    const tx = bx + nx * len - (dx / dl) * len * 0.45, ty = by + ny * len - (dy / dl) * len * 0.45;
    const b1x = bx - (dx / dl) * bw, b1y = by - (dy / dl) * bw, b2x = bx + (dx / dl) * bw, b2y = by + (dy / dl) * bw;
    S.p(CYAN, { flat: true, base: facet(-dx - nx, -dy - ny, 0.2), nr: true, ns: true }).poly(b1x, b1y, tx, ty, bx, by);
    S.p(CYAN, { flat: true, base: facet(dx + nx * 0.3, dy + ny * 0.3, -0.1), nr: true, ns: true }).poly(bx, by, tx, ty, b2x, b2y);
  }
  for (let i = 0; i < N - 1; i++) {
    const A = pts[i], B = pts[i + 1], nA = nrm(i), nB = nrm(i + 1);
    const at = (P0: Seg, n: Pt, k: number): Pt => [P0[0] + n[0] * P0[2] * k, P0[1] + n[1] * P0[2] * k];
    const strips: [number, number, Mat, number][] = [[1, 0.35, AMETH, 0.9], [0.35, -0.35, AMETH, 0], [-0.35, -1, CYAN, -0.9]];
    for (const [k0, k1, m, w] of strips) {
      const n: Pt = [(nA[0] + nB[0]) / 2, (nA[1] + nB[1]) / 2];
      const lv = w === 0 ? 2 : Math.min(w > 0 ? 3 : 2, facet(n[0] * w + 0.001, n[1] * w, w < 0 ? 0.5 : 0) + (w < 0 ? 1 : 0));
      const p1 = at(A, nA, k0), p2 = at(B, nB, k0), p3 = at(B, nB, k1), p4 = at(A, nA, k1);
      // each strip plate is split diagonally into two facets for a cut-gem look
      S.p(m, { flat: true, base: lv, nr: true, ns: true }).poly(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
      S.p(m, { flat: true, base: Math.max(0, lv - (i % 2 ? 1 : 0)), nr: true, ns: true }).poly(p1[0], p1[1], p3[0], p3[1], p4[0], p4[1]);
      if (w > 0 && lv >= 3 && A[2] > 4) S.d(m, 4).line(Math.round(p1[0]), Math.round(p1[1]), Math.round((p1[0] + p2[0]) / 2), Math.round((p1[1] + p2[1]) / 2));
    }
    // plate seam
    const s1 = at(A, nA, 1), s2 = at(A, nA, -1);
    if (i > 0) S.sh(-1).line(Math.round(s1[0]), Math.round(s1[1]), Math.round(s2[0]), Math.round(s2[1]));
  }
}
DEFS.wyrm = {
  w: 132, h: 120, frames: 4, footY: 116, pad: 2, flip: true,
  draw(S, f) {
    const b = [0, 1, 2, 1][f];
    const g = [2, 3, 4, 3][f];
    const wv = [0, -2, -3, -1][f];
    // far wing
    S.at(0, 0).p(AMETH, { cap: 2 }).path(84, 50, 82, 26 + wv, 76, 8 + wv).path(85, 50, 83, 26 + wv);
    S.p(CYAN, { flat: true, base: 1, nr: true }).poly(82, 26 + wv, 76, 8 + wv, 64, 4 + wv, 70, 18, 66, 30, 76, 40);
    S.p(CYAN, { flat: true, base: 2, nr: true }).poly(76, 8 + wv, 90, 0 + wv, 94, 10 + wv, 88, 20, 84, 40);
    S.d(AMETH, 3).path(76, 8 + wv, 64, 4 + wv).path(76, 8 + wv, 90, 0 + wv);
    // body coil
    const body: Seg[] = [
      [8, 66, 1.5], [10, 76, 3], [15, 87, 5], [24, 96, 7], [38, 102, 10], [56, 104, 12], [74, 103, 13], [88, 96, 14], [95, 84, 15],
      [93, 70, 14], [87, 58 + b * 0.5, 12], [85, 48 + b, 10], [89, 38 + b, 9], [97, 31 + b, 8], [106, 28 + b, 8],
    ];
    crystalTube(S, body, true);
    // tail blade
    S.p(CYAN, { flat: true, base: 4, nr: true }).poly(9, 67, 2, 52, 8, 58, 11, 66);
    S.p(CYAN, { flat: true, base: 2, nr: true }).poly(9, 67, 8, 58, 13, 55, 11, 66);
    // near wing
    const wx = 40, wy = 12 + wv;
    const tips: Pt[] = [[6, 22 + wv], [10, 44 + (wv >> 1)], [22, 62], [44, 70]];
    const sh: Pt = [74, 58];
    const el: Pt = [56, 34 + (wv >> 1)];
    const panels = [[sh, el, tips[3]], [el, [wx, wy], tips[3]], [[wx, wy], tips[2], tips[3]], [[wx, wy], tips[1], tips[2]], [[wx, wy], tips[0], tips[1]]] as Pt[][];
    panels.forEach((pp, i) => {
      const [a, c, d] = pp, m: Pt = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2];
      const lv = [1, 2, 1, 3, 2][i];
      S.p(CYAN, { flat: true, base: lv, nr: true, ns: true }).poly(a[0], a[1], c[0], c[1], m[0], m[1]);
      S.p(CYAN, { flat: true, base: lv - 1, nr: true, ns: true }).poly(a[0], a[1], m[0], m[1], d[0], d[1]);
      S.d(CYAN, Math.min(4, lv + 1)).line(Math.round(a[0]), Math.round(a[1]), Math.round(m[0]), Math.round(m[1]));
    });
    // scalloped trailing edge
    S.erase();
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = tips[i], [bx2, by2] = tips[i + 1];
      const mx = (ax + bx2) / 2 + 3, my = (ay + by2) / 2 - 3;
      S.poly(ax + (bx2 - ax) * 0.2, ay + (by2 - ay) * 0.2, mx, my, ax + (bx2 - ax) * 0.8, ay + (by2 - ay) * 0.8, mx - 6, my + 6);
    }
    S.p(AMETH, { cap: 2, spec: true }).path(sh[0], sh[1], el[0], el[1], wx, wy).path(sh[0] + 1, sh[1], el[0] + 1, el[1], wx + 1, wy + 1);
    for (const t of tips) S.p(AMETH, { cap: 2 }).line(wx, wy, t[0], t[1]);
    S.p(CYAN, { flat: true, base: 4 }).poly(wx - 1, wy + 1, wx + 2, wy - 8, wx + 3, wy + 1);
    // forelegs
    S.p(AMETH, { cap: 3 }).line(103, 93, 112, 96, 3);
    for (const [cx, cy] of [[113, 93], [114, 96], [112, 99]] as Pt[]) {
      S.p(CYAN, { flat: true, base: 4, ns: true }).poly(cx - 1, cy - 1, cx + 4, cy + 1, cx - 1, cy + 1);
      S.p(CYAN, { flat: true, base: 2, ns: true }).poly(cx - 1, cy + 1, cx + 4, cy + 1, cx, cy + 2);
    }
    S.p(AMETH, { flat: true, base: 3 }).poly(95, 86, 103, 87, 106, 94, 100, 97, 95, 93);
    S.p(AMETH, { flat: true, base: 1 }).poly(103, 87, 106, 94, 100, 97);
    S.p(AMETH, { cap: 2, spec: true }).oval(108, 93, 6, 6);
    // chest core
    S.p(AMETH, { flat: true, base: 1, nr: true }).poly(99, 70, 106, 79, 100, 90, 93, 80);
    S.p(CORE, { flat: true, base: g - 1, nr: true }).poly(99, 72, 104, 79, 99, 88, 95, 80);
    S.p(CORE, { flat: true, base: g - 2, nr: true, no: true }).poly(99, 80, 104, 79, 99, 88);
    S.p(CORE, { flat: true, base: g, nr: true, no: true }).poly(99, 75, 101, 79, 99, 84, 97, 80);
    S.d(CORE, 4).dot(98, 77, 98, 78);
    const halo: Pt[] = [[106, 80], [99, 69], [99, 91], [91, 80], [104, 73], [104, 86]];
    halo.forEach(([x, y], i) => { if ((i + f) % 3 !== 0 || g === 4) S.d(CORE, g - 1 - (i & 1)).dot(x, y); });
    // head
    const F = (m: Mat, lv: number, ...v: number[]) => S.p(m, { flat: true, base: lv, nr: true, ns: true }).poly(...v);
    S.at(0, b);
    F(CYAN, 3, 104, 21, 92, 11, 82, 2, 96, 8, 108, 17);
    F(CYAN, 1, 104, 21, 82, 2, 95, 13);
    F(CYAN, 4, 111, 17, 105, 8, 102, -1, 109, 6, 115, 16);
    F(CYAN, 2, 111, 17, 102, -1, 107, 10);
    F(AMETH, 3, 97, 26, 104, 18, 112, 15, 120, 17, 127, 21, 131, 25, 128, 27, 116, 26, 106, 30);
    F(AMETH, 4, 104, 18, 112, 15, 120, 17, 127, 21, 116, 20, 108, 20);
    F(AMETH, 2, 97, 26, 106, 30, 116, 26, 128, 27, 126, 29, 112, 30, 104, 35, 96, 34);
    F(CORE, 1, 104, 35, 112, 30, 126, 29, 122, 33, 110, 35);
    F(CYAN, 2, 99, 36, 110, 35, 122, 33, 126, 35, 118, 38, 106, 41, 98, 40);
    F(CYAN, 1, 98, 40, 106, 41, 118, 38, 110, 43, 100, 43);
    S.c(0xfffcf0).dot(114, 30, 117, 30, 120, 30, 123, 29).dot(113, 34, 116, 34, 119, 33);
    S.d(CORE, 2).dot(113, 32, 117, 32);
    F(CYAN, 4, 122, 21, 126, 15, 126, 22);
    F(CYAN, 4, 108, 20, 103, 13, 114, 18);
    F(CYAN, 2, 101, 30, 94, 28, 100, 34);
    S.c(0x12081e).dot(127, 24, 128, 24);
    // eye (slanted, glowing)
    S.c(0x12081e).line(111, 24, 118, 21).line(111, 23, 117, 21).dot(112, 22);
    S.d(CORE, g).line(112, 23, 116, 21);
    S.d(CORE, 4).dot(115, 22);
    if (g >= 3) S.d(CORE, 2).dot(119, 20, 120, 20);
  },
};

// ---------------------------------------------------------------- portraits (32x32 busts)
function eye(S: P, x: number, y: number, iris: RGB, irisHi: RGB, far = false) {
  const INKL = 0x2a1a2e;
  if (far) {
    S.c(INKL).dot(x, y, x + 1, y);
    S.c(iris).dot(x + 1, y + 1, x + 1, y + 2);
    S.c(irisHi).dot(x + 1, y + 2);
    return;
  }
  S.c(INKL).dot(x - 1, y, x, y, x + 1, y, x + 2, y - 1);
  S.c(iris).dot(x, y + 1, x + 1, y + 1, x, y + 2, x + 1, y + 2);
  S.c(irisHi).dot(x + 1, y + 2);
  S.c(0xffffff).dot(x, y + 1);
  S.c(EYE_W).dot(x - 1, y + 1);
}
const PORTRAITS: Record<HeroId, (S: P) => void> = {
  knight(S) {
    S.p(K_RED, { cap: 5 }).poly(1, 24, 31, 23, 32, 32, 0, 32);
    S.p(STEEL, { cap: 5 }).poly(7, 25, 25, 25, 27, 32, 5, 32);
    S.p(K_BLUE, { cap: 3 }).poly(13, 26, 22, 26, 23, 32, 12, 32);
    S.d(GOLD, 3).line(13, 26, 13, 31).line(22, 26, 23, 31);
    S.d(GOLD, 4).dot(17, 28, 18, 29, 17, 30, 16, 29, 17, 29);
    S.p(STEEL, { cap: 6, spec: true }).oval(20, 22, 14, 12);
    S.p(STEEL_D, { cap: 3 }).rect(11, 21, 12, 5);
    S.p(K_RED, { cap: 3 }).poly(15, 5, 16, 1, 11, 0, 5, 2, 1, 7, 0, 12, 4, 9, 5, 12, 8, 8, 12, 6);
    S.sh(1).path(13, 1, 7, 2, 3, 6);
    S.p(STEEL, { cap: 7, spec: true }).oval(7, 3, 19, 21);
    S.p(STEEL, { cap: 4, io: true }).poly(15, 9, 26, 9, 28, 12, 28, 19, 25, 24, 13, 24, 13, 15);
    S.c(0x120c1e).line(16, 13, 28, 13).line(17, 14, 27, 14);
    S.c(0x6ac8ff).dot(20, 13, 25, 13);
    S.c(0xd8f4ff).dot(20, 13);
    S.d(STEEL, 4).line(17, 12, 21, 12);
    S.d(STEEL_D, 1).dot(21, 18, 23, 18, 25, 18, 22, 20, 24, 20);
    S.d(STEEL, 1).line(19, 16, 19, 23);
    S.d(GOLD, 3).path(10, 4, 16, 3, 20, 4).line(7, 12, 12, 12);
    S.d(GOLD, 4).dot(14, 3);
    S.p(STEEL, { cap: 6, spec: true }).oval(-4, 22, 16, 12);
    S.d(GOLD, 3).path(-1, 30, 5, 31, 11, 29);
  },
  bmage(S) {
    S.p(L_HAIR, { cap: 4 }).poly(5, 10, 25, 10, 27, 20, 29, 29, 21, 32, 6, 32, 3, 22);
    S.sh(-1).line(6, 16, 5, 27).line(26, 16, 27, 27);
    S.p(L_ROBE, { cap: 5, base: 3 }).poly(4, 26, 28, 26, 31, 32, 1, 32);
    S.d(GOLD, 3).path(12, 26, 16, 31).path(23, 26, 19, 31);
    S.d(EMBER, 3).dot(17, 31, 18, 31);
    S.p(SKIN, { flat: true, base: 2 }).rect(14, 21, 6, 6);
    S.p(SKIN, { flat: true, base: 3 }).oval(10, 8, 13, 15).poly(13, 19, 23, 16, 21, 22, 16, 24);
    S.sh(-1).dot(10, 16, 10, 17, 11, 19, 12, 21);
    eye(S, 14, 14, IRIS_V, 0xc59be0);
    eye(S, 19, 14, IRIS_V, 0xc59be0, true);
    S.c(0xf08a90).dot(12, 18, 21, 18);
    S.d(SKIN, 1).dot(18, 20, 19, 20);
    S.d(SKIN, 2).dot(21, 16);
    S.p(L_HAIR, { cap: 3 }).poly(9, 8, 24, 8, 24, 11, 22, 12, 20, 10, 18, 13, 16, 10, 14, 13, 12, 11, 12, 26, 8, 27, 8, 12);
    S.sh(-1).line(10, 14, 10, 25);
    S.sh(1).line(9, 11, 9, 18);
    S.p(L_HAT, { cap: 5, spec: true }).poly(6, 7, 22, 7, 20, 3, 16, 0, 9, -1, 3, 0, 8, 2, 11, 4);
    S.p(GOLD, { spec: true, cap: 2 }).poly(7, 4, 21, 4, 22, 7, 6, 7);
    S.d(EMBER, 3).rect(13, 5, 2, 2);
    S.d(EMBER, 4).dot(13, 5);
    S.p(L_HAT, { cap: 3 }).poly(0, 10, 8, 6, 24, 6, 32, 8, 30, 11, 18, 11, 2, 12);
  },
  wmage(S) {
    S.p(WHITE, { cap: 6, base: 3 }).oval(5, 2, 23, 26).poly(1, 24, 30, 24, 32, 32, 0, 32);
    S.sh(-1).path(6, 14, 7, 22, 10, 27);
    S.d(W_RED, 2); zigzag(S, 1, 31, 32, true);
    S.d(W_RED, 1).line(0, 31, 31, 31);
    S.d(W_RED, 2).path(12, 25, 16, 29).path(23, 25, 19, 29);
    S.p(SKIN, { flat: true, base: 2 }).rect(14, 21, 6, 5);
    S.p(SKIN, { flat: true, base: 3 }).oval(11, 9, 12, 14).poly(13, 19, 23, 16, 21, 22, 16, 23);
    S.sh(-1).dot(11, 16, 11, 17, 12, 19);
    eye(S, 14, 14, IRIS_G, 0x6fb09a);
    eye(S, 19, 14, IRIS_G, 0x6fb09a, true);
    S.c(0xf29aa0).dot(12, 18, 21, 18);
    S.d(SKIN, 1).dot(18, 20);
    S.d(SKIN, 1).dot(19, 21);
    S.p(HAIR_B, { cap: 3 }).poly(10, 8, 24, 8, 24, 11, 22, 12, 20, 10, 18, 13, 16, 10, 14, 13, 12, 11, 12, 22, 9, 22, 9, 11);
    S.sh(1).line(11, 9, 16, 9);
    S.p(WHITE, { cap: 3, base: 3 }).poly(9, 6, 20, 4, 26, 6, 28, 10, 25, 9, 20, 7, 13, 8, 9, 12, 8, 24, 5, 25, 5, 12);
    S.d(W_RED, 2).dot(10, 7, 11, 7, 12, 7, 14, 6, 15, 6, 17, 5, 18, 5, 20, 5, 21, 5, 23, 6, 24, 6, 26, 8).dot(11, 8, 15, 7, 18, 6, 21, 6, 24, 7);
    S.d(W_RED, 2).line(8, 10, 7, 23).dot(8, 13, 8, 17, 8, 21);
    S.d(HOLY, 4).dot(27, 3, 29, 12);
    S.d(HOLY, 3).dot(28, 3, 27, 2, 27, 4, 26, 3);
  },
};

// ---------------------------------------------------------------- build + cache
function build(def: Def): SpriteSheet {
  const pad = def.pad ?? 0, h = def.h + pad;
  const canvas = document.createElement('canvas');
  canvas.width = def.w * def.frames; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  for (let f = 0; f < def.frames; f++) {
    const S = new P(def.w, h, def.flip, pad);
    def.draw(S, f);
    S.render(ctx, f * def.w);
  }
  return { canvas, w: def.w, h, frames: def.frames, footY: def.footY + pad, float: def.float ?? 0 };
}

const cache = new Map<SpriteId, SpriteSheet>();
export function getSprite(id: SpriteId): SpriteSheet {
  let s = cache.get(id);
  if (!s) { s = build(DEFS[id]); cache.set(id, s); }
  return s;
}

const pcache = new Map<HeroId, string>();
export function portraitUrl(id: HeroId): string {
  let u = pcache.get(id);
  if (!u) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const S = new P(32, 32);
    PORTRAITS[id](S);
    S.render(c.getContext('2d')!, 0);
    u = c.toDataURL('image/png');
    pcache.set(id, u);
  }
  return u;
}

