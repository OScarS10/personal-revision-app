import { clamp, round } from "@/lib/math-utils";
import {
  bandForScore,
  reportFor,
  CHAIN_TERMS,
  type AssessmentObjective,
  type ChapterReport,
} from "@/lib/examiner-reports";
import type { LevelDescriptor, MarkScheme, MarkSchemePoint, SubjectId } from "@/lib/types";

/*
  Automatic marking for longer answers.

  What this is, precisely.

  A deterministic rubric engine over the learner's own text, scored against the
  mark scheme's own points and the examiner-report criteria, with an online bias
  correction learned from how well the learner's self-marking agrees with it.

  What this is not, and it matters:

  It is not a trained model, and there was no dataset. Nothing here was fitted to
  graded candidates' scripts, because no such corpus exists in this repo and
  examiner scripts are not published. "Learn from examiner reports" in the
  original request is implemented as *encoding* what those reports say
  repeatedly - which is what `examiner-reports.ts` holds - not as fitting to them.

  A keyword engine fails in one specific way: it rewards saying the word rather
  than meaning it. Every design decision below blunts that, and `confidence`
  exists so the UI can admit when the engine has no idea. An automatic mark
  presented as an examiner's would be worse than the generous self-marking it
  replaces, so the result is always an estimate, always shown next to the
  learner's own mark, and always overridable.
*/

type Command = "define" | "identify" | "calculate" | "explain" | "analyse" | "evaluate";

function commandOf(scheme: MarkScheme): Command {
  const c = scheme.command.toLowerCase();
  if (c.startsWith("eval")) return "evaluate";
  if (c.startsWith("analy")) return "analyse";
  if (c.startsWith("explain") || c.startsWith("discuss")) return "explain";
  if (c.startsWith("calc") || c.startsWith("show that")) return "calculate";
  if (c.startsWith("define")) return "define";
  if (c.startsWith("state") || c.startsWith("identify")) return "identify";
  return "explain";
}

/* -------------------------------------------------------------------------
   Lexical matching
   ------------------------------------------------------------------------- */

const STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "they", "their", "there", "which",
  "would", "could", "should", "when", "what", "will", "been", "were", "into", "than",
  "then", "these", "those", "have", "has", "had", "but", "not", "you", "your", "are",
  "was", "its", "his", "her", "them", "such", "also", "more", "most", "some", "each",
  "other", "over", "under", "about", "because", "does", "doing", "make", "made", "can",
]);

function contentTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** Proportion of a point's content terms that appear in the response. */
function evidenceRatio(point: MarkSchemePoint, haystack: string): number {
  const terms = contentTerms(`${point.label} ${point.detail}`);
  if (terms.length === 0) return 0;
  return terms.filter((t) => haystack.includes(t)).length / terms.length;
}

/**
  A point counts as evidenced at this ratio.

  0.6 of a point's terms appearing is real signal that the point was addressed;
  below that is more likely coincidental vocabulary overlap between the scheme and
  an answer that happens to share a couple of words.
*/
const EVIDENCE_THRESHOLD = 0.6;

/* -------------------------------------------------------------------------
   Surface features
   ------------------------------------------------------------------------- */

export interface SurfaceFeatures {
  text: string;
  /** Linking words found. A list of effects has none; a chain does. */
  chains: string[];
  counterclaims: string[];
  sentences: number;
  /** Longest run of items in a bare comma/semicolon list. */
  longestListRun: number;
  /** Terms used four or more times: a repetition habit in place of development. */
  repeatedTerms: string[];
}

const COUNTERCLAIM_TERMS = [
  "however", "although", "on the other hand", "in contrast", "nevertheless",
  "on balance", "altogether", "ultimately", "overall", "depends", "trade-off",
  "trade off", "counter-argument", "conversely", "whereas", "despite", "admittedly",
  "it is arguable",
];

const EVALUATION_TERMS = [
  ...COUNTERCLAIM_TERMS,
  "depends on", "significant", "the extent", "proportion of", "on the assumption",
];

