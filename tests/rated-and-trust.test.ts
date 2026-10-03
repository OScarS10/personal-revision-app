import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "@/lib/generators/all";
import { SUBJECT_ORDER, getChapters } from "@/lib/specs";
import { generateQuestion, generatorsFor } from "@/lib/generators/registry";
import { markExtended, markQuestion, ratingToken, parseRatingToken } from "@/lib/marking";
import {
  containsTerm,
  trustFormat,
  trustMasteryWrite,
  trustPoint,
  trustRating,
  trustedAward,
  trustedPointIndexes,
} from "@/lib/trusted-auto";
import type { MarkScheme, RatingScale } from "@/lib/types";
import { corpusStats, mayCommit, validateCorpus } from "@/lib/mark-corpus";
import {
  buildVocabulary,
  crossValidate,
  evaluateCorpus,
  featurise,
  metrics,
  predict,
  train,
  MIN_SUPPORT_FOR_TRUST,
  TRUST_PRECISION,
} from "@/lib/mark-model";

/*
  The rule under test: an automatic mark is allowed only when it is right, not
  when a model is confident. These tests exist because the failure mode is
  silent. An auto-marker that is 95% accurate still hands out wrong marks every
  day, and nothing crashes; the only defence is that the untrustworthy paths are
  refused outright and asserted here.
*/

function scale(totalMarks: 1 | 2): RatingScale {
  const steps =
    totalMarks === 1
      ? ["not shown", "partly shown", "fully shown"]
      : ["confused", "connected", "connected and explained"];
  return {
    axis: "How clearly the reasoning is laid out",
    totalMarks,
    levels: steps.map((descriptor, i) => ({
      level: i + 1,
      label: descriptor,
      descriptor,
      marks: i === 0 ? 0 : i === 1 ? 1 : totalMarks,
    })),
  };
}

function ratedScheme(): MarkScheme {
  return {
    command: "explain",
    points: [
      {
        label: "States the next best alternative",
        detail: "The definition says the cost is the value of the next best alternative given up.",
        marks: 1,
        // Evidence written down, so the point can be checked rather than guessed.
        auto: { keywords: ["value", "alternative"] },
      },
    ],
    totalMarks: 1,
    rating: scale(2),
    availableMarks: 3,
  };
}

describe("trust classification", () => {
  it("refuses every extended format, whatever else it contains", () => {
    const scheme = ratedScheme();
    const decision = trustFormat({ kind: "extended", scheme });
    assert.equal(decision.verdict, "untrusted");
  });

  it("trusts a format decided by comparison", () => {
    assert.equal(trustFormat({ kind: "numeric" }).verdict, "trusted");
    assert.equal(trustFormat({ kind: "single-choice", options: ["a"] }).verdict, "trusted");
    assert.equal(trustFormat({ kind: "text", accepted: ["a"] }).verdict, "trusted");
    assert.equal(trustFormat({ kind: "code", language: "python" }).verdict, "trusted");
  });

  it("trusts a point that lists its evidence", () => {
    assert.equal(trustPoint(ratedScheme().points[0]!).verdict, "trusted");
  });

  it("refuses a point with no rule, which is the default", () => {
    const bare = { label: "Explains well", detail: "A sensible explanation.", marks: 1 };
    const decision = trustPoint(bare);
    assert.equal(decision.verdict, "untrusted");
    assert.match(decision.reason, /does not list the evidence/);
  });

  it("refuses a point whose rule lists nothing", () => {
    const empty = { label: "x", detail: "y", marks: 1, auto: { keywords: [] } };
    assert.equal(trustPoint(empty).verdict, "untrusted");
  });

  it("refuses a chain point even when it lists evidence", () => {
    const link = { label: "x", detail: "y", marks: 1, isLink: true, auto: { keywords: ["because"] } };
    assert.equal(trustPoint(link).verdict, "untrusted");
  });

  it("refuses every rating, and says so", () => {
    const decision = trustRating(scale(2));
    assert.equal(decision.verdict, "untrusted");
    assert.match(decision.reason, /judgement/);
    // Also when there is no rating at all, which is the same answer.
    assert.equal(trustRating(undefined).verdict, "untrusted");
  });
});

