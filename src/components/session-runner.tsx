"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { Answer, Chapter, PersistedState, SkillInsight } from "@/lib/types";
import { computeInsights } from "@/lib/analytics";
import { useSession, type SessionSummary, type UseSessionOptions } from "@/components/use-session";
import { QuestionView } from "@/components/question-view";
import { Badge, EmptyState, Meter, PageHeader, SectionHead, Stat } from "@/components/ui";
import { fmtDuration, fmtPercent } from "@/components/format";
import { Markdown } from "@/components/markdown";
import { SUBJECTS } from "@/lib/specs";
import type { SessionMode } from "@/lib/session";

/*
  The one screen that runs a session.

  Practice, mock tests and review all mount this with a different mode. Sharing
  it means the marking, the timer, undo and the results screen cannot drift
  apart between the three entry points.
*/

export interface SessionRunnerProps {
  mode: SessionMode;
  chapters: Chapter[];
  enabledIds: string[];
  state: PersistedState;
  length: number;
  perQuestionSeconds: number | null;
  title: string;
  subtitle: string;
  backHref: string;
  onRecordAnswer(answer: Answer): void;
  onExit(): void;
}

const MODE_LABEL: Record<SessionMode, string> = {
  practice: "Practice",
  test: "Mock test",
  review: "Review",
};

