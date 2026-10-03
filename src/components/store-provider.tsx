"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Answer, PersistedState, SkillState, SubjectId, TemplateStat } from "@/lib/types";
import "@/lib/generators/all";
import { createInitialState, loadState, safeStorage, saveState, localDateKey } from "@/lib/store";
import { recordTemplateStat } from "@/lib/calibration";
import type { StorageLike } from "@/lib/store";
import { applyAnswer, propagateAbilities } from "@/lib/model";
import { getChapters, SUBJECT_ORDER } from "@/lib/specs";
import type { DifficultyPreference } from "@/lib/difficulty";
import type { Calibration } from "@/lib/auto-mark";
import { useAuth } from "@/components/auth-provider";

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
  /** Fold one self-mark comparison into the automatic marker's calibration. */
  setAutoMarkCalibration(calibration: Calibration): void;
  setDifficulty(preference: DifficultyPreference): void;
  markExported(): void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, accessToken } = useAuth();
  const state = useSyncExternalStore(backing.subscribe, backing.getSnapshot, backing.getServerSnapshot);
  const hydrated = useSyncExternalStore(backing.subscribe, backing.getHydrated, () => false);
  const storageError = useSyncExternalStore(
    backing.subscribe,
    backing.getHydrated,
    () => null,
  );

  // Track sync state
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Sync functions defined inside component to access user/accessToken
  const pushToServer = useCallback(async (state: PersistedState, since: number) => {
    if (!user || !accessToken) return;

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          answers: state.answers.filter((a) => a.timestamp >= since),
          sessions: [],
          skills: Object.entries(state.skills).map(([id, skill]) => ({ id, ...skill })),
          dailyStats: Object.entries(state.daily)
            .filter(([date]) => new Date(date).getTime() >= since)
            .map(([id, stat]) => ({ id, ...stat })),
          templateStats: Object.entries(state.templateStats).map(([id, stat]) => ({ id, ...stat })),
          bookmarks: [],
        }),
      });

      if (!response.ok) {
        throw new Error("Push failed");
      }
    } catch (error) {
      console.warn("Push to server failed:", error);
    }
  }, [user, accessToken]);

  const pullFromServer = useCallback(async (since: number) => {
    if (!user || !accessToken) return null;

    try {
      const sinceDate = new Date(since);
      const response = await fetch(`/api/sync?since=${sinceDate.toISOString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error("Pull failed");
      }

      return await response.json();
    } catch (error) {
      console.warn("Pull from server failed:", error);
      return null;
    }
  }, [user, accessToken]);

  /**
  A row as `/api/sync` returns it: raw database columns, so snake_case.
 *
  These shapes existed only inside an `any` before. That is not a style complaint -
  the merge below was reading `a.questionId` off rows that only have
 * `question_id`, so every pulled answer was silently dropped by the dedupe filter
  and any skill row was written straight into the store with the wrong keys.
 */
interface RemoteRow {
  [column: string]: unknown;
}

interface RemoteState {
  answers?: RemoteRow[];
  skills?: RemoteRow[];
  dailyStats?: RemoteRow[];
  templateStats?: RemoteRow[];
}

/** Read a column as a number, falling back rather than yielding NaN. */
function remoteNum(row: RemoteRow, column: string, fallback = 0): number {
  const value = row[column];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function remoteStr(row: RemoteRow, column: string): string {
  const value = row[column];
  return typeof value === "string" ? value : "";
}

/** Database rows to an `Answer`, or null if the row is too incomplete to be one. */
function toAnswer(row: RemoteRow): Answer | null {
  const questionId = remoteStr(row, "question_id") || remoteStr(row, "questionId");
  if (!questionId) return null;

  let response: string[] = [];
  try {
    const parsed: unknown = JSON.parse(remoteStr(row, "response") || "[]");
    if (Array.isArray(parsed)) response = parsed.map((v) => String(v));
  } catch {
    // A row whose response is not valid JSON is skipped rather than recorded as an
    // empty answer, which would look like the learner deliberately left it blank.
    return null;
  }

  let skillIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(remoteStr(row, "skill_ids") || "[]");
    if (Array.isArray(parsed)) skillIds = parsed.map((v) => String(v));
  } catch {
    skillIds = [];
  }

  return {
    questionId,
    chapterId: remoteStr(row, "chapter_id"),
    skillIds,
    specRef: remoteStr(row, "spec_ref"),
    difficulty: remoteNum(row, "difficulty"),
    response,
    correct: Boolean(row.correct),
    score: remoteNum(row, "score"),
    marks: remoteNum(row, "marks"),
    awardedMarks: remoteNum(row, "awarded_marks"),
    durationMs: remoteNum(row, "duration_ms"),
    timestamp: remoteNum(row, "timestamp"),
    template: remoteStr(row, "template"),
    assessesMastery: Boolean(row.assesses_mastery),
  };
}

const mergeRemoteState = useCallback((remote: RemoteState) => {
    const prev = backing.getSnapshot();

    // Merge answers, deduplicated on questionId + timestamp so a re-pull of the same
    // window cannot duplicate history.
    const existingAnswers = new Set(prev.answers.map((a) => `${a.questionId}-${a.timestamp}`));
    const pulled = (remote.answers ?? []).map(toAnswer).filter((a): a is Answer => a !== null);
    const newAnswers = pulled.filter((a) => !existingAnswers.has(`${a.questionId}-${a.timestamp}`));

    // Merge skills (remote wins if newer)
    const skills = { ...prev.skills };
    for (const row of remote.skills ?? []) {
      const id = remoteStr(row, "id");
      if (!id) continue;
      const lastSeen = remoteNum(row, "last_seen", remoteNum(row, "updatedAt"));
      const existing = skills[id];
      if (!existing || lastSeen > (existing.lastSeen ?? 0)) {
        skills[id] = {
          ...existing,
          id,
          lastSeen,
        } as SkillState;
      }
    }

    // Merge daily stats (summed, because both sides have counted their own answers)
    const daily = { ...prev.daily };
    for (const row of remote.dailyStats ?? []) {
      // The date is the key, stored as `id` in the synced column set.
      const id = remoteStr(row, "id") || remoteStr(row, "date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) continue;
      const existing = daily[id];
      if (existing) {
        daily[id] = {
          attempted: existing.attempted + remoteNum(row, "attempted"),
          correct: existing.correct + remoteNum(row, "correct"),
        };
      } else {
        daily[id] = {
          attempted: remoteNum(row, "attempted"),
          correct: remoteNum(row, "correct"),
        };
      }
    }

    // Merge template stats (remote wins if newer)
    const templateStats = { ...prev.templateStats };
    for (const row of remote.templateStats ?? []) {
      const id = remoteStr(row, "id") || remoteStr(row, "template");
      if (!id) continue;
      const lastSeen = remoteNum(row, "last_seen", remoteNum(row, "lastSeen"));
      const existing = templateStats[id];
      if (!existing || lastSeen > (existing.lastSeen ?? 0)) {
        templateStats[id] = {
          ...existing,
          id,
          lastSeen,
        } as TemplateStat;
      }
    }

    backing.commit({
      ...prev,
      skills,
      answers: [...prev.answers, ...newAnswers],
      daily,
      templateStats,
    });
  }, []);

  // Sync with online database when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user || !accessToken) return;

    let mounted = true;
    let syncInterval: ReturnType<typeof setInterval> | null = null;
    let syncingRef = false;

    const doSync = async () => {
      if (!mounted || syncingRef) return;
      syncingRef = true;
      setSyncing(true);

      try {
        const state = backing.getSnapshot();
        const since = lastSync ?? Date.now() - 30 * 24 * 60 * 60 * 1000;

        await pushToServer(state, since);

        const remote = await pullFromServer(since);
        if (remote && mounted) {
          mergeRemoteState(remote);
        }

        if (mounted) setLastSync(Date.now());
      } catch (error) {
        console.warn("Sync failed:", error);
      } finally {
        syncingRef = false;
        if (mounted) setSyncing(false);
      }
    };

    doSync();

    syncInterval = setInterval(doSync, 5 * 60 * 1000);

    return () => {
      mounted = false;
      if (syncInterval) clearInterval(syncInterval);
    };
  }, [isAuthenticated, user, accessToken, lastSync, pushToServer, pullFromServer, mergeRemoteState]);

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

  const setDifficulty = useCallback((preference: DifficultyPreference) => {
    const prev = backing.getSnapshot();
    if (prev.config.difficulty === preference) return;
    backing.commit({ ...prev, config: { ...prev.config, difficulty: preference } });
  }, []);

  const recordAnswer = useCallback((answer: Answer) => {
    const prev = backing.getSnapshot();
    const skills = applyAnswer(prev.skills, answer, prev.config, answer.timestamp);
    const propagated = propagateAbilities(skills, backing.allChapters(), prev.config);

    const key = localDateKey(answer.timestamp);
    const day = prev.daily[key] ?? { attempted: 0, correct: 0, durationMs: 0, sessions: 0 };

    backing.commit({
      ...prev,
      skills: propagated,
      answers: [...prev.answers, answer],
      recentItemIds: [answer.questionId, ...prev.recentItemIds].slice(0, 200),
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
          durationMs: (day.durationMs ?? 0) + answer.durationMs,
          sessions: (day.sessions ?? 0) + 1,
        },
      },
    });
  }, []);

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

  const setExamDate = useCallback((subject: SubjectId, at: number | null) => {
    const prev = backing.getSnapshot();
    const examDates = { ...prev.examDates };
    if (at === null) delete examDates[subject];
    else examDates[subject] = at;
    backing.commit({ ...prev, examDates });
  }, []);

  const markExported = useCallback(() => {
    const prev = backing.getSnapshot();
    backing.commit({ ...prev, lastExportAt: Date.now() });
  }, []);

  const setAutoMarkCalibration = useCallback((calibration: Calibration) => {
    const prev = backing.getSnapshot();
    // Guard against a stale write from an abandoned question: a calibration that
    // has fewer samples than the stored one is an older answer arriving late, and
    // accepting it would roll the marker's adjustment backwards.
    if (calibration.samples < prev.autoMarkCalibration.samples) return;
    backing.commit({ ...prev, autoMarkCalibration: calibration });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      hydrated,
      storageError: null,
      toggleChapter,
      setChapters,
      recordAnswer,
      recordSession,
      undoLastAnswer,
      replaceState,
      resetAll,
      resetSubject,
      setExamDate,
      setAutoMarkCalibration,
      markExported,
      setDifficulty,
    }),
    [
      state,
      hydrated,
      toggleChapter,
      setChapters,
      recordAnswer,
      recordSession,
      undoLastAnswer,
      replaceState,
      resetAll,
      resetSubject,
      setExamDate,
      setAutoMarkCalibration,
      setDifficulty,
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
  setAutoMarkCalibration: () => {},
  setDifficulty: () => {},
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