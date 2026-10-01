"use client";

import { useMemo, type ReactNode } from "react";
import katex from "katex";

/*
  Question text is authored in Markdown with inline LaTeX. Rendering it needs
  two passes:
    1. Split the raw string on $...$ / $$...$$ and hand maths to KaTeX.
    2. Run the non-maths runs through a deliberately tiny Markdown subset.

  The subset is small on purpose - headings, bold, italic, code, lists, rules
  and blockquotes - because question prompts only ever use those. Anything
  else is emitted as literal text, so no user-authored string can inject HTML.
*/

type Block =
  | { kind: "para"; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "bullet"; items: string[] }
  | { kind: "ordered"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "rule" }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "code"; language: string; lines: string[] };

/** Split a string into alternating text / maths segments. */
function splitMath(input: string): Array<{ math: boolean; value: string; display: boolean }> {
  const out: Array<{ math: boolean; value: string; display: boolean }> = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (char === "\\" && input[i + 1] === "$") {
      // Esaped literal dollar sign.
      out.push({ math: false, value: "$", display: false });
      i += 2;
      continue;
    }

    if (char === "$") {
      const display = input[i + 1] === "$";
      const open = display ? 2 : 1;
      const close = findClosing(input, i + open, display);
      if (close === -1) {
        // Unbalanced - treat the dollar as ordinary text rather than dropping
        // the rest of the question.
        out.push({ math: false, value: "$", display: false });
        i += 1;
        continue;
      }
      out.push({ math: true, value: input.slice(i + open, close), display });
      i = close + open;
      continue;
    }

    // Plain run up to the next dollar.
    const next = findNextDollar(input, i);
    out.push({ math: false, value: input.slice(i, next), display: false });
    i = next;
  }

  return out;
}

function findNextDollar(input: string, from: number): number {
  for (let i = from; i < input.length; i++) {
    if (input[i] === "\\") {
      i++;
      continue;
    }
    if (input[i] === "$") return i;
  }
  return input.length;
}

function findClosing(input: string, from: number, display: boolean): number {
  const needle = display ? "$$" : "$";
  for (let i = from; i < input.length; i++) {
    if (input[i] === "\\") {
      i++;
      continue;
    }
    if (input.startsWith(needle, i)) {
      // A single $ inside a $$...$$ block is fine, so only reject a match that
      // is really the terminator.
      return i;
    }
  }
  return -1;
}

/** Inline Markdown: bold, italic and inline code. Text is never trusted as HTML. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // Walk the string, splitting on whichever token comes next.
  const pattern = /(\*\*[^*]+\*\*)|(`[^`]+`)|(\*[^*\n]+\*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(...splitMathToInline(text.slice(cursor, match.index), `${keyPrefix}-t${key++}`));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${key++}`} className="font-semibold text-ink">
          {splitMathToInline(token.slice(2, -2), `${keyPrefix}-bt${key}`)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={`${keyPrefix}-c${key++}`} className="inline">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <em key={`${keyPrefix}-i${key++}`} className="italic text-ink-2">
          {splitMathToInline(token.slice(1, -1), `${keyPrefix}-it${key}`)}
        </em>,
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(...splitMathToInline(text.slice(cursor), `${keyPrefix}-t${key}`));
  }
  return nodes;
}

/** Render one non-maths run, turning any `$...$` inside it into KaTeX. */
function splitMathToInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = splitMath(text);
  if (parts.length === 1 && !parts[0].math) return [text];

  return parts.map((part, i) => {
    if (!part.math) return <span key={`${keyPrefix}-${i}`}>{part.value}</span>;
    if (part.display) {
      return (
        <div key={`${keyPrefix}-${i}`} className="katex-display my-2">
          <span dangerouslySetInnerHTML={{ __html: renderKatex(part.value, true) }} />
        </div>
      );
    }
    return (
      <span
        key={`${keyPrefix}-${i}`}
        className="math-inline"
        dangerouslySetInnerHTML={{ __html: renderKatex(part.value, false) }}
      />
    );
  });
}

