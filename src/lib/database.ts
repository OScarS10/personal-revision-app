import Dexie, { type Table } from "dexie";
import type {
  Answer,
  PersistedState,
  SkillState,
  TemplateStat,
  SubjectId,
} from "@/lib/types";

/**
 * Specwise Database - IndexedDB wrapper using Dexie
 *
 * This provides a robust local database for logging all learner data:
 * - Answers with full marking details
 * - Session metadata
 * - Skill states per chapter
 * - Daily aggregates
 * - Template statistics
 * - Bookmarks
 * - Sync queue for optional server sync
 *
 * The database is designed to be the source of truth for analytics and
 * long-term progress tracking, while localStorage remains the fast path
 * for the session engine.
 */

export type ChapterId = string;

export interface StoredAnswer extends Answer {
  id?: number;
  synced: boolean;
  syncedAt: number | null;
}

export interface StoredSession {
  id?: number;
  mode: "practice" | "test" | "review" | "infinite";
  subject: SubjectId;
  startedAt: number;
  endedAt: number | null;
  length: number | "infinite";
  questionCount: number;
  correctCount: number;
  accuracy: number;
  durationMs: number;
  chapters: string[];
  synced: boolean;
  syncedAt: number | null;
}

export interface StoredSkill {
  id?: string;
  subject: SubjectId;
  chapterId: ChapterId;
  theta: number;
  alpha: number;
  beta: number;
  pLearned: number;
  attempts: number;
  correct: number;
  recent: number[];
  information: number;
  lastSeen: number | null;
  avgDurationMs: number;
  difficultySum: number;
  inferredOnly: boolean;
  updatedAt: number;
  synced: boolean;
}

export interface StoredDailyStat {
  id?: string;
  date: string; // YYYY-MM-DD
  subject: SubjectId;
  attempted: number;
  correct: number;
  durationMs: number;
  sessions: number;
  synced: boolean;
}

export interface StoredTemplateStat {
  id?: string;
  templateKey: string;
  subject: SubjectId;
  chapterId: ChapterId;
  attempts: number;
  correct: number;
  scoreSum: number;
  difficultySum: number;
  lastSeen: number;
  synced: boolean;
}

export interface StoredBookmark {
  id?: number;
  questionId: string;
  chapterId: ChapterId;
  subject: SubjectId;
  specRef: string;
  difficulty: number;
  createdAt: number;
  synced: boolean;
}

export interface SyncQueueItem {
  id?: number;
  table: string;
  operation: "insert" | "update" | "delete";
  data: unknown;
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

class SpecwiseDatabase extends Dexie {
  answers!: Table<StoredAnswer, number>;
  sessions!: Table<StoredSession, number>;
  skills!: Table<StoredSkill, string>;
  dailyStats!: Table<StoredDailyStat, string>;
  templateStats!: Table<StoredTemplateStat, string>;
  bookmarks!: Table<StoredBookmark, number>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("specwise-db");
    this.version(1).stores({
      answers: "++id, questionId, chapterId, subject, timestamp, synced",
      sessions: "++id, subject, startedAt, endedAt, synced",
      skills: "id, subject, chapterId, updatedAt, synced",
      dailyStats: "id, date, subject, synced",
      templateStats: "id, templateKey, subject, chapterId, synced",
      bookmarks: "++id, questionId, chapterId, subject, createdAt, synced",
      syncQueue: "++id, table, operation, createdAt",
    });
  }
}

export const db = new SpecwiseDatabase();

/**
 * Database service - high-level operations for the app
 */
export class DatabaseService {
  private static instance: DatabaseService | null = null;

  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // ---- Answers ----

  async logAnswer(answer: Answer): Promise<number> {
    const stored: Omit<StoredAnswer, "id"> = {
      ...answer,
      synced: false,
      syncedAt: null,
    };
    return await db.answers.add(stored as StoredAnswer);
  }

  async getAnswers(
    options: {
      chapterId?: ChapterId;
      subject?: SubjectId;
      since?: number;
      limit?: number;
    } = {}
  ): Promise<StoredAnswer[]> {
    let query = db.answers.orderBy("timestamp").reverse();

    if (options.since) {
      query = query.filter((a) => a.timestamp >= options.since!);
    }
    if (options.chapterId) {
      query = query.filter((a) => a.chapterId === options.chapterId);
    }
    if (options.subject) {
      query = query.filter((a) => {
        const chapter = getChapterFromId(a.chapterId);
        return chapter?.subject === options.subject;
      });
    }

    const results = await query.limit(options.limit ?? 1000).toArray();
    return results;
  }

  async markAnswersSynced(ids: number[]): Promise<void> {
    await db.answers.where("id").anyOf(ids).modify({ synced: true, syncedAt: Date.now() });
  }

  async getUnsyncedAnswers(): Promise<StoredAnswer[]> {
    return await db.answers.where("synced").equals(0).toArray();
  }

  // ---- Sessions ----

  async logSession(
    session: Omit<StoredSession, "id" | "synced" | "syncedAt">
  ): Promise<number> {
    return await db.sessions.add({
      ...session,
      synced: false,
      syncedAt: null,
    } as StoredSession);
  }

