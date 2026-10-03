import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  autoMarkExtended,
  analyseSurface,
  calibrationSummary,
  updateCalibration,
  CALIBRATION_FLOOR,
  type Calibration,
} from "@/lib/auto-mark";
import {
  bandForScore,
  reportFor,
  seededChapters,
  type CommandWord,
} from "@/lib/examiner-reports";
import {
  boundaryMark,
  boundaryTable,
  BOUNDARIES,
  gradeBands,
  gradeFor,
  marksRemaining,
  marksToNextGrade,
  paperBands,
  paperMarks,
  rawToPercent,
} from "@/lib/grades";
import { getChapters, SUBJECT_ORDER } from "@/lib/specs";
import type { MarkScheme } from "@/lib/types";

/*
  Two things are being pinned here.

  Grade boundaries: these numbers are shown to the learner as a target, so an
  off-by-one is not cosmetic - it tells someone they need 144 marks when they
  need 143. And because the boundary table replaced one invented set of cuts
  applied to every subject, the per-subject differences need to actually differ.

  Automatic marking: the risk is not that it is imprecise, which it is and says so,
  but that it is confidently wrong in a way a learner cannot detect. The tests are
  therefore mostly about it *failing*: refusing to award reasoning that is absent,
  refusing to award a chain that was not written, and staying silent about its
  confidence until it has evidence.
*/

const ECON = "aqa-economics" as const;

/* -------------------------------------------------------------------------
   Grade boundaries
   ------------------------------------------------------------------------- */

