"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SUBJECTS, SUBJECT_ORDER, getChapters, getPapers } from "@/lib/specs";
import { masteryEstimate } from "@/lib/model";
import type { SubjectId } from "@/lib/types";
import { useStore } from "@/components/store-provider";
import { SessionRunner } from "@/components/session-runner";
import { ChapterPicker } from "@/components/chapter-picker";
import { PageHeader, SectionHead, Segmented } from "@/components/ui";
import { fmtDuration } from "@/components/format";

/*
  Mock test.

  Two things differ from practice, and both matter: the clock runs, and feedback
  is held back until the end so a paper can be sat honestly.

  A paper here sets the time budget from the real specification. The questions
  themselves are drawn from the learner's selected chapters, because the
  generator produces items per chapter rather than reproducing an examiner's
  exact paper structure - claiming otherwise would be a lie about the coverage.
*/

const QUESTION_COUNTS = [10, 20, 40] as const;

export function TestPage() {
  const router = useRouter();
  const { state, recordAnswer, toggleChapter, setChapters } = useStore();

  const [subject, setSubject] = useState<SubjectId>("edexcel-mathematics");
  const [paperId, setPaperId] = useState<string>("");
  const [count, setCount] = useState<number>(20);
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);

  const chapters = useMemo(() => getChapters(subject), [subject]);
  const enabled = useMemo(() => state.enabled[subject] ?? [], [state.enabled, subject]);

  const papers = useMemo(() => getPapers(subject), [subject]);
  const paper = papers.find((p) => p.id === paperId) ?? papers[0];

  const mastery = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, skill] of Object.entries(state.skills)) out[id] = masteryEstimate(skill);
    return out;
  }, [state.skills]);

  // The paper's own length is the default number of questions.
  const suggestedCount = paper ? Math.max(5, Math.round(paper.marks / 2)) : 20;
  const length = Math.min(count, Math.max(1, enabled.length * 8));
  const perQuestionSeconds =
    paper && paper.durationMinutes > 0
      ? Math.round((paper.durationMinutes * 60) / Math.max(1, length))
      : null;

  const setSubjectAndReset = useCallback((next: string) => {
    setSubject(next as SubjectId);
    setPaperId("");
  }, []);

  if (running && paper) {
    return (
      <SessionRunner
        mode="test"
        chapters={chapters}
        enabledIds={enabled}
        state={state}
        length={length}
        perQuestionSeconds={perQuestionSeconds}
        title={paper.code}
        subtitle={`${paper.title} · ${paper.marks} marks · feedback held back until the end`}
        backHref="/test"
        onRecordAnswer={recordAnswer}
        onExit={() => {
          setRunning(false);
          router.push("/");
        }}
      />
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Mock test"
        title="Sit a paper"
        lede="Timed, with feedback held back until the end so you find out what you actually know rather than what you can check."
      />

      <div className="panel mb-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="label">Subject</span>
            <Segmented
              onChange={setSubjectAndReset}
              options={SUBJECT_ORDER.map((id) => ({ value: id, label: SUBJECTS[id].shortName }))}
              value={subject}
            />
            <p className="prose-note mt-2">{SUBJECTS[subject].blurb}</p>
          </div>
          <div>
            <span className="label">Paper</span>
            <div className="flex flex-col gap-1.5">
              {papers.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2.5 text-[14px]">
                  <input
                    checked={(paper?.id ?? "") === p.id}
                    className="accent-[var(--accent)]"
                    name="paper"
                    onChange={() => {
                      setPaperId(p.id);
                      setCount(Math.max(5, Math.round(p.marks / 2)));
                    }}
                    type="radio"
                  />
                  <span>
                    {p.code} <span className="text-ink-2">{p.title}</span>
                  </span>
                  <span className="num ml-auto text-ink-3 text-[12px]">
                    {fmtDuration(p.durationMinutes * 60_000)} · {p.marks}m
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel mb-6">
        <span className="label">Questions</span>
        <Segmented
          onChange={(v) => setCount(Number(v))}
          options={QUESTION_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
          value={String(count)}
        />
        {paper ? (
          <p className="prose-note mt-2">
            {paper.durationMinutes} minutes for {length} questions is about{" "}
            {perQuestionSeconds !== null
              ? `${Math.floor(perQuestionSeconds / 60)}m ${String(perQuestionSeconds % 60).padStart(2, "0")}s`
              : "n/a"}{" "}
            each, with the clock stopping on every question. The full paper is {paper.marks} marks, so
            this is a subset of {suggestedCount}.
          </p>
        ) : null}
      </div>

      <SectionHead
        title="Chapters"
        hint="Drawn in specification order, weighted towards your weaker chapters."
      />
      <div className="panel mb-6 p-4">
        <ChapterPicker
          chapters={chapters}
          enabled={enabled}
          mastery={mastery}
          onSearchChange={setSearch}
          onSetAll={(ids) => setChapters(subject, ids)}
          onToggle={(id) => toggleChapter(subject, id)}
          search={search}
          subject={subject}
        />
      </div>

      <button
        className="btn btn-primary"
        disabled={enabled.length === 0}
        onClick={() => setRunning(true)}
        type="button"
      >
        Start paper
      </button>
      {enabled.length === 0 ? (
        <span className="ml-3 text-ink-2 text-[13px]">Select at least one chapter.</span>
      ) : null}
    </div>
  );
}