export function SessionRunner(props: SessionRunnerProps) {
  const { mode, chapters, enabledIds, state, length, perQuestionSeconds, onRecordAnswer } = props;

  // Insights are derived from the recorded skills, so they update as the
  // session runs and difficulty targeting stays honest within a session.
  const enabledSet = useMemo(
    () => new Set(enabledIds),
    [enabledIds],
  );
  const insights = useMemo<SkillInsight[]>(
    () =>
      computeInsights({
        chapters,
        skills: state.skills,
        enabledIds: enabledSet,
        config: state.config,
      }),
    [chapters, state.skills, state.config, enabledSet],
  );

  const options: UseSessionOptions = {
    mode,
    chapters,
    enabledIds,
    state,
    insights,
    length,
    perQuestionSeconds,
    onRecordAnswer,
    onFinish: () => {},
  };

  const session = useSession(options);
  const { current, finished, summary } = session;

  if (chapters.length === 0) {
    return (
      <div className="page">
        <PageHeader title={props.title} lede={props.subtitle} />
        <EmptyState
          title="No chapters selected"
          body="Pick at least one chapter before starting a session."
          action={
            <Link className="btn btn-primary" href={props.backHref}>
              Choose chapters
            </Link>
          }
        />
      </div>
    );
  }

  if (finished && summary) {
    return <SessionResults summary={summary} onRestart={session.restart} onExit={props.onExit} />;
  }

  if (!current) {
    return (
      <div className="page">
        <PageHeader title={props.title} lede={props.subtitle} />
        <div className="panel">
          <EmptyState
            title="Nothing to generate"
            body="These chapters have no usable question templates. Try a different selection."
            action={
              <Link className="btn" href={props.backHref}>
                Back
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <QuestionView
        question={current.question}
        phase={current.phase}
        holdFeedback={mode === "test"}
        deadline={session.deadlineMs}
        onTimeUp={session.submitExpired}
        onSubmit={session.submit}
        onReveal={session.reveal}
        onSkip={session.skip}
        onNext={session.next}
        onUndo={session.undo}
        canUndo={session.canUndo}
        lastResult={current.result}
        index={session.index}
        total={session.total ?? undefined}
        onFlag={session.toggleBookmark}
        flagged={current.bookmarked}
        submitLabel={mode === "test" ? "Lock in answer" : undefined}
      />
      <SessionFooter session={session} mode={mode} onExit={props.onExit} />
    </div>
  );
}

function SessionFooter({
  session,
  mode,
  onExit,
}: {
  session: ReturnType<typeof useSession>;
  mode: SessionMode;
  onExit(): void;
}) {
  const answered = session.entries.filter((e) => e.answer !== null).length;
  const correct = session.entries.filter((e) => e.answer?.correct).length;

  return (
    <div className="rule-top mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-2">
      <span className="num">
        {answered} answered
        {answered > 0 ? (
          <>
            {" · "}
            <span className={correct === answered ? "text-ok" : "text-ink-1"}>
              {correct} correct
            </span>
          </>
        ) : null}
      </span>
      {mode === "test" ? (
        <span className="text-ink-3">Feedback is held back until the end, as in the real paper.</span>
      ) : null}
      <button className="btn btn-ghost btn-sm ml-auto" onClick={onExit} type="button">
        End session
      </button>
    </div>
  );
}

function SessionResults({
  summary,
  onRestart,
  onExit,
}: {
  summary: SessionSummary;
  onRestart(): void;
  onExit(): void;
}) {
  const [showAll, setShowAll] = useState(false);
  const restart = useCallback(() => {
    onRestart();
  }, [onRestart]);

  const gradeTone =
    summary.accuracy >= 0.8 ? "ok" : summary.accuracy >= 0.5 ? "warn" : "bad";

  return (
    <div className="page">
      <PageHeader
        title="Session complete"
        lede={`${summary.attempted} question${summary.attempted === 1 ? "" : "s"} · ${fmtDuration(summary.durationMs)}`}
      />

      <div className="panel mb-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <Stat
            label="Accuracy"
            value={fmtPercent(summary.accuracy)}
            hint={
              summary.marksAvailable > 0
                ? `${summary.marksAwarded} of ${summary.marksAvailable} marks`
                : undefined
            }
          />
          <Stat
            label="Mean difficulty"
            value={summary.meanDifficulty.toFixed(2)}
            hint="Higher means the session got harder as you went"
          />
          <Stat
            label="Chapters"
            value={String(summary.breakdown.length)}
            hint={`Mean time ${fmtDuration(summary.durationMs / Math.max(1, summary.attempted))} per question`}
          />
        </div>
        <div className="mt-5">
          <Meter value={summary.accuracy} tone={gradeTone} />
        </div>
      </div>

      {summary.breakdown.length > 0 ? (
        <div className="mb-6">
          <SectionHead title="By chapter" />
          <div className="panel divide-y divide-line">
            {summary.breakdown.map((row) => {
              const acc = row.correct / row.attempted;
              return (
                <div key={row.chapterId} className="flex items-center gap-4 py-2.5">
                  <span className="spec-ref w-14 shrink-0">{row.specRef}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{row.title}</span>
                  <span className="num w-14 shrink-0 text-right text-[13px] text-ink-2">
                    {row.correct}/{row.attempted}
                  </span>
                  <span className="w-24 shrink-0">
                    <Meter
                      value={acc}
                      tone={acc >= 0.8 ? "ok" : acc >= 0.5 ? "warn" : "bad"}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {summary.hardest.length > 0 ? (
        <div className="mb-6">
          <SectionHead title="Worth another look" />
          <div className="grid gap-4">
            {summary.hardest.map((item) => (
              <div key={item.question.id} className="panel p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="bad">Missed</Badge>
                  <span className="num text-ink-3 text-[12px]">
                    difficulty {item.question.difficulty.toFixed(2)}
                  </span>
                </div>
                <div className="mb-2 text-[14px] leading-relaxed">
                  <Markdown>{item.question.prompt}</Markdown>
                </div>
                <div className="text-[13px]">
                  <span className="text-ink-2">You wrote </span>
                  <span className="num text-wrong">{item.yours || "nothing"}</span>
                  <span className="text-ink-2"> · answer </span>
                  <span className="num text-ok">{item.question.answer}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <details className="panel mb-6" open={showAll} onToggle={(e) => setShowAll(e.currentTarget.open)}>
        <summary className="cursor-pointer text-[14px]">
          All {summary.entries.length} questions
        </summary>
        <div className="mt-4 divide-y divide-line">
          {summary.entries.map((entry, i) => (
            <div key={`${entry.question.id}-${i}`} className="py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="num text-ink-3 text-[12px]">{i + 1}</span>
                <Badge tone={entry.answer?.correct ? "ok" : entry.answer ? "bad" : "neutral"}>
                  {entry.answer?.correct ? "Correct" : entry.answer ? "Wrong" : "Skipped"}
                </Badge>
                <span className="num text-ink-3 text-[12px]">{fmtDuration(entry.elapsedMs)}</span>
              </div>
              <div className="text-[14px]">
                <Markdown>{entry.question.prompt}</Markdown>
              </div>
              {entry.answer ? (
                <div className="mt-1 text-[13px] text-ink-2">
                  <span className="num">{entry.answer.response.join(", ") || "no answer"}</span>
                  {" → "}
                  <span className="num text-ink-1">{entry.question.answer}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={restart} type="button">
          Another set
        </button>
        <button className="btn" onClick={onExit} type="button">
          Back to dashboard
        </button>
      </div>
    </div>
  );
}

/** Small helper used by the practice setup cards. */
export function chapterLabel(chapter: Chapter): string {
  const subject = SUBJECTS[chapter.subject];
  return `${subject.shortName} ${chapter.specRef} · ${chapter.title}`;
}

export { MODE_LABEL };
export type { SessionSummary };
