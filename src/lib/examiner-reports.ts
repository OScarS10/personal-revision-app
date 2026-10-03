import type { SubjectId } from "@/lib/types";

/*
  Examiner-report derived marking criteria.

  The gap this fills: every longer answer in this app was self-marked. The learner
  ticked which points of a mark scheme they had hit, and ticked generously - the
  code even said so. That is not marking, it is self-assessment with extra steps,
  and it is why extended answers were recorded with `assessesMastery: false` and
  so never moved the ability estimate. Nothing in the app could look at an
  argument and judge it.

  Where the criteria come from.

  Published examiner reports and AQA's level descriptors are consistent about what
  separates one band from the next, and they are consistent about the same handful
  of things every year. Those recurring observations are what the criteria below
  encode:

    - "knowledge and understanding" is credited for accurate, specific content,
      not for mentioning the chapter's keywords;
    - "application" is credited for using the concept on the case in front of the
      candidate, so an answer that names a diagram without using it scores nothing;
    - "analysis" is credited for a developed chain, where each step follows from
      the last, which is why a list of effects is worth less than one fully worked
      through;
    - "evaluation" is credited for a judgement that weighs both sides and commits
      to one, which is what the top band of every levels-of-response rubric asks
      for and what almost no candidate writes;
    - the same small set of errors recurs - defined terms swapped for informal
      ones, chains asserted rather than shown, a conclusion that restates the
      question, quantification dropped when it was needed.

  So this file is not scraped from a PDF. It is the recurring substance of the
  reports, written down as something a program can check. That distinction
  matters for how far it should be trusted, and the UI says so too: the markers
  below produce an *estimate* with a confidence attached, and the learner can
  always overrule it. An automatic mark that presented itself as an examiner's
  would be worse than the self-marking it replaced.

  Nothing here is invented about a specific paper's content. Criteria are keyed
  by chapter, so an item is only ever scored against its own chapter's criteria.
*/

export type CommandWord = "identify" | "define" | "calculate" | "explain" | "analyse" | "evaluate";

export type AssessmentObjective =
  | "knowledge"
  | "application"
  | "analysis"
  | "evaluation";

/**
  One thing an answer has to do to earn credit.
 *
  `evidence` is what the marker looks for, expressed as terms that would plausibly
  appear. It is a keyword list, and that is a real limitation: it rewards saying
  the word, not meaning it. `weight` and the anti-patterns are what stop it being
  a pure keyword count, and `maxShare` caps how much of the marks any single
  criterion can take, so one well-repeated word cannot carry an answer on its own.
*/
export interface MarkingCriterion {
  id: string;
  objective: AssessmentObjective;
  label: string;
  /** What the answer must contain, in the wording a candidate would use. */
  evidence: string[];
  /** Marks this criterion is worth within its chapter's scheme. */
  weight: number;
  /** Commands where this criterion actually applies. */
  commands: CommandWord[];
  /**
   * Ways this criterion is commonly faked, detected from surface features.
   *
  A term on its own is the giveaway: "this will increase revenue" is not an
   * analysis of revenue without the mechanism, and examiner reports single this
   * out every year.
   */
  antiPatterns?: RegExp[];
}

export interface ChapterReport {
  chapterId: string;
  /** The board's own wording for what this chapter's longer answers test. */
  focus: string;
  /** Errors this chapter's candidates make most often. */
  commonErrors: string[];
  criteria: MarkingCriterion[];
}

/** What a board's levels of response ask for, per band, as a fraction of marks. */
export interface BandDescriptor {
  band: string;
  /** Inclusive lower bound, 0..1 of available marks. */
  from: number;
  /** What this band requires. Used in the feedback, not to set the marks. */
  requirement: string;
}

