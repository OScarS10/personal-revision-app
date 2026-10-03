"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";import { Markdown } from "@/components/markdown";
import { Badge, Meter } from "@/components/ui";
import type { MarkingResult } from "@/lib/marking";
import { markExtended, ratingToken } from "@/lib/marking";
import type { GeneratedQuestion, WorkedStep } from "@/lib/types";
import { getChapter } from "@/lib/specs";
import {
  autoMarkExtended,
  calibrationSummary,
  CALIBRATION_FLOOR,
  type Calibration,
} from "@/lib/auto-mark";
import { trustedAward } from "@/lib/trusted-auto";
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
  /**
   * Running calibration of the automatic extended-answer marker.
   *
   * Held by the caller rather than kept here because it has to outlive a single
   * question: the point is that the marker adjusts to this learner over many
   * answers, and state inside this component dies with the question.
   */
  calibration?: Calibration;
  /** Notified when the learner's self-mark is folded into the calibration. */
  onCalibrationChange?(calibration: Calibration): void;
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
    calibration = CALIBRATION_FLOOR,
    onCalibrationChange,
  } = props;

  const format = question.format;
  const revealed = phase !== "answering";
  const showFeedback = revealed && !holdFeedback;

const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  // Which mark scheme points the learner claims, by index. Kept separate from
  // the written answer so the two can be required independently.
  const [schemeTicks, setSchemeTicks] = useState<number[]>([]);
  // Which rating step the learner picked, when the scheme has a scale. Null means
  // unrated, which is a real state: those marks are then unclaimed.
  const [ratingChoice, setRatingChoice] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const scheme = format.kind === "extended" ? format.scheme : null;
  // Memoised because a `?? []` inline would be a fresh array on every render, which
  // would re-run the estimate below on every keystroke for no reason.
  const levels = useMemo(
    () => (format.kind === "extended" ? (format.levels ?? []) : []),
    [format],
  );

  const numeric = format.kind === "numeric";
  const single = format.kind === "single-choice";
  const multi = format.kind === "multi-choice";
  const extended = format.kind === "extended";
  const typed = numeric || format.kind === "text" || format.kind === "code" || extended;

  /*
    Points the app may award on its own, and the result of doing so.

    Only points that list the evidence they accept qualify, and every listed term
    must be present. The rating is deliberately absent from this calculation and
    from the ticks below: it stays the learner's, whatever the writing contains.
  */
  const trust = useMemo(() => {
    if (!extended || !scheme || text.trim().length === 0) return null;
    return trustedAward(scheme, text);
  }, [extended, scheme, text]);

  /*
    Points already awarded by the app, so the UI can show them as settled instead
    of asking the learner to tick them.
  */
  const autoAwarded = useMemo(() => new Set(trust?.awarded.map((a) => a.index) ?? []), [trust]);

  // A rated item needs a rating as well as the writing, or the learner would be
  // able to leave the judgement marks unclaimed and never notice.
  const ratingScale = scheme?.rating ?? null;
  const needsRating = ratingScale !== null;

  // An extended answer needs both the writing and the self-marking before it
  // counts, otherwise the learner could submit an essay and claim every point.
  const canSubmit = extended
    ? text.trim().length > 0 &&
      (autoAwarded.size > 0 || schemeTicks.some((i) => !autoAwarded.has(i))) &&
      (!needsRating || ratingChoice !== null)
    : typed
      ? text.trim().length > 0
      : selected.length > 0;

  function currentResponse(): string[] {
    // For an extended answer the response is the essay plus the indices of the
    // scheme points the learner is claiming, plus the rating step, so the mark can
    // be recomputed from the stored answer rather than trusted from the UI.
    if (extended) {
      return [
        text.trim(),
        ...schemeTicks.map((i) => String(i)),
        ...(ratingChoice !== null ? [ratingToken(ratingChoice)] : []),
      ];
    }
    if (typed) return [text.trim()];
    return selected;
  }

  /*
    The automatic estimate, recomputed while the learner types.

    Memoised because this runs the whole rubric engine over the answer, and it is
    keyed on the writing only - deliberately not on the scheme ticks, so the
    estimate describes the text rather than moving around as boxes get ticked.
  */
  const autoEstimate = useMemo(() => {
    if (!extended || !scheme || text.trim().length === 0) return null;
    const subject = getChapter(question.chapterId)?.subject;
    if (!subject) return null;
    return autoMarkExtended(text, scheme, question.chapterId, subject, calibration, undefined, levels);
  }, [extended, scheme, text, question.chapterId, levels, calibration]);

  const calibrationState = useMemo(() => calibrationSummary(calibration), [calibration]);

