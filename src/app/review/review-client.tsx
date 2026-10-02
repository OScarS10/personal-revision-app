"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SUBJECTS, SUBJECT_ORDER, getChapter, getChapters } from "@/lib/specs";
import type { SubjectId } from "@/lib/types";
import { useStore } from "@/components/store-provider";
import { SessionRunner } from "@/components/session-runner";
import { PageHeader, SectionHead, Badge, EmptyState, Meter, Segmented } from "@/components/ui";
import { fmtDate } from "@/components/format";
import { buildReviewQueue, describeDue, summariseReview, type ReviewRow } from "@/lib/spaced";

/*
  Spaced review.

  The queue is whatever is genuinely due: chapters whose last attempt was
  correct have been pushed further out than the ones that were not, so a learner
  who keeps getting a topic right stops seeing it and one who keeps failing sees
  it again soon.
*/

export function ReviewPage() {
  const router = useRouter();
  const { state, recordAnswer } = useStore();

  const [subject, setSubject] = useState<SubjectId | "all">("all");
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState(20);

  const enabledAll = useMemo(
    () => SUBJECT_ORDER.flatMap((s) => state.enabled[s] ?? []),
    [state.enabled],
  );

  const rows = useMemo(
    () => buildReviewQueue(state, enabledAll),
    [state, enabledAll],
  );

  const visible = useMemo(
    () => (subject === "all" ? rows : rows.filter((r) => r.chapterId.startsWith(subject))),
    [rows, subject],
  );

  const summary = useMemo(() => summariseReview(rows), [rows]);
  const ready = useMemo(() => visible.filter((r) => r.state === "due"), [visible]);
  const later = useMemo(
    () => visible.filter((r) => r.state !== "due").slice(0, 10),
    [visible],
  );

  const sessionChapters = useMemo(() => {
    const ids = ready.slice(0, limit).map((r) => r.chapterId);
    return SUBJECT_ORDER.flatMap((s) => getChapters(s).filter((c) => ids.includes(c.id)));
  }, [ready, limit]);

  const onExit = useCallback(() => {
    setRunning(false);
    router.push("/review");
  }, [router]);

  if (running && sessionChapters.length > 0) {
    return (
      <SessionRunner
        mode="review"
        chapters={sessionChapters}
        enabledIds={sessionChapters.map((c) => c.id)}
        state={state}
        length={sessionChapters.length}
        perQuestionSeconds={null}
        title="Review"
        subtitle="Chapters due for spaced repetition."
        backHref="/review"
        onRecordAnswer={recordAnswer}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Review"
        title="Spaced repetition"
        lede="Chapters you have got right are pushed further out, so the queue is driven by what you are actually forgetting."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              onChange={(v) => setSubject(v as SubjectId | "all")}
              options={[
                { value: "all", label: "All" },
                ...SUBJECT_ORDER.map((id) => ({ value: id, label: SUBJECTS[id].shortName })),
              ]}
              value={subject}
            />
            <button
              className="btn btn-primary"
              disabled={ready.length === 0}
              onClick={() => setRunning(true)}
              type="button"
            >
              Review {Math.min(ready.length, limit)} now
            </button>
          </div>
        }
      />

      <div className="panel mb-6">
        <div className="grid gap-6 sm:grid-cols-4">
          <div>
            <span className="label">Due now</span>
            <div className="num text-[26px] leading-tight">{summary.ready}</div>
          </div>
          <div>
            <span className="label">Due soon</span>
            <div className="num text-[26px] leading-tight">{summary.soon}</div>
          </div>
          <div>
            <span className="label">Scheduled</span>
            <div className="num text-[26px] leading-tight">{summary.later}</div>
          </div>
          <div>
            <span className="label">Next due</span>
            <div className="text-[17px] leading-tight">
              {summary.nextDueAt ? fmtDate(summary.nextDueAt) : <span className="text-ink-3">—</span>}
            </div>
          </div>
        </div>
      </div>

      {ready.length > 0 ? (
        <>
          <SectionHead
            title="Due now"
            hint={`The ${Math.min(ready.length, limit)} most overdue chapters.`}
            action={
              <div className="flex gap-1">
                {[10, 20, 40].map((n) => (
                  <button
                    key={n}
                    className={`btn btn-sm ${limit === n ? "btn-accent" : "btn-ghost"}`}
                    onClick={() => setLimit(n)}
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>
            }
          />
          <div className="panel mb-6 divide-y divide-rule">
            {ready.slice(0, limit).map((row) => (
              <ReviewLine key={row.chapterId} row={row} />
            ))}
          </div>
        </>
      ) : (
        <div className="panel mb-6">
          <EmptyState
            title={summary.ready + summary.soon + summary.later === 0 ? "Nothing tracked yet" : "Nothing due right now"}
            body={
              summary.ready + summary.soon + summary.later === 0
                ? "Answer some questions and chapters will start appearing here on a schedule."
                : `Everything you have attempted is still fresh. The next chapter comes due ${
                    summary.nextDueAt ? fmtDate(summary.nextDueAt) : "later"
                  }.`
            }
          />
        </div>
      )}

      {later.length > 0 ? (
        <>
          <SectionHead title="Coming up" />
          <div className="panel divide-y divide-rule">
            {later.map((row) => (
              <ReviewLine key={row.chapterId} row={row} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

const STATE_TONE = {
  due: "bad",
  soon: "warn",
  later: "neutral",
  fresh: "neutral",
} as const;

function ReviewLine({ row }: { row: ReviewRow }) {
  const chapter = getChapter(row.chapterId);

  return (
    <div className="flex items-center gap-4 py-2.5">
      <span className="spec-ref w-14 shrink-0">{chapter?.specRef ?? ""}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{chapter?.title ?? row.chapterId}</span>
        <span className="text-ink-3 text-[12px]">{describeDue(row)}</span>
      </span>
      <span className="hidden w-28 shrink-0 sm:block">
        <Meter value={row.urgency} tone={row.urgency >= 0.5 ? "bad" : row.urgency > 0 ? "warn" : "muted"} />
      </span>
      <span className="num hidden w-24 shrink-0 text-right text-[12px] text-ink-3 md:block">
        {row.lastScore > 0 ? "last was right" : row.attempts > 0 ? "last was wrong" : "not started"}
      </span>
      <Badge tone={STATE_TONE[row.state]}>
        {row.streak > 0 ? `${row.streak} in a row` : row.state}
      </Badge>
    </div>
  );
}
