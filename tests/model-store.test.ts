import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAnswer,
  createSkillState,
  masteryEstimate,
  probabilityCorrect,
  confidenceOf,
  retentionOf,
  thetaToPercent,
} from "@/lib/model";
import { createInitialState, migrateState, exportState, importState, localDateKey } from "@/lib/store";
import { markQuestion, toAnswer } from "@/lib/marking";
import type { Answer, GeneratedQuestion, SkillState } from "@/lib/types";
import { getChapters, getChapter } from "@/lib/specs";

/*
  The model and the store.

  These matter because a bad update is silent: the learner just sees the app
  getting better or worse at picking questions, with nothing to complain about.
*/

const CONFIG = createInitialState(0).config;

function answer(overrides: Partial<Answer> = {}): Answer {
  return {
    questionId: "q1",
    chapterId: "em-1",
    specRef: "1",
    skillIds: ["algebra"],
    template: "quadratic-roots",
    response: ["2"],
    correct: true,
    score: 1,
    marks: 1,
    awardedMarks: 1,
    difficulty: 0.5,
    durationMs: 30_000,
    timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

describe("createSkillState", () => {
  it("starts at zero ability and zero knowledge", () => {
    const s = createSkillState();
    assert.equal(s.theta, 0);
    assert.equal(s.attempts, 0);
    assert.equal(s.correct, 0);
    assert.equal(s.lastSeen, null);
  });
});

describe("probabilityCorrect", () => {
  it("is a sigmoid centred on ability matching difficulty", () => {
    const p = probabilityCorrect(0, 0);
    assert.ok(Math.abs(p - 0.5) < 1e-9);
  });

  it("rises with ability and falls with difficulty", () => {
    assert.ok(probabilityCorrect(1, 0) > probabilityCorrect(0, 0));
    assert.ok(probabilityCorrect(0, -1) > probabilityCorrect(0, 1));
  });

  it("stays inside (0, 1) across the whole range difficulty can actually take", () => {
    // Difficulty and theta are both clamped to +/-4 by the model, so the
    // logistic never saturates to exactly 0 or 1 on real values.
    for (const theta of [-4, -1, 0, 1, 4]) {
      for (const d of [-4, -1, 0, 1, 4]) {
        const p = probabilityCorrect(theta, d);
        assert.ok(p > 0 && p < 1, `theta=${theta} d=${d} p=${p}`);
      }
    }
  });
});

describe("applyAnswer", () => {
  it("counts the attempt and records a correct one", () => {
    const s = applyAnswer({}, answer(), CONFIG, 1_700_000_000_000)["em-1"];
    assert.equal(s.attempts, 1);
    assert.equal(s.correct, 1);
    assert.ok(s.theta > 0, "a correct answer should raise ability");
  });

  it("lowers ability on a wrong answer", () => {
    const s = applyAnswer({}, answer({ correct: false, score: 0 }), CONFIG, 1_700_000_000_000)["em-1"];
    assert.ok(s.theta < 0, "a wrong answer should lower ability");
  });

  it("learns faster from a correct answer on a hard question", () => {
    // Standard IRT: a correct response to a hard item is more informative than
    // a correct response to an easy one, so it should move theta further.
    const hard = applyAnswer({}, answer({ difficulty: 2 }), CONFIG, 0)["em-1"];
    const easy = applyAnswer({}, answer({ difficulty: -2 }), CONFIG, 0)["em-1"];
    assert.ok(hard.theta > easy.theta);
  });

  it("gathers more information over time", () => {
    let skills: Record<string, SkillState> = {};
    for (let i = 0; i < 12; i++) {
      skills = applyAnswer(skills, answer({ questionId: `q${i}` }), CONFIG, 0);
    }
    const one = applyAnswer({}, answer({ questionId: "solo" }), CONFIG, 0)["em-1"];
    // Confidence is deliberately slow to build; a single question should leave
    // the learner unsure, twelve should not.
    assert.ok(confidenceOf(one) < 0.35);
    assert.ok(confidenceOf(skills["em-1"]) > 0.6);
  });

  it("clamps theta to the configured range", () => {
    let skills: Record<string, SkillState> = {};
    for (let i = 0; i < 200; i++) {
      skills = applyAnswer(skills, answer({ questionId: `q${i}` }), CONFIG, 0);
    }
    assert.ok(Math.abs(skills["em-1"].theta) <= 4);
  });
});

describe("masteryEstimate", () => {
  it("sits at the uninformative prior with no evidence", () => {
    // With no attempts the shrunk posterior should express no opinion, which
    // means 0.5 rather than 0 - a fresh chapter is unknown, not unmastered.
    assert.ok(Math.abs(masteryEstimate(createSkillState()) - 0.5) < 1e-9);
  });

  it("approaches one when repeatedly correct", () => {
    let skills: Record<string, SkillState> = {};
    for (let i = 0; i < 25; i++) {
      skills = applyAnswer(skills, answer({ questionId: `q${i}` }), CONFIG, 0);
    }
    assert.ok(masteryEstimate(skills["em-1"]) > 0.9);
  });

  it("stays within 0..1", () => {
    let skills: Record<string, SkillState> = {};
    for (let i = 0; i < 25; i++) {
      skills = applyAnswer(
        skills,
        answer({ questionId: `q${i}`, correct: false, score: 0 }),
        CONFIG,
        0,
      );
    }
    const m = masteryEstimate(skills["em-1"]);
    assert.ok(m >= 0 && m <= 1, `mastery was ${m}`);
  });
});

describe("confidenceOf", () => {
  it("grows with the number of attempts", () => {
    const one = applyAnswer({}, answer(), CONFIG, 0)["em-1"];
    let many: Record<string, SkillState> = {};
    for (let i = 0; i < 12; i++) many = applyAnswer(many, answer({ questionId: `q${i}` }), CONFIG, 0);
    assert.ok(confidenceOf(many["em-1"]) > confidenceOf(one));
  });
});

describe("retentionOf", () => {
  it("decays with elapsed time", () => {
    const s = applyAnswer({}, answer(), CONFIG, 0)["em-1"];
    const fresh = retentionOf(s, 0, CONFIG);
    const stale = retentionOf(s, 90 * 86_400_000, CONFIG);
    assert.ok(stale < fresh);
  });
});

describe("thetaToPercent", () => {
  it("is a 0..100 figure", () => {
    const p = thetaToPercent(0);
    assert.ok(p >= 0 && p <= 100);
  });
});

describe("localDateKey", () => {
  it("is stable within a day and changes across days", () => {
    const day1 = localDateKey(new Date(2024, 0, 1, 9, 0, 0).getTime());
    const day1Later = localDateKey(new Date(2024, 0, 1, 21, 0, 0).getTime());
    const day2 = localDateKey(new Date(2024, 0, 2, 9, 0, 0).getTime());
    assert.equal(day1, day1Later);
    assert.notEqual(day1, day2);
  });
});

describe("applyAnswer refuses items that do not assess the chapter", () => {
  /*
    The specification-recall questions were the only items most chapters had, so
    their results were fed into this function and moved theta. That inflated
    mastery for exactly the knowledge-heavy chapters that were being measured
    least well. The flag exists to stop any non-assessing item doing that.
  */
  it("leaves ability untouched for a non-assessing answer", () => {
    const skills = applyAnswer({}, answer(), CONFIG, 0);
    const before = skills["em-1"]!.theta;
    assert.ok(before > 0, "a correct answer should move theta when it does assess");

    const after = applyAnswer(
      skills,
      answer({ questionId: "q2", assessesMastery: false }),
      CONFIG,
      0,
    );
    assert.equal(
      after["em-1"]!.theta,
      before,
      "a non-assessing answer must not move ability",
    );
  });

  it("records nothing else either, so confidence is not inflated", () => {
    const skills = applyAnswer(
      {},
      answer({ assessesMastery: false }),
      CONFIG,
      0,
    );
    assert.equal(skills["em-1"], undefined, "no skill state should be created");
  });

  it("treats an absent flag as assessing, so old real answers still count", () => {
    const a = answer({ questionId: "q1" });
    delete a.assessesMastery;
    const skills = applyAnswer({}, a, CONFIG, 0);
    assert.equal(skills["em-1"]!.attempts, 1);
  });
});

describe("migrateState marks old specification-recall answers as non-assessing", () => {
  it("does not let a stored recall answer influence the model", () => {
    // Answers recorded before the flag existed carry no value, so migration
    // infers it. A learner who aced the old recall items has not demonstrated
    // anything about the chapter, and letting those stand would keep inflating
    // mastery for the chapters measured worst.
    const state = migrateState(
      {
        version: 1,
        answers: [
          {
            questionId: "r1",
            chapterId: "em-1",
            specRef: "1",
            template: "recall-odd-one-out",
            response: ["a bullet"],
            correct: true,
            score: 1,
          },
          {
            questionId: "g1",
            chapterId: "em-2",
            specRef: "2",
            template: "algebra-quadratic-roots",
            response: ["1"],
            correct: true,
            score: 1,
          },
        ],
      },
      0,
    );

    const recall = state.answers.find((a) => a.questionId === "r1")!;
    const real = state.answers.find((a) => a.questionId === "g1")!;
    assert.equal(recall.assessesMastery, false);
    assert.equal(real.assessesMastery, true);
  });

  it("respects an explicit flag on a stored answer", () => {
    const state = migrateState(
      {
        version: 1,
        answers: [
          {
            questionId: "x",
            chapterId: "em-1",
            template: "knowledge-define-term",
            correct: true,
            score: 1,
            assessesMastery: false,
          },
        ],
      },
      0,
    );
    assert.equal(state.answers[0]!.assessesMastery, false);
  });
});

describe("createInitialState", () => {
  it("enables the A-level chapters of every subject by default", () => {
    const state = createInitialState(0);
    for (const subject of Object.keys(state.enabled) as Array<keyof typeof state.enabled>) {
      const asLevel = getChapters(subject).filter((c) => c.asLevel).map((c) => c.id);
      assert.deepEqual([...state.enabled[subject]].sort(), [...asLevel].sort());
    }
  });
});

describe("migrateState", () => {
  it("returns a usable state from junk", () => {
    const state = migrateState(null, 0);
    assert.equal(state.version, 1);
    assert.deepEqual(state.answers, []);
  });

  it("drops malformed answers instead of failing", () => {
    const state = migrateState(
      { version: 1, answers: [{ garbage: true }, null, "nope"] },
      0,
    );
    assert.deepEqual(state.answers, []);
  });

  it("keeps well-formed answers", () => {
    const good = answer();
    const state = migrateState({ version: 1, answers: [good] }, 0);
    assert.equal(state.answers.length, 1);
    assert.equal(state.answers[0].questionId, "q1");
  });
});

describe("exportState and importState", () => {
  it("round-trips without losing answers", () => {
    let state = createInitialState(1_700_000_000_000);
    const q: GeneratedQuestion = {
      id: "q1",
      template: "quadratic-roots",
      chapterId: "em-1",
      specRef: "1",
      skillIds: ["algebra"],
      prompt: "Roots?",
      format: { kind: "numeric" },
      answer: "2",
      solution: [{ label: "Method", work: "Because" }],
      difficulty: 0.5,
      marks: 1,
      tier: 2,
      takeaway: "Roots of a quadratic.",
      assessesMastery: true,
    };
    const marked = toAnswer(q, markQuestion(q, "2"), 1000, 1_700_000_000_000);
    state = { ...state, answers: [marked] };

    const result = importState(exportState(state), 1_700_000_000_000);
    assert.ok(result.ok);
    assert.equal(result.state?.answers.length, 1);
    assert.equal(result.state?.answers[0].questionId, "q1");
  });

  it("refuses text that is not JSON", () => {
    const result = importState("not json at all");
    assert.equal(result.ok, false);
    assert.ok(result.error);
  });

  it("refuses JSON of the wrong shape", () => {
    const result = importState(JSON.stringify({ hello: "world" }));
    assert.equal(result.ok, false);
  });
});

describe("spec integrity", () => {
  it("every chapter id is unique and resolvable", () => {
    const seen = new Set<string>();
    for (const subject of ["aqa-economics", "ocr-computer-science", "edexcel-mathematics"] as const) {
      for (const chapter of getChapters(subject)) {
        assert.ok(!seen.has(chapter.id), `duplicate chapter id ${chapter.id}`);
        seen.add(chapter.id);
        assert.equal(getChapter(chapter.id)?.id, chapter.id);
      }
    }
  });

  it("every chapter has content and a spec reference", () => {
    for (const subject of ["aqa-economics", "ocr-computer-science", "edexcel-mathematics"] as const) {
      for (const chapter of getChapters(subject)) {
        assert.ok(chapter.content.length > 0, `${chapter.id} has no content`);
        assert.ok(chapter.specRef.length > 0, `${chapter.id} has no specRef`);
      }
    }
  });
});
