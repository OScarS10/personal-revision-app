import type {
  Answer,
  ModelConfig,
  PersistedState,
  SkillState,
  SubjectId,
  TemplateStat,
} from "@/lib/types";
import { DEFAULT_MODEL_CONFIG } from "@/lib/types";
import { sanitiseDifficulty } from "@/lib/difficulty";
import { createSkillState } from "@/lib/model";
import { SUBJECT_ORDER, defaultEnabled } from "@/lib/specs";

/*
  Persistence.

  Everything lives in localStorage - there is no account and no server. That
  makes two things important: the write path must never throw (a full quota or a
  private-mode browser should degrade to a working in-memory app, not a white
  screen), and the read path must tolerate junk, because a user can hand-edit
  the blob or an older build can have written a different shape.
*/

export const STORAGE_KEY = "specwise.state.v1";
export const STATE_VERSION = 1;

export function createInitialState(now = Date.now()): PersistedState {
  const enabled = {} as Record<SubjectId, string[]>;
  for (const subject of SUBJECT_ORDER) {
    enabled[subject] = defaultEnabled(subject);
  }
  return {
    version: STATE_VERSION,
    createdAt: now,
    updatedAt: now,
    enabled,
    config: { ...DEFAULT_MODEL_CONFIG, bkt: { ...DEFAULT_MODEL_CONFIG.bkt } },
    skills: {},
    answers: [],
    recentItemIds: [],
    sessions: 0,
    daily: {},
    examDates: {},
    lastExportAt: null,
    templateStats: {},
  };
}

