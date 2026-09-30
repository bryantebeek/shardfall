// Procedural WebAudio sound for Shardfall. Everything is synthesized at runtime.
// Graph: voices -> (per-bus dry | per-bus wet -> hall convolver) -> master -> compressor -> destination.
// All synthesis targets a BaseAudioContext, so the same code renders live or into an OfflineAudioContext.
import type { Audio, Sfx, Track } from './api';

export type Out = { dry: AudioNode; wet: AudioNode; end?: number };
export type Vol = { master: number; music: number; sfx: number };
type Inst = (e: Engine, o: Out, t: number, n: number, dur: number, vel: number) => void;

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`[audio] bad note "${name}"`);
  return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

// ---------------------------------------------------------------- envelopes

/** 0 -> peak in `a`, exponential decay over `d`. Returns end time. */
function perc(p: AudioParam, t: number, a: number, peak: number, d: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(Math.max(peak * 1e-4, 1e-6), t + a + d);
  return t + a + d;
}
/** attack `a`, hold until t+dur, release `r`. Returns end time. */
function asr(p: AudioParam, t: number, a: number, peak: number, dur: number, r: number): number {
  const off = t + Math.max(a, dur);
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setValueAtTime(peak, off);
  p.setTargetAtTime(0, off, r / 6);
  return off + r;
}

// ---------------------------------------------------------------- engine

function hallIR(c: BaseAudioContext, sec: number): AudioBuffer {
  const sr = c.sampleRate, len = Math.floor(sr * sec), pre = Math.floor(sr * 0.012);
  const b = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.9 - 0.75 * x); // darkens as it decays
      d[i] = lp * Math.exp(-6.9 * x) * Math.min(1, (i - pre) / (sr * 0.004));
    }
  }
  return b;
}

export class Engine {
  readonly master: GainNode;
  readonly music: { dry: GainNode; wet: GainNode };
  readonly sfx: { dry: GainNode; wet: GainNode };
  readonly noise: AudioBuffer;
  readonly organ: PeriodicWave;
  readonly drive = (() => {
    const a = new Float32Array(1024);
    for (let i = 0; i < a.length; i++) a[i] = Math.tanh(((i / (a.length - 1)) * 2 - 1) * 3);
    return a;
  })();
  private ksCache = new Map<string, AudioBuffer>();

  constructor(readonly c: BaseAudioContext, vol: Vol) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.connect(comp);
    const verb = c.createConvolver();
    verb.buffer = hallIR(c, 2.5);
    const ret = c.createGain();
    ret.gain.value = 0.5;
    verb.connect(ret); ret.connect(this.master);
    const bus = () => {
      const dry = c.createGain(), wet = c.createGain();
      dry.connect(this.master); wet.connect(verb);
      return { dry, wet };
    };
    this.music = bus();
    this.sfx = bus();
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.organ = c.createPeriodicWave([0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0.75, 0.4, 0.5, 0.12, 0.3, 0, 0.22]);
    this.setVolumes(vol, 0);
  }

  setVolumes(v: Vol, ramp = 0.05) {
    const t = this.c.currentTime;
    const set = (p: AudioParam, x: number) => (ramp ? p.setTargetAtTime(x, t, ramp) : (p.value = x));
    set(this.master.gain, v.master);
    set(this.music.dry.gain, v.music); set(this.music.wet.gain, v.music);
    set(this.sfx.dry.gain, v.sfx); set(this.sfx.wet.gain, v.sfx);
  }

  /** Karplus-Strong plucked string, precomputed per period length. Returns [buffer, playbackRate]. */
  ks(n: number, decay: number, bright: number): [AudioBuffer, number] {
    const sr = this.c.sampleRate, f = mtof(n), N = Math.max(2, Math.round(sr / f - 0.5));
    const key = `${N}:${decay}:${bright}`;
    let b = this.ksCache.get(key);
    if (!b) {
      const len = Math.ceil(sr * decay);
      b = this.c.createBuffer(1, len, sr);
      const d = b.getChannelData(0);
      let lp = 0, mean = 0, pk = 1e-9;
      for (let i = 0; i < N; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; d[i] = lp; mean += lp; }
      mean /= N;
      for (let i = 0; i < N; i++) { d[i] -= mean; pk = Math.max(pk, Math.abs(d[i])); }
      for (let i = 0; i < N; i++) d[i] /= pk;
      const rho = 0.001 ** (1 / ((sr / (N + 0.5)) * decay));
      for (let i = N; i < len; i++) d[i] = rho * 0.5 * (d[i - N] + (i > N ? d[i - N - 1] : 0));
      this.ksCache.set(key, b);
    }
    return [b, f / (sr / (N + 0.5))];
  }
}

/** One voice: owns its nodes and disconnects them when its last source ends. */
class V {
  private nodes: AudioNode[] = [];
  private last: AudioScheduledSourceNode | null = null;
  private end = 0;
  readonly c: BaseAudioContext;
  readonly out: GainNode;

