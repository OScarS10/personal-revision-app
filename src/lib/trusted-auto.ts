import type {
  GeneratedQuestion,
  MarkScheme,
  MarkSchemePoint,
  QuestionFormat,
  RatingScale,
} from "./types";

/*
  What the app is allowed to mark on its own.

  The rule the whole feature rests on: an automatic mark has to be right, not
  usually right. Anything that involves interpreting a sentence, weighing an
  argument, or estimating how good something is stays with the learner, no
  matter how confident a model claims to be. "Confident" is not the bar; the bar
  is that the decision has a definite answer.

  So trust here is structural, not statistical. A format earns trust by having
  exactly one correct answer that can be compared without judgement. A point
  earns it by listing the evidence it accepts, which turns marking into a lookup.
  A rating never earns it, because a rating is a judgement by construction, and
  that is not something more data can fix.
*/

export type AutoVerdict = "trusted" | "untrusted";

export interface TrustDecision {
  verdict: AutoVerdict;
  /** Plain-language reason, surfaced so the reason is never just "no". */
  reason: string;
}

/** Formats where the answer is compared, not interpreted. */
const EXACT_KINDS = new Set<QuestionFormat["kind"]>([
  "numeric",
  "text",
  "single-choice",
  "multi-choice",
  "code",
]);

/**
 * Whether a format can be marked automatically at all.
 *
 * Extended answers are the whole reason this module exists. They are excluded
 * outright, before any scoring happens, so no future heuristic can widen the gap
 * by being clever about an essay.
 */
export function trustFormat(format: QuestionFormat): TrustDecision {
  if (format.kind === "extended") {
    return {
      verdict: "untrusted",
      reason: "Extended answers are judged, not matched, so they are never marked automatically.",
    };
  }
  if (!EXACT_KINDS.has(format.kind)) {
    return { verdict: "untrusted", reason: `No automatic rule exists for "${format.kind}" answers.` };
  }
  return { verdict: "trusted", reason: "The answer is compared against a known correct value." };
}

/**
 * Whether a single scheme point can be awarded without judgement.
 *
 * Three things have to hold. The author has to have opted in by supplying the
 * accepted evidence; the point cannot be about how an argument is constructed,
 * since "is this a chain of reasoning" is an opinion; and the rule has to name
 * real evidence, because a rule with no keywords can only guess.
 */
export function trustPoint(point: MarkSchemePoint): TrustDecision {
  if (point.isLink) {
    return {
      verdict: "untrusted",
      reason: "Chain-of-reasoning points are judged, so they stay with the learner.",
    };
  }
  if (!point.auto) {
    return {
      verdict: "untrusted",
      reason: "This point does not list the evidence it accepts, so it cannot be checked.",
    };
  }
  if (point.auto.keywords.length === 0) {
    return {
      verdict: "untrusted",
      reason: "This point lists no evidence to look for, so any match would be a guess.",
    };
  }
  return { verdict: "trusted", reason: "Every required term is listed, so this is a lookup." };
}

export function trustedPoints(scheme: MarkScheme): MarkSchemePoint[] {
  return scheme.points.filter((p) => trustPoint(p).verdict === "trusted");
}

/** Indexes into the scheme, so callers can tick exactly these. */
export function trustedPointIndexes(scheme: MarkScheme): number[] {
  const out: number[] = [];
  scheme.points.forEach((p, i) => {
    if (trustPoint(p).verdict === "trusted") out.push(i);
  });
  return out;
}

/*
  A rating is never automatic. Stated separately rather than folded into
  trustPoint because a rating is not a point, and a caller asking "is this scale
  safe to fill in for me" needs a clear no rather than an empty list.
*/
export function trustRating(_scale: RatingScale | undefined): TrustDecision {
  return {
    verdict: "untrusted",
    reason: "A rating is a judgement about quality, so the app does not make it for the learner.",
  };
}

/**
 * Whether an automatic mark may change the stored result or move ability.
 *
 * Only whole objective items qualify. A partly automatic answer is not enough:
 * the rated part is still self-assessed, so the item as a whole is still
 * self-assessed, and marking it as verified would let a judgement reach the
 * ability model wearing the costume of a fact.
 */
