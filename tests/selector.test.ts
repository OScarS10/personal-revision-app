import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateQuestion, generatorsFor } from "@/lib/generators/registry";
import "@/lib/generators/all";
import { SUBJECT_ORDER, getChapters } from "@/lib/specs";

/*
  Selector balance.

  Recall questions exist so no chapter is a dead end, but they are the fallback.
  If they quietly become the majority, a learner who chose "practice" gets
  specification trivia instead of worked questions, and nothing errors to tell
  us. These tests pin the mix so the balance is a property of the code rather
  than something you have to notice by sampling output.
*/


const TARGETS = [-2, -1, -0.5, 0, 0.5, 1, 2];
const SEEDS = 8;

/**
 * Fraction of generated questions that are not knowledge-recall.
 *
 * Returns 1 for a chapter that produces nothing, because a chapter with no
 * authored content is not a chapter that has fallen back to trivia.
 */
function bespokeRate(chapterId: string): number {
  let bespoke = 0;
  let total = 0;
  for (const chapter of SUBJECT_ORDER.flatMap((s) => getChapters(s))) {
    if (chapter.id !== chapterId) continue;
    if (generatorsFor(chapter).length === 0) return 1;
    for (const target of TARGETS) {
      for (let s = 0; s < SEEDS; s++) {
        const q = generateQuestion({
          chapter,
          targetDifficulty: target,
          seed: `balance::${chapter.id}::${target}::${s}`,
        });
        if (!q) continue;
        total++;
        if (!q.template.startsWith("knowledge-")) bespoke++;
      }
    }
  }
  return total === 0 ? 0 : bespoke / total;
}

describe("generator selector prefers bespoke questions", () => {
  it("serves bespoke questions in proportion to how many exist", () => {
    // A chapter with eight bespoke templates should mostly serve those. A chapter
    // with two cannot, however much the selector prefers them, so the bar has to
    // scale with the pool or the test just measures authoring effort.
    const weak = SUBJECT_ORDER.flatMap((s) => getChapters(s))
      .map((c) => {
        const bespoke = generatorsFor(c).filter((g) => !g.key.startsWith("knowledge-")).length;
        return { id: c.id, bespoke, rate: bespokeRate(c.id) };
      })
      .filter(({ bespoke, rate }) => {
        // With one bespoke template a 50% mix is the best achievable, since the
        // knowledge templates would otherwise dominate the candidate window.
        const floor = bespoke <= 1 ? 0.2 : bespoke <= 2 ? 0.3 : 0.4;
        return rate < floor;
      })
      .map((x) => `${x.id} (${x.bespoke} bespoke, ${Math.round(x.rate * 100)}%)`);

    assert.deepEqual(
      weak,
      [],
      "these chapters are mostly knowledge questions, so practice degenerates into recall",
    );
  });

  it("keeps knowledge questions reachable when bespoke templates run out", () => {
    // Knowledge questions are the fallback for chapters with no bespoke
    // generator, so they must still be selectable once the bespoke set is spent.
    const chapter = getChapters("aqa-economics").find((c) => c.id === "econ-4.1.3")!;
    const bespoke = generatorsFor(chapter)
      .filter((g) => !g.key.startsWith("knowledge-"))
      .map((g) => g.key);
    assert.ok(bespoke.length > 0, "expected bespoke templates on 4.1.3");

    const templates = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = generateQuestion({
        chapter,
        targetDifficulty: 0,
        seed: `fb::${i}`,
        avoidKeys: [...bespoke],
      });
      if (q) templates.add(q.template);
    }
    assert.ok(templates.size >= 1, "nothing at all was selectable");
    assert.ok(
      [...templates].some((t) => t.startsWith("knowledge-")),
      "knowledge questions should take over once every bespoke template has been used",
    );
  });

  it("gives a broad spread of templates across a session", () => {
    // A real session passes the templates it has already used, so variety has to
    // be measured that way rather than by reseeding cold every time.
    for (const subject of SUBJECT_ORDER) {
      for (const chapter of getChapters(subject)) {
        // Chapters with no authored content produce nothing, so there is no
        // variety to assert. Only check the ones that can actually be practised.
        if (generatorsFor(chapter).length === 0) continue;

        const recent: string[] = [];
        for (let i = 0; i < 12; i++) {
          const q = generateQuestion({
            chapter,
            targetDifficulty: (i % 5) - 2,
            seed: `spread::${chapter.id}::${i}`,
            avoidKeys: [...recent],
          });
          if (!q) continue;
          recent.push(q.template);
          if (recent.length > 8) recent.shift();
        }
        assert.ok(recent.length > 0, `${chapter.id} produced nothing despite having generators`);
        assert.ok(
          new Set(recent).size >= 2,
          `${chapter.id} repeated a single template across a whole session`,
        );
      }
    }
  });
});

