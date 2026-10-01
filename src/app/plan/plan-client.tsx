"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SUBJECTS, SUBJECT_ORDER, getChapters } from "@/lib/specs";
import { computeInsights } from "@/lib/analytics";
import { buildStudyPlan, dailySlice, buildNotebook, daysBetween } from "@/lib/planning";
import { generatorsFor } from "@/lib/generators/registry";
import { useStore } from "@/components/store-provider";
import { Badge, EmptyState, Meter, PageHeader, SectionHead, Stat } from "@/components/ui";
import { fmtRelative } from "@/components/format";

/*
  Today's plan, exam countdown and the wrong-answer notebook.

  These three live together because they answer the same question from different
  angles: given what I am weak at and how long I have left, what should I do now,
  and what have I got wrong that I have not put right.
*/

const MINUTE_OPTIONS = [20, 30, 45, 60, 90];

export function PlanPage() {
  const { state, setExamDate } = useStore();
  const [budget, setBudget] = useState(45);

  const enabledAll = useMemo(
    () => SUBJECT_ORDER.flatMap((s) => state.enabled[s] ?? []),
    [state.enabled],
  );

  const insights = useMemo(
    () =>
      computeInsights({
        chapters: SUBJECT_ORDER.flatMap((s) => getChapters(s)),
        skills: state.skills,
        enabledIds: new Set(enabledAll),
        config: state.config,
      }),
    [state.skills, state.config, enabledAll],
  );

  const plan = useMemo(() => buildStudyPlan(state, insights), [state, insights]);
  // The plan reads the clock once and reports it, so the countdown and the plan
  // cannot disagree about what day it is.
  const now = plan.now;
  const slice = useMemo(() => dailySlice(plan, budget), [plan, budget]);
  const notebook = useMemo(() => buildNotebook(state, 60), [state]);

  // Chapters with no authored content cannot be practised, so the plan should
  // not send the learner to them.
  const answerable = useMemo(() => {
    const set = new Set<string>();
    for (const subject of SUBJECT_ORDER) {
      for (const chapter of getChapters(subject)) {
        if (generatorsFor(chapter).length > 0) set.add(chapter.id);
      }
    }
    return set;
  }, []);

  const tasks = slice.filter((t) => answerable.has(t.chapterId));
  const blocked = plan.tasks.filter((t) => !answerable.has(t.chapterId));

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Plan"
        title="What to do today"
        lede="Weighted by how weak each chapter is, how close its exam is, and whether it is already due back for review."
      />

      {/* ------------------------------------------------ exam countdown */}
      <div className="panel mb-6">
        <SectionHead title="Exam dates" hint="Used to weight the plan toward what is soonest." />
        <div className="grid gap-4 sm:grid-cols-3">
          {SUBJECT_ORDER.map((subject) => {
            const at = state.examDates[subject];
            // Counted in calendar days, since the exam date is stored at local
            // midnight: an exam on Friday read on Wednesday morning is "2 days",
            // not "1", however much of Wednesday has already passed.
            const days = at ? daysBetween(now, at) : null;
            return (
              <div key={subject} className="border border-line p-3">
                <span className="text-[14px]">{SUBJECTS[subject].shortName}</span>
                <div className="mt-1.5">
                  {days === null ? (
                    <span className="text-[13px] text-ink-3">Not set</span>
                  ) : (
                    <span
                      className={`num text-[20px] ${days < 0 ? "text-ink-3" : days <= 14 ? "text-warn" : ""}`}
                    >
                      {days < 0 ? "past" : `${days}d`}
                    </span>
                  )}
                </div>
                <label className="mt-2 block">
                  <span className="sr-only">{SUBJECTS[subject].shortName} exam date</span>
                  <input
                    className="field"
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (!raw) {
                        setExamDate(subject, null);
                        return;
                      }
                      // Parsed as a local date, so the countdown is not shifted
                      // by a timezone.
                      const parsed = new Date(`${raw}T00:00:00`);
                      if (!Number.isNaN(parsed.getTime())) setExamDate(subject, parsed.getTime());
                    }}
                    type="date"
                    value={at ? toInputDate(at) : ""}
                  />
                </label>
              </div>
            );
          })}
        </div>
        {plan.daysToExam !== null ? (
          <p className="prose-note mt-3">
            {plan.daysToExam < 0
              ? `The next exam date passed ${Math.abs(plan.daysToExam)} days ago. Update it to reweight the plan.`
              : `${plan.daysToExam} days until ${SUBJECTS[plan.nextExam!.subject].shortName}.`}
          </p>
        ) : (
          <p className="prose-note mt-3">
            Set an exam date and the plan will weight chapters by how close it is.
          </p>
        )}
      </div>

      {/* ----------------------------------------------------- today's plan */}
      <div className="panel mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="label mb-0">Today&apos;s plan</span>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[12px] text-ink-3">Time available</span>
            {MINUTE_OPTIONS.map((m) => (
              <button
                key={m}
                className={`btn btn-sm ${budget === m ? "btn-accent" : "btn-ghost"}`}
                onClick={() => setBudget(m)}
                type="button"
              >
                {m}m
              </button>
            ))}
          </div>
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            title={plan.hasContent ? "Nothing queued" : "No chapters selected"}
            body={
              plan.hasContent
                ? "Every enabled chapter is either secure or has no questions written yet. Try adding a chapter, or raise the time available."
                : "Choose some chapters to revise, then come back for a plan."
            }
            action={
              <Link className="btn btn-primary" href="/practice">
                Choose chapters
              </Link>
            }
          />
        ) : (
          <>
            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <Stat label="Tasks today" value={tasks.length} />
              <Stat
                label="Estimated time"
                value={`${tasks.reduce((s, t) => s + t.minutes, 0)}m`}
                hint={`of ${budget}m available`}
              />
              <Stat
                label="Due for review"
                value={plan.dueToday.length}
                hint={plan.dueToday.length > 0 ? "see the review page" : undefined}
              />
            </div>
            <ul className="divide-y divide-line">
              {tasks.map((task, i) => (
                <li key={task.chapterId} className="flex items-center gap-4 py-3">
                  <span className="num text-ink-3 text-[12px] w-4">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="spec-ref">{task.specRef}</span>
                      <span className="text-[14px]">{task.title}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-2">{task.action}</span>
                    <span className="text-ink-3 text-[12px]">{task.reason}</span>
                  </span>
                  <span className="w-24 shrink-0 hidden sm:block">
                    <Meter
                      value={task.priority}
                      tone={task.priority >= 0.6 ? "bad" : task.priority >= 0.35 ? "warn" : "muted"}
                    />
                  </span>
                  <span className="num text-ink-3 text-[12px] w-10 text-right shrink-0">
                    {task.minutes}m
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {blocked.length > 0 ? (
          <p className="prose-note mt-3">
            {blocked.length} chapter{blocked.length === 1 ? "" : "s"} in your selection have no
            questions written yet, so {blocked.length === 1 ? "it is" : "they are"} left out of the
            plan rather than filled with filler.
          </p>
        ) : null}
      </div>

      {/* -------------------------------------------------------- notebook */}
      <SectionHead
        title="Wrong answers"
        hint="Everything you have not got right, most recent first."
        action={
          notebook.length > 0 ? (
            <Link className="btn btn-sm" href="/notebook">
              Open notebook
            </Link>
          ) : undefined
        }
      />
      {notebook.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="Nothing wrong yet"
            body="Questions you get wrong will collect here so you can retake exactly those."
          />
        </div>
      ) : (
        <div className="panel divide-y divide-line">
          {notebook.slice(0, 6).map((entry) => (
            <div key={`${entry.questionId}-${entry.at}`} className="flex items-center gap-3 py-2.5">
              <span className="spec-ref shrink-0">{entry.specRef}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px]">{entry.prompt}</span>
                <span className="text-ink-3 text-[12px]">
                  {entry.awardedMarks} of {entry.marks} marks · {fmtRelative(entry.at)}
                  {entry.selfAssessed ? " · self-marked" : ""}
                </span>
              </span>
              {entry.timesWrong > 1 ? <Badge tone="warn">{entry.timesWrong}×</Badge> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A timestamp as the yyyy-mm-dd string a date input expects, in local time. */
function toInputDate(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