describe("grade boundaries", () => {
  it("awards the grade a mark actually reaches", () => {
    const spec = BOUNDARIES[ECON];
    const aStar = boundaryMark(spec.bands, "A*");
    const a = boundaryMark(spec.bands, "A");
    const b = boundaryMark(spec.bands, "B");

    assert.equal(gradeFor(ECON, aStar), "A*");
    assert.equal(gradeFor(ECON, aStar - 1), "A");
    assert.equal(gradeFor(ECON, a), "A");
    assert.equal(gradeFor(ECON, a - 1), "B");
    assert.equal(gradeFor(ECON, b), "B");
  });

  it("is unclassified below the lowest band", () => {
    const e = boundaryMark(BOUNDARIES[ECON].bands, "E");
    assert.equal(gradeFor(ECON, e), "E");
    assert.equal(gradeFor(ECON, e - 1), "U");
    assert.equal(gradeFor(ECON, 0), "U");
  });

  it("never exceeds the total, and never returns a negative mark", () => {
    for (const subject of SUBJECT_ORDER) {
      const total = BOUNDARIES[subject].totalMarks;
      assert.equal(gradeFor(subject, total), "A*");
      assert.equal(gradeFor(subject, total * 2), "A*", `${subject} overshoots`);
      assert.equal(gradeFor(subject, -50), "U", `${subject} goes negative`);
    }
  });

  it("gives every subject its own totals and weights", () => {
    const totals = SUBJECT_ORDER.map((s) => BOUNDARIES[s].totalMarks);
    assert.equal(new Set(totals).size, totals.length, "subjects share a total, so one table leaked");

    for (const subject of SUBJECT_ORDER) {
      const papers = BOUNDARIES[subject].papers;
      const summed = papers.reduce((s, p) => s + p.marks, 0);
      assert.equal(summed, BOUNDARIES[subject].totalMarks, `${subject} papers do not sum to its total`);

      const weighting = papers.reduce((s, p) => s + p.weighting, 0);
      assert.ok(
        Math.abs(weighting - 100) < 0.05,
        `${subject} paper weightings sum to ${weighting}, not 100`,
      );
    }
  });

  it("keeps the synoptic paper's bands distinct from the exam papers'", () => {
    /*
      This test used to assert the opposite of what the board publishes.

      AQA's June 2026 notional figures put Paper 3's A* at 58 of 80 (72.5%) against
      Paper 1's 62 of 80 (77.5%), while its E is *higher* proportionally: 25 of 80
      (31.25%) against Paper 1's 21 of 80 (26.25%). So the synoptic paper is not
      uniformly harder - it is harder to scrape a bare pass on and easier to reach
      the top on. The earlier version of this file described Paper 3 as a 20-mark
      essay needing "real evaluation, not 16/20" and asserted its bands sat above
      Paper 1's throughout. Both claims came from the invented table.
    */
    const essay = BOUNDARIES[ECON].papers.find((p) => p.code === "7136/3")!;
    const paper1 = BOUNDARIES[ECON].papers.find((p) => p.code === "7136/1")!;
    assert.ok(essay.bands, "7136/3 has published component boundaries");
    assert.ok(paper1.bands, "7136/1 has published component boundaries");
    assert.ok(
      essay.bands!["A*"] / essay.marks < paper1.bands!["A*"] / paper1.marks,
      "7136/3 should reach A* at a lower proportion than 7136/1",
    );
    assert.ok(
      essay.bands!.E / essay.marks > paper1.bands!.E / paper1.marks,
      "7136/3 should need a higher proportion for a bare E than 7136/1",
    );
  });

  it("grades a single paper on that paper's own bands", () => {
    /*
      24 of 80 is an E on Paper 1 (E at 21) and unclassified on Paper 3 (E at 25).
      Reading a single paper's mark against another paper's thresholds - or against
      the 240-mark overall - reports a grade the candidate cannot be given.
    */
    assert.equal(gradeFor(ECON, 24, "7136/1"), "E");
    assert.equal(gradeFor(ECON, 24, "7136/3"), "U");
    assert.equal(gradeFor(ECON, 49, "7136/3"), "A");
    assert.equal(gradeFor(ECON, 48, "7136/3"), "B");
  });

  it("reports bands as contiguous, non-overlapping ranges", () => {
    for (const subject of SUBJECT_ORDER) {
      const bands = gradeBands(subject);
      assert.equal(bands[0]!.grade, "A*");
      // The top band is open-ended by design: nothing sits above an A*.
      assert.equal(bands[0]!.to, null, `${subject} top band must be open-ended`);

      /*
        Bands are best-first, so each band's floor is its own threshold and its
        ceiling is the threshold of the grade above it. Two neighbours therefore
        satisfy `above.from === below.to` - A spans [210,240) and B spans [180,210)
        for maths, so A's floor of 210 is B's ceiling of 210.

        Comparing a ceiling against the band *above* instead, or against the band
        below's floor, is inverted and flags a contiguous table as overlapping.
      */
      for (let i = 0; i < bands.length - 1; i++) {
        const above = bands[i]!;
        const below = bands[i + 1]!;
        assert.equal(
          above.from,
          below.to,
          `${subject} ${above.grade} and ${below.grade} overlap or leave a gap`,
        );
        assert.ok(
          below.to! > below.from,
          `${subject} ${below.grade} runs backwards: ${below.from}..${below.to}`,
        );
      }

      // Marks below the E threshold are unclassified rather than an E-grade band,
      // so the lowest band starts at the E threshold, not at zero.
      const e = bands[bands.length - 1]!;
      assert.equal(e.grade, "E");
      assert.equal(
        e.from,
        boundaryMark(BOUNDARIES[subject].bands, "E"),
      );
      assert.equal(gradeFor(subject, e.from - 1), "U");
    }
  });

  it("counts down the marks needed to the next grade", () => {
    const total = BOUNDARIES[ECON].totalMarks;
    const bands = BOUNDARIES[ECON].bands;
    const b = boundaryMark(bands, "B");

    // Ten marks short of a B. The useful answer is "10 more marks for a B", not
    // "46 more marks for an A*", so this has to return the nearest grade above
    // the score.
    const next = marksToNextGrade(ECON, b - 10);
    assert.ok(next);
    assert.equal(next.grade, "B");
    assert.equal(next.marksNeeded, 10);
    assert.equal(next.total, total);

    // Exactly on a boundary, the grade below is already held, so the target moves up.
    assert.equal(marksToNextGrade(ECON, b)!.grade, "A");
    assert.equal(marksToNextGrade(ECON, b)!.marksNeeded, boundaryMark(bands, "A") - b);

    // Just under the E threshold there is still a next grade to chase.
    const e = boundaryMark(bands, "E");
    assert.equal(marksToNextGrade(ECON, e - 1)!.grade, "E");
    assert.equal(marksToNextGrade(ECON, e - 1)!.marksNeeded, 1);

    assert.equal(marksToNextGrade(ECON, boundaryMark(bands, "A*")), null);
  });

  it("lists every grade against its whole-mark threshold", () => {
    const table = boundaryTable(ECON);
    assert.deepEqual(table.map((t) => t.grade), ["A*", "A", "B", "C", "D", "E"]);
    assert.ok(table.every((t) => Number.isInteger(t.mark)));
  });

  it("works out what is still winnable across papers", () => {
    const remaining = marksRemaining(ECON, { "7136/1": 40 });
    assert.equal(remaining.find((p) => p.code === "7136/1")!.marks, 40);
    assert.equal(remaining.find((p) => p.code === "7136/2")!.marks, 80);

    const over = marksRemaining(ECON, { "7136/1": 500 });
    assert.equal(over.find((p) => p.code === "7136/1")!.marks, 0);
  });

  it("clamps the percentage it shows next to a score", () => {
    assert.equal(rawToPercent(ECON, 0), 0);
    assert.equal(rawToPercent(ECON, 120), 50);
    assert.equal(rawToPercent(ECON, 10_000), 100);
  });

  it("uses the boards' published June 2026 figures, not fractions of a total", () => {
    /*
      Pinned against the source PDFs rather than derived, so a refactor cannot
      quietly reintroduce a lossy fraction. Each expected value below is the mark
      a candidate is actually graded against for the overall (subject) boundary.
    */
    assert.equal(BOUNDARIES[ECON].totalMarks, 240);
    assert.deepEqual(BOUNDARIES[ECON].bands, { "A*": 178, A: 154, B: 132, C: 110, D: 88, E: 66 });
    assert.deepEqual(BOUNDARIES["ocr-computer-science"].bands, {
      "A*": 289,
      A: 254,
      B: 216,
      C: 178,
      D: 141,
      E: 104,
    });
    assert.deepEqual(BOUNDARIES["edexcel-mathematics"].bands, {
      "A*": 254,
      A: 210,
      B: 173,
      C: 136,
      D: 100,
      E: 64,
    });

    // Every subject's boundaries are a confirmed figure, not a derived one.
    for (const subject of SUBJECT_ORDER) {
      assert.equal(BOUNDARIES[subject].basis, "confirmed", `${subject} is not a confirmed boundary`);
      assert.ok(BOUNDARIES[subject].series, `${subject} does not name its exam series`);
      assert.ok(BOUNDARIES[subject].sourceUrl, `${subject} does not cite a source`);
    }

    /*
      Whole marks throughout. A fractional boundary means someone reintroduced a
      fraction, which is what cost the C band a mark at 110/240 before.
    */
    for (const subject of SUBJECT_ORDER) {
      for (const mark of Object.values(BOUNDARIES[subject].bands)) {
        assert.ok(Number.isInteger(mark), `${subject} has a fractional boundary: ${mark}`);
      }
    }
  });

  it("scales the one qualification with no published per-paper boundaries", () => {
    /*
      Pearson publish only the overall figure for 9MA0, so its papers carry no
      bands of their own. `paperBands` derives them pro rata; the point of the
      test is that this is flagged as indicative rather than presented as
      published, and that the pro-rata figures stay inside the paper's maximum.
    */
    const maths = BOUNDARIES["edexcel-mathematics"];
    for (const paper of maths.papers) {
      assert.equal(paper.bands, undefined, "9MA0 papers should carry no published bands");
      assert.equal(paper.basis, "indicative");
      const derived = paperBands("edexcel-mathematics", paper.code)!;
      assert.ok(derived["A*"] <= paper.marks, `${paper.code} A* exceeds the paper`);
      assert.ok(derived.E <= derived["A*"], `${paper.code} bands run backwards`);
    }

    // AQA and OCR do publish component figures, so theirs must be used as-is.
    for (const paper of BOUNDARIES[ECON].papers) {
      assert.equal(paper.basis, "notional");
      assert.ok(paper.bands, `${paper.code} should use its published bands`);
    }
  });

  it("knows how many marks each paper is worth", () => {
    assert.equal(paperMarks(ECON, "7136/1"), 80);
    assert.equal(paperMarks(ECON, "nonexistent"), 0);
  });
});