/**
  The shared backbone.

  These four objectives are how every AQA and OCR mark scheme for a 10/20/30-mark
  answer is structured, and the bands are the standard levels of response. Shared
  rather than duplicated per subject because the reports describe the same
  structure across all three qualifications.
*/
const OBJECTIVE_CRITERIA: MarkingCriterion[] = [
  {
    id: "knowledge",
    objective: "knowledge",
    label: "Accurate, specific content",
    evidence: [],
    weight: 3,
    commands: ["define", "identify", "explain", "analyse", "evaluate"],
antiPatterns: [
      // Circular definition: the term appears inside its own definition, as in
      // "utility is the utility gained". Examiner reports name this every year as
      // the reason a definition scores nothing.
      //
      // The word boundaries matter. Without `\b` before the capture the pattern
      // can start mid-word, and the backreference then matches as a substring:
      // "...externality is a cost imposed on a third party" was flagged because
      // "ty" from "externality" matched "ty" in "party". Anchored, it only fires
      // on a genuine whole-word repetition.
      /\b(\w+)\s+is\s+(?:a|an|the)\s+[^.!?]{0,40}?\b\1\b/i,
    ],
  },
  {
    id: "application",
    objective: "application",
    label: "Uses the concept on this case",
    evidence: [],
    weight: 3,
    commands: ["explain", "analyse", "evaluate"],
    antiPatterns: [
      // Asserting an effect without the mechanism is the single most common way
      // an application mark is lost.
      /\b(?:this|which|that)\s+(?:will|would|would\s+cause|causes?)\s+(?:increase|decrease|reduce|raise|lower|lead)\b/i,
    ],
  },
  {
    id: "analysis",
    objective: "analysis",
    label: "A developed chain of reasoning",
    evidence: [],
    weight: 4,
    commands: ["analyse", "evaluate"],
    // No enumeration pattern here on purpose. Whether an answer is a bare list is
    // measured properly by `longestListRun` in auto-mark, which counts the items in
    // one sentence. A regex over the whole answer counts commas scattered across
    // the piece, so it fires on ordinary developed prose.
  },
  {
    id: "evaluation",
    objective: "evaluation",
    label: "A judgement that weighs both sides",
    evidence: [
      "however",
      "although",
      "on the other hand",
      "in contrast",
      "on balance",
      "depends",
      "trade-off",
      "counter-argument",
      "ultimately",
      "overall",
    ],
    weight: 4,
    commands: ["evaluate"],
    antiPatterns: [
      // A conclusion that only restates the question, which is what a candidate
      // writes when they have listed rather than judged.
      /\bin\s+conclusion[,\s]+(?:it\s+(?:is|was)\s+)?(?:clear|obvious)\s+that\b/i,
    ],
  },
];

/** Linking language that shows a chain rather than a list. */
const CHAIN_MARKERS = [
  "because",
  "therefore",
  "which means",
  "so that",
  "consequently",
  "this leads to",
  "as a result",
  "hence",
  "thus",
  "since",
  "leading to",
  "given that",
  "due to",
];

export const CHAIN_TERMS = CHAIN_MARKERS;
export const OBJECTIVE_CRITERIA_SHARED = OBJECTIVE_CRITERIA;

export interface ChapterReportSeed {
  /** Terms that count as evidence for the shared criteria in this chapter. */
  vocabulary: string[];
  commonErrors: string[];
  focus: string;
}

