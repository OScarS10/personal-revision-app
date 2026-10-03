import {
  answerMatches,
  normaliseAnswer,
  parseNumeric,
  round,
} from "./math-utils";
import type {
  Answer,
  GeneratedQuestion,
  LevelDescriptor,
  MarkScheme,
  MarkSchemePoint,
  RatingLevel,
} from "./types";

export interface MarkingResult {
  /** Raw, un-normalised learner input. */
  response: string[];
  correct: boolean;
  /** 0..1. Partial credit for multi-part and multi-select items. */
  score: number;
  marks: number;
  awardedMarks: number;
  /** Human-readable feedback shown after submitting. */
  feedback: string;
  /** Every accepted form, so the learner can see what would have worked. */
  accepted: string[];
  /**
   * True when the learner marked their own answer against a scheme. Self-assessed
   * scores run generous, so the model discounts them rather than trusting them
   * at full weight.
   */
  selfAssessed: boolean;
}

/**
 * Normalise a learner response into individual tokens.
 *
 * Callers that already have a `string[]` (the UI, which owns the option
 * buttons) get it back untouched. Splitting only happens for a raw pasted or
 * typed string, and only for formats where that is safe.
 *
 * Single-choice options frequently contain commas, semicolons and newlines -
 * official specification bullets are full of them - so those formats must be
 * graded as one opaque string and never split.
 */
function splitResponse(input: string | string[], split: boolean): string[] {
  if (Array.isArray(input)) {
    return input.map((part) => part.trim()).filter((part) => part.length > 0);
  }
  if (!split) {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [""];
  }
  const parts = input
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [input.trim()];
}

/** Strip a trailing unit so "12.5 m" is accepted for an answer of "12.5". */
function stripUnits(value: string, unit?: string): string {
  if (!unit) return value;
  const escaped = unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return value.replace(new RegExp(`${escaped}\\s*$`, "i"), "").trim();
}

/**
 * Grade a single response against a question.
 *
 * Every question type is reduced to "one or more tokens, each of which either
 * matches or does not", which keeps the partial-credit logic in one place.
 */
