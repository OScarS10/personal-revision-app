import type {
  Answer,
  Chapter,
  GeneratedQuestion,
  PersistedState,
  SkillInsight,
  TemplateStat,
} from "@/lib/types";
import { clamp } from "@/lib/math-utils";
import {
  applyDifficultyPreference,
  DEFAULT_DIFFICULTY,
  type DifficultyPreference,
} from "@/lib/difficulty";
import { generateQuestion, generatorsFor } from "@/lib/generators/registry";
import { confidenceOf, getSkillState } from "@/lib/model";

/*
  Session planning.

  Two jobs:
   1. Choose WHICH chapters to ask about, given the learner's weak spots.
   2. Choose the next question's difficulty, given how they just did.

  The first is a weighted draw so a session is not monotonous; the second is
  tracked question by question so difficulty adapts within a session, not just
  between sessions.
*/

export type SessionMode = "practice" | "test" | "review" | "infinite";

export interface SessionPlan {
  /** Chapter ids in the order they will be drawn from. */
  queue: string[];
  mode: SessionMode;
  /** Total questions, or null for an open-ended practice session. */
  length: number | null;
  /** Seconds per question, or null when untimed. */
  perQuestionSeconds: number | null;
}

export interface PlanOptions {
  chapters: Chapter[];
  enabledIds: string[];
  insights: SkillInsight[];
  state: PersistedState;
  mode: SessionMode;
  length?: number;
  rng: () => number;
  now?: number;
}

/** Questions per session by mode, chosen to match exam mental stamina. */
export const SESSION_LENGTHS: Record<SessionMode, number[]> = {
  practice: [5, 10, 15, 20, 30],
  test: [10, 20, 25, 30],
  review: [10, 20, 30, 40],
  infinite: [10, 20, 30, 50, 100],
};

/** Seconds per question, roughly the real exam rate for a 1-mark item. */
export const TEST_RATES: Array<{ label: string; seconds: number }> = [
  { label: "1 min / question", seconds: 60 },
  { label: "1.5 min / question", seconds: 90 },
  { label: "2 min / question", seconds: 120 },
];

/**
 * Weight a chapter for selection.
 *
 * Deliberately blends four signals rather than optimising one:
 *   weakness       - the analytics engine's priority score
 *   confidence     - untested or barely-tested chapters need probing
 *   staleness      - not seen for a while, so likely to have decayed
 *   weight         - exam weighting, so a heavy topic is not starved
 *
 * A chapter that is already strong and fresh gets a small but non-zero weight,
 * so it can still appear; without that floor the queue would converge onto a
 * single topic and never re-check anything.
 */
export function chapterWeight(
  chapter: Chapter,
  insight: SkillInsight | undefined,
  state: PersistedState,
  now: number,
): number {
  const skill = state.skills[chapter.id];
  const confidence = skill ? confidenceOf(skill) : 0;

  // 0..1, higher is more urgent.
  const weakness = insight?.weakness ?? 0.45;

  // Untested chapters must be reachable, otherwise a cold start never starts.
  const probe = 1 - confidence;

  // Days since this chapter was last practised, saturating at a month.
  const daysSince = skill?.lastSeen ? (now - skill.lastSeen) / 86_400_000 : 14;
  const staleness = clamp(daysSince / 30, 0, 1);

  // Exam weighting, normalised so it modulates rather than dominates.
  const examWeight = 0.6 + 0.8 * clamp(chapter.weight, 0, 1);

  const urgency = 0.5 * weakness + 0.28 * probe + 0.22 * staleness;

  // Floor of 0.12 keeps already-strong chapters in the rotation.
  return Math.max(0.12, urgency) * examWeight;
}

/** Build the chapter queue for a session. */
export function planSession(options: PlanOptions): SessionPlan {
  const { chapters, enabledIds, insights, state, mode, rng, now = Date.now() } = options;

  const enabledSet = new Set(enabledIds);
  // Chapters that cannot produce a question must not be queued. When every
  // chapter had a recall fallback this filter was unnecessary; now a chapter
  // with neither a bespoke generator nor authored knowledge correctly produces
  // nothing, and queueing it would stall the session partway through.
  const pool = chapters.filter(
    (c) => enabledSet.has(c.id) && generatorsFor(c).length > 0,
  );
  const byId = new Map(insights.map((i) => [i.chapterId, i]));

  const length =
    options.length ??
    (mode === "infinite"
      ? null
      : mode === "test"
      ? 20
      : mode === "review"
      ? 15
      : 10);

  if (pool.length === 0) {
    return { queue: [], mode, length, perQuestionSeconds: null };
  }

  // For infinite mode, build a much larger queue that cycles through chapters
  // For finite modes, use the traditional logic
  const target = mode === "infinite"
    ? pool.length * 20  // Large queue for cycling
    : Math.min(length ?? 10, pool.length * 3);

  const queue: string[] = [];

  if (mode === "infinite") {
    // Infinite mode: build a large cycling queue with weighted selection with replacement
    // This creates a queue that cycles through all chapters proportionally to their weights
    const weights = pool.map((chapter) => ({
      chapter,
      weight: chapterWeight(chapter, byId.get(chapter.id), state, now),
    }));
    const totalWeight = weights.reduce((s, w) => s + w.weight, 0);

    while (queue.length < target) {
      let roll = rng() * totalWeight;
      let index = 0;
      while (index < weights.length - 1 && roll > weights[index].weight) {
        roll -= weights[index].weight;
        index++;
      }
      queue.push(weights[index].chapter.id);
    }
  } else {
    // Finite modes: weighted draw without replacement
    const remaining = pool.map((chapter) => ({
      chapter,
      weight: chapterWeight(chapter, byId.get(chapter.id), state, now),
    }));

    while (queue.length < target && remaining.length > 0) {
      const total = remaining.reduce((s, r) => s + r.weight, 0);
      if (total <= 0) break;
      let roll = rng() * total;
      let index = 0;
      while (index < remaining.length - 1 && roll > remaining[index].weight) {
        roll -= remaining[index].weight;
        index++;
      }
      queue.push(remaining[index].chapter.id);
      remaining.splice(index, 1);

      // Every enabled chapter has now had a turn. Keep going with a second pass
      // so longer sessions broaden rather than repeat the first pick.
      if (remaining.length === 0) {
        for (const entry of pool) {
          queue.push(entry.id);
          if (queue.length >= target) break;
        }
        break;
      }
    }
  }

  return {
    queue,
    mode,
    length,
    perQuestionSeconds: mode === "test" ? 90 : mode === "infinite" ? null : null,
  };
}

