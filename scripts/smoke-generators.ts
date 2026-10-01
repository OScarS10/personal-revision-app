import { clearRegistry, generatorsFor, hasBespokeGenerators } from "@/lib/generators/registry";
import "@/lib/generators/all";
import { generateQuestion } from "@/lib/generators/registry";
import { SUBJECTS, SUBJECT_ORDER, getChapters } from "@/lib/specs";
import { markQuestion } from "@/lib/marking";
import { parseNumeric, normaliseAnswer } from "@/lib/math-utils";

/*
  Generator smoke test across every subject.

  The point is not that a question can be produced, it is that a question can be
  produced AND marked. A generator that emits a bad answer is worse than no
  generator at all, because the learner is marked wrong for a question nobody
  could have answered.
*/


const PER_CHAPTER = 20;

interface Failure {
  chapterId: string;
  seed: string;
  reason: string;
}

const failures: Failure[] = [];
let generated = 0;
let bespokeChapters = 0;
let bespokeQuestions = 0;
const gaps: string[] = [];

/** Every way a generated question can be unusable. */
function checkQuestion(
  chapterId: string,
  seed: string,
  q: NonNullable<ReturnType<typeof generateQuestion>>,
): void {
  const fail = (reason: string) => failures.push({ chapterId, seed, reason });

  if (!q.prompt || q.prompt.trim().length < 10) fail("empty or trivial prompt");
  if (!q.answer || q.answer.trim().length === 0) fail("empty answer");
  if (q.answer === "undefined" || q.answer === "NaN" || q.answer.includes("NaN")) {
    fail(`answer is ${q.answer}`);
  }
  if (q.marks <= 0) fail(`non-positive marks ${q.marks}`);
  if (!Number.isFinite(q.difficulty)) fail(`difficulty is ${q.difficulty}`);
  if (![1, 2, 3, 4, 5].includes(q.tier)) fail(`bad tier ${q.tier}`);
  if (q.solution.length === 0) fail("no worked solution");
  if (!q.takeaway || q.takeaway.trim().length === 0) fail("no takeaway");

  // An answer that the marker cannot parse is a broken question, not a wrong one.
  if (q.format.kind === "numeric") {
    const parsed = parseNumeric(q.answer);
    if (parsed === null) fail(`numeric answer did not parse: ${q.answer}`);
  }

  /*
    A machine-marked item's own answer must always mark as correct. This catches
    the nastiest class of bug, where a generator emits an answer its own marker
    then rejects.

    An extended answer is different by design: the score comes from the points
    the learner claims, not from the stored answer, so the meaningful check is
    that a full set of ticks reaches full marks and that a single tick scores
    less than a full set.
  */
  if (q.format.kind === "extended") {
    const scheme = q.format.scheme;
    const all = scheme.points.map((_, i) => String(i));
    const none = markQuestion(q, [""]);
    if (none.correct) fail("extended answer with nothing ticked marked correct");
    if (none.awardedMarks > 0) fail(`extended answer with nothing ticked scored ${none.awardedMarks}`);

    const full = markQuestion(q, ["a full answer", ...all]);
    if (Math.abs(full.awardedMarks - scheme.totalMarks) > 0.01) {
      fail(
        `ticking every point gave ${full.awardedMarks} of ${scheme.totalMarks}`,
      );
    }

    const one = markQuestion(q, ["a short answer", "0"]);
    if (one.awardedMarks >= full.awardedMarks) {
      fail("one ticked point scored as much as ticking every point");
    }
    if (!one.selfAssessed) fail("extended answer was not flagged as self-assessed");
  } else {
    const result = markQuestion(q, [q.answer]);
    if (!result.correct) {
      fail(`correct answer marked wrong (feedback: ${result.feedback.slice(0, 60)})`);
    }

    // A blank response must never be marked correct.
    const blank = markQuestion(q, q.format.kind === "multi-choice" ? [] : [""]);
    if (blank.correct) fail("blank response marked correct");
  }

  // Options must be distinct, or the learner cannot identify the answer.
  if (q.format.kind === "single-choice" || q.format.kind === "multi-choice") {
    if (q.format.options.length < 2) fail("fewer than two options");
    if (new Set(q.format.options.map((o) => normaliseAnswer(o))).size !== q.format.options.length) {
      fail("duplicate options");
    }
    if (!q.format.options.some((o) => normaliseAnswer(o) === normaliseAnswer(q.answer))) {
      fail("correct answer is not among the options");
    }
  }

  // LaTeX must be balanced or KaTeX will throw at render time. Escaped dollars
  // (\$) are literal currency symbols, so they do not open a math block.
  const dollars = (q.prompt.match(/(?<!\\)\$/g) ?? []).length;
  if (dollars % 2 !== 0) fail(`prompt has ${dollars} unescaped $ delimiters`);
  if (/undefined|NaN|\[object Object\]/.test(q.prompt)) fail("prompt leaks a sentinel");
}