export function markQuestion(
  question: GeneratedQuestion,
  input: string | string[],
): MarkingResult {
  const format = question.format;
  const isMultiSelect = format.kind === "multi-choice";
  const response = splitResponse(input, isMultiSelect);

  const accepted: string[] = [question.answer];
  if (format.kind === "text") {
    accepted.push(...format.accepted.filter((a) => a !== question.answer));
  }

  let correct = false;
  let score = 0;
  let feedback = "";

  switch (format.kind) {
    case "numeric": {
      const tolerance = format.tolerance ?? 0;
      const given = stripUnits(response[0] ?? "", format.unit);
      const answerNum = parseNumeric(question.answer);

      if (answerNum !== null && answerNum === 0) {
        // Relative tolerance is meaningless at zero, so require an exact match.
        const givenNum = parseNumeric(given);
        correct = givenNum !== null && givenNum === 0;
        score = correct ? 1 : 0;
      } else if (answerNum !== null) {
        // Scale the tolerance with the magnitude of the answer so that a
        // 4-dp answer is not judged against an absolute epsilon.
        const relative = Math.abs(answerNum) * 1e-9;
        const allowed = Math.max(tolerance, relative);
        const givenNum = parseNumeric(given);
        correct = givenNum !== null && Math.abs(givenNum - answerNum) <= allowed;
        score = correct ? 1 : 0;
      } else {
        correct = answerMatches(given, question.answer);
        score = correct ? 1 : 0;
      }
      feedback = correct
        ? format.unit
          ? `Correct — ${question.answer} ${format.unit}.`
          : `Correct — ${question.answer}.`
        : `Not quite. The answer is ${question.answer}${format.unit ? ` ${format.unit}` : ""}. Check your method and try the next one.`;
      break;
    }

    case "text": {
      const given = stripUnits(response[0] ?? "", undefined);
      correct = accepted.some((a) =>
        answerMatches(given, a, format.caseSensitive ?? false),
      );
      score = correct ? 1 : 0;
      feedback = correct
        ? `Correct — ${question.answer}.`
        : accepted.length > 1
          ? `Not quite. Acceptable answers were: ${accepted.join(", ")}.`
          : `Not quite. The answer is ${question.answer}.`;
      break;
    }

    case "single-choice": {
      const given = normaliseAnswer(response[0] ?? "");
      correct = accepted.some((a) => normaliseAnswer(a) === given);
      score = correct ? 1 : 0;
      feedback = correct
        ? `Correct — ${question.answer}.`
        : `Not quite. The answer is ${question.answer}.`;
      break;
    }

    case "multi-choice": {
      // Credit each correctly selected option, and apply a penalty for wrong
      // ones so that selecting everything does not score full marks.
      //
      // The expected set is derived by splitting the stored answer, because a
      // multi-select answer is held as one comma-separated string. Comparing
      // against the whole string would score every real attempt as zero.
      const want = new Set(
        question.answer
          .split(/[,;\n]/)
          .map((a) => normaliseAnswer(a))
          .filter((a) => a.length > 0),
      );
      const got = new Set(response.map((r) => normaliseAnswer(r)));
      let hits = 0;
      let misses = 0;
      for (const option of want) if (got.has(option)) hits++;
      for (const option of got) if (!want.has(option)) misses++;

      score = want.size > 0 ? Math.max(0, (hits - misses) / want.size) : 0;
      correct = want.size > 0 && hits === want.size && misses === 0;
      const shown = [...want].map((a) => a.toUpperCase()).join(", ");
      feedback = correct
        ? `Correct — ${shown}.`
        : hits === 0
          ? `None of your selections were right. The answer is ${shown}.`
          : `Partly right: ${hits} of ${want.size} correct${misses ? `, plus ${misses} incorrect` : ""}. The full answer is ${shown}.`;
      break;
    }

    case "code": {
      /*
        Code answers are compared structurally, so formatting, comments and
        string contents must not affect the verdict.

        Order matters: string literals are blanked *before* comments are
        stripped. The other way round, a URL in a string ("http://x") would be
        read as the start of a comment and everything after it would vanish,
        silently turning two different programs into the same one.
      */
      const normaliseCode = (code: string) =>
        code
          .replace(/"""[\s\S]*?"""/g, '""')
          .replace(/["'][^"'\n]*["']/g, '""')
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/[^\n]*/g, "")
          .replace(/#[^\n]*/g, "")
          .replace(/\s+/g, " ")
          .trim();
      const given = normaliseCode(response.join("\n"));
      // Only the canonical answer is compared; alternative code forms are not
      // something a structural comparison can meaningfully judge.
      correct = normaliseCode(question.answer) === given;
      score = correct ? 1 : 0;
      feedback = correct
        ? `Correct.`
          : `This is not the expected answer. A correct solution is:\n\n${question.answer}`;
      break;
    }

    case "extended": {
      /*
        Self-marked, so the response is the indices of the points the learner says
        they hit, plus a `rating:N` token when the scheme carries a rating. Scoring
        happens in markExtended rather than here, because the learner needs to see
        the scheme before deciding.

        The rating token is filtered out before indices are parsed. Left in, it
        would parse to NaN and be dropped anyway, but relying on that to keep a
        judgement out of the point index set is a coincidence rather than a
        decision.
      */
      const ratingLevel = parseRatingToken(response);
      const indices = new Set(
        response
          .filter((r) => !r.startsWith(RATING_TOKEN))
          .map((r) => Number.parseInt(r, 10))
          .filter((n) => Number.isInteger(n)),
      );
      const scheme = format.scheme;
      const awarded = markExtended(scheme, indices, format.levels, ratingLevel);
      correct = awarded.achievedFraction >= 0.6;
      score = awarded.achievedFraction;
      feedback = awarded.feedback;
      break;
    }
  }

  return {
    response,
    correct,
    score: round(score, 4),
    marks: question.marks,
    awardedMarks: round(score * question.marks, 2),
    feedback,
    accepted,
    selfAssessed: question.format.kind === "extended",
  };
}

export interface ExtendedResult {
  /** Points the learner claimed, by index into the scheme. */
  achieved: number;
  /** Marks those points were worth. */
  achievedMarks: number;
  /** Marks the rating contributed. Zero when the scheme has no rating. */
  ratingMarks: number;
  /** The rating step the learner chose, if the scheme has a rating. */
  ratingLevel: RatingLevel | null;
  achievedFraction: number;
  /** The band the awarded marks fall into, if the scheme has levels. */
  level: LevelDescriptor | null;
  feedback: string;
  /** Points not claimed, so the UI can show what was missed. */
  missed: MarkSchemePoint[];
}

/**
 * Prefix marking the chosen rating step in a response.
 *
 * The rating has to travel in the same string[] the rest of an extended answer
 * uses, because that is what gets persisted. A tagged token keeps it separable
 * from the point indices, so a rating choice can never be read as a claim on a
 * point and vice versa.
 */
export const RATING_TOKEN = "rating:";

export function ratingToken(level: number): string {
  return `${RATING_TOKEN}${level}`;
}

/** Read the rating step out of an extended response, if one was chosen. */
export function parseRatingToken(response: readonly string[]): number | null {
  for (const token of response) {
    if (!token.startsWith(RATING_TOKEN)) continue;
    const level = Number.parseInt(token.slice(RATING_TOKEN.length), 10);
    if (Number.isFinite(level)) return level;
  }
  return null;
}

/**
 * Score a self-marked extended answer.
 *
 * Three deliberate choices:
 *
 * Link points are worth more than a simple pro-rata share. AQA awards chain of
 * reasoning separately, so an answer with every fact but no linkage scores
 * below one with fewer facts and a chain, and pro-rata marking would not see
 * that at all.
 *
 * A rating is awarded from the step the learner chose, not from the points, so
 * the two cannot inflate each other: claiming every point still leaves the
 * rating worth whatever it is worth.
 *
 * A claim is capped at the scheme's own total, so ticking everything cannot
 * produce more than full marks.
 */
