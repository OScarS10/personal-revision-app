"use client";

import { useMemo, useState } from "react";
import { SUBJECTS, SUBJECT_ORDER, allSkillTags, getChapters, getPapers } from "@/lib/specs";
import { computeInsights } from "@/lib/analytics";
import type { Chapter, SubjectId } from "@/lib/types";
import { useStore } from "@/components/store-provider";
import { Badge, EmptyState, Meter, PageHeader, SectionHead, Segmented, SeverityBadge } from "@/components/ui";
import { fmtPercent, masteryWord } from "@/components/format";

/*
  Specification browser.

  This is the reference view: every chapter from the three specifications, with
  the content summary, and what the app currently thinks about it. Selection
  lives here too, so the whole specification is navigable in one place rather
  than only being reachable from the practice setup screen.
*/

export function ChaptersPage() {
  const { state, toggleChapter, setChapters } = useStore();

  const [subject, setSubject] = useState<SubjectId>("edexcel-mathematics");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const chapters = useMemo(() => getChapters(subject), [subject]);
  const papers = useMemo(() => getPapers(subject), [subject]);
  const meta = SUBJECTS[subject];
  const enabled = useMemo(() => state.enabled[subject] ?? [], [state.enabled, subject]);

  const enabledAll = useMemo(
    () => SUBJECT_ORDER.flatMap((s) => state.enabled[s] ?? []),
    [state.enabled],
  );

  const insights = useMemo(() => {
    const byId = new Map(
      computeInsights({
        chapters: SUBJECT_ORDER.flatMap((s) => getChapters(s)),
        skills: state.skills,
        enabledIds: new Set(enabledAll),
        config: state.config,
      }).map((i) => [i.chapterId, i]),
    );
    return byId;
  }, [state.skills, state.config, enabledAll]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.specRef.toLowerCase().includes(q) ||
        c.content.some((line) => line.toLowerCase().includes(q)),
    );
  }, [chapters, query]);

  const enabledSet = useMemo(() => new Set(enabled), [enabled]);
  const tags = useMemo(() => allSkillTags(subject), [subject]);

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Specification"
        title="Chapters"
        lede={meta.blurb}
        actions={
          <a className="btn btn-ghost btn-sm" href={meta.specUrl} rel="noreferrer" target="_blank">
            Official specification
          </a>
        }
      />

      <div className="panel mb-6">
        <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
          <div>
            <span className="label">Subject</span>
            <Segmented
              onChange={(v) => {
                setSubject(v as SubjectId);
                setQuery("");
                setOpenId(null);
              }}
              options={SUBJECT_ORDER.map((id) => ({ value: id, label: SUBJECTS[id].shortName }))}
              value={subject}
            />
          </div>
          <div>
            <span className="label">Filter</span>
            <input
              className="field w-full sm:w-64"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search content"
              type="search"
              value={query}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-rule border-t pt-3">
          <span className="num text-ink-3 text-[12px]">
            {enabled.length} of {chapters.length} in practice
          </span>
          <div className="ml-auto flex gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setChapters(subject, chapters.map((c) => c.id))}
              type="button"
            >
              All
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setChapters(subject, chapters.filter((c) => c.asLevel).map((c) => c.id))}
              type="button"
            >
              A-level only
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setChapters(subject, [])} type="button">
              None
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {papers.map((p) => (
          <div key={p.id} className="panel p-3.5">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[14px]">{p.code}</span>
              <span className="num text-ink-3 text-[12px]">{p.marks} marks</span>
            </div>
            <p className="text-ink-2 text-[12px] leading-relaxed">{p.title}</p>
            <p className="num text-ink-3 text-[12px]">
              {p.durationMinutes} min · {Math.round(p.weighting)}% of A level
            </p>
          </div>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="panel">
          <EmptyState title="No match" body={`Nothing in ${meta.shortName} matches “${query}”.`} />
        </div>
      ) : (
        <div className="panel divide-y divide-line">
          {visible.map((chapter) => (
            <ChapterRow
              key={chapter.id}
              chapter={chapter}
              insight={insights.get(chapter.id)}
              open={openId === chapter.id}
              onToggleOpen={() => setOpenId(openId === chapter.id ? null : chapter.id)}
              selected={enabledSet.has(chapter.id)}
              onSelect={() => toggleChapter(subject, chapter.id)}
            />
          ))}
        </div>
      )}

      <SectionHead title="Skill tags" hint="Used to group chapters and trace prerequisites." />
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} tone="neutral">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ChapterRow({
  chapter,
  insight,
  open,
  onToggleOpen,
  selected,
  onSelect,
}: {
  chapter: Chapter;
  insight: ReturnType<typeof computeInsights>[number] | undefined;
  open: boolean;
  onToggleOpen(): void;
  selected: boolean;
  onSelect(): void;
}) {
  return (
    <div>
      <div className="flex items-start gap-3 py-3">
        <input
          checked={selected}
          className="mt-1.5 accent-[var(--accent)]"
          onChange={onSelect}
          type="checkbox"
        />
        <button
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
          onClick={onToggleOpen}
          type="button"
        >
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="spec-ref">{chapter.specRef}</span>
            <span className="text-[14px]">{chapter.title}</span>
            {chapter.asLevel ? null : <Badge tone="neutral">AS</Badge>}
            {insight ? <SeverityBadge severity={insight.severity} /> : null}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-2">
            {chapter.content[0]}
          </span>
        </button>
        <span className="hidden w-32 shrink-0 pt-1 sm:block">
          {insight && insight.attempts > 0 ? (
            <Meter
              value={insight.mastery}
              tone={insight.mastery >= 0.7 ? "ok" : insight.mastery >= 0.4 ? "warn" : "bad"}
            />
          ) : (
            <span className="num text-ink-3 text-[12px]">not started</span>
          )}
        </span>
        <span className="num w-14 shrink-0 pt-1 text-right text-[12px] text-ink-3">
          {open ? "−" : "+"}
        </span>
      </div>

      {open ? (
        <div className="mb-3 ml-7 border-rule border-l pl-4">
          {/*
            Teaching notes come before the specification bullets, because the
            notes are what a learner is here to read. The bullets are reference
            material they can check a claim against, not the lesson itself.
          */}
          {chapter.knowledge ? (
            <div className="mb-4">
              <p className="mb-3 text-[14px] leading-relaxed">{chapter.knowledge.summary}</p>

              {chapter.knowledge.keyIdeas.length > 0 ? (
                <div className="mb-3">
                  <span className="label">Key ideas</span>
                  <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-ink-2">
                    {chapter.knowledge.keyIdeas.map((idea) => (
                      <li key={idea}>{idea}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {chapter.knowledge.terms.length > 0 ? (
                <div className="mb-3">
                  <span className="label">Terms worth knowing exactly</span>
                  <dl className="mt-1 space-y-2">
                    {chapter.knowledge.terms.map((term) => (
                      <div key={term.term}>
                        <dt className="text-[13px] font-medium">{term.term}</dt>
                        <dd className="text-[13px] leading-relaxed text-ink-2">
                          {term.definition}
                          {term.commonError ? (
                            <span className="mt-0.5 block text-wrong">
                              {term.commonError}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {chapter.knowledge.commonMistakes.length > 0 ? (
                <div className="mb-3">
                  <span className="label">Common mistakes</span>
                  <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-ink-2">
                    {chapter.knowledge.commonMistakes.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {chapter.knowledge.examTip ? (
                <p className="prose-note">
                  <span className="text-ink-1">In the exam:</span>{" "}
                  {chapter.knowledge.examTip}
                </p>
              ) : null}
            </div>
          ) : null}

          <span className="label">Specification content</span>
          <ul className="mb-3 list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-ink-2">
            {chapter.content.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          {chapter.skills.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {chapter.skills.map((s) => (
                <Badge key={s} tone="accent">
                  {s}
                </Badge>
              ))}
            </div>
          ) : null}
          {insight ? (
            <div className="grid gap-3 text-[12px] sm:grid-cols-2">
              <div>
                <span className="label">Model view</span>
                <p className="text-ink-2">{insight.recommendation}</p>
              </div>
              <div>
                <span className="label">Evidence</span>
                <p className="text-ink-2">{insight.evidence}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="label">Numbers</span>
                <p className="num text-ink-2">
                  mastery {masteryWord(insight.mastery)} · confidence{" "}
                  {fmtPercent(insight.confidence)} · learned {fmtPercent(insight.learned)} ·
                  retention {fmtPercent(insight.retention)} · theta {insight.theta.toFixed(2)} ·
                  attempts {insight.attempts}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
