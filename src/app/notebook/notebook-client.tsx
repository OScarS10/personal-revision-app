"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getChapter, SUBJECTS } from "@/lib/specs";
import { buildNotebook } from "@/lib/planning";
import { generatorsFor } from "@/lib/generators/registry";
import { useStore } from "@/components/store-provider";
import { Badge, EmptyState, PageHeader, Segmented } from "@/components/ui";
import { fmtDateTime } from "@/components/format";
import type { SubjectId } from "@/lib/types";

/*
  The wrong-answer notebook.

  Bookmarking existed, but a bookmark is a note to self and this is a record of
  failure: everything with marks outstanding, most recent first, grouped so the
  pattern is visible. A learner who has missed the same template three times
  should be able to see that without noticing three separate rows.
*/

type Filter = "all" | SubjectId;

export function NotebookPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [showGrouped, setShowGrouped] = useState(true);

  const all = useMemo(() => buildNotebook(state, 200), [state]);

  const entries = useMemo(
    () => (filter === "all" ? all : all.filter((e) => e.chapterId.startsWith(filter))),
    [all, filter],
  );

  /*
    Group by template, because a repeated template is the signal. Four separate
    wrong answers on four different chapters is noise; four on the same template
    is a gap in the content or a misjudged difficulty, and both are worth
    knowing about.
  */
  const groups = useMemo(() => {
    const byTemplate = new Map<string, typeof entries>();
    for (const entry of entries) {
      const bucket = byTemplate.get(entry.template);
      if (bucket) bucket.push(entry);
      else byTemplate.set(entry.template, [entry]);
    }
    return [...byTemplate.entries()]
      .map(([template, items]) => ({
        template,
        items,
        count: items.length,
        chapters: new Set(items.map((i) => i.chapterId)).size,
      }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  /*
    Retry is offered for chapters that can still produce questions. A chapter
    with no authored content would send the learner to a practice session that
    cannot ask anything, so it is left out of the retry link.
  */
  const retryChapters = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of entries) {
      const chapter = getChapter(entry.chapterId);
      if (chapter && generatorsFor(chapter).length > 0) ids.add(entry.chapterId);
    }
    return [...ids];
  }, [entries]);

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Notebook"
        title="Wrong answers"
        lede="Everything with marks outstanding. Repeated templates are grouped, because four misses on one template means something different from four misses on four."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              onChange={(v) => setFilter(v as Filter)}
              options={[
                { value: "all", label: "All" },
                ...(Object.keys(SUBJECTS) as SubjectId[]).map((id) => ({
                  value: id,
                  label: SUBJECTS[id].shortName,
                })),
              ]}
              value={filter}
            />
          </div>
        }
      />

      {entries.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="Nothing wrong yet"
            body="Questions you do not fully get right will collect here, so you can retake exactly those rather than the whole syllabus."
            action={
              <Link className="btn btn-primary" href="/practice">
                Practise something
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="panel mb-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-ink-2">
              <span className="num">{entries.length}</span> incomplete answer
              {entries.length === 1 ? "" : "s"} across{" "}
              <span className="num">{new Set(entries.map((e) => e.chapterId)).size}</span> chapters
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`btn btn-sm ${showGrouped ? "btn-accent" : "btn-ghost"}`}
                onClick={() => setShowGrouped(!showGrouped)}
                type="button"
              >
                {showGrouped ? "Grouped by template" : "One row per answer"}
              </button>
              {retryChapters.length > 0 ? (
                <Link
                  className="btn btn-primary btn-sm"
                  href={`/practice?chapters=${retryChapters.join(",")}`}
                >
                  Retry these ({retryChapters.length})
                </Link>
              ) : null}
              <span className="text-ink-3 text-[12px]">read-only record</span>
            </div>
          </div>

          {showGrouped ? (
            <div className="panel divide-y divide-line">
              {groups.map((group) => (
                <div key={group.template} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[14px]">{humanise(group.template)}</span>
                    {group.count > 1 ? <Badge tone="warn">{group.count} misses</Badge> : null}
                    {group.chapters > 1 ? (
                      <span className="text-ink-3 text-[12px]">
                        across {group.chapters} chapters
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {group.items.map((entry) => (
                      <li
                        key={`${entry.questionId}-${entry.at}`}
                        className="flex flex-wrap items-baseline gap-x-2 text-[13px]"
                      >
                        <span className="spec-ref shrink-0">{entry.specRef}</span>
                        <span className="min-w-0 flex-1 text-ink-2">
                          <span className="num">{entry.yourAnswer}</span>
                        </span>
                        <span className="num text-ink-3 text-[12px]">
                          {entry.awardedMarks}/{entry.marks}
                        </span>
                        {entry.selfAssessed ? <Badge tone="neutral">self</Badge> : null}
                        <span className="num text-ink-3 text-[12px]">
                          {fmtDateTime(entry.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel divide-y divide-line">
              {entries.map((entry) => (
                <div
                  key={`${entry.questionId}-${entry.at}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="spec-ref shrink-0">{entry.specRef}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{humanise(entry.template)}</span>
                    <span className="text-ink-3 text-[12px]">
                      {entry.yourAnswer} · {fmtDateTime(entry.at)}
                    </span>
                  </span>
                  <span className="num shrink-0 text-[12px] text-ink-3">
                    {entry.awardedMarks}/{entry.marks}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Turn a generator key into something a learner can read. */
function humanise(template: string): string {
  return template
    .replace(/^(knowledge|extended|economics|maths|cs)-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
