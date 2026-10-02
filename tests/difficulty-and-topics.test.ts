import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateQuestion, generatorsFor } from "@/lib/generators/registry";
import "@/lib/generators/all";
import { getChapter, getChapters } from "@/lib/specs";
import {
  applyDifficultyPreference,
  DIFFICULTY_PREFERENCES,
  sanitiseDifficulty,
  type DifficultyPreference,
} from "@/lib/difficulty";
import { nextDifficulty } from "@/lib/session";
import type { Answer, Chapter } from "@/lib/types";

/*
  Regression tests for three reported problems.

  1. The processor chapter asked about bits.
  2. Only two questions came out per topic, however long the session.
  3. There was no difficulty control that did anything.

  Each of those was invisible to the existing suite. Coverage tests passed with
  the processor chapter wired to number-representation templates, because the
  questions were well formed and markable - they were just about the wrong
  subject. So these tests assert topical alignment and the monotonic effect of
  the difficulty control, not merely that something was produced.
*/

/** Words that a generated question must be able to contain, per chapter. */
const EXPECTED_TOPICS: Record<string, string[]> = {
  // 1.1.1 is about the processor itself.
  "ocr-1.1.1": ["ALU", "register", "PC", "MAR", "MDR", "CIR", "bus", "fetch", "CISC", "RISC", "core", "Amdahl"],
  "ocr-1.1.3": ["RAM", "ROM", "volatile", "storage", "paging", "virtual", "flash", "magnetic", "optical"],
  // 1.3.2 is about databases. It was previously served encryption questions.
  "ocr-1.3.2": ["table", "key", "normal", "NF", "record", "attribute", "redundan", "relational"],
  "ocr-1.3.3": ["LAN", "WAN", "TCP", "IP", "DNS", "HTTP", "network", "packet", "protocol", "peer"],
  "ocr-1.3.4": ["HTTP", "status", "HTML", "CSS", "box", "padding", "margin", "border", "browser"],
  "ocr-1.2.1": ["kernel", "driver", "file system", "operating system", "memory", "paging", "allocation"],
  // 1.4.1 is the data types chapter, so number representation belongs here.
  "ocr-1.4.1": ["bit", "binary", "hex", "denary", "two's complement", "BCD", "real", "character", "encoding"],
};

function chapterFor(id: string): Chapter {
  const chapter = getChapter(id);
  assert.ok(chapter, `no such chapter ${id}`);
  return chapter;
}