export function analyseSurface(response: string): SurfaceFeatures {
  const text = response.toLowerCase();

  const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  /*
    How enumerated a single sentence is: the number of comma or semicolon
    separated segments it contains.

    Counting words *within* a segment was wrong here - "costs, prices, wages" has
    one word per segment, so it always measured 1 and never detected a bare list
    at all. What separates a list from prose is how many items a sentence strings
    together, so that is what gets counted.
  */
  let longestListRun = 0;
  for (const sentence of sentences) {
    const segments = sentence.split(/[,;]/).filter((s) => s.trim().length > 0);
    longestListRun = Math.max(longestListRun, segments.length);
  }

  const counts = new Map<string, number>();
  for (const t of contentTerms(response)) counts.set(t, (counts.get(t) ?? 0) + 1);
  const repeatedTerms = [...counts.entries()].filter(([, n]) => n >= 4).map(([t]) => t);

  const chains: string[] = CHAIN_TERMS.filter((t) => text.includes(t));
  const counterclaims: string[] = COUNTERCLAIM_TERMS.filter((t) => text.includes(t));

  return {
    text,
    chains,
    counterclaims,
    sentences: sentences.length,
    longestListRun,
    repeatedTerms,
  };
}

/* -------------------------------------------------------------------------
   Objective scoring
   ------------------------------------------------------------------------- */

export interface ObjectiveResult {
  objective: AssessmentObjective;
  /** 0..1 credit against this objective. */
  credit: number;
  note: string;
}

/** Objectives that earn marks for a command word, and their share of them. */
const OBJECTIVE_WEIGHTS: Record<Command, Array<[AssessmentObjective, number]>> = {
  define: [["knowledge", 0.7], ["application", 0.3]],
  identify: [["knowledge", 1]],
  calculate: [["knowledge", 0.4], ["application", 0.6]],
  explain: [["knowledge", 0.45], ["application", 0.3], ["analysis", 0.25]],
  analyse: [["knowledge", 0.3], ["application", 0.2], ["analysis", 0.5]],
  evaluate: [
    ["knowledge", 0.2],
    ["application", 0.2],
    ["analysis", 0.3],
    ["evaluation", 0.3],
  ],
};

export const COMMAND_OBJECTIVES = OBJECTIVE_WEIGHTS;

/**
  Credit per objective, 0..1.

  This is where the anti-patterns earn their keep. Knowledge depends on the
  chapter's own vocabulary actually appearing; analysis needs linking language and
  is capped hard by list shape, because examiner reports are consistent that a
  listed answer cannot reach the top band however good the content is; evaluation
  needs a countersignal and a commitment.
*/
function scoreObjectives(
  command: Command,
  report: ChapterReport | null,
  features: SurfaceFeatures,
): ObjectiveResult[] {
  const vocab = report?.criteria.find((c) => c.id === "knowledge")?.evidence ?? [];
  const evalTerms =
    report?.criteria.find((c) => c.id === "evaluation")?.evidence ?? EVALUATION_TERMS;

  const vocabHits = vocab.filter((t) => features.text.includes(t)).length;
  const vocabCoverage = vocab.length > 0 ? vocabHits / vocab.length : 0;

  const chainScore = clamp(features.chains.length / 4, 0, 1);
  const listCap =
    features.longestListRun >= 12 ? 0.6 : features.longestListRun >= 8 ? 0.85 : 1;
  const evalHits = evalTerms.filter((t) => features.text.includes(t)).length;
  const evalScore = clamp(evalHits / 3, 0, 1);

  return OBJECTIVE_WEIGHTS[command].map(([objective, share]) => {
    let credit = 0;
    let note = "";

    switch (objective) {
      case "knowledge":
        credit = clamp(vocabCoverage * 1.6, 0, 1);
        note =
          vocab.length === 0
            ? "No chapter vocabulary is stored, so knowledge credit is based on the mark scheme only."
            : vocabHits === 0
              ? `None of this chapter's ${vocab.length} key terms appeared, so there was nothing specific to credit.`
              : `${vocabHits} of ${vocab.length} key terms for this chapter appeared.`;
        break;
      case "application":
        credit = clamp(chainScore * 0.7 + vocabCoverage * 0.3, 0, 1);
        note =
          chainScore === 0
            ? "No linking language, so the content reads as a list rather than being applied to the case."
            : "The content is applied to the case rather than left as general knowledge.";
        break;
      case "analysis": {
        credit = clamp(chainScore * listCap, 0, 1);
        note =
          chainScore === 0
            ? "No 'because', 'therefore' or 'leads to' anywhere: listed, not analysed."
            : listCap < 1
              ? `A ${features.longestListRun}-item list was detected, which caps development.`
              : "The reasoning is developed rather than listed.";
        break;
      }
      case "evaluation":
        credit = clamp(evalScore + (features.counterclaims.length > 0 ? 0.15 : 0), 0, 1);
        note =
          evalScore === 0
            ? "No other side and no judgement language, so the top band is out of reach however good the analysis is."
            : "The answer weighs alternatives and commits to a judgement.";
        break;
    }

    return { objective, credit: round(credit, 4), note, share } as ObjectiveResult & { share: number };
  });
}

