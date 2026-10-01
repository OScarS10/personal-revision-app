import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planSession, nextDifficulty, nextQuestion, type SessionMode } from "@/lib/session";
import "@/lib/generators/all";
import {
  nextIntervalDays,
  consecutiveStreak,
  buildReviewQueue,
  summariseReview,
  dueChapterIds,
  DAY_MS,
  MIN_DAYS,
} from "@/lib/spaced";
import { createInitialState, localDateKey } from "@/lib/store";
import { applyAnswer, createSkillState } from "@/lib/model";
import { getChapters } from "@/lib/specs";
import { computeInsights } from "@/lib/analytics";
import type { Answer, Chapter, SkillState } from "@/lib/types";

// Generators register themselves as an import side effect. Without these the
// registry is empty and every chapter legitimately produces nothing.

/*
  Session planning and the spaced scheduler.

  Both decide what the learner is shown next, so a bug here is invisible: the
  app just quietly gets worse at choosing questions.
*/

const CHAPTERS = getChapters("edexcel-mathematics");
const NOW = 1_700_000_000_000;

function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function plan(overrides: Partial<Parameters<typeof planSession>[0]> = {}) {
  const state = createInitialState(NOW);
  const chapters = CHAPTERS.slice(0, 12);
  return planSession({
    chapters,
    enabledIds: chapters.map((c) => c.id),
    insights: [],
    state,
    mode: "practice" as SessionMode,
    rng: rng(7),
    now: NOW,
    ...overrides,
  });
}

describe("planSession", () => {
  it("returns a queue of the requested length", () => {
    const p = plan({ length: 8 });
    assert.equal(p.queue.length, 8);
  });

  it("only ever queues enabled chapters", () => {
    const chapters = CHAPTERS.slice(0, 10);
    const allowed = [chapters[0].id, chapters[3].id];
    const p = plan({ chapters, enabledIds: allowed, length: 10 });
    for (const id of p.queue) assert.ok(allowed.includes(id), `${id} was not enabled`);
  });

  it("is deterministic for a given seed", () => {
    const a = plan({ length: 6, rng: rng(99) });
    const b = plan({ length: 6, rng: rng(99) });
    assert.deepEqual(a.queue, b.queue);
  });

  it("produces different orders for different seeds", () => {
    const a = plan({ length: 12, rng: rng(1) });
    const b = plan({ length: 12, rng: rng(2) });
    assert.notDeepEqual(a.queue, b.queue);
  });

  it("gives every enabled chapter a turn when the session is long enough", () => {
    const chapters = CHAPTERS.slice(0, 5);
    const p = plan({ chapters, enabledIds: chapters.map((c) => c.id), length: 5 });
    assert.deepEqual([...new Set(p.queue)].sort(), chapters.map((c) => c.id).sort());
  });

  it("returns an empty queue when nothing is enabled", () => {
    const p = plan({ enabledIds: [], length: 10 });
    assert.equal(p.queue.length, 0);
  });

  it("never asks the same chapter twice in a row when others are available", () => {
    const chapters = CHAPTERS.slice(0, 4);
    const p = plan({ chapters, enabledIds: chapters.map((c) => c.id), length: 16 });
    for (let i = 1; i < p.queue.length; i++) {
      assert.notEqual(p.queue[i], p.queue[i - 1], `repeat at position ${i}`);
    }
  });
});

describe("nextDifficulty", () => {
  it("stays inside the band the model allows", () => {
    for (const theta of [-4, -1, 0, 1, 4]) {
      for (let i = 0; i < 20; i++) {
        const d = nextDifficulty(theta, [], 0.12, rng(i + 1));
        assert.ok(d >= -3 && d <= 3.5, `difficulty ${d} for theta ${theta}`);
      }
    }
  });

  it("rises with ability", () => {
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      samples.push(nextDifficulty(2, [], 0.12, rng(i + 1)));
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    assert.ok(mean > 0.5, `a strong learner should get harder items, mean was ${mean}`);
  });

  it("reacts to recent answers within the session", () => {
    const wrong: Answer[] = Array.from({ length: 5 }, (_, i) => ({
      questionId: `q${i}`,
      chapterId: "em-1",
      specRef: "1",
      skillIds: ["a"],
      template: "t",
      response: ["0"],
      correct: false,
      score: 0,
      marks: 1,
      awardedMarks: 0,
      difficulty: 0.5,
      durationMs: 1000,
      timestamp: NOW,
    }));

    const easier: number[] = [];
    for (let i = 0; i < 40; i++) easier.push(nextDifficulty(1, wrong, 0.12, rng(i + 1)));
    const easierMean = easier.reduce((a, b) => a + b, 0) / easier.length;

    const neutral: number[] = [];
    for (let i = 0; i < 40; i++) neutral.push(nextDifficulty(1, [], 0.12, rng(i + 1)));
    const neutralMean = neutral.reduce((a, b) => a + b, 0) / neutral.length;

    assert.ok(easierMean < neutralMean, "five wrong answers should ease off");
  });
});