/**
 * Narrow a frozen session queue to the chapters that are still enabled.
 *
 * A session's queue is planned once and deliberately not rebuilt while it runs,
 * so the learner does not watch the chapter order shuffle under them. The cost
 * of that stability is that the queue cannot notice the selection narrowing
 * underneath it: a queue planned while sixteen chapters were enabled kept
 * serving 1.4.1 long after the learner had cut the selection to a single
 * chapter, because nothing re-derived the plan.
 *
 * Filtering at build time fixes that without giving up the stable order, since
 * this drops entries rather than reordering them. Widening the selection
 * mid-session still needs no effect here: the new chapters are not in the
 * planned queue and so arrive with the next session, which is the same promise
 * the frozen plan already makes.
 *
 * An empty result is returned rather than the original queue, so nothing can be
 * served from a chapter the learner has switched off.
 */
export function restrictQueue(queue: readonly string[], enabledIds: readonly string[]): string[] {
  const enabled = new Set(enabledIds);
  return queue.filter((id) => enabled.has(id));
}

// ------------------------------------------------------------- adaptive thread

/**
 * Decide the difficulty of the next question.
 *
 * Starts a little above current ability, then reacts to the last few answers:
 * two or more correct in a row stretches; a wrong answer backs off. The
 * response is deliberately small and asymmetric - it is easier to lose
 * confidence on a hard question than to build it, so recovery climbs slowly.
 */
export function nextDifficulty(
  ability: number,
  recent: Answer[],
  stretch: number,
  rng: () => number = Math.random,
  preference: DifficultyPreference = DEFAULT_DIFFICULTY,
): number {
  const base = clamp(ability + stretch, -3, 3.5);
  if (recent.length === 0) return applyDifficultyPreference(base, preference);

  // Weight the last three attempts, most recent heaviest.
  const window = recent.slice(-3);
  const weights = [1, 2, 3];
  let weighted = 0;
  let totalWeight = 0;
  window.forEach((answer, i) => {
    const w = weights[i] ?? 1;
    weighted += (answer.correct ? 1 : 0) * w;
    totalWeight += w;
  });
  const rate = weighted / totalWeight;

  // -0.5 (all wrong) .. +0.5 (all right)
  const adjustment = (rate - 0.5) * 0.9;
  // Small amount of noise so two identical runs do not look identical.
  const noise = (rng() - 0.5) * 0.16;

  /*
    The learner's chosen difficulty is applied last, to the whole adaptive
    result, so the two compose rather than fight. The model still decides where
    to sit relative to current ability and the preference shifts that target up
    or down.

    Applying it to the finished target rather than to `base` alone is
    deliberate. A learner on a run of wrong answers who selects "gentle" is
    asking to back off; shifting only the base would leave the adaptive
    correction pulling them straight back up to the same hard question.
  */
  return clamp(applyDifficultyPreference(base + adjustment + noise, preference), -3, 3.5);
}

/**
 * Produce the next question for a chapter, retrying if a generator produces
 * something unusable. Guards against a chapter whose only templates are
 * exhausted or malformed.
 */
export function nextQuestion(
  chapter: Chapter,
  targetDifficulty: number,
  seed: string,
  recentKeys: string[],
  /**
   * Observed per-template outcomes, used to replace hand-set difficulties with
   * calibrated ones. Optional so callers without statistics behave exactly as
   * before.
   */
  templateStats?: Record<string, TemplateStat>,
): GeneratedQuestion | null {
  for (let attempt = 0; attempt < 4; attempt++) {
    const question = generateQuestion({
      chapter,
      targetDifficulty,
      seed: `${seed}::${attempt}`,
      avoidKeys: recentKeys,
      // A template served repeatedly is nudged toward the difficulty it actually
      // proved to be. Without this the hand-set base is the only difficulty that
      // has ever existed, and the grade estimate inherits its errors.
      templateStats,
    });
    if (question) return question;
  }
  return null;
}

/** Ability estimate for a chapter, falling back to a neutral zero. */
export function abilityOf(state: PersistedState, chapterId: string): number {
  return getSkillState(state.skills, chapterId).theta;
}
