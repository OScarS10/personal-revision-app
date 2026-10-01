import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync as fs } from "node:fs";
import { resolve } from "node:path";
import { generateQuestion, generatorsFor } from "@/lib/generators/registry";
import "@/lib/generators/all";
import { markQuestion } from "@/lib/marking";
import { SUBJECT_ORDER, getChapters, getChapter } from "@/lib/specs";

/*
  Generator coverage and correctness.

  Two failure modes matter and neither shows up as a crash:
  - a chapter with no bespoke generators silently serves recall-only questions,
    so the learner revising 4.1.7 gets told it is "not assessed";
  - a generator emits an answer its own marker rejects, so the learner is marked
    wrong for a question that was impossible.

  Importing for side effects is the same path the app uses at runtime, so these
  tests fail if the layout ever stops registering them.
*/


const TARGETS = [-2, -1, 0, 1, 2];
const SEEDS_PER_TARGET = 6;

const TESTS_DIR = import.meta.dirname ?? process.cwd();
const ROOT = resolve(TESTS_DIR, "..");

/** Read a source file relative to the project root. */
const readSource = (rel: string) => fs(resolve(ROOT, rel), "utf8");

function everyChapter() {
  return SUBJECT_ORDER.flatMap((subject) => getChapters(subject));
}

describe("generator coverage", () => {
  /*
    A chapter may legitimately have no generator. Authored content has not been
    written for every chapter yet, and the correct response to that is a visible
    gap rather than a question about where the chapter sits in the
    specification. These tests therefore assert the gap is visible and
    confined, not that it is absent.
  */

  it("never asks a question about the specification's own layout", () => {
    // Regression guard. The old recall templates asked "which section is this
    // bullet from?" and "which bullet belongs to this chapter?". They measured
    // the specification's organisation rather than the subject, and because they
    // were most chapters' only questions their results were fed straight into
    // the ability model.
    const banned = [
      "recall-in-spec",
      "recall-not-in-spec",
      "recall-which-section",
      "recall-odd-one-out",
    ];
    for (const chapter of everyChapter()) {
      for (const gen of generatorsFor(chapter)) {
        assert.ok(
          !banned.includes(gen.key),
          `${chapter.id} still offers ${gen.key}, which tests the spec layout not the subject`,
        );
      }
    }
  });

  it("produces no banned template for any chapter at any difficulty", () => {
    for (const chapter of everyChapter()) {
      for (const target of [-2, 0, 2]) {
        const q = generateQuestion({ chapter, targetDifficulty: target, seed: `banned::${chapter.id}` });
        if (!q) continue;
        assert.ok(
          !q.template.startsWith("recall-"),
          `${chapter.id} generated ${q.template}`,
        );
      }
    }
  });

  it("reports chapters with nothing to ask rather than inventing a question", () => {
    const bare = everyChapter().filter((c) => generatorsFor(c).length === 0);
    for (const chapter of bare) {
      const q = generateQuestion({ chapter, targetDifficulty: 0, seed: "bare" });
      assert.equal(q, null, `${chapter.id} has no content but still produced a question`);
    }
  });

  it("covers every chapter that has authored knowledge", () => {
    // A chapter that has teaching content must be able to produce questions
    // from it, otherwise the content is dead weight.
    const withKnowledge = everyChapter().filter((c) => c.knowledge);
    const silent = withKnowledge.filter((c) => generatorsFor(c).length === 0);
    assert.deepEqual(
      silent.map((c) => c.id),
      [],
      "these chapters have teaching notes but generate nothing from them",
    );
  });

  it("keeps the set of chapters with no content small and visible", () => {
    const bare = everyChapter().filter((c) => generatorsFor(c).length === 0);
    const share = bare.length / everyChapter().length;
    assert.ok(
      share < 0.25,
      `${bare.length} of ${everyChapter().length} chapters have nothing to ask: ${
        bare.map((c) => c.id).join(", ")
      }`,
    );
  });

  it("covers all three subjects", () => {
    for (const subject of SUBJECT_ORDER) {
      const chapters = getChapters(subject);
      const asked = chapters.filter((c) => generatorsFor(c).length > 0);
      assert.ok(asked.length > 0, `${subject} has no chapters that can be practised`);
    }
  });
});

