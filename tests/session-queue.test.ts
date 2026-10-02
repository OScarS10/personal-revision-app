import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planSession, restrictQueue } from "@/lib/session";
import { computeInsights } from "@/lib/analytics";
import { createInitialState } from "@/lib/store";
import { getChapters } from "@/lib/specs";
import { generatorsFor } from "@/lib/generators/registry";
import "@/lib/generators/all";
import { Rng } from "@/lib/rng";
import type { Chapter, SubjectId } from "@/lib/types";

/**
 * A session's chapter queue is planned once and frozen so it does not reshuffle
 * while the learner works through it. The reported symptom was a queue planned
 * while sixteen chapters were enabled still serving 1.4.1 after the selection
 * had been narrowed to a single chapter, because nothing re-derived the plan.
 *
 * These tests pin the two halves of that: the frozen plan legitimately spans
 * the full original selection, and restricting it afterwards is what removes the
 * chapters that are no longer enabled.
 */
const cs: SubjectId = "ocr-computer-science";
const chapters: Chapter[] = getChapters(cs);
const state = createInitialState();

function plan(enabledIds: string[], length: number) {
  const insights = computeInsights({
    chapters,
    skills: state.skills,
    enabledIds: new Set(enabledIds),
    config: state.config,
  });
  return planSession({
    chapters,
    enabledIds,
    insights,
    state,
    mode: "practice",
    length,
    rng: (() => {
      const r = new Rng("queue::plan");
      return () => r.next();
    })(),
  }).queue;
}

describe("restrictQueue", () => {
  it("drops chapters that are no longer enabled", () => {
    const queue = ["ocr-1.1.1", "ocr-1.4.1", "ocr-1.2.1"];
    assert.deepEqual(restrictQueue(queue, ["ocr-1.1.1"]), ["ocr-1.1.1"]);
  });

  it("keeps the planned order rather than reshuffling", () => {
    const queue = ["c", "a", "d", "b", "e"];
    assert.deepEqual(restrictQueue(queue, ["a", "b", "c", "d", "e"]), queue);
    assert.deepEqual(restrictQueue(queue, ["e", "c", "a"]), ["c", "a", "e"]);
  });

  it("returns empty rather than the original queue when nothing is enabled", () => {
    assert.deepEqual(restrictQueue(["ocr-1.1.1", "ocr-1.4.1"], []), []);
    assert.deepEqual(restrictQueue(["ocr-1.1.1"], ["ocr-9.9.9"]), []);
  });

  it("never returns a chapter outside the enabled set", () => {
    const queue = plan(state.enabled[cs] ?? [], 20);
    const only = ["ocr-1.1.1"];
    const live = restrictQueue(queue, only);
    for (const id of live) {
      assert.ok(only.includes(id), `${id} is not enabled but survived restriction`);
    }
  });
});

describe("a narrowed selection cannot leak a chapter into the session", () => {
  it("reproduces the reported case: planned wide, served narrow", () => {
    // The fresh-profile default spans many chapters, 1.4.1 among them.
    const defaults = state.enabled[cs] ?? [];
    assert.ok(
      defaults.includes("ocr-1.4.1"),
      "precondition: the default selection includes 1.4.1",
    );

    const queue = plan(defaults, 20);
    assert.ok(
      queue.includes("ocr-1.4.1"),
      "precondition: the frozen plan really did queue 1.4.1",
    );

    // The learner then narrows to a single chapter, as in the report.
    const live = restrictQueue(queue, ["ocr-1.1.1"]);
    assert.ok(!live.includes("ocr-1.4.1"), "1.4.1 survived a selection that excludes it");
    assert.ok(live.length > 0, "the narrowed session should still have something to serve");
    assert.ok(
      live.every((id) => id === "ocr-1.1.1"),
      `served chapters leaked: ${live.join(",")}`,
    );
  });

  it("cannot serve a chapter that has no generator for it", () => {
    // Belt and braces: whatever survives restriction must be able to produce a
    // question, so the served chapter can never be a bare id with nothing behind it.
    const live = restrictQueue(plan(state.enabled[cs] ?? [], 20), ["ocr-1.1.1", "ocr-1.4.1"]);
    for (const id of live) {
      const chapter = chapters.find((c) => c.id === id);
      assert.ok(chapter, `unknown chapter ${id}`);
      assert.ok(generatorsFor(chapter).length > 0, `${id} has no generators`);
    }
  });
});