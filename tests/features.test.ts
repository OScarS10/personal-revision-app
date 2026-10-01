import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markExtended, markQuestion } from "@/lib/marking";
import "@/lib/generators/all";
import { recordTemplateStat, templateCalibration, calibrationReport } from "@/lib/calibration";
import { buildStudyPlan, dailySlice, buildNotebook } from "@/lib/planning";
import { applyAnswer } from "@/lib/model";
import { createInitialState, migrateState, exportState, importState } from "@/lib/store";
import { computeInsights } from "@/lib/analytics";
import { SUBJECTS, SUBJECT_ORDER, getChapters, getChapter } from "@/lib/specs";
import { getGeneratorsForSpec } from "./helpers";
import type { Answer, GeneratedQuestion, MarkScheme, PersistedState } from "@/lib/types";

/*
  The four things this project got wrong before, guarded so they stay fixed:

  - an item that does not assess the chapter was allowed to move ability,
  - hand-set difficulty was treated as measured fact,
  - "what should I do today" was answered by "you are weak here",
  - a self-assessed score was trusted as though an examiner had set it.
*/

const NOW = 1_760_000_000_000;
const DAY = 86_400_000;

const scheme: MarkScheme = {
  command: "Evaluate",
  totalMarks: 10,
  points: [
    { label: "Define it", detail: "A precise definition.", marks: 2 },
    { label: "Explain the effect", detail: "The mechanism.", marks: 3 },
    { label: "Apply it", detail: "A worked example.", marks: 3 },
    { label: "Link them", detail: "A chain across the three above.", marks: 2, isLink: true },
  ],
};

function answerWith(over: Partial<Answer> = {}): Answer {
  return {
    questionId: "q",
    chapterId: "em-1",
    specRef: "1",
    skillIds: ["s"],
    template: "algebra-quadratic-roots",
    response: ["1"],
    correct: true,
    score: 1,
    marks: 1,
    awardedMarks: 1,
    difficulty: 0,
    durationMs: 1000,
    timestamp: NOW,
    ...over,
  };
}

describe("extended-answer marking", () => {
  it("scores nothing when nothing is claimed", () => {
    const r = markExtended(scheme, new Set());
    assert.equal(r.achievedMarks, 0);
    assert.equal(r.achievedFraction, 0);
    assert.equal(r.missed.length, 4);
  });

  it("scores the sum of the claimed points", () => {
    const r = markExtended(scheme, new Set([0, 1]));
    assert.equal(r.achievedMarks, 5);
    assert.equal(r.achievedFraction, 0.5);
  });

  it("rewards a link point beyond its face value", () => {
    const without = markExtended(scheme, new Set([0, 1, 2]));
    const withLink = markExtended(scheme, new Set([0, 1, 2, 3]));
    // All three facts alone are 8 of 10. Adding the link is worth 2 plus the
    // half-mark bonus, capped at the full 10.
    assert.equal(without.achievedMarks, 8);
    assert.equal(withLink.achievedMarks, 10);
  });

  it("never exceeds the scheme total even when everything is claimed", () => {
    const r = markExtended(scheme, new Set([0, 1, 2, 3]));
    assert.ok(r.achievedMarks <= scheme.totalMarks);
  });

  it("places a score in a levels band", () => {
    const levels = [
      { level: 4, label: "Top", descriptor: "d", indicativeRange: [0.7, 1] as [number, number] },
      { level: 3, label: "Good", descriptor: "d", indicativeRange: [0.4, 0.69] as [number, number] },
      { level: 2, label: "Middle", descriptor: "d", indicativeRange: [0.2, 0.39] as [number, number] },
      { level: 1, label: "Low", descriptor: "d", indicativeRange: [0, 0.19] as [number, number] },
    ];
    // Point 0 alone is 2 of 10, which sits in the 0.2-0.39 band. Points 0 and 1
    // are 5 of 10, in the 0.4-0.69 band. Nothing claimed is the bottom band.
    assert.equal(markExtended(scheme, new Set([0, 1, 2, 3]), levels).level?.level, 4);
    assert.equal(markExtended(scheme, new Set([0, 1]), levels).level?.level, 3);
    assert.equal(markExtended(scheme, new Set([0]), levels).level?.level, 2);
    assert.equal(markExtended(scheme, new Set(), levels).level?.level, 1);
  });

  it("warns when no link point was claimed but one exists", () => {
    const r = markExtended(scheme, new Set([0, 1, 2]));
    assert.match(r.feedback, /cannot reach the top band/i);
  });

  it("tells the learner self-marking runs generous", () => {
    assert.match(markExtended(scheme, new Set([0, 1])).feedback, /self-assessed/i);
  });

  it("flags an extended answer as self-assessed", () => {
    const q: GeneratedQuestion = {
      id: "q",
      template: "extended-test",
      chapterId: "em-1",
      specRef: "1",
      skillIds: ["s"],
      difficulty: 0,
      tier: 3,
      prompt: "Evaluate the statement.",
      format: { kind: "extended", scheme },
      answer: "Define it; Explain the effect",
      marks: 10,
      solution: [{ label: "Scheme", work: "Self-marked." }],
      takeaway: "Self-marking runs generous.",
      assessesMastery: true,
    };
    const result = markQuestion(q, ["my answer", "0", "1"]);
    assert.equal(result.selfAssessed, true);
    assert.equal(result.awardedMarks, 5);
  });
});