  constructor(readonly e: Engine, private o: Out, send = 0.2, pan = 0) {
    this.c = e.c;
    this.out = this.add(this.c.createGain());
    this.out.connect(pan ? this.pan(pan, o.dry) : o.dry);
    if (send > 0) this.out.connect(this.gain(send, o.wet));
  }
  add<T extends AudioNode>(n: T): T { this.nodes.push(n); return n; }
  gain(v: number, dst: AudioNode = this.out): GainNode {
    const g = this.add(this.c.createGain()); g.gain.value = v; g.connect(dst); return g;
  }
  filter(type: BiquadFilterType, f: number, q = 0.7, dst: AudioNode = this.out): BiquadFilterNode {
    const b = this.add(this.c.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(dst); return b;
  }
  pan(x: number, dst: AudioNode = this.out): StereoPannerNode {
    const p = this.add(this.c.createStereoPanner()); p.pan.value = x; p.connect(dst); return p;
  }
  private reg(n: AudioScheduledSourceNode, t1: number) {
    this.add(n); n.stop(t1);
    if (t1 >= this.end) { this.end = t1; this.last = n; }
  }
  osc(type: OscillatorType | PeriodicWave, f: number, t0: number, t1: number, dst: AudioNode = this.out, detune = 0): OscillatorNode {
    const o = this.c.createOscillator();
    if (type instanceof PeriodicWave) o.setPeriodicWave(type); else o.type = type;
    o.frequency.setValueAtTime(f, t0); o.detune.value = detune;
    o.connect(dst); o.start(t0); this.reg(o, t1);
    return o;
  }
  noise(t0: number, t1: number, dst: AudioNode = this.out, rate = 1) {
    const s = this.c.createBufferSource();
    s.buffer = this.e.noise; s.loop = true; s.playbackRate.value = rate;
    s.connect(dst); s.start(t0, rnd(0, 1.9)); this.reg(s, t1);
  }
  buf(b: AudioBuffer, t0: number, rate: number, dst: AudioNode = this.out) {
    const s = this.c.createBufferSource();
    s.buffer = b; s.playbackRate.value = rate;
    s.connect(dst); s.start(t0); this.reg(s, t0 + b.duration / rate);
  }
  /** sine LFO added onto params; fades in over `delay` if given */
  lfo(rate: number, depth: number, t0: number, t1: number, targets: AudioParam[], delay = 0) {
    const g = this.add(this.c.createGain());
    if (delay) { g.gain.setValueAtTime(0, t0 + delay / 2); g.gain.linearRampToValueAtTime(depth, t0 + delay); }
    else g.gain.value = depth;
    for (const p of targets) g.connect(p);
    const o = this.c.createOscillator();
    o.frequency.value = rate; o.connect(g); o.start(t0); this.reg(o, t1);
  }
  done() {
    const nodes = this.nodes;
    if (this.last) this.last.onended = () => { for (const n of nodes) n.disconnect(); };
    if (this.o.end !== undefined && this.end > this.o.end) this.o.end = this.end;
  }
}

// ---------------------------------------------------------------- instruments

const strings = (att: number, rel: number, bright: number, send: number, lvl = 0.07): Inst => (e, o, t, n, dur, vel) => {
  const f = mtof(n), v = new V(e, o, send);
  const amp = v.gain(0), end = asr(amp.gain, t, att, vel * lvl, dur, rel);
  const lp = v.filter('lowpass', f * 1.5, 0.9, amp), fq = lp.frequency;
  fq.setValueAtTime(Math.min(f * 1.5, 12000), t);
  fq.linearRampToValueAtTime(Math.min(f * bright, 12000), t + att + 0.05);
  fq.setTargetAtTime(f * 1.2, end - rel, rel / 3);
  for (const [det, pn] of [[-10, -0.6], [0, 0], [10, 0.6]]) v.osc('sawtooth', f, t, end, v.pan(pn, lp), det + rnd(-3, 3));
  v.done();
};

const pluck = (decay: number, bright: number, send: number, lvl: number, tone = 5000): Inst => (e, o, t, n, _d, vel) => {
  const v = new V(e, o, send, rnd(-0.25, 0.25)), [b, rate] = e.ks(n, decay, bright);
  v.buf(b, t, rate, v.filter('lowpass', tone, 0.5, v.gain(vel * lvl)));
  v.done();
};

const flute: Inst = (e, o, t, n, dur, vel) => {
  const f = mtof(n), v = new V(e, o, 0.35);
  const amp = v.gain(0), end = asr(amp.gain, t, 0.07, vel * 0.13, dur, 0.2);
  const oscs = [v.osc('triangle', f, t, end, v.filter('lowpass', f * 2.5, 0.5, amp)), v.osc('sine', f, t, end, v.gain(0.6, amp))];
  for (const x of oscs) { x.detune.setValueAtTime(-15, t); x.detune.linearRampToValueAtTime(0, t + 0.06); }
  if (dur > 0.3) v.lfo(5 + rnd(-0.3, 0.3), 11, t, end, oscs.map(x => x.detune), 0.5);
  const bg = v.gain(0), bp = bg.gain; // breath: chiff at onset, then a faint hiss
  bp.setValueAtTime(0, t); bp.linearRampToValueAtTime(vel * 0.035, t + 0.02);
  bp.setTargetAtTime(vel * 0.008, t + 0.03, 0.06); bp.setTargetAtTime(0, t + Math.max(dur, 0.05), 0.05);
  v.noise(t, end, v.filter('bandpass', Math.min(f * 2, 8000), 1.5, bg));
  v.done();
};

const brass = (thick: boolean, lvl = 0.1): Inst => (e, o, t, n, dur, vel) => {
  const f = mtof(n), v = new V(e, o, 0.28, rnd(-0.1, 0.1));
  const off = t + Math.max(dur, 0.06), end = off + 0.2;
  const g = v.gain(0), gg = g.gain;
  gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(vel * lvl, t + 0.03);
  gg.setTargetAtTime(vel * lvl * 0.75, t + 0.03, 0.2); gg.setTargetAtTime(0, off, 0.04);
  const lp = v.filter('lowpass', f, 2, g), fq = lp.frequency;
  fq.setValueAtTime(f * 1.2, t); fq.linearRampToValueAtTime(Math.min(f * 8, 9000), t + 0.05);
  fq.setTargetAtTime(Math.min(f * 4, 7000), t + 0.05, 0.2); fq.setTargetAtTime(f, off, 0.05);
  const oscs = [v.osc('sawtooth', f, t, end, lp), v.osc('sawtooth', f, t, end, lp)];
  if (thick) oscs.push(v.osc('sawtooth', f / 2, t, end, v.gain(0.45, lp)));
  oscs.forEach((x, i) => { const d = i === 0 ? -7 : 7; x.detune.setValueAtTime(d - 30, t); x.detune.linearRampToValueAtTime(d, t + 0.05); });
  if (dur > 0.35) v.lfo(5.5, 12, t, end, oscs.map(x => x.detune), 0.45);
  v.done();
};

const bass: Inst = (e, o, t, n, dur, vel) => {
  const f = mtof(n), v = new V(e, o, 0.04);
  const amp = v.gain(0), end = asr(amp.gain, t, 0.004, vel * 0.2, Math.max(0.05, dur * 0.85), 0.05);
  const lp = v.filter('lowpass', f * 6, 4, amp);
  lp.frequency.setValueAtTime(Math.min(f * 14, 4000), t); lp.frequency.setTargetAtTime(f * 3, t + 0.005, 0.05);
  v.osc('sawtooth', f, t, end, lp);
  v.osc('sine', f, t, end, v.gain(0.7, amp));
  v.done();
};

const softBass: Inst = (e, o, t, n, dur, vel) => {
  const f = mtof(n), v = new V(e, o, 0.12);
  const amp = v.gain(0), end = asr(amp.gain, t, 0.02, vel * 0.22, dur, 0.35);
  v.osc('triangle', f, t, end, v.filter('lowpass', f * 3, 0.7, amp));
  v.osc('sine', f, t, end, v.gain(0.8, amp));
  v.done();
};

const timp: Inst = (e, o, t, n, _d, vel) => {
  const f = mtof(n), v = new V(e, o, 0.35);
  for (const [r, a, d] of [[1, 1, 1.4], [1.5, 0.35, 0.8], [1.98, 0.2, 0.5], [2.44, 0.1, 0.35]]) {
    const g = v.gain(0), end = perc(g.gain, t, 0.004, vel * 0.3 * a, d);
    v.osc('sine', f * r * 1.03, t, end + 0.01, g).frequency.exponentialRampToValueAtTime(f * r, t + 0.08);
  }
  const ng = v.gain(0), ne = perc(ng.gain, t, 0.002, vel * 0.22, 0.08);
  v.noise(t, ne + 0.01, v.filter('lowpass', 900, 0.7, ng));
  v.done();
};

const kick: Inst = (e, o, t, _n, _d, vel) => {
  const v = new V(e, o, 0.05), g = v.gain(0), end = perc(g.gain, t, 0.002, vel * 0.6, 0.35);
  v.osc('sine', 150, t, end, g).frequency.exponentialRampToValueAtTime(42, t + 0.13);
  const cg = v.gain(0); perc(cg.gain, t, 0.001, vel * 0.15, 0.015);
  v.noise(t, t + 0.03, v.filter('highpass', 2500, 0.7, cg));
  v.done();
};

const snare: Inst = (e, o, t, _n, _d, vel) => {
  const v = new V(e, o, 0.2), g = v.gain(0), end = perc(g.gain, t, 0.001, vel * 0.3, 0.17);
  v.noise(t, end, v.filter('bandpass', 3000, 0.6, v.filter('highpass', 1000, 0.7, g)));
  const bg = v.gain(0), be = perc(bg.gain, t, 0.001, vel * 0.3, 0.08);
  v.osc('triangle', 200, t, be, bg).frequency.exponentialRampToValueAtTime(150, be);
  v.done();
};

const hat = (decay: number): Inst => (e, o, t, _n, _d, vel) => {
  const v = new V(e, o, 0.08, 0.2), g = v.gain(0), end = perc(g.gain, t, 0.001, vel * 0.1, decay);
  v.noise(t, end, v.filter('highpass', 7500, 0.8, g));
  v.done();
};

const crash: Inst = (e, o, t, _n, _d, vel) => {
  const v = new V(e, o, 0.3), g = v.gain(0), end = perc(g.gain, t, 0.002, vel * 0.18, 1.8);
  v.noise(t, end, v.filter('highpass', 3500, 0.6, g));
  v.noise(t, end, v.filter('bandpass', 5200, 1, v.gain(0.6, g)));
  v.done();
};

const mbox: Inst = (e, o, t, n, _d, vel) => {
  const f = mtof(n) * 2 ** (rnd(-4, 4) / 1200), v = new V(e, o, 0.45, rnd(-0.3, 0.3));
  for (const [r, a, d] of [[1, 1, 2.4], [2, 0.12, 1.0], [5.93, 0.08, 0.3]]) {
    if (f * r > 16000) continue;
    const g = v.gain(0), end = perc(g.gain, t, 0.002, vel * 0.16 * a, d);
    v.osc('sine', f * r, t, end + 0.01, g);
  }
  const cg = v.gain(0); perc(cg.gain, t, 0.001, vel * 0.03, 0.012);
  v.noise(t, t + 0.03, v.filter('highpass', 5000, 0.7, cg));
  v.done();
};

const choir: Inst = (e, o, t, n, dur, vel) => {
  const f = mtof(n), v = new V(e, o, 0.5, rnd(-0.3, 0.3));
  const amp = v.gain(0), end = asr(amp.gain, t, 0.4, vel * 0.1, dur, 0.8);
  const mix = v.add(e.c.createGain()); // "ah" formants + a little direct body
  for (const [ff, fg, q] of [[730, 1, 5], [1090, 0.6, 6], [2440, 0.3, 8]]) mix.connect(v.filter('bandpass', ff, q, v.gain(fg * 2.2, amp)));
  mix.connect(v.filter('lowpass', f * 1.5, 0.7, v.gain(0.35, amp)));
  const oscs = [-12, 0, 11].map(d => v.osc('sawtooth', f, t, end, mix, d + rnd(-3, 3)));
  v.lfo(4.8 + rnd(-0.3, 0.3), 14, t, end, oscs.map(x => x.detune), 0.6);
  v.done();
};

const organ: Inst = (e, o, t, n, dur, vel) => {
  const f = mtof(n), v = new V(e, o, 0.35);
  const amp = v.gain(0), end = asr(amp.gain, t, 0.03, vel * 0.06, dur, 0.25);
  const lp = v.filter('lowpass', 5000, 0.5, amp);
  v.osc(e.organ, f, t, end, lp, -4); v.osc(e.organ, f, t, end, lp, 4);
  v.done();
};

const PAD = strings(0.5, 0.9, 4, 0.5);
const PAD_SOFT = strings(0.9, 1.2, 3, 0.55, 0.055);
const STAB = strings(0.006, 0.12, 7, 0.2, 0.065);
const OSTI = strings(0.006, 0.07, 5, 0.15, 0.05);
const HARP = pluck(2.6, 0.55, 0.4, 0.5);
const PIZZ = pluck(0.7, 0.35, 0.25, 0.55, 2500);
const LEAD = brass(true);
const HORN = brass(false, 0.06);
const HAT = hat(0.045);
const SHAKER = hat(0.07);

// ---------------------------------------------------------------- sfx building blocks

const BELL = [1, 2.76, 5.4, 8.93], GLASS = [1, 2.32, 4.25, 6.63];
const METAL = [1, 1.47, 2.09, 2.56, 3.14, 4.3], COIN = [1, 2.43, 3.97, 5.4], SOFT = [1, 2, 3.01];

function tone(e: Engine, o: Out, t: number, type: OscillatorType, f: number, a: number, d: number, vel: number,
  send = 0.15, f2 = 0, glide = 0, pan = 0) {
  const v = new V(e, o, send, pan), g = v.gain(0), end = perc(g.gain, t, a, vel, d);
  const os = v.osc(type, f, t, end + 0.01, g);
  if (f2) os.frequency.exponentialRampToValueAtTime(f2, t + (glide || a + d));
  v.done();
}
function nz(e: Engine, o: Out, t: number, a: number, d: number, vel: number, type: BiquadFilterType, f: number,
  q = 1, send = 0.15, sweep: [number, number][] = [], pan = 0, rate = 1) {
  const v = new V(e, o, send, pan), g = v.gain(0), end = perc(g.gain, t, a, vel, d);
  const fl = v.filter(type, f, q, g);
  fl.frequency.setValueAtTime(f, t);
  for (const [dt, fr] of sweep) fl.frequency.exponentialRampToValueAtTime(fr, t + dt);
  v.noise(t, end + 0.01, fl, rate);
  v.done();
}
function bell(e: Engine, o: Out, t: number, f: number, d: number, vel: number, send = 0.35, ratios = BELL, pan = 0) {
  const v = new V(e, o, send, pan);
  ratios.forEach((r, i) => {
    if (f * r > 16000) return;
    const g = v.gain(0), end = perc(g.gain, t, 0.0015, vel / (1 + i * 1.3), d / (1 + i * 0.8));
    v.osc('sine', f * r, t, end + 0.01, g);
  });
  v.done();
}
/** "reversed" tone: exponential rise, hard cut */
function swell(e: Engine, o: Out, t: number, rise: number, f: number, vel: number, send = 0.5, pan = 0) {
  const v = new V(e, o, send, pan), g = v.gain(0);
  g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(vel, t + rise); g.gain.linearRampToValueAtTime(0, t + rise + 0.02);
  v.osc('sine', f, t, t + rise + 0.03, g);
  v.done();
}
function crunch(e: Engine, o: Out, t: number, d: number, vel: number, f: number) {
  const v = new V(e, o, 0.12), g = v.gain(0), end = perc(g.gain, t, 0.001, vel, d);
  const ws = v.add(e.c.createWaveShaper());
  ws.curve = e.drive; ws.connect(v.filter('lowpass', f, 0.9, g));
  const pre = v.gain(2.5, ws);
  v.noise(t, end + 0.01, pre);
  v.osc('square', 75, t, end + 0.01, v.gain(0.5, pre));
  v.done();
}
const chord = (inst: Inst, e: Engine, o: Out, t: number, ns: number[], dur: number, vel: number, stagger = 0) =>
  ns.forEach((n, i) => inst(e, o, t + i * stagger, n, dur, vel));
const sparkles = (e: Engine, o: Out, t: number, span: number, count: number, vel = 0.018) => {
  for (let i = 0; i < count; i++) tone(e, o, t + rnd(0, span), 'sine', rnd(4500, 9500), 0.002, rnd(0.08, 0.25), vel, 0.6, 0, 0, rnd(-0.8, 0.8));
};

type SfxFn = (e: Engine, o: Out, t: number, p: number) => void;

const SFX: Record<Sfx, SfxFn> = {
  hover: (e, o, t, p) => {
    tone(e, o, t, 'sine', 2600 * p, 0.002, 0.035, 0.05, 0.05);
    nz(e, o, t, 0.001, 0.012, 0.03, 'highpass', 7000, 0.7, 0);
  },
  click: (e, o, t, p) => {
    tone(e, o, t, 'triangle', 1500 * p, 0.001, 0.05, 0.14, 0.08, 700 * p, 0.04);
    tone(e, o, t, 'sine', 240 * p, 0.001, 0.07, 0.2, 0.05, 130, 0.06);
    nz(e, o, t, 0.001, 0.02, 0.1, 'bandpass', 3500 * p, 1.5, 0.05);
  },
  select: (e, o, t) => {
    bell(e, o, t, mtof(88), 0.9, 0.1, 0.35, BELL, -0.2);
    bell(e, o, t + 0.06, mtof(95), 1.1, 0.08, 0.4, BELL, 0.2);
    tone(e, o, t, 'sine', mtof(76), 0.004, 0.4, 0.07, 0.3);
    nz(e, o, t + 0.04, 0.01, 0.2, 0.025, 'highpass', 9000, 0.7, 0.4);
  },
  error: (e, o, t) => {
    for (const dt of [0, 0.14]) {
      const v = new V(e, o, 0.05), g = v.gain(0), end = asr(g.gain, t + dt, 0.006, 0.09, 0.1, 0.04);
      const lp = v.filter('lowpass', 900, 2, g);
      v.osc('square', 98, t + dt, end, lp); v.osc('sawtooth', 104, t + dt, end, lp);
      v.done();
    }
  },
  cardDraw: (e, o, t, p) => {
    nz(e, o, t, 0.004, 0.09, 0.22, 'bandpass', 1500 * p, 1.2, 0.08, [[0.07, 6500 * p]], rnd(-0.3, 0.3));
    nz(e, o, t + 0.05, 0.001, 0.012, 0.12, 'highpass', 5000, 0.7, 0.05);
    tone(e, o, t, 'triangle', 320 * p, 0.002, 0.04, 0.05, 0.02, 180, 0.04);
  },
  cardPlay: (e, o, t, p) => {
    nz(e, o, t, 0.12, 0.25, 0.3, 'bandpass', 450 * p, 2, 0.25, [[0.12, 2800 * p], [0.37, 800 * p]]);
    tone(e, o, t + 0.15, 'sine', 170 * p, 0.002, 0.16, 0.22, 0.1, 70, 0.1);
    nz(e, o, t + 0.15, 0.001, 0.05, 0.1, 'lowpass', 1800, 0.7, 0.1);
    bell(e, o, t + 0.14, 1760 * p, 0.5, 0.03, 0.5);
  },
  shuffle: (e, o, t, p) => {
    for (let i = 0; i < 16; i++)
      nz(e, o, t + i * 0.021 + rnd(0, 0.008), 0.001, 0.018, 0.13 * (1 - i / 22), 'bandpass', rnd(2400, 4800) * p, 2, 0.03, [], i % 2 ? -0.3 : 0.3);
    nz(e, o, t, 0.06, 0.3, 0.05, 'bandpass', 3000 * p, 0.8, 0.1);
    nz(e, o, t + 0.37, 0.001, 0.04, 0.16, 'lowpass', 1400, 0.7, 0.08);
    tone(e, o, t + 0.37, 'sine', 190 * p, 0.001, 0.06, 0.1, 0.05, 110, 0.05);
  },
  endTurn: (e, o, t, p) => {
    const f = 98 * p;
    bell(e, o, t, f, 3.2, 0.2, 0.5, [1, 1.52, 2.03, 2.74, 3.37, 4.11, 5.2]);
    tone(e, o, t, 'sine', f / 2, 0.004, 1.4, 0.18, 0.2);
    nz(e, o, t, 0.002, 0.07, 0.15, 'lowpass', 700, 0.7, 0.2);
    nz(e, o, t, 0.35, 1.3, 0.025, 'bandpass', 2300 * p, 4, 0.6);
  },
  slash: (e, o, t, p) => {
    nz(e, o, t, 0.012, 0.15, 0.4, 'bandpass', 7500 * p, 1.3, 0.2, [[0.15, 1100 * p]], -0.35);
    nz(e, o, t + 0.02, 0.004, 0.09, 0.16, 'highpass', 3500, 0.7, 0.1, [], 0.35);
    bell(e, o, t + 0.035, 2200 * p, 0.55, 0.05, 0.4, [1, 1.58, 2.41, 3.35], 0.25);
    tone(e, o, t + 0.035, 'sine', 4400 * p, 0.001, 0.4, 0.02, 0.4, 4300 * p);
  },
  hit: (e, o, t, p) => {
    tone(e, o, t, 'sine', 150 * p, 0.002, 0.25, 0.7, 0.05, 45, 0.12);
    crunch(e, o, t, 0.1, 0.3, 3000 * p);
    nz(e, o, t, 0.001, 0.12, 0.3, 'lowpass', 3000 * p, 0.8, 0.1, [[0.1, 400]]);
  },
  bigHit: (e, o, t, p) => {
    tone(e, o, t, 'sine', 130 * p, 0.002, 0.35, 0.7, 0.08, 40, 0.15);
    tone(e, o, t, 'sine', 90 * p, 0.003, 0.8, 0.6, 0.15, 26, 0.55);
    crunch(e, o, t, 0.18, 0.45, 2400 * p);
    nz(e, o, t, 0.001, 0.035, 0.45, 'highpass', 1800, 0.7, 0.2);
    nz(e, o, t, 0.002, 0.6, 0.35, 'lowpass', 5000, 1, 0.45, [[0.5, 150]]);
  },
  block: (e, o, t, p) => {
    nz(e, o, t, 0.001, 0.03, 0.35, 'highpass', 2500, 0.7, 0.1);
    bell(e, o, t, 640 * p, 0.55, 0.22, 0.3, METAL);
    tone(e, o, t, 'triangle', 190 * p, 0.001, 0.08, 0.25, 0.05, 120, 0.08);
    for (let i = 0; i < 4; i++) bell(e, o, t + 0.04 + i * 0.045, rnd(3600, 6200) * p, 0.9, 0.022, 0.6, [1, 2.7], rnd(-0.6, 0.6));
  },
  fire: (e, o, t, p) => {
    nz(e, o, t, 0.15, 0.8, 0.45, 'lowpass', 400 * p, 4, 0.3, [[0.2, 3500 * p], [0.95, 450 * p]]);
    nz(e, o, t, 0.05, 0.6, 0.25, 'bandpass', 900 * p, 0.8, 0.3, [[0.6, 300]]);
    nz(e, o, t, 0.1, 0.8, 0.35, 'lowpass', 180, 1, 0.1, [], 0, 0.5);
    for (let i = 0; i < 24; i++)
      nz(e, o, t + rnd(0.02, 1.0), 0.0005, rnd(0.004, 0.012), rnd(0.08, 0.25), 'highpass', rnd(1500, 4500), 0.7, 0.05, [], rnd(-0.6, 0.6));
  },
  ice: (e, o, t, p) => {
    const ns = [88, 91, 93, 95, 98, 100, 103];
    for (let i = 0; i < 6; i++) bell(e, o, t + i * 0.045 + rnd(0, 0.02), mtof(pick(ns)) * p, 1.0, 0.06, 0.5, GLASS, rnd(-0.6, 0.6));
    nz(e, o, t, 0.001, 0.025, 0.35, 'bandpass', 3200, 1, 0.2);
    nz(e, o, t + 0.02, 0.001, 0.28, 0.22, 'highpass', 4500 * p, 0.7, 0.35);
    nz(e, o, t, 0.03, 0.55, 0.07, 'bandpass', 8000, 3, 0.5, [[0.55, 3000]]);
    sparkles(e, o, t + 0.05, 0.5, 10, 0.02);
  },
  thunder: (e, o, t, p) => {
    for (let k = 0; k < 4; k++)
      nz(e, o, t + k * rnd(0.012, 0.03), 0.001, 0.06 + k * 0.03, 0.55 / (1 + k * 0.6), 'highpass', 500 * p, 0.6, 0.3, [], rnd(-0.4, 0.4));
    nz(e, o, t, 0.001, 0.02, 0.4, 'bandpass', 4000, 0.8, 0.2);
    const v = new V(e, o, 0.5), g = v.gain(0), gg = g.gain;
    gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(0.55, t + 0.06);
    gg.setTargetAtTime(0.3, t + 0.06, 0.25); gg.setTargetAtTime(0, t + 0.6, 0.55);
    const trem = v.gain(0.7, v.filter('lowpass', 260, 1, g)); // rolling rumble
    v.lfo(3.2, 0.3, t, t + 3.2, [trem.gain]);
    v.noise(t, t + 3.2, trem, 0.6);
    v.done();
    tone(e, o, t, 'sine', 60 * p, 0.01, 1.6, 0.4, 0.2, 32, 1.4);
  },
  holy: (e, o, t) => {
    [72, 76, 79, 84, 88].forEach((n, i) => {
      const f = mtof(n), st = t + i * 0.035, v = new V(e, o, 0.6, (i - 2) * 0.25), g = v.gain(0);
      const end = asr(g.gain, st, 0.25, 0.045, 0.9, 1.1);
      const os = [-8, 0, 8].map(d => v.osc('sine', f, st, end, g, d));
      os.push(v.osc('triangle', f, st, end, v.gain(0.3, g)));
      v.lfo(5.5, 10, st, end, os.map(x => x.detune), 0.3);
      v.done();
    });
    chord(choir, e, o, t, [60, 64, 67], 0.9, 0.6);
    sparkles(e, o, t + 0.05, 1.2, 12, 0.02);
    nz(e, o, t, 0.4, 1.2, 0.03, 'highpass', 6000, 0.7, 0.6);
  },
  dark: (e, o, t, p) => {
    const v = new V(e, o, 0.5), g = v.gain(0), gg = g.gain;
    gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(0.14, t + 0.6); gg.setTargetAtTime(0, t + 1.0, 0.3);
    const trem = v.gain(0.75, g);
    v.lfo(6.5, 0.25, t, t + 2.4, [trem.gain]);
    const lp = v.filter('lowpass', 200, 6, trem);
    lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(1000, t + 0.7); lp.frequency.exponentialRampToValueAtTime(150, t + 2);
    for (const f of [55, 77.78]) for (const d of [-12, 12]) v.osc('sawtooth', f * p, t, t + 2.4, lp, d);
    v.done();
    tone(e, o, t, 'sine', 45 * p, 0.4, 1.2, 0.3, 0.2);
    tone(e, o, t + 0.1, 'sine', 1245 * p, 0.5, 1.2, 0.025, 0.8, 1150 * p, 1.6);
    nz(e, o, t, 0.5, 0.8, 0.12, 'bandpass', 300, 2, 0.5, [[0.5, 800], [1.3, 200]]);
  },
  heal: (e, o, t) => {
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => bell(e, o, t + i * 0.055, mtof(n), 1.1, 0.07, 0.5, SOFT, i / 3 - 1));
    for (const n of [60, 64, 67, 72]) tone(e, o, t, 'sine', mtof(n), 0.3, 1.0, 0.035, 0.6);
    nz(e, o, t + 0.1, 0.25, 0.8, 0.05, 'highpass', 8000, 0.7, 0.6);
    sparkles(e, o, t + 0.2, 0.7, 8, 0.015);
  },
  buff: (e, o, t) => {
    [67, 71, 74, 79, 83].forEach((n, i) => {
      const st = t + i * 0.065, v = new V(e, o, 0.3, (i - 2) * 0.2), g = v.gain(0);
      const end = perc(g.gain, st, 0.004, 0.09, i === 4 ? 0.7 : 0.22), lp = v.filter('lowpass', 4500, 0.7, g);
      v.osc('triangle', mtof(n), st, end, lp); v.osc('square', mtof(n), st, end, v.gain(0.3, lp));
      v.done();
    });
    nz(e, o, t, 0.28, 0.3, 0.07, 'bandpass', 700, 2, 0.3, [[0.3, 5000]]);
    bell(e, o, t + 0.26, mtof(95), 0.8, 0.04, 0.5);
  },
  debuff: (e, o, t) => {
    [76, 72, 69, 64].forEach((n, i) => {
      const f = mtof(n), st = t + i * 0.1, v = new V(e, o, 0.3, 0.2 - i * 0.12), g = v.gain(0);
      const end = perc(g.gain, st, 0.005, 0.07, i === 3 ? 0.6 : 0.28), lp = v.filter('lowpass', 1600, 2, g);
      for (const d of [-18, 14]) v.osc('sawtooth', f, st, end, lp, d).frequency.exponentialRampToValueAtTime(f * 0.94, end);
      v.done();
    });
    nz(e, o, t, 0.05, 0.5, 0.06, 'bandpass', 2000, 3, 0.3, [[0.5, 300]]);
    tone(e, o, t, 'sine', 220, 0.01, 0.6, 0.08, 0.2, 100, 0.6);
  },
  break: (e, o, t, p) => {
    const T = t + 0.1;
    // reversed shimmer sucking into the impact
    for (const n of [95, 100, 104]) swell(e, o, t, 0.1, mtof(n) * p, 0.04, 0.3, rnd(-0.5, 0.5));
    const v = new V(e, o, 0.4), g = v.gain(0);
    g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(0.22, T); g.gain.linearRampToValueAtTime(0, T + 0.02);
    v.noise(t, T + 0.03, v.filter('highpass', 3500, 0.7, g));
    v.done();
    // deep impact
    kick(e, o, T, 0, 0, 1.3);
    tone(e, o, T, 'sine', 140 * p, 0.002, 0.9, 0.75, 0.3, 28, 0.6);
    crunch(e, o, T, 0.25, 0.45, 3500);
    nz(e, o, T, 0.001, 0.7, 0.3, 'lowpass', 7000, 1, 0.5, [[0.6, 180]]);
    // glass shatter
    nz(e, o, T, 0.001, 0.4, 0.35, 'highpass', 3000, 0.7, 0.45);
    for (let i = 0; i < 26; i++) {
      const dt = Math.random() ** 2 * 0.7;
      bell(e, o, T + dt, rnd(2200, 9000), rnd(0.08, 0.35), rnd(0.02, 0.06) * (1 - dt), 0.5, GLASS, rnd(-0.9, 0.9));
    }
    // crystalline ring + airy tail
    bell(e, o, T, mtof(88) * p, 2.2, 0.09, 0.7, GLASS, -0.3);
    bell(e, o, T + 0.02, mtof(95) * p, 2.0, 0.07, 0.7, GLASS, 0.3);
    nz(e, o, T + 0.05, 0.3, 1.2, 0.04, 'bandpass', 7000, 2, 0.8);
  },
  ko: (e, o, t) => {
    const v = new V(e, o, 0.3), g = v.gain(0), end = asr(g.gain, t, 0.01, 0.1, 0.6, 0.12);
    const lp = v.filter('lowpass', 2500, 1.5, g);
    lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.7);
    v.osc('sawtooth', 660, t, end, lp).frequency.exponentialRampToValueAtTime(80, t + 0.7);
    v.osc('square', 660, t, end, lp, 10).frequency.exponentialRampToValueAtTime(80, t + 0.7);
    v.done();
    tone(e, o, t + 0.62, 'sine', 120, 0.002, 0.35, 0.55, 0.15, 38, 0.2);
    nz(e, o, t + 0.62, 0.001, 0.15, 0.22, 'lowpass', 900, 0.7, 0.2);
  },
  revive: (e, o, t) => {
    [67, 71, 74, 79, 83].forEach((n, i) => {
      const f = mtof(n), v = new V(e, o, 0.6, (i - 2) * 0.3), g = v.gain(0), gg = g.gain;
      gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(0.04, t + 0.8); gg.setTargetAtTime(0, t + 1.0, 0.35);
      const os = [-7, 7].map(d => v.osc('sine', f, t, t + 2.8, g, d));
      os.push(v.osc('triangle', f, t, t + 2.8, v.gain(0.4, g)));
      for (const x of os) { x.frequency.setValueAtTime(f * 0.94, t); x.frequency.exponentialRampToValueAtTime(f, t + 0.8); }
      v.lfo(5, 9, t, t + 2.8, os.map(x => x.detune), 0.4);
      v.done();
    });
    [55, 59, 62, 67, 71, 74, 79, 83, 86, 91].forEach((n, i) => HARP(e, o, t + i * 0.06, n, 0.5, 0.45));
    nz(e, o, t, 0.8, 1.0, 0.05, 'highpass', 7000, 0.7, 0.7);
    bell(e, o, t + 0.8, mtof(91), 1.5, 0.06, 0.6);
  },
  chime: (e, o, t) => {
    const v = new V(e, o, 0.4), g = v.gain(0), gg = g.gain;
    gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(0.05, t + 0.55); gg.setTargetAtTime(0, t + 0.65, 0.3);
    const lp = v.filter('lowpass', 300, 3, g);
    lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(6000, t + 0.6);
    for (const n of [62, 66, 69, 74, 76]) for (const d of [-8, 8]) v.osc('sawtooth', mtof(n), t, t + 2.0, v.pan(d / 10, lp), d);
    v.done();
    bell(e, o, t + 0.55, mtof(93), 1.2, 0.07, 0.6);
    bell(e, o, t + 0.6, mtof(98), 1.2, 0.05, 0.6);
    nz(e, o, t, 0.55, 0.5, 0.06, 'highpass', 6000, 0.7, 0.5);
  },
  surge: (e, o, t) => {
    const T = t + 0.9;
    const v = new V(e, o, 0.35), g = v.gain(0), gg = g.gain;
    gg.setValueAtTime(1e-4, t); gg.exponentialRampToValueAtTime(0.05, T); gg.setTargetAtTime(0, T + 0.05, 0.08);
    const lp = v.filter('lowpass', 200, 2, g);
    lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(4500, T);
    for (const n of [38, 45, 50, 54, 57, 62]) for (const d of [-7, 7]) v.osc('sawtooth', mtof(n), t, T + 0.6, lp, d);
    v.done();
    for (let i = 0; i < 13; i++) timp(e, o, t + i * 0.068, 38, 0.2, 0.2 + i * 0.05);
    kick(e, o, T, 0, 0, 1.3);
    crash(e, o, T, 0, 0, 1);
    timp(e, o, T, 38, 1, 1.1);
    tone(e, o, T, 'sine', 110, 0.003, 0.9, 0.6, 0.2, 30, 0.6);
    chord(LEAD, e, o, T, [62, 66, 69, 74], 1.0, 0.9);
    chord(choir, e, o, T, [62, 69, 74, 78], 1.2, 0.8);
    nz(e, o, T, 0.001, 0.5, 0.3, 'lowpass', 5000, 1, 0.4, [[0.5, 200]]);
  },
  victory: (e, o, t) => {
    // original fanfare in C: pickup triplet, leap, IV lift, held tonic, timpani roll, button
    const mel: [number, number, number][] = [
      [0, 67, 0.09], [0.1, 72, 0.09], [0.2, 76, 0.09], [0.3, 79, 0.42], [0.75, 76, 0.13],
      [0.9, 77, 0.13], [1.05, 81, 0.13], [1.2, 84, 1.1], [2.45, 84, 0.55],
    ];
    for (const [dt, n, d] of mel) LEAD(e, o, t + dt, n, d, 1);
    chord(HORN, e, o, t + 0.3, [60, 64, 67], 0.55, 0.8);
    chord(HORN, e, o, t + 0.9, [65, 69, 72], 0.28, 0.8);
    chord(HORN, e, o, t + 1.2, [60, 64, 67, 72], 1.1, 0.8);
    chord(HORN, e, o, t + 2.45, [60, 67, 72, 76], 0.55, 1);
    chord(PAD, e, o, t + 1.2, [48, 55, 64, 72], 1.2, 0.8);
    softBass(e, o, t + 0.3, 36, 0.55, 1); softBass(e, o, t + 0.9, 41, 0.28, 1);
    softBass(e, o, t + 1.2, 36, 1.1, 1); softBass(e, o, t + 2.45, 36, 0.6, 1.1);
    timp(e, o, t + 0.3, 48, 0.3, 1); timp(e, o, t + 0.75, 43, 0.3, 0.7); timp(e, o, t + 0.9, 43, 0.3, 0.8);
    for (let i = 0; i < 16; i++) timp(e, o, t + 1.3 + i * 0.07, 48, 0.2, 0.2 + i * 0.04);
    timp(e, o, t + 2.45, 36, 1, 1.1);
    crash(e, o, t + 0.3, 0, 0, 0.5); crash(e, o, t + 2.45, 0, 0, 1);
    [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84].forEach((n, i) => HARP(e, o, t + 1.2 + i * 0.03, n, 0.5, 0.35));
    sparkles(e, o, t + 2.45, 0.6, 8);
  },
  defeat: (e, o, t) => {
    const steps: [number, number, number[], number][] = [
      [0, 76, [57, 60, 64], 45], [0.45, 74, [57, 62, 65], 38], [0.9, 72, [57, 60, 65], 41],
      [1.35, 71, [56, 59, 64], 40], [1.8, 69, [57, 60, 64], 33],
    ];
    steps.forEach(([dt, n, ch, b], i) => {
      const d = i === 4 ? 1.6 : 0.42;
      flute(e, o, t + dt, n, d, 0.9);
      chord(PAD, e, o, t + dt, ch, d, 0.7);
      softBass(e, o, t + dt, b, d, 0.9);
    });
    timp(e, o, t + 1.8, 45, 0.3, 0.45);
    bell(e, o, t + 1.8, mtof(57), 2.5, 0.04, 0.6, SOFT);
  },
  levelUp: (e, o, t) => {
    for (const [dt, n, d] of [[0, 72, 0.06], [0.07, 76, 0.06], [0.14, 79, 0.06], [0.21, 84, 0.12], [0.36, 79, 0.06], [0.43, 84, 0.7]]) {
      LEAD(e, o, t + dt, n, d, 0.8);
      bell(e, o, t + dt, mtof(n + 12), 0.6, 0.03, 0.4, SOFT);
    }
    chord(PAD, e, o, t + 0.43, [60, 64, 67, 72], 0.7, 0.6);
    softBass(e, o, t + 0.43, 48, 0.7, 0.8);
    sparkles(e, o, t + 0.43, 0.6, 8);
  },
  gold: (e, o, t, p) => {
    bell(e, o, t, 2100 * p, 0.35, 0.08, 0.3, COIN, -0.2);
    bell(e, o, t + 0.075, 2760 * p, 0.5, 0.07, 0.35, COIN, 0.2);
    nz(e, o, t, 0.001, 0.01, 0.08, 'highpass', 6000, 0.7, 0.1);
    nz(e, o, t + 0.075, 0.001, 0.01, 0.07, 'highpass', 6000, 0.7, 0.1);
  },
  purchase: (e, o, t, p) => {
    nz(e, o, t, 0.001, 0.035, 0.25, 'bandpass', 1300, 2, 0.05);
    tone(e, o, t, 'triangle', 170, 0.001, 0.04, 0.12, 0.02, 110, 0.03);
    nz(e, o, t + 0.05, 0.01, 0.12, 0.08, 'bandpass', 650, 3, 0.1);
    bell(e, o, t + 0.09, mtof(93), 1.3, 0.13, 0.4, [1, 2, 3, 4.2]);
    bell(e, o, t + 0.09, mtof(100), 0.9, 0.05, 0.4, SOFT);
    SFX.gold(e, o, t + 0.22, p);
  },
  chest: (e, o, t) => {
    // creak: a slow stick-slip pulse train through wood-like resonances
    const v = new V(e, o, 0.25), g = v.gain(0);
    asr(g.gain, t, 0.05, 0.14, 0.4, 0.08);
    const os = v.osc('sawtooth', 55, t, t + 0.55, v.filter('bandpass', 900, 6, g));
    os.connect(v.filter('bandpass', 2200, 8, v.gain(0.5, g)));
    let x = 55;
    for (let k = 1; k <= 10; k++) { x = Math.min(120, Math.max(35, x + rnd(-18, 22))); os.frequency.linearRampToValueAtTime(x, t + k * 0.045); }
    v.done();
    tone(e, o, t + 0.5, 'sine', 110, 0.002, 0.22, 0.4, 0.2, 55, 0.2);
    nz(e, o, t + 0.5, 0.001, 0.1, 0.15, 'lowpass', 600, 0.7, 0.2);
    [84, 88, 91, 96, 100].forEach((n, i) => bell(e, o, t + 0.55 + i * 0.05, mtof(n), 0.9, 0.06, 0.5, BELL, i / 2 - 1));
    for (const n of [60, 64, 67]) tone(e, o, t + 0.55, 'sine', mtof(n), 0.2, 0.9, 0.03, 0.5);
    nz(e, o, t + 0.55, 0.2, 0.8, 0.05, 'highpass', 7000, 0.7, 0.6);
  },
  map: (e, o, t) => {
    nz(e, o, t, 0.04, 0.18, 0.08, 'bandpass', 1200, 0.8, 0.1, [[0.15, 3500]]);
    bell(e, o, t + 0.05, mtof(81), 1.0, 0.05, 0.5, SOFT);
    bell(e, o, t + 0.13, mtof(88), 1.1, 0.04, 0.5, SOFT);
  },
  enemyTurn: (e, o, t) => {
    const v = new V(e, o, 0.35), g = v.gain(0), gg = g.gain;
    gg.setValueAtTime(0, t); gg.linearRampToValueAtTime(0.06, t + 0.08); gg.setTargetAtTime(0, t + 0.5, 0.25);
    const lp = v.filter('lowpass', 150, 2.5, g);
    lp.frequency.setValueAtTime(150, t); lp.frequency.exponentialRampToValueAtTime(1300, t + 0.2); lp.frequency.exponentialRampToValueAtTime(250, t + 1.2);
    for (const n of [38, 45, 51]) for (const d of [-9, 9]) v.osc('sawtooth', mtof(n), t, t + 1.9, lp, d);
    v.done();
    timp(e, o, t, 38, 0.5, 1);
    tone(e, o, t + 0.05, 'sine', mtof(75), 0.15, 0.9, 0.02, 0.7);
  },
  playerTurn: (e, o, t) => {
    [81, 85, 88].forEach((n, i) => HARP(e, o, t + i * 0.05, n, 0.4, 0.6));
    bell(e, o, t + 0.15, mtof(93), 0.9, 0.05, 0.5);
    chord(STAB, e, o, t, [57, 61, 64, 69], 0.3, 0.55);
    nz(e, o, t, 0.1, 0.2, 0.05, 'bandpass', 1500, 2, 0.3, [[0.2, 6000]]);
  },
};
export const SFX_NAMES = Object.keys(SFX) as Sfx[];

