import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import './style.css';
import { audio } from './audio/audio';
import { EVENTS, clearSave, enterNode, load, newCard, newRun, save, theme, type NodeType, type Run } from './game/run';
import type { AccId, ItemId } from './game/loot';
import { createStage } from './render/stage';
import { app } from './ui/app';
import { battleScreen } from './ui/battle';
import { initTooltips } from './ui/dom';
import { bossIntro, endScreen, eventScreen, innScreen, levelUpScreen, mapScreen, partyIntro, rewardsScreen, shopScreen, titleScreen, treasureScreen } from './ui/screens';

const frame = document.getElementById('frame')!;
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

app.ui = ui;
app.audio = audio;
app.stage = createStage(canvas);
app.scale = 1;
app.toVirtual = (x, y) => {
  const r = frame.getBoundingClientRect();
  return [(x - r.left) / app.scale, (y - r.top) / app.scale];
};

function layout() {
  const w = window.innerWidth, hgt = window.innerHeight;
  const s = Math.min(w / 1920, hgt / 1080);
  const fw = Math.round(1920 * s), fh = Math.round(1080 * s);
  Object.assign(frame.style, { width: fw + 'px', height: fh + 'px', left: Math.round((w - fw) / 2) + 'px', top: Math.round((hgt - fh) / 2) + 'px' });
  ui.style.transform = `scale(${s})`;
  app.scale = s;
  app.stage.resize(fw, fh);
}
window.addEventListener('resize', layout);
// Headless captures render at ~2fps; ?warp keeps stage time at real speed by stepping the simulation on a timer.
if (new URLSearchParams(location.search).has('warp')) setInterval(() => (app.stage as unknown as { __step(dt: number): void }).__step(0.05), 50);
layout();
initTooltips(ui, app.toVirtual);

// Audio needs a user gesture.
const unlock = () => { audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

async function playRun(run: Run) {
  for (;;) {
    save(run);
    const id = await mapScreen(run, theme(run));
    const node = enterNode(run, id);
    switch (node.type) {
      case 'battle': case 'elite': case 'boss': {
        if (node.type === 'boss') await bossIntro();
        const won = await battleScreen(run, node.type);
        if (!won || node.type === 'boss') {
          clearSave();
          await endScreen(run, won);
          return;
        }
        if (node.type === 'elite') run.stats.elites++;
        await rewardsScreen(run, node.type);
        break;
      }
      case 'event': await eventScreen(run); break;
      case 'inn': await innScreen(run); break;
      case 'shop': await shopScreen(run); break;
      case 'treasure': await treasureScreen(run); break;
    }
  }
}

/** Dev shortcuts: ?dev=battle&enemies=wyrm | shop | event | inn | treasure | rewards | levelup | win | lose (&limit=100 &lv=3 &cards=a,b) */
async function devEntry(dev: string, q: URLSearchParams) {
  const run = newRun(Number(q.get('seed') ?? 7));
  run.limit = Number(q.get('limit') ?? 0);
  run.gold = Number(q.get('gold') ?? 300);
  if (q.get('deck')) run.deck = q.get('deck')!.split(',').map(id => newCard(run, id));
  for (const id of (q.get('cards') ?? '').split(',').filter(Boolean)) run.deck.push(newCard(run, id));
  for (const a of (q.get('acc') ?? '').split(',').filter(Boolean)) run.acc.push(a as AccId);
  if (q.get('items')) run.items = q.get('items')!.split(',').map(i => (i || null) as ItemId | null);
  const node = run.map.find(n => n.row === Number(q.get('row') ?? 1))!;
  enterNode(run, node.id);
  switch (dev) {
    case 'battle': await battleScreen(run, (q.get('type') as NodeType) ?? 'battle', q.get('enemies')?.split(',')); break;
    case 'shop': await shopScreen(run); break;
    case 'event': if (q.get('event')) run.seenEvents = EVENTS.map(e => e.id).filter(e => e !== q.get('event')); await eventScreen(run); break;
    case 'inn': await innScreen(run); break;
    case 'treasure': await treasureScreen(run); break;
    case 'rewards': await rewardsScreen(run, (q.get('type') as NodeType) ?? 'elite'); break;
    case 'levelup': await levelUpScreen(run, 2); break;
    case 'win': case 'lose': await endScreen(run, dev === 'win'); break;
  }
  await playRun(run);
}

async function main() {
  const q = new URLSearchParams(location.search);
  if (q.get('dev')) return devEntry(q.get('dev')!, q);
  // Tap-to-start gate so the first screen can have music.
  for (;;) {
    const saved = load();
    const choice = await titleScreen(!!saved);
    let run: Run;
    if (choice === 'continue' && saved) run = saved;
    else { run = newRun(); await partyIntro(); }
    await playRun(run);
  }
}

main();
