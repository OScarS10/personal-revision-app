import type { Chapter, GeneratedQuestion, TemplateStat } from "@/lib/types";
import { templateCalibration } from "@/lib/calibration";
import type { Generator, QuestionBody } from "./types";
import { assemble, choiceQuestion, difficultyToTier, step } from "./types";
import { CHAPTERS_BY_SUBJECT, getChapter } from "@/lib/specs";
import { Rng } from "@/lib/rng";
import { clamp } from "@/lib/math-utils";

/**
 * Knowledge generators, built from authored chapter content.
 *
 * These replace an earlier set that asked "which section of the specification
 * is this bullet from?" and "which of these bullets belongs to this chapter?".
 * Those questions tested the specification's own layout, not the subject: a
 * learner could score full marks without knowing what marginal revenue is.
 * Worse, they were the only questions most chapters had, so their results fed
 * the ability model and inflated mastery for exactly the knowledge-heavy
 * chapters that were being measured least well.
 *
 * A chapter with no authored knowledge now produces nothing, and the session
 * planner skips it, because an honest gap is better than an item that flatters
 * the learner.
 */
function knowledgeGenerators(chapter: Chapter): Generator[] {
  const knowledge = chapter.knowledge;
  if (!knowledge) return [];

  const { terms, keyIdeas, commonMistakes, examTip } = knowledge;
  if (terms.length === 0 && keyIdeas.length === 0) return [];

  const generators: Generator[] = [];

  if (terms.length > 0) {
    const defineTerm: Generator = {
      key: "knowledge-define-term",
      base: -0.7,
      span: 1.6,
      build: (ctx): QuestionBody => {
        const entry = ctx.rng.pick(terms);
        // Distractors are other real definitions from the same chapter, so the
        // learner has to know which definition belongs to which term rather
        // than spotting the one that sounds wrong.
        const others = terms.filter((t) => t.term !== entry.term);
        const foreign = peers(chapter)
          .flatMap((p) => p.knowledge?.keyIdeas ?? [])
          .slice(0, 3)
          .map(toTerm);
        const pool = others.length >= 3 ? others : [...others, ...foreign];
        return choiceQuestion(
          `Which of the following is the correct definition of **${entry.term}**?`,
          entry.definition,
          pool.map((t) => t.definition),
          {
            rng: ctx.rng,
            marks: 2,
            solution: [
              step(`Define ${entry.term}`, entry.definition),
              ...(entry.example ? [step("In practice", entry.example)] : []),
              ...(entry.commonError
                ? [step("Where it goes wrong", entry.commonError)]
                : []),
            ],
            takeaway: `${entry.term}: ${entry.definition}`,
          },
        );
      },
    };
    generators.push(defineTerm);

    if (terms.some((t) => t.commonError)) {
      const spotError: Generator = {
        key: "knowledge-common-error",
        base: 0.2,
        span: 1.6,
        build: (ctx): QuestionBody => {
          const withError = terms.filter((t) => t.commonError);
          const entry = ctx.rng.pick(withError);
          if (!entry) return defineTerm.build(ctx);
          const others = withError.filter((t) => t.term !== entry.term);
          return choiceQuestion(
            `A learner uses **${entry.term}** in a question and makes the following mistake. Which description matches it?\n\n> ${entry.commonError}`,
            `${entry.term}: ${entry.commonError}`,
            [
              ...others.map((t) => `${t.term}: ${t.commonError}`).filter((s) => s.length > 0),
              `${entry.term}: the term is not defined in the specification`,
            ].slice(0, 3),
            {
              rng: ctx.rng,
              marks: 2,
              solution: [
                step("The error", entry.commonError!),
                step(
                  "Why it costs marks",
                  examTip ?? "Mark schemes award the technique, not the terminology alone.",
                ),
              ],
              takeaway: `Misusing ${entry.term} is a common way to lose marks in ${chapter.specRef}.`,
            },
          );
        },
      };
      generators.push(spotError);
    }
  }

  if (keyIdeas.length >= 2) {
    const whichIdeas: Generator = {
      key: "knowledge-key-idea",
      base: -0.2,
      span: 1.5,
      build: (ctx): QuestionBody => {
        const picked = ctx.rng.sample(keyIdeas, Math.min(2, keyIdeas.length));
        const foreign = ctx.rng
          .sample(
            peers(chapter).flatMap((p) => p.knowledge?.keyIdeas ?? []),
            2,
          );
        if (foreign.length < 1) {
          return generators[0]
            ? generators[0].build(ctx)
            : choiceQuestion(
                `Which of the following is assessed in ${chapter.specRef}?`,
                picked[0]!,
                foreign,
                { rng: ctx.rng, marks: 1, solution: [step("Check", picked[0]!)], takeaway: picked[0]! },
              );
        }
        const correct = picked.join("; ");
        return choiceQuestion(
          `Which pair of statements are both part of ${chapter.specRef} (${chapter.title})?`,
          correct,
          ctx.rng.shuffle(
            [
              ...foreign,
              `${picked[0]!}; ${foreign[0] ?? keyIdeas[0]!}`,
              ...(commonMistakes.length > 0 ? [commonMistakes[0]!] : []),
            ].filter((s) => s !== correct),
          ),
          {
            rng: ctx.rng,
            marks: 2,
            solution: [
              step("The two that belong", correct),
              ...(examTip ? [step("In the exam", examTip)] : []),
            ],
            takeaway: keyIdeas.slice(0, 2).join("; "),
          },
        );
      },
    };
    generators.push(whichIdeas);
  }

  if (commonMistakes.length > 0) {
    const avoidMistake: Generator = {
      key: "knowledge-avoid-mistake",
      base: 0.6,
      span: 1.4,
      build: (ctx): QuestionBody => {
        const picked = ctx.rng.pick(commonMistakes);
        return choiceQuestion(
          `Which of the following is a mistake worth avoiding in ${chapter.specRef}?`,
          picked,
          ctx.rng.sample(commonMistakes.filter((m) => m !== picked), 0).concat(
            // Distractors are drawn from elsewhere so the answer cannot be found
            // by spotting which option sounds cautious.
            peers(chapter)
              .flatMap((p) => p.knowledge?.commonMistakes ?? [])
              .filter((m) => m !== picked)
              .slice(0, 3),
          ),
          {
            rng: ctx.rng,
            marks: 2,
            solution: [
              step("The mistake", picked),
              ...(examTip ? [step("What the mark scheme wants instead", examTip)] : []),
            ],
            takeaway: picked,
          },
        );
      },
    };
    generators.push(avoidMistake);
  }

  return generators;
}

