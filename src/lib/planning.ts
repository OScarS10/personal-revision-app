import type { Answer, PersistedState } from "@/lib/types";

/*
  Wrong-answer notebook and exam-date arithmetic.

  This used to also build the daily study plan. The plan is gone: it ranked
  chapters by weakness, exam proximity and review-due status, and in practice it
  said the same thing the Review queue and the Analysis page already said, one
  layer of indirection further away. Removing it leaves the two things here that
  nothing else computes: what the learner got wrong, and how many calendar days
  separate two instants.

  The notebook is deliberately keyed on the stored answer rather than the
  question, because questions are regenerated and a retake is a different
  instance. See buildNotebook for why that matters.
*/

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