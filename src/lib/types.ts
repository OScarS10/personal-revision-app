import type { DifficultyPreference } from "./difficulty";

export type SubjectId = "aqa-economics" | "ocr-computer-science" | "edexcel-mathematics";

export type PaperId = string;

/** A single assessable unit of the specification - the "chapter" the user toggles. */
export interface Chapter {
  id: string;
  subject: SubjectId;
  /** Official specification reference, e.g. "4.1.5" or "2.3.1" or "Topic 7". */
  specRef: string;
  title: string;
  /** Section group heading, e.g. "Microeconomics" or "Pure Mathematics". */
  group: string;
  /** Official spec bullet points - used for recall questions and revision notes. */
  content: string[];
  /** Skill tags detected by the analytics engine (e.g. "geometry", "algebra"). */
  skills: string[];
  /** Chapter ids that should be mastered first. Drives cold-start inference. */
  prerequisites: string[];
  /** Exam weighting 0..1 - higher weight skills count more toward overall grade. */
  weight: number;
  paper: PaperId;
  /** Topics assessed at AS level (H046 / 7135 / 8MA0). */
  asLevel?: boolean;
  examBoard: string;
  /**
   * Authored teaching content for this chapter.
   *
   * Optional on purpose. A chapter without it has nothing genuine to ask, and
   * the app says so rather than falling back to questions about where the
   * chapter sits in the specification.
   */
  knowledge?: ChapterKnowledge;
}

/**
 * Observed accuracy for one generator template.
 *
 * Hand-set difficulty is an assumption. This is the measurement of whether that
 * assumption holds, and it only becomes meaningful once a template has been seen
 * enough times that a single result is not noise.
 */
export interface TemplateStat {
  attempts: number;
  correct: number;
  /**
   * Sum of observed scores, so partial credit on extended answers and
   * multi-select contributes rather than being rounded to 0 or 1.
   */
  scoreSum: number;
  /** Sum of the difficulties the items were served at. */
  difficultySum: number;
  /** The last time this template produced a question. */
  lastSeen: number;
}

/** A term the learner must be able to define precisely. */
export interface KnowledgeTerm {
  term: string;
  definition: string;
  /**
   * The specific misapplication this term invites. AQA and OCR mark schemes
   * punish these specifically, so they are worth naming.
   */
  commonError?: string;
  /** Optional worked illustration, in the chapter's own subject. */
  example?: string;
}

/**
 * Teaching content for a chapter.
 *
 * This exists because the app was diagnosing without teaching: it could say a
 * chapter was weak but had nothing to say about the chapter itself.
 */
export interface ChapterKnowledge {
  /** Two or three sentences on what this chapter is about. */
  summary: string;
  /** The ideas a learner should be able to write down cold. */
  keyIdeas: string[];
  /** Mistakes worth warning about before the exam, not after it. */
  commonMistakes: string[];
  /** How this gets asked, and what the mark scheme rewards. */
  examTip?: string;
  /** Vocabulary worth defining exactly, as opposed to roughly. */
  terms: KnowledgeTerm[];
}

export interface Paper {
  id: PaperId;
  subject: SubjectId;
  code: string;
  title: string;
  durationMinutes: number;
  marks: number;
  /** Percentage of the qualification, e.g. 33.33 */
  weighting: number;
}

/** How a question is answered and marked. */
export type QuestionFormat =
  | { kind: "numeric"; unit?: string; tolerance?: number }
  | { kind: "text"; caseSensitive?: boolean; accepted: string[] }
  | { kind: "single-choice"; options: string[] }
  | { kind: "multi-choice"; options: string[] }
  | { kind: "code"; language: string }
  | { kind: "extended"; scheme: MarkScheme; levels?: LevelDescriptor[] };

/**
 * One awardable point in a mark scheme.
 *
 * Extended-answer items cannot be marked automatically without becoming a test
 * of guessing the mark scheme's wording, so the learner marks themselves
 * against these. Each point is a distinct thing the answer could have said,
 * which is what makes the self-mark honest rather than a self-grade.
 */
export interface MarkSchemePoint {
  /** Short label for the point, shown before the learner expands their answer. */
  label: string;
  /** The full statement, shown for comparison against the learner's answer. */
  detail: string;
  marks: number;
  /**
   * True for a point about how the argument is constructed rather than what it
   * says. AQA awards these separately in levels of response, and a learner who
   * has the facts but no chain loses the top band without it.
   */
  isLink?: boolean;
}

/** A band in a levels-of-response rubric. */
export interface LevelDescriptor {
  level: number;
  label: string;
  /** What the answer must do to sit in this band. */
  descriptor: string;
  /** Proportion of the available marks this band typically corresponds to. */
  indicativeRange: [number, number];
}

