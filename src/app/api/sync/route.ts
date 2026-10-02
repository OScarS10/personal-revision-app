import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth";
import { sql } from "@vercel/postgres";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyAccessToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { answers, sessions, skills, dailyStats, templateStats, bookmarks } = body;

    const results = { answers: 0, sessions: 0, skills: 0, dailyStats: 0, templateStats: 0, bookmarks: 0 };

    const tasks: Promise<void>[] = [];

    if (answers?.length) {
      for (const answer of answers) {
        tasks.push(
          sql`
            INSERT INTO answers (
              user_id, question_id, chapter_id, subject_id, skill_ids, spec_ref,
              difficulty, response, correct, score, marks, awarded_marks,
              duration_ms, timestamp, template, assesses_mastery, self_assessed
            ) VALUES (
              ${user.id}, ${answer.questionId}, ${answer.chapterId}, ${answer.subjectId},
              ${JSON.stringify(answer.skillIds ?? [])}, ${answer.specRef ?? null},
              ${answer.difficulty ?? 0}, ${JSON.stringify(answer.response ?? [])},
              ${answer.correct}, ${answer.score ?? 0}, ${answer.marks ?? 1},
              ${answer.awardedMarks ?? 0}, ${answer.durationMs ?? 0},
              ${answer.timestamp}, ${answer.template ?? "unknown"},
              ${answer.assessesMastery ?? true}, ${answer.selfAssessed ?? false}
            )
            ON CONFLICT DO NOTHING
          `.then(() => { results.answers++; })
        );
      }
    }

    if (sessions?.length) {
      for (const session of sessions) {
        tasks.push(
          sql`
            INSERT INTO sessions (
              user_id, mode, subject_id, started_at, ended_at, length,
              question_count, correct_count, accuracy, duration_ms, chapters
            ) VALUES (
              ${user.id}, ${session.mode}, ${session.subjectId},
              ${new Date(session.startedAt).toISOString()},
              ${session.endedAt ? new Date(session.endedAt).toISOString() : null},
              ${session.length ?? null},
              ${session.questionCount ?? 0}, ${session.correctCount ?? 0},
              ${session.accuracy ?? 0}, ${session.durationMs ?? 0},
              ${JSON.stringify(session.chapters ?? [])}
            )
            ON CONFLICT DO NOTHING
          `.then(() => { results.sessions++; })
        );
      }
    }

    if (skills?.length) {
      for (const skill of skills) {
        tasks.push(
          sql`
            INSERT INTO skills (
              id, user_id, subject_id, chapter_id, theta, alpha, beta, p_learned,
              attempts, correct, recent, information, last_seen, avg_duration_ms,
              difficulty_sum, inferred_only
            ) VALUES (
              ${skill.id}, ${user.id}, ${skill.subjectId}, ${skill.chapterId},
              ${skill.theta ?? 0}, ${skill.alpha ?? 1}, ${skill.beta ?? 1},
              ${skill.pLearned ?? 0}, ${skill.attempts ?? 0}, ${skill.correct ?? 0},
              ${JSON.stringify(skill.recent ?? [])}, ${skill.information ?? 0},
              ${skill.lastSeen ?? null}, ${skill.avgDurationMs ?? 0},
              ${skill.difficultySum ?? 0}, ${skill.inferredOnly ?? true}
            )
            ON CONFLICT (id) DO UPDATE SET
              theta = EXCLUDED.theta,
              alpha = EXCLUDED.alpha,
              beta = EXCLUDED.beta,
              p_learned = EXCLUDED.p_learned,
              attempts = EXCLUDED.attempts,
              correct = EXCLUDED.correct,
              recent = EXCLUDED.recent,
              information = EXCLUDED.information,
              last_seen = EXCLUDED.last_seen,
              avg_duration_ms = EXCLUDED.avg_duration_ms,
              difficulty_sum = EXCLUDED.difficulty_sum,
              inferred_only = EXCLUDED.inferred_only,
              updated_at = NOW()
          `.then(() => { results.skills++; })
        );
      }
    }

    if (dailyStats?.length) {
      for (const stat of dailyStats) {
        tasks.push(
          sql`
            INSERT INTO daily_stats (id, user_id, date, subject_id, attempted, correct, duration_ms, sessions)
            VALUES (${stat.id}, ${user.id}, ${stat.date}, ${stat.subjectId}, ${stat.attempted}, ${stat.correct}, ${stat.durationMs}, ${stat.sessions})
            ON CONFLICT (id) DO UPDATE SET
              attempted = EXCLUDED.attempted,
              correct = EXCLUDED.correct,
              duration_ms = EXCLUDED.duration_ms,
              sessions = EXCLUDED.sessions
          `.then(() => { results.dailyStats++; })
        );
      }
    }

    if (templateStats?.length) {
      for (const stat of templateStats) {
        tasks.push(
          sql`
            INSERT INTO template_stats (
              id, user_id, template_key, subject_id, chapter_id,
              attempts, correct, score_sum, difficulty_sum, last_seen
            ) VALUES (
              ${stat.id}, ${user.id}, ${stat.templateKey}, ${stat.subjectId}, ${stat.chapterId},
              ${stat.attempts}, ${stat.correct}, ${stat.scoreSum}, ${stat.difficultySum}, ${stat.lastSeen}
            )
            ON CONFLICT (id) DO UPDATE SET
              attempts = EXCLUDED.attempts,
              correct = EXCLUDED.correct,
              score_sum = EXCLUDED.score_sum,
              difficulty_sum = EXCLUDED.difficulty_sum,
              last_seen = EXCLUDED.last_seen
          `.then(() => { results.templateStats++; })
        );
      }
    }

    if (bookmarks?.length) {
      for (const bookmark of bookmarks) {
        tasks.push(
          sql`
            INSERT INTO bookmarks (
              user_id, question_id, chapter_id, subject_id, spec_ref, difficulty
            ) VALUES (
              ${user.id}, ${bookmark.questionId}, ${bookmark.chapterId},
              ${bookmark.subjectId}, ${bookmark.specRef ?? null}, ${bookmark.difficulty ?? 0}
            )
            ON CONFLICT DO NOTHING
          `.then(() => { results.bookmarks++; })
        );
      }
    }

    await Promise.all(tasks);

    return NextResponse.json({ success: true, synced: results });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await verifyAccessToken(token);
    if (!user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const since = request.nextUrl.searchParams.get("since");
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [answers, sessions, skills, dailyStats, templateStats, bookmarks] = await Promise.all([
      sql`
        SELECT * FROM answers
        WHERE user_id = ${user.id} AND synced_at > ${sinceDate.toISOString()}
        ORDER BY synced_at ASC
      `,
      sql`
        SELECT * FROM sessions
        WHERE user_id = ${user.id} AND synced_at > ${sinceDate.toISOString()}
        ORDER BY synced_at ASC
      `,
      sql`
        SELECT * FROM skills
        WHERE user_id = ${user.id} AND synced_at > ${sinceDate.toISOString()}
        ORDER BY synced_at ASC
      `,
      sql`
        SELECT * FROM daily_stats
        WHERE user_id = ${user.id} AND synced_at > ${sinceDate.toISOString()}
        ORDER BY synced_at ASC
      `,
      sql`
        SELECT * FROM template_stats
        WHERE user_id = ${user.id} AND synced_at > ${sinceDate.toISOString()}
        ORDER BY synced_at ASC
      `,
      sql`
        SELECT * FROM bookmarks
        WHERE user_id = ${user.id} AND synced_at > ${sinceDate.toISOString()}
        ORDER BY synced_at ASC
      `,
    ]);

    return NextResponse.json({
      answers: answers.rows ?? [],
      sessions: sessions.rows ?? [],
      skills: skills.rows ?? [],
      dailyStats: dailyStats.rows ?? [],
      templateStats: templateStats.rows ?? [],
      bookmarks: bookmarks.rows ?? [],
    });
  } catch (error) {
    console.error("Sync fetch error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