export function markExtended(
  scheme: MarkScheme,
  claimed: Set<number>,
  levels?: LevelDescriptor[],
  ratingLevel?: number | null,
): ExtendedResult {
  const points = scheme.points;
  const hit = points.filter((p, i) => claimed.has(i));

  const baseMarks = hit.reduce((s, p) => s + p.marks, 0);
  const linkPoints = hit.filter((p) => p.isLink);
  // Each link point adds a half-mark bonus, reflecting that a linked argument
  // is worth more than the same content listed.
  const linkBonus = linkPoints.length * 0.5;

  /*
    The rating is looked up by level, and an unknown level falls back to nothing
    rather than to the nearest rung. Guessing upward on a judgement axis is the
    exact failure this whole feature exists to avoid, so an unrecognised level
    earns nothing and the feedback says so.
  */
  const scale = scheme.rating;
  const chosen = scale?.levels.find((l) => l.level === ratingLevel) ?? null;
  const ratingMarks = chosen?.marks ?? 0;
  const ratingGiven = scale != null && ratingLevel != null && chosen == null;

  const ceiling = scheme.availableMarks ?? scheme.totalMarks + (scale?.totalMarks ?? 0);
  const achievedMarks = Math.min(ceiling, baseMarks + linkBonus + ratingMarks);
  const achievedFraction = ceiling > 0 ? achievedMarks / ceiling : 0;

  const band = levels ?? undefined;
  /*
    Bands are matched on their indicative range, which is a guide rather than a
    hard boundary: real mark schemes award credit for a point that straddles
    two bands, and a scheme whose ranges leave a gap should still return the
    nearest band rather than nothing. Taking the highest band whose floor the
    score clears handles both cases, and an empty scheme has no band to return.
  */
  const level =
    band && band.length > 0
      ? [...band]
          .sort((a, b) => a.indicativeRange[0] - b.indicativeRange[0])
          .filter((l) => achievedFraction >= l.indicativeRange[0])
          .pop() ?? band[0]!
      : null;

  const missed = points.filter((p, i) => !claimed.has(i));
  const missedMarks = points.reduce((s, p) => s + p.marks, 0) - baseMarks;

  const parts = [
    `You claimed ${hit.length} of ${points.length} points, worth ${round(achievedMarks, 1)} of ${ceiling}.`,
  ];
  if (linkPoints.length > 0) {
    parts.push(`${linkPoints.length} of those were chain-of-reasoning points, which carry a bonus.`);
  } else if (points.some((p) => p.isLink)) {
    parts.push("No chain-of-reasoning points were claimed, so the answer cannot reach the top band.");
  }
  if (scale) {
    parts.push(
      chosen
        ? `You rated ${axisLower(scale.axis)} as ${chosen.label}, worth ${chosen.marks}.`
        : `You did not rate ${axisLower(scale.axis)}, so those ${scale.totalMarks} marks are unclaimed.`,
    );
    if (ratingGiven) {
      parts.push(`Level ${ratingLevel} is not on the scale, so it earned nothing.`);
    }
  }
  if (level) {
    parts.push(`That sits in Level ${level.level}: ${level.label}.`);
  }
  if (missedMarks > 0) {
    parts.push(
      `${missed.length} point${missed.length === 1 ? "" : "s"} worth ${round(missedMarks, 1)} marks were not claimed.`,
    );
  }
  parts.push(
    "This score is self-assessed. Re-read your answer against the scheme before accepting it, since marking your own work runs generous.",
  );

  return {
    achieved: hit.length,
    achievedMarks: round(achievedMarks, 2),
    ratingMarks,
    ratingLevel: chosen,
    achievedFraction: round(achievedFraction, 4),
    level,
    feedback: parts.join(" "),
    missed,
  };
}

function axisLower(axis: string): string {
  return axis.charAt(0).toLowerCase() + axis.slice(1);
}

/** Build the persisted record for a graded attempt. */
export function toAnswer(
  question: GeneratedQuestion,
  result: MarkingResult,
  durationMs: number,
  timestamp: number,
): Answer {
  return {
    questionId: question.id,
    chapterId: question.chapterId,
    skillIds: [...question.skillIds],
    specRef: question.specRef,
    difficulty: question.difficulty,
    response: result.response,
    correct: result.correct,
    score: result.score,
    marks: result.marks,
    awardedMarks: result.awardedMarks,
    durationMs,
    timestamp,
    template: question.template,
    assessesMastery: question.assessesMastery,
    /*
      Carried onto the answer, because the ability model discounts on this flag and
      nothing else.

      It used to be left off here, which silently disabled the discount: every
      self-marked extended answer moved theta at full weight while the model held a
      whole branch of code meant to damp it down. The flag has to be recorded at the
      point the answer is built, or the correction is invisible.
    */
    selfAssessed: result.selfAssessed,
  };
}