/** musical sfx stay in tune; the rest get slight random pitch */
const TONAL = new Set<Sfx>(['select', 'holy', 'heal', 'buff', 'debuff', 'revive', 'chime', 'surge', 'victory', 'defeat',
  'levelUp', 'purchase', 'chest', 'map', 'enemyTurn', 'playerTurn', 'error']);

/** loudness trims, balanced against music RMS from the offline selftest */
const TRIM: Partial<Record<Sfx, number>> = {
  hover: 1.5, click: 1.4, select: 1.6, cardDraw: 1.6, shuffle: 1.3, slash: 2, hit: 1.4, block: 1.4,
  ice: 1.5, buff: 1.5, debuff: 1.8, victory: 0.65, defeat: 0.6, gold: 1.3, map: 1.6,
};

export type SfxOut = { dry: GainNode; wet: GainNode; end: number };
/** Plays an sfx into its own wrapper (for voice stealing); wrapper self-disconnects when done. */
export function playSfx(e: Engine, name: Sfx, t: number): SfxOut {
  const c = e.c, gv = rnd(0.9, 1.05) * (TRIM[name] ?? 1);
  const w: SfxOut = { dry: c.createGain(), wet: c.createGain(), end: t };
  w.dry.gain.value = w.wet.gain.value = gv;
  w.dry.connect(e.sfx.dry); w.wet.connect(e.sfx.wet);
  SFX[name](e, w, t, TONAL.has(name) ? 1 : rnd(0.96, 1.04));
  const timer = c.createConstantSource();
  timer.offset.value = 0; timer.connect(w.dry); timer.start(t); timer.stop(w.end + 0.1);
  timer.onended = () => { timer.disconnect(); w.dry.disconnect(); w.wet.disconnect(); };
  return w;
}

