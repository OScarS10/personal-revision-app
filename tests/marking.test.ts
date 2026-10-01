import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markQuestion, toAnswer } from "@/lib/marking";
import { answerMatches, normaliseAnswer, parseNumeric, standardNormalCdf } from "@/lib/math-utils";
import type { GeneratedQuestion } from "@/lib/types";

/*
  Marking is the highest-risk code in the app: a generator bug or a marking bug
  both show up as "you got it wrong", and the learner has no way to tell the
  difference. These tests pin the behaviours that a careless rewrite would break.
*/

function question(format: GeneratedQuestion["format"], answer: string): GeneratedQuestion {
  return {
    id: "q1",
    template: "test",
    chapterId: "em-1",
    specRef: "1",
    skillIds: ["test"],
    prompt: "What is the answer?",
    format,
    answer,
    solution: [{ label: "Method", work: "Because." }],
    difficulty: 0.5,
    marks: 1,
    tier: 2,
    takeaway: "Test item.",
    assessesMastery: true,
  };
}

describe("parseNumeric", () => {
  it("reads plain and signed decimals", () => {
    assert.equal(parseNumeric("12.5"), 12.5);
    assert.equal(parseNumeric("-3"), -3);
    assert.equal(parseNumeric(" 1e3 "), 1000);
  });

  it("rejects text that is not a number", () => {
    assert.equal(parseNumeric("banana"), null);
    assert.equal(parseNumeric(""), null);
  });
});

describe("normaliseAnswer", () => {
  it("is case and whitespace insensitive", () => {
    assert.equal(normaliseAnswer("  Hello   World "), normaliseAnswer("hello world"));
  });
});

describe("answerMatches", () => {
  it("ignores case for text answers", () => {
    assert.ok(answerMatches("photosynthesis", "Photosynthesis"));
  });
});

describe("standardNormalCdf", () => {
  it("is 0.5 at the mean", () => {
    assert.ok(Math.abs(standardNormalCdf(0) - 0.5) < 1e-6);
  });

  it("is symmetric about zero", () => {
    assert.ok(Math.abs(standardNormalCdf(1.5) + standardNormalCdf(-1.5) - 1) < 1e-6);
  });

  it("matches a known quantile", () => {
    // Phi(1.96) is 0.975 to three decimal places.
    assert.ok(Math.abs(standardNormalCdf(1.96) - 0.975) < 1e-3);
  });
});

describe("markQuestion numeric", () => {
  it("accepts an answer within the tolerance", () => {
    const q = question({ kind: "numeric", tolerance: 0.01 }, "3.14");
    assert.ok(markQuestion(q, "3.145").correct);
    assert.ok(!markQuestion(q, "3.2").correct);
  });

  it("accepts an answer carrying the unit", () => {
    const q = question({ kind: "numeric", unit: "m", tolerance: 0 }, "12.5");
    assert.ok(markQuestion(q, "12.5 m").correct);
  });

  it("requires an exact match when the true answer is zero", () => {
    // A relative tolerance is meaningless at zero, so epsilon must not let
    // 0.0000001 count as 0.
    const q = question({ kind: "numeric" }, "0");
    assert.ok(markQuestion(q, "0").correct);
    assert.ok(!markQuestion(q, "0.0000001").correct);
  });

  it("scales tolerance with magnitude for long decimals", () => {
    const q = question({ kind: "numeric", tolerance: 0 }, "0.123456789");
    assert.ok(markQuestion(q, "0.123456789").correct);
  });

  it("marks an empty response wrong without throwing", () => {
    const q = question({ kind: "numeric" }, "5");
    const result = markQuestion(q, "");
    assert.equal(result.correct, false);
    assert.equal(result.score, 0);
  });
});

describe("markQuestion single choice", () => {
  const q = question({ kind: "single-choice", options: ["Alpha", "Beta, with comma", "Gamma"] }, "Beta, with comma");

  it("grades the option as one opaque string", () => {
    // The option contains a comma, so naive splitting would score it wrong.
    assert.ok(markQuestion(q, "Beta, with comma").correct);
    assert.ok(!markQuestion(q, "Beta").correct);
  });

  it("accepts the response as an array without re-splitting", () => {
    assert.ok(markQuestion(q, ["Beta, with comma"]).correct);
  });

  it("is case insensitive", () => {
    assert.ok(markQuestion(q, "beta, WITH comma").correct);
  });
});

describe("markQuestion multi choice", () => {
  const q = question({ kind: "multi-choice", options: ["A", "B", "C", "D"] }, "A,C");

  it("requires the full set for full credit", () => {
    assert.ok(markQuestion(q, ["A", "C"]).correct);
    assert.ok(!markQuestion(q, ["A"]).correct);
  });

  it("awards partial credit for a subset", () => {
    const result = markQuestion(q, ["A"]);
    assert.ok(result.score > 0);
    assert.ok(result.score < 1);
  });

  it("splits a pasted string on commas", () => {
    assert.ok(markQuestion(q, "A, C").correct);
  });
});

describe("markQuestion text", () => {
  const q = question({ kind: "text", accepted: ["photosynthesis", "the process"] }, "photosynthesis");

  it("accepts any listed alternative", () => {
    assert.ok(markQuestion(q, "the process").correct);
  });

  it("rejects something unlisted", () => {
    assert.ok(!markQuestion(q, "respiration").correct);
  });
});

describe("markQuestion code", () => {
  const q = question({ kind: "code", language: "python" }, "for i in range(n):\n    total += 1");

  it("ignores comments and formatting", () => {
    const result = markQuestion(q, "# a comment\nfor i in range(n):\n    total += 1");
    assert.ok(result.correct);
  });

  it("treats differing string contents as equivalent", () => {
    // String contents are not what is being assessed, so the same program with
    // different literals should still match.
    const withString = question({ kind: "code", language: "python" }, 'print("hello")');
    assert.ok(markQuestion(withString, 'print("goodbye")').correct);
    assert.ok(markQuestion(withString, "print('hello')").correct);
    assert.ok(!markQuestion(withString, 'print("hello", 2)').correct);
  });

  it("does not let a comment swallow a string containing a URL", () => {
    // Stripping comments before strings would delete from "//" to end of line,
    // making these two different programs compare equal.
    const withUrl = question({ kind: "code", language: "python" }, 'x = "http://a"\ny = 1');
    assert.ok(markQuestion(withUrl, 'x = "http://a"\ny = 1').correct);
    assert.ok(!markQuestion(withUrl, 'x = "http://a"\ny = 2').correct);
  });

  it("rejects a genuinely different program", () => {
    assert.ok(!markQuestion(q, "while True:\n    pass").correct);
  });
});

describe("toAnswer", () => {
  it("records the response, verdict and marks", () => {
    const q = question({ kind: "numeric" }, "7");
    const result = markQuestion(q, "7");
    const answer = toAnswer(q, result, 4200, 1_700_000_000_000);

    assert.equal(answer.questionId, "q1");
    assert.equal(answer.chapterId, "em-1");
    assert.equal(answer.correct, true);
    assert.equal(answer.durationMs, 4200);
    assert.deepEqual(answer.response, ["7"]);
  });
});