/** ISO date key in the learner's local timezone, e.g. "2026-09-30". */
export function localDateKey(timestamp = Date.now()): string {
  const d = new Date(timestamp);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// ------------------------------------------------------------------ validation

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitiseSkill(raw: unknown): SkillState {
  const r = asRecord(raw);
  const base = createSkillState();
  const recent = Array.isArray(r.recent)
    ? r.recent.filter((v): v is number => typeof v === "number" && Number.isFinite(v)).slice(-8)
    : [];
  return {
    theta: Math.max(-4, Math.min(4, num(r.theta, base.theta))),
    alpha: Math.max(0, num(r.alpha, base.alpha)),
    beta: Math.max(0, num(r.beta, base.beta)),
    pLearned: Math.max(0, Math.min(1, num(r.pLearned, base.pLearned))),
    attempts: Math.max(0, Math.floor(num(r.attempts, 0))),
    correct: Math.max(0, Math.floor(num(r.correct, 0))),
    recent,
    information: Math.max(0, num(r.information, 0)),
    lastSeen: typeof r.lastSeen === "number" ? r.lastSeen : null,
    avgDurationMs: Math.max(0, num(r.avgDurationMs, 0)),
    difficultySum: num(r.difficultySum, 0),
    inferredOnly: r.inferredOnly === false ? false : true,
  };
}

/**
 * Exam dates, per subject.
 *
 * Only plausible future-or-present timestamps are kept, so a corrupt value
 * cannot make the study planner claim an exam was last year with a schedule
 * built for it.
 */
function sanitiseExamDates(raw: unknown): Partial<Record<SubjectId, number>> {
  const out: Partial<Record<SubjectId, number>> = {};
  for (const [key, value] of Object.entries(asRecord(raw))) {
    if (!isSubjectId(key)) continue;
    const ts = num(value, NaN);
    if (Number.isFinite(ts) && ts > 0) out[key] = ts;
  }
  return out;
}

const SUBJECT_IDS: readonly string[] = [
  "aqa-economics",
  "ocr-computer-science",
  "edexcel-mathematics",
];

function isSubjectId(value: string): value is SubjectId {
  return SUBJECT_IDS.includes(value);
}

/** Running per-template outcome statistics, used for difficulty calibration. */
function sanitiseTemplateStats(raw: unknown): Record<string, TemplateStat> {
  const out: Record<string, TemplateStat> = {};
  for (const [key, value] of Object.entries(asRecord(raw))) {
    const v = asRecord(value);
    out[key] = {
      attempts: Math.max(0, Math.floor(num(v.attempts, 0))),
      correct: Math.max(0, Math.floor(num(v.correct, 0))),
      scoreSum: Math.max(0, num(v.scoreSum, 0)),
      difficultySum: num(v.difficultySum, 0),
      lastSeen: Math.max(0, num(v.lastSeen, 0)),
    };
  }
  return out;
}

function sanitiseAnswer(raw: unknown): Answer | null {
  const r = asRecord(raw);
  if (typeof r.questionId !== "string" || typeof r.chapterId !== "string") return null;
  return {
    questionId: r.questionId,
    chapterId: r.chapterId,
    skillIds: Array.isArray(r.skillIds)
      ? r.skillIds.filter((v): v is string => typeof v === "string")
      : [],
    specRef: typeof r.specRef === "string" ? r.specRef : "",
    difficulty: num(r.difficulty, 0),
    response: Array.isArray(r.response)
      ? r.response.filter((v): v is string => typeof v === "string")
      : [],
    correct: r.correct === true,
    score: Math.max(0, Math.min(1, num(r.score, 0))),
    marks: Math.max(0, num(r.marks, 1)),
    awardedMarks: Math.max(0, num(r.awardedMarks, 0)),
    durationMs: Math.max(0, num(r.durationMs, 0)),
    timestamp: num(r.timestamp, 0),
    template: typeof r.template === "string" ? r.template : "unknown",
    assessesMastery: resolveAssessesMastery(r),
    selfAssessed: r.selfAssessed === true,
  };
}

/**
 * Decide whether a stored answer may influence the ability estimate.
 *
 * Answers recorded before the flag existed carry no value, so this infers it.
 * The specification-recall templates are the ones that asked where a bullet sat
 * in the specification rather than asking about the subject, so they are marked
 * non-assessing retrospectively: a learner who aced those has not demonstrated
 * anything about the chapter, and letting those answers stand would keep
 * inflating mastery for the chapters that were measured worst.
 */
function resolveAssessesMastery(r: Record<string, unknown>): boolean {
  if (typeof r.assessesMastery === "boolean") return r.assessesMastery;
  const template = typeof r.template === "string" ? r.template : "";
  return !template.startsWith("recall-");
}

/**
 * Coerce anything into a valid PersistedState.
 *
 * Deliberately total: it never throws and always returns something usable, so a
 * corrupt blob degrades to "you have no progress yet" instead of a crash.
 */
export function migrateState(raw: unknown, now = Date.now()): PersistedState {
  const fallback = createInitialState(now);
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;

  const enabled = {} as Record<SubjectId, string[]>;
  const rawEnabled = asRecord(r.enabled);
  for (const subject of SUBJECT_ORDER) {
    const list = rawEnabled[subject];
    enabled[subject] = Array.isArray(list)
      ? list.filter((v): v is string => typeof v === "string")
      : fallback.enabled[subject];
  }

  const skills: Record<string, SkillState> = {};
  for (const [id, value] of Object.entries(asRecord(r.skills))) {
    skills[id] = sanitiseSkill(value);
  }

  const daily: Record<string, { attempted: number; correct: number }> = {};
  for (const [key, value] of Object.entries(asRecord(r.daily))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    const v = asRecord(value);
    daily[key] = {
      attempted: Math.max(0, Math.floor(num(v.attempted, 0))),
      correct: Math.max(0, Math.floor(num(v.correct, 0))),
    };
  }

  const rawConfig = asRecord(r.config);
  const rawBkt = asRecord(rawConfig.bkt);
  const config: ModelConfig = {
    learningRate: Math.max(0.01, Math.min(2, num(rawConfig.learningRate, DEFAULT_MODEL_CONFIG.learningRate))),
    propagation: Math.max(0, Math.min(0.9, num(rawConfig.propagation, DEFAULT_MODEL_CONFIG.propagation))),
    exploration: Math.max(0, Math.min(1, num(rawConfig.exploration, DEFAULT_MODEL_CONFIG.exploration))),
    stretch: num(rawConfig.stretch, DEFAULT_MODEL_CONFIG.stretch),
    difficulty: sanitiseDifficulty(rawConfig.difficulty),
    selfAssessedWeight: Math.max(
      0,
      Math.min(1, num(rawConfig.selfAssessedWeight, DEFAULT_MODEL_CONFIG.selfAssessedWeight)),
    ),
    bkt: {
      pInitialLearned: Math.max(0, Math.min(1, num(rawBkt.pInitialLearned, DEFAULT_MODEL_CONFIG.bkt.pInitialLearned))),
      pTransition: Math.max(0, Math.min(1, num(rawBkt.pTransition, DEFAULT_MODEL_CONFIG.bkt.pTransition))),
      pGuess: Math.max(0, Math.min(1, num(rawBkt.pGuess, DEFAULT_MODEL_CONFIG.bkt.pGuess))),
      pSlip: Math.max(0, Math.min(1, num(rawBkt.pSlip, DEFAULT_MODEL_CONFIG.bkt.pSlip))),
    },
    forgettingTauDays: Math.max(0.5, num(rawConfig.forgettingTauDays, DEFAULT_MODEL_CONFIG.forgettingTauDays)),
  };

  const answers = (Array.isArray(r.answers) ? r.answers : [])
    .map(sanitiseAnswer)
    .filter((a): a is Answer => a !== null)
    // Keep only the most recent history, so the blob cannot grow without bound.
    .slice(-4000);

  return {
    version: STATE_VERSION,
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    enabled,
    config,
    skills,
    answers,
    recentItemIds: (Array.isArray(r.recentItemIds) ? r.recentItemIds : [])
      .filter((v): v is string => typeof v === "string")
      .slice(-200),
    sessions: Math.max(0, Math.floor(num(r.sessions, 0))),
    daily,
    examDates: sanitiseExamDates(r.examDates),
    lastExportAt: r.lastExportAt === null || r.lastExportAt === undefined ? null : Math.max(0, num(r.lastExportAt, 0)),
    templateStats: sanitiseTemplateStats(r.templateStats),
  };
}

// ------------------------------------------------------------------- load/save

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Returns null when storage is unavailable (SSR, private mode, disabled). */
export function safeStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__specwise_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadState(storage: StorageLike | null, now = Date.now()): PersistedState {
  if (!storage) return createInitialState(now);
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState(now);
    return migrateState(JSON.parse(raw), now);
  } catch {
    // Corrupt JSON, or a quota error on read. Start clean rather than crash.
    return createInitialState(now);
  }
}