describe("term matching", () => {
  it("matches a whole word, not a fragment", () => {
    assert.equal(containsTerm("this is costly", "cost"), false);
    assert.equal(containsTerm("the cost here", "cost"), true);
    assert.equal(containsTerm("marginalise the market", "marginal"), false);
  });

  it("ignores case and punctuation", () => {
    assert.equal(containsTerm("Value, of the alternative!", "value"), true);
  });

  it("does not match an empty term", () => {
    assert.equal(containsTerm("anything at all", ""), false);
  });
});

describe("trusted award", () => {
  const scheme = ratedScheme();

  it("awards a point only when every listed term is present", () => {
    const both = trustedAward(scheme, "The cost is the value of the next best alternative.");
    assert.equal(both.marks, 1);
    assert.equal(both.awarded.length, 1);

    const one = trustedAward(scheme, "The cost is the value of giving something up.");
    assert.equal(one.marks, 0, "a missing term must not earn a partial mark");
    assert.equal(one.awarded.length, 0);
  });

  it("never awards the rating, however clearly it is answered", () => {
    const perfect = trustedAward(scheme, "The value of the next best alternative, because of the choice.");
    assert.equal(perfect.marks, 1, "only the factual point is automatic");
    const ratingDeferred = perfect.deferred.find((d) => d.marks === 2);
    assert.ok(ratingDeferred, "the rating must appear as deferred");
    assert.match(ratingDeferred!.reason, /judgement/);
  });

  it("accepts one of a set of alternative phrasings", () => {
    const alt: MarkScheme = {
      command: "explain",
      points: [
        {
          label: "States the alternative",
          detail: "The definition names the alternative.",
          marks: 1,
          auto: { keywords: ["alternative"], anyOf: [["next best", "next-best"]] },
        },
      ],
      totalMarks: 1,
    };
    assert.equal(trustedAward(alt, "It is the next best alternative.").marks, 1);
    // The hyphenated phrasing counts too.
    assert.equal(trustedAward(alt, "It is the next-best alternative.").marks, 1);
    // The required term alone is not enough: the point also wants one of the
    // accepted alternative phrasings.
    assert.equal(trustedAward(alt, "It is some alternative.").marks, 0);
    assert.equal(trustedAward(alt, "It is some other thing.").marks, 0);
  });

  it("reports why each point was left for the learner", () => {
    const none = trustedAward(scheme, "A vague answer with no evidence.");
    assert.equal(none.empty, true);
    assert.ok(none.deferred.length >= 2, "both the point and the rating are deferred");
    assert.match(none.deferred[0]!.reason, /missing/);
  });
});

describe("rating in marking", () => {
  const scheme = ratedScheme();

  it("awards rating marks on top of the points", () => {
    const result = markExtended(scheme, new Set([0]), undefined, 3);
    assert.equal(result.ratingMarks, 2);
    assert.equal(result.achievedMarks, 3);
    assert.equal(result.ratingLevel?.level, 3);
  });

  it("scores the points even when the rating is left blank", () => {
    const result = markExtended(scheme, new Set([0]), undefined, null);
    assert.equal(result.ratingMarks, 0);
    assert.equal(result.achievedMarks, 1);
  });

  it("earns nothing for a level that is not on the scale", () => {
    const result = markExtended(scheme, new Set([0]), undefined, 9);
    assert.equal(result.ratingMarks, 0);
    assert.equal(result.ratingLevel, null);
    assert.match(result.feedback, /not on the scale/);
  });

  it("cannot exceed the available total", () => {
    const result = markExtended(scheme, new Set([0]), undefined, 3);
    assert.ok(result.achievedMarks <= scheme.availableMarks!);
  });

  it("round-trips the rating through the response", () => {
    const tokens = ["an answer", "0", ratingToken(3)];
    assert.equal(parseRatingToken(tokens), 3);
    assert.equal(parseRatingToken(["an answer", "0"]), null);
  });

  it("does not read a rating token as a point claim", () => {
    // "rating:3" must not parse into the point index set.
    assert.equal(parseRatingToken([ratingToken(3)]), 3);
  });
});

describe("mastery writes", () => {
  it("refuses to let a rated item move mastery as if verified", () => {
    const q = {
      format: { kind: "extended" as const, scheme: ratedScheme() },
      assessesMastery: true,
    } as Parameters<typeof trustMasteryWrite>[0];
    assert.equal(trustMasteryWrite(q).verdict, "untrusted");
  });
});