function renderKatex(source: string, display: boolean): string {
  try {
    return katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      output: "html",
      strict: false,
      trust: false,
    });
  } catch {
    // Never let a malformed formula take down the question view.
    return escapeHtml(source);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isTableRule = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

/** Parse a block of lines into blocks. */
function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code
    if (/^```/.test(line.trim())) {
      const language = line.trim().slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test((lines[i] ?? "").trim())) {
        body.push(lines[i] ?? "");
        i++;
      }
      i++; // closing fence
      blocks.push({ kind: "code", language, lines: body });
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length,
        text: heading[2] ?? "",
      });
      i++;
      continue;
    }

    // Table: a header row followed by a rule row
    if (line.includes("|") && i + 1 < lines.length && isTableRule(lines[i + 1] ?? "")) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        rows.push(splitRow(lines[i] ?? ""));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i] ?? "")) {
        body.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", lines: body });
      continue;
    }

    // Bulleted list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "bullet", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ordered", items });
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const para: string[] = [];
    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (current.trim() === "") break;
      if (
        /^(#{1,4}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(current) ||
        /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(current)
      ) {
        break;
      }
      para.push(current);
      i++;
    }
    blocks.push({ kind: "para", text: para.join("\n") });
  }

  return blocks;
}

export interface MarkdownProps {
  children: string;
  className?: string;
  /** Slightly tighter leading for dense contexts like solution steps. */
  compact?: boolean;
}

export function Markdown({ children, className, compact }: MarkdownProps) {
  const blocks = useMemo(() => parseBlocks(children ?? ""), [children]);

  return (
    <div
      className={[
        "text-ink",
        compact ? "text-[13.5px] leading-[1.6]" : "text-[14.5px] leading-[1.65]",
        className ?? "",
      ].join(" ")}
    >
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case "heading": {
            const Tag = (`h${Math.min(4, Math.max(2, block.level))}` as unknown) as "h2";
            return (
              <Tag key={key} className="font-display text-ink mt-3 mb-1 text-[1.05em] leading-snug">
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "rule":
            return <hr key={key} className="border-rule my-3 border-t" />;
          case "bullet":
            return (
              <ul key={key} className="my-1.5 list-disc space-y-1 pl-5 marker:text-ink-3">
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
                ))}
              </ul>
            );
          case "ordered":
            return (
              <ol
                key={key}
                className="my-1.5 list-decimal space-y-1 pl-5 marker:text-ink-3 marker:font-mono marker:text-[0.9em]"
              >
                {block.items.map((item, i) => (
                  <li key={`${key}-${i}`}>{renderInline(item, `${key}-${i}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={key}
                className="border-rule-2 my-2 border-l-2 pl-3 text-ink-2 italic"
              >
                {block.lines.map((l, i) => (
                  <p key={`${key}-${i}`}>{renderInline(l, `${key}-${i}`)}</p>
                ))}
              </blockquote>
            );
          case "code":
            return (
              <pre key={key} className="code my-2">
                {block.lines.join("\n")}
              </pre>
            );
          case "table":
            return (
              <div key={key} className="my-2 overflow-x-auto">
                <table className="w-full border-collapse text-[0.95em]">
                  <thead>
                    <tr>
                      {block.header.map((cell, i) => (
                        <th
                          key={`${key}-h${i}`}
                          className="border-rule border-b px-2.5 py-1.5 text-left font-semibold"
                        >
                          {renderInline(cell, `${key}-h${i}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r${r}`}>
                        {row.map((cell, c) => (
                          <td key={`${key}-r${r}c${c}`} className="border-rule border-b px-2.5 py-1.5 align-top">
                            {renderInline(cell, `${key}-r${r}c${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return (
              <p key={key} className="my-1.5 first:mt-0 last:mb-0">
                {renderInline(block.text, key)}
              </p>
            );
        }
      })}
    </div>
  );
}

/**
 * Convenience wrapper for a single maths expression.
 *
 * Named `Katex` rather than `Math` so it does not shadow the global inside this
 * module.
 */
export function Katex({ expression, display }: { expression: string; display?: boolean }) {
  const html = useMemo(() => renderKatex(expression, display ?? false), [expression, display]);
  if (display) {
    return <div className="katex-display" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} />;
}
