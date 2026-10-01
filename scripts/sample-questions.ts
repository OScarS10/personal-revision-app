import { generateQuestion, generatorsFor, hasBespokeGenerators } from "@/lib/generators/registry";
import { assemble, difficultyToTier } from "@/lib/generators/types";
import { Rng } from "@/lib/rng";
import "@/lib/generators/all";
import { SUBJECT_ORDER, getChapters } from "@/lib/specs";
import { markQuestion } from "@/lib/marking";

/*
  Human-readable question sampler.

  Reads a chapter id and an optional index, then prints a question with its
  answer, solution and takeaway. Used to eyeball whether a question reads like
  something an examiner would actually ask.

  Usage:
    npm run samples -- em-2
    npm run samples -- econ-4.1.5 3
    npm run samples -- --subject aqa-economics
*/


const args = process.argv.slice(2);
const subjectFlag = args.indexOf("--subject");
const subjectId = subjectFlag >= 0 ? args[subjectFlag + 1] : undefined;

// The subject value sits at subjectFlag + 1 only when the flag was actually
// passed; otherwise that expression is 0 and would swallow the chapter id.
const subjectValueIndex = subjectFlag >= 0 ? subjectFlag + 1 : -1;
const positional = args.filter(
  (a, i) => !a.startsWith("--") && i !== subjectFlag && i !== subjectValueIndex,
);

const chapterId = positional[0];

let pool = subjectId
  ? getChapters(subjectId as never)
  : SUBJECT_ORDER.flatMap((s) => getChapters(s));

if (chapterId) {
  const only = pool.filter((c) => c.id === chapterId);
  if (only.length === 0) {
    console.error(`No chapter matching "${chapterId}".`);
    console.error(`Known ids include: ${pool.slice(0, 8).map((c) => c.id).join(", ")}, ...`);
    process.exit(1);
  }
  pool = only;
} else if (subjectId) {
  // A subject was named, so stay inside it.
  pool = getChapters(subjectId as never);
}

// Without a specific chapter, show a spread of chapters rather than the first
// few, so one pass samples the whole subject instead of clustering on Topic 1.
const chapters =
  chapterId || pool.length <= 6
    ? pool
    : Array.from({ length: 6 }, (_, i) => pool[Math.floor((i * pool.length) / 6)]!).filter(
        (c, i, all) => all.findIndex((x) => x.id === c.id) === i,
      );

// The count is the argument after the chapter id, so positional[1]. Reading
// index 2 instead meant "npm run samples -- econ-4.1.9 7" silently produced one.
const count = Number(positional[1] ?? chapters.length);

console.log(
  `Showing ${count} sample${count === 1 ? "" : "s"} from ${chapterId ?? `${chapters.length} chapters`}.\n`,
);

/*
  When a single chapter is named, walk its templates as well as its difficulty.

  Sampling by difficulty alone repeatedly picks whichever template the selector
  rates closest to that target, so seven samples of one chapter came back as
  seven of the same item. That made the tool useless for reviewing new content.
*/
for (let i = 0; i < count; i++) {
  const chapter = chapters[i % chapters.length];
  if (!chapter) break;

  // Vary difficulty so the samples are not all tier 3.
  const target = [-1.5, -0.5, 0, 0.5, 1.5, 2][i % 6]!;
  const seed = `sample::${chapter.id}::${i}`;

  /*
    Named a single chapter, walk the templates. The selector picks whatever sits
    closest to the target difficulty, so sampling by difficulty alone returned
    the same template seven times and the sampler could not be used to review
    what had just been written. Assembling directly bypasses the selector, which
    is the point: this is a review tool, not a session.
  */
  const chapterGenerators = generatorsFor(chapter);
  const q =
    chapterGenerators.length > 1 && chapterId
      ? (() => {
          const gen = chapterGenerators[i % chapterGenerators.length]!;
          const rng = new Rng(seed);
          return assemble(chapter, gen, {
            rng,
            chapter,
            targetDifficulty: gen.base,
            tier: difficultyToTier(gen.base),
            seed,
          });
        })()
      : generateQuestion({ chapter, targetDifficulty: target, seed });

  if (!q) {
    console.log(`[${chapter.id}] no question produced\n`);
    continue;
  }

  const check = markQuestion(q, [q.answer]);

  console.log("=".repeat(72));
  console.log(
    `${chapter.subject}  ${chapter.specRef} ${chapter.title}` +
      `${hasBespokeGenerators(chapter.id) ? "" : "  (recall only)"}`,
  );
  console.log(`template: ${q.template}   tier ${q.tier}   difficulty ${q.difficulty.toFixed(2)}   ${q.marks} mark(s)`);
  console.log("-".repeat(72));
  console.log(q.prompt);
  if (q.context) console.log(`\ncontext: ${q.context}`);
  console.log(`\nanswer: ${q.answer}`);
  console.log(`format: ${q.format.kind}`);
  if (q.format.kind === "single-choice" || q.format.kind === "multi-choice") {
    console.log(`options: ${q.format.options.join("  |  ")}`);
  }
  console.log(`\nsolution:`);
  for (const [n, s] of q.solution.entries()) {
    console.log(`  ${n + 1}. ${s.label}: ${s.work}${s.result ? ` -> ${s.result}` : ""}`);
  }
  console.log(`\ntakeaway: ${q.takeaway}`);
  console.log(`\nself-mark the published answer: ${check.correct ? "correct" : "INCORRECT"}`);
  console.log();
}