function submit() {
    if (!canSubmit || revealed) return;

    /*
      Fold the learner's self-mark into the calibration before handing the answer
      up, so the marker starts adjusting from this answer rather than the next one.

      Only the self-mark is recorded here - the estimate itself never enters it, and
      the recorded mark is still the learner's own, so the ability model keeps
      treating an extended answer as self-assessed rather than quietly promoting a
      keyword match to a grade.
    */
    if (extended && scheme && autoEstimate) {
      /*
        Calibrated against the learner's own claims only, so the points the app
        already awarded exactly are excluded. Mixing them in would teach the
        estimate that it had earned marks the keywords earned, which is exactly
        the confusion the trusted path exists to avoid.
      */
      const claimedMarks = markExtended(scheme, new Set(schemeTicks), levels, ratingChoice)
        .achievedFraction;
      const subject = getChapter(question.chapterId)?.subject;
      if (subject) {
        onCalibrationChange?.(
          autoMarkExtended(
            text,
            scheme,
            question.chapterId,
            subject,
            calibration,
            claimedMarks,
            levels,
          ).calibration,
        );
      }
    }

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
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="btn btn-sm btn-ghost"
              type="button"
              aria-label="Undo last answer"
            >
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

            {/*
              The automatic estimate.

              Deliberately an estimate, always shown next to the learner's own mark
              rather than replacing it, with its confidence stated. A keyword marker
              that presented itself as an examiner would be worse than the generous
              self-marking it replaces, so the wording here never implies more
              authority than the engine has earned.
            */}
            {autoEstimate ? (
              <div className="rounded border border-rule p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="label">Automatic estimate</span>
                  <span className="flex items-baseline gap-2">
                    <span className="num text-[15px]">
                      {autoEstimate.estimatedMarks} / {autoEstimate.totalMarks}
                    </span>
                    <Badge tone={autoEstimate.confidence >= 0.5 ? "accent" : "warn"}>
                      {Math.round(autoEstimate.confidence * 100)}% confident
                    </Badge>
                  </span>
                </div>

                <p className="mt-1 text-[13px] text-ink-2">
                  {autoEstimate.band} — {autoEstimate.bandRequirement}
                </p>

                {autoEstimate.linksAvailable > 0 ? (
                  <p className="mt-1 text-[13px] text-ink-2">
                    {autoEstimate.linksFound} of {autoEstimate.linksAvailable} chain-of-reasoning
                    points look earned.{" "}
                    {autoEstimate.linksFound === 0
                      ? "There is no linking language in your answer, so these cannot be awarded."
                      : ""}
                  </p>
                ) : null}

                <ul className="mt-2 flex flex-col gap-1">
                  {autoEstimate.feedback.map((line, i) => (
                    <li key={i} className="text-[13px] text-ink-2">
                      {line}
                    </li>
                  ))}
                </ul>

                {autoEstimate.caveats.length > 0 ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[13px] text-warn">
                      Why this estimate may be wrong ({autoEstimate.caveats.length})
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1">
                      {autoEstimate.caveats.map((line, i) => (
                        <li key={i} className="text-[13px] text-ink-3">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                <p className="mt-2 text-[12px] text-ink-3">{calibrationState.message}</p>
              </div>
            ) : null}

            <div>
              <span className="label">
                Mark scheme — tick what your answer actually says
              </span>
              <ul className="mt-1 divide-y divide-rule border border-rule">
                {scheme.points.map((point, i) => {
                  /*
                    A point the app can settle is shown as settled and cannot be
                    ticked, because ticking it could only agree with the answer
                    already given. Leaving it interactive would invite the learner
                    to un-tick a fact they did write, which is the one thing
                    self-marking should not let them do.
                  */
                  const auto = autoAwarded.has(i);
                  const on = auto || schemeTicks.includes(i);
                  const verdict = autoEstimate?.points.find((p) => p.index === i);
                  return (
                    <li key={i}>
                      <label
                        className={`flex items-start gap-3 p-3 ${auto ? "" : "cursor-pointer"}`}
                      >
                        <input
                          checked={on}
                          className="mt-1 accent-[var(--accent)]"
                          disabled={revealed || auto}
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
                            {auto ? <Badge tone="ok">checked for you</Badge> : null}
                            <span className="num text-ink-3 text-[12px]">{point.marks}m</span>
                            {/*
                              What the marker thinks, shown on the row rather than
                              only in the summary. The learner is encouraged to argue
                              with it, so the disagreement has to be visible per point.
                            */}
                            {verdict && !auto ? (
                              <Badge tone={verdict.evidenced ? "ok" : "warn"}>
                                {verdict.evidenced
                                  ? "in your answer"
                                  : `not found (${Math.round(verdict.coverage * 100)}%)`}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-ink-2">{point.detail}</span>
                          {auto ? (
                            <span className="mt-1 block text-[12px] text-ink-3">
                              Every term this point looks for appears in your answer, so the mark is
                              awarded automatically.
                            </span>
                          ) : null}
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

            {/*
              The rating, presented as a scale rather than more boxes, because a
              rating is a judgement about quality and the learner has to see the
              steps side by side to choose between them. The app never picks one.
            */}
            {ratingScale ? (
              <div>
                <span className="label">
                  {ratingScale.axis} ({ratingScale.totalMarks}m)
                </span>
                <p className="mt-1 text-[13px] text-ink-2">
                  Read your own answer and pick the step that describes it. This is your judgement,
                  so the app does not make it for you.
                </p>
                <ul className="mt-1 divide-y divide-rule border border-rule">
                  {[...ratingScale.levels]
                    .sort((a, b) => a.marks - b.marks)
                    .map((step) => {
                      const chosen = ratingChoice === step.level;
                      return (
                        <li key={step.level}>
                          <label className="flex cursor-pointer items-start gap-3 p-3">
                            <input
                              checked={chosen}
                              className="mt-1 accent-[var(--accent)]"
                              disabled={revealed}
                              name={`rating-${question.id}`}
                              onChange={() => setRatingChoice(step.level)}
                              type="radio"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-baseline gap-2">
                                <span className="text-[14px]">{step.label}</span>
                                <span className="num text-ink-3 text-[12px]">{step.marks}m</span>
                              </span>
                              <span className="mt-0.5 block text-[13px] text-ink-2">
                                {step.descriptor}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ) : null}

            {levels.length > 0 ? (
              <details>
                <summary className="cursor-pointer text-[13px] text-ink-2">
                  Levels of response ({levels.length} bands)
                </summary>
                <ul className="mt-2 divide-y divide-rule">
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
          <button onClick={onNext} className="btn btn-primary" type="button">
            {onFlag && flagged ? "Next question" : "Next question"}
            <span className="kbd ml-1 border-current/25 bg-transparent">Enter</span>
          </button>
        ) : (
          <>
            {typed ? (
              <button onClick={submit} disabled={!canSubmit} className="btn btn-primary" type="button">
                Check answer
                <span className="kbd ml-1 border-current/25 bg-transparent">Enter</span>
              </button>
            ) : null}
            {multi ? (
              <button
                onClick={submit}
                disabled={selected.length === 0}
                className={typed ? "btn" : "btn btn-primary"}
                type="button"
              >
                Check answer
              </button>
            ) : null}
            <button onClick={onReveal} className="btn btn-ghost" type="button">
              Show answer
              <span className="kbd ml-1">?</span>
            </button>
            <button onClick={onSkip} className="btn btn-ghost" type="button">
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
                <span className="text-ink-2">In the exam:</span> {chapter.knowledge.examTip}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </>
  );
}