describe("nextQuestion", () => {
  const chapter = CHAPTERS[0];

  it("produces nothing for a chapter with no content", () => {
    // A chapter with no bespoke generator and no authored knowledge must return
    // null rather than a fallback question about where it sits in the
    // specification. An honest gap is better than an item that flatters.
    const unknown: Chapter = { ...chapter, id: "nope", knowledge: undefined };
    assert.equal(nextQuestion(unknown, 0, "seed", []), null);
  });

  it("serves materially harder questions as the target rises", () => {
    /*
      The contract is about the response curve, not about consecutive draws.
      Each item carries a seeded jitter of up to 0.12, and the selector may pick
      a different template, so two adjacent targets can legitimately invert. What
      must hold is that a learner aiming far higher gets a materially harder
      question on average, so this compares means at the extremes.
    */
    const meanFor = (target: number): number => {
      const seen: number[] = [];
      for (let i = 0; i < 25; i++) {
        const q = nextQuestion(chapter, target, `t${target}::${i}`, []);
        if (q) seen.push(q.difficulty);
      }
      assert.ok(seen.length > 0, `no questions at target ${target}`);
      return seen.reduce((a, b) => a + b, 0) / seen.length;
    };

    const easy = meanFor(-2);
    const hard = meanFor(2);
    /*
      The threshold is deliberately not 1. A chapter's templates only span the
      difficulty range its authors wrote, so serving the very top of the band
      means serving the hardest template that exists rather than inventing
      something harder. What must hold is a clear, monotonic increase.
    */
    assert.ok(
      hard - easy > 0.5,
      `aiming higher should serve clearly harder questions; means were ${easy.toFixed(2)} and ${hard.toFixed(2)}`,
    );

    /*
      Monotonic up to the point where the chapter runs out of harder templates.
      Past the top of the authored range the selector can only reselect what
      exists, so the ceiling is flat rather than increasing. That is a real limit
      of the content, not a selector fault, so the test allows it.
    */
    const targets = [-2, -1, 0, 1, 2];
    const means = targets.map((t) => meanFor(t));
    for (let i = 1; i < means.length; i++) {
      const previousMean = means[i - 1]!;
      const mean = means[i]!;
      const plateaued = Math.abs(mean - previousMean) < 0.05;
      assert.ok(
        mean > previousMean || plateaued,
        `difficulty fell from target ${targets[i - 1]} to ${targets[i]}: ${previousMean.toFixed(2)} then ${mean.toFixed(2)}`,
      );
    }
  });

  it("is deterministic for a seed", () => {
    const a = nextQuestion(chapter, 0, "same-seed", []);
    const b = nextQuestion(chapter, 0, "same-seed", []);
    assert.equal(a?.id, b?.id);
    assert.equal(a?.answer, b?.answer);
  });

  it("respects the recent-template list", () => {
    const first = nextQuestion(chapter, 0, "s", []);
    assert.ok(first);
    const second = nextQuestion(chapter, 0, "s", [first!.template]);
    if (second) assert.notEqual(second.template, first!.template);
  });


});