console.log("subject          chapter   bespoke  questions");
console.log("-".repeat(52));

for (const subject of SUBJECT_ORDER) {
  const chapters = getChapters(subject);
  let subjectQuestions = 0;

  for (const chapter of chapters) {
    const before = failures.length;
    const bespoke = hasBespokeGenerators(chapter.id);
    const authored = Boolean(chapter.knowledge);
    if (bespoke) bespokeChapters++;
    let produced = 0;

    for (let i = 0; i < PER_CHAPTER; i++) {
      // Vary the target difficulty so the selector exercises every tier.
      const targets = [-2, -1, -0.5, 0, 0.5, 1, 2];
      const target = targets[i % targets.length]!;
      const seed = `smoke::${chapter.id}::${i}`;

      const q = generateQuestion({ chapter, targetDifficulty: target, seed });
      if (!q) continue;
      generated++;
      produced++;
      subjectQuestions++;
      if (bespoke) bespokeQuestions++;
      checkQuestion(chapter.id, seed, q);
    }

    if (produced === 0) {
      // A chapter with neither a bespoke generator nor authored content produces
      // nothing, and that is a visible gap rather than a failure. It is collected
      // and reported below rather than counted as a bad question.
      gaps.push(chapter.id);
      console.log(
        `${subject.padEnd(15)} ${chapter.id.padEnd(9)} ${"none".padEnd(8)} ${String(0).padStart(9)}  no content yet`,
      );
      continue;
    }

    const added = failures.length - before;
    const source = bespoke ? "bespoke" : "knowledge";
    console.log(
      `${subject.padEnd(15)} ${chapter.id.padEnd(9)} ${source.padEnd(8)} ${String(produced).padStart(9)}  ${
        added === 0 ? "ok" : `FAIL ${added}`
      }${authored ? "" : "  (no notes)"}`,
    );
  }

  console.log(
    `${"-".repeat(52)}\n${SUBJECTS[subject].shortName}: ${subjectQuestions} questions over ${chapters.length} chapters\n`,
  );
}

// Every chapter with either bespoke generators or authored notes must produce
// questions. Chapters with neither are a known gap, listed rather than hidden.
const uncovered: string[] = [];
for (const subject of SUBJECT_ORDER) {
  for (const chapter of getChapters(subject)) {
    if (generatorsFor(chapter).length === 0) uncovered.push(chapter.id);
  }
}
const allChapters = SUBJECT_ORDER.reduce((n, s) => n + getChapters(s).length, 0);

console.log(`total: ${generated} questions across ${SUBJECT_ORDER.length} subjects`);
console.log(`bespoke: ${bespokeChapters} chapters, ${bespokeQuestions} questions`);
console.log(`chapters with no content at all: ${uncovered.length} of ${allChapters}`);

if (uncovered.length > 0) {
  console.log(`  ${uncovered.join(", ")}`);
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failures:`);
  const grouped = new Map<string, number>();
  for (const f of failures) {
    const key = `${f.chapterId}: ${f.reason}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}  (x${count})`);
  }
  clearRegistry();
  process.exit(1);
}

clearRegistry();
console.log("ok");