/** The full mark scheme for an extended-answer item. */
export interface MarkScheme {
  /** The command word, since "explain" and "evaluate" reward different things. */
  command: string;
  points: MarkSchemePoint[];
  totalMarks: number;
  /** Shown before self-marking so the learner knows what is being looked for. */
  guidance?: string;
}

export interface WorkedStep {
  label: string;
  work: string;
  result?: string;
}

export interface GeneratedQuestion {
  id: string;
  /** Chapter this item is primarily assessing. */
  chapterId: string;
  /** All chapters this item contributes evidence to. */
  skillIds: string[];
  specRef: string;
  /** IRT difficulty parameter (logit scale). Higher = harder. */
  difficulty: number;
  /** 1..5, for display only. */
  tier: 1 | 2 | 3 | 4 | 5;
  prompt: string;
  /** Optional rendered context such as a table or ASCII/SVG diagram. */
  context?: string;
  diagram?: DiagramSpec;
  format: QuestionFormat;
  /** Canonical answer, always a string so grading stays uniform. */
  answer: string;
  marks: number;
  /** Shown after answering. */
  solution: WorkedStep[];
  /** One-line takeaway for spaced repetition. */
  takeaway: string;
  /** Generator key, used to weight item difficulty stats. */
  template: string;
  /**
   * Whether this item is a valid measure of the learner on this chapter.
   *
   * False for anything that measures something other than subject knowledge:
   * self-marked extended answers, questions about the specification's own
   * layout, or a learner's own confidence. These are still recorded for
   * history, but they must not move theta or mastery, because an item that
   * does not test the subject cannot estimate the subject.
   */
  assessesMastery: boolean;
}

export interface DiagramSpec {
  kind: "graph" | "diagram" | "table" | "code";
  /** For graphs: y = ax^2 + bx + c style coefficients. */
  poly?: { a: number; b: number; c: number };
  /** Domain window. */
  window?: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** Plot n discrete points connected by lines. */
  points?: Array<{ x: number; y: number }>;
  /** Named shapes for econ diagrams. */
  shapes?: DiagramShape[];
  caption?: string;
}

export type DiagramShape =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; label?: string; dash?: boolean }
  | { type: "polyline"; points: Array<[number, number]>; label?: string; dash?: boolean }
  | { type: "curve"; points: Array<[number, number]>; label?: string }
  | { type: "rect"; x: number; y: number; w: number; h: number; label?: string }
  | { type: "point"; x: number; y: number; label?: string }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number; label?: string }
  | { type: "text"; x: number; y: number; label: string };

export interface Answer {
  questionId: string;
  chapterId: string;
  skillIds: string[];
  specRef: string;
  difficulty: number;
  /** What the learner typed/chose, normalised. */
  response: string[];
  correct: boolean;
  /** 0..1 partial credit. */
  score: number;
  marks: number;
  awardedMarks: number;
  durationMs: number;
  timestamp: number;
  template: string;
  /**
   * Carried through from the question. False means this response must not move
   * the ability estimate; see GeneratedQuestion.assessesMastery.
   *
   * Optional because persisted answers may predate the field, and migrateState
   * back-fills it. An absent value means true.
   */
  assessesMastery?: boolean;
  /**
   * True when the learner marked this themselves against a mark scheme. Present
   * on all new answers; optional because stored answers may predate it.
   */
  selfAssessed?: boolean;
}

/** Per-skill model state. Everything here is learned; never hard-coded. */
export interface SkillState {
  /** IRT ability on logit scale, clamped to [-4, 4]. */
  theta: number;
  /** Beta posterior for mastery: Beta(alpha, beta). */
  alpha: number;
  beta: number;
  /** Bayesian Knowledge Tracing probability of having learned the skill. */
  pLearned: number;
  attempts: number;
  correct: number;
  /** Rolling sum of scores, used for the form check on drift. */
  recent: number[];
  /** Difficulty-weighted total information gathered - drives confidence. */
  information: number;
  lastSeen: number | null;
  /** Mean seconds per attempt. */
  avgDurationMs: number;
  /** Sum of item difficulty encountered, for ability-vs-difficulty diagnostics. */
  difficultySum: number;
  /** Set when inference (not direct evidence) produced the current theta. */
  inferredOnly: boolean;
}

