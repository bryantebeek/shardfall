// Seeded PRNG (mulberry32). State is a plain number so it serializes with the run.
export class Rng {
  constructor(public s: number) {}
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number { return Math.floor(this.next() * n); }
  range(a: number, b: number): number { return a + this.int(b - a + 1); }
  pick<T>(a: readonly T[]): T { return a[this.int(a.length)]; }
  chance(p: number): boolean { return this.next() < p; }
  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  weighted<T extends string>(w: Partial<Record<T, number>>): T {
    const entries = Object.entries(w) as [T, number][];
    let r = this.next() * entries.reduce((s, [, v]) => s + v, 0);
    for (const [k, v] of entries) if ((r -= v) < 0) return k;
    return entries[entries.length - 1][0];
  }
}