/* -------------------------------------------------------------------------
   Calibration
   ------------------------------------------------------------------------- */

export interface Calibration {
  /** Answers seen. Below `MIN_SAMPLES_FOR_BIAS` the bias is not applied at all. */
  samples: number;
  /**
   * Running average of (selfMark - estimate).

  Positive means the learner credits themselves more than the engine does, so the
  engine is running harsh for this person and its estimate is eased upward. This is
  the "scale the model to the learner" behaviour: it corrects for one person's
  vocabulary and answer style instead of pretending the engine's raw output is
  truth. Negative means the engine is too generous for them.
  */
  bias: number;
  /** Rolling mean absolute disagreement, 0..1. Drives confidence. */
  disagreement: number;
}

export const CALIBRATION_FLOOR: Calibration = { samples: 0, bias: 0, disagreement: 0 };

const MIN_SAMPLES_FOR_BIAS = 5;

/** Small, because each sample is one answer, not a dataset. */
const LEARNING_RATE = 0.25;

/** Bounds on how far the bias may move, so one odd answer cannot dominate. */
const MAX_BIAS = 0.25;

/**
  Fold one self-mark comparison into the calibration.

  The learner's self-mark is a noisy label on their own standard, not ground
  truth: it is the only comparison signal available, and generous self-marking was
  the original problem being fixed.
*/
export function updateCalibration(
  prev: Calibration,
  estimate: number,
  selfMark: number,
): Calibration {
  const delta = clamp(selfMark, 0, 1) - estimate;
  const samples = prev.samples + 1;
  return {
    samples,
    bias: round(prev.bias + (LEARNING_RATE * delta - prev.bias) / samples, 4),
    disagreement: round(prev.disagreement + (Math.abs(delta) - prev.disagreement) / samples, 4),
  };
}

/** Bias actually applied: nothing until there is enough evidence for one. */
export function appliedBias(cal: Calibration): number {
  if (cal.samples < MIN_SAMPLES_FOR_BIAS) return 0;
  return clamp(cal.bias, -MAX_BIAS, MAX_BIAS);
}

/**
  Confidence in the estimate, 0..1.

  Falls with disagreement between the engine and the learner's judgement, rises
  with sample count, and drops for short answers and unseeded chapters, because a
  two-word answer yields a confident-looking zero that means nothing.
*/
function confidenceFor(base: number, cal: Calibration, wordCount: number, seeded: boolean): number {
  const lengthFactor = clamp(wordCount / 60, 0.15, 1);
  const sampleFactor = clamp(cal.samples / 12, 0.5, 1);
  const agreementFactor = clamp(1 - cal.disagreement * 1.5, 0.3, 1);
  return round(clamp(base * lengthFactor * sampleFactor * agreementFactor * (seeded ? 1 : 0.6), 0, 1), 3);
}

export interface CalibrationSummary {
  samples: number;
  bias: number;
  direction: "calibrating" | "harsh" | "lenient" | "agreeing";
  disagreement: number;
  message: string;
}

export function calibrationSummary(cal: Calibration): CalibrationSummary {
  const bias = appliedBias(cal);

  if (cal.samples < MIN_SAMPLES_FOR_BIAS) {
    const remaining = MIN_SAMPLES_FOR_BIAS - cal.samples;
    return {
      samples: cal.samples,
      bias: 0,
      direction: "calibrating",
      disagreement: cal.disagreement,
      message: `Still learning your standard: ${remaining} more extended answer${remaining === 1 ? "" : "s"} before it adjusts to you.`,
    };
  }

  if (cal.disagreement < 0.12) {
    return {
      samples: cal.samples,
      bias,
      direction: "agreeing",
      disagreement: cal.disagreement,
      message: `Your self-marking and the automatic mark agree closely (${Math.round(cal.disagreement * 100)}% average difference), so the estimate can be trusted.`,
    };
  }

  return {
    samples: cal.samples,
    bias,
    direction: bias > 0.02 ? "harsh" : bias < -0.02 ? "lenient" : "calibrating",
    disagreement: cal.disagreement,
    message:
      bias > 0.02
        ? `You generally credit yourself more than the marker does, so its estimate has been relaxed by ${Math.round(bias * 100)}% to match your standard.`
        : bias < -0.02
          ? `You generally credit yourself less than the marker does, so its estimate has been tightened by ${Math.round(-bias * 100)}% to match your standard.`
          : `You and the marker broadly agree, but differ by ${Math.round(cal.disagreement * 100)}% on individual answers.`,
  };
}

