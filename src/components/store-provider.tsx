"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Answer, PersistedState, SubjectId } from "@/lib/types";
import "@/lib/generators/all";
import { createInitialState, loadState, safeStorage, saveState, localDateKey } from "@/lib/store";
import { recordTemplateStat } from "@/lib/calibration";
import type { StorageLike } from "@/lib/store";
import { applyAnswer, propagateAbilities } from "@/lib/model";
import { getChapters, SUBJECT_ORDER } from "@/lib/specs";

/*
  Registering the generators is a side effect of importing them.

  This has to happen from a client module. A server component that imports them
  populates the registry on the server, and the browser then has an empty
  registry - so the app still works, but silently serves only the shared recall
  questions and never a bespoke one. Nothing errors, which is why it is easy to
  miss.
*/

/*
  Client store, built as a real external store with useSyncExternalStore.

  Why not useState plus an effect: the app has to render an empty state on the
  server and the real localStorage state on the client, without a hydration
  mismatch and without a flash of empty content. useSyncExternalStore handles
  exactly that split, and it means the whole dataset can stay a single immutable
  JSON blob that is cheap to clone and trivial to write out in one go.
*/

// ----------------------------------------------------------- module-level store

const SERVER_STATE = createInitialState(0);

const backing = (() => {
  let current: PersistedState = SERVER_STATE;
  const listeners = new Set<() => void>();
  let storage: StorageLike | null = null;
  let hydrated = false;
  let storageError: string | null = null;

  // Hydrate at module evaluation, not in an effect, so the very first client
  // render already has real data and nothing flashes.
  if (typeof window !== "undefined") {
    storage = safeStorage();
    current = loadState(storage);
    hydrated = true;
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  function commit(next: PersistedState) {
    current = next;
    const result = saveState(storage, next);
    if (result.error !== storageError) storageError = result.error;
    emit();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => current,
    getServerSnapshot: () => SERVER_STATE,
    getHydrated: () => hydrated,
    getStorageError: () => storageError,
    commit,
    allChapters: () => SUBJECT_ORDER.flatMap((s) => getChapters(s)),
  };
})();

// ------------------------------------------------------------------- context

export interface StoreValue {
  state: PersistedState;
  hydrated: boolean;
  storageError: string | null;

  toggleChapter(subject: SubjectId, chapterId: string): void;
  setChapters(subject: SubjectId, chapterIds: string[]): void;
  recordAnswer(answer: Answer): void;
  recordSession(): void;
  undoLastAnswer(): void;
  replaceState(next: PersistedState): void;
  resetAll(): void;
  resetSubject(subject: SubjectId): void;
  setExamDate(subject: SubjectId, at: number | null): void;
  markExported(): void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(backing.subscribe, backing.getSnapshot, backing.getServerSnapshot);
  const hydrated = useSyncExternalStore(backing.subscribe, backing.getHydrated, () => false);
  const storageError = useSyncExternalStore(
    backing.subscribe,
    backing.getStorageError,
    () => null,
  );

  const toggleChapter = useCallback((subject: SubjectId, chapterId: string) => {
    const prev = backing.getSnapshot();
    const current = prev.enabled[subject] ?? [];
    const next = current.includes(chapterId)
      ? current.filter((id) => id !== chapterId)
      : [...current, chapterId];
    backing.commit({ ...prev, enabled: { ...prev.enabled, [subject]: next } });
  }, []);

  const setChapters = useCallback((subject: SubjectId, chapterIds: string[]) => {
    const prev = backing.getSnapshot();
    backing.commit({ ...prev, enabled: { ...prev.enabled, [subject]: chapterIds } });
  }, []);

  const recordAnswer = useCallback((answer: Answer) => {
    const prev = backing.getSnapshot();
    const skills = applyAnswer(prev.skills, answer, prev.config, answer.timestamp);
    const propagated = propagateAbilities(skills, backing.allChapters(), prev.config);

    const key = localDateKey(answer.timestamp);
    const day = prev.daily[key] ?? { attempted: 0, correct: 0 };

    backing.commit({
      ...prev,
      skills: propagated,
      answers: [...prev.answers, answer],
      recentItemIds: [answer.questionId, ...prev.recentItemIds].slice(0, 200),
      // Feeds difficulty calibration. Only machine-marked answers count as
      // evidence about the template's difficulty: a self-assessed score reflects
      // the learner's generosity as much as the question's difficulty, so
      // folding it in would calibrate the model towards whatever the learner
      // was feeling when they marked themselves.
      templateStats: answer.selfAssessed
        ? prev.templateStats
        : recordTemplateStat(prev.templateStats, answer.template, {
            score: answer.score,
            difficulty: answer.difficulty,
            at: answer.timestamp,
          }),
      daily: {
        ...prev.daily,
        [key]: {
          attempted: day.attempted + 1,
          correct: day.correct + (answer.correct ? 1 : 0),
        },
      },
    });
  }, []);

  /**
   * Remove the most recent attempt and roll the model back.
   *
   * The update is not analytically invertible, so the affected skills are
   * rebuilt by replaying the remaining history that touched them. Only the
   * undone answer's own skills are affected, which keeps this cheap.
   */
  const undoLastAnswer = useCallback(() => {
    const prev = backing.getSnapshot();
    if (prev.answers.length === 0) return;

    const last = prev.answers[prev.answers.length - 1];
    const remaining = prev.answers.slice(0, -1);
    const touched = new Set<string>([last.chapterId, ...last.skillIds]);

    let skills: PersistedState["skills"] = { ...prev.skills };
    for (const id of touched) delete skills[id];

    for (const answer of remaining) {
      const affects = [answer.chapterId, ...answer.skillIds].some((id) => touched.has(id));
      if (affects) skills = applyAnswer(skills, answer, prev.config, answer.timestamp);
    }

    // Roll the daily tally back as well, so the streak does not count a
    // question the learner has just taken back.
    const key = localDateKey(last.timestamp);
    const daily = { ...prev.daily };
    const existing = daily[key];
    if (existing) {
      const attempted = existing.attempted - 1;
      if (attempted <= 0) delete daily[key];
      else daily[key] = { attempted, correct: Math.max(0, existing.correct - (last.correct ? 1 : 0)) };
    }

    backing.commit({
      ...prev,
      skills: propagateAbilities(skills, backing.allChapters(), prev.config),
      answers: remaining,
      recentItemIds: prev.recentItemIds.filter((id) => id !== last.questionId),
      daily,
    });
  }, []);

  const recordSession = useCallback(() => {
    const prev = backing.getSnapshot();
    backing.commit({ ...prev, sessions: prev.sessions + 1 });
  }, []);

  const replaceState = useCallback((next: PersistedState) => {
    backing.commit(next);
  }, []);

  const resetSubject = useCallback((subject: SubjectId) => {
    const prev = backing.getSnapshot();
    const ids = new Set(getChapters(subject).map((c) => c.id));
    const skills = { ...prev.skills };
    for (const id of ids) delete skills[id];
    backing.commit({
      ...prev,
      skills,
      answers: prev.answers.filter((a) => !ids.has(a.chapterId)),
      enabled: {
        ...prev.enabled,
        [subject]: getChapters(subject).filter((c) => c.asLevel).map((c) => c.id),
      },
    });
  }, []);

  const resetAll = useCallback(() => {
    backing.commit(createInitialState());
  }, []);

  /*
    Exam dates drive the study plan's weighting, so a null clears the entry
    rather than storing a sentinel date. A past date is kept rather than
    rejected: an exam that has already happened should make the plan stop
    prioritising it, not disappear from the record.
  */
  const setExamDate = useCallback((subject: SubjectId, at: number | null) => {
    const prev = backing.getSnapshot();
    const examDates = { ...prev.examDates };
    if (at === null) delete examDates[subject];
    else examDates[subject] = at;
    backing.commit({ ...prev, examDates });
  }, []);

  /*
    Recording an export is what drives the backup nudge. Without it there is no
    signal that the learner has a copy, and since clearing site data destroys
    everything, the prompt has to be based on evidence rather than nagging.
  */
  const markExported = useCallback(() => {
    const prev = backing.getSnapshot();
    backing.commit({ ...prev, lastExportAt: Date.now() });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      hydrated,
      storageError,
      toggleChapter,
      setChapters,
      recordAnswer,
      recordSession,
      undoLastAnswer,
      replaceState,
      resetAll,
      resetSubject,
      setExamDate,
      markExported,
    }),
    [
      state,
      hydrated,
      storageError,
      toggleChapter,
      setChapters,
      recordAnswer,
      recordSession,
      undoLastAnswer,
      replaceState,
      resetAll,
      resetSubject,
      setExamDate,
      markExported,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

const FALLBACK: StoreValue = {
  state: SERVER_STATE,
  hydrated: false,
  storageError: null,
  toggleChapter: () => {},
  setChapters: () => {},
  recordAnswer: () => {},
  recordSession: () => {},
  undoLastAnswer: () => {},
  replaceState: () => {},
  resetAll: () => {},
  resetSubject: () => {},
  setExamDate: () => {},
  markExported: () => {},
};

export function useStore(): StoreValue {
  return useContext(StoreContext) ?? FALLBACK;
}

/** Enabled chapter ids for one subject, in specification order. */
export function useEnabledChapters(subject: SubjectId): string[] {
  const { state } = useStore();
  return useMemo(() => state.enabled[subject] ?? [], [state.enabled, subject]);
}

