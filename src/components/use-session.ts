"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  Answer,
  Chapter,
  GeneratedQuestion,
  PersistedState,
  SkillInsight,
} from "@/lib/types";
import { markQuestion, toAnswer } from "@/lib/marking";
import type { MarkingResult } from "@/lib/marking";
import {
  nextDifficulty,
  nextQuestion,
  planSession,
  type SessionMode,
  type SessionPlan,
} from "@/lib/session";
import { getChapter } from "@/lib/specs";
import { createSkillState } from "@/lib/model";

/*
  The session engine.

  Shared by practice, mock and review so the three modes cannot drift apart.
  A mode only changes three things: whether feedback is shown immediately,
  whether there is a countdown, and how the chapter queue is built.
*/

export interface SessionEntry {
  question: GeneratedQuestion;
  phase: "answering" | "revealed" | "skipped";
  result: MarkingResult | null;
  answer: Answer | null;
  startedAt: number;
  elapsedMs: number;
  bookmarked: boolean;
}

export interface SessionSummary {
  mode: SessionMode;
  entries: SessionEntry[];
  attempted: number;
  correct: number;
  /** 0..1 across everything attempted. */
  accuracy: number;
  marksAwarded: number;
  marksAvailable: number;
  durationMs: number;
  /** Chapters touched, worst first. */
  breakdown: Array<{
    chapterId: string;
    specRef: string;
    title: string;
    attempted: number;
    correct: number;
  }>;
  hardest: { question: GeneratedQuestion; yours: string; correct: boolean }[];
  /** Mean difficulty encountered, for the "was this too hard?" read. */
  meanDifficulty: number;
}

export interface UseSessionOptions {
  mode: SessionMode;
  chapters: Chapter[];
  enabledIds: string[];
  state: PersistedState;
  insights: SkillInsight[];
  length: number;
  /** Seconds per question, or null for untimed. */
  perQuestionSeconds: number | null;
  seed?: string;
  onRecordAnswer(answer: Answer): void;
  onFinish(): void;
}

export interface SessionApi {
  entries: SessionEntry[];
  index: number;
  current: SessionEntry | null;
  plan: SessionPlan;
  /** Total questions, or null when the session is open-ended. */
  total: number | null;
  /** Absolute deadline for the question on screen, or null when untimed. */
  deadlineMs: number | null;
  finished: boolean;
  summary: SessionSummary | null;
  canUndo: boolean;

  submit(response: string[]): void;
  /** Auto-submit fired by the countdown when the time for a question runs out. */
  submitExpired(response: string[]): void;
  reveal(): void;
  skip(): void;
  next(): void;
  undo(): void;
  toggleBookmark(): void;
  restart(): void;
  exit(): void;
}

function makeSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSummary(
  mode: SessionMode,
  entries: SessionEntry[],
): SessionSummary {
  const answered = entries.filter((e) => e.answer !== null);
  const correct = answered.filter((e) => e.answer?.correct).length;
  const marksAwarded = answered.reduce((sum, e) => sum + (e.answer?.awardedMarks ?? 0), 0);
  const marksAvailable = answered.reduce((sum, e) => sum + (e.answer?.marks ?? 0), 0);

  const byChapter = new Map<string, { attempted: number; correct: number }>();
  for (const entry of answered) {
    const bucket = byChapter.get(entry.question.chapterId) ?? { attempted: 0, correct: 0 };
    bucket.attempted++;
    if (entry.answer?.correct) bucket.correct++;
    byChapter.set(entry.question.chapterId, bucket);
  }

  const breakdown = [...byChapter.entries()]
    .map(([chapterId, stats]) => {
      const chapter = getChapter(chapterId);
      return {
        chapterId,
        specRef: chapter?.specRef ?? "",
        title: chapter?.title ?? chapterId,
        attempted: stats.attempted,
        correct: stats.correct,
      };
    })
    .sort((a, b) => a.correct / a.attempted - b.correct / b.attempted);

  const hardest = [...entries]
    .filter((e) => e.answer !== null && !e.answer.correct)
    .sort((a, b) => b.question.difficulty - a.question.difficulty)
    .slice(0, 5)
    .map((e) => ({
      question: e.question,
      yours: e.answer?.response.join(", ") ?? "",
      correct: e.answer?.correct ?? false,
    }));

  const meanDifficulty =
    answered.length > 0
      ? answered.reduce((sum, e) => sum + e.question.difficulty, 0) / answered.length
      : 0;

  return {
    mode,
    entries,
    attempted: answered.length,
    correct,
    accuracy: answered.length > 0 ? correct / answered.length : 0,
    marksAwarded,
    marksAvailable,
    durationMs: answered.reduce((sum, e) => sum + e.elapsedMs, 0),
    breakdown,
    hardest,
    meanDifficulty,
  };
}

