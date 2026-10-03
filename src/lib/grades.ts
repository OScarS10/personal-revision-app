import type { SubjectId } from "@/lib/types";
import { clamp } from "@/lib/math-utils";

/*
  Grade boundaries, per subject.

  What this replaces: analytics.ts used to apply one invented table of cuts
  (A* at 0.87 of weighted mastery, A at 0.80, and so on) to every subject. That
  number described nothing real. AQA, Pearson and OCR all weight their papers
  differently, total their raw marks differently, and set boundaries off the
  *raw* mark on the paper rather than off a mastery estimate, so one table cannot
  describe three qualifications. Worse, it was silently authoritative: the Analysis
  page showed a letter grade with no indication that the threshold was invented.

  How the boundaries here should be read:

  The fractions below are indicative planning figures, not the boards' published
  boundaries. Boards set boundaries per series against live candidate
  performance, so they move year to year and only the board publishes an
  authoritative figure for a given year. These fractions are close to recent
  published boundaries for each qualification's overall mark, which is enough to
  turn a mock score into a defensible estimate and to show a learner where they
  stand - which is the job. They are not a prediction of the grade you will get,
  and `boundarySource` says so in the UI rather than letting a letter imply a
  certainty it does not have.

  Replace `PAPER_BOUNDARIES` entries with the published boundaries for your exam
  series when you have them; nothing else needs to change.
*/

export type Grade = "A*" | "A" | "B" | "C" | "D" | "E" | "U";

/** Grade bands, best first. The order is the display order everywhere. */
export const GRADE_ORDER: Grade[] = ["A*", "A", "B", "C", "D", "E", "U"];

/** The six lettered bands, best first. U is "unclassified", not a band. */
const LETTER_ORDER: Exclude<Grade, "U">[] = ["A*", "A", "B", "C", "D", "E"];

/** Marks each grade band needs on a paper, as a fraction of that paper's total. */
export type GradeBands = Record<Exclude<Grade, "U">, number>;

interface PaperBoundaries {
  /** Board paper code, e.g. "7136/1". */
  code: string;
  marks: number;
  /** Fraction of the A-level grade carried by this paper. */
  weighting: number;
  bands: GradeBands;
}

interface QualificationBoundaries {
  /** Total raw marks across all papers, coursework included. */
  totalMarks: number;
  bands: GradeBands;
  papers: PaperBoundaries[];
  /** How to describe these numbers to the learner. */
  boundarySource: string;
}

/**
  Indicative per-paper bands.
 *
  Economics papers are not interchangeable: Paper 3 is a 20-mark synoptic essay
  where a mark is worth far more judgement than a Paper 1 definition tick, so its
  bands sit higher than a naive split of the overall figure. Computer Science
  Paper 3 is coursework and is marked before the exam, so it behaves the same way.
*/
export const BOUNDARIES: Record<SubjectId, QualificationBoundaries> = {
  "aqa-economics": {
    totalMarks: 180,
    bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 },
    boundarySource: "Indicative AQA 7136 boundaries, as a fraction of 180 raw marks",
    papers: [
      {
        code: "7136/1",
        marks: 80,
        weighting: 35,
        bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 },
      },
      {
        code: "7136/2",
        marks: 80,
        weighting: 35,
        bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 },
      },
      {
        // Synoptic essay. Higher bands: a 20-mark essay is where the grade is
        // decided, so the top band needs real evaluation, not 16/20.
        code: "7136/3",
        marks: 20,
        weighting: 30,
        bands: { "A*": 0.85, A: 0.75, B: 0.65, C: 0.5, D: 0.35, E: 0.2 },
      },
    ],
  },
  "ocr-computer-science": {
    totalMarks: 350,
    bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 },
    boundarySource: "Indicative OCR H446 boundaries, as a fraction of 350 raw marks",
    papers: [
      { code: "H446/01", marks: 140, weighting: 40, bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 } },
      { code: "H446/02", marks: 140, weighting: 40, bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 } },
      // Coursework, marked on its own criteria rather than the exam scale.
      { code: "H446/03", marks: 70, weighting: 20, bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 } },
    ],
  },
  "edexcel-mathematics": {
    totalMarks: 300,
    bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 },
    boundarySource: "Indicative Pearson Edexcel 9MA0 boundaries, as a fraction of 300 raw marks",
    papers: [
      { code: "9MA0/01", marks: 100, weighting: 33.33, bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 } },
      { code: "9MA0/02", marks: 100, weighting: 33.33, bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 } },
      { code: "9MA0/03", marks: 100, weighting: 33.34, bands: { "A*": 0.8, A: 0.7, B: 0.6, C: 0.5, D: 0.4, E: 0.3 } },
    ],
  },
};

