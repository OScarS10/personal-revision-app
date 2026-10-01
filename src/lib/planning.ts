import type { Answer, PersistedState, SkillInsight, SubjectId } from "@/lib/types";
import { buildReviewQueue } from "./spaced";

/*
  Exam countdown and daily plan.

  The gap this fills: the app could tell a learner what they were weak at, but
  not what to do about it today. Knowing you are weak in 4.3.1 is not a plan.

  The plan weights three things against each other, because a queue driven only
  by weakness produces the same six chapters every day and ignores an exam four
  weeks away:
  - how weak the chapter is,
  - how close the exam is,
  - whether the chapter is already due for spaced review.
*/

export interface PlanTask {
  chapterId: string;
  specRef: string;
  title: string;
  subject: SubjectId;
  /** What the learner should do, in plain words. */
  action: string;
  /** 0..1, for ordering. */
  priority: number;
  /** Why this is in today's plan, shown so it is not a black box. */
  reason: string;
  /** Estimated minutes, so the queue is a realistic amount of work. */
  minutes: number;
}

export interface StudyPlan {
  /**
   * The timestamp the plan was computed against.
   *
   * Returned so callers render countdowns from the same reading rather than
   * calling the clock again, which would be a second, disagreeing value.
   */
  now: number;
  /** Days until the soonest exam, or null when no date is set. */
  daysToExam: number | null;
  /** The soonest exam, for the countdown. */
  nextExam: { subject: SubjectId; at: number } | null;
  tasks: PlanTask[];
  /** Total estimated minutes in the plan. */
  totalMinutes: number;
  /** Chapters that are due for spaced review today. */
  dueToday: string[];
  /** True when there is nothing to do, rather than nothing to practise. */
  hasContent: boolean;
}

const DEFAULT_MINUTES = 6;

/**
 * Build today's plan.
 *
 * `now` is a parameter rather than read from the clock so the plan is testable
 * and so an exam date on the day itself does not depend on what time the page
 * was rendered.
 */
export function buildStudyPlan(
  state: PersistedState,
  insights: SkillInsight[],
  now = Date.now(),
): StudyPlan {
  const enabled = insights.filter((i) => i.enabled);

  const exams = Object.entries(state.examDates)
    .filter((entry): entry is [SubjectId, number] => typeof entry[1] === "number")
    .sort((a, b) => a[1] - b[1]);
  const nextExam = exams[0] ?? null;
  const daysToExam = nextExam ? daysBetween(now, nextExam[1]) : null;

  // Urgency: how much a chapter's exam proximity should raise its priority.
  const urgencyFor = (subject: SubjectId): number => {
    const at = state.examDates[subject];
    if (at === undefined) return 0;
    const days = daysBetween(now, at);
    if (days < 0) return 1;
    if (days === 0) return 1;
    if (days <= 7) return 0.9;
    if (days <= 21) return 0.7;
    if (days <= 60) return 0.45;
    if (days <= 120) return 0.25;
    return 0.1;
  };

  const review = buildReviewQueue(state, enabled.map((i) => i.chapterId), now);
  const due = new Set(review.filter((r) => r.state === "due").map((r) => r.chapterId));

  const tasks: PlanTask[] = [];

  for (const insight of enabled) {
    const untested = insight.attempts === 0;
    // Weakness, as a 0..1 urgency. An untested chapter is not known-weak, so it
    // does not jump the queue, but it is worth one diagnostic question.
    const weakness = untested ? 0.35 : insight.weakness;
    const urgency = urgencyFor(insight.subject);
    const isDue = due.has(insight.chapterId);

    /*
      Weighting. Exam proximity is the biggest lever because a chapter examined
      next week matters more than an equally weak one examined in six months, and
      that is the judgement the learner cannot make for themselves under deadline.
      Spaced-repetition due status adds a fixed bonus, and untested chapters get a
      small floor so coverage grows over time.
    */
    const priority = clamp01(
      weakness * 0.55 + urgency * 0.3 + (isDue ? 0.15 : 0) + (untested ? 0.08 : 0),
    );

    if (priority < 0.08) continue;

    const minutes = untested ? 4 : Math.round(DEFAULT_MINUTES * (1 + insight.weakness * 0.5));

    const reasons: string[] = [];
    if (untested) reasons.push("not attempted yet");
    else if (insight.weakness >= 0.6) reasons.push("one of your weakest chapters");
    if (isDue) reasons.push("due for review");
    if (urgency >= 0.7) reasons.push(daysToExam !== null && daysToExam <= 7 ? "exam this week" : "exam approaching");

    tasks.push({
      chapterId: insight.chapterId,
      specRef: insight.specRef,
      title: insight.title,
      subject: insight.subject,
      action: untested
        ? "Try a short set to find out where you stand."
        : isDue
          ? "Revise and retest, this one is coming back round."
          : "Practise and read the teaching notes.",
      priority,
      reason: reasons.length > 0 ? reasons.join(", ") : "steady revision",
      minutes,
    });
  }

  tasks.sort((a, b) => b.priority - a.priority);

  return {
    now,
    daysToExam,
    nextExam: nextExam ? { subject: nextExam[0], at: nextExam[1] } : null,
    tasks,
    totalMinutes: tasks.reduce((s, t) => s + t.minutes, 0),
    dueToday: [...due],
    hasContent: enabled.length > 0,
  };
}

