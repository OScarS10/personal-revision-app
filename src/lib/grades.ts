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

  Where the numbers come from now: the June 2026 series boundaries published by
  each board. AQA 7136, OCR H446 and Pearson 9MA0 all confirm the overall
  (subject) boundaries, and those are the figures used for grading.

  Two distinctions in these tables matter, because they are not the same claim:

  - "confirmed" - the board's confirmed subject boundary for the series. This is
    an official figure and is what a learner's overall mark is graded against.
  - "notional" - the board also publishes *component* boundaries, derived rather
    than awarded. AQA's own document says they are "for illustrative purposes
    only", and OCR's is titled "notional component raw mark grade boundaries".
    They are real published numbers but they are not a mark you can be awarded on
    a single paper, so `basis` records this per paper.

  Pearson publishes no component boundaries at all, so 9MA0 papers are marked
  "indicative" and scaled from the confirmed overall boundary. That scaling is an
  arithmetic convenience, not a board figure, and the UI says so.

  Bands are stored as whole raw marks rather than as fractions of the total.
  Fractions were the old representation and they were lossy: at 240 marks, an A
  threshold of 154/240 = 0.641666... round-trips to 154, but C at 110/240 =
  0.458333... floored to 109. An invented fraction being off by a mark was
  tolerable; an *official* boundary being off by a mark is not. `gradeCuts`
  derives the fractions for the one caller that genuinely needs a 0..1 number.
*/

export type Grade = "A*" | "A" | "B" | "C" | "D" | "E" | "U";

/** Grade bands, best first. The order is the display order everywhere. */
export const GRADE_ORDER: Grade[] = ["A*", "A", "B", "C", "D", "E", "U"];

/** The six lettered bands, best first. U is "unclassified", not a band. */
const LETTER_ORDER: Exclude<Grade, "U">[] = ["A*", "A", "B", "C", "D", "E"];

/** The lowest raw mark that earns each grade. Whole marks, as published. */
export type GradeBands = Record<Exclude<Grade, "U">, number>;

/**
  How much authority a set of boundaries has.

  Only "confirmed" describes a mark a learner is actually graded against.
*/
export type BoundaryBasis = "confirmed" | "notional" | "indicative";

interface PaperBoundaries {
  /** Board paper code, e.g. "7136/1". */
  code: string;
  marks: number;
  /** Fraction of the A-level grade carried by this paper. */
  weighting: number;
  /**
    Minimum raw mark for each band on this paper.

    Omitted where the board publishes no component boundary; `paperBands` then
    scales the overall bands pro rata, which is an estimate and is why such
    papers carry basis "indicative".
  */
  bands?: GradeBands;
  basis: BoundaryBasis;
  /** Why this paper's numbers are what they are, when it is not the obvious thing. */
  note?: string;
}

interface QualificationBoundaries {
  /** Total raw marks across all papers, coursework included. */
  totalMarks: number;
  /** Confirmed overall boundaries: the lowest raw mark for each grade. */
  bands: GradeBands;
  papers: PaperBoundaries[];
  basis: BoundaryBasis;
  /** Exam series these figures describe. Boards reset these every year. */
  series: string;
  publishedBy: string;
  /** Where the figures were read from. */
  sourceUrl: string;
  /** How to describe these numbers to the learner. */
  boundarySource: string;
}