/** The raw mark at or above which a grade is awarded, rounded down to whole marks. */
export function boundaryMark(total: number, bands: GradeBands, grade: Exclude<Grade, "U">): number {
  return Math.floor(total * bands[grade]);
}

export interface GradeBand {
  grade: Grade;
  /** Inclusive lower bound in raw marks. */
  from: number;
  /** Exclusive upper bound, or null for the top band. */
  to: number | null;
}

/** Every grade band as raw-mark thresholds, best first. */
export function gradeBands(subject: SubjectId): GradeBand[] {
  const spec = BOUNDARIES[subject];
  const total = spec.totalMarks;
  return LETTER_ORDER.map((grade, i) => {
    // A grade's own threshold is where it starts; the next grade up is where it
    // stops. A* has nothing above it, so its upper bound is open.
    const nextUp = LETTER_ORDER[i - 1];
    return {
      grade,
      from: boundaryMark(total, spec.bands, grade),
      to: nextUp ? boundaryMark(total, spec.bands, nextUp) : null,
    };
  });
}

/** The grade a raw mark earns. Below the lowest band is unclassified. */
export function gradeFor(subject: SubjectId, rawMarks: number, paperCode?: string): Grade {
  const bands = paperCode ? paperBands(subject, paperCode) : BOUNDARIES[subject].bands;
  const total = paperCode ? paperMarks(subject, paperCode) : BOUNDARIES[subject].totalMarks;
  for (const grade of LETTER_ORDER) {
    if (rawMarks >= boundaryMark(total, bands, grade)) return grade;
  }
  return "U";
}

export function paperMarks(subject: SubjectId, paperCode: string): number {
  return BOUNDARIES[subject].papers.find((p) => p.code === paperCode)?.marks ?? 0;
}

export function paperBands(subject: SubjectId, paperCode: string): GradeBands {
  return (
    BOUNDARIES[subject].papers.find((p) => p.code === paperCode)?.bands ?? BOUNDARIES[subject].bands
  );
}

export interface PaperMark {
  code: string;
  marks: number;
  weighting: number;
}

/**
  Marks still available across the whole qualification.
 *
  Shown next to a mock result, because the useful question after a bad paper is
  "what is still winnable", not "what grade did I get".
*/
export function marksRemaining(subject: SubjectId, earned: Record<string, number>): PaperMark[] {
  return BOUNDARIES[subject].papers.map((p) => {
    const got = earned[p.code] ?? 0;
    return { code: p.code, marks: Math.max(0, p.marks - got), weighting: p.weighting };
  });
}

/**
  Project a raw mark onto a 0..100 percentage, clamped.
 *
  Deliberately not used for the grade itself - the grade comes from the band
  table. This exists so a percentage can be shown next to a per-paper score
  without implying that percentage is what the board converts.
*/
export function rawToPercent(subject: SubjectId, rawMarks: number): number {
  const total = BOUNDARIES[subject].totalMarks;
  return Math.round(clamp(rawMarks / total, 0, 1) * 100);
}

/**
  Marks needed to reach each grade from a given score.
 *
  `null` means the grade is already secured. This is the shape a learner can act
  on, which is why it exists separately from `gradeFor`.
*/
export function marksToNextGrade(
  subject: SubjectId,
  rawMarks: number,
): { grade: Grade; marksNeeded: number; total: number } | null {
  const spec = BOUNDARIES[subject];
  /*
    Walked bottom-up, deliberately.

    Searching from A* downwards returns the *highest* grade the learner has not yet
    reached, so a learner on 98 of 180 was told they needed 46 marks "for an A*"
    when the answer that helps them is "10 marks for a B". Ascending order returns
    the nearest grade above the score, which is the one worth chasing.
  */
  for (const grade of [...LETTER_ORDER].reverse()) {
    const need = boundaryMark(spec.totalMarks, spec.bands, grade);
    if (rawMarks < need) {
      return { grade, marksNeeded: need - rawMarks, total: spec.totalMarks };
    }
  }
  return null;
}

/** Marks needed for each grade, as a lookup the Analysis page can render. */
export function boundaryTable(subject: SubjectId): Array<{ grade: Grade; mark: number }> {
  const spec = BOUNDARIES[subject];
  return LETTER_ORDER.map((grade) => ({
    grade,
    mark: boundaryMark(spec.totalMarks, spec.bands, grade),
  }));
}