/* -------------------------------------------------------------------------
   Examiner report seeds
   ------------------------------------------------------------------------- */

describe("examiner report seeds", () => {
  it("points only at chapters that exist in the specification", () => {
    for (const subject of SUBJECT_ORDER) {
      const real = new Set(getChapters(subject).map((c) => c.id));
      for (const chapterId of seededChapters(subject)) {
        assert.ok(
          real.has(chapterId),
          `${subject} seeds "${chapterId}", which is not a chapter. Seeds are keyed by string, so a renamed chapter disables the examiner feedback silently.`,
        );
      }
    }
  });

  it("covers the two subjects that were asked for", () => {
    assert.ok(seededChapters("aqa-economics").length >= 3);
    assert.ok(seededChapters("ocr-computer-science").length >= 3);
  });

  it("gives every seeded chapter usable vocabulary and errors", () => {
    for (const subject of SUBJECT_ORDER) {
      for (const chapterId of seededChapters(subject)) {
        const report = reportFor(chapterId, subject);
        assert.ok(report, `${chapterId} has no report`);
        assert.ok(report.criteria.length === 4, `${chapterId} lost an objective`);
        assert.ok(report.focus.length > 20, `${chapterId} focus is a stub`);
        assert.ok(report.commonErrors.length >= 2, `${chapterId} needs real errors`);
        // The knowledge criterion carries the chapter vocabulary, so a chapter with
        // an empty list can never earn knowledge credit.
        const knowledge = report.criteria.find((c) => c.id === "knowledge")!;
        assert.ok(knowledge.evidence.length > 3, `${chapterId} has no vocabulary`);
      }
    }
  });

  it("returns nothing for an unseeded chapter rather than guessing", () => {
    assert.equal(reportFor("definitely-not-a-chapter", ECON), null);
  });

  it("places a score in the right band of response", () => {
    assert.equal(bandForScore(0.8).band, "Level 4");
    assert.equal(bandForScore(0.45).band, "Level 3");
    assert.equal(bandForScore(0.25).band, "Level 2");
    assert.equal(bandForScore(0).band, "Level 1");
  });
});

