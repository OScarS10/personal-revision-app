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

const nextAppDir = ".next/server/app";
const nextBuildIdFile = ".next/BUILD_ID";
const standaloneDir = ".next/standalone";
const staticOutDir = "out";
const sourceWorker = "public/sw.source.js";

let targetDir: string;
let useBuildIdFile = false;
let workerPath: string;
let pages: string[];

if (existsSync(staticOutDir)) {
  targetDir = staticOutDir;
  workerPath = join(staticOutDir, "sw.js");
  pages = collect(staticOutDir).sort();
} else if (existsSync(standaloneDir)) {
  targetDir = standaloneDir;
  const standalonePublic = join(standaloneDir, "public");
  if (!existsSync(standalonePublic)) {
    copyDir("public", standalonePublic);
  }
  workerPath = join(standalonePublic, "sw.js");
  pages = collect(standaloneDir).filter((p) => p.includes(".next/server/app") && p.endsWith(".html")).sort();
  if (pages.length === 0) {
    pages = collect(standaloneDir).filter((p) => p.endsWith(".html")).sort();
  }
} else if (existsSync(nextBuildIdFile) || existsSync(nextAppDir)) {
  /*
    The default `next build` output, and the only mode Vercel uses. This was
    missing, so on Vercel the build failed here with "no output directory found" -
    the script knew about static export and standalone but not about a normal
    build.

    The stamped copy has to land in `public/`, because that is the directory
    Vercel uploads for this mode, and the worker is registered at `/sw.js`. That
    makes it a generated file rather than a committed one, hence `sw.source.js`
    as the tracked template and `public/sw.js` in .gitignore. The template stays
    untouched, so a build leaves no diff behind.

    Note there may be no HTML files here at all: a local build emits one per
    prerendered route, but Vercel's build produced none and this step failed on
    `pages.length === 0`. The build id does not come from the pages below, which
    is why that check moved.
  */
  targetDir = existsSync(nextAppDir) ? nextAppDir : ".next";
  useBuildIdFile = true;
  workerPath = "public/sw.js";
  pages = collect(targetDir).filter((p) => p.endsWith(".html")).sort();
} else {
  console.error(
    "stamp-service-worker: no output directory found (out/, .next/standalone/ or .next/); run `next build` first",
  );
  process.exit(1);
}

/*
  The cache name only has to change when the build changes. Next already mints a
  fresh `.next/BUILD_ID` for exactly that purpose, so prefer it: it is available
  in every build mode, including Vercel's, where no HTML is emitted. Hashing the
  rendered pages is the fallback for static export and standalone.
*/
let buildId: string;
if (useBuildIdFile && existsSync(nextBuildIdFile)) {
  buildId = readFileSync(nextBuildIdFile, "utf8").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12);
  if (buildId.length === 0) {
    console.error(`stamp-service-worker: ${nextBuildIdFile} is empty`);
    process.exit(1);
  }
} else if (pages.length > 0) {
  const hash = createHash("sha256");
  for (const page of pages) {
    hash.update(relative(targetDir, page).replace(/\\/g, "/"));
    hash.update(readFileSync(page));
  }
  buildId = hash.digest("hex").slice(0, 12);
} else {
  console.error(`stamp-service-worker: nothing to derive a build id from in ${targetDir}`);
  process.exit(1);
}

const worker = readFileSync(sourceWorker, "utf8");
if (!worker.includes(PLACEHOLDER)) {
  console.error(
    `stamp-service-worker: no ${PLACEHOLDER} placeholder in ${sourceWorker}, so the cache name cannot be versioned`,
  );
  process.exit(1);
}

writeFileSync(workerPath, worker.split(PLACEHOLDER).join(buildId));
console.log(`stamp-service-worker: cache specwise-${buildId} for ${targetDir}`);
