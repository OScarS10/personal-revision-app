/** Numeric, symbolic and formatting helpers shared by the question generators. */

/** Round to a fixed number of decimal places, avoiding -0 and float noise. */
export function round(value: number, dp = 2): number {
  const factor = 10 ** dp;
  const r = Math.round(value * factor + Number.EPSILON) / factor;
  return Object.is(r, -0) ? 0 : r;
}

/** Round to a given number of significant figures. */
export function sigFig(value: number, sf: number): number {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const dp = sf - 1 - magnitude;
  return round(value, Math.max(0, dp));
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function simplifyFraction(n: number, d: number): { n: number; d: number } {
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export function fractionToString(n: number, d: number): string {
  const { n: nn, d: dd } = simplifyFraction(n, d);
  if (dd === 1) return String(nn);
  if (dd < 0) return `${nn}/${dd}`;
  return `${nn}/${dd}`;
}

export function gcdArray(values: number[]): number {
  return values.reduce((acc, v) => gcd(acc, v), 0);
}

/** Linear least-squares fit, returned as y = m x + c plus goodness of fit. */
export function linearRegression(points: Array<{ x: number; y: number }>): {
  m: number;
  c: number;
  r2: number;
} {
  const n = points.length;
  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const syy = points.reduce((s, p) => s + p.y * p.y, 0);
  const denom = n * sxx - sx * sx;
  const m = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const c = (sy - m * sx) / n;
  const num = n * sxy - sx * sy;
  const r2 = denom === 0 || syy === 0 ? 1 : (num * num) / (denom * (n * syy - sy * sy));
  return { m, c, r2 };
}

/** Spearman rank correlation - robust for small samples. */
export function spearman(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const rx = rank(xs.slice(0, n));
  const ry = rank(ys.slice(0, n));
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[indexed[k].i] = avg;
    i = j + 1;
  }
  return out;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}

export function stdev(values: number[]): number {
  return Math.sqrt(variance(values));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function logit(p: number): number {
  const q = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(q / (1 - q));
}

/**
 * Cumulative distribution function of the standard normal distribution,
 * i.e. P(Z < z) for Z ~ N(0, 1).
 *
 * Uses the Abramowitz & Stegun 7.1.26 error-function approximation, which is
 * accurate to about 1.5e-7 — comfortably inside the 4 decimal places used by
 * Edexcel answers, and far better than a table lookup interpolated by hand.
 */
export function standardNormalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  // Coefficients for erf(x).
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** P(Z > z) for Z ~ N(0, 1). */
export function standardNormalUpperTail(z: number): number {
  return 1 - standardNormalCdf(z);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Normalise a learner's typed answer for lenient comparison. */
export function normaliseAnswer(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u00d7\u00b7\u2022]/g, "*")
    .replace(/\s*([+\-*/^=(),])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s*=\s*/g, "=")
    .replace(/[{}[\]]/g, "")
    .replace(/[−–—]/g, "-");
}

/** Does a typed answer match an accepted form? Tolerates extra zero padding. */
export function answerMatches(input: string, accepted: string, caseSensitive = false): boolean {
  const a = caseSensitive ? input.trim() : normaliseAnswer(input);
  const b = caseSensitive ? accepted.trim() : normaliseAnswer(accepted);
  if (a === b) return true;
  const strip = (s: string) => s.replace(/^0+(\d)/, "$1").replace(/^(-?)0+(\d)/, "$1$2");
  return strip(a) === strip(b);
}

/** Numeric parse that tolerates fractions, thousands separators and units. */
export function parseNumeric(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/,/g, "")
    .replace(/\s*(m|s|m s\^-?1|km|h|kg|N|J|%|degrees?)$/i, "");
  // Number("") is 0, so an empty box would otherwise parse as a confident
  // answer of zero and be marked correct against a zero-valued question.
  if (cleaned.length === 0) return null;
  const frac = cleaned.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const divisor = Number(frac[2]);
    return divisor === 0 ? null : Number(frac[1]) / divisor;
  }
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}

/** Render a number for display in a question stem. */
export function fmt(value: number, dp = 2): string {
  const r = round(value, dp);
  if (Number.isInteger(r)) return String(r);
  return String(r);
}

export function fmtSigned(value: number, dp = 2): string {
  const r = round(value, dp);
  return r > 0 ? `+${fmt(r, dp)}` : fmt(r, dp);
}

const MINUS = "\u2212";

export function fmtPoly(coeffs: number[]): string {
  const parts: string[] = [];
  let degree = coeffs.length - 1;
  while (degree > 0 && round(coeffs[degree], 6) === 0) degree--;
  for (let i = 0; i <= degree; i++) {
    const c = round(coeffs[i], 4);
    const mag = Math.abs(c);
    const term = i === 0 ? fmt(mag, 2) : `${fmt(mag, 2)}x${i > 1 ? `^${i}` : ""}`;
    if (mag === 0) continue;
    const sign = c < 0 ? MINUS : "+";
    parts.push(parts.length === 0 ? (c < 0 ? `${MINUS}${term}` : term) : ` ${sign} ${term}`);
  }
  return parts.length === 0 ? "0" : parts.join("");
}
