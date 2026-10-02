/*
  Learner-chosen difficulty.

  The adaptive model already picks a target difficulty from current ability, but
  "practice" and "exam condition" are different intentions. A learner who has
  just met a topic, or who wants to be pushed past their current level, cannot
  express that through ability alone - and until this existed there was no way to
  ask for a gentler start at all, because the model only ever aimed above where
  the learner already was.

  How it works, and why it is cheap:

  The preference is an offset applied to the target difficulty BEFORE the
  selector runs. It is not a second generator, a second question bank, or a
  post-hoc relabelling, so selecting and recording the question are unchanged and
  the ability model still sees a real difficulty rather than a renamed one.

  That matters for correctness. If the preference instead rewrote the stored
  difficulty of a question that was actually served at some other level, theta
  would be fitted against a value the learner never experienced, and the model
  would drift on exactly the questions the learner chose to be pushed on.

  The offsets are deliberately modest. The selector can only serve the range of
  difficulty a chapter's authors actually wrote (see MATCH_TOLERANCE in the
  registry), so an offset far beyond a chapter's own range would do nothing but
  add noise to the RNG.
*/

import { clamp } from "./math-utils";

export type DifficultyPreference = "gentle" | "standard" | "challenging";

export const DIFFICULTY_PREFERENCES: readonly DifficultyPreference[] = [
  "gentle",
  "standard",
  "challenging",
] as const;

export const DEFAULT_DIFFICULTY: DifficultyPreference = "standard";

/**
 * Offset added to the adaptive target, in logits.
 *
 * Roughly: one logit is a substantial step on the scale the ability model uses,
 * so these shift the target by about a tier either way rather than trying to
 * exceed the range of the content.
 */
const OFFSET: Record<DifficultyPreference, number> = {
  gentle: -0.85,
  standard: 0,
  challenging: 0.8,
};

export const DIFFICULTY_LABEL: Record<DifficultyPreference, string> = {
  gentle: "Gentle",
  standard: "Standard",
  challenging: "Challenging",
};

/** One-line explanation shown under the control in the UI. */
export const DIFFICULTY_HINT: Record<DifficultyPreference, string> = {
  gentle: "Easier questions, and more of the basics. Good for a topic you have just started.",
  standard: "Follows your ability and adapts as you answer. This is the usual setting.",
  challenging: "Harder questions than you would currently be served. Good for exam practice.",
};

export function isDifficultyPreference(value: unknown): value is DifficultyPreference {
  return value === "gentle" || value === "standard" || value === "challenging";
}

/** Normalise an unknown stored value, so a corrupt blob cannot break a session. */
export function sanitiseDifficulty(value: unknown): DifficultyPreference {
  return isDifficultyPreference(value) ? value : DEFAULT_DIFFICULTY;
}

/**
 * Apply the preference to a target difficulty.
 *
 * Clamped to the same -3..3.5 range the model and the registry use, so a large
 * offset cannot produce a target the difficulty scale cannot represent.
 */
export function applyDifficultyPreference(
  target: number,
  preference: DifficultyPreference,
): number {
  return clamp(target + OFFSET[preference], -3, 3.5);
}

/** The raw offset, for tests and for explaining the control in the UI. */
export function difficultyOffset(preference: DifficultyPreference): number {
  return OFFSET[preference];
}