/** A fair daily slice, scaled by how much time is actually available. */
export function dailySlice(plan: StudyPlan, availableMinutes = 60): PlanTask[] {
  const tasks: PlanTask[] = [];
  let used = 0;
  for (const task of plan.tasks) {
    if (used + task.minutes > availableMinutes) {
      // Always include at least one task, so an empty plan never looks like a
      // failure when there is genuinely something to do.
      if (tasks.length === 0) tasks.push(task);
      break;
    }
    tasks.push(task);
    used += task.minutes;
  }
  return tasks;
}

/**
 * Chapters the learner got wrong, for the notebook.
 *
 * Wrong rather than low-scoring: partial credit on an extended answer is
 * informative and should not land in a notebook of failures. Self-assessed
 * answers are included but marked, because a self-score of zero is the learner
 * saying they wrote nothing usable.
 */
export interface NotebookEntry {
  questionId: string;
  chapterId: string;
  specRef: string;
  template: string;
  prompt: string;
  yourAnswer: string;
  correctAnswer: string;
  marks: number;
  awardedMarks: number;
  at: number;
  selfAssessed: boolean;
  /** Times this question has now been answered wrongly. */
  timesWrong: number;
}

export function buildNotebook(state: PersistedState, limit = 100): NotebookEntry[] {
  const wrong = state.answers.filter((a) => a.awardedMarks < a.marks * 0.999);
  const times = new Map<string, number>();
  for (const a of state.answers) {
    if (a.awardedMarks < a.marks * 0.999) {
      times.set(a.questionId, (times.get(a.questionId) ?? 0) + 1);
    }
  }

  // The question prompt is not stored on the answer, so the notebook shows what
  // was asked as far as the record knows. Regenerating the question would give a
  // different instance, so the answer text is the useful part here.
  return wrong
    .slice(-limit)
    .reverse()
    .map((a: Answer) => ({
      questionId: a.questionId,
      chapterId: a.chapterId,
      specRef: a.specRef,
      template: a.template,
      prompt: `${a.specRef} — ${a.template}`,
      yourAnswer: a.response.filter((r) => r !== "").join(" | ") || "(no answer)",
      correctAnswer: "",
      marks: a.marks,
      awardedMarks: a.awardedMarks,
      at: a.timestamp,
      selfAssessed: a.selfAssessed === true,
      timesWrong: times.get(a.questionId) ?? 1,
    }));
}

/**
 * Whole days from one instant to another.
 *
 * Exam dates are stored at local midnight, so counting 24-hour blocks would
 * report an exam five calendar days away as four days when it is read at
 * lunchtime, and would shift again on a daylight-saving change. Comparing local
 * calendar days answers the question the learner is actually asking: how many
 * more days of revision are there.
 */
export function daysBetween(from: number, to: number): number {
  const a = new Date(from);
  const b = new Date(to);
  // Anchor both to UTC midnight, so the difference is in whole days and the
  // offset of the local zone cancels out.
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUtc - aUtc) / 86_400_000);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
