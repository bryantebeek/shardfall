// Procedural canvas textures for stage FX and set dressing (the art module owns sprites + tiles).
import * as THREE from 'three';
import { Rng } from '../game/rng';

const cache = new Map<string, THREE.Texture>();

function make(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, pixel = false): THREE.Texture {
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  cache.set(key, t);
  return t;
}

/** Radial falloff, white. */
export const glowTex = () => make('glow', 128, 128, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});

/** Blob shadow: black with soft alpha. */
export const blobTex = () => make('blob', 64, 64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(0,0,0,0.75)');
  r.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});

function glyph(g: CanvasRenderingContext2D, rng: Rng, x: number, y: number, s: number) {
  g.beginPath();
  const n = 2 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const a = rng.int(4) * Math.PI / 2, b = rng.next() * s;
    g.moveTo(x + Math.cos(a) * b * 0.3, y + Math.sin(a) * b * 0.3);
    g.lineTo(x + Math.cos(a + 1.3) * s * 0.5, y + Math.sin(a + 1.3) * s * 0.5);
  }
  g.stroke();
}

/** Magic floor circle: rings, glyph band, hexagram. White on transparent. */
export const runeTex = () => make('rune', 512, 512, (g, w) => {
  const c = w / 2, rng = new Rng(7);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.shadowColor = '#fff'; g.shadowBlur = 6;
  const ring = (r: number, lw: number) => { g.lineWidth = lw; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); };
  ring(248, 4); ring(236, 1.5); ring(190, 3); ring(176, 1.5); ring(96, 2); ring(84, 1);
  g.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.save(); g.translate(c + Math.cos(a) * 213, c + Math.sin(a) * 213); g.rotate(a + Math.PI / 2);
    glyph(g, rng, 0, 0, 22); g.restore();
  }
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, r0 = i % 3 ? 240 : 230;
    g.lineWidth = 1.5; g.beginPath();
    g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * 248, c + Math.sin(a) * 248); g.stroke();
  }
  g.lineWidth = 2.5;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2;
      const x = c + Math.cos(a) * 176, y = c + Math.sin(a) * 176;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    g.beginPath(); g.arc(c + Math.cos(a) * 176, c + Math.sin(a) * 176, 12, 0, Math.PI * 2); g.stroke();
  }
});

/** Target ring: double ring with four chevrons. */
export const ringTex = () => make('ring', 256, 256, (g, w) => {
  const c = w / 2;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8;
  g.lineWidth = 6; g.beginPath(); g.arc(c, c, 104, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.setLineDash([10, 8]); g.beginPath(); g.arc(c, c, 88, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    g.save(); g.translate(c, c); g.rotate(i * Math.PI / 2);
    g.beginPath(); g.moveTo(0, -112); g.lineTo(-12, -126); g.lineTo(12, -126); g.closePath(); g.fill(); g.restore();
  }
});

/** Crescent slash arc (bright core, soft edge). */
export const slashTex = () => make('slash', 256, 256, (g, w) => {
  const c = w / 2;
  g.shadowColor = '#fff'; g.shadowBlur = 16;
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.7)', '#fff'][i];
    const th = [26, 16, 7][i];
    g.beginPath();
    g.arc(c, c, 100, -2.4, 0.5, false);
    g.arc(c + th * 0.6, c - th * 0.4, 100 - th, 0.5, -2.4, true);
    g.closePath(); g.fill();
  }
});

/** Jagged lightning bolt, variant n. Top of texture = sky, bottom = ground. */
export const boltTex = (n: number) => make('bolt' + n, 128, 512, (g, w, h) => {
  const rng = new Rng(100 + n * 31);
  const pts: [number, number][] = [];
  let x = w / 2;
  for (let y = 0; y <= h; y += 24 + rng.int(20)) { pts.push([x, y]); x = w / 2 + (rng.next() - 0.5) * 70; }
  pts.push([w / 2, h]);
  const stroke = (lw: number, col: string, blur: number, list: [number, number][]) => {
    g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = '#bfe4ff'; g.shadowBlur = blur; g.lineJoin = 'miter';
    g.beginPath(); list.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  };
  stroke(14, 'rgba(160,210,255,0.35)', 24, pts);
  stroke(6, 'rgba(220,240,255,0.9)', 12, pts);
  stroke(2.5, '#fff', 4, pts);
  for (let b = 0; b < 3; b++) {
    const i = 2 + rng.int(pts.length - 4);
    const br: [number, number][] = [pts[i]];
    let [bx, by] = pts[i];
    for (let k = 0; k < 3; k++) { bx += (rng.next() - 0.5) * 50; by += 20 + rng.int(20); br.push([bx, by]); }
    stroke(3, 'rgba(220,240,255,0.8)', 8, br);
  }
});

/** Hexagon lattice shield. */
export const hexTex = () => make('hex', 256, 256, (g, w) => {
  const c = w / 2;
  g.strokeStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 6;
  const hex = (x: number, y: number, r: number, lw: number) => {
    g.lineWidth = lw; g.beginPath();
    for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
  };
  const r = 18;
  for (let q = -5; q <= 5; q++) for (let s = -5; s <= 5; s++) {
    const x = c + r * Math.sqrt(3) * (q + s / 2), y = c + r * 1.5 * s;
    const d = Math.hypot(x - c, y - c);
    if (d < 104) { g.globalAlpha = 0.25 + 0.6 * (d / 104) ** 2; hex(x, y, r - 1.5, 2); }
  }
  g.globalAlpha = 1; hex(c, c, 118, 5);
});

