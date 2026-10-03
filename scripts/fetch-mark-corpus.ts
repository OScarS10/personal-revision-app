import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CORPUS_VERSION, type CorpusItem, type CorpusProvenance, validateCorpus } from "../src/lib/mark-corpus";

/*
  Build the marking corpus from external sources.

  Two things this script is careful about.

  First, licences. Exam board papers, mark schemes and examiner reports are
  copyrighted, and none of them may be committed here. So the corpus is written
  to .cache/, which is ignored, and the script refuses to claim an item is
  redistributable unless the source manifest said so. Training on a board's
  material without a licence is a licensing question, not a technical one, and
  the honest engineering answer is to keep the data out of the repository and let
  whoever holds the rights decide.

  Second, honesty about what got parsed. A scraper that cannot read a page
  returns nothing, and returning nothing quietly is how you end up training on
  four items and reporting 99% accuracy. Every source here has to declare a
  parser, an unparseable response is an error rather than an empty result, and
  the item count is printed before and after validation.

  Usage: npx tsx scripts/fetch-mark-corpus.ts [--offline]
*/

const ROOT = resolve(import.meta.dirname, "..");
const MANIFEST = join(ROOT, "corpus", "sources.json");
const OUT = join(ROOT, ".cache", "corpus", "corpus.json");

type SourceKind = "json-array" | "local-file";

interface SourceSpec {
  source: string;
  kind: SourceKind;
  url: string;
  licence: string;
  redistributable: boolean;
  board?: string;
  year?: number;
  paper?: string;
  /**
   * Path inside each record to the fields. Kept configurable so a new feed does
   * not need a new script.
   */
  fields?: { prompt: string; reference: string; points: string };
}

function readManifest(): SourceSpec[] {
  if (!existsSync(MANIFEST)) {
    throw new Error(
      `No manifest at ${MANIFEST}. Copy corpus/sources.example.json and list the sources you have the rights to use.`,
    );
  }
  const raw = JSON.parse(readFileSync(MANIFEST, "utf8")) as unknown;
  if (!Array.isArray(raw)) throw new Error("corpus/sources.json must be an array of sources.");
  return raw as SourceSpec[];
}

function at(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc !== "object" || acc === null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

interface RawRecord {
  id?: unknown;
  prompt: unknown;
  reference: unknown;
  points: unknown;
}

/**
 * Read a source's records.
 *
 * Kept separate from fetching so the parse can be tested against a file without a
 * network call, and so a source that changed shape fails in the parser rather
 * than half way through a write.
 */
export function parseRecords(body: unknown, spec: SourceSpec): RawRecord[] {
  const fields = spec.fields ?? { prompt: "prompt", reference: "reference", points: "points" };
  const rows = Array.isArray(body)
    ? body
    : typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).items)
      ? ((body as Record<string, unknown>).items as unknown[])
      : null;
  if (!rows) {
    throw new Error(
      `Source "${spec.source}" did not return an array or an object with an "items" array. Refusing to guess at the shape.`,
    );
  }
  return rows.map((row, i) => {
    if (typeof row !== "object" || row === null) {
      throw new Error(`Source "${spec.source}" record ${i} is not an object.`);
    }
    const r = row as Record<string, unknown>;
    return {
      id: r.id,
      prompt: at(r, fields.prompt),
      reference: at(r, fields.reference),
      points: at(r, fields.points),
    };
  });
}

async function fetchSource(spec: SourceSpec, offline: boolean): Promise<unknown> {
  if (spec.kind === "local-file") {
    const path = spec.url.startsWith("file:") ? spec.url.slice("file:".length) : spec.url;
    const full = resolve(ROOT, path);
    if (!existsSync(full)) throw new Error(`Source "${spec.source}": no such file at ${full}`);
    return JSON.parse(readFileSync(full, "utf8"));
  }
  if (offline) throw new Error(`Source "${spec.source}" needs the network; rerun without --offline.`);

  const res = await fetch(spec.url, {
    headers: { accept: "application/json", "user-agent": "specwise-corpus/1.0" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Source "${spec.source}": HTTP ${res.status} from ${spec.url}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Source "${spec.source}" did not return JSON. An HTML page needs a parser written for it deliberately, not a generic guess.`,
    );
  }
}

function buildItem(
  spec: SourceSpec,
  record: RawRecord,
  index: number,
): CorpusItem {
  const points = Array.isArray(record.points)
    ? (record.points as Array<Record<string, unknown>>).map((p) => ({
        label: String(p.label ?? ""),
        marks: typeof p.marks === "number" ? p.marks : 1,
        awarded: p.awarded === true,
        evidence: Array.isArray(p.evidence) ? (p.evidence as string[]) : undefined,
      }))
    : [];
  return {
    id: typeof record.id === "string" ? record.id : `${spec.source}-${index}`,
    source: spec.source,
    prompt: String(record.prompt ?? ""),
    reference: String(record.reference ?? ""),
    points,
  };
}

async function main(): Promise<void> {
  const offline = process.argv.includes("--offline");
  const specs = readManifest();

  if (specs.length === 0) {
    console.log("corpus/sources.json lists no sources, so there is nothing to fetch.");
    console.log("That is a valid state: the model simply has no data to train on.");
    return;
  }

  const provenance: CorpusProvenance[] = [];
  const items: CorpusItem[] = [];

  for (const spec of specs) {
    let body: unknown;
    try {
      body = await fetchSource(spec, offline);
    } catch (error) {
      // One bad source stops the run. A partial corpus that looks complete is worse
      // than no corpus, because the model report would describe data that is not there.
      console.error(`FAILED ${spec.source}: ${(error as Error).message}`);
      process.exitCode = 1;
      return;
    }

    const records = parseRecords(body, spec);
    if (records.length === 0) {
      console.error(`FAILED ${spec.source}: parsed zero records.`);
      process.exitCode = 1;
      return;
    }
    const added = records.map((r, i) => buildItem(spec, r, i));
    items.push(...added);
    provenance.push({
      source: spec.source,
      url: spec.url,
      retrievedAt: new Date().toISOString(),
      licence: spec.licence,
      redistributable: spec.redistributable === true,
      board: spec.board,
      year: spec.year,
      paper: spec.paper,
    });
    console.log(`ok ${spec.source}: ${added.length} records`);
  }

  const { corpus, problems, rejected } = validateCorpus({ version: CORPUS_VERSION, items, provenance });

  console.log(`\nparsed ${items.length} records across ${provenance.length} sources`);
  console.log(`kept ${corpus.items.length}, rejected ${rejected.length}`);
  for (const p of problems) console.log(`  problem: ${p.where}: ${p.problem}`);
  for (const r of rejected.slice(0, 10)) console.log(`  rejected: ${r.where}: ${r.problem}`);
  if (rejected.length > 10) console.log(`  ... and ${rejected.length - 10} more`);

  const restricted = corpus.provenance.filter((p) => !p.redistributable);
  if (restricted.length > 0) {
    console.log(
      `\nNote: ${restricted.map((p) => p.source).join(", ")} are marked non-redistributable. The corpus stays in .cache and is not committed.`,
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  console.log(`\nwrote ${OUT}`);
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});