  async getSessions(
    options: { subject?: SubjectId; since?: number; limit?: number } = {}
  ): Promise<StoredSession[]> {
    let query = db.sessions.orderBy("startedAt").reverse();

    if (options.since) {
      query = query.filter((s) => s.startedAt >= options.since!);
    }
    if (options.subject) {
      query = query.filter((s) => s.subject === options.subject);
    }

    return await query.limit(options.limit ?? 100).toArray();
  }

  async markSessionSynced(id: number): Promise<void> {
    await db.sessions.update(id, { synced: true, syncedAt: Date.now() });
  }

  // ---- Skills ----

  async upsertSkill(skill: Omit<StoredSkill, "synced">): Promise<void> {
    await db.skills.put({ ...skill, synced: false } as StoredSkill);
  }

  async getSkills(subject?: SubjectId): Promise<StoredSkill[]> {
    let query = db.skills.toCollection();
    if (subject) {
      query = query.filter((s) => s.subject === subject);
    }
    return await query.toArray();
  }

  async markSkillsSynced(ids: string[]): Promise<void> {
    await db.skills.where("id").anyOf(ids).modify({ synced: true });
  }

  // ---- Daily Stats ----

  async incrementDailyStat(
    date: string,
    subject: SubjectId,
    delta: { attempted: number; correct: number; durationMs: number; sessions: number }
  ): Promise<void> {
    const key = `${date}|${subject}`;
    const existing = await db.dailyStats.get(key);

    if (existing) {
      await db.dailyStats.update(key, {
        attempted: existing.attempted + delta.attempted,
        correct: existing.correct + delta.correct,
        durationMs: existing.durationMs + delta.durationMs,
        sessions: existing.sessions + delta.sessions,
        synced: false,
      });
    } else {
      await db.dailyStats.add({
        id: key,
        date,
        subject,
        ...delta,
        synced: false,
      } as StoredDailyStat);
    }
  }

  async getDailyStats(
    options: { subject?: SubjectId; since?: string; limit?: number } = {}
  ): Promise<StoredDailyStat[]> {
    let query = db.dailyStats.orderBy("date").reverse();

    if (options.since) {
      query = query.filter((d) => d.date >= options.since!);
    }
    if (options.subject) {
      query = query.filter((d) => d.subject === options.subject);
    }

    return await query.limit(options.limit ?? 365).toArray();
  }

  // ---- Template Stats ----

  async upsertTemplateStat(
    stat: Omit<StoredTemplateStat, "synced">
  ): Promise<void> {
    await db.templateStats.put({ ...stat, synced: false } as StoredTemplateStat);
  }

  async getTemplateStats(subject?: SubjectId): Promise<StoredTemplateStat[]> {
    let query = db.templateStats.toCollection();
    if (subject) {
      query = query.filter((s) => s.subject === subject);
    }
    return await query.toArray();
  }

  // ---- Bookmarks ----

  async addBookmark(
    bookmark: Omit<StoredBookmark, "id" | "synced">
  ): Promise<number> {
    return await db.bookmarks.add({
      ...bookmark,
      synced: false,
    } as StoredBookmark);
  }

  async removeBookmark(questionId: string): Promise<void> {
    await db.bookmarks.where("questionId").equals(questionId).delete();
  }

  async getBookmarks(subject?: SubjectId): Promise<StoredBookmark[]> {
    let query = db.bookmarks.orderBy("createdAt").reverse();
    if (subject) {
      query = query.filter((b) => b.subject === subject);
    }
    return await query.toArray();
  }

  async isBookmarked(questionId: string): Promise<boolean> {
    const count = await db.bookmarks.where("questionId").equals(questionId).count();
    return count > 0;
  }

  // ---- Sync Queue ----

  async enqueueSync(
    table: string,
    operation: "insert" | "update" | "delete",
    data: unknown
  ): Promise<void> {
    await db.syncQueue.add({
      table,
      operation,
      data,
      createdAt: Date.now(),
      attempts: 0,
      lastError: null,
    });
  }

  async getPendingSync(limit = 100): Promise<SyncQueueItem[]> {
    return await db.syncQueue.orderBy("createdAt").limit(limit).toArray();
  }

  async markSyncSuccess(id: number): Promise<void> {
    await db.syncQueue.delete(id);
  }

  async markSyncFailure(id: number, error: string): Promise<void> {
    await db.syncQueue.update(id, {
      attempts: ((await db.syncQueue.get(id))?.attempts ?? 0) + 1,
      lastError: error,
    });
  }

  // ---- Bulk Operations ----

