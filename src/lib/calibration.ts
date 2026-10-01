import type { TemplateStat } from "@/lib/types";

/*
  Difficulty calibration.

  Every template carries a hand-set `base` difficulty. Nobody has ever measured
  whether that number is right, and the grade estimate is computed from those
  numbers, so a template the app believes is mid-difficulty but which learners
  actually fail silently biases every estimate that touches it.

  The correction is deliberately conservative. Two reasons:

  - Confidence is low at small sample sizes. A single wrong answer on a hard
    template is not evidence that the template is easy, so the nudge is scaled
    by attempts and stays small until there is a real sample.
  - Feedback should be slow, not twitchy. A learner who improves at a template
    should see it stop getting harder, not watch the numbers swing after every
    session.

  Only the delta is applied, capped, and only in one direction per template per
  call, so the value cannot run away.
*/

export interface Calibration {
  /** The hand-set base difficulty, for comparison. */
  declared: number;
  /** The base difficulty after applying observed outcomes. */
  effective: number;
  /** How far the observation has moved it, on the logit scale. */
  adjustment: number;
  /** Attempts behind the adjustment; zero means declared value is in force. */
  attempts: number;
  /** Observed mean score on this template, 0..1. */
  observedAccuracy: number | null;
  /** True once there is enough data to say anything. */
  trusted: boolean;
}

/** Attempts needed before the correction is allowed to reach full strength. */
const TRUST_THRESHOLD = 20;

/** Never move a template by more than this, however wrong the declared value is. */
const MAX_ADJUSTMENT = 0.8;

export function templateCalibration(
  stat: TemplateStat | undefined,
  declared: number,
): Calibration {
  if (!stat || stat.attempts === 0) {
    return {
      declared,
      effective: declared,
      adjustment: 0,
      attempts: 0,
      observedAccuracy: null,
      trusted: false,
    };
  }

  const observedAccuracy = stat.scoreSum / stat.attempts;
  const observedDifficulty = stat.difficultySum / stat.attempts;

  /*
    What the model should have expected at the difficulty it actually served.

    A template served at -0.5 should be beaten about 38% of the time. If it is
    being beaten every time, it is easier than the model believes, so the gap
    pushes the declared difficulty *down*. The sign is therefore negated: higher
    than expected accuracy means the item is too hard as labelled.
  */
  const expectedAccuracy = logistic(observedDifficulty);
  const gap = expectedAccuracy - observedAccuracy;

  // Scale confidence by sample size, saturating at the trust threshold.
  const confidence = Math.min(1, stat.attempts / TRUST_THRESHOLD);
  const adjustment = clamp(gap * MAX_ADJUSTMENT * confidence, -MAX_ADJUSTMENT, MAX_ADJUSTMENT);

  return {
    declared,
    effective: clamp(declared + adjustment, -3, 3.5),
    adjustment,
    attempts: stat.attempts,
    observedAccuracy,
    trusted: stat.attempts >= TRUST_THRESHOLD,
  };
}

/**
 * Fold one new answer into a template's running statistics.
 *
 * Returns a new object rather than mutating, because the stats live in the
 * persisted state and React needs the identity change to re-render.
 */
export function recordTemplateStat(
  stats: Record<string, TemplateStat>,
  template: string,
  outcome: { score: number; difficulty: number; at: number },
): Record<string, TemplateStat> {
  const prev = stats[template] ?? {
    attempts: 0,
    correct: 0,
    scoreSum: 0,
    difficultySum: 0,
    lastSeen: 0,
  };
  return {
    ...stats,
    [template]: {
      attempts: prev.attempts + 1,
      correct: prev.correct + (outcome.score >= 0.999 ? 1 : 0),
      scoreSum: prev.scoreSum + clamp(outcome.score, 0, 1),
      difficultySum: prev.difficultySum + outcome.difficulty,
      lastSeen: outcome.at,
    },
  };
}

/** Templates where the declared difficulty looks least like the observed one. */
export function calibrationReport(
  stats: Record<string, TemplateStat>,
  declared: (template: string) => number | undefined,
): Array<Calibration & { template: string }> {
  return Object.entries(stats)
    .map(([template, stat]) => {
      const base = declared(template);
      if (base === undefined) return null;
      return { template, ...templateCalibration(stat, base) };
    })
    .filter((x): x is Calibration & { template: string } => x !== null)
    .sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment));
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