/* -------------------------------------------------------------------------
   Surface analysis
   ------------------------------------------------------------------------- */

describe("surface analysis", () => {
  it("finds linking language and judgement language", () => {
    const linked = analyseSurface(
      "Costs rise, which means prices rise, therefore demand falls because income is fixed.",
    );
    assert.ok(linked.chains.length >= 2);
    assert.equal(linked.counterclaims.length, 0);

    const judged = analyseSurface(
      "However, the policy may not work on balance, so it depends on the assumption.",
    );
    assert.ok(judged.counterclaims.length >= 2);
  });

  it("measures a bare list", () => {
    const list = analyseSurface("costs, prices, demand, supply, income, output, wages, trade");
    assert.ok(list.longestListRun >= 8, "should read as a list");
    assert.equal(list.chains.length, 0);
  });

  it("notices a term used in place of development", () => {
    const padded = analyseSurface("inflation inflation inflation inflation inflation inflation");
    assert.ok(padded.repeatedTerms.includes("inflation"));
  });
});

/* -------------------------------------------------------------------------
   Automatic marking
   ------------------------------------------------------------------------- */

const ECON_CHAPTER = "econ-4.1.6";

const SCHEME: MarkScheme = {
  command: "Evaluate",
  totalMarks: 20,
  points: [
    {
      label: "Define a negative externality",
      detail:
        "A negative externality is a cost imposed on a third party that is not reflected in the market price of a good.",
      marks: 4,
    },
    {
      label: "Link to market failure",
      detail:
        "Because the marginal social cost exceeds the marginal private cost, the market produces too much and a deadweight welfare loss results.",
      marks: 4,
    },
    {
      label: "Explain a Pigouvian tax",
      detail:
        "A Pigouvian tax set equal to the marginal external cost internalises the externality and moves output towards the socially efficient level.",
      marks: 4,
    },
    {
      label: "Develop the chain of reasoning",
      detail:
        "The tax raises the price, which deters demand, which reduces the quantity produced, which reduces the externality, which recovers the deadweight welfare loss.",
      marks: 4,
      isLink: true,
    },
    {
      label: "Evaluate the counter-argument",
      detail:
        "However, a per-unit tax is politically difficult to implement and may be less effective where the external cost is hard to measure.",
      marks: 4,
      isLink: true,
    },
  ],
};

