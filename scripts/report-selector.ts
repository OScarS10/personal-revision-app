import { generateQuestion } from "@/lib/generators/registry";
import "@/lib/generators/all";
import { SUBJECT_ORDER, getChapters } from "@/lib/specs";

/*
  Selector balance report.

  The generator selector scores candidates by distance from the target
  difficulty. That is the right instinct, but it can quietly bury the bespoke
  generators: if the recall templates happen to sit nearer the target, a learner
  asking for practice gets specification-recall questions forever. This prints
  the actual mix so the balance is visible rather than assumed.
*/


const TARGETS = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
const SEEDS = 8;

let bespokeTotal = 0;
let recallTotal = 0;

console.log("subject          chapter    bespoke%  recall%");
console.log("-".repeat(48));

for (const subject of SUBJECT_ORDER) {
  for (const chapter of getChapters(subject)) {
    let bespoke = 0;
    let total = 0;
    for (const target of TARGETS) {
      for (let s = 0; s < SEEDS; s++) {
        const q = generateQuestion({
          chapter,
          targetDifficulty: target,
          seed: `mix::${chapter.id}::${target}::${s}`,
        });
        if (!q) continue;
        total++;
        if (!q.template.startsWith("knowledge-")) bespoke++;
      }
    }
    bespokeTotal += bespoke;
    recallTotal += total - bespoke;
    const pctBespoke = total > 0 ? Math.round((bespoke / total) * 100) : 0;
    // A chapter with no generators produces nothing at all. Reporting that as
    // "0% bespoke" reads as a failure of the selector rather than a gap in the
    // authored content, which is what it actually is.
    if (total === 0) {
      console.log(
        `${subject.padEnd(15)} ${chapter.id.padEnd(9)} ${"none".padStart(8)}  ${"no content yet".padStart(12)}`,
      );
      continue;
    }
    const flag = pctBespoke < 50 ? "  <-- mostly knowledge" : "";
    console.log(
      `${subject.padEnd(15)} ${chapter.id.padEnd(9)} ${String(pctBespoke).padStart(7)}% ${String(
        100 - pctBespoke,
      ).padStart(7)}%${flag}`,
    );
  }
}

const grand = bespokeTotal + recallTotal;
console.log("-".repeat(48));
console.log(
  `overall: ${bespokeTotal} bespoke, ${recallTotal} recall ` +
    `(${Math.round((bespokeTotal / Math.max(1, grand)) * 100)}% bespoke)`,
);