/** Peers in the same subject, excluding this chapter. */
function peers(chapter: Chapter): Chapter[] {
  return CHAPTERS_BY_SUBJECT[chapter.subject].filter((c) => c.id !== chapter.id);
}

/** Wrap a foreign key idea as a term-like object so it can be used as a distractor. */
function toTerm(idea: string): { term: string; definition: string } {
  return { term: idea, definition: idea };
}

// ------------------------------------------------------------------ registry

const SUBJECT_REGISTRY: Record<string, Generator[]> = {};

/**
 * Extra distance charged to knowledge templates when selecting a generator.
 *
 * Sized so a bespoke template wins whenever it is within about a third of a
 * difficulty band of the target, but a genuinely better-matched knowledge
 * question can still be chosen for a learner who is far off the pace.
 * Measured with scripts/report-selector.ts.
 */
const KNOWLEDGE_BIAS = 0.35;

/**
 * Distance charged for having used a template earlier in the session.
 *
 * The caller's recent-template list is ordered oldest first, so the newest entry
 * is charged the full penalty and older entries are charged progressively less.
 * Scaling by recency is what makes this work: a flat penalty treats a template
 * used twelve questions ago as bad as the one just shown, so over a long
 * session the chapter runs out of eligible templates and the selector starts
 * repeating the same pair regardless of what else it has.
 */
const REPEAT_PENALTY_NEWEST = 1.4;
const REPEAT_PENALTY_OLDEST = 0.6;

/**
 * How far a candidate may sit from the best match and still be eligible.
 *
 * This is what keeps variety from costing difficulty precision. The repeat
 * penalty is charged before the window is taken, so a just-used template falls
 * out and lets a fresher one in, but only if that fresher one is a genuine
 * match for the target difficulty rather than merely unused.
 *
 * The two numbers are chosen together, and the constraint is the important part:
 * the penalty floor (0.6) is larger than the tolerance (0.45). A template used
 * anywhere in the last twelve therefore scores worse than the tolerance allows,
 * so it leaves the window whenever a fresh template is a legitimate match. With a
 * smaller floor the penalty decayed to nothing, a template that had aged out of
 * the newest slot came straight back, and the selector settled into a loop over
 * the two or three nearest templates - which is the behaviour being fixed here.
 */
const MATCH_TOLERANCE = 0.45;

/** How many of the best matches to sample among once the window is set. */
const CANDIDATE_WINDOW = 3;

/**
 * How much of a template's calibrated difficulty is mixed into what is served.
 *
 * Small on purpose. Calibration is evidence that a template has proved easier
 * or harder than its author declared, which should nudge the served difficulty,
 * not override what the learner asked for. At 1 the preference would have no
 * effect at all, which is the behaviour this replaced.
 */
const CALIBRATION_BLEND = 0.25;

/**
 * Penalty for having used `key` already, scaled by how recently.
 *
 * Returns 0 when the template is absent from the list.
 *
 * Exported for tests, because the scaling is the part worth pinning down: a
 * flat penalty preserves the relative order of a chapter's templates, so the
 * selector keeps returning the same pair however many times it has been used.
 */
export function recencyPenalty(key: string, avoidKeys: string[]): number {
  const index = avoidKeys.lastIndexOf(key);
  if (index === -1) return 0;
  // A single-entry list is by definition the most recent thing the learner saw.
  if (avoidKeys.length === 1) return REPEAT_PENALTY_NEWEST;
  const recency = index / (avoidKeys.length - 1);
  return REPEAT_PENALTY_OLDEST + (REPEAT_PENALTY_NEWEST - REPEAT_PENALTY_OLDEST) * recency;
}