const STRONG_ANSWER = [
  "A negative externality is a cost imposed on a third party that is not reflected in the market price of a good.",
  "Because the marginal social cost exceeds the marginal private cost, the market produces too much and a deadweight welfare loss results.",
  "A Pigouvian tax set equal to the marginal external cost internalises the externality and moves output towards the socially efficient level. The tax raises the price, which deters demand, which reduces the quantity produced, which reduces the externality.",
  "However, a per-unit tax is politically difficult to implement. On balance, this is a real limitation, but the deadweight welfare loss is larger, so the tax is still worth implementing despite the measurement problems.",
].join(" ");

const WEAK_ANSWER = "negative externality market failure Pigouvian tax welfare loss tax price demand";

function mark(answer: string, cal?: Calibration, selfMark?: number) {
  return autoMarkExtended(answer, SCHEME, ECON_CHAPTER, ECON, cal, selfMark);
}

describe("automatic marking", () => {
  it("scores a developed answer above a list of keywords", () => {
    const strong = mark(STRONG_ANSWER);
    const weak = mark(WEAK_ANSWER);
    assert.ok(
      strong.estimate > weak.estimate,
      `developed ${strong.estimate} should beat keyword list ${weak.estimate}`,
    );
  });

  it("keeps estimatedMarks consistent with the estimate", () => {
    for (const answer of [STRONG_ANSWER, WEAK_ANSWER, ""]) {
      const r = mark(answer);
      assert.equal(
        r.estimatedMarks,
        Math.round(r.estimate * r.totalMarks * 100) / 100,
        "marks and estimate disagree",
      );
      assert.ok(r.estimatedMarks <= r.totalMarks);
      assert.ok(r.estimatedMarks >= 0);
    }
  });

  it("withholds reasoning credit that was not written", () => {
    const listed = mark(WEAK_ANSWER);
    assert.equal(listed.linksFound, 0, "a list contains no chain, so no link marks");
    const analysis = listed.objectives.find((o) => o.objective === "analysis")!;
    assert.equal(analysis.credit, 0);

    const developed = mark(STRONG_ANSWER);
    assert.ok(developed.linksFound > 0, "the chain language should be detected");
  });

  it("will not award an evaluation that is only a conclusion", () => {
    const conclusionOnly = mark(
      "A negative externality is a cost on a third party not reflected in the market price. " +
        "Because marginal social cost exceeds marginal private cost there is deadweight welfare loss. " +
        "A Pigouvian tax internalises the externality, which raises the price, which deters demand, which reduces output. " +
        "In conclusion, it is clear that the answer is taxation.",
    );
    const evaluation = conclusionOnly.objectives.find((o) => o.objective === "evaluation")!;
    assert.ok(evaluation.credit < 0.5, "no counter-argument was made, so the top band is out of reach");
  });

  it("scores a genuinely empty answer at zero and admits it cannot tell", () => {
    const blank = mark("");
    assert.equal(blank.estimate, 0);
    assert.equal(blank.confidence, 0);
    assert.ok(blank.caveats.some((c) => c.includes("very short")));
  });

  it("detects a circular definition and says so", () => {
    const circular = mark(
      "Utility is the utility that a consumer gets from a good, which is the marginal utility, which means utility. " +
        "Because marginal utility falls, therefore utility falls. However, on balance, this depends. " +
        "A Pigouvian tax internalises the externality which reduces output which recovers welfare loss.",
    );
    assert.ok(
      circular.antiPatterns.some((h) => h.criterionId === "knowledge"),
      "the circular definition should be caught",
    );
    assert.ok(circular.feedback.some((f) => f.includes("knowledge check")));
  });

  it("does not detect anti-patterns it was not given", () => {
    const clean = mark(STRONG_ANSWER);
    assert.equal(clean.antiPatterns.length, 0);
  });

  it("reports low confidence for an unseeded chapter rather than guessing", () => {
    const seeded = mark(STRONG_ANSWER);
    const unseeded = autoMarkExtended(STRONG_ANSWER, SCHEME, "not-a-chapter", ECON);
    assert.ok(unseeded.unseeded);
    assert.ok(unseeded.confidence < seeded.confidence);
    assert.ok(unseeded.caveats.some((c) => c.includes("No examiner-report criteria")));
  });

  it("rewards more scheme points with more marks", () => {
    const onePoint = mark("A negative externality is a cost imposed on a third party.");
    const twoPoints = mark(
      "A negative externality is a cost imposed on a third party. " +
        "Because the marginal social cost exceeds the marginal private cost, a deadweight welfare loss results.",
    );
    assert.ok(twoPoints.rawMarks > onePoint.rawMarks);
  });

  it("stays inside the scheme's own total however much is thrown at it", () => {
    const stuffed = mark(STRONG_ANSWER.repeat(20));
    assert.ok(stuffed.rawMarks <= SCHEME.totalMarks);
    assert.ok(stuffed.estimate <= 1);
  });

  it("reports examiner focus for the chapter it marked", () => {
    const r = mark(STRONG_ANSWER);
    assert.ok(r.feedback.some((f) => f.includes("Examiner focus for this chapter")));
    assert.ok(r.feedback.some((f) => f.includes("Most common error here")));
  });

  it("tells an evaluate command what it is missing", () => {
    const noCounter = mark(
      "A negative externality is a cost imposed on a third party. " +
        "Because marginal social cost exceeds marginal private cost, deadweight welfare loss results, " +
        "which is why a Pigouvian tax internalises the externality, which reduces output, which recovers welfare loss.",
    );
    assert.ok(noCounter.feedback.some((f) => f.includes("strongest argument against")));
  });
});