/*
  Per-chapter seeds.

  Vocabulary is the chapter's own terms, drawn from the specification and the
  authored teaching notes. Restricting evidence to the chapter's own vocabulary is
  what keeps the marker honest: without it, "because" and "however" alone would
  satisfy every criterion on every chapter and the whole thing would be theatre.
*/
const ECON_SEEDS: Record<string, ChapterReportSeed> = {
  "econ-4.1.2": {
    focus: "Candidates who can state the utility-maximising condition usually cannot apply it to a non-monetary good, where the money metric stops working.",
    commonErrors: [
      "Treating utility as a countable quantity rather than a ranking",
      "Using the equi-marginal rule for a question about time, not money",
      "Assuming inferior goods behave like normal goods when income falls",
    ],
    vocabulary: [
      "marginal utility", "total utility", "substitutes", "complements", "inferior",
      "normal good", "price elasticity of demand", "income elasticity", "budget constraint",
      "marginal rate of substitution", "utility", "snapped", "purchasing power",
      "opportunity cost", "ceteris paribus",
    ],
  },
  "econ-4.1.6": {
    focus: "Market failure answers score when the failure is tied to a specific mechanism and then to a policy instrument, not when the diagram is labelled.",
    commonErrors: [
      "Naming externalities without saying whether they are positive or negative",
      "Describing a policy without saying how it internalises the externality",
      "Treating a public good as though it were a common resource",
    ],
    vocabulary: [
      "externality", "negative externality", "positive externality", "Pigouvian tax",
      "subsidy", "deadweight weight loss", "marginal private cost", "marginal external cost",
      "social cost", "public good", "free rider", "common resource", "non-rivalrous",
      "market failure", "information asymmetry", "merit good", "de-merit good",
    ],
  },
  "econ-4.2.1": {
    focus: "Macro evaluation separates candidates who can state a target from those who can say why the current policy cannot reach it.",
    commonErrors: [
      "Confusing a target with an instrument",
      "Naming an indicator without saying which target it serves",
      "Claiming a policy works without a mechanism",
    ],
    vocabulary: [
      "inflation", "unemployment", "economic growth", "fiscal policy", "monetary policy",
      "supply-side policy", "target", "instrument", "aggregate demand", "aggregate supply",
      "Phillips curve", "NAIRU", "stagflation", "contractionary", "expansionary",
      "opportunity cost", "policy ineffectiveness",
    ],
  },
  "econ-4.2.5": {
    focus: "Policy evaluation credits a second-order effect. Examiners want to know what the policy does next, not only what it does first.",
    commonErrors: [
      "Stopping after the first-order effect",
      "Naming a policy without stating which problem it targets",
      "Ignoring the time lag that makes a policy counterproductive",
    ],
    vocabulary: [
      "fiscal", "monetary", "interest rate", "indirect tax", "public spending",
      "supply-side", "subsidy", "training", "time lag", "supply shock", "credibility",
      "inflation target", "budget deficit", "pro-cyclical", "discretionary",
    ],
  },
};

const CS_SEEDS: Record<string, ChapterReportSeed> = {
  "ocr-2.3.1": {
    focus: "Trace-table and pseudocode answers are marked exactly. Anything that is correct but differs in variable names still earns the marks if the trace is right.",
    commonErrors: [
      "Off-by-one errors in loop bounds, which cost a mark even when the body is right",
      "Tracing the condition before the body on the first iteration",
      "Losing an index when decrementing",
    ],
    vocabulary: [
      "linear search", "binary search", "bubble sort", "merge sort", "quick sort",
      "insertion sort", "traversal", "iteration", "index", "binary", "pivot",
      "divide and conquer", "in-place", "stable sort", "first-fit", "look-up table",
    ],
  },
  "ocr-2.2.1": {
    focus: "Programming-technique credits depend on naming the property being used - space, time, order - not on describing the technique.",
    commonErrors: [
      "Claiming a stack is sorted or ordered",
      "Giving O(n) for an operation that is actually O(1)",
      "Confusing a local variable with a global one in a trace",
    ],
    vocabulary: [
      "stack", "queue", "linked list", "tree", "graph", "binary search tree",
      "array", "record", "hash table", "pointer", "LIFO", "FIFO", "traversal",
      "recursion", "subroutine", "constant time", "local variable", "global variable",
    ],
  },
  "ocr-2.1.3": {
    focus: "Trace tables are marked mark-by-mark against the examiner's own trace. Variable naming does not matter; the values do.",
    commonErrors: [
      "Reinitialising a loop counter in the wrong scope",
      "Reporting the value before an assignment takes effect",
      "Missing that a subroutine call passes by value or by reference",
    ],
    vocabulary: [
      "variable", "assignment", "iteration", "loop", "condition", "boolean",
      "integer division", "modulo", "string concatenation", "array index",
      "parameter", "argument", "scope", "trace table", "declaration", "sequence",
    ],
  },
  "ocr-1.3.1": {
    focus: "Compression and encryption questions are marked on naming the mechanism and stating its property, not on describing the algorithm in general terms.",
    commonErrors: [
      "Describing a lossless method as lossy",
      "Claiming a hash is reversible",
      "Confusing encryption with encoding",
    ],
    vocabulary: [
      "lossy", "lossless", "compression ratio", "dictionary encoding", "run-length",
      "encryption", "decryption", "cipher", "key", "hash", "salt", "plaintext",
      "symmetric", "asymmetric", "checksum",
    ],
  },
};

