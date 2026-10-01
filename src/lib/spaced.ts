import type { Answer, PersistedState, SkillState } from "@/lib/types";
import { getSkillState } from "@/lib/model";

/*
  Spaced repetition.

  A textbook, not an algorithm paper: each item gets a due date, and the
  interval grows when the answer is right and collapses when it is wrong. The
  schedule is per-chapter rather than per-item because questions are generated
  fresh each time - there is no fixed card to schedule, only a skill to re-test.
*/

export const DAY_MS = 86_400_000;

/** Interval in days after a correct answer, indexed by consecutive successes. */
const LADDER = [1, 2, 4, 8, 16, 32];

export const MIN_DAYS = 0.25; // 6 hours

export interface ReviewRow {
  chapterId: string;
  /** Consecutive correct answers on this chapter. */
  streak: number;
  /** 0..1, how overdue the chapter is. */
  urgency: number;
  dueInDays: number;
  dueAt: number;
  lastScore: number;
  lastSeen: number | null;
  attempts: number;
  state: "due" | "soon" | "later" | "fresh";
}

export function nextIntervalDays(streak: number, correct: boolean): number {
  if (!correct) return MIN_DAYS;
  // The ladder is indexed by "how many correct answers in a row, counting this
  // one", so the first correct answer lands on the 1-day rung rather than
  // skipping straight to 2 days.
  const index = Math.min(Math.max(0, streak - 1), LADDER.length - 1);
  return LADDER[index] ?? LADDER[LADDER.length - 1];
}

/** When this chapter should next be asked, given the last attempt. */
export function dueAtFor(state: SkillState): number | null {
  if (state.attempts === 0 || state.lastSeen === null) return null;
  const recent = state.recent;
  const last = recent[recent.length - 1] ?? 0;
  const streak = consecutiveStreak(recent);
  const days = nextIntervalDays(streak, last >= 0.999);
  return state.lastSeen + days * DAY_MS;
}

export function consecutiveStreak(recent: number[]): number {
  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const score = recent[i] ?? 0;
    if (score >= 0.999) streak++;
    else break;
  }
  return streak;
}

function classify(daysUntilDue: number, attempts: number): ReviewRow["state"] {
  if (attempts === 0) return "fresh";
  if (daysUntilDue <= 0) return "due";
  if (daysUntilDue <= 1) return "soon";
  return "later";
}

/**
 * Build the review queue, most overdue first.
 *
 * `enabledIds` is applied here rather than at the call site so a disabled
 * chapter never shows up in "what should I revise today".
 */
export function buildReviewQueue(
  state: PersistedState,
  enabledIds: string[],
  now = Date.now(),
): ReviewRow[] {
  const enabled = new Set(enabledIds);
  const rows: ReviewRow[] = [];

  for (const chapterId of enabled) {
    const skill = getSkillState(state.skills, chapterId);
    if (skill.attempts === 0) continue;

    const dueAt = dueAtFor(skill);
    if (dueAt === null) continue;

    const dueInDays = (dueAt - now) / DAY_MS;
    // 0 at not-yet-due, 1 at a week overdue, saturating after that.
    const urgency =
      dueInDays <= 0 ? Math.min(1, -dueInDays / 7) : Math.max(0, 0.25 * (1 - dueInDays));

    rows.push({
      chapterId,
      streak: consecutiveStreak(skill.recent),
      urgency,
      dueInDays,
      dueAt,
      lastScore: skill.recent[skill.recent.length - 1] ?? 0,
      lastSeen: skill.lastSeen,
      attempts: skill.attempts,
      state: classify(dueInDays, skill.attempts),
    });
  }

  rows.sort((a, b) => {
    if (a.state === "due" && b.state !== "due") return -1;
    if (b.state === "due" && a.state !== "due") return 1;
    return b.urgency - a.urgency;
  });
  return rows;
}

export interface ReviewSummary {
  due: number;
  soon: number;
  later: number;
  fresh: number;
  /** Chapters eligible to be reviewed right now. */
  ready: number;
  nextDueAt: number | null;
}

export function summariseReview(rows: ReviewRow[]): ReviewSummary {
  const summary: ReviewSummary = {
    due: 0,
    soon: 0,
    later: 0,
    fresh: 0,
    ready: 0,
    nextDueAt: null,
  };
  for (const row of rows) {
    summary[row.state]++;
    if (row.state === "due") summary.ready++;
  }
  const future = rows.filter((r) => r.dueAt > Date.now()).map((r) => r.dueAt);
  summary.nextDueAt = future.length ? Math.min(...future) : null;
  return summary;
}

/** Chapters eligible right now: anything due, plus anything never attempted. */
export function dueChapterIds(
  state: PersistedState,
  enabledIds: string[],
  now = Date.now(),
): string[] {
  const enabled = new Set(enabledIds);
  const ready: string[] = [];
  for (const chapterId of enabled) {
    const skill = getSkillState(state.skills, chapterId);
    if (skill.attempts === 0) {
      ready.push(chapterId);
      continue;
    }
    const dueAt = dueAtFor(skill);
    if (dueAt !== null && dueAt <= now) ready.push(chapterId);
  }
  return ready;
}

/** Human phrasing for a due date, for the review list. */
export function describeDue(row: ReviewRow): string {
  if (row.state === "fresh") return "not started";
  if (row.dueInDays <= 0) {
    const overdue = Math.round(-row.dueInDays);
    if (overdue < 1) return "due now";
    if (overdue === 1) return "1 day overdue";
    return `${overdue} days overdue`;
  }
  if (row.dueInDays < 0.5) return "due in a few hours";
  const days = Math.max(1, Math.round(row.dueInDays));
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

/** A compact sparkline of recent accuracy for a chapter. */
export function accuracySparkline(answers: Answer[], chapterId: string, width = 28): number[] {
  const recent = answers
    .filter((a) => a.chapterId === chapterId)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-width)
    .map((a) => a.score);
  return recent;
}