/* -------------------------------------------------------------------------
   Entry point
   ------------------------------------------------------------------------- */

export interface PointVerdict {
  index: number;
  point: MarkSchemePoint;
  /** 0..1 of the point's content terms found in the response. */
  coverage: number;
  evidenced: boolean;
  marks: number;
}

export interface AutoMarkResult {
  /** Marks before the learned bias, on the scheme's own scale. */
  rawMarks: number;
  /** `rawMarks` as a fraction, before calibration. */
  rawScore: number;
  /** `rawScore` with the learned bias applied. This is the headline figure. */
  estimate: number;
  /** Marks implied by `estimate`. Always consistent with it. */
  estimatedMarks: number;
  totalMarks: number;
  /** 0..1 confidence in the estimate. */
  confidence: number;
  band: string;
  bandRequirement: string;
  objectives: ObjectiveResult[];
  points: PointVerdict[];
  linksFound: number;
  linksAvailable: number;
  /** Mark-loser patterns detected, each of which cost the mark a penalty. */
  antiPatterns: AntiPatternHit[];
  feedback: string[];
  /** Why the estimate may be wrong, stated plainly rather than buried. */
  caveats: string[];
  unseeded: boolean;
  /** Calibration after folding in `selfMark`, for the caller to persist. */
  calibration: Calibration;
}

/**
  Estimate a mark for a written extended answer.

  `selfMark` is optional. When given it is the learner's own mark as a fraction and
  is folded into the returned calibration so the caller can persist it. It is
  never used to compute this result: the estimate comes from the text, and the
  self-mark only shifts *future* estimates.
*/
export function autoMarkExtended(
  response: string,
  scheme: MarkScheme,
  chapterId: string,
  subject: SubjectId,
  cal: Calibration = CALIBRATION_FLOOR,
  selfMark?: number,
  levels?: LevelDescriptor[],
): AutoMarkResult {
  const report = reportFor(chapterId, subject);
  const features = analyseSurface(response);
  const command = commandOf(scheme);
  const wordCount = response.trim().split(/\s+/).filter(Boolean).length;

  const points: PointVerdict[] = scheme.points.map((point, index) => {
    const coverage = evidenceRatio(point, features.text);
    const evidenced = coverage >= EVIDENCE_THRESHOLD;
    return { index, point, coverage: round(coverage, 3), evidenced, marks: evidenced ? point.marks : 0 };
  });

  const contentMarks = points.reduce((s, p) => s + p.marks, 0);

  // Link points are only earned when linking language is actually present, so
  // counting chain markers rather than claiming them is what stops a listed answer
  // from collecting the chain-of-reasoning bonus.
  const linksAvailable = scheme.points.filter((p) => p.isLink).length;
  const linksFound = Math.min(features.chains.length, linksAvailable);
  const linkBonus = linksFound * 0.5;

  const objectives = scoreObjectives(command, report, features);
  const objectiveCredit =
    objectives.length > 0 ? objectives.reduce((s, o) => s + o.credit, 0) / objectives.length : 1;

  const antiPatterns = detectAntiPatterns(response, report);

  /*
    Objectives act as a ceiling on the final mark, not as a separate pool of marks.
    An answer can cite every scheme point and still cap out low if it contains no
    reasoning at all, which is precisely how a levels-of-response rubric behaves
    and precisely what pure point-matching fails to capture.
  */
  const ceiling = 0.75 + 0.25 * objectiveCredit;
  const totalMarks = scheme.totalMarks;
  const penalty = antiPatterns.length * ANTI_PATTERN_PENALTY;
  const rawMarks = round(clamp((contentMarks + linkBonus) * ceiling - penalty * totalMarks, 0, totalMarks), 2);
  const rawScore = totalMarks > 0 ? round(rawMarks / totalMarks, 4) : 0;

  const estimate = round(clamp(rawScore + appliedBias(cal), 0, 1), 4);
  const estimatedMarks = round(clamp(estimate * totalMarks, 0, totalMarks), 2);

  const bandDescriptor = bandForScore(estimate);
  const levelBand = levels
    ? [...levels]
        .sort((a, b) => b.indicativeRange[0] - a.indicativeRange[0])
        .find((l) => estimate >= l.indicativeRange[0])
    : undefined;

  const caveats: string[] = [];
  if (wordCount < 25) {
    caveats.push(
      "The answer is very short, so this mark is unreliable. Most of an extended answer's marks come from development that lexical matching cannot see.",
    );
  }
  if (!report) {
    caveats.push(
      "No examiner-report criteria are stored for this chapter, so the mark comes from the scheme alone and is the weakest kind of estimate.",
    );
  }
  if (cal.disagreement > 0.2 && cal.samples >= MIN_SAMPLES_FOR_BIAS) {
    caveats.push(
      `Your self-marking has differed from this estimate by ${Math.round(cal.disagreement * 100)}% on average. Trust your own re-reading of the scheme over this number.`,
    );
  }

  return {
    rawMarks,
    rawScore,
    estimate,
    estimatedMarks,
    totalMarks,
    confidence: confidenceFor(wordCount === 0 ? 0 : 0.9, cal, wordCount, report !== null),
    band: levelBand ? `Level ${levelBand.level}` : bandDescriptor.band,
    bandRequirement: levelBand ? levelBand.descriptor : bandDescriptor.requirement,
    objectives: objectives.map(({ objective, credit, note }) => ({ objective, credit, note })),
    points,
    linksFound,
    linksAvailable,
    feedback: buildFeedback(command, points, objectives, report, features, antiPatterns),
    antiPatterns,
    caveats,
    unseeded: report === null,
    calibration: selfMark === undefined ? cal : updateCalibration(cal, estimate, selfMark),
  };
}