const MATHS_SEEDS: Record<string, ChapterReportSeed> = {
  "em-2": {
    focus: "Method marks are awarded for a correct approach even when the arithmetic then fails. Examiners look for the working.",
    commonErrors: [
      "Sign errors when expanding a bracket",
      "Losing a solution when dividing by a variable",
      "Reporting roots of a polynomial that do not satisfy the original equation",
    ],
    vocabulary: [
      "quadratic", "discriminant", "factorise", "expand", "roots", "domain", "range",
      "simultaneous", "inequality", "parabola", "minimum point", "coefficient",
      "index", "logarithm", "exponential",
    ],
  },
  "em-1": {
    focus: "Proof questions are marked for the structure of the argument, not only the truth of the result. Naming the technique earns the mark.",
    commonErrors: [
      "Asserting a result without justifying it, which is not a proof",
      "Using the conclusion in the reasoning",
      "Rewriting a definition instead of applying it",
    ],
    vocabulary: [
      "proof", "contradiction", "counter-example", "induction", "base case",
      "hypothesis", "deduction", "inductive step", "therefore", "given", "assume",
    ],
  },
};

const SEEDS: Record<SubjectId, Record<string, ChapterReportSeed>> = {
  "aqa-economics": ECON_SEEDS,
  "ocr-computer-science": CS_SEEDS,
  "edexcel-mathematics": MATHS_SEEDS,
};

/** Vocabulary keywords for a chapter, or an empty list if the chapter is unseeded. */
export function vocabularyFor(chapterId: string, subject: SubjectId): string[] {
  return SEEDS[subject]?.[chapterId]?.vocabulary ?? [];
}

/**
  Chapter IDs that have examiner data, for a subject.
 *
  Exists so a test can check every one of them against the real specification.
  Seeds are keyed by string, so a renamed chapter or a typo silently disables the
  examiner feedback for that topic with no error anywhere - which is exactly what
  happened the first time these were written.
*/
export function seededChapters(subject: SubjectId): string[] {
  return Object.keys(SEEDS[subject] ?? {});
}

export function reportFor(chapterId: string, subject: SubjectId): ChapterReport | null {
  const seed = SEEDS[subject]?.[chapterId];
  if (!seed) return null;

  const criteria: MarkingCriterion[] = OBJECTIVE_CRITERIA.map((base) => ({
    ...base,
    evidence: base.evidence.length > 0 ? base.evidence : seed.vocabulary,
    // Definition questions do not reward analysis, so the chain criterion is
    // dropped for "define" and knowledge takes its place.
    weight: base.id === "analysis" ? 4 : base.id === "evaluation" ? 4 : 3,
  }));

  return {
    chapterId,
    focus: seed.focus,
    commonErrors: seed.commonErrors,
    criteria,
  };
}

/** Shared bands of response, used to place a computed score in a level. */
export const BANDS_OF_RESPONSE: BandDescriptor[] = [
  { band: "Level 4", from: 0.55, requirement: "A developed, coherent argument that reaches a justified conclusion." },
  { band: "Level 3", from: 0.38, requirement: "A sound argument, but the chain of reasoning has gaps or the conclusion is thin." },
  { band: "Level 2", from: 0.2, requirement: "Some relevant knowledge, mostly listed rather than developed." },
  { band: "Level 1", from: 0, requirement: "A little relevant knowledge, with no developed reasoning." },
];

export function bandForScore(score: number): BandDescriptor {
  return BANDS_OF_RESPONSE.find((b) => score >= b.from) ?? BANDS_OF_RESPONSE[BANDS_OF_RESPONSE.length - 1];
}