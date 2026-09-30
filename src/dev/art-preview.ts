// Dev-only preview of procedural sprites: /art-preview.html?s=6&only=knight,bmage
import { getSprite, portraitUrl } from '../art/sprites';
import type { HeroId, SpriteId } from '../game/types';

const q = new URLSearchParams(location.search);
const scale = Number(q.get('s') ?? 4);
const all: SpriteId[] = ['knight', 'bmage', 'wmage', 'slime', 'goblin', 'bat', 'skeleton', 'wisp', 'sprout', 'ogre', 'paladin', 'wyrm'];
const ids = q.get('only') ? (q.get('only')!.split(',') as SpriteId[]) : all;
const app = document.getElementById('app')!;

const portraits = document.createElement('div');
portraits.className = 'row';
for (const h of ['knight', 'bmage', 'wmage'] as HeroId[]) {
  const img = new Image();
  img.src = portraitUrl(h);
  img.width = img.height = 32 * scale;
  img.style.background = '#2a2336';
  portraits.append(img);
}
if (!q.get('only') || q.get('p')) app.append(portraits);

const anims: { ctx: CanvasRenderingContext2D; id: SpriteId }[] = [];
let row = document.createElement('div');
row.className = 'row';
app.append(row);
for (const id of ids) {
  const s = getSprite(id);
  const cell = document.createElement('div');
  cell.className = 'cell';
  const sheet = document.createElement('canvas');
  sheet.width = s.canvas.width * scale; sheet.height = s.h * scale;
  const sc = sheet.getContext('2d')!;
  sc.imageSmoothingEnabled = false;
  sc.drawImage(s.canvas, 0, 0, sheet.width, sheet.height);
  sc.strokeStyle = '#ffffff18';
  for (let f = 1; f < s.frames; f++) { sc.beginPath(); sc.moveTo(f * s.w * scale, 0); sc.lineTo(f * s.w * scale, sheet.height); sc.stroke(); }
  sc.fillStyle = '#ff000055';
  sc.fillRect(0, s.footY * scale, sheet.width, 1);
  const anim = document.createElement('canvas');
  anim.width = s.w * scale; anim.height = (s.h + s.float) * scale;
  const ac = anim.getContext('2d')!;
  ac.imageSmoothingEnabled = false;
  anims.push({ ctx: ac, id });
  const label = document.createElement('div');
  const px = s.canvas.getContext('2d')!.getImageData(0, 0, s.canvas.width, s.h).data;
  let low = -1, top = s.h;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.canvas.width; x++) if (px[(y * s.canvas.width + x) * 4 + 3]) { low = Math.max(low, y); top = Math.min(top, y); }
  label.textContent = `${id} ${s.w}x${s.h} f${s.frames} foot${s.footY} float${s.float} rows ${top}..${low}`;
  if (q.get('noanim')) cell.append(sheet, label); else cell.append(anim, sheet, label);
  row.append(cell);
}
let t = 0;
const tick = () => {
  t++;
  for (const { ctx, id } of anims) {
    const s = getSprite(id);
    const f = t % s.frames;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = '#00000060';
    ctx.beginPath();
    ctx.ellipse(ctx.canvas.width / 2, (s.footY + s.float) * scale, s.w * scale * 0.3, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(s.canvas, f * s.w, 0, s.w, s.h, 0, 0, s.w * scale, s.h * scale);
  }
};
tick();
setInterval(tick, 200);
