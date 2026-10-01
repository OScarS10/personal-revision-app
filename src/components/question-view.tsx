"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";import { Markdown } from "@/components/markdown";
import { Badge, Meter } from "@/components/ui";
import type { MarkingResult } from "@/lib/marking";
import type { GeneratedQuestion, WorkedStep } from "@/lib/types";
import { getChapter } from "@/lib/specs";
import { Countdown, secondsLeft } from "@/components/clock";
import { fmtTime } from "@/components/format";

export type Phase = "answering" | "revealed" | "skipped";

export interface QuestionViewProps {
  question: GeneratedQuestion;
  phase: Phase;
  /** Held back in test mode so feedback only appears at the end. */
  holdFeedback?: boolean;
  /** Absolute deadline for this question, or null when untimed. */
  deadline?: number | null;
  /** Fired when the deadline passes, so the current input can be auto-submitted. */
  onTimeUp?(response: string[]): void;
  onSubmit(response: string[]): void;
  onReveal(): void;
  onSkip(): void;
  onNext(): void;
  onUndo?(): void;
  lastResult?: MarkingResult | null;
  index?: number;
  total?: number;
  canUndo?: boolean;
  onFlag?(): void;
  flagged?: boolean;
  submitLabel?: string;
}

/** Default input hint per format, shown as a placeholder. */
function placeholderFor(format: GeneratedQuestion["format"]): string {
  switch (format.kind) {
    case "numeric":
      return "Your answer";
    case "text":
      return "Type your answer";
    case "code":
      return "Type your code";
    default:
      return "";
  }
}

function unitHint(format: GeneratedQuestion["format"]): string | null {
  return format.kind === "numeric" && format.unit ? format.unit : null;
}

/**
 * Thin wrapper.
 *
 * The per-question response state lives in QuestionBody, which is keyed on the
 * question id by this component. Remounting on a new question is what resets
 * the input, which is both simpler and more correct than an effect that clears
 * state after a render has already shown stale text.
 */
export function QuestionView(props: QuestionViewProps) {
  return <QuestionBody key={props.question.id} {...props} />;
}

