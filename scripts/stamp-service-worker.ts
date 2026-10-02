/**
 * Stamp a build id into the exported service worker.
 *
 * Runs after `next build` because that is the only point at which the exported
 * shell is known to be complete.
 *
 * The id is a hash of the exported HTML rather than a timestamp, so rebuilding
 * without changing anything keeps the same cache and does not needlessly discard
 * a learner's offline copy. A real content change produces a new id, a new cache
 * name, and the old cache is deleted on activation.
 *
 * The source worker in public/ is left untouched on purpose. It carries a
 * placeholder so that a worker served without this step still behaves correctly
 * rather than shipping a literal `__BUILD_ID__` cache name.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const OUT = "out";
const PLACEHOLDER = "__BUILD_ID__";

function collect(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, found);
    else if (entry.endsWith(".html")) found.push(full);
  }
  return found;
}

const pages = collect(OUT).sort();
if (pages.length === 0) {
  console.error("stamp-service-worker: no exported HTML found in out/; run `next build` first");
  process.exit(1);
}

const hash = createHash("sha256");
for (const page of pages) {
  // Prefixing with the path keeps two identical pages from collapsing.
  hash.update(relative(OUT, page).replace(/\\/g, "/"));
  hash.update(readFileSync(page));
}
const buildId = hash.digest("hex").slice(0, 12);

const workerPath = join(OUT, "sw.js");
const worker = readFileSync(workerPath, "utf8");
if (!worker.includes(PLACEHOLDER)) {
  console.error(
    `stamp-service-worker: no ${PLACEHOLDER} placeholder in out/sw.js, so the cache name cannot be versioned`,
  );
  process.exit(1);
}

writeFileSync(workerPath, worker.split(PLACEHOLDER).join(buildId));
console.log(`stamp-service-worker: cache specwise-${buildId} over ${pages.length} pages`);