/* -------------------------------------------------------------------------
   Calibration
   ------------------------------------------------------------------------- */

describe("calibration", () => {
  it("applies no bias before it has enough samples", () => {
    let cal = CALIBRATION_FLOOR;
    for (let i = 0; i < 4; i++) {
      const r = mark(WEAK_ANSWER, cal, 1); // learner claims full marks every time
      cal = r.calibration;
    }
    const summary = calibrationSummary(cal);
    assert.equal(summary.bias, 0);
    assert.equal(summary.direction, "calibrating");
    assert.ok(summary.message.includes("1 more extended answer"));
  });

  it("eases the estimate up for a learner who over-credits themselves", () => {
    let cal = CALIBRATION_FLOOR;
    for (let i = 0; i < 12; i++) {
      cal = mark(WEAK_ANSWER, cal, 1).calibration;
    }
    const summary = calibrationSummary(cal);
    assert.ok(summary.bias > 0, `expected a positive bias, got ${summary.bias}`);
    assert.equal(summary.direction, "harsh");
    assert.ok(summary.message.includes("credit yourself more"));

    const withBias = mark(WEAK_ANSWER, cal);
    const withoutBias = mark(WEAK_ANSWER, CALIBRATION_FLOOR);
    assert.ok(withBias.estimate > withoutBias.estimate);
  });

  it("tightens the estimate for a learner who under-credits themselves", () => {
    let cal = CALIBRATION_FLOOR;
    for (let i = 0; i < 12; i++) {
      cal = mark(STRONG_ANSWER, cal, 0).calibration;
    }
    const summary = calibrationSummary(cal);
    assert.ok(summary.bias < 0, `expected a negative bias, got ${summary.bias}`);
    assert.equal(summary.direction, "lenient");
  });

  it("moves the bias toward agreement rather than oscillating", () => {
    const first = mark(WEAK_ANSWER, CALIBRATION_FLOOR, 1).calibration;
    const second = mark(WEAK_ANSWER, first, 1).calibration;
    assert.ok(Math.abs(second.bias) < Math.abs(first.bias) || second.bias > 0);
    assert.ok(second.samples === 2);
  });

  it("caps how far the bias can drift", () => {
    let cal: Calibration = { samples: 500, bias: 0.9, disagreement: 0 };
    for (let i = 0; i < 50; i++) {
      cal = updateCalibration(cal, 0, 1);
    }
    assert.ok(Math.abs(calibrationSummary(cal).bias) <= 0.25, "bias escaped its bounds");
  });

  it("lowers confidence once the learner and the marker disagree", () => {
    const agreeing = calibrationSummary({ samples: 10, bias: 0, disagreement: 0.05 });
    const disagreeing = calibrationSummary({ samples: 10, bias: 0, disagreement: 0.4 });
    assert.equal(agreeing.direction, "agreeing");
    assert.equal(disagreeing.direction, "calibrating");
    assert.ok(agreeing.message !== disagreeing.message);
  });

  it("does not change the mark it just produced", () => {
    const base = mark(STRONG_ANSWER);
    const fed = mark(STRONG_ANSWER, CALIBRATION_FLOOR, 0.05);
    assert.equal(base.estimate, fed.estimate, "the self-mark must not feed back into this answer");
    assert.notEqual(base.calibration.samples, fed.calibration.samples);
  });
});