describe("rated generators", () => {
  it("registers rated items across subjects, each only on its own chapter", () => {
    let rated = 0;
    for (const subject of SUBJECT_ORDER) {
      for (const chapter of getChapters(subject)) {
        const keys = generatorsFor(chapter)
          .filter((g) => g.key.startsWith("rated-"))
          .map((g) => g.key);
        for (const key of keys) {
          assert.ok(
            key.includes(chapter.id),
            `${key} was registered against ${chapter.id}, which is not its own chapter`,
          );
        }
        rated += keys.length;
      }
    }
    assert.ok(rated > 0, "no rated generators were registered");
  });

  it("produces 2- and 3-mark rated questions that score consistently", () => {
    const seen = new Set<number>();
    for (const subject of SUBJECT_ORDER) {
      for (const chapter of getChapters(subject)) {
        for (let s = 0; s < 6 && seen.size < 4; s++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: 0,
            seed: `rated::${chapter.id}::${s}`,
          });
          if (!q || q.format.kind !== "extended" || !q.format.scheme.rating) continue;
          seen.add(q.marks);
          const scaleLen = q.format.scheme.rating.levels.length;
          assert.ok(scaleLen >= 2, "a rating needs at least two steps to choose between");

          const top = [...q.format.scheme.rating.levels].sort((a, b) => b.marks - a.marks)[0]!;
          const all = markQuestion(q, ["x", "0", ratingToken(top.level)]);
          const none = markQuestion(q, ["x"]);
          assert.ok(all.awardedMarks > none.awardedMarks, "ticking and rating must raise the score");
          assert.equal(none.awardedMarks, 0, "an unanswered rated question scores nothing");
          // The factual point is auto-checkable, so an empty answer never earns it.
          assert.equal(none.selfAssessed, true);
        }
      }
    }
    assert.ok(seen.has(2), "no 2-mark rated question was produced");
    assert.ok(seen.has(3), "no 3-mark rated question was produced");
  });
});

describe("corpus validation", () => {
  const good = {
    version: 1,
    provenance: [
      {
        source: "inst",
        url: "https://example.invalid",
        retrievedAt: "2026-01-01T00:00:00.000Z",
        licence: "CC-BY-4.0",
        redistributable: true,
      },
    ],
    items: [
      {
        id: "a1",
        source: "inst",
        prompt: "Define X.",
        reference: "X is a thing.",
        points: [{ label: "states it", marks: 1, awarded: true }],
      },
    ],
  };

  it("keeps a well formed corpus", () => {
    const { corpus, problems, rejected } = validateCorpus(good);
    assert.deepEqual(problems, []);
    assert.deepEqual(rejected, []);
    assert.equal(corpus.items.length, 1);
  });

  it("rejects an item whose source is not in provenance", () => {
    const { rejected } = validateCorpus({
      ...good,
      items: [{ ...good.items[0]!, source: "unknown" }],
    });
    assert.equal(rejected.length, 1);
    assert.match(rejected[0]!.problem, /not in provenance/);
  });

  it("rejects an item with no reference answer, which teaches nothing", () => {
    const { rejected } = validateCorpus({
      ...good,
      items: [{ ...good.items[0]!, reference: "  " }],
    });
    assert.equal(rejected.length, 1);
    assert.match(rejected[0]!.problem, /reference/);
  });

  it("rejects the wrong version rather than guessing", () => {
    const { problems } = validateCorpus({ ...good, version: 99 });
    assert.equal(problems.length, 1);
    assert.match(problems[0]!.where, /version/);
  });

  it("refuses to commit board-owned material", () => {
    const { corpus } = validateCorpus({
      ...good,
      provenance: [{ ...good.provenance[0]!, redistributable: false, licence: "proprietary" }],
    });
    const verdict = mayCommit(corpus);
    assert.equal(verdict.ok, false);
    assert.deepEqual(verdict.offenders, ["inst"]);
  });

  it("counts what it has to learn from", () => {
    const { corpus } = validateCorpus(good);
    const stats = corpusStats(corpus);
    assert.equal(stats.items, 1);
    assert.equal(stats.points, 1);
    assert.equal(stats.awarded, 1);
    assert.equal(stats.byLabel[0]!.label, "states it");
  });
});