describe("self-assessed scores are discounted, not ignored", () => {
  const cfg = createInitialState(NOW).config;

  it("moves ability less than a machine-marked answer of the same score", () => {
    const verified = applyAnswer({}, answerWith({ score: 0.2 }), cfg, NOW)["em-1"]!.theta;
    const self = applyAnswer({}, answerWith({ score: 0.2, selfAssessed: true }), cfg, NOW)["em-1"]!.theta;
    /*
      A score of 0.2 pushes theta downwards, so the discounted answer lands
      closer to zero, i.e. a larger value. The magnitude is what matters, since
      a high score would move in the opposite direction.
    */
    assert.ok(
      Math.abs(self) < Math.abs(verified),
      `self ${self} should move less than verified ${verified}`,
    );
  });

  it("still counts, rather than being discarded", () => {
    const skills = applyAnswer({}, answerWith({ selfAssessed: true }), cfg, NOW);
    assert.ok(skills["em-1"], "a self-assessed answer should still be recorded");
  });

  it("has a configurable weight", () => {
    const heavy = applyAnswer(
      {},
      answerWith({ score: 1, selfAssessed: true }),
      { ...cfg, selfAssessedWeight: 1 },
      NOW,
    )["em-1"]!.theta;
    const light = applyAnswer(
      {},
      answerWith({ score: 1, selfAssessed: true }),
      { ...cfg, selfAssessedWeight: 0.1 },
      NOW,
    )["em-1"]!.theta;
    assert.ok(heavy > light, `weight 1 gave ${heavy}, weight 0.1 gave ${light}`);
  });
});

describe("difficulty calibration", () => {
  it("does nothing without observations", () => {
    const c = templateCalibration(undefined, 0.4);
    assert.equal(c.effective, 0.4);
    assert.equal(c.adjustment, 0);
    assert.equal(c.trusted, false);
  });

  it("lowers the difficulty of a template learners beat every time", () => {
    // Served around -0.5, where a logistic model expects roughly 38% correct,
    // but scoring 100%. The item is easier than it is labelled, so the declared
    // difficulty should come down.
    const stat = {
      attempts: 30,
      correct: 30,
      scoreSum: 30,
      difficultySum: -15,
      lastSeen: NOW,
    };
    const c = templateCalibration(stat, 0.4);
    assert.ok(c.adjustment < 0, `expected a downward nudge, got ${c.adjustment}`);
    assert.ok(c.effective < 0.4);
    assert.equal(c.trusted, true);
  });

  it("raises the difficulty of a template learners fail more than expected", () => {
    // Served around +1.0, where roughly 73% is expected, but scoring 0%. The
    // item is harder than it is labelled.
    const stat = {
      attempts: 30,
      correct: 0,
      scoreSum: 0,
      difficultySum: 30,
      lastSeen: NOW,
    };
    const c = templateCalibration(stat, 0.4);
    assert.ok(c.adjustment > 0, `expected an upward nudge, got ${c.adjustment}`);
    assert.ok(c.effective > 0.4);
  });

  it("barely moves on a single observation", () => {
    const one = { attempts: 1, correct: 1, scoreSum: 1, difficultySum: 0, lastSeen: NOW };
    const many = { attempts: 40, correct: 40, scoreSum: 40, difficultySum: 0, lastSeen: NOW };
    const a = templateCalibration(one, 0.4).adjustment;
    const b = templateCalibration(many, 0.4).adjustment;
    assert.ok(Math.abs(a) < Math.abs(b) * 0.2, `one attempt gave ${a}, forty gave ${b}`);
  });

  it("never moves a template further than the cap", () => {
    const absurd = { attempts: 500, correct: 0, scoreSum: 0, difficultySum: -900, lastSeen: NOW };
    assert.ok(Math.abs(templateCalibration(absurd, 0).adjustment) <= 0.8 + 1e-9);
  });

  it("accumulates outcomes without mutating the input", () => {
    const before = {};
    const after = recordTemplateStat(before, "t", { score: 1, difficulty: 0.5, at: NOW });
    assert.deepEqual(before, {}, "the input stats must not be mutated");
    assert.equal(after["t"]!.attempts, 1);
  });

  it("reports the templates whose declared difficulty looks most wrong", () => {
    const stats = recordTemplateStat(
      recordTemplateStat({}, "easy-one", { score: 0, difficulty: 2, at: NOW }),
      "easy-one",
      { score: 0, difficulty: 2, at: NOW },
    );
    const report = calibrationReport(stats, () => 0.4);
    assert.equal(report[0]?.template, "easy-one");
    assert.ok((report[0]?.adjustment ?? 0) > 0);
  });
});