export function trustMasteryWrite(question: GeneratedQuestion): TrustDecision {
  const format = trustFormat(question.format);
  if (format.verdict === "untrusted") {
    return { verdict: "untrusted", reason: format.reason };
  }
  return { verdict: "trusted", reason: "Marked by comparison, not by judgement." };
}

/* ------------------------------------------------------------------ matching */

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Whether a response contains a term.
 *
 * Word boundaries on both sides, so "cost" does not match "costless" and
 * "marginal" does not match "marginalise". Bounding the right side is what stops
 * a prefix match quietly standing in for the real term.
 */
export function containsTerm(response: string, term: string): boolean {
  const hay = ` ${normalise(response)} `;
  const needle = normalise(term);
  if (needle === "") return false;
  return hay.includes(` ${needle} `);
}

export interface AwardedPoint {
  index: number;
  point: MarkSchemePoint;
  /** The terms found, so the learner can see why it was awarded. */
  matched: string[];
}

export interface DeferredPart {
  label: string;
  marks: number;
  reason: string;
}

export interface TrustedAward {
  /** Marks from trusted points only. Never includes any rating. */
  marks: number;
  awarded: AwardedPoint[];
  /** Everything left for the learner, each with the reason it was left. */
  deferred: DeferredPart[];
  /** True when there was nothing automatic to do. */
  empty: boolean;
}

/**
 * Award only the points that are provably checkable.
 *
 * Every term in a point's rule must be present. Partial evidence earns nothing,
 * because a point listing three required terms is not a point that is two-thirds
 * met, and awarding fractions by keyword count is exactly the similarity scoring
 * this is meant to avoid.
 *
 * The rating is deliberately never awarded here. There is no code path in this
 * module that can produce rating marks.
 */
export function trustedAward(scheme: MarkScheme, response: string): TrustedAward {
  const awarded: AwardedPoint[] = [];
  const deferred: DeferredPart[] = [];
  let marks = 0;

  scheme.points.forEach((point, index) => {
    const trust = trustPoint(point);
    if (trust.verdict !== "trusted") {
      deferred.push({ label: point.label, marks: point.marks, reason: trust.reason });
      return;
    }

    const rule = point.auto!;
    const required = rule.keywords;
    const options = rule.anyOf ?? [];

    // Every required term, plus one satisfied alternative from each group.
    const missing = required.filter((k) => !containsTerm(response, k));
    const unmetGroups = options
      .map((group) => ({ group, met: group.some((o) => containsTerm(response, o)) }))
      .filter((g) => !g.met);
    const matchedGroups = options
      .filter((group) => group.some((o) => containsTerm(response, o)))
      .map((group) => group.filter((o) => containsTerm(response, o))[0]!);

    if (missing.length === 0 && unmetGroups.length === 0) {
      awarded.push({ index, point, matched: [...required, ...matchedGroups] });
      marks += point.marks;
      return;
    }

    deferred.push({
      label: point.label,
      marks: point.marks,
      reason:
        missing.length > 0
          ? `Not awarded automatically: your answer is missing ${missing.map((m) => `"${m}"`).join(", ")}.`
          : "Not awarded automatically: none of the accepted alternatives appear.",
    });
  });

  if (scheme.rating) {
    const rating = scheme.rating;
    deferred.push({
      label: rating.axis,
      marks: rating.totalMarks,
      reason: trustRating(rating).reason,
    });
  }

  return { marks, awarded, deferred, empty: awarded.length === 0 };
}

/**
 * Whether an automatic mark may be persisted as verified rather than estimated.
 *
 * The answer is yes only for objective formats, which markQuestion settles by
 * comparison. Everything else, and every rating, stays advisory: the learner
 * sees the outcome and decides, and the ability model keeps discounting it.
 */
export function mayApplyAutomatically(question: GeneratedQuestion): TrustDecision {
  const format = trustFormat(question.format);
  if (format.verdict === "untrusted") return format;
  return { verdict: "trusted", reason: format.reason };
}