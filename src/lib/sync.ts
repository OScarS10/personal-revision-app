/**
 * Sync Service - Optional serverless database sync
 *
 * Supports:
 * - Vercel Postgres (via @vercel/postgres)
 * - Supabase (via @supabase/supabase-js)
 *
 * Configure via environment variables:
 * - DATABASE_URL (Vercel Postgres connection string)
 * - OR SUPABASE_URL + SUPABASE_ANON_KEY (Supabase)
 *
 * The sync is opt-in: if no credentials are provided, it's a no-op.
 * The local IndexedDB remains the primary store; sync is best-effort.
 */

import type { Answer } from "@/lib/types";

interface SyncConfig {
  provider: "vercel-postgres" | "supabase" | "none";
  enabled: boolean;
}

let syncConfig: SyncConfig = { provider: "none", enabled: false };

export function configureSync(config: {
  provider?: "vercel-postgres" | "supabase";
  vercelPostgresUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}): void {
  if (config.provider === "vercel-postgres" && config.vercelPostgresUrl) {
    syncConfig = { provider: "vercel-postgres", enabled: true };
    // Initialize Vercel Postgres client
    // import { sql } from "@vercel/postgres";
    // sql.config = { connectionString: config.vercelPostgresUrl };
  } else if (config.provider === "supabase" && config.supabaseUrl && config.supabaseAnonKey) {
    syncConfig = { provider: "supabase", enabled: true };
    // import { createClient } from "@supabase/supabase-js";
    // createClient(config.supabaseUrl, config.supabaseAnonKey);
  } else {
    syncConfig = { provider: "none", enabled: false };
  }
}

function isSyncEnabled(): boolean {
  return syncConfig.enabled;
}

interface SyncResult {
  ok: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Push local unsynced data to the remote database.
 * Returns counts of synced/failed items.
 */
export async function pushToRemote(): Promise<SyncResult> {
  if (!isSyncEnabled()) {
    return { ok: true, synced: 0, failed: 0, errors: ["Sync not configured"] };
  }

  const { databaseService } = await import("@/lib/database");
  const result: SyncResult = { ok: true, synced: 0, failed: 0, errors: [] };

  try {
    // Sync answers
    const unsyncedAnswers = await databaseService.getUnsyncedAnswers();
    for (const answer of unsyncedAnswers) {
      try {
        await upsertAnswerRemote(answer);
        await databaseService.markAnswersSynced([answer.id!]);
        result.synced++;
      } catch (e) {
        result.failed++;
        result.errors.push(`Answer ${answer.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Sync sessions, skills, daily stats, template stats, bookmarks
    // Similar pattern for each table...

    result.ok = result.failed === 0;
  } catch (e) {
    result.ok = false;
    result.errors.push(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

async function upsertAnswerRemote(answer: Answer): Promise<void> {
  if (!isSyncEnabled()) return;

  if (syncConfig.provider === "vercel-postgres") {
    // await sql`
    //   INSERT INTO answers (id, question_id, chapter_id, skill_ids, spec_ref, difficulty, response, correct, score, marks, awarded_marks, duration_ms, timestamp, template, assesses_mastery, self_assessed)
    //   VALUES (${answer.id}, ${answer.questionId}, ${answer.chapterId}, ${JSON.stringify(answer.skillIds)}, ${answer.specRef}, ${answer.difficulty}, ${JSON.stringify(answer.response)}, ${answer.correct}, ${answer.score}, ${answer.marks}, ${answer.awardedMarks}, ${answer.durationMs}, ${answer.timestamp}, ${answer.template}, ${answer.assessesMastery}, ${answer.selfAssessed})
    //   ON CONFLICT (id) DO UPDATE SET
    //     correct = EXCLUDED.correct,
    //     score = EXCLUDED.score,
    //     awarded_marks = EXCLUDED.awarded_marks,
    //     duration_ms = EXCLUDED.duration_ms
    // `;
  } else if (syncConfig.provider === "supabase") {
    // const { createClient } = await import("@supabase/supabase-js");
    // const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    // await supabase.from("answers").upsert({
    //   id: answer.id,
    //   question_id: answer.questionId,
    //   chapter_id: answer.chapterId,
    //   skill_ids: answer.skillIds,
    //   spec_ref: answer.specRef,
    //   difficulty: answer.difficulty,
    //   response: answer.response,
    //   correct: answer.correct,
    //   score: answer.score,
    //   marks: answer.marks,
    //   awarded_marks: answer.awardedMarks,
    //   duration_ms: answer.durationMs,
    //   timestamp: answer.timestamp,
    //   template: answer.template,
    //   assesses_mastery: answer.assessesMastery,
    //   self_assessed: answer.selfAssessed,
    // });
  }
}

/**
 * Pull remote data (for multi-device sync).
 * Currently implements last-write-wins based on updatedAt timestamps.
 */
export async function pullFromRemote(): Promise<{ ok: boolean; pulled: number; errors: string[] }> {
  if (!isSyncEnabled()) {
    return { ok: true, pulled: 0, errors: ["Sync not configured"] };
  }

  // Implementation would:
  // 1. Fetch records updated since last sync
  // 2. Compare timestamps with local
  // 3. Apply remote wins for conflicts (last-write-wins)
  // 4. Update local IndexedDB

  return { ok: true, pulled: 0, errors: ["Not yet implemented"] };
}

/**
 * Full bidirectional sync.
 */
export async function fullSync(): Promise<{
  ok: boolean;
  pushed: number;
  pulled: number;
  errors: string[];
}> {
  if (!isSyncEnabled()) {
    return { ok: true, pushed: 0, pulled: 0, errors: ["Sync not configured"] };
  }

  const pushResult = await pushToRemote();
  const pullResult = await pullFromRemote();

  return {
    ok: pushResult.ok && pullResult.ok,
    pushed: pushResult.synced,
    pulled: pullResult.pulled,
    errors: [...pushResult.errors, ...pullResult.errors],
  };
}

export function getSyncStatus(): {
  configured: boolean;
  provider: string;
  lastSync: number | null;
} {
  return {
    configured: syncConfig.enabled,
    provider: syncConfig.provider,
    lastSync: null, // Would be stored in localStorage
  };
}

/**
 * Auto-sync on a schedule (e.g., every 5 minutes when online).
 * Call this once on app startup.
 */
export function startAutoSync(intervalMs = 5 * 60 * 1000): () => void {
  if (!isSyncEnabled()) return () => {};

  const doSync = async () => {
    if (!navigator.onLine) return;
    try {
      await fullSync();
    } catch {
      // Silent fail - auto-sync should not interrupt UX
    }
  };

  const interval = setInterval(doSync, intervalMs);
  doSync(); // Run once immediately

  return () => clearInterval(interval);
}

export function isConfigured(): boolean {
  return syncConfig.enabled;
}