export interface ModelConfig {
  /** IRT learning rate. */
  learningRate: number;
  /** Graph smoothing strength for cross-skill propagation (0 = off). */
  propagation: number;
  /** Probability of an intentional out-of-skill probe. */
  exploration: number;
  /** Target difficulty offset above current ability (logits). */
  stretch: number;
  /**
   * Learner-chosen difficulty. An offset applied to the target before
   * selection, so a learner can ask for a gentler start or to be pushed harder
   * than their current ability. Defaults to "standard", which is a no-op.
   * See src/lib/difficulty.ts.
   */
  difficulty: DifficultyPreference;
  /**
   * Weight given to a self-assessed extended answer relative to a machine-marked
   * one. Marking your own work against a scheme runs generous, so a self-score of
   * full marks is weaker evidence than a verified one. Kept in the config rather
   * than hard-coded because the size of the bias is an assumption.
   */
  selfAssessedWeight: number;
  bkt: {
    pInitialLearned: number;
    pTransition: number;
    pGuess: number;
    pSlip: number;
  };
  /** Ebbinghaus retention time constant in days. */
  forgettingTauDays: number;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  learningRate: 0.42,
  propagation: 0.35,
  exploration: 0.12,
  stretch: 0.35,
  difficulty: "standard",
  selfAssessedWeight: 0.45,
  bkt: {
    pInitialLearned: 0.12,
    pTransition: 0.14,
    pGuess: 0.24,
    pSlip: 0.12,
  },
  forgettingTauDays: 21,
};

export interface SessionResult {
  questionIds: string[];
  attempted: number;
  correct: number;
  expected: number;
  thetaDelta: number;
  durationMs: number;
}

export interface PersistedState {
  version: number;
  createdAt: number;
  updatedAt: number;
  /** Chapter ids the user has enabled. */
  enabled: Record<SubjectId, string[]>;
  config: ModelConfig;
  skills: Record<string, SkillState>;
  answers: Answer[];
  /** Items already served, so we avoid immediate repeats. */
  recentItemIds: string[];
  sessions: number;
  /** Rolling accuracy per ISO date for the streak chart. */
  daily: Record<string, { attempted: number; correct: number; durationMs?: number; sessions?: number }>;
  /** Exam dates per subject, as local midnight timestamps. */
  examDates: Partial<Record<SubjectId, number>>;
  /**
  * Running calibration of the automatic extended-answer marker.
  *
  * Persisted because the whole point is that the marker adjusts to this learner
  * over many answers. Held in memory only, it would reset on every reload and the
  * adjustment would never accumulate past the first few essays.
  */
  autoMarkCalibration: import("@/lib/auto-mark").Calibration;
  /**
   * When the progress blob was last exported.
   *
   * Tracked purely to prompt a backup. Progress lives only in this browser, so
   * clearing site data destroys it, and a learner with months of history may
   * not realise that.
   */
  lastExportAt: number | null;
  /**
   * Template-level accuracy, used to nudge difficulty.
   *
   * Hand-set difficulty values assume a difficulty nobody has measured. Real
   * outcomes are the only way to find out whether "algebra-quadratic-roots at
   * base 0.4" actually lands where the model thinks it does.
   */
  templateStats: Record<string, TemplateStat>;
}

export type InsightSeverity = "critical" | "weak" | "shaky" | "strong" | "untested";

export interface SkillInsight {
  chapterId: string;
  specRef: string;
  title: string;
  group: string;
  subject: SubjectId;
  skills: string[];
  enabled: boolean;
  severity: InsightSeverity;
  /** 0..1 - higher means more urgent revision need. */
  weakness: number;
  /** 0..1 posterior mastery, shrunk by confidence. */
  mastery: number;
  /** 0..1 - how much we trust the mastery estimate. */
  confidence: number;
  /** Bayesian Knowledge Tracing learned probability. */
  learned: number;
  /** 0..1 retention after forgetting decay. */
  retention: number;
  theta: number;
  /** Ability implied by prerequisite chapters, for untested skills. */
  priorTheta: number | null;
  attempts: number;
  accuracy: number | null;
  /** Mean absolute score gap on items harder than the learner was ready for. */
  difficultyGap: number | null;
  recommendation: string;
  evidence: string;
}

export interface SkillTagInsight {
  skill: string;
  subject: SubjectId;
  mastery: number;
  confidence: number;
  attempts: number;
  chapters: string[];
  weakness: number;
}

export interface OverallProfile {
  subject: SubjectId;
  /** 0..1 aggregate mastery over enabled chapters. */
  mastery: number;
  confidence: number;
  theta: number;
  /** Probability-weighted grade band. */
  grade: string;
  gradeProbabilities: Array<{ grade: string; probability: number }>;
  /** Coverage of enabled chapters that have direct evidence. */
  coverage: number;
  chaptersTested: number;
  chaptersEnabled: number;
  totalAttempts: number;
  accuracy: number | null;
  /** Ability percentile vs a synthetic reference cohort. */
  percentile: number;
  streak: number;
  /** Composite 0..100 readiness score. */
  readiness: number;
}
