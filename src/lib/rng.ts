/** Deterministic PRNG so a given seed always regenerates the same question. */

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: number | string) {
    this.state = typeof seed === "string" ? hashString(seed) || 1 : (seed >>> 0) || 1;
  }

  /** mulberry32 - small, fast, good enough for question generation. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  bool(pTrue = 0.5): boolean {
    return this.next() < pTrue;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick called with empty array");
    return items[this.int(0, items.length - 1)];
  }

  /** Pick `count` distinct items, preserving no particular order. */
  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
      out.push(pool.splice(this.int(0, pool.length - 1), 1)[0]);
    }
    return out;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, sd = 1): number {
    const u1 = Math.max(this.next(), 1e-9);
    const u2 = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** A value from an approximate normal, rounded and constrained to a range. */
  around(mean: number, sd: number, min: number, max: number): number {
    let v = mean + this.normal(0, sd);
    let guard = 0;
    while ((v < min || v > max) && guard++ < 24) {
      v = mean + this.normal(0, sd);
    }
    return Math.min(max, Math.max(min, v));
  }
}

export function makeSeed(...parts: Array<string | number>): string {
  return parts.join("::");
}