export function registerGenerators(chapterIds: string[], generators: Generator[]): void {
  for (const id of chapterIds) {
    SUBJECT_REGISTRY[id] = [...(SUBJECT_REGISTRY[id] ?? []), ...generators];
  }
}

export function generatorsFor(chapter: Chapter): Generator[] {
  const bespoke = SUBJECT_REGISTRY[chapter.id] ?? [];
  return [...bespoke, ...knowledgeGenerators(chapter)];
}

export function hasBespokeGenerators(chapterId: string): boolean {
  return (SUBJECT_REGISTRY[chapterId]?.length ?? 0) > 0;
}

export function clearRegistry(): void {
  for (const key of Object.keys(SUBJECT_REGISTRY)) delete SUBJECT_REGISTRY[key];
}

// --------------------------------------------------------------- orchestration

export interface GenerateOptions {
  chapter: Chapter;
  targetDifficulty: number;
  seed: string;
  /** Generator keys to avoid, so a session does not repeat a template. */
  avoidKeys?: string[];
  /** Observed outcomes, used to calibrate hand-set difficulties. */
  templateStats?: Record<string, TemplateStat>;
}

/**
 * Choose and run a generator whose difficulty band brackets the learner's target.
 *
 * Candidates are scored by how close their band centre is to the target, minus a
 * penalty for templates already used this session. This is what makes the tool
 * produce easier or harder questions rather than a flat stream.
 */
export function generateQuestion(options: GenerateOptions): GeneratedQuestion | null {
  const { chapter, targetDifficulty, seed, avoidKeys = [], templateStats } = options;
  const rng = new Rng(seed);
  const pool = generatorsFor(chapter);
  if (pool.length === 0) return null;

const scored = pool.map((gen) => {
    // Calibrated difficulty where outcomes exist, hand-set otherwise. The
    // distance is measured against the effective value, and the served value is
    // used below, so selection and delivery agree.
    const calibration = templateCalibration(templateStats?.[gen.key], gen.base);
    const distance = Math.abs(calibration.effective - targetDifficulty);
    // Charged as part of the score rather than applied after sorting, so a used
    // template actually leaves the window and the fresher templates behind it
    // become reachable.
    const repeatPenalty = recencyPenalty(gen.key, avoidKeys);
    // Knowledge questions are the fallback, not the default. Without this bias
    // the selector happily returns a softer recall item for a learner who asked
    // for practice. Preferring the bespoke template by a small margin keeps the
    // knowledge questions for chapters with no bespoke generators.
    const knowledgeBias = gen.key.startsWith("knowledge-") ? KNOWLEDGE_BIAS : 0;
    return {
      gen,
      calibration,
      score: distance + repeatPenalty + knowledgeBias + rng.float(0, 0.18),
    };
  });
  scored.sort((a, b) => a.score - b.score);

  /*
    Candidates are the templates within a tolerance of the best match, rather
    than a fixed number of them.

    A fixed window was the bug behind "only two questions per thing": it was
    counted from the top, so a chapter whose two nearest templates had already
    been used kept offering exactly those two while the rest of the pool was
    never reachable. Scoring the repeat penalty first and then gating on
    tolerance means an unused template that is still a legitimate match for the
    target gets its turn, and a fresh template that is nothing like the target
    still does not displace the right difficulty.
  */
  const best = scored[0]!.score;
  const eligible = scored.filter((c) => c.score <= best + MATCH_TOLERANCE);
  // The window on top of that keeps within-tier variation without letting a
  // long chapter drift to whatever happens to be sitting further down the list.
  const top = eligible.slice(0, Math.min(CANDIDATE_WINDOW, eligible.length));
  const picked = rng.pick(top);

  /*
    The served difficulty is the target, not the template's own centre.

    This is the difference between a difficulty control that works and one that
    only appears to. The target previously went no further than choosing which
    template to run: both the tier and the recorded difficulty were then derived
    from the template's calibrated centre, discarding it again. Asking for a
    harder question therefore mostly re-ordered a pool whose items were then
    served at their own declared level, so two chapters with a narrow spread of
    templates produced identical output at every setting.

    Anchoring on the target keeps three things true at once:
    - the learner's chosen difficulty is what they actually get;
    - a template that has proved easier than declared is nudged easier within its
      own band, because its calibrated value is blended in below rather than
      replacing the target;
    - the recorded difficulty is the one the learner experienced, so the ability
      model is fitted against a real value rather than a relabelled one.
  */
  const served = clamp(picked.calibration.effective * CALIBRATION_BLEND + targetDifficulty * (1 - CALIBRATION_BLEND), -3, 3.5);

  return assemble(
    chapter,
    picked.gen,
    {
      rng,
      chapter,
      targetDifficulty: served,
      tier: difficultyToTier(served),
      seed,
    },
    served,
  );
}

export function getChapterOrThrow(id: string): Chapter {
  const chapter = getChapter(id);
  if (!chapter) throw new Error(`Unknown chapter: ${id}`);
  return chapter;
}
