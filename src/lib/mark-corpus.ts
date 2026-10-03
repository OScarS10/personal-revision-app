import type { SubjectId } from "./types";

/*
  A normalised form for externally sourced marking data.

  The point of normalising is that everything downstream - the model, the
  evaluation, the trust decision - should not have to know which board, year or
  website an item came from. It also makes provenance mandatory rather than
  optional: a record without a source and a licence cannot enter the corpus, so
  "where did this training data come from" has an answer for every row or the row
  is rejected.

  Licensed material does not belong in this repository. Exam board papers, mark
  schemes and examiner reports are copyrighted, and training on them without a
  licence is not a technical problem to be solved later. So the corpus is built
  by a script, written outside git, and only the schema and the resulting model
  are committed.
*/

export const CORPUS_VERSION = 1;

export interface CorpusProvenance {
  /** Short identifier for the source, e.g. "openassessment-ca". */
  source: string;
  url: string;
  /** ISO 8601. */
  retrievedAt: string;
  /**
   * SPDX identifier where one applies, otherwise a description.
   * "proprietary" is a valid answer, but it stops the item being used by default.
   */
  licence: string;
  /**
   * Whether the material may be committed to this repository.
   *
   * False for anything board-owned. Such data can still be ingested to train
   * locally, which is why this is separate from whether it is usable at all.
   */
  redistributable: boolean;
  board?: string;
  year?: number;
  paper?: string;
}

/** One awardable point and whether the reference answer earned it. */
export interface CorpusPoint {
  label: string;
  marks: number;
  /**
   * The label the award is attached to.
   *
   * Grading is per point type rather than per point: "did the answer define the
   * term" is a question the model can be measured on across thousands of items,
   * whereas "did it earn mark 4b of this particular question" cannot be.
   */
  awarded: boolean;
  /** Evidence a human said was present. Where absent, the model cannot use it. */
  evidence?: string[];
}

export interface CorpusItem {
  id: string;
  /** Which source this came from, matching a provenance entry. */
  source: string;
  prompt: string;
  /** An exemplar answer a human marked. The model's training signal. */
  reference: string;
  points: CorpusPoint[];
  subject?: SubjectId;
  chapterId?: string;
  /** Which command word the question used, since that changes what earns a mark. */
  command?: string;
}

export interface MarkCorpus {
  version: number;
  items: CorpusItem[];
  provenance: CorpusProvenance[];
}

/** Reasons an item or corpus can be refused, stated so the user can act on it. */
export interface CorpusProblem {
  where: string;
  problem: string;
}