function buildFeedback(
  command: Command,
  points: PointVerdict[],
  objectives: ObjectiveResult[],
  report: ChapterReport | null,
  features: SurfaceFeatures,
  antiPatterns: AntiPatternHit[],
): string[] {
  const out: string[] = [];

  const hit = points.filter((p) => p.evidenced);
  out.push(`${hit.length} of ${points.length} mark-scheme points look addressed by the text.`);

  for (const o of objectives.filter((x) => x.credit >= 0.6)) out.push(o.note);
  for (const o of objectives.filter((x) => x.credit < 0.4)) out.push(o.note);

  if (command === "evaluate" && features.counterclaims.length === 0) {
    out.push(
      "Examiner reports are consistent that an evaluation needs the other side stated, not just a conclusion. Add a 'however' sentence naming the strongest argument against, then say which side wins and why.",
    );
  }
  if (features.longestListRun >= 12) {
    out.push(
      "A long unbroken list was detected. AQA and OCR both cap a listed answer in the middle band whatever the content is, so break each item out and say what it causes.",
    );
  }
  if (features.repeatedTerms.length > 0) {
    out.push(
      `"${features.repeatedTerms[0]}" appears ${countOccurrences(features.text, features.repeatedTerms[0])}+ times. Repetition is not development; connect the terms instead.`,
    );
  }
  for (const hit of antiPatterns) {
    out.push(
      `"${hit.match}" tripped the ${hit.criterionId} check. Examiner reports name this as a routine mark-loser, so it costs ${
        Math.round(ANTI_PATTERN_PENALTY * 100)
      }% off the mark.`,
    );
  }
  if (report) {
    out.push(`Examiner focus for this chapter: ${report.focus}`);
    if (report.commonErrors.length > 0) {
      out.push(`Most common error here: ${report.commonErrors[0]}.`);
    }
  }
  return out;
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/* -------------------------------------------------------------------------
   Anti-patterns
   ------------------------------------------------------------------------- */

export interface AntiPatternHit {
  criterionId: string;
  /** The pattern as written, for the feedback. */
  pattern: RegExp;
  /** The snippet that tripped it, so the learner can see what they wrote. */
  match: string;
}

/**
  Detect the ways a criterion is commonly faked.

  These run against the criteria in `examiner-reports.ts`, which is what keeps
  them chapter-scoped rather than a generic list. A hit does not veto the
  criterion; it caps it, because a circular definition or an effect asserted
  without its mechanism still shows some knowledge - it just cannot score the
  application or analysis credit it was hoping for.
*/
export function detectAntiPatterns(
  response: string,
  report: ChapterReport | null,
): AntiPatternHit[] {
  if (!report) return [];
  const text = response.toLowerCase();
  const hits: AntiPatternHit[] = [];

  for (const criterion of report.criteria) {
    for (const pattern of criterion.antiPatterns ?? []) {
      // RegExp instances are shared module-level state; `lastIndex` must not leak
      // between answers, and these are all non-global so only the clone matters.
      const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      const m = re.exec(text);
      if (m) {
        hits.push({ criterionId: criterion.id, pattern, match: m[0].trim() });
      }
    }
  }
  return hits;
}

/** How much a single anti-pattern hit costs, as a fraction of the final mark. */
const ANTI_PATTERN_PENALTY = 0.08;