  /**
   * Import all data from localStorage state into the database.
   * Called on first load or when user explicitly syncs.
   */
  async importFromLocalStorage(state: PersistedState): Promise<void> {
    await db.transaction("rw", db.answers, db.sessions, db.skills, db.dailyStats, db.templateStats, async () => {
      // Clear existing unsynced data to avoid duplicates on re-import
      await db.answers.where("synced").equals(0).delete();
      await db.sessions.where("synced").equals(0).delete();
      await db.skills.where("synced").equals(0).delete();
      await db.dailyStats.where("synced").equals(0).delete();
      await db.templateStats.where("synced").equals(0).delete();

      // Import answers
      if (state.answers.length > 0) {
        await db.answers.bulkAdd(
          state.answers.map((a) => ({
            ...a,
            synced: false,
            syncedAt: null,
          } as StoredAnswer))
        );
      }

      // Import skills
      if (Object.keys(state.skills).length > 0) {
        await db.skills.bulkPut(
          Object.entries(state.skills).map(([id, skill]) => ({
            id,
            subject: (id.split(".")[0] as SubjectId) || "edexcel-mathematics",
            chapterId: id as ChapterId,
            ...skill,
            updatedAt: Date.now(),
            synced: false,
          } as StoredSkill))
        );
      }

      // Import daily stats
      if (Object.keys(state.daily).length > 0) {
        const firstSkillSubject = Object.keys(state.skills)[0]?.split(".")[0] as SubjectId || "edexcel-mathematics";
        await db.dailyStats.bulkPut(
          Object.entries(state.daily).map(([date, stat]) => ({
            id: `${date}|${firstSkillSubject}`,
            date,
            subject: firstSkillSubject,
            ...stat,
            synced: false,
          } as StoredDailyStat))
        );
      }

      // Import template stats
      if (Object.keys(state.templateStats).length > 0) {
        await db.templateStats.bulkPut(
          Object.entries(state.templateStats).map(([key, stat]) => ({
            id: key,
            templateKey: key,
            subject: "edexcel-mathematics",
            chapterId: "" as ChapterId,
            ...stat,
            synced: false,
          } as StoredTemplateStat))
        );
      }
    });
  }

  // ---- Analytics Queries ----

  async getAccuracyByChapter(
    subject: SubjectId,
    since?: number
  ): Promise<
    Array<{
      chapterId: ChapterId;
      specRef: string;
      title: string;
      attempted: number;
      correct: number;
      accuracy: number;
    }>
  > {
    const answers = await this.getAnswers({ subject, since });
    const byChapter = new Map<ChapterId, { attempted: number; correct: number }>();

    for (const a of answers) {
      const existing = byChapter.get(a.chapterId) || { attempted: 0, correct: 0 };
      existing.attempted += 1;
      if (a.correct) existing.correct += 1;
      byChapter.set(a.chapterId, existing);
    }

    // Get chapter titles from specs
    const { getChapter } = await import("@/lib/specs");

    return Array.from(byChapter.entries()).map(([chapterId, stats]) => {
      const chapter = getChapter(chapterId);
      return {
        chapterId,
        specRef: chapter?.specRef ?? "",
        title: chapter?.title ?? "",
        ...stats,
        accuracy: stats.attempted > 0 ? stats.correct / stats.attempted : 0,
      };
    });
  }

  async getDailyProgress(
    subject: SubjectId,
    days: number
  ): Promise<Array<{ date: string; attempted: number; correct: number; accuracy: number }>> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const since = cutoff.toISOString().split("T")[0];

    const stats = await this.getDailyStats({ subject, since });
    return stats.map((s) => ({
      date: s.date,
      attempted: s.attempted,
      correct: s.correct,
      accuracy: s.attempted > 0 ? s.correct / s.attempted : 0,
    }));
  }

  async getWeakChapters(subject: SubjectId, limit = 5): Promise<
    Array<{
      chapterId: ChapterId;
      specRef: string;
      title: string;
      accuracy: number;
      attempted: number;
    }>
  > {
    const byChapter = await this.getAccuracyByChapter(subject);
    return byChapter
      .filter((c) => c.attempted >= 3) // Minimum attempts for reliability
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, limit);
  }

  // ---- Clear/Reset ----

  async clearAllData(): Promise<void> {
    await db.delete();
    await db.open();
  }

  async clearUnsynced(): Promise<void> {
    await db.transaction("rw", db.answers, db.sessions, db.skills, db.dailyStats, db.templateStats, async () => {
      await db.answers.where("synced").equals(0).delete();
      await db.sessions.where("synced").equals(0).delete();
      await db.skills.where("synced").equals(0).delete();
      await db.dailyStats.where("synced").equals(0).delete();
      await db.templateStats.where("synced").equals(0).delete();
    });
  }
}

export const databaseService = DatabaseService.getInstance();

// Helper to get chapter info from ID (cached)
const chapterCache = new Map<string, { subject: SubjectId; specRef: string } | null>();

function getChapterFromId(chapterId: string): { subject: SubjectId; specRef: string } | null {
  if (chapterCache.has(chapterId)) return chapterCache.get(chapterId)!;

  // Dynamic import to avoid circular deps
  import("@/lib/specs").then(({ getChapter }) => {
    const chapter = getChapter(chapterId);
    const result = chapter ? { subject: chapter.subject, specRef: chapter.specRef } : null;
    chapterCache.set(chapterId, result);
  });

  // Return null on first call, cache will populate async
  return null;
}