describe("questions match the chapter they are registered against", () => {
  for (const [id, expected] of Object.entries(EXPECTED_TOPICS)) {
    it(`${id} asks about its own topic`, () => {
      const chapter = chapterFor(id);
      const bespoke = generatorsFor(chapter).filter((g) => !g.key.startsWith("knowledge-"));
      assert.ok(
        bespoke.length > 0,
        `${id} (${chapter.title}) has no bespoke generators, so it has no topic to check`,
      );

      // Sample widely so a stray off-topic template is very likely to appear.
      const text: string[] = [];
      for (let i = 0; i < 400; i++) {
        const q = generateQuestion({
          chapter,
          targetDifficulty: (i % 5) - 2,
          seed: `topic::${id}::${i}`,
        });
        if (!q || q.template.startsWith("knowledge-")) continue;
        text.push(`${q.prompt} ${q.context ?? ""}`);
      }
      assert.ok(text.length > 0, `${id} produced nothing to check`);

      const haystack = text.join(" ").toLowerCase();
      const hits = expected.filter((word) => haystack.includes(word.toLowerCase()));
      assert.ok(
        hits.length > 0,
        `${id} (${chapter.title}) never mentioned any of its own topic. Expected one of: ${expected.join(", ")}\nsample: ${text[0]}`,
      );

      /*
        The reported bug was specifically the processor chapter asking about
        bits, so assert the two are not confused in either direction.
      */
      if (id === "ocr-1.1.1") {
        const offTopic = text.filter((t) => /two's complement|hexadecimal|nibble|denary/i.test(t));
        assert.deepEqual(
          offTopic.slice(0, 3),
          [],
          "the processor chapter produced number-representation questions",
        );
      }
    });
  }

  it("gives every CS chapter at least four bespoke templates", () => {
    /*
      A chapter with one or two templates is technically covered but produces a
      session that reads as the same question over and over, which is what the
      processor chapter did.

      Scoped to Computer Science deliberately. Economics has nine chapters with
      two or three templates each, and a handful of the 4.4.x chapters share one
      identical set of three, so widening this to every subject would fail on
      content that has not been written yet rather than on anything this change
      introduced. Those are worth writing, but they are a separate piece of work
      and a failure here should not quietly become the reason they are never
      written.
    */
    const thin: string[] = [];
    for (const chapter of getChapters("ocr-computer-science")) {
      const bespoke = generatorsFor(chapter).filter((g) => !g.key.startsWith("knowledge-"));
      if (bespoke.length < 4) {
        thin.push(`${chapter.id} (${chapter.title}): ${bespoke.length}`);
      }
    }
    assert.deepEqual(thin, [], "CS chapters with too few distinct templates");
  });

  it("gives every CS chapter only templates that match its own spec content", () => {
    /*
      An explicit allow-list per chapter rather than a keyword heuristic.

      A word-overlap version of this was tried first and rejected: neighbouring
      chapters genuinely share vocabulary, so "Types of processor" scored higher
      against "Structure and function of the processor" than against its own
      content, and the test flagged correct registrations. A heuristic that
      cannot tell a CISC question from a dead-letterbox one is not worth having.

      This is the registration itself, written out, so the failure mode is exact:
      someone registering the box-model template against Databases gets a diff
      here rather than a learner getting a question about padding.
    */
    const ALLOWED: Record<string, string[]> = {
      "ocr-1.1.1": ["cs-register-role", "cs-register-role-why", "cs-bus-direction", "cs-fetch-execute-register", "cs-fetch-execute-trace"],
      "ocr-1.1.2": ["cs-cisc-risc-match", "cs-amdahl-speedup", "cs-processor-performance", "cs-gpu-multicore"],
      "ocr-1.1.3": [
        "cs-storage-volatility", "cs-storage-compare", "cs-virtual-storage",
        "cs-storage-access-metric", "cs-storage-throughput",
      ],
      "ocr-1.2.1": [
        "cs-os-component-role", "cs-memory-management", "cs-scheduler-policy",
        "cs-interrupt-vs-polling", "cs-deadlock-conditions",
      ],
      "ocr-1.2.2": ["cs-translation-stage", "cs-compiler-vs-interpreter", "cs-linker-loader-library", "cs-test-level-match"],
      "ocr-1.2.3": ["cs-lifecycle-choice", "cs-agile-practice", "cs-requirements-user-vs-system", "cs-maintenance-type"],
      "ocr-1.2.4": ["cs-language-classification", "cs-addressing-mode", "cs-language-tradeoff", "cs-paradigm-match"],
      "ocr-1.3.2": ["cs-database-key", "cs-normalisation", "cs-relational-algebra", "cs-sql-statement"],
      "ocr-1.3.3": ["cs-network-type", "cs-protocol-layering", "cs-switching-mode", "cs-network-hardware"],
      "ocr-1.3.4": ["cs-http-status", "cs-box-model", "cs-client-vs-server-side", "cs-session-cookie"],
    };

    const problems: string[] = [];
    for (const [id, allowed] of Object.entries(ALLOWED)) {
      const chapter = chapterFor(id);
      const registered = generatorsFor(chapter)
        .filter((g) => !g.key.startsWith("knowledge-"))
        .map((g) => g.key);
      for (const key of registered) {
        if (!allowed.includes(key)) problems.push(`${id} should not serve ${key}`);
      }
      for (const key of allowed) {
        if (!registered.includes(key)) problems.push(`${id} should serve ${key} but does not`);
      }
    }
    assert.deepEqual(problems, [], "chapter registrations that do not match their spec content");
  });

  it("keeps 1.3.1 compression content out of the data types chapter", () => {
    // The compression and RLE templates live in dataTypeGenerators, so 1.4.1 has
    // to filter them out or a learner revising data types gets deflate.
    const keys = generatorsFor(chapterFor("ocr-1.4.1"))
      .filter((g) => !g.key.startsWith("knowledge-"))
      .map((g) => g.key);
    assert.ok(
      !keys.some((k) => k.startsWith("cs-compression") || k.startsWith("cs-rle")),
      `1.4.1 is data types, not compression; found ${keys.join(", ")}`,
    );
    const security = generatorsFor(chapterFor("ocr-1.3.1"))
      .filter((g) => !g.key.startsWith("knowledge-"))
      .map((g) => g.key);
    assert.ok(
      security.some((k) => k.startsWith("cs-compression") || k.startsWith("cs-rle")),
      "1.3.1 is where the compression templates belong",
    );
  });
});

describe("a session draws on more than two templates", () => {
  it("spreads across the pool rather than repeating the same pair", () => {
    // The reported symptom was "only 2 questions per thing even though I had a
    // greater number". The old selector sliced the two closest candidates, so a
    // chapter with four templates could only ever draw from two of them.
    for (const subject of ["ocr-computer-science", "aqa-economics", "edexcel-mathematics"] as const) {
      for (const chapter of getChapters(subject)) {
        const pool = generatorsFor(chapter).filter((g) => !g.key.startsWith("knowledge-"));
        if (pool.length < 4) continue;

        const recent: string[] = [];
        const asked = new Set<string>();
        for (let i = 0; i < 40; i++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: (i % 5) - 2,
            seed: `spread::${chapter.id}::${i}`,
            avoidKeys: [...recent],
          });
          if (!q) continue;
          asked.add(q.template);
          recent.push(q.template);
          if (recent.length > 12) recent.shift();
        }

        assert.ok(
          asked.size >= Math.min(3, pool.length),
          `${chapter.id} only reached ${asked.size} of ${pool.length} templates over 40 questions: ${[...asked].join(", ")}`,
        );
      }
    }
  });

  it("repeats far less often than picking at random would", () => {
    /*
      A strict "never the same template twice in a row" is not achievable, and
      trying to force it would be wrong. The targets a real session uses span
      the whole -2..2 range, and a chapter's templates only cover the range its
      authors wrote. Aiming at the top of that range leaves exactly one template
      within tolerance, so a repeat is the only correct answer available - the
      alternative would be serving a much easier question than the learner asked
      for.

      So the property worth asserting is comparative: the selector should repeat
      markedly less than uniform random choice over the same pool. Measured at
      roughly 9% against a 25% random baseline for a pool of eight.
    */
    const chapter = chapterFor("ocr-1.1.1");
    const pool = generatorsFor(chapter).filter((g) => !g.key.startsWith("knowledge-"));
    const randomBaseline = 2 / pool.length;

    let withinTwo = 0;
    let total = 0;
    const runs = 8;
    for (let r = 0; r < runs; r++) {
      const recent: string[] = [];
      const seq: string[] = [];
      for (let i = 0; i < 30; i++) {
        const q = generateQuestion({
          chapter,
          targetDifficulty: (i % 5) - 2,
          seed: `norepeat::${r}::${i}`,
          avoidKeys: [...recent],
        });
        if (!q) continue;
        seq.push(q.template);
        recent.push(q.template);
        if (recent.length > 12) recent.shift();
      }
      total += seq.length;
      withinTwo += seq.filter((t, i) => i > 1 && (t === seq[i - 1] || t === seq[i - 2])).length;
    }

    const rate = withinTwo / total;
    assert.ok(
      rate < randomBaseline * 0.75,
      `repeated within two questions ${(rate * 100).toFixed(1)}% of the time, against a ${(randomBaseline * 100).toFixed(1)}% random baseline`,
    );
  });
});

