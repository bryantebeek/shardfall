import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import './style.css';
import { audio } from './audio/audio';
import {
  ARRIVAL, DAWN, DAWN_AFTER, DUSK, EMBERFALL_EVENTS, ENDING, PROLOGUE, REWIND, beginAttempt, emberfallEnemies, hillScene, knightSetup, newStory, rewind, spendHours, stepsRun,
} from './game/chapter1';
import { clearSave, enterNode, load, newCard, save, theme, type NodeType, type Run } from './game/run';
import type { AccId, ItemId } from './game/loot';
import { createStage } from './render/stage';
import { app } from './ui/app';
import { battleScreen } from './ui/battle';
import { initTooltips } from './ui/dom';
import { initGamepad } from './ui/gamepad';
import { endScreen, eventScreen, innScreen, levelUpScreen, mapScreen, rewardsScreen, shopScreen, titleScreen, treasureScreen } from './ui/screens';
import { chapterCard, chapterComplete, memoryCard, scene } from './ui/story';

const frame = document.getElementById('frame')!;
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

app.ui = ui;
app.audio = audio;
app.stage = createStage(canvas);
app.scale = 1;
app.speed = Number(localStorage.getItem('shardfall.speed')) || 1;
app.stage.setSpeed(app.speed);
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
initGamepad();

// Audio needs a user gesture.
const unlock = () => { audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

/** Chapter 1's opening: the prologue, the day before, the first night, and the first dawn. */
async function openChapter(): Promise<Run> {
  await scene(PROLOGUE);
  await chapterCard('Chapter 1', 'Emberfall', 'Twenty years later');
  await scene(ARRIVAL);
  await scene(DUSK);
  // the shrine steps: three strokes
  await battleScreen(stepsRun(), 'boss', ['ashsteps'], { theme: 'dusk' });
  const { run, memory } = rewind(beginAttempt(newStory()));
  await scene(DAWN);
  await memoryCard(memory!);
  await scene(DAWN_AFTER);
  return run;
}

/** The party fell: Seren takes everyone back to dawn, and they remember one more thing. */
async function fall(run: Run): Promise<Run> {
  const next = rewind(run);
  save(next.run);
  await scene(REWIND);
  if (next.memory) await memoryCard(next.memory);
  return next.run;
}

/** The escape from Emberfall, one attempt after another, until they reach the hill. */
async function playChapter(run: Run) {
  for (;;) {
    save(run);
    const id = await mapScreen(run, theme(run));
    const node = enterNode(run, id);
    spendHours(run, node);
    switch (node.type) {
      case 'battle': case 'elite': case 'boss': {
        if (node.type === 'boss') {
          await scene(hillScene(run));
          if (!run.story!.seen.includes('hill')) run.story!.seen.push('hill');
        }
        const won = await battleScreen(run, node.type, emberfallEnemies(run, node), { setup: knightSetup(run) });
        if (!won) { run = await fall(run); break; }
        if (node.type === 'boss') {
          await scene(ENDING);
          clearSave();
          await chapterComplete(run.story!);
          return;
        }
        if (node.type === 'elite') run.stats.elites++;
        await rewardsScreen(run, node.type);
        break;
      }
      case 'event': await eventScreen(run, EMBERFALL_EVENTS[node.event!]); break;
      case 'inn': await innScreen(run); break;
      case 'shop': await shopScreen(run); break;
      case 'treasure': await treasureScreen(run); break;
    }
  }
}

/** Dev shortcuts: ?dev=map | opening | ending | battle&enemies=ashknight | shop | event&event=mill | inn | treasure | rewards | levelup | win | lose
 *  (&memories=guard,bridge,well &cards=a,b) */
async function devEntry(dev: string, q: URLSearchParams) {
  if (dev === 'opening') return playChapter(await openChapter());
  const story = newStory();
  story.attempt = 2;
  story.memories = (q.get('memories') ?? 'guard').split(',').filter(Boolean);
  const run = beginAttempt(story, Number(q.get('seed') ?? 7));
  run.shards = Number(q.get('shards') ?? 300);
  if (q.get('deck')) run.deck = q.get('deck')!.split(',').map(id => newCard(run, id));
  for (const id of (q.get('cards') ?? '').split(',').filter(Boolean)) run.deck.push(newCard(run, id));
  for (const a of (q.get('acc') ?? '').split(',').filter(Boolean)) run.acc.push(a as AccId);
  if (q.get('items')) run.items = q.get('items')!.split(',').map(i => (i || null) as ItemId | null);
  const node = run.map.find(n => n.row === Number(q.get('row') ?? 1))!;
  enterNode(run, node.id);
  switch (dev) {
    case 'map': break;
    case 'ending': await scene(hillScene(run)); await scene(ENDING); await chapterComplete(run.story!); return;
    case 'battle': await battleScreen(run, (q.get('type') as NodeType) ?? 'battle', q.get('enemies')?.split(','), { setup: knightSetup(run) }); break;
    case 'shop': await shopScreen(run); break;
    case 'event': await eventScreen(run, EMBERFALL_EVENTS[q.get('event') ?? 'mill']); break;
    case 'inn': await innScreen(run); break;
    case 'treasure': await treasureScreen(run); break;
    case 'rewards': await rewardsScreen(run, (q.get('type') as NodeType) ?? 'elite'); break;
    case 'levelup': await levelUpScreen(run, 2); break;
    case 'win': case 'lose': await endScreen(run, dev === 'win'); break;
  }
  await playChapter(run);
}

async function main() {
  const q = new URLSearchParams(location.search);
  if (q.get('dev')) return devEntry(q.get('dev')!, q);
  // Tap-to-start gate so the first screen can have music.
  for (;;) {
    const last = load(), saved = last?.story ? last : null; // older Spire runs can't be continued in story mode
    const choice = await titleScreen(!!saved);
    await playChapter(choice === 'continue' && saved ? saved : await openChapter());
  }
}

// installable as an app (PWA), and playable offline once loaded
if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});

main();
