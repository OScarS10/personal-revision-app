import type { Chapter, DiagramSpec, GeneratedQuestion, WorkedStep } from "@/lib/types";
import type { Rng } from "@/lib/rng";
import { clamp, round } from "@/lib/math-utils";

export interface GeneratorContext {
  rng: Rng;
  chapter: Chapter;
  /** Target difficulty on the logit scale, roughly ability + stretch. */
  targetDifficulty: number;
  /** 1 (easiest) to 5 (hardest), derived from the target. */
  tier: 1 | 2 | 3 | 4 | 5;
  seed: string;
}

export type QuestionBody = Omit<
  GeneratedQuestion,
  | "id"
  | "chapterId"
  | "skillIds"
  | "specRef"
  | "tier"
  | "template"
  | "difficulty"
  // Omitted so the optional redeclaration below takes effect. Omit only removes
  // the keys it names, so leaving this in would keep it required and an
  // intersection with an optional would still be required.
  | "assessesMastery"
> & {
  /**
   * Defaults to true in assemble. Only set this to false for an item that
   * measures something other than the learner on this chapter.
   */
  assessesMastery?: boolean;
};
export interface Generator {
  key: string;
  /** Intrinsic difficulty at tier 3, on the logit scale. */
  base: number;
  /** How far difficulty moves between tier 1 and tier 5. */
  span: number;
  build: (ctx: GeneratorContext) => QuestionBody;
}

/** Map a logit-scale target difficulty to a 1..5 tier. */
export function difficultyToTier(difficulty: number): 1 | 2 | 3 | 4 | 5 {
  if (difficulty < -1.4) return 1;
  if (difficulty < -0.4) return 2;
  if (difficulty < 0.5) return 3;
  if (difficulty < 1.4) return 4;
  return 5;
}

export function tierToDifficulty(
  tier: number,
  base: number,
  span: number,
  jitter = 0,
): number {
  return clamp(base + ((tier - 3) / 2) * span + jitter, -3, 3.5);
}

export function makeQuestionId(chapterId: string, seed: string): string {
  return `${chapterId}::${seed}`;
}

/** Assemble a generator's output into a full question record. */
export function assemble(
  chapter: Chapter,
  generator: Generator,
  ctx: GeneratorContext,
  /**
   * Difficulty the item should actually be served at. Normally derived from the
   * tier and the generator's declared span, but a calibrated template supplies
   * its own centre so the stored difficulty matches the difficulty the learner
   * actually experienced.
   */
  difficultyAnchor?: number,
): GeneratedQuestion {
  const body = generator.build(ctx);
  const tiered = tierToDifficulty(ctx.tier, generator.base, generator.span, ctx.rng.float(-0.12, 0.12));
  const difficulty = clamp(
    difficultyAnchor === undefined
      ? tiered
      : // Re-centre the tiered spread on the calibrated value, keeping the
        // generator's own width so within-tier variation is preserved.
        difficultyAnchor + (tiered - tierToDifficulty(ctx.tier, generator.base, generator.span, 0)),
    -3,
    3.5,
  );
  return {
    id: makeQuestionId(chapter.id, ctx.seed),
    chapterId: chapter.id,
    skillIds: [chapter.id],
    specRef: chapter.specRef,
    difficulty,
    tier: ctx.tier,
    template: generator.key,
    ...body,
    // A generated item is a valid measure of the chapter unless the generator
    // explicitly says otherwise, so the common case needs no ceremony. Set
    // after the spread so an explicit false in the body is not overwritten.
    assessesMastery: body.assessesMastery ?? true,
  };
}

// ------------------------------------------------------------------ helpers

export function step(label: string, work: string, result?: string): WorkedStep {
  return { label, work, result };
}

export function numericFormat(unit?: string, tolerance?: number) {
  return { kind: "numeric" as const, unit, tolerance: tolerance ?? 0 };
}

export function numericQuestion(
  prompt: string,
  answer: number,
  opts: {
    unit?: string;
    dp?: number;
    tolerance?: number;
    marks?: number;
    solution: WorkedStep[];
    takeaway: string;
    context?: string;
    diagram?: DiagramSpec;
    extraSkillIds?: string[];
  },
): QuestionBody {
  const dp = opts.dp ?? 2;
  return {
    prompt,
    answer: String(round(answer, dp)),
    marks: opts.marks ?? 1,
    format: numericFormat(opts.unit, opts.tolerance ?? Math.max(0.01, Math.pow(10, -dp) / 2)),
    solution: opts.solution,
    takeaway: opts.takeaway,
    context: opts.context,
    diagram: opts.diagram,
  };
}

export function choiceQuestion(
  prompt: string,
  correct: string,
  distractors: string[],
  opts: {
    multiple?: boolean;
    rng: Rng;
    marks?: number;
    solution: WorkedStep[];
    takeaway: string;
    context?: string;
    diagram?: DiagramSpec;
  },
): QuestionBody {
  const unique = [...new Set([correct, ...distractors])].filter((d) => d && d !== correct);
  // Pad the option pool so every question has a plausible field to choose from.
  const pool = unique.length >= 3 ? unique : [...unique, ...FALLBACK_OPTIONS].slice(0, 3);
  const options = opts.rng.shuffle([correct, ...pool.slice(0, 3)]);
  return {
    prompt,
    answer: correct,
    marks: opts.marks ?? 1,
    format: { kind: "single-choice", options },
    solution: opts.solution,
    takeaway: opts.takeaway,
    context: opts.context,
    diagram: opts.diagram,
  };
}

const FALLBACK_OPTIONS = [
  "0",
  "1",
  "2",
  "undefined",
  "true",
  "false",
  "None of the above",
  "Cannot be determined from the information given",
];

/**
 * Build a plausible numeric distractor for a correct value.
 * `mode` controls the kind of mistake being modelled.
 */
export function numericDistractor(
  rng: Rng,
  value: number,
  mode: "sign" | "swap" | "percent" | "scale" | "ratio",
): number {
  switch (mode) {
    case "sign":
      return -value;
    case "swap": {
      const str = String(round(value, 3));
      const digits = str.replace(/[^0-9]/g, "");
      if (digits.length < 2) return value * 2;
      const swapped = Number(digits.split("").reverse().join(""));
      return swapped === value ? value + 1 : swapped;
    }
    case "percent":
      return value * rng.pick([1.1, 0.9, 0.8, 1.2, 1.5]);
    case "scale":
      return value * rng.pick([10, 0.1, 100, 0.01, 2, 0.5]);
    case "ratio":
      return value === 0 ? 1 : value * rng.pick([0.5, 2, 3, 1 / 3]);
  }
}

/** Format a numeric answer for display inside a distractor list. */
export function asOption(value: number, dp = 2, unit?: string): string {
  const text = String(round(value, dp));
  return unit ? `${text} ${unit}` : text;
}
