"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SUBJECTS, SUBJECT_ORDER, getChapters } from "@/lib/specs";
import { masteryEstimate } from "@/lib/model";
import type { SubjectId } from "@/lib/types";
import { useStore } from "@/components/store-provider";
import { SessionRunner } from "@/components/session-runner";
import { ChapterPicker } from "@/components/chapter-picker";
import { PageHeader, SectionHead, Segmented } from "@/components/ui";
import {
  DIFFICULTY_HINT,
  DIFFICULTY_LABEL,
  DIFFICULTY_PREFERENCES,
  type DifficultyPreference,
} from "@/lib/difficulty";

/*
  Practice setup.

  Two stages in one route: pick a subject and chapters, then run. Keeping the
  setup on the same screen means the back button from a running session returns
  to the configuration that produced it rather than resetting it.
*/

const LENGTHS = [5, 10, 15, 25, "infinite"] as const;

export function PracticePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { state, toggleChapter, setChapters, setDifficulty, recordAnswer, undoLastAnswer } = useStore();

  const [length, setLength] = useState<number | "infinite">(10);
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);

  /*
    Deep links.

    The notebook links here with the chapters a learner got wrong, and the exam
    plan links with the chapter it wants drilled. Without reading the query, the
    page opens on whatever was last selected and silently drops the learner
    somewhere they did not ask to be.

    The subject is derived during render rather than set from an effect: the query
    is the source of truth, and copying it into state would mean a second render
    showing a different subject from the one the link asked for.
  */
  const requestedChapters = params.get("chapters");
  const requestedSubject = params.get("subject");

  // Not memoised: three subjects and at most a few dozen ids, recomputed on
  // every render for a value that then feeds a guarded effect anyway.
  const deepLinkIds = requestedChapters ? requestedChapters.split(",").filter(Boolean) : [];
  let deepLinkSubject: SubjectId | null = null;
  for (const candidate of SUBJECT_ORDER) {
    const valid = new Set(getChapters(candidate).map((c) => c.id));
    if (deepLinkIds.length > 0 && deepLinkIds.every((id) => valid.has(id))) {
      deepLinkSubject = candidate;
      break;
    }
  }
  // An explicit subject still applies when no chapter identified one, for a link
  // that only wants to change subject.
  if (
    !deepLinkSubject &&
    requestedSubject &&
    SUBJECT_ORDER.includes(requestedSubject as SubjectId)
  ) {
    deepLinkSubject = requestedSubject as SubjectId;
  }
  const deepLink = deepLinkSubject ? { subject: deepLinkSubject, ids: deepLinkIds } : null;

  /*
    The learner's own choice overrides the link, but only for the query they
    arrived with: a new link reasserts itself, and switching subject by hand is
    not undone by a re-render.
  */
  const [chosen, setChosen] = useState<{ key: string; subject: SubjectId } | null>(null);
  const linkKey = `${requestedSubject ?? ""}|${requestedChapters ?? ""}`;
  const subject =
    chosen && chosen.key === linkKey ? chosen.subject : (deepLink?.subject ?? "edexcel-mathematics");

  /*
    Selecting chapters is a write to the persisted store rather than local state,
    so it belongs in an effect. Guarded by the query it came from, since applying
    it on every render would overwrite the learner's ticks the moment they made
    one.
  */
  /*
    Keyed on the query string rather than the parsed object, which is rebuilt each
    render. Effects run in declaration order, so the ref is updated before the
    effect that reads it.
  */
  const deepLinkRef = useRef(deepLink);
  useEffect(() => {
    deepLinkRef.current = deepLink;
  });
  const appliedLink = useRef<string | null>(null);
  useEffect(() => {
    if (appliedLink.current === linkKey) return;
    appliedLink.current = linkKey;
    const link = deepLinkRef.current;
    if (!link || link.ids.length === 0) return;
    setChapters(link.subject, link.ids);
  }, [linkKey, setChapters]);

  const chapters = useMemo(() => getChapters(subject), [subject]);
  const enabled = useMemo(() => state.enabled[subject] ?? [], [state.enabled, subject]);

  const mastery = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, skill] of Object.entries(state.skills)) out[id] = masteryEstimate(skill);
    return out;
  }, [state.skills]);

  // Switching subject keeps each subject's own selection rather than leaking
  // maths chapter ids into an economics session.
  const handleSubject = useCallback(
    (next: string) => setChosen({ key: linkKey, subject: next as SubjectId }),
    [linkKey],
  );

  const handleSetAll = useCallback(
    (ids: string[]) => setChapters(subject, ids),
    [setChapters, subject],
  );

  const start = useCallback(() => setRunning(true), []);

  const mode = length === "infinite" ? "infinite" : "practice";

  if (running) {
    return (
      <SessionRunner
        mode={mode}
        chapters={chapters}
        enabledIds={enabled}
        state={state}
        length={length === "infinite" ? null : length}
        perQuestionSeconds={null}
        title={mode === "infinite" ? "Infinite practice" : "Practice"}
        subtitle={mode === "infinite" ? "No question limit. Keep going as long as you want." : "Untimed, with feedback as you go."}
        backHref="/practice"
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
        eyebrow="Practice"
        title="Practise a subject"
        lede="Questions are pitched at your current level and get harder as you go. Untimed, with feedback immediately."
      />

      <div className="panel mb-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <span className="label">Subject</span>
            <Segmented
              onChange={handleSubject}
              options={SUBJECT_ORDER.map((id) => ({ value: id, label: SUBJECTS[id].shortName }))}
              value={subject}
            />
            <p className="prose-note mt-2">{SUBJECTS[subject].blurb}</p>
          </div>
          <div>
            <span className="label">Questions</span>
            <Segmented
              onChange={(v) => setLength(v === "infinite" ? "infinite" : Number(v))}
              options={LENGTHS.map((n) => ({
                value: String(n),
                label: n === "infinite" ? "∞ Infinite" : String(n),
              }))}
              value={String(length)}
            />
            <p className="prose-note mt-2">
              {enabled.length} chapter{enabled.length === 1 ? "" : "s"} in this subject will be drawn
              from, weighted towards what you are weakest at.
            </p>
          </div>
          <div>
            <span className="label">Difficulty</span>
            <Segmented
              onChange={(v) => setDifficulty(v as DifficultyPreference)}
              options={DIFFICULTY_PREFERENCES.map((p) => ({
                value: p,
                label: DIFFICULTY_LABEL[p],
              }))}
              value={state.config.difficulty}
            />
            <p className="prose-note mt-2">{DIFFICULTY_HINT[state.config.difficulty]}</p>
          </div>
        </div>
      </div>

      <SectionHead title="Chapters" />
      <div className="panel mb-6 p-4">
        <ChapterPicker
          chapters={chapters}
          enabled={enabled}
          mastery={mastery}
          onSearchChange={setSearch}
          onSetAll={handleSetAll}
          onToggle={(id) => toggleChapter(subject, id)}
          search={search}
          subject={subject}
        />
      </div>

      {state.answers.length > 0 ? (
        <button className="btn btn-ghost btn-sm mb-6" onClick={undoLastAnswer} type="button">
          Undo last answer
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={enabled.length === 0}
          onClick={start}
          type="button"
        >
          Start {length === "infinite" ? "∞ Infinite" : `${length} questions`}
        </button>
        {enabled.length === 0 ? (
          <span className="text-ink-2 text-[13px]">Select at least one chapter to begin.</span>
        ) : null}
      </div>
    </div>
  );
}