describe("generated questions are answerable", () => {
  for (const subject of SUBJECT_ORDER) {
    it(`produces markable questions across ${subject}`, () => {
      const problems: string[] = [];

      for (const chapter of getChapters(subject)) {
        for (const target of TARGETS) {
          for (let s = 0; s < SEEDS_PER_TARGET; s++) {
            const q = generateQuestion({
              chapter,
              targetDifficulty: target,
              seed: `test::${chapter.id}::${target}::${s}`,
            });
            // A chapter with no content legitimately produces nothing.
            if (!q) continue;

            if (q.format.kind === "extended") {
              /*
                An extended answer is scored from the scheme points the learner
                claims, not from a stored answer string, so the answer-acceptance
                check below does not apply. What must hold is that the scheme is
                well formed and that scoring responds to what was claimed.
              */
              const scheme = q.format.scheme;
              const declared = scheme.points.reduce((s, p) => s + p.marks, 0);
              if (declared !== scheme.totalMarks) {
                problems.push(
                  `${chapter.id} (${q.template}): scheme points total ${declared} but declares ${scheme.totalMarks}`,
                );
              }
              if (scheme.points.length < 3) {
                problems.push(`${chapter.id} (${q.template}): only ${scheme.points.length} scheme points`);
              }
              if (!scheme.command) {
                problems.push(`${chapter.id} (${q.template}): no command word`);
              }
              // Ticking everything must reach full marks, and nothing must not.
              const all = markQuestion(q, [
                "an answer",
                ...scheme.points.map((_, i) => String(i)),
              ]);
              if (Math.abs(all.awardedMarks - scheme.totalMarks) > 0.01) {
                problems.push(
                  `${chapter.id} (${q.template}): full ticks gave ${all.awardedMarks} of ${scheme.totalMarks}`,
                );
              }
              const none = markQuestion(q, [""]);
              if (none.awardedMarks > 0 || none.correct) {
                problems.push(`${chapter.id} (${q.template}): no ticks still scored`);
              }
              continue;
            }

            // The single most important property: the published answer must be
            // accepted by the marker.
            const result = markQuestion(q, [q.answer]);
            if (!result.correct) {
              problems.push(`${chapter.id} (${q.template}): answer "${q.answer}" marked wrong`);
            }

            // And a blank must never be right.
            const blank = markQuestion(q, q.format.kind === "multi-choice" ? [] : [""]);
            if (blank.correct) {
              problems.push(`${chapter.id} (${q.template}): blank marked correct`);
            }
          }
        }
      }

      assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems, first few shown`);
    });
  }
});

describe("question hygiene across every chapter", () => {
  it("has no empty prompts, answers, solutions or takeaways", () => {
    const problems: string[] = [];

    for (const chapter of everyChapter()) {
      for (const target of [-1, 0, 1]) {
        for (let s = 0; s < 4; s++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: target,
            seed: `hygiene::${chapter.id}::${target}::${s}`,
          });
          if (!q) continue;
          if (q.prompt.trim().length < 20) problems.push(`${chapter.id}: stub prompt`);
          if (q.answer.trim().length === 0) problems.push(`${chapter.id}: empty answer`);
          if (q.solution.length === 0) problems.push(`${chapter.id}: no solution steps`);
          if (q.takeaway.trim().length === 0) problems.push(`${chapter.id}: no takeaway`);
          if (q.marks <= 0) problems.push(`${chapter.id}: marks = ${q.marks}`);
          if (/undefined|NaN|\[object/.test(q.prompt)) problems.push(`${chapter.id}: sentinel in prompt`);
          if (/undefined|NaN|\[object/.test(q.answer)) problems.push(`${chapter.id}: sentinel in answer`);
        }
      }
    }

    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
  });

  it("keeps LaTeX delimiters balanced, ignoring escaped currency", () => {
    const problems: string[] = [];

    for (const chapter of everyChapter()) {
      for (const target of [-1, 0, 1]) {
        for (let s = 0; s < 4; s++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: target,
            seed: `latex::${chapter.id}::${target}::${s}`,
          });
          if (!q) continue;
          const dollars = (q.prompt.match(/(?<!\\)\$/g) ?? []).length;
          if (dollars % 2 !== 0) {
            problems.push(`${chapter.id} (${q.template}): ${dollars} unescaped $`);
          }
        }
      }
    }

    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} unbalanced`);
  });

  it("always offers the correct answer among distinct options", () => {
    const problems: string[] = [];

    for (const chapter of everyChapter()) {
      for (const target of [-1, 0, 1]) {
        for (let s = 0; s < 4; s++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: target,
            seed: `opts::${chapter.id}::${target}::${s}`,
          });
          if (!q) continue;
          if (q.format.kind !== "single-choice" && q.format.kind !== "multi-choice") continue;

          if (q.format.options.length < 2) {
            problems.push(`${chapter.id}: only ${q.format.options.length} option(s)`);
            continue;
          }
          if (new Set(q.format.options).size !== q.format.options.length) {
            problems.push(`${chapter.id} (${q.template}): duplicate options`);
          }
          if (!q.format.options.includes(q.answer)) {
            problems.push(`${chapter.id} (${q.template}): answer missing from options`);
          }
        }
      }
    }

    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
  });

  it("keeps difficulty inside the model's band", () => {
    for (const chapter of everyChapter()) {
      for (const target of [-3, 0, 3]) {
        for (let s = 0; s < 3; s++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: target,
            seed: `diff::${chapter.id}::${target}::${s}`,
          });
          if (!q) continue;
          assert.ok(
            q.difficulty >= -3 && q.difficulty <= 3.5,
            `${chapter.id} produced difficulty ${q.difficulty}`,
          );
          assert.ok(q.tier >= 1 && q.tier <= 5, `${chapter.id} produced tier ${q.tier}`);
        }
      }
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const chapter = getChapter("em-2")!;
    const a = generateQuestion({ chapter, targetDifficulty: 0, seed: "stable" });
    const b = generateQuestion({ chapter, targetDifficulty: 0, seed: "stable" });
    assert.equal(a?.answer, b?.answer);
    assert.equal(a?.prompt, b?.prompt);

    // A different seed should not be pinned to the same template forever.
    const keys = new Set(
      Array.from({ length: 12 }, (_, i) =>
        generateQuestion({ chapter, targetDifficulty: 0, seed: `vary-${i}` })?.template,
      ),
    );
    assert.ok(keys.size > 1, "the selector always picked the same template");
  });
});

