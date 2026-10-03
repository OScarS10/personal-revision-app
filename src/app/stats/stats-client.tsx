"use client";

import { useMemo, useState } from "react";
import { SUBJECTS, SUBJECT_ORDER, getChapters } from "@/lib/specs";
import { BOUNDARIES, boundaryTable } from "@/lib/grades";
import { clamp } from "@/lib/math-utils";
import { buildProfile, computeInsights } from "@/lib/analytics";
import type { SubjectId } from "@/lib/types";
import { useStore } from "@/components/store-provider";
import { Badge, Meter, PageHeader, SectionHead, Segmented, Stat } from "@/components/ui";
import { fmtPercent, masteryWord } from "@/components/format";
import { DataPanel } from "@/components/data-panel";

/*
  Statistics and your data.

  The model output is only useful if the learner can see why it says what it
  says, so every number here is paired with the evidence behind it. Grade
  boundaries are the official linear A-level boundaries applied to a mastery
  estimate - a guide, not a prediction.
*/

export function StatsPage() {
  const { state } = useStore();
  const [subject, setSubject] = useState<SubjectId>("edexcel-mathematics");

  const chapters = useMemo(() => getChapters(subject), [subject]);
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

  const subjectInsights = useMemo(
    () => insights.filter((i) => i.subject === subject && i.enabled),
    [insights, subject],
  );

  const profile = useMemo(
    () =>
      buildProfile({
        subject,
        chapters,
        insights: subjectInsights,
        answers: state.answers,
        daily: state.daily,
      }),
    [subject, chapters, subjectInsights, state.answers, state.daily],
  );

  const bySeverity = useMemo(() => {
    const counts = { critical: 0, weak: 0, developing: 0, secure: 0, unrated: 0 };
    for (const i of subjectInsights) {
      if (i.severity in counts) counts[i.severity as keyof typeof counts]++;
    }
    return counts;
  }, [subjectInsights]);

  // Last 14 days of activity, oldest first.
  const history = useMemo(() => {
    const days: Array<{ key: string; attempted: number; correct: number }> = [];
    const cursor = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(cursor);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      const day = state.daily[key];
      days.push({ key, attempted: day?.attempted ?? 0, correct: day?.correct ?? 0 });
    }
    return days;
  }, [state.daily]);

  const peak = Math.max(1, ...history.map((d) => d.attempted));

  /*
    The raw-mark view of the grade estimate.

    Mastery is a 0..1 coverage figure, not a mark, so projecting it onto a raw-mark
    total is an estimate - the same estimate the probabilities above are built on,
    expressed in the unit the exam is actually marked in. Shown so the letter grade
    has numbers behind it rather than standing alone as a verdict.
  */
  const boundaries = boundaryTable(profile.subject);
  const totalMarks = BOUNDARIES[profile.subject].totalMarks;
  const boundarySource = BOUNDARIES[profile.subject].boundarySource;
  const projectedMarks = Math.round(clamp(profile.mastery, 0, 1) * totalMarks);

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Statistics"
        title="Progress"
        lede="How the model sees you, and the evidence behind it."
        actions={
          <Segmented
            onChange={(v) => setSubject(v as SubjectId)}
            options={SUBJECT_ORDER.map((id) => ({ value: id, label: SUBJECTS[id].shortName }))}
            value={subject}
          />
        }
      />

      {state.answers.length === 0 ? (
        <div className="panel">
          <p className="prose-note">
            Nothing has been recorded yet, so there is nothing to model. Answer a few questions and
            this page fills in.
          </p>
        </div>
      ) : null}

      <div className="panel mb-6">
        <div className="grid gap-6 sm:grid-cols-4">
          <Stat
            label="Estimated grade"
            value={profile.grade}
            hint={`${fmtPercent(profile.confidence)} confidence in this estimate`}
          />
          <Stat
            label="Overall accuracy"
            value={profile.totalAttempts > 0 ? fmtPercent(profile.accuracy) : "—"}
            hint={`${profile.totalAttempts} attempts on record`}
          />
          <Stat
            label="Coverage"
            value={`${profile.chaptersTested}/${profile.chaptersEnabled}`}
            hint="chapters attempted"
          />
          <Stat label="Ability" value={profile.theta.toFixed(2)} hint="IRT theta, logit scale" />
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionHead title="Grade boundaries" />
          <div className="panel p-4">
            {profile.gradeProbabilities.map(({ grade, probability }) => (
              <div key={grade} className="mb-3 last:mb-0">
                <div className="mb-1 flex items-baseline justify-between text-[13px]">
                  <span>Grade {grade}</span>
                  <span className="num text-ink-2">{fmtPercent(probability)}</span>
                </div>
                <Meter
                  value={probability}
                  tone={probability >= 0.5 ? "ok" : probability >= 0.2 ? "warn" : "muted"}
                />
              </div>
            ))}
            <p className="prose-note mt-3">
              Mastery {masteryWord(profile.mastery)} mapped onto this subject&apos;s own boundaries.
              Treat it as a rough guide, not a prediction.
            </p>

            {/*
              The raw-mark table, shown because the probabilities above are derived
              from a mastery estimate rather than from marks. A learner aiming at a
              grade needs the number to aim at, and an invented cut presented as an
              official boundary was the thing worth fixing here.
            */}
            <div className="mt-4 border-t border-rule pt-4">
              <h3 className="text-[13px] font-medium">{SUBJECTS[profile.subject].name} boundaries</h3>
              <table className="mt-2 w-full text-[13px]">
                <caption className="sr-only">Marks needed for each grade</caption>
                <thead>
                  <tr className="text-left text-ink-3">
                    <th className="py-1 font-normal">Grade</th>
                    <th className="py-1 text-right font-normal">Marks needed</th>
                    <th className="py-1 text-right font-normal">Projected</th>
                  </tr>
                </thead>
                <tbody>
                  {boundaries.map(({ grade, mark }) => (
                    <tr key={grade} className="border-t border-rule/60">
                      <td className="py-1">{grade}</td>
                      <td className="num py-1 text-right">
                        {mark}
                        <span className="text-ink-3">/{totalMarks}</span>
                      </td>
                      <td className="py-1 text-right">
                        {projectedMarks >= mark ? (
                          <span className="text-ok">reached</span>
                        ) : (
                          <span className="text-ink-3">{mark - projectedMarks} to go</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="prose-note mt-3">
                Your {totalMarks}-mark total is projected at {projectedMarks} from mastery. {boundarySource}
              </p>
            </div>
          </div>
        </div>

        <div>
          <SectionHead title="Last 14 days" />
          <div className="panel p-4">
            <div className="flex h-28 items-end gap-1">
              {history.map((d) => (
                <div key={d.key} className="group relative flex-1" title={`${d.key}: ${d.attempted} attempted, ${d.correct} correct`}>
                  <div
                    className="w-full rounded-t-[2px] bg-ink-3"
                    style={{ height: `${(d.attempted / peak) * 100}%` }}
                  >
                    {d.attempted > 0 ? (
                      <div
                        className="w-full rounded-t-[2px] bg-ok"
                        style={{ height: `${(d.correct / peak) * 100}%` }}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <p className="prose-note mt-2">
              {history.reduce((s, d) => s + d.attempted, 0)} attempts over 14 days.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <SectionHead title="Chapter health" />
        <div className="panel mb-3 flex flex-wrap gap-2 p-3">
          {Object.entries(bySeverity).map(([severity, count]) => (
            <Badge key={severity} tone={count === 0 ? "neutral" : "accent"}>
              {count} {severity}
            </Badge>
          ))}
        </div>
        <div className="panel divide-y divide-rule">
          {[...subjectInsights]
            .sort((a, b) => b.weakness - a.weakness)
            .map((i) => (
              <div key={i.chapterId} className="py-3">
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="spec-ref">{i.specRef}</span>
                  <span className="text-[14px]">{i.title}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="hidden w-32 shrink-0 sm:block">
                    <Meter
                      value={i.mastery}
                      empty={i.attempts === 0}
                      tone={i.mastery >= 0.7 ? "ok" : i.mastery >= 0.4 ? "warn" : "bad"}
                    />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-ink-2">{i.recommendation}</span>
                  <span className="num shrink-0 text-[12px] text-ink-3">
                    {i.accuracy !== null ? fmtPercent(i.accuracy) : "—"}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      <SectionHead title="Your data" />
      <DataPanel subject={subject} />
    </div>
  );
}