/* -------------------------------------------------------------------------
   Command words
   ------------------------------------------------------------------------- */

describe("command words", () => {
  it("only asks for evaluation credit when the command word is evaluate", () => {
    const asEvaluate = mark(STRONG_ANSWER).objectives.map((o) => o.objective);
    assert.ok(asEvaluate.includes("evaluation"));

    const explainScheme: MarkScheme = { ...SCHEME, command: "Explain" };
    const asExplain = autoMarkExtended(
      STRONG_ANSWER,
      explainScheme,
      ECON_CHAPTER,
      ECON,
    ).objectives.map((o) => o.objective);
    assert.ok(!asExplain.includes("evaluation"), "explain must not reward judgement language");
    assert.ok(asExplain.includes("analysis"));
  });

  it("does not ask for analysis on a define command", () => {
    const defineScheme: MarkScheme = { ...SCHEME, command: "Define" };
    const objectives = autoMarkExtended(
      STRONG_ANSWER,
      defineScheme,
      ECON_CHAPTER,
      ECON,
    ).objectives.map((o) => o.objective);
    assert.deepEqual(objectives, ["knowledge", "application"]);
  });

  it("treats an unknown command word as explain rather than crashing", () => {
    const odd: MarkScheme = { ...SCHEME, command: "Discuss the merits" };
    const r = autoMarkExtended(STRONG_ANSWER, odd, ECON_CHAPTER, ECON);
    assert.ok(r.estimate > 0);
  });

  it("keeps the declared command words and the ones it parses in step", () => {
    const declared: CommandWord[] = [
      "identify", "define", "calculate", "explain", "analyse", "evaluate",
    ];
    for (const command of declared) {
      const r = autoMarkExtended(
        STRONG_ANSWER,
        { ...SCHEME, command },
        ECON_CHAPTER,
        ECON,
      );
      assert.ok(r.objectives.length > 0, `${command} produced no objectives`);
    }
  });
});