/*
  June 2026 series.

  AQA 7136 Economics is 240 raw marks across three 80-mark papers - Paper 3 is a
  synoptic 30+50, not the 20-mark paper this table previously described. Its
  Paper 3 threshold also works out *lower* than Paper 1's (72.5% vs 77.5%), so
  the old comment claiming the synoptic paper "sits higher than a naive split"
  was backwards; the board's own notional figures are what is recorded here.
*/
const AQA_ECON_2026: QualificationBoundaries = {
  totalMarks: 240,
  bands: { "A*": 178, A: 154, B: 132, C: 110, D: 88, E: 66 },
  basis: "confirmed",
  series: "June 2026",
  publishedBy: "AQA",
  sourceUrl:
    "https://www.aqa.org.uk/files/paCVKfw5La60f7r6i5pOHf/63cb28a7468d750e12f2f8859cba85fbf62213d3.pdf",
  boundarySource:
    "AQA 7136 confirmed boundaries for the June 2026 series, out of 240 raw marks. Per-paper figures are the board's notional components, published for illustration only.",
  papers: [
    {
      code: "7136/1",
      marks: 80,
      weighting: 33.33,
      bands: { "A*": 62, A: 55, B: 46, C: 37, D: 29, E: 21 },
      basis: "notional",
    },
    {
      code: "7136/2",
      marks: 80,
      weighting: 33.33,
      bands: { "A*": 58, A: 50, B: 42, C: 34, D: 27, E: 20 },
      basis: "notional",
    },
    {
      code: "7136/3",
      marks: 80,
      weighting: 33.34,
      bands: { "A*": 58, A: 49, B: 43, C: 37, D: 31, E: 25 },
      basis: "notional",
      note: "Synoptic 30-mark sections plus a 50-mark essay, marked on the same 80-mark scale.",
    },
  ],
};

/*
  OCR H446 Computer Science is 350 raw marks: 140 + 140 + a 70-mark programming
  project. The project appears twice in the board's table as H446/03 (moderated
  upload) and H446/04 (moderated postal) - the same paper offered by two routes,
  with identical boundaries. Only the upload route is listed here, because
  counting both would double the project and break the papers-summing-to-total
  invariant. A candidate sits one or the other, never both.
*/
const OCR_CS_2026: QualificationBoundaries = {
  totalMarks: 350,
  bands: { "A*": 289, A: 254, B: 216, C: 178, D: 141, E: 104 },
  basis: "confirmed",
  series: "June 2026",
  publishedBy: "OCR",
  sourceUrl: "https://www.ocr.org.uk/Images/760861-as-and-a-level-grade-boundaries-june-2026.pdf",
  boundarySource:
    "OCR H446 confirmed boundaries for the June 2026 series, out of 350 raw marks. Per-paper figures are notional component boundaries.",
  papers: [
    {
      code: "H446/01",
      marks: 140,
      weighting: 40,
      bands: { "A*": 112, A: 99, B: 84, C: 69, D: 55, E: 41 },
      basis: "notional",
    },
    {
      code: "H446/02",
      marks: 140,
      weighting: 40,
      bands: { "A*": 114, A: 99, B: 83, C: 68, D: 52, E: 37 },
      basis: "notional",
    },
    {
      code: "H446/03",
      marks: 70,
      weighting: 20,
      bands: { "A*": 63, A: 56, B: 49, C: 41, D: 34, E: 26 },
      basis: "notional",
      note: "Programming project, 20% of the A level. The postal route is published as H446/04 on identical boundaries.",
    },
  ],
};

/*
  Pearson 9MA0 Mathematics confirms the 300-mark overall boundary and publishes
  no component boundaries in its June 2026 document - the table lists the
  subject row and then only the paper numbers. So the overall bands are exact and
  per-paper bands are absent, and `paperBands` scales them.

  The paper mark counts and weightings are the qualification's published
  structure rather than figures from the boundary document: Pure 1 at 100 marks
  (33.33%), Pure 2 at 75 (25%), Pure 3 at 125 (41.67%). The previous table split
  300 as 100/100/100, which summed correctly and was still wrong about the
  qualification - a number can be internally consistent and describe something
  that does not exist.
*/
const PEARSON_MATHS_2026: QualificationBoundaries = {
  totalMarks: 300,
  bands: { "A*": 254, A: 210, B: 173, C: 136, D: 100, E: 64 },
  basis: "confirmed",
  series: "June 2026",
  publishedBy: "Pearson Edexcel",
  sourceUrl:
    "https://qualifications.pearson.com/content/dam/pdf/Support/Grade-boundaries/A-level/grade-boundaries-june-2026-gce.pdf",
  boundarySource:
    "Pearson 9MA0 confirmed boundaries for the June 2026 series, out of 300 raw marks. Pearson publish no per-paper boundaries, so per-paper marks here are scaled from this confirmed overall and are indicative only.",
  papers: [
    {
      code: "9MA0/01",
      marks: 100,
      weighting: 33.33,
      basis: "indicative",
      note: "Pure Mathematics 1. Scaled from the confirmed overall: Pearson publish no component boundary.",
    },
    {
      code: "9MA0/02",
      marks: 75,
      weighting: 25,
      basis: "indicative",
      note: "Pure Mathematics 2. Scaled from the confirmed overall.",
    },
    {
      code: "9MA0/03",
      marks: 125,
      weighting: 41.67,
      basis: "indicative",
      note: "Pure Mathematics 3, worth more than Papers 1 and 2 combined. Scaled from the confirmed overall.",
    },
  ],
};