describe("study plan", () => {
  function stateWith(extra: Partial<PersistedState> = {}): PersistedState {
    return { ...createInitialState(NOW), ...extra };
  }

  function insightsFor(state: PersistedState) {
    const enabled = SUBJECT_ORDER.flatMap((s) => state.enabled[s] ?? []);
    return computeInsights({
      chapters: SUBJECT_ORDER.flatMap((s) => getChapters(s)),
      skills: state.skills,
      enabledIds: new Set(enabled),
      config: state.config,
      now: NOW,
    });
  }

  it("counts down to the soonest exam", () => {
    const state = stateWith({ examDates: { "edexcel-mathematics": NOW + 10 * DAY } });
    const plan = buildStudyPlan(state, insightsFor(state), NOW);
    assert.equal(plan.daysToExam, 10);
    assert.equal(plan.nextExam?.subject, "edexcel-mathematics");
  });

  it("reports no countdown when no date is set", () => {
    const state = stateWith();
    const plan = buildStudyPlan(state, insightsFor(state), NOW);
    assert.equal(plan.daysToExam, null);
    assert.equal(plan.nextExam, null);
  });

  it("does not crash on an exam date in the past", () => {
    const state = stateWith({ examDates: { "edexcel-mathematics": NOW - 5 * DAY } });
    const plan = buildStudyPlan(state, insightsFor(state), NOW);
    assert.equal(plan.daysToExam, -5);
  });

  it("ranks a chapter with an exam this week above an identical one in months", () => {
    const state = stateWith({
      examDates: {
        "edexcel-mathematics": NOW + 3 * DAY,
        "aqa-economics": NOW + 200 * DAY,
      },
    });
    const plan = buildStudyPlan(state, insightsFor(state), NOW);
    const soon = plan.tasks.filter((t) => t.subject === "edexcel-mathematics");
    const later = plan.tasks.filter((t) => t.subject === "aqa-economics");
    const soonMax = Math.max(...soon.map((t) => t.priority));
    const laterMax = Math.max(...later.map((t) => t.priority));
    assert.ok(soonMax > laterMax, `soon ${soonMax} should outrank later ${laterMax}`);
  });

  it("always returns at least one task when there is work", () => {
    const state = stateWith();
    const plan = buildStudyPlan(state, insightsFor(state), NOW);
    assert.ok(plan.tasks.length > 0);
    assert.equal(dailySlice(plan, 1).length, 1, "a tiny budget must not yield an empty plan");
  });

  it("respects the time budget", () => {
    const state = stateWith();
    const plan = buildStudyPlan(state, insightsFor(state), NOW);
    const slice = dailySlice(plan, 30);
    const used = slice.reduce((s, t) => s + t.minutes, 0);
    assert.ok(used <= 30 || slice.length === 1, `used ${used} minutes of a 30 minute budget`);
  });

  it("gives every task a reason, so the plan is not a black box", () => {
    const state = stateWith({ examDates: { "edexcel-mathematics": NOW + 2 * DAY } });
    const plan = buildStudyPlan(state, insightsFor(state), NOW);
    for (const task of plan.tasks) {
      assert.ok(task.reason.length > 0, `${task.chapterId} has no reason`);
      assert.ok(task.minutes > 0);
    }
  });
});