export interface ValidationResult {
  corpus: MarkCorpus;
  problems: CorpusProblem[];
  /** Items dropped, with the reason. */
  rejected: CorpusProblem[];
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/**
 * Check an untrusted blob and keep only what is sound.
 *
 * Rejects rather than repairs. A corpus with a broken row in it is a corpus
 * where the model's accuracy cannot be explained, and quietly dropping the row
 * would hide that until someone wondered why the score was better than expected.
 */
export function validateCorpus(raw: unknown): ValidationResult {
  const problems: CorpusProblem[] = [];
  const rejected: CorpusProblem[] = [];

  if (typeof raw !== "object" || raw === null) {
    return {
      corpus: { version: CORPUS_VERSION, items: [], provenance: [] },
      problems: [{ where: "corpus", problem: "Not an object." }],
      rejected: [],
    };
  }

  const blob = raw as Record<string, unknown>;

  if (blob.version !== CORPUS_VERSION) {
    problems.push({
      where: "corpus.version",
      problem: `Expected ${CORPUS_VERSION}, got ${JSON.stringify(blob.version)}.`,
    });
  }

  // Provenance first: without it, items cannot be attributed and none can be used.
  const provenance: CorpusProvenance[] = [];
  const rawProv = Array.isArray(blob.provenance) ? blob.provenance : [];
  if (!Array.isArray(blob.provenance)) {
    problems.push({ where: "corpus.provenance", problem: "Missing or not an array." });
  }
  rawProv.forEach((entry, i) => {
    const at = `corpus.provenance[${i}]`;
    if (typeof entry !== "object" || entry === null) {
      problems.push({ where: at, problem: "Not an object." });
      return;
    }
    const p = entry as Record<string, unknown>;
    for (const field of ["source", "url", "retrievedAt", "licence"] as const) {
      if (!isString(p[field]) || p[field].length === 0) {
        problems.push({ where: `${at}.${field}`, problem: "Missing or empty." });
      }
    }
    if (typeof p.redistributable !== "boolean") {
      problems.push({ where: `${at}.redistributable`, problem: "Must be true or false." });
    }
    provenance.push({
      source: String(p.source ?? ""),
      url: String(p.url ?? ""),
      retrievedAt: String(p.retrievedAt ?? ""),
      licence: String(p.licence ?? ""),
      redistributable: p.redistributable === true,
      board: isString(p.board) ? p.board : undefined,
      year: typeof p.year === "number" ? p.year : undefined,
      paper: isString(p.paper) ? p.paper : undefined,
    });
  });

  const sources = new Set(provenance.map((p) => p.source));
  const items: CorpusItem[] = [];
  const rawItems = Array.isArray(blob.items) ? blob.items : [];
  if (!Array.isArray(blob.items)) {
    problems.push({ where: "corpus.items", problem: "Missing or not an array." });
  }

  rawItems.forEach((entry, i) => {
    const at = `corpus.items[${i}]`;
    if (typeof entry !== "object" || entry === null) {
      rejected.push({ where: at, problem: "Not an object." });
      return;
    }
    const it = entry as Record<string, unknown>;

    if (!isString(it.id) || it.id.length === 0) {
      rejected.push({ where: `${at}.id`, problem: "Missing or empty id." });
      return;
    }
    if (!isString(it.source) || !sources.has(it.source)) {
      rejected.push({
        where: `${at}.source`,
        problem: `"${String(it.source)}" is not in provenance, so the item cannot be attributed.`,
      });
      return;
    }
    if (!isString(it.prompt) || it.prompt.trim().length === 0) {
      rejected.push({ where: `${at}.prompt`, problem: "Missing or empty prompt." });
      return;
    }
    if (!isString(it.reference) || it.reference.trim().length === 0) {
      rejected.push({
        where: `${at}.reference`,
        problem: "Missing or empty reference answer; there would be nothing to learn from.",
      });
      return;
    }
    if (!Array.isArray(it.points) || it.points.length === 0) {
      rejected.push({ where: `${at}.points`, problem: "No points to learn from." });
      return;
    }

    const points: CorpusPoint[] = [];
    let ok = true;
    it.points.forEach((pt, j) => {
      const pAt = `${at}.points[${j}]`;
      if (typeof pt !== "object" || pt === null) {
        rejected.push({ where: pAt, problem: "Not an object." });
        ok = false;
        return;
      }
      const p = pt as Record<string, unknown>;
      if (!isString(p.label) || p.label.length === 0) {
        rejected.push({ where: `${pAt}.label`, problem: "Missing or empty label." });
        ok = false;
        return;
      }
      if (typeof p.awarded !== "boolean") {
        rejected.push({ where: `${pAt}.awarded`, problem: "Must be true or false." });
        ok = false;
        return;
      }
      const marks = typeof p.marks === "number" && p.marks > 0 ? p.marks : 1;
      points.push({
        label: p.label,
        marks,
        awarded: p.awarded,
        evidence: Array.isArray(p.evidence) ? p.evidence.filter(isString) : undefined,
      });
    });
    if (!ok) return;

    items.push({
      id: it.id,
      source: it.source,
      prompt: it.prompt,
      reference: it.reference,
      points,
      subject: isString(it.subject) ? (it.subject as SubjectId) : undefined,
      chapterId: isString(it.chapterId) ? it.chapterId : undefined,
      command: isString(it.command) ? it.command : undefined,
    });
  });

  return { corpus: { version: CORPUS_VERSION, items, provenance }, problems, rejected };
}

/**
 * Whether a corpus may be committed to this repository.
 *
 * Separate from validity on purpose. A corpus can be perfectly well formed and
 * still be board-owned, and committing it would be the mistake rather than
 * building it.
 */
export function mayCommit(corpus: MarkCorpus): { ok: boolean; offenders: string[] } {
  const offenders = corpus.provenance.filter((p) => !p.redistributable).map((p) => p.source);
  return { ok: offenders.length === 0, offenders: [...new Set(offenders)] };
}

/** How much data there is to learn from, and whether it is worth trying. */
export function corpusStats(corpus: MarkCorpus): {
  items: number;
  points: number;
  awarded: number;
  byLabel: Array<{ label: string; total: number; awarded: number }>;
} {
  const labels = new Map<string, { total: number; awarded: number }>();
  let points = 0;
  let awarded = 0;
  for (const item of corpus.items) {
    for (const p of item.points) {
      points++;
      if (p.awarded) awarded++;
      const entry = labels.get(p.label) ?? { total: 0, awarded: 0 };
      entry.total++;
      if (p.awarded) entry.awarded++;
      labels.set(p.label, entry);
    }
  }
  return {
    items: corpus.items.length,
    points,
    awarded,
    byLabel: [...labels.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.total - a.total),
  };
}