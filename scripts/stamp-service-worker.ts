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
 *
 * Supports both static export (out/) and standalone (.next/standalone/) modes.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const PLACEHOLDER = "__BUILD_ID__";

function collect(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collect(full, found);
    else if (entry.endsWith(".html")) found.push(full);
  }
  return found;
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

const standaloneDir = ".next/standalone";
const staticOutDir = "out";

let targetDir: string;
let pages: string[];

if (existsSync(staticOutDir)) {
  targetDir = staticOutDir;
  pages = collect(staticOutDir).sort();
} else if (existsSync(standaloneDir)) {
  targetDir = standaloneDir;
  const standalonePublic = join(standaloneDir, "public");
  if (!existsSync(standalonePublic)) {
    copyDir("public", standalonePublic);
  }
  pages = collect(standaloneDir).filter((p) => p.includes(".next/server/app") && p.endsWith(".html")).sort();
  if (pages.length === 0) {
    pages = collect(standaloneDir).filter((p) => p.endsWith(".html")).sort();
  }
} else {
  console.error("stamp-service-worker: no output directory found (out/ or .next/standalone/); run `next build` first");
  process.exit(1);
}

if (pages.length === 0) {
  console.error(`stamp-service-worker: no HTML pages found in ${targetDir}`);
  process.exit(1);
}

const hash = createHash("sha256");
for (const page of pages) {
  hash.update(relative(targetDir, page).replace(/\\/g, "/"));
  hash.update(readFileSync(page));
}
const buildId = hash.digest("hex").slice(0, 12);

const workerPath = existsSync(join(targetDir, "sw.js"))
  ? join(targetDir, "sw.js")
  : join(targetDir, "public", "sw.js");
if (!existsSync(workerPath)) {
  console.error(`stamp-service-worker: sw.js not found in ${targetDir}`);
  process.exit(1);
}

const worker = readFileSync(workerPath, "utf8");
if (!worker.includes(PLACEHOLDER)) {
  console.error(
    `stamp-service-worker: no ${PLACEHOLDER} placeholder in ${workerPath}, so the cache name cannot be versioned`,
  );
  process.exit(1);
}

writeFileSync(workerPath, worker.split(PLACEHOLDER).join(buildId));
console.log(`stamp-service-worker: cache specwise-${buildId} over ${pages.length} pages`);