// ---------------------------------------------------------------- sequencer

type Ev = { s: number; n: number; d: number; v: number };
type Pat = { len: number; ev: Ev[] };
type Part = { inst: Inst; vel: number; len: number; at: Ev[][] };
export type Song = { bpm: number; len: number; parts: Part[] };

/** "A4/8 D5/4 r/4 C4+E4/2" -> events; durations in 16th steps */
function mel(src: string): Pat {
  const ev: Ev[] = [];
  let s = 0;
  for (const tok of src.trim().split(/\s+/)) {
    const [nt, du] = tok.split('/'), d = Number(du ?? 1);
    if (!(d > 0)) throw new Error(`[audio] bad duration "${tok}"`);
    if (nt !== 'r') for (const x of nt.split('+')) ev.push({ s, n: midi(x), d, v: 1 });
    s += d;
  }
  return { len: s, ev };
}

const QUAL: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], sus4: [0, 5, 7], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6] };
function chordPcs(ch: string): number[] {
  const m = /^([A-G][#b]?)(.*)$/.exec(ch), q = m && QUAL[m[2]];
  if (!m || !q) throw new Error(`[audio] bad chord "${ch}"`);
  const r = midi(m[1] + '4') % 12;
  return q.map(i => (r + i) % 12);
}
/** k chord tones ascending from `low` */
function voicing(ch: string, low: number, k: number): number[] {
  const pcs = chordPcs(ch), out: number[] = [];
  for (let x = low; out.length < k; x++) if (pcs.includes(x % 12)) out.push(x);
  return out;
}
const rootAbove = (ch: string, low: number) => { const r = chordPcs(ch)[0]; return low + ((r - (low % 12) + 12) % 12); };

// chord helpers: chs = one chord per bar, '-' = tacet bar
function pads(chs: string[], bar: number, low: number, k: number): Pat {
  const ev: Ev[] = [];
  for (let i = 0; i < chs.length;) {
    let j = i;
    while (j < chs.length && chs[j] === chs[i]) j++;
    if (chs[i] !== '-') for (const n of voicing(chs[i], low, k)) ev.push({ s: i * bar, n, d: (j - i) * bar, v: 1 });
    i = j;
  }
  return { len: chs.length * bar, ev };
}
function arps(chs: string[], bar: number, low: number, k: number, pat: number[], every: number): Pat {
  const ev: Ev[] = [];
  chs.forEach((ch, i) => {
    if (ch === '-') return;
    const vs = voicing(ch, low, k);
    for (let s = 0, j = 0; s < bar; s += every, j++) ev.push({ s: i * bar + s, n: vs[pat[j % pat.length]], d: every, v: s % 4 ? 0.8 : 1 });
  });
  return { len: chs.length * bar, ev };
}
/** per-step rhythm on chord roots: x/X root, o octave, 5 fifth, '-' holds, '.' rest */
function riff(chs: string[], bar: number, pat: string, low: number): Pat {
  const ev: Ev[] = [];
  chs.forEach((ch, i) => {
    if (ch === '-') return;
    const r = rootAbove(ch, low);
    for (let s = 0; s < pat.length; s++) {
      const c = pat[s];
      if (c === '.' || c === '-') continue;
      let d = 1;
      while (pat[s + d] === '-') d++;
      ev.push({ s: i * bar + s, n: c === 'o' ? r + 12 : c === '5' ? r + 7 : r, d, v: c === 'X' ? 1 : 0.8 });
    }
  });
  return { len: chs.length * bar, ev };
}
function stabs(chs: string[], bar: number, pat: string, low: number, k: number, d: number): Pat {
  const ev: Ev[] = [];
  chs.forEach((ch, i) => {
    if (ch === '-') return;
    for (let s = 0; s < pat.length; s++) if (pat[s] !== '.') for (const n of voicing(ch, low, k)) ev.push({ s: i * bar + s, n, d, v: pat[s] === 'X' ? 1 : 0.8 });
  });
  return { len: chs.length * bar, ev };
}
/** X accent, x normal, o ghost */
function drums(pat: string): Pat {
  const ev: Ev[] = [];
  [...pat].forEach((c, s) => { if (c !== '.') ev.push({ s, n: 0, d: 1, v: c === 'X' ? 1 : c === 'x' ? 0.75 : 0.45 }); });
  return { len: pat.length, ev };
}
const tp = (p: Pat, semis: number): Pat => ({ len: p.len, ev: p.ev.map(e => ({ ...e, n: e.n + semis })) });

function song(bpm: number, parts: [Inst, number, Pat][]): Song {
  return {
    bpm,
    len: Math.max(...parts.map(p => p[2].len)),
    parts: parts.map(([inst, vel, p]) => {
      const at: Ev[][] = Array.from({ length: p.len }, () => []);
      for (const e of p.ev) at[e.s].push(e);
      return { inst, vel, len: p.len, at };
    }),
  };
}

function battle(tr: number, heavy: boolean): Song {
  const ch = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'F', 'G', 'C', 'Am', 'F', 'G', 'E', 'E'];
  const B = ch.map((c, i) => (i < 8 ? '-' : c));
  const parts: [Inst, number, Pat][] = [
    [LEAD, 0.9, mel(`
      A4/6 E5/6 A5/4   G5/2 A5/2 G5/2 E5/2 D5/4 E5/4   F5/6 C5/6 F5/4   G5/2 F5/2 E5/2 D5/2 B4/8
      A4/6 E5/6 A5/4   C6/4 B5/2 A5/2 B5/8   C6/6 A5/6 F5/4   E5/4 G#5/4 B5/4 D6/4
      A5/4 C6/8 D6/4   D6/6 E6/2 D6/4 B5/4   E6/12 D6/2 C6/2   C6/8 B5/4 A5/4
      A5/4 C6/8 F6/4   D6/6 E6/2 D6/4 B5/4   E6/8 B5/4 G#5/4   B5/8 r/8`)],
    [bass, 0.9, riff(ch, 16, 'x-xxo-xxx-xxo-xx', 36)],
    [STAB, 0.75, stabs(ch, 16, 'X.....x.....x...', 57, 3, 2)],
    [PAD, 0.45, pads(B, 16, 52, 4)],
  ];
  if (!heavy) parts.push(
    [timp, 0.7, riff(B, 16, 'X.......x.......', 38)],
    [kick, 0.9, drums('X.....x...x.....')],
    [snare, 0.8, drums('....X.......X...')],
    [HAT, 0.6, drums('x.X.x.X.x.X.x.X.')],
    [crash, 0.7, drums('X' + '.'.repeat(127))],
  );
  else parts.push(
    [timp, 0.6, riff(ch, 16, 'X.x.x.x.X.x.x.x.', 38)],
    [OSTI, 0.4, arps(ch, 16, 45, 3, [0, 1, 2, 1], 1)],
    [kick, 1, drums('X.x...x.X.x...x.')],
    [snare, 0.85, drums('....X.......X..x')],
    [HAT, 0.55, drums('xoxoXoxoxoxoXoxo')],
    [crash, 0.8, drums('X' + '.'.repeat(63))],
  );
  return song(heavy ? 160 : 150, parts.map(([i, v, p]) => [i, v, tp(p, tr)]));
}

const TRACKS: Record<Exclude<Track, 'none'>, () => Song> = {
  // D minor, wistful: harp arpeggios, soft strings, slow flute
  title: () => {
    const ch = ['Dm', 'Dm', 'Bb', 'Bb', 'F', 'F', 'C', 'C', 'Dm', 'Dm', 'Gm', 'Gm', 'Bb', 'Bb', 'Asus4', 'A'];
    return song(72, [
      [HARP, 0.55, arps(ch, 16, 45, 6, [0, 1, 2, 3, 4, 5, 4, 3], 2)],
      [PAD_SOFT, 0.7, pads(ch, 16, 57, 4)],
      [softBass, 0.6, riff(ch, 16, 'x' + '-'.repeat(15), 38)],
      [flute, 0.85, mel(`
        A4/8 D5/4 E5/4   F5/12 A5/4   G5/8 F5/4 D5/4   F5/16
        C5/8 F5/4 G5/4   A5/12 C6/4   Bb5/8 A5/4 G5/4  E5/16
        F5/8 E5/4 D5/4   A5/12 G5/2 F5/2   G5/8 Bb5/4 A5/4   D5/16
        F5/8 D5/4 C5/4   D5/12 E5/4   E5/8 D5/4 E5/4   C#5/12 r/4`)],
    ]);
  },
  // F major / D dorian overworld: flute over pizzicato and strings
  map: () => {
    const ch = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C', 'Dm', 'Am', 'Bb', 'F', 'Gm', 'Dm', 'Bb', 'C'];
    return song(96, [
      [flute, 0.8, mel(`
        C5/3 F5/3 A5/2 G5/4 F5/4   E5/3 G5/3 C6/10   D5/3 F5/3 A5/2 G5/4 F5/4   D5/8 C5/4 Bb4/4
        C5/3 F5/3 A5/2 C6/4 D6/4   E6/6 D6/2 C6/8   D6/3 C6/3 Bb5/2 A5/4 G5/4   G5/12 r/4
        A5/6 C6/2 A5/4 G5/4   E5/8 C5/4 E5/4   F5/6 G5/2 F5/4 D5/4   C5/12 A4/4
        Bb4/4 D5/4 G5/4 Bb5/4   A5/12 F5/4   G5/4 F5/4 D5/4 F5/4   E5/8 G5/8`)],
      [PAD_SOFT, 0.5, pads(ch, 16, 55, 3)],
      [PIZZ, 0.5, arps(ch, 16, 48, 4, [0, 1, 2, 3, 1, 2, 3, 2], 2)],
      [softBass, 0.65, riff(ch, 16, 'x-----x-x-------', 36)],
      [kick, 0.35, drums('x.......x.......')],
      [SHAKER, 0.3, drums('o.x.o.x.o.x.o.x.')],
    ]);
  },
  battle: () => battle(0, false),
  elite: () => battle(-5, true),
  // D phrygian / harmonic minor: organ + choir, 16th string ostinato, timpani
  boss: () => {
    const ch = ['Dm', 'Eb', 'Dm', 'Eb', 'Bb', 'Gm', 'Eb', 'A', 'Gm', 'Dm', 'Eb', 'Bb', 'Gm', 'Eb', 'A', 'A'];
    return song(140, [
      [organ, 0.7, pads(ch, 16, 50, 4)],
      [choir, 0.7, pads(ch, 16, 62, 3)],
      [OSTI, 0.5, arps(ch, 16, 50, 4, [0, 3, 2, 3, 1, 3, 2, 3], 1)],
      [LEAD, 0.85, mel(`
        D5/12 A4/4   Eb5/6 G5/6 Bb5/4   A5/12 F5/4   G5/6 F5/6 Eb5/4
        D5/6 F5/6 Bb5/4   Bb5/4 A5/4 G5/8   G5/8 Bb5/4 Eb6/4   C#6/8 A5/4 E5/4
        D6/12 C6/2 Bb5/2   A5/8 F5/4 D5/4   Eb5/6 G5/6 Bb5/4   D6/12 C6/4
        Bb5/6 A5/6 G5/4   G5/6 Bb5/6 Eb6/4   E6/8 C#6/4 A5/4   A5/4 G5/2 F5/2 E5/4 C#5/4`)],
      [bass, 0.75, riff(ch, 16, 'x-x-x-x-x-x-x-x-', 38)],
      [timp, 0.85, riff(ch, 16, 'X.....x...x.x...', 38)],
      [kick, 0.85, drums('X.....x.x.......')],
      [snare, 0.7, drums('....X.......X...')],
      [HAT, 0.35, drums('x.x.x.x.x.x.x.x.')],
      [crash, 0.7, drums('X' + '.'.repeat(127))],
    ]);
  },
  // C major 3/4 music-box lullaby
  inn: () => {
    const ch = ['C', 'Em', 'F', 'C', 'Dm', 'G', 'C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G', 'C', 'C'];
    return song(80, [
      [mbox, 1.2, mel(`
        E5/4 G5/4 C6/4   B5/8 G5/4   A5/6 G5/2 F5/4   E5/12
        F5/4 A5/4 D6/4   D6/6 C6/2 B5/4   C6/4 G5/4 E5/4   D5/12
        C6/4 B5/4 A5/4   G5/8 E5/4   F5/4 A5/4 C6/4   E6/8 D6/4
        C6/4 A5/4 F5/4   G5/4 B5/4 D6/4   G5/6 E5/2 D5/4   C5/12`)],
      [mbox, 0.6, riff(ch, 12, 'x...........', 48)],
      [mbox, 0.4, stabs(ch, 12, '....x...x...', 60, 3, 1)],
      [PAD_SOFT, 0.45, pads(ch, 12, 55, 3)],
      [softBass, 0.45, riff(ch, 12, 'x' + '-'.repeat(11), 36)],
    ]);
  },
};
export const TRACK_NAMES = Object.keys(TRACKS) as Exclude<Track, 'none'>[];

const songCache = new Map<Track, Song>();
export function getSong(t: Exclude<Track, 'none'>): Song {
  let s = songCache.get(t);
  if (!s) songCache.set(t, (s = TRACKS[t]()));
  return s;
}

/** Plays a Song from `start`, looping forever; call pump() regularly to schedule ahead. */
export class Player {
  private step = 0;
  private stopAt = Infinity;
  readonly out: { dry: GainNode; wet: GainNode };

  constructor(private e: Engine, private s: Song, private next: number, fadeIn: number) {
    const mk = (dst: AudioNode) => {
      const g = e.c.createGain();
      g.gain.setValueAtTime(0, next); g.gain.linearRampToValueAtTime(1, next + fadeIn);
      g.connect(dst);
      return g;
    };
    this.out = { dry: mk(e.music.dry), wet: mk(e.music.wet) };
  }
  pump(until: number) {
    const sd = 15 / this.s.bpm, now = this.e.c.currentTime;
    if (now > this.next + 0.05) { // fell behind (tab frozen): skip rather than burst
      const k = Math.ceil((now - this.next) / sd);
      this.step += k; this.next += k * sd;
    }
    while (this.next < until && this.next < this.stopAt) {
      for (const p of this.s.parts)
        for (const ev of p.at[this.step % p.len]) p.inst(this.e, this.out, this.next + rnd(0, 0.004), ev.n, ev.d * sd, ev.v * p.vel * rnd(0.9, 1.05));
      this.step++; this.next += sd;
    }
  }
  fadeOut(dur: number): number {
    const t = this.e.c.currentTime;
    for (const g of [this.out.dry.gain, this.out.wet.gain]) {
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + dur);
    }
    return (this.stopAt = t + dur);
  }
  dispose() { this.out.dry.disconnect(); this.out.wet.disconnect(); }
}