function QuestionBody(props: QuestionViewProps) {
  const {
    question,
    phase,
    holdFeedback = false,
    deadline = null,
    onTimeUp,
    onSubmit,
    onReveal,
    onSkip,
    onNext,
    onUndo,
    lastResult,
    index,
    total,
    canUndo = false,
    onFlag,
    flagged = false,
  } = props;

  const format = question.format;
  const revealed = phase !== "answering";
  const showFeedback = revealed && !holdFeedback;

  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  // Which mark scheme points the learner claims, by index. Kept separate from
  // the written answer so the two can be required independently.
  const [schemeTicks, setSchemeTicks] = useState<number[]>([]);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const scheme = format.kind === "extended" ? format.scheme : null;
  const levels = format.kind === "extended" ? (format.levels ?? []) : [];

  const numeric = format.kind === "numeric";
  const single = format.kind === "single-choice";
  const multi = format.kind === "multi-choice";
  const extended = format.kind === "extended";
  const typed = numeric || format.kind === "text" || format.kind === "code" || extended;

  // An extended answer needs both the writing and the self-marking before it
  // counts, otherwise the learner could submit an essay and claim every point.
  const canSubmit = extended
    ? text.trim().length > 0 && schemeTicks.length > 0
    : typed
      ? text.trim().length > 0
      : selected.length > 0;

  function currentResponse(): string[] {
    // For an extended answer the response is the essay plus the indices of the
    // scheme points the learner is claiming, so the mark can be recomputed from
    // the stored answer rather than trusted from the UI.
    if (extended) return [text.trim(), ...schemeTicks.map((i) => String(i))];
    if (typed) return [text.trim()];
    return selected;
  }

  function submit() {
    if (!canSubmit || revealed) return;
    onSubmit(currentResponse());
  }

  /**
   * Time ran out. The response still goes through the parent so it is marked and
   * recorded, but an empty answer is allowed through: leaving a question blank
   * when the clock runs out is the correct outcome, not an error.
   */
  const handleTimeUp = useCallback(() => {
    if (revealed) return;
    onTimeUp?.(currentResponse());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, onTimeUp, text, selected, typed]);

  function toggleOption(option: string) {
    if (revealed) return;
    if (single) {
      setSelected([option]);
      // Auto-submit on single choice: one click is the whole interaction.
      onSubmit([option]);
      return;
    }
    setSelected((prev) =>
      prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option],
    );
  }

  // Keyboard handling: digits pick options, Enter submits, ? reveals.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "Escape") {
        if (revealed) onNext();
        return;
      }

      if (!typing && (single || multi) && !revealed && /^[1-6]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        const option = format.options[index];
        if (option) {
          event.preventDefault();
          toggleOption(option);
        }
        return;
      }

      if (event.key === "Enter" && !typing) {
        event.preventDefault();
        if (revealed) onNext();
        else if (canSubmit) submit();
        return;
      }

      if (event.key === "?" && !typing && !revealed) {
        event.preventDefault();
        onReveal();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, canSubmit, selected, format, question.id]);

  const chapter = getChapter(question.chapterId);
  const options = format.kind === "single-choice" || format.kind === "multi-choice" ? format.options : [];

  const correctOptionSet = useMemo(() => {
    if (!showFeedback) return null;
    return new Set([question.answer]);
  }, [showFeedback, question.answer]);

  const result = lastResult ?? null;
  const outcome: "correct" | "partial" | "wrong" | null = !showFeedback || !result
    ? null
    : result.correct
      ? "correct"
      : result.score > 0
        ? "partial"
        : "wrong";

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------------------------------------- header */}
      <div className="border-rule flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="spec-ref shrink-0">{question.specRef}</span>
          {chapter ? (
            <span className="truncate text-[13px] text-ink-2">{chapter.title}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {deadline !== null && deadline !== undefined ? (
            <Countdown deadline={deadline} onExpire={handleTimeUp} aria-live="off">
              {(now) => {
                const left = secondsLeft(deadline, now);
                return (
                  <span className={`num text-[13px] ${left < 20 ? "text-bad" : "text-ink-2"}`}>
                    {fmtTime(left * 1000)}
                  </span>
                );
              }}
            </Countdown>
          ) : null}
          {index !== undefined && total !== undefined ? (
            <span className="num text-ink-3 text-[12px]">
              {index + 1} / {total}
            </span>
          ) : null}
          {onFlag ? (
            <button
              onClick={onFlag}
              title={flagged ? "Remove bookmark" : "Bookmark this question"}
              aria-pressed={flagged}
              className={`btn btn-sm btn-ghost ${flagged ? "text-warn" : ""}`}
            >
              {flagged ? "Bookmarked" : "Bookmark"}
            </button>
          ) : null}
          {onUndo ? (
            <button onClick={onUndo} disabled={!canUndo} className="btn btn-sm btn-ghost">
              Undo
            </button>
          ) : null}
        </div>
      </div>

      {/* Progress within the session */}
      {index !== undefined && total !== undefined ? (
        <Meter value={(index + (revealed ? 1 : 0)) / total} tone="accent" label="Session progress" />
      ) : null}

      {/* ----------------------------------------------------------- stem */}
      <div>
        <Markdown>{question.prompt}</Markdown>
        {question.context ? (
          <div className="panel-inset mt-3 px-4 py-3">
            <Markdown compact>{question.context}</Markdown>
          </div>
        ) : null}
      </div>

      {/* --------------------------------------------------------- answer */}
      <div className="flex flex-col gap-2.5">
        {options.length > 0 ? (
          <div className="flex flex-col gap-1.5" role={multi ? "group" : "radiogroup"}>
            {options.map((option: string, i: number) => {
              const isSelected = selected.includes(option);
              const isCorrect = correctOptionSet?.has(option) ?? false;
              const isWrongPick = showFeedback && isSelected && !isCorrect;
              return (
                <button
                  key={`${option}-${i}`}
                  type="button"
                  className="option"
                  data-selected={!revealed && isSelected ? "true" : undefined}
                  data-state={
                    showFeedback ? (isCorrect ? "correct" : isWrongPick ? "wrong" : undefined) : undefined
                  }
                  onClick={() => toggleOption(option)}
                  disabled={revealed}
                  aria-pressed={multi ? isSelected : undefined}
                  role={single ? "radio" : undefined}
                  aria-checked={single ? isSelected : undefined}
                >
                  <span className="kbd mt-0.5 shrink-0">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <Markdown compact>{option}</Markdown>
                  </span>
                  {showFeedback && isCorrect ? (
                    <span className="text-ok mt-0.5 shrink-0 text-[11.5px] font-medium">Correct</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {extended && scheme ? (
          <div className="flex flex-col gap-4">
            <div>
              <span className="label">
                Your answer — {scheme.command} ({scheme.totalMarks} marks)
              </span>
              <textarea
                className="field min-h-[14rem] resize-y leading-relaxed"
                placeholder="Write your answer here, as you would in the exam. Then mark yourself against the scheme below."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={revealed}
                rows={12}
              />
            </div>

            {scheme.guidance ? <p className="prose-note">{scheme.guidance}</p> : null}

            <div>
              <span className="label">
                Mark scheme — tick what your answer actually says
              </span>
              <ul className="mt-1 divide-y divide-line border border-line">
                {scheme.points.map((point, i) => {
                  const on = schemeTicks.includes(i);
                  return (
                    <li key={i}>
                      <label className="flex cursor-pointer items-start gap-3 p-3">
                        <input
                          checked={on}
                          className="mt-1 accent-[var(--accent)]"
                          disabled={revealed}
                          onChange={() =>
                            setSchemeTicks((prev) =>
                              prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                            )
                          }
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-2">
                            <span className="text-[14px]">{point.label}</span>
                            {point.isLink ? <Badge tone="accent">chain</Badge> : null}
                            <span className="num text-ink-3 text-[12px]">{point.marks}m</span>
                          </span>
                          <span className="mt-0.5 block text-[13px] text-ink-2">{point.detail}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <p className="prose-note mt-2">
                Marking your own work runs generous. Read your answer again before ticking, and
                leave anything you could not actually write off.
              </p>
            </div>

            {levels.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-[13px] text-ink-2">
                  Levels of response ({levels.length} bands)
                </summary>
                <ul className="mt-2 divide-y divide-line">
                  {levels.map((l) => (
                    <li key={l.level} className="py-2">
                      <span className="text-[13px]">
                        <span className="num text-ink-3">Level {l.level}</span> — {l.label}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-ink-2">{l.descriptor}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : typed ? (
          <div className="flex flex-col gap-2">
            {format.kind === "code" ? (
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                className="field min-h-[9rem] resize-y leading-relaxed"
                placeholder={placeholderFor(format)}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={revealed}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                rows={6}
              />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  className={`field ${numeric ? "field-lg" : ""}`}
                  type="text"
                  inputMode={numeric ? "decimal" : "text"}
                  placeholder={placeholderFor(format)}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (revealed) onNext();
                      else if (canSubmit) submit();
                    }
                  }}
                  disabled={revealed}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                {unitHint(format) ? (
                  <span className="text-ink-3 shrink-0 text-[13px] sm:pl-1">
                    {format.kind === "numeric" ? format.unit : null}
                  </span>
                ) : null}
              </div>
            )}

            {!revealed && numeric ? (
              <p className="text-ink-3 text-[12px]">
                Marks are awarded on the number, so units are not required.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------- feedback */}
      {showFeedback ? (
        <div className="animate-in flex flex-col gap-4">
          <Verdict outcome={outcome} result={result} question={question} />

          <div className="panel">
            <div className="border-rule text-ink-2 border-b px-4 py-2 text-[12.5px] font-medium">
              Worked solution
            </div>
            <ol className="divide-rule divide-y">
              {question.solution.map((step: WorkedStep, i: number) => (
                <li key={i} className="flex gap-3 px-4 py-2.5">
                  <span className="num text-ink-3 w-5 shrink-0 pt-0.5 text-[12px]">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-2 text-[12px] font-medium">{step.label}</div>
                    <div className="mt-0.5 text-[13.5px] leading-relaxed">
                      <Markdown compact>{step.work}</Markdown>
                      {step.result ? (
                        <div className="mt-1 text-[13.5px]">
                          <Markdown compact>{step.result}</Markdown>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {question.takeaway ? (
              <div className="border-rule bg-surface-2 border-t px-4 py-2.5">
                <div className="label mb-1">Worth remembering</div>
                <p className="text-ink-2 text-[13px] leading-relaxed">{question.takeaway}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------------- actions */}
      <div className="border-rule flex flex-wrap items-center gap-2 border-t pt-4">
        {revealed ? (
          <button onClick={onNext} className="btn btn-primary">
            {onFlag && flagged ? "Next question" : "Next question"}
            <span className="kbd ml-1 border-current/25 bg-transparent">Enter</span>
          </button>
        ) : (
          <>
            {typed ? (
              <button onClick={submit} disabled={!canSubmit} className="btn btn-primary">
                Check answer
                <span className="kbd ml-1 border-current/25 bg-transparent">Enter</span>
              </button>
            ) : null}
            {multi ? (
              <button
                onClick={submit}
                disabled={selected.length === 0}
                className={typed ? "btn" : "btn btn-primary"}
              >
                Check answer
              </button>
            ) : null}
            <button onClick={onReveal} className="btn btn-ghost">
              Show answer
              <span className="kbd ml-1">?</span>
            </button>
            <button onClick={onSkip} className="btn btn-ghost">
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Verdict({
  outcome,
  result,
  question,
}: {
  outcome: "correct" | "partial" | "wrong" | null;
  result: MarkingResult | null;
  question: GeneratedQuestion;
}) {
  if (!outcome) return null;

  const tone =
    outcome === "correct"
      ? { cls: "text-ok", bg: "bg-ok-soft border-ok/30", word: "Correct" }
      : outcome === "partial"
        ? { cls: "text-warn", bg: "bg-warn-soft border-warn/30", word: "Partly right" }
        : { cls: "text-bad", bg: "bg-bad-soft border-bad/30", word: "Not quite" };

  const chapter = getChapter(question.chapterId);

  return (
    <>
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[3px] border px-4 py-3 ${tone.bg}`}>
        <div className="min-w-0">
          <div className={`text-[14px] font-semibold ${tone.cls}`}>{tone.word}</div>
          <div className="text-ink-2 mt-0.5 text-[13px]">{result?.feedback}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="label">Marks</div>
            <div className="num text-ink text-[15px]">
              {result?.awardedMarks ?? 0}
              <span className="text-ink-3"> / {question.marks}</span>
            </div>
          </div>
        </div>
      </div>

      {/*
        When the answer was wrong, the chapter's teaching notes are the most
        useful thing on the page, so they are surfaced immediately rather than
        left for the learner to find on the chapters page. Correct answers do
        not get this, because a learner who was right has nothing to read.
      */}
      {outcome !== "correct" && chapter?.knowledge ? (
        <details className="panel mt-3">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium">
            Why that is the answer — {chapter.specRef} notes
          </summary>
          <div className="border-rule border-t px-4 py-3">
            <p className="mb-3 text-[13.5px] leading-relaxed">{chapter.knowledge.summary}</p>
            {chapter.knowledge.commonMistakes.length > 0 ? (
              <div className="mb-3">
                <span className="label">Mistakes this question is easy to make</span>
                <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-ink-2">
                  {chapter.knowledge.commonMistakes.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {chapter.knowledge.examTip ? (
              <p className="prose-note">
                <span className="text-ink-1">In the exam:</span> {chapter.knowledge.examTip}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  );
}
