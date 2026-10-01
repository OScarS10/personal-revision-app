"use client";

import { useMemo } from "react";
import type { Chapter, SubjectId } from "@/lib/types";
import { SUBJECTS } from "@/lib/specs";
import { Badge, Meter } from "@/components/ui";
import { masteryWord } from "@/components/format";

/*
  Chapter selection.

  Shows how much the learner already knows next to every chapter, so selection
  is informed rather than blind. Search matters here: the three subjects total
  68 chapters, and hunting through a flat list for "quadratics" is miserable.
*/

export interface ChapterPickerProps {
  subject: SubjectId;
  chapters: Chapter[];
  enabled: string[];
  mastery: Record<string, number>;
  onToggle(chapterId: string): void;
  onSetAll(ids: string[]): void;
  search: string;
  onSearchChange(value: string): void;
}

function matches(chapter: Chapter, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    chapter.title.toLowerCase().includes(q) ||
    chapter.specRef.toLowerCase().includes(q) ||
    chapter.content.some((line) => line.toLowerCase().includes(q))
  );
}

export function ChapterPicker({
  subject,
  chapters,
  enabled,
  mastery,
  onToggle,
  onSetAll,
  search,
  onSearchChange,
}: ChapterPickerProps) {
  const visible = useMemo(
    () => chapters.filter((c) => matches(c, search.trim())),
    [chapters, search],
  );

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);
  const meta = SUBJECTS[subject];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="field max-w-xs"
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter chapters"
          type="search"
          value={search}
        />
        <span className="num text-ink-3 text-[12px]">
          {enabled.length} of {chapters.length} selected
        </span>
        <div className="ml-auto flex gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onSetAll(chapters.map((c) => c.id))}
            type="button"
          >
            All
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onSetAll(chapters.filter((c) => c.asLevel).map((c) => c.id))}
            type="button"
          >
            A-level only
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => onSetAll([])} type="button">
            None
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="prose-note">No chapter matches “{search}”.</p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((chapter) => {
            const on = enabledSet.has(chapter.id);
            const m = mastery[chapter.id];
            return (
              <li key={chapter.id}>
                <label className="flex cursor-pointer items-start gap-3 py-2.5">
                  <input
                    checked={on}
                    className="mt-1 accent-[var(--accent)]"
                    onChange={() => onToggle(chapter.id)}
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="spec-ref">{chapter.specRef}</span>
                      <span className="text-[14px]">{chapter.title}</span>
                      {chapter.asLevel ? null : <Badge tone="neutral">AS</Badge>}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink-2">
                      {chapter.content[0]}
                    </span>
                    {m !== undefined ? (
                      <span className="mt-1.5 flex max-w-[220px] items-center gap-2">
                        <Meter value={m} tone={m >= 0.7 ? "ok" : m >= 0.4 ? "warn" : "bad"} />
                        <span className="text-ink-3 text-[12px]">{masteryWord(m)}</span>
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p className="prose-note mt-3">{meta.blurb}</p>
    </div>
  );
}
