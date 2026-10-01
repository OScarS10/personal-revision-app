/**
 * Source-level lint for generator files: find template literals whose rendered
 * text would contain an odd number of `$` delimiters, i.e. unbalanced inline
 * math that would render badly.
 *
 * Works at template-literal granularity so multi-line templates are handled.
 */
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "src/lib/generators/edexcel-maths.ts";
const source = readFileSync(file, "utf8");

/** Map a character offset to a 1-based line number. */
const lineAt = (offset: number) => source.slice(0, offset).split(/\r?\n/).length;

let problems = 0;
let inTemplate = false;
let segmentStart = 0;
let buffer = "";
let escaped = false;

for (let i = 0; i < source.length; i++) {
  const ch = source[i];
  if (!inTemplate) {
    if (ch === "`") {
      inTemplate = true;
      segmentStart = i + 1;
      buffer = "";
      escaped = false;
    }
    continue;
  }
  // Inside a template literal.
  if (escaped) {
    escaped = false;
    continue;
  }
  if (ch === "\\") {
    escaped = true;
    continue;
  }
  if (ch === "`") {
    inTemplate = false;
    const rendered = buffer.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, "0");
    const dollars = (rendered.match(/\$/g) ?? []).length;
    if (dollars % 2 !== 0) {
      const snippet = buffer.replace(/\s+/g, " ").trim().slice(0, 110);
      console.log(`${String(lineAt(segmentStart)).padStart(5)}: ${snippet}`);
      problems++;
    }
    continue;
  }
  if (ch === "$" && source[i + 1] === "{") {
    // Skip the whole interpolation, including nested braces.
    let depth = 1;
    i += 2;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    i--;
    buffer += "0";
    continue;
  }
  buffer += ch;
}

console.log(`\n${problems} template literals with an odd number of $ delimiters.`);