describe("the browser check covers what only a browser can show", () => {
  /*
    scripts/check-browser.ts is the only place hydration, the external store and
    the session engine are actually exercised. If someone deletes or guts it,
    those behaviours silently go unverified again, so the assertions it makes
    have to be visible here.
  */
  const src = readSource("scripts/check-browser.ts");

  it("exists and drives a real browser over the DevTools protocol", () => {
    assert.ok(src.includes("Runtime.enable"), "must attach to a CDP session");
    assert.ok(src.includes("Page.navigate"), "must navigate the page");
  });

  it("asserts hydration rather than just a 200", () => {
    assert.ok(
      src.includes("dashboard hydrates past the loading shell"),
      "must check the client-only part of the dashboard renders",
    );
    assert.ok(
      src.includes("stats profile renders after hydration"),
      "must check a second route hydrates too",
    );
  });

  it("checks that a bespoke question is served, not a recall item", () => {
    assert.ok(
      src.includes("served a specification-recall item instead of a bespoke question"),
      "must guard the client bundle actually running the generators",
    );
  });

  it("checks that answering produces marking feedback", () => {
    assert.ok(
      src.includes("no marking feedback after answering"),
      "must verify the marking path is wired in the browser",
    );
  });

  it("walks a whole session to the summary, not just one question", () => {
    assert.ok(
      src.includes("session walk") && src.includes("summary"),
      "must drive a session end to end and reach the summary",
    );
    assert.ok(
      src.includes("the summary is missing an accuracy figure"),
      "must check the summary actually reports totals",
    );
  });

  it("exercises keyboard shortcuts and the mock-test timer", () => {
    assert.ok(
      src.includes("pressKey"),
      "must send real key events rather than clicking",
    );
    assert.ok(
      src.includes("no mm:ss countdown is visible"),
      "must check the mock test timer runs",
    );
  });

  it("checks persistence survives a reload", () => {
    assert.ok(
      src.includes("after reload the stats page reports 0 attempts"),
      "must verify localStorage round-trips through a page load",
    );
  });

  it("fails on uncaught exceptions and console errors", () => {
    assert.ok(src.includes("Runtime.exceptionThrown"));
    assert.ok(src.includes("uncaught exception"));
  });
});

