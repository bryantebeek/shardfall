// Dev page: buttons for every sfx/track + volume sliders. ?selftest=1 renders everything offline and reports levels.
import { audio, Engine, Player, getSong, playSfx, SFX_NAMES, TRACK_NAMES } from '../audio/audio';
import type { Track } from '../audio/api';

const app = document.getElementById('app')!;
const section = (title: string) => { const h = document.createElement('h2'); h.textContent = title; app.append(h); const d = document.createElement('div'); app.append(d); return d; };
const button = (parent: HTMLElement, label: string, fn: () => void) => {
  const b = document.createElement('button'); b.textContent = label;
  b.onclick = () => { audio.unlock(); fn(); };
  parent.append(b);
};

const vols = section('Volume');
const stored = JSON.parse(localStorage.getItem('shardfall.volumes') ?? '{}');
for (const [k, def] of [['master', 0.8], ['music', 0.55], ['sfx', 0.8]] as const) {
  const l = document.createElement('label'), s = document.createElement('input');
  s.type = 'range'; s.min = '0'; s.max = '1'; s.step = '0.01'; s.value = String(stored[k] ?? def);
  s.oninput = () => audio.setVolumes({ [k]: Number(s.value) });
  l.append(`${k} `, s); vols.append(l);
}
const music = section('Music');
for (const t of [...TRACK_NAMES, 'none'] as Track[]) button(music, t, () => audio.music(t));
const sfx = section('SFX');
for (const n of SFX_NAMES) button(sfx, n, () => audio.sfx(n));

// ---------------------------------------------------------------- selftest
const db = (x: number) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');

async function render(sec: number, fn: (e: Engine) => void) {
  const sr = 44100, c = new OfflineAudioContext(2, Math.ceil(sr * sec), sr);
  const e = new Engine(c, { master: 0.8, music: 0.55, sfx: 0.8 });
  const t0 = performance.now();
  fn(e);
  const buf = await c.startRendering();
  const ms = performance.now() - t0;
  let peak = 0, sum = 0;
  for (let ch = 0; ch < 2; ch++) for (const x of buf.getChannelData(ch)) { const a = Math.abs(x); if (a > peak) peak = a; sum += x * x; if (Number.isNaN(x)) peak = NaN; }
  const rms = Math.sqrt(sum / (buf.length * 2));
  return { peak, rms, ms };
}

async function selftest() {
  const out: string[] = [];
  let fails = 0;
  const line = (label: string, r: { peak: number; rms: number; ms: number }, sec: number) => {
    const quiet = label.startsWith('sfx:') ? r.peak < 0.01 : r.rms < 0.01;
    const bad = !(r.peak < 0.999) ? 'CLIP' : quiet ? 'SILENT' : 'ok';
    if (bad !== 'ok') fails++;
    out.push(`${label.padEnd(18)} peak ${db(r.peak).padStart(6)} dBFS  rms ${db(r.rms).padStart(6)} dBFS  ${(r.ms | 0).toString().padStart(5)}ms/${sec}s  ${bad}`);
  };
  // pre-unlock calls must be silent no-ops
  try { audio.sfx('hit'); audio.music('none'); out.push('pre-unlock calls: ok'); } catch (err) { fails++; out.push('pre-unlock calls threw: ' + err); }

  for (const t of TRACK_NAMES) {
    try {
      const s = getSong(t), bar = t === 'inn' ? 12 : 16;
      const bad = s.parts.filter(p => s.len % p.len);
      if (bad.length || s.len % bar) { fails++; out.push(`track ${t}: loop length mismatch song=${s.len} parts=${s.parts.map(p => p.len)}`); }
      out.push(`track ${t}: ${s.len / bar} bars @ ${s.bpm}bpm = ${(s.len * 15 / s.bpm).toFixed(1)}s loop`);
      const sec = 12;
      line(`music:${t}`, await render(sec, e => new Player(e, s, 0.02, 0.01).pump(sec)), sec);
    } catch (err) { fails++; out.push(`track ${t} ERROR ${err}`); }
  }
  for (const n of SFX_NAMES) {
    try { line(`sfx:${n}`, await render(4, e => playSfx(e, n, 0.02)), 4); }
    catch (err) { fails++; out.push(`sfx ${n} ERROR ${err}`); }
  }
  // worst case: loud music + a pile of simultaneous sfx
  try {
    line('mix:boss+sfx', await render(6, e => {
      new Player(e, getSong('boss'), 0.02, 0.01).pump(6);
      for (const [i, n] of (['bigHit', 'break', 'thunder', 'fire', 'surge', 'hit', 'slash'] as const).entries()) playSfx(e, n, 0.5 + i * 0.1);
    }), 6);
  } catch (err) { fails++; out.push(`mix ERROR ${err}`); }

  // live context smoke test: unlock, crossfades, same-track no-op, sfx spam through the polyphony limiter
  const errs: string[] = [];
  const onErr = (ev: ErrorEvent) => errs.push(String(ev.message));
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); origWarn(...a); };
  window.addEventListener('error', onErr);
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
  audio.unlock();
  audio.music('battle');
  for (let i = 0; i < 30; i++) audio.sfx(SFX_NAMES[i % SFX_NAMES.length]);
  await wait(400);
  for (let i = 0; i < 10; i++) audio.sfx('hit');
  audio.music('boss'); await wait(300); audio.music('boss'); audio.music('title'); await wait(1500);
  audio.music('none'); await wait(300);
  console.warn = origWarn;
  window.removeEventListener('error', onErr);
  if (errs.length) { fails++; out.push('live smoke errors: ' + errs.join(' | ')); } else out.push('live smoke (unlock/crossfade/spam): ok');

  out.push(fails ? `SELFTEST FAIL (${fails})` : 'SELFTEST PASS');
  const pre = document.createElement('pre'); pre.id = 'selftest'; pre.textContent = out.join('\n');
  document.body.append(pre);
  console.log(out.join('\n'));
}

if (new URLSearchParams(location.search).has('selftest')) selftest();
