"use client";

import { useMemo } from "react";
import Link from "next/link";
import { SUBJECTS, SUBJECT_ORDER, getChapters } from "@/lib/specs";
import { computeInsights } from "@/lib/analytics";
import { buildReviewQueue, summariseReview, accuracySparkline } from "@/lib/spaced";
import { useStore } from "@/components/store-provider";
import { PageHeader, SectionHead, Meter, Stat, Badge, EmptyState } from "@/components/ui";
import { BackupPrompt } from "@/components/backup-prompt";
import { fmtDate, fmtPercent, masteryWord } from "@/components/format";
import { localDateKey } from "@/lib/store";

/*
  Dashboard.

  Answers three questions in priority order: what is due now, what am I worst at,
  and what did I actually do today. Everything else is a link out.
*/

export function DashboardPage() {
  const { state, hydrated } = useStore();

  const enabledAll = useMemo(
    () => SUBJECT_ORDER.flatMap((s) => state.enabled[s] ?? []),
    [state.enabled],
  );

  const insights = useMemo(() => {
    const enabledSet = new Set(enabledAll);
    const chapters = SUBJECT_ORDER.flatMap((s) => getChapters(s));
    return computeInsights({
      chapters,
      skills: state.skills,
      enabledIds: enabledSet,
      config: state.config,
    });
  }, [state.skills, state.config, enabledAll]);

  const review = useMemo(() => {
    const rows = buildReviewQueue(state, enabledAll);
    return { rows, summary: summariseReview(rows) };
  }, [state, enabledAll]);

  const today = state.daily[localDateKey()] ?? { attempted: 0, correct: 0 };

  // A streak is consecutive days with at least one attempt, counting back from
  // today. Today not being done yet must not break yesterday's streak.
  const streak = useMemo(() => {
    let count = 0;
    const cursor = new Date();
    if (!state.daily[localDateKey(cursor.getTime())]) {
      cursor.setDate(cursor.getDate() - 1);
    }
    for (let i = 0; i < 400; i++) {
      const key = localDateKey(cursor.getTime());
      const day = state.daily[key];
      if (!day || day.attempted === 0) break;
      count++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [state.daily]);

  const weakest = useMemo(
    () =>
      insights
        .filter((i) => i.enabled && i.attempts > 0)
        .sort((a, b) => b.weakness - a.weakness)
        .slice(0, 6),
    [insights],
  );

  const untouched = useMemo(
    () => insights.filter((i) => i.enabled && i.attempts === 0).length,
    [insights],
  );

  if (!hydrated) {
    return (
      <div className="page">
        <PageHeader title="Loading" />
      </div>
    );
  }

  const hasHistory = state.answers.length > 0;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Today"
        title="Revision"
        lede={
          hasHistory
            ? `${review.summary.ready} chapter${review.summary.ready === 1 ? "" : "s"} due for review.`
            : "Start with a practice set and this page will start tracking what you know."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-primary" href="/plan">
              Today&apos;s plan
            </Link>
            <Link className="btn" href="/practice">
              Practise
            </Link>
            <Link className="btn" href="/test">
              Mock test
            </Link>
          </div>
        }
      />

      <BackupPrompt />

      <div className="panel mb-8">
        <div className="grid gap-6 sm:grid-cols-4">
          <Stat
            label="Due for review"
            value={review.summary.ready}
            hint={
              review.summary.nextDueAt
                ? `next ${fmtDate(review.summary.nextDueAt)}`
                : "nothing scheduled"
            }
          />
          <Stat
            label="Answered today"
            value={today.attempted}
            hint={today.attempted > 0 ? `${today.correct} correct` : "not started"}
          />
          <Stat label="Day streak" value={streak} hint={streak === 1 ? "day" : "days"} />
          <Stat
            label="Chapters untouched"
            value={untouched}
            hint={`of ${insights.filter((i) => i.enabled).length} selected`}
          />
        </div>
      </div>

      {weakest.length > 0 ? (
        <div className="mb-8">
          <SectionHead
            title="Weakest right now"
            hint="Ordered by how much revision each one needs."
            action={
              <Link className="btn btn-ghost btn-sm" href="/stats">
                Full breakdown
              </Link>
            }
          />
          <div className="panel divide-y divide-rule">
            {weakest.map((insight) => {
              const spark = accuracySparkline(state.answers, insight.chapterId, 24);
              return (
                <div key={insight.chapterId} className="flex items-center gap-4 py-3">
                  <span className="spec-ref w-14 shrink-0">{insight.specRef}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{insight.title}</span>
                    <span className="text-ink-3 text-[12px]">
                      {insight.attempts} seen ·{" "}
                      {insight.accuracy !== null
                        ? `${fmtPercent(insight.accuracy)} correct`
                        : "no attempts yet"}{" "}
                      · {insight.confidence >= 0.6 ? "confident" : "still forming a view"}
                    </span>
                  </span>
                  <span className="num hidden text-ink-3 text-[12px] sm:block">
                    {spark.map((v, i) => (
                      <span
                        key={i}
                        className="mr-px inline-block h-3 w-[3px] align-bottom"
                        style={{
                          background: v === null ? "var(--line)" : v ? "var(--ok)" : "var(--bad)",
                          height: `${6 + (v ?? 0) * 6}px`,
                        }}
                      />
                    ))}
                  </span>
                  <span className="hidden w-28 shrink-0 sm:block">
                    <Meter
                      value={insight.mastery}
                      tone={insight.mastery >= 0.7 ? "ok" : insight.mastery >= 0.4 ? "warn" : "bad"}
                    />
                  </span>
                  <span className="hidden w-16 shrink-0 text-right text-[12px] text-ink-2 md:block">
                    {masteryWord(insight.mastery)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <SectionHead title="By subject" />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {SUBJECT_ORDER.map((id) => {
          const meta = SUBJECTS[id];
          const chapters = insights.filter((i) => i.subject === id && i.enabled);
          const started = chapters.filter((i) => i.attempts > 0);
          const mastery =
            started.length > 0
              ? started.reduce((sum, i) => sum + i.mastery, 0) / started.length
              : 0;
          // accuracy is per chapter, so weight it by attempts to get a subject
          // figure rather than an average of averages.
          const attempted = started.reduce((sum, i) => sum + i.attempts, 0);
          const correct = started.reduce(
            (sum, i) => sum + (i.accuracy ?? 0) * i.attempts,
            0,
          );
          const due = review.rows.filter((r) => r.state === "due" && r.chapterId.startsWith(id))
            .length;

          return (
            <div key={id} className="panel p-4">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-[15px]">{meta.shortName}</span>
                <span className="spec-ref">{meta.code}</span>
              </div>
              <p className="mb-3 text-ink-2 text-[12px] leading-relaxed">{meta.blurb}</p>
              <Meter
                value={mastery}
                empty={started.length === 0}
                tone={mastery >= 0.7 ? "ok" : mastery >= 0.4 ? "warn" : "bad"}
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
                <span className="num">
                  {started.length}/{chapters.length} started
                </span>
                {attempted > 0 ? (
                  <span className="num">{fmtPercent(correct / attempted)} correct</span>
                ) : null}
                {due > 0 ? <Badge tone="warn">{due} due</Badge> : null}
              </div>
            </div>
          );
        })}
      </div>

      {!hasHistory ? (
        <div className="panel">
          <EmptyState
            title="Nothing recorded yet"
            body="Answer a few questions and this page will show your streak, your weakest chapters and what is due for review."
            action={
              <Link className="btn btn-primary" href="/practice">
                Start practising
              </Link>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