export const BOUNDARIES: Record<SubjectId, QualificationBoundaries> = {
  "aqa-economics": AQA_ECON_2026,
  "ocr-computer-science": OCR_CS_2026,
  "edexcel-mathematics": PEARSON_MATHS_2026,
};

/** The lowest raw mark that earns `grade`. Bands are whole published marks. */
export function boundaryMark(bands: GradeBands, grade: Exclude<Grade, "U">): number {
  return bands[grade];
}

/**
  Grade boundaries as fractions of the subject total.

  The one caller that needs a 0..1 number is analytics.ts, which compares the
  cuts against a mastery estimate rather than against marks. Derived here so the
  division lives beside the marks it comes from.
*/
export function gradeCuts(subject: SubjectId): Array<{ grade: Exclude<Grade, "U">; cut: number }> {
  const spec = BOUNDARIES[subject];
  return LETTER_ORDER.map((grade) => ({ grade, cut: spec.bands[grade] / spec.totalMarks }));
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
  return LETTER_ORDER.map((grade, i) => {
    // A grade's own threshold is where it starts; the next grade up is where it
    // stops. A* has nothing above it, so its upper bound is open.
    const nextUp = LETTER_ORDER[i - 1];
    return {
      grade,
      from: spec.bands[grade],
      to: nextUp ? spec.bands[nextUp] : null,
    };
  });
}

/** The grade a raw mark earns. Below the lowest band is unclassified. */
export function gradeFor(subject: SubjectId, rawMarks: number, paperCode?: string): Grade {
  const bands = paperCode ? paperBands(subject, paperCode) : BOUNDARIES[subject].bands;
  if (!bands) return "U";
  for (const grade of LETTER_ORDER) {
    if (rawMarks >= bands[grade]) return grade;
  }
  return "U";
}

export function paperMarks(subject: SubjectId, paperCode: string): number {
  return BOUNDARIES[subject].papers.find((p) => p.code === paperCode)?.marks ?? 0;
}

/**
  Boundaries for one paper, or null when the paper is not in the table.

  Papers with no published component boundary get the overall bands scaled pro
  rata to the paper's own maximum. That is arithmetic on a confirmed figure, not
  a published one, which is why those papers are marked "indicative".
*/
export function paperBands(subject: SubjectId, paperCode: string): GradeBands | null {
  const spec = BOUNDARIES[subject];
  const paper = spec.papers.find((p) => p.code === paperCode);
  if (!paper) return null;
  if (paper.bands) return paper.bands;
  const scale = paper.marks / spec.totalMarks;
  return Object.fromEntries(
    LETTER_ORDER.map((grade) => [grade, Math.round(spec.bands[grade] * scale)]),
  ) as GradeBands;
}

export interface PaperMark {
  code: string;
  marks: number;
  weighting: number;
}

/**
  Marks still available across the whole qualification.

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
    reached, so a learner on 98 of 240 was told they needed 46 marks "for an A*"
    when the answer that helps them is "10 marks for a B". Ascending order returns
    the nearest grade above the score, which is the one worth chasing.
  */
  for (const grade of [...LETTER_ORDER].reverse()) {
    const need = spec.bands[grade];
    if (rawMarks < need) {
      return { grade, marksNeeded: need - rawMarks, total: spec.totalMarks };
    }
  }
  return null;
}

/** Marks needed for each grade, as a lookup the Analysis page can render. */
export function boundaryTable(subject: SubjectId): Array<{ grade: Grade; mark: number }> {
  const spec = BOUNDARIES[subject];
  return LETTER_ORDER.map((grade) => ({ grade, mark: spec.bands[grade] }));
}