// ---------------------------------------------------------------- public API

const KEY = 'shardfall.volumes';
const vol: Vol = { master: 0.8, music: 0.55, sfx: 0.8 };
try {
  const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (s) for (const k of ['master', 'music', 'sfx'] as const) if (typeof s[k] === 'number' && isFinite(s[k])) vol[k] = clamp01(s[k]);
} catch { /* no storage: defaults */ }

let eng: Engine | null = null;
let want: Track = 'none', cur: Track = 'none';
let player: Player | null = null;
const fading: { p: Player; until: number }[] = [];
let active: { name: Sfx; w: SfxOut }[] = [];
const lastPlayed = new Map<Sfx, number>();
const MAX_SFX = 14, MAX_SAME = 3;

function tick() {
  if (!eng) return;
  const now = eng.c.currentTime, until = now + (typeof document !== 'undefined' && document.hidden ? 1.5 : 0.12);
  try {
    player?.pump(until);
    for (let i = fading.length - 1; i >= 0; i--) {
      const f = fading[i];
      f.p.pump(until);
      if (now > f.until + 4) { f.p.dispose(); fading.splice(i, 1); }
    }
  } catch (err) { console.warn('[audio] scheduler', err); }
}

function syncMusic() {
  if (!eng || want === cur) return;
  if (player) fading.push({ p: player, until: player.fadeOut(1) });
  player = null;
  cur = want;
  if (cur !== 'none') {
    try { player = new Player(eng, getSong(cur), eng.c.currentTime + 0.06, 1); } catch (err) { console.warn('[audio] music', err); }
  }
  tick();
}

