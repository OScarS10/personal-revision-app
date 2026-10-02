import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatorsFor } from "@/lib/generators/registry";
import "@/lib/generators/all";
import { getChapter } from "@/lib/specs";
import { Rng } from "@/lib/rng";
import { difficultyToTier } from "@/lib/generators/types";
import type { Chapter } from "@/lib/types";

/**
 * The two's complement decode template has to state a bit width, print a
 * pattern of exactly that width, and land on a value that width can actually
 * hold. All three were wrong at once: the width was sized for the unsigned
 * magnitude rather than the negative, and the pattern was built by adding the
 * value to 2^bits instead of subtracting it, so every question the template
 * could produce was malformed.
 */
function chapterFor(id: string): Chapter {
  const chapter = getChapter(id);
  assert.ok(chapter, `no such chapter ${id}`);
  return chapter;
}

const chapter = chapterFor("ocr-1.4.1");
const template = generatorsFor(chapter).find((g) => g.key === "cs-two-complement-negative");

function buildAt(seed: string, targetDifficulty: number) {
  assert.ok(template, "the two's complement decode template is not registered");
  return template.build({
    rng: new Rng(seed),
    chapter,
    targetDifficulty,
    tier: difficultyToTier(targetDifficulty),
    seed,
  });
}

describe("two's complement decode template", () => {
  it("prints a pattern exactly as wide as the width it claims", () => {
    for (let i = 0; i < 500; i++) {
      const target = (i % 5) - 2;
      const q = buildAt(`tc-width::${i}`, target);

      const stated = q.prompt.match(/(\d+)-bit/);
      const printed = q.prompt.match(/([01]+)_2/);
      assert.ok(stated, `no width in prompt: ${q.prompt}`);
      assert.ok(printed, `no binary pattern in prompt: ${q.prompt}`);

      const bits = Number(stated[1]);
      assert.equal(
        printed[1].length,
        bits,
        `claims ${bits} bits but prints "${printed[1]}" (${printed[1].length} digits): ${q.prompt}`,
      );
    }
  });

  it("answers with the value that pattern actually decodes to", () => {
    for (let i = 0; i < 500; i++) {
      const target = (i % 5) - 2;
      const q = buildAt(`tc-decode::${i}`, target);

      const stated = q.prompt.match(/(\d+)-bit/);
      const printed = q.prompt.match(/([01]+)_2/);
      assert.ok(stated && printed, `unparseable prompt: ${q.prompt}`);

      const bits = Number(stated[1]);
      const pattern = printed[1];
      const unsigned = parseInt(pattern, 2);
      const decoded = pattern.startsWith("1") ? unsigned - Math.pow(2, bits) : unsigned;

      assert.equal(
        decoded,
        Number(q.answer),
        `"${pattern}" in ${bits} bits decodes to ${decoded}, not the marked answer ${q.answer}`,
      );
      assert.ok(decoded < 0, "the decode template is meant to ask about a negative value");
    }
  });

  it("only asks about values the stated width can represent", () => {
    for (let i = 0; i < 500; i++) {
      const target = (i % 5) - 2;
      const q = buildAt(`tc-range::${i}`, target);

      const stated = q.prompt.match(/(\d+)-bit/);
      assert.ok(stated, `no width in prompt: ${q.prompt}`);

      const bits = Number(stated[1]);
      const answer = Number(q.answer);
      assert.ok(
        answer >= -Math.pow(2, bits - 1) && answer <= Math.pow(2, bits - 1) - 1,
        `answer ${answer} is outside the ${bits}-bit range ` +
          `-${Math.pow(2, bits - 1)}..${Math.pow(2, bits - 1) - 1}: ${q.prompt}`,
      );
    }
  });
});