describe("nextIntervalDays", () => {
  it("schedules a relearn within hours after a wrong answer", () => {
    assert.equal(nextIntervalDays(0, false), MIN_DAYS);
    assert.equal(nextIntervalDays(5, false), MIN_DAYS);
  });

  it("starts at one day on the first correct answer", () => {
    // Regression: the ladder used to be indexed by streak directly, which made
    // the 1-day rung unreachable and jumped straight to 2 days.
    assert.equal(nextIntervalDays(1, true), 1);
  });

  it("lengthens the interval with the streak", () => {
    assert.ok(nextIntervalDays(2, true) > nextIntervalDays(1, true));
    assert.ok(nextIntervalDays(4, true) > nextIntervalDays(3, true));
  });

  it("caps at the top of the ladder", () => {
    assert.equal(nextIntervalDays(99, true), nextIntervalDays(6, true));
  });
});

describe("consecutiveStreak", () => {
  it("counts trailing successes", () => {
    assert.equal(consecutiveStreak([1, 1, 1]), 3);
    assert.equal(consecutiveStreak([1, 1, 0, 1, 1]), 2);
    assert.equal(consecutiveStreak([0, 1, 1]), 2);
  });

  it("is zero when the last attempt was wrong", () => {
    assert.equal(consecutiveStreak([1, 1, 0]), 0);
    assert.equal(consecutiveStreak([]), 0);
  });
});

describe("buildReviewQueue", () => {
  function stateWith(chapters: Chapter[], results: boolean[]) {
    let skills: Record<string, SkillState> = {};
    chapters.forEach((chapter, i) => {
      for (let n = 0; n < (results[i] ? 3 : 1); n++) {
        const a: Answer = {
          questionId: `${chapter.id}-${n}`,
          chapterId: chapter.id,
          specRef: chapter.specRef,
          skillIds: chapter.skills,
          template: "t",
          response: ["1"],
          correct: results[i],
          score: results[i] ? 1 : 0,
          marks: 1,
          awardedMarks: results[i] ? 1 : 0,
          difficulty: 0,
          durationMs: 1000,
          timestamp: NOW,
        };
        skills = applyAnswer(skills, a, createInitialState(NOW).config, NOW);
      }
    });
    return { ...createInitialState(NOW), skills };
  }

  it("ignores chapters that have never been attempted", () => {
    // Fresh chapters are not part of the review queue: there is nothing to
    // review yet, and practice covers them instead.
    const chapters = CHAPTERS.slice(0, 3);
    const rows = buildReviewQueue(createInitialState(NOW), chapters.map((c) => c.id), NOW);
    assert.equal(rows.length, 0);
  });

  it("does not make a freshly-correct chapter due yet", () => {
    // Three correct answers should push the next attempt several days out, so
    // a chapter the learner has just got right must not jump the queue.
    const chapters = CHAPTERS.slice(0, 3);
    const state = stateWith(chapters, [true, true, true]);
    const rows = buildReviewQueue(state, chapters.map((c) => c.id), NOW);
    assert.equal(rows.length, 3, "every tracked chapter still appears in the queue");
    for (const row of rows) {
      assert.notEqual(row.state, "due", `${row.chapterId} should not be due yet`);
      assert.ok(row.dueInDays > 0, `${row.chapterId} due in ${row.dueInDays} days`);
    }
  });

  it("makes a chapter due once its interval has elapsed", () => {
    const chapters = CHAPTERS.slice(0, 1);
    const state = stateWith(chapters, [true]);
    // One correct answer schedules the next attempt a day later.
    const later = buildReviewQueue(state, [chapters[0].id], NOW + 5 * DAY_MS);
    assert.equal(later[0]?.state, "due");
  });

  it("brings a wrong answer back within hours rather than days", () => {
    const chapters = CHAPTERS.slice(0, 1);
    const state = stateWith(chapters, [false]);
    // A wrong answer schedules a short relearn, not the multi-day ladder rung,
    // so it is pending immediately but not yet due.
    assert.equal(buildReviewQueue(state, [chapters[0].id], NOW)[0]?.state, "soon");
    assert.equal(
      buildReviewQueue(state, [chapters[0].id], NOW + MIN_DAYS * DAY_MS)[0]?.state,
      "due",
    );
  });

  it("returns rows for every tracked chapter", () => {
    const chapters = CHAPTERS.slice(0, 4);
    const state = stateWith(chapters, [true, false, true, false]);
    const rows = buildReviewQueue(state, chapters.map((c) => c.id), NOW);
    assert.equal(rows.length, 4);
  });

  it("only ever includes enabled chapters", () => {
    const chapters = CHAPTERS.slice(0, 4);
    const state = stateWith(chapters, [false, false, false, false]);
    const allowed = [chapters[0].id, chapters[2].id];
    const rows = buildReviewQueue(state, allowed, NOW);
    assert.equal(rows.length, 2);
    for (const row of rows) assert.ok(allowed.includes(row.chapterId), `${row.chapterId} not enabled`);
  });
});