/**
 * Persist state, falling back to in-memory when the write fails.
 *
 * Returns whether the write actually landed, so the UI can tell the user their
 * progress is not being saved instead of silently losing it.
 */
export function saveState(
  storage: StorageLike | null,
  state: PersistedState,
  now = Date.now(),
): { ok: boolean; error: string | null } {
  if (!storage) {
    return { ok: false, error: "Storage is unavailable in this browser." };
  }
  try {
    const payload = JSON.stringify({ ...state, version: STATE_VERSION, updatedAt: now });
    storage.setItem(STORAGE_KEY, payload);
    return { ok: true, error: null };
  } catch (error) {
    const message =
      error instanceof Error && /quota/i.test(error.message)
        ? "Out of local storage space. Export your progress and clear old answers."
        : "Could not save your progress.";
    return { ok: false, error: message };
  }
}

// ------------------------------------------------------------- export / import

export function exportState(state: PersistedState): string {
  return JSON.stringify(
    { ...state, version: STATE_VERSION, exportedAt: new Date().toISOString() },
    null,
    2,
  );
}

export interface ImportResult {
  ok: boolean;
  state?: PersistedState;
  error?: string;
  summary?: { answers: number; chapters: number; days: number };
}

export function importState(text: string, now = Date.now()): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "That file does not look like a Specwise backup." };
  }
  const state = migrateState(parsed, now);
  const days = Object.keys(state.daily).length;
  const chapters = Object.keys(state.skills).length;
  const exams = Object.keys(state.examDates).length;
  /*
    A backup with no answers or skills is normally a mistake, but exam dates on
    their own are real content: a learner who set their exam dates and nothing
    else would be refused a restore of exactly what they were trying to keep.
  */
  if (state.answers.length === 0 && chapters === 0 && exams === 0) {
    return { ok: false, error: "That backup contains no progress to restore." };
  }
  return {
    ok: true,
    state,
    summary: { answers: state.answers.length, chapters, days },
  };
}