describe("the model earns the right to mark", () => {
  it("learns a signal that is actually there", () => {
    const docs: string[] = [];
    const labels: number[] = [];
    for (let i = 0; i < 80; i++) {
      const positive = i % 2 === 0;
      docs.push(positive ? `marginal utility diminishing returns extra unit ${i}` : `weather forecast sunny ${i}`);
      labels.push(positive ? 1 : 0);
    }
    const vocab = buildVocabulary(docs);
    const features = docs.map((d) => featurise(d, vocab));
    const w = train(features, labels, vocab);
    assert.ok(predict(w, features[0]!) > predict(w, features[1]!));
  });

  it("scores near chance on noise, which is the honest result", () => {
    // Alternating on a feature it cannot see. A model that scored well here would
    // mean the evaluation is leaking.
    const docs: string[] = [];
    const labels: number[] = [];
    for (let i = 0; i < 100; i++) {
      docs.push(`alpha beta gamma delta ${i}`);
      labels.push(i % 2);
    }
    const vocab = buildVocabulary(["alpha beta gamma delta"]);
    const features = docs.map((d) => featurise(d, vocab));
    const cv = crossValidate(features, labels, vocab, 5);
    assert.ok(cv.accuracy < 0.7, `accuracy ${cv.accuracy} suggests the split leaked`);
  });

  it("refuses to score a label it has one example of", () => {
    const docs = ["only one awarded example about marginal returns"];
    const vocab = buildVocabulary(docs);
    const cv = crossValidate(docs.map((d) => featurise(d, vocab)), [1], vocab, 5);
    assert.equal(cv.support, 0);
    assert.equal(cv.precision, 0);
  });

  it("awards no point type at all when the corpus is too small", () => {
    const { corpus } = validateCorpus({
      version: 1,
      provenance: [
        {
          source: "inst",
          url: "https://example.invalid",
          retrievedAt: "2026-01-01T00:00:00.000Z",
          licence: "CC0-1.0",
          redistributable: true,
        },
      ],
      items: [
        {
          id: "a1",
          source: "inst",
          prompt: "Explain X.",
          reference: "Because of Y, therefore Z.",
          points: [{ label: "explains the link", marks: 1, awarded: true }],
        },
      ],
    });
    const report = evaluateCorpus(corpus);
    assert.deepEqual(report.trusted, []);
    assert.match(report.limitation ?? "", /below the|No point type cleared/);
    assert.ok(report.byLabel[0]!.support < MIN_SUPPORT_FOR_TRUST);
  });

  it("states the bar it is holding itself to", () => {
    assert.ok(TRUST_PRECISION >= 0.95);
    const { corpus } = validateCorpus({ version: 1, provenance: [], items: [] });
    const report = evaluateCorpus(corpus);
    assert.deepEqual(report.trusted, []);
    assert.match(report.limitation ?? "", /no model was trained/);
  });

  it("counts a confusion matrix consistently", () => {
    const m = metrics([
      { actual: 1, predicted: 0.9 },
      { actual: 1, predicted: 0.2 },
      { actual: 0, predicted: 0.8 },
      { actual: 0, predicted: 0.1 },
    ]);
    assert.equal(m.tp, 1);
    assert.equal(m.fn, 1);
    assert.equal(m.fp, 1);
    assert.equal(m.tn, 1);
    assert.equal(m.precision, 0.5);
    assert.equal(m.recall, 0.5);
  });
});

describe("auto points are reachable from the generated schemes", () => {
  it("gives every rated generator at least one auto-checkable point", () => {
    let checked = 0;
    for (const subject of SUBJECT_ORDER) {
      for (const chapter of getChapters(subject)) {
        for (let s = 0; s < 4 && checked < 5; s++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: 0,
            seed: `auto::${chapter.id}::${s}`,
          });
          if (!q || q.format.kind !== "extended" || !q.format.scheme.rating) continue;
          const indexes = trustedPointIndexes(q.format.scheme);
          assert.ok(indexes.length > 0, `${q.template} has no auto-checkable point`);
          checked++;
        }
      }
    }
    assert.ok(checked > 0);
  });
});