describe("summariseReview", () => {
  it("counts an empty queue as nothing tracked", () => {
    const s = summariseReview([]);
    assert.equal(s.ready, 0);
    assert.equal(s.due, 0);
    assert.equal(s.nextDueAt, null);
  });

  it("separates due from not-yet-due", () => {
    const s = summariseReview([
      { chapterId: "a", streak: 0, urgency: 1, dueInDays: -1, dueAt: NOW - DAY_MS, lastScore: 0, lastSeen: NOW, attempts: 1, state: "due" },
      { chapterId: "b", streak: 3, urgency: 0, dueInDays: 5, dueAt: NOW + 5 * DAY_MS, lastScore: 1, lastSeen: NOW, attempts: 3, state: "later" },
    ]);
    assert.equal(s.due, 1);
    assert.equal(s.ready, 1);
    assert.equal(s.later, 1);
  });
});

describe("dueChapterIds", () => {
  it("returns nothing for an empty state", () => {
    const state = createInitialState(NOW);
    assert.deepEqual(dueChapterIds(state, []), []);
  });
});

describe("computeInsights", () => {
  it("produces one insight per chapter, flagged as enabled or not", () => {
    const chapters = CHAPTERS.slice(0, 5);
    const enabledIds = chapters.slice(0, 2).map((c) => c.id);
    const insights = computeInsights({
      chapters,
      skills: {},
      enabledIds: new Set(enabledIds),
      config: createInitialState(NOW).config,
      now: NOW,
    });
    assert.equal(insights.length, chapters.length);
    assert.equal(insights.filter((i) => i.enabled).length, 2);
  });

  it("reports unattempted chapters as unrated rather than weak", () => {
    const chapters = CHAPTERS.slice(0, 3);
    const insights = computeInsights({
      chapters,
      skills: {},
      enabledIds: new Set(chapters.map((c) => c.id)),
      config: createInitialState(NOW).config,
      now: NOW,
    });
    for (const i of insights) {
      assert.equal(i.attempts, 0);
      assert.ok(i.accuracy === null);
    }
  });

  it("keeps every derived figure inside 0..1", () => {
    const chapters = CHAPTERS.slice(0, 4);
    let skills: Record<string, SkillState> = {};
    for (let n = 0; n < 5; n++) {
      const a: Answer = {
        questionId: `q${n}`,
        chapterId: chapters[0].id,
        specRef: chapters[0].specRef,
        skillIds: chapters[0].skills,
        template: "t",
        response: ["1"],
        correct: n % 2 === 0,
        score: n % 2 === 0 ? 1 : 0,
        marks: 1,
        awardedMarks: n % 2 === 0 ? 1 : 0,
        difficulty: 0.3,
        durationMs: 1000,
        timestamp: NOW,
      };
      skills = applyAnswer(skills, a, createInitialState(NOW).config, NOW);
    }
    const insights = computeInsights({
      chapters,
      skills,
      enabledIds: new Set(chapters.map((c) => c.id)),
      config: createInitialState(NOW).config,
      now: NOW,
    });
    for (const i of insights) {
      for (const key of ["weakness", "mastery", "confidence", "learned", "retention"] as const) {
        const v = i[key];
        assert.ok(v >= 0 && v <= 1, `${i.chapterId}.${key} was ${v}`);
      }
    }
  });
});

describe("createSkillState is not shared between chapters", () => {
  it("returns independent objects", () => {
    const a = createSkillState();
    const b = createSkillState();
    a.attempts = 5;
    assert.equal(b.attempts, 0);
  });
});

describe("localDateKey integration", () => {
  it("keys the daily tally by the local day", () => {
    const key = localDateKey(NOW);
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });
});