describe("wrong-answer notebook", () => {
  it("is empty when everything was right", () => {
    const state = createInitialState(NOW);
    state.answers = [answerWith()];
    assert.equal(buildNotebook(state).length, 0);
  });

  it("lists answers with marks outstanding", () => {
    const state = createInitialState(NOW);
    state.answers = [
      answerWith({ questionId: "a", awardedMarks: 0, marks: 1 }),
      answerWith({ questionId: "b", awardedMarks: 1, marks: 1 }),
    ];
    const notebook = buildNotebook(state);
    assert.equal(notebook.length, 1);
    assert.equal(notebook[0]?.questionId, "a");
  });

  it("counts repeated misses on the same question", () => {
    const state = createInitialState(NOW);
    state.answers = [
      answerWith({ questionId: "a", awardedMarks: 0 }),
      answerWith({ questionId: "a", awardedMarks: 0 }),
      answerWith({ questionId: "a", awardedMarks: 0 }),
    ];
    assert.equal(buildNotebook(state)[0]?.timesWrong, 3);
  });

  it("puts the most recent failure first", () => {
    const state = createInitialState(NOW);
    state.answers = [
      answerWith({ questionId: "old", awardedMarks: 0, timestamp: NOW - 5000 }),
      answerWith({ questionId: "new", awardedMarks: 0, timestamp: NOW }),
    ];
    assert.equal(buildNotebook(state)[0]?.questionId, "new");
  });

  it("marks self-assessed entries so the learner knows", () => {
    const state = createInitialState(NOW);
    state.answers = [answerWith({ awardedMarks: 2, marks: 10, selfAssessed: true })];
    assert.equal(buildNotebook(state)[0]?.selfAssessed, true);
  });
});

describe("exam dates and backup survive a round trip", () => {
  it("keeps exam dates through export and import", () => {
    const state = createInitialState(NOW);
    state.examDates = { "edexcel-mathematics": NOW + 30 * DAY };
    state.lastExportAt = NOW - 1000;
    const restored = importState(exportState(state), NOW);
    assert.ok(restored.ok);
    assert.equal(restored.state?.examDates["edexcel-mathematics"], state.examDates["edexcel-mathematics"]);
    assert.equal(restored.state?.lastExportAt, NOW - 1000);
  });

  it("discards a nonsense exam date rather than trusting it", () => {
    const state = migrateState({ version: 1, examDates: { "edexcel-mathematics": "soon" } }, NOW);
    assert.equal(state.examDates["edexcel-mathematics"], undefined);
  });

  it("ignores an exam date for a subject that does not exist", () => {
    const state = migrateState(
      { version: 1, examDates: { "gcse-art": NOW } },
      NOW,
    );
    assert.deepEqual(state.examDates, {});
  });

  it("keeps template statistics through a round trip", () => {
    const state = createInitialState(NOW);
    // An exam date stands in for the progress a real backup would carry, since
    // a blob with nothing at all is deliberately refused as not worth restoring.
    state.examDates = { "edexcel-mathematics": NOW + 10 * DAY };
    state.templateStats = recordTemplateStat({}, "t", { score: 0.5, difficulty: 0.2, at: NOW });
    const restored = importState(exportState(state), NOW);
    assert.ok(restored.ok, `import failed: ${restored.error}`);
    assert.equal(restored.state?.templateStats["t"]?.attempts, 1);
    assert.equal(restored.state?.templateStats["t"]?.scoreSum, 0.5);
  });

  it("backfills the new fields on an old blob", () => {
    const state = migrateState({ version: 1, answers: [] }, NOW);
    assert.deepEqual(state.examDates, {});
    assert.equal(state.lastExportAt, null);
    assert.deepEqual(state.templateStats, {});
  });
});

describe("every subject's chapters are reachable from the plan", () => {
  it("has a spec ref and title for each subject", () => {
    for (const subject of SUBJECT_ORDER) {
      assert.ok(SUBJECTS[subject].specUrl.startsWith("https://"), `${subject} spec URL`);
      assert.ok(getChapters(subject).length > 0, `${subject} has no chapters`);
    }
  });
});

// Referenced so the import is not dropped; the helper is shared with the
// generator tests.
void getGeneratorsForSpec;
void getChapter;