export function useSession(options: UseSessionOptions): SessionApi {
  const { mode, chapters, enabledIds, state, insights, length, perQuestionSeconds } = options;

  const [seed, setSeed] = useState(() => options.seed ?? makeSeed());
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  // Chapter order for this session, fixed at the start so it does not shuffle
  // under the learner mid-session.
  const plan = useMemo<SessionPlan>(
    () =>
      planSession({
        chapters,
        enabledIds,
        insights,
        state,
        mode,
        length,
        rng: seededRandom(`${seed}::plan`),
      }),
    // Rebuilt only when the session is (re)started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, mode, length],
  );

  const total = plan.queue.length > 0 ? plan.queue.length : null;

  /**
   * Build the question for a given queue position.
   *
   * Everything that varies - the answers already given this session, the recent
   * templates, the seed - is passed in rather than closed over. That keeps the
   * callback pure and referentially stable, so the first question can be built
   * in a lazy state initialiser, and restart can build from the new seed.
   */
  const build = useCallback(
    (
      position: number,
      priorAnswers: Answer[],
      sessionSeed: string,
      recentTemplates: string[],
    ): SessionEntry | null => {
      if (plan.queue.length === 0) return null;
      const chapterId = plan.queue[position % plan.queue.length];
      const chapter = getChapter(chapterId);
      if (!chapter) return null;

      // Difficulty reacts to how the learner has done *in this session*, plus
      // their established ability for the chapter.
      const skill = state.skills[chapterId] ?? createSkillState();
      const target = nextDifficulty(
        skill.theta,
        priorAnswers,
        state.config.stretch,
        seededRandom(`${sessionSeed}::${position}::${chapterId}`),
      );

      const question = nextQuestion(
        chapter,
        target,
        `${sessionSeed}::${position}::${chapterId}`,
        recentTemplates,
        state.templateStats,
      );
      if (!question) return null;

      return {
        question,
        phase: "answering",
        result: null,
        answer: null,
        startedAt: Date.now(),
        elapsedMs: 0,
        bookmarked: false,
      };
    },
    [plan.queue, state.skills, state.config.stretch, state.templateStats],
  );

  // The first question is derived, not something an effect has to push in after
  // the first render. Building it lazily also means the practice screen never
  // flashes empty while the plan resolves.
  const [entries, setEntries] = useState<SessionEntry[]>(() => {
    const first = build(0, [], seed, []);
    return first ? [first] : [];
  });

  /** Templates used so far this session, so a chapter does not repeat itself. */
  const recentTemplates = useMemo(
    () => entries.map((e) => e.question.template).slice(-12),
    [entries],
  );

  const current = entries[index] ?? null;

  const submit = useCallback(
    (response: string[], forcedElapsedMs?: number) => {
      setEntries((prev) => {
        const copy = [...prev];
        const target = copy[index];
        if (!target || target.phase !== "answering") return prev;
        const elapsed = forcedElapsedMs ?? Date.now() - target.startedAt;
        const result = markQuestion(target.question, response);
        const answer = toAnswer(target.question, result, elapsed, Date.now());
        copy[index] = {
          ...target,
          phase: "revealed",
          result,
          answer,
          elapsedMs: elapsed,
        };
        options.onRecordAnswer(answer);
        return copy;
      });
    },
    [index, options],
  );

  /**
   * Running out of time submits whatever was entered, exactly as a real paper
   * would. QuestionView owns the input, so it hands the response back here.
   */
  const submitExpired = useCallback(
    (response: string[]) => {
      if (perQuestionSeconds !== null) {
        submit(response, perQuestionSeconds * 1000);
      } else {
        submit(response);
      }
    },
    [submit, perQuestionSeconds],
  );

  const reveal = useCallback(() => {
    setEntries((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target || target.phase !== "answering") return prev;
      const elapsed = Date.now() - target.startedAt;
      // Revealing counts as an attempt scored zero, otherwise showing the answer
      // would silently improve the model's view of the learner.
      const result = markQuestion(target.question, "__skipped__");
      const answer = toAnswer(target.question, result, elapsed, Date.now());
      copy[index] = {
        ...target,
        phase: "skipped",
        result,
        answer,
        elapsedMs: elapsed,
      };
      options.onRecordAnswer(answer);
      return copy;
    });
  }, [index, options]);

  const skip = useCallback(() => {
    setEntries((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target || target.phase !== "answering") return prev;
      copy[index] = { ...target, phase: "skipped", result: null, answer: null };
      return copy;
    });
  }, [index]);

  const next = useCallback(() => {
    if (plan.queue.length === 0) return;
    const position = index + 1;
    if (position >= plan.queue.length) {
      setFinished(true);
      options.onFinish();
      return;
    }
    // Built here in the event handler rather than inside a state updater:
    // updaters must stay pure, and this keeps question generation off the
    // render path.
    if (!entries[position]) {
      const priorAnswers = entries
        .map((e) => e.answer)
        .filter((a): a is Answer => a !== null);
      const built = build(position, priorAnswers, seed, recentTemplates);
      if (!built) return;
      setEntries((cur) => (cur[position] ? cur : [...cur, built]));
    }
    setIndex(position);
  }, [index, entries, plan.queue.length, build, seed, recentTemplates, options]);

  const undo = useCallback(() => {
    setEntries((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
    setIndex((prev) => Math.max(0, prev - 1));
    setFinished(false);
  }, []);

  const toggleBookmark = useCallback(() => {
    setEntries((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      copy[index] = { ...target, bookmarked: !target.bookmarked };
      return copy;
    });
  }, [index]);

  const restart = useCallback(() => {
    const nextSeed = makeSeed();
    setSeed(nextSeed);
    setIndex(0);
    setFinished(false);
    // Built from the new seed explicitly: this callback runs before the
    // re-render that would have picked up the new plan and seed.
    setEntries(() => {
      const first = build(0, [], nextSeed, []);
      return first ? [first] : [];
    });
  }, [build]);

  const exit = useCallback(() => {
    setFinished(true);
    options.onFinish();
  }, [options]);

  const summary = useMemo(
    () => (finished ? buildSummary(mode, entries) : null),
    [finished, entries, mode],
  );

  /**
   * Absolute deadline for the question on screen, or null when untimed.
   *
   * Derived from the entry's own start time rather than tracked in a ref, so it
   * cannot drift and needs no cleanup when the question changes.
   */
  const deadlineMs = useMemo(() => {
    if (perQuestionSeconds === null || finished) return null;
    const entry = entries[index];
    if (!entry || entry.phase !== "answering") return null;
    return entry.startedAt + perQuestionSeconds * 1000;
  }, [perQuestionSeconds, entries, index, finished]);

  return {
    entries,
    index,
    current,
    plan,
    total,
    deadlineMs,
    finished,
    summary,
    canUndo: entries.length > 0,
    submit,
    submitExpired,
    reveal,
    skip,
    next,
    undo,
    toggleBookmark,
    restart,
    exit,
  };
}

/** Deterministic RNG so a session can be reproduced from its seed. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
