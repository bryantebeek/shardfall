import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import './style.css';
import { audio } from './audio/audio';
import { clearSave, enterNode, load, newRun, save, theme, type Run } from './game/run';
import { createStage } from './render/stage';
import { app } from './ui/app';
import { battleScreen } from './ui/battle';
import { initTooltips } from './ui/dom';
import { bossIntro, endScreen, eventScreen, innScreen, mapScreen, partyIntro, rewardsScreen, shopScreen, titleScreen, treasureScreen } from './ui/screens';

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

async function main() {
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