/** 4-point star glint. */
export const starTex = () => make('star', 64, 64, (g, w) => {
  const c = w / 2;
  const r = g.createRadialGradient(c, c, 0, c, c, c);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.2, 'rgba(255,255,255,0.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(c, 2); g.lineTo(c + 5, c - 5); g.lineTo(w - 2, c); g.lineTo(c + 5, c + 5); g.lineTo(c, w - 2); g.lineTo(c - 5, c + 5); g.lineTo(2, c); g.lineTo(c - 5, c - 5); g.closePath(); g.fill();
});

/** Radial rays burst (limit break). */
export const raysTex = () => make('rays', 512, 512, (g, w) => {
  const c = w / 2, rng = new Rng(3);
  g.translate(c, c);
  for (let i = 0; i < 40; i++) {
    const a = rng.next() * Math.PI * 2, wd = 0.02 + rng.next() * 0.06, len = c * (0.6 + rng.next() * 0.4);
    const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
    g.lineTo(Math.cos(a - wd) * len, Math.sin(a - wd) * len); g.lineTo(Math.cos(a + wd) * len, Math.sin(a + wd) * len); g.closePath(); g.fill();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, c * 0.35);
  r.addColorStop(0, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(-c, -c, w, w);
});

/** Vertical beam: soft horizontal falloff, fades at both ends (god rays, light pillars). */
export const beamTex = () => make('beam', 64, 256, (g, w, h) => {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x / (w - 1)) * 2 - 1, v = y / (h - 1);
    const a = Math.exp(-u * u * 4) * Math.min(1, v * 5) * Math.min(1, (1 - v) * 1.6);
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
});

/** Soft cloud blob for fog cards / smoke. */
export const cloudTex = () => make('cloud', 256, 128, (g, w, h) => {
  const rng = new Rng(11);
  for (let i = 0; i < 40; i++) {
    const x = w * (0.15 + rng.next() * 0.7), y = h * (0.35 + rng.next() * 0.35), r = 20 + rng.next() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }
});

/** Pixel-art foliage atlas: 8 cells of 16x16 (grass tufts, ferns, flowers). Returns texture; cell i at u=i/8. */
export const foliageTex = () => make('foliage', 128, 16, (g) => {
  const rng = new Rng(21);
  const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(x, y, 1, 1); };
  const greens = ['#2d5236', '#3f7040', '#5c9444', '#8abb52', '#bde070'];
  for (let cell = 0; cell < 8; cell++) {
    const ox = cell * 16;
    if (cell < 4) { // grass tufts
      const blades = 6 + rng.int(5);
      for (let b = 0; b < blades; b++) {
        let x = ox + 3 + rng.next() * 10, lean = (rng.next() - 0.5) * 0.9;
        const hgt = 5 + rng.int(9 - (cell % 2) * 2);
        for (let y = 0; y < hgt; y++) {
          const t = y / hgt;
          px(Math.round(x), 15 - y, greens[Math.min(4, Math.floor(t * 4.2 + (b % 2)))]);
          x += lean * (0.3 + t);
        }
      }
    } else if (cell < 6) { // fern
      for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) {
        let x = ox + 8, y = 15;
        const len = 9 - k * 2 + rng.int(3), dx = s * (0.5 + k * 0.35);
        for (let i = 0; i < len; i++) {
          px(Math.round(x), Math.round(y), greens[Math.min(4, 1 + Math.floor(i / len * 3.5))]);
          if (i % 2 === 1) px(Math.round(x), Math.round(y) + 1, greens[1]);
          x += dx; y -= 1.1 - i * 0.06;
        }
      }
    } else { // flowers
      const col = cell === 6 ? ['#e8e2ff', '#b7a4ff'] : ['#ffd46a', '#ff9d4a'];
      for (let b = 0; b < 4; b++) {
        const x = ox + 3 + rng.int(10), hgt = 4 + rng.int(6);
        for (let y = 0; y < hgt; y++) px(x, 15 - y, greens[1 + (y > 2 ? 1 : 0)]);
        const ty = 15 - hgt;
        px(x, ty, col[0]); px(x - 1, ty + 1, col[1]); px(x + 1, ty + 1, col[1]); px(x, ty + 1, '#fff6c8');
      }
      for (let b = 0; b < 5; b++) px(ox + 2 + rng.int(12), 15 - rng.int(3), greens[2]);
    }
  }
}, true);

/** Fire tongue gradient for brazier flame cards. */
export const flameTex = () => make('flame', 64, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.78, 2, w / 2, h * 0.6, h * 0.55);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,190,90,0.9)');
  gr.addColorStop(0.6, 'rgba(255,90,20,0.35)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(w / 2, 0);
  g.bezierCurveTo(w * 0.95, h * 0.5, w * 0.95, h * 0.95, w / 2, h);
  g.bezierCurveTo(w * 0.05, h * 0.95, w * 0.05, h * 0.5, w / 2, 0); g.fill();
});