describe("generators are registered on the client", () => {
  /*
    A server component that imports the generators populates the registry on the
    server only. The browser then has an empty registry, the app still renders,
    and every question is a shared recall item. Nothing throws, so the only way
    to catch it is to assert the client entry point pulls the generators in.
  */
  it("is imported from a client module", () => {
    const layout = readSource("src/app/layout.tsx");
    assert.ok(
      !/import\s+"@\/lib\/generators\//.test(layout),
      "layout.tsx is a server component; generator imports there never reach the browser",
    );

    const provider = readSource("src/components/store-provider.tsx");
    assert.ok(
      provider.startsWith('"use client"'),
      "the generator imports must live in a client module",
    );
    /*
      The client entry point imports the barrel rather than the individual
      modules. The barrel exists so the list is written once: when the provider
      imported each module directly, a new generator file could be added and
      registered everywhere except in the browser, and the only symptom was that
      the app served the wrong questions.
    */
    assert.ok(
      provider.includes("@/lib/generators/all"),
      "the client entry point must import the generator barrel",
    );

    const barrel = readSource("src/lib/generators/all.ts");
    for (const subject of ["edexcel-maths", "aqa-economics", "ocr-computer-science"]) {
      assert.ok(
        barrel.includes(`@/lib/generators/${subject}`),
        `${subject} generators are not in the barrel`,
      );
    }

    // Any generator module that exists has to be reachable from the barrel.
    const modules = readdirSync("src/lib/generators")
      .filter((f) => f.startsWith("aqa-") || f.startsWith("edexcel-") || f.startsWith("ocr-"))
      .map((f) => f.replace(/\.ts$/, ""));
    for (const name of modules) {
      assert.ok(
        barrel.includes(`@/lib/generators/${name}"`),
        `${name} is not imported by the generator barrel, so it will not reach the browser`,
      );
    }
  });
});

describe("numeric answers parse", () => {
  it("never emits a numeric answer the parser cannot read", () => {
    const problems: string[] = [];

    for (const chapter of everyChapter()) {
      for (const target of [-2, 0, 2]) {
        for (let s = 0; s < 8; s++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: target,
            seed: `num::${chapter.id}::${target}::${s}`,
          });
          if (!q || q.format.kind !== "numeric") continue;
          // The marker already proved it parses, so this only guards the unit
          // suffix, which the marker strips but the parser must tolerate.
          if (q.format.unit && /[a-z]/i.test(q.answer)) {
            problems.push(`${chapter.id} (${q.template}): unit letter in answer "${q.answer}"`);
          }
        }
      }
    }

    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
  });
});