function steal(a: { w: SfxOut }) {
  const t = eng!.c.currentTime;
  for (const g of [a.w.dry.gain, a.w.wet.gain]) { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.015); }
  active = active.filter(x => x !== a);
}

export const audio: Audio = {
  unlock() {
    try {
      if (!eng) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        eng = new Engine(new AC({ latencyHint: 'interactive' }), vol);
        setInterval(tick, 25);
      }
      if (eng.c.state === 'suspended') (eng.c as AudioContext).resume().catch(() => {});
      syncMusic();
    } catch (err) { console.warn('[audio] unlock failed', err); }
  },
  sfx(name) {
    if (!eng || !(name in SFX)) return;
    try {
      const now = eng.c.currentTime;
      if (now - (lastPlayed.get(name) ?? -1) < 0.03) return; // same-frame spam
      lastPlayed.set(name, now);
      active = active.filter(a => a.w.end > now);
      const same = active.filter(a => a.name === name);
      if (same.length >= MAX_SAME) steal(same[0]);
      if (active.length >= MAX_SFX) steal(active[0]);
      active.push({ name, w: playSfx(eng, name, now + 0.005) });
    } catch (err) { console.warn('[audio] sfx', name, err); }
  },
  music(track) {
    want = track;
    syncMusic();
  },
  setVolumes(v) {
    for (const k of ['master', 'music', 'sfx'] as const) {
      const x = v[k];
      if (typeof x === 'number' && isFinite(x)) vol[k] = clamp01(x);
    }
    try { localStorage.setItem(KEY, JSON.stringify(vol)); } catch { /* ignore */ }
    eng?.setVolumes(vol);
  },
};
