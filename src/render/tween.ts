// Tiny tween/timeline utility. Durations are in seconds; each Tweens instance is driven by its own clock
// (the stage runs one on scaled "game" time for FX and one on real time for camera/theme).

export type Ease = (t: number) => number;

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

interface Job { t: number; d: number; fn: (k: number, raw: number) => void; e: Ease; done: () => void }

export class Tweens {
  private jobs: Job[] = [];

  /** Calls fn(easedK, rawK) every frame for d seconds (fn(1,1) guaranteed at the end). */
  to(d: number, fn: (k: number, raw: number) => void, e: Ease = ease.linear): Promise<void> {
    return new Promise((done) => {
      if (d <= 0) { fn(1, 1); done(); return; }
      fn(e(0), 0);
      this.jobs.push({ t: 0, d, fn, e, done });
    });
  }

  wait(d: number): Promise<void> {
    return this.to(d, () => {});
  }

  update(dt: number) {
    if (!this.jobs.length) return;
    const jobs = this.jobs;
    this.jobs = [];
    for (const j of jobs) {
      j.t += dt;
      const raw = Math.min(1, j.t / j.d);
      j.fn(j.e(raw), raw);
      if (raw >= 1) j.done();
      else this.jobs.push(j);
    }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