describe("the difficulty control changes the difficulty served", () => {
  it("orders gentle below standard below challenging", () => {
    for (const subject of ["ocr-computer-science", "aqa-economics", "edexcel-mathematics"] as const) {
      for (const chapter of getChapters(subject)) {
        if (generatorsFor(chapter).length === 0) continue;
        const mean: Record<DifficultyPreference, number> = {
          gentle: 0,
          standard: 0,
          challenging: 0,
        };
        for (const preference of DIFFICULTY_PREFERENCES) {
          const target = applyDifficultyPreference(0, preference);
          const seen: number[] = [];
          for (let i = 0; i < 60; i++) {
            const q = generateQuestion({
              chapter,
              targetDifficulty: target,
              seed: `diff::${chapter.id}::${preference}::${i}`,
              avoidKeys: [],
            });
            if (q) seen.push(q.difficulty);
          }
          if (seen.length === 0) continue;
          mean[preference] = seen.reduce((a, b) => a + b, 0) / seen.length;
        }
        assert.ok(
          mean.gentle < mean.standard,
          `${chapter.id}: gentle (${mean.gentle.toFixed(2)}) was not easier than standard (${mean.standard.toFixed(2)})`,
        );
        assert.ok(
          mean.challenging > mean.standard,
          `${chapter.id}: challenging (${mean.challenging.toFixed(2)}) was not harder than standard (${mean.standard.toFixed(2)})`,
        );
      }
    }
  });

  it("clamps the offset to the range the difficulty scale can represent", () => {
    for (const preference of DIFFICULTY_PREFERENCES) {
      for (const target of [-3, -1, 0, 1, 3.5]) {
        const applied = applyDifficultyPreference(target, preference);
        assert.ok(
          applied >= -3 && applied <= 3.5,
          `${preference} at ${target} produced ${applied}, outside the -3..3.5 scale`,
        );
      }
    }
  });

  it("is a no-op when the preference is standard", () => {
    assert.equal(applyDifficultyPreference(1.25, "standard"), 1.25);
  });

  it("shifts the target through the session's adaptive difficulty", () => {
    const answers: Answer[] = [
      { correct: false, timestamp: 1 } as Answer,
      { correct: false, timestamp: 2 } as Answer,
      { correct: false, timestamp: 3 } as Answer,
    ];
    const rng = () => 0.5;
    const gentle = nextDifficulty(0.5, answers, 0.35, rng, "gentle");
    const challenging = nextDifficulty(0.5, answers, 0.35, rng, "challenging");
    assert.ok(
      challenging > gentle,
      `challenging (${challenging}) should target a harder question than gentle (${gentle}) after three wrong answers`,
    );
  });

  it("falls back to standard for a corrupt stored value", () => {
    // A bad blob must not be able to break a session or drop the offset to NaN.
    assert.equal(sanitiseDifficulty("nonsense"), "standard");
    assert.equal(sanitiseDifficulty(undefined), "standard");
    assert.equal(sanitiseDifficulty(null), "standard");
    assert.equal(sanitiseDifficulty(3), "standard");
    assert.equal(sanitiseDifficulty("challenging"), "challenging");
  });
});

