import { registerGenerators } from "./registry";
import type { Generator } from "./types";
import { step } from "./types";
import type { Chapter, MarkScheme, RatingScale } from "@/lib/types";
import { SUBJECT_ORDER, getChapters } from "@/lib/specs";

/*
  Two- and three-mark questions with a rated component.

  The gap these fill: a 10-mark essay and a 1-mark definition are the two sizes
  the app could already produce, and the small end was all binary. Real papers
  are full of 2- and 3-mark items that are half fact and half judgement, where
  the mark depends on how well something is said rather than whether it was said.

  So each of these items splits into two halves that are marked in genuinely
  different ways:

    - a factual half, stated in terms a learner can be *found* to have included
      or not, which is listed in the scheme as `auto.keywords` and so can be
      marked exactly;
    - a rated half, where the learner picks the step that describes their answer,
      which is a judgement and therefore theirs alone.

  The rated half is what makes these worth marking carefully. It is also why the
  app never fills it in automatically: `trustedAward` in lib/trusted-auto.ts can
  award the factual half and has no code path that could award the rating.
*/

const RATING_AXES: Array<{
  axis: string;
  /** Steps for a 1-mark rating. */
  single: [string, string, string];
  /** Steps for a 2-mark rating. */
  pair: [string, string, string];
}> = [
  {
    axis: "How precisely the idea is defined",
    single: [
      "The definition is missing or describes something else",
      "The definition is recognisable but incomplete or loose",
      "The definition is correct and precise in its own terms",
    ],
    pair: [
      "Several terms are confused, or the definition contradicts itself",
      "The core idea is right but a qualifier or boundary is missing",
      "Correct, complete, and says what the term excludes as well as what it is",
    ],
  },
  {
    axis: "How well the example is applied",
    single: [
      "The example is not tied to the concept",
      "The example is related but the connection is left for the reader",
      "The example makes the connection explicit and shows the effect",
    ],
    pair: [
      "The example restates the definition rather than using it",
      "The example is correctly applied but stops short of the consequence",
      "The example is applied precisely and the resulting effect is shown",
    ],
  },
  {
    axis: "How clearly the chain of reasoning is laid out",
    single: [
      "The answer asserts a conclusion with nothing connecting it to the idea",
      "There is a connection, but a step in the reasoning is left implicit",
      "Every step is visible and a reader could follow it without guessing",
    ],
    pair: [
      "Reasons are listed without being connected",
      "The reasoning is connected but one link is unexplained",
      "The reasoning is connected throughout and each link is explained",
    ],
  },
];

function rating(axis: (typeof RATING_AXES)[number], marks: 1 | 2): RatingScale {
  const steps = marks === 1 ? axis.single : axis.pair;
  return {
    axis: axis.axis,
    totalMarks: marks,
    // Ascending, so the last entry is the top step and carries the most marks.
    levels: steps.map((descriptor, i) => ({
      level: i + 1,
      label: i === 0 ? "Not shown" : i === 1 ? "Partly shown" : "Fully shown",
      descriptor,
      // A 1-mark rating cannot pay out fractions, so the top two steps share the
      // mark and differ only in the feedback the learner reads. Paying 0.5 for
      // "partly shown" would imply a resolution the mark does not have.
      marks: i === 0 ? 0 : marks === 1 ? 1 : i === 1 ? 1 : 2,
    })),
  };
}

function ratedQuestion(
  chapter: Chapter,
  opts: {
    key: string;
    base: number;
    span: number;
    term: string;
    definition: string;
    /** Terms whose presence earns the factual mark. */
    keywords: string[];
    /** The rating half, and what it is worth. */
    axis: (typeof RATING_AXES)[number];
    ratingMarks: 1 | 2;
    /**
     * Whether a second, non-automatic point is added.
     *
     * This is what makes the two sizes. Without it, one factual mark plus a rating
     * is three marks whichever way the rating is weighted, so every item would come
     * out the same size and the 2-mark shape would not exist.
     */
    withSecondPoint: boolean;
    /** The learner's own definition, set against their rating. */
    promptLead: string;
  },
): Generator {
  const scale = rating(opts.axis, opts.ratingMarks);
  const ratingTotal = opts.ratingMarks === 1 ? 1 : opts.ratingMarks;

  const points: MarkScheme["points"] = [
    {
      label: `Define ${opts.term}`,
      detail: `The definition states what ${opts.term} is: ${opts.definition}`,
      marks: 1,
      /*
        Auto-markable because the evidence is written down. Without `auto` this
        point would default to untrusted and stay with the learner, which is the
        behaviour every other extended point has.
      */
      auto: { keywords: opts.keywords },
    },
  ];

  if (opts.withSecondPoint) {
    points.push({
      label: `Give a consequence for ${opts.term}`,
      /*
        Deliberately not automatic. Judging whether the consequence follows from
        the definition is reasoning rather than recall, so this is one of the marks
        the learner keeps even when the rest can be checked.
      */
      detail: `The answer goes past the definition and says what follows from it in this context.`,
      marks: 1,
    });
  }

  const pointMarks = points.reduce((s, p) => s + p.marks, 0);
  const total = pointMarks + ratingTotal;

  const scheme: MarkScheme = {
    command: "explain",
    points,
    totalMarks: pointMarks,
    rating: scale,
    availableMarks: total,
    guidance:
      `Write your answer, then rate how well you did it. The ${pointMarks} point${
        pointMarks === 1 ? " is" : "s are"
      } awarded against the scheme, and the ${ratingTotal} for ${opts.axis.axis.toLowerCase()} are your own judgement.`,
  };

  return {
    key: opts.key,
    base: opts.base,
    span: opts.span,
    build: () => ({
      prompt: `${opts.promptLead} Explain **${opts.term}**.`,
      answer: opts.definition,
      marks: total,
      format: { kind: "extended" as const, scheme },
      solution: [
        step("What earns the factual mark", opts.definition),
        step(
          "How the rating works",
          `Read your own answer and pick the step that describes it. Only the top step earns the full rating.`,
        ),
      ],
      takeaway: `A definition states what a term is; a consequence says what follows from it.`,
      /*
        Still self-assessed overall. The rating is a judgement, so the model
        discounts this the same as a full essay, which is why the factual half
        being exact does not make the item verified.
      */
      assessesMastery: true,
    }),
  };
}

/**
 * Build a rated generator per chapter, using that chapter's own terms.
 *
 * Deriving the keywords from the authored term keeps the marking evidence and
 * the knowledge base from drifting apart: a change to a definition changes what
 * the app looks for, without anyone editing a second list by hand.
 */
function generatorsForChapter(chapter: Chapter): Generator[] {
  const terms = chapter.knowledge?.terms ?? [];
  if (terms.length === 0) return [];

  return terms.slice(0, 6).map((term, i) => {
    const axis = RATING_AXES[i % RATING_AXES.length]!;
    // Alternate the two shapes so both a 2-mark and a 3-mark item get served.
    const withSecondPoint = i % 2 === 0;
    // First content words of the definition, which is the substance of it.
    const keywords = term.definition
      .split(/[^A-Za-z0-9\s-]+/)
      .filter((w) => w.length > 3 && !/^(the|and|that|with|which|this|from|into|when|than|they|their|there)$/i.test(w))
      .slice(0, 2)
      .map((w) => w.toLowerCase());

    return ratedQuestion(chapter, {
      key: `rated-explain-${chapter.id}-${term.term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      base: -0.2 + (i % 3) * 0.35,
      span: 1.1,
      term: term.term,
      definition: term.definition,
      keywords: keywords.length > 0 ? keywords : [term.term.toLowerCase()],
      axis,
      ratingMarks: 1,
      withSecondPoint,
      promptLead: "Answer in two or three sentences.",
    });
  });
}

const chapters = SUBJECT_ORDER.flatMap((subject) => getChapters(subject));

/*
  Registered one chapter at a time. registerGenerators takes a list of ids and one
  shared generator list, so passing every id at once would attach Economics
  questions to the Maths chapters.
*/
for (const chapter of chapters) {
  const gens = generatorsForChapter(chapter);
  if (gens.length > 0) registerGenerators([chapter.id], gens);
}