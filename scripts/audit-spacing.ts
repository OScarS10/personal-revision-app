/**
 * Spacing audit.
 *
 * "Looks cramped" is not a number, so measure the things that produce that
 * feeling: the gap between stacked blocks, padding inside containers, line
 * height on running text, and the gap between list items. Reports the observed
 * value against a target for each, so the fix is driven by the layout that
 * actually shipped rather than by what the stylesheet intended.
 *
 * Shares the DevTools approach in check-browser.ts and adds no dependency.
 * Requires a production server already listening on BASE (default :3000).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EDGE =
  process.env.EDGE ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PATHS = (
  process.env.SHOT_PATHS ?? "/stats/,/,/plan/,/practice/,/review/,/notebook/,/chapters/,/test/"
).split(",");

/**
 * Targets, in CSS px.
 *
 * The gaps are the minimums at which a run of blocks stops reading as a single
 * undifferentiated mass. Reading measure is 1.5 for running text and 1.65 for
 * the note prose, which is already slightly tighter than the app's own 1.6.
 */
const TARGETS = `
  const TARGET = {
    sectionGap: 32,
    panelPad: 20,
    listGap: 8,
    bodyLeading: 1.5,
    cardGap: 16,
  };
`;

const AUDIT = `(() => {
  ${TARGETS}
  const px = (v) => Math.round(v);
  const out = { sectionGaps: [], panelPad: [], listGaps: [], leadings: [], cards: [] };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0;
  };

  const describe = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';
    return tag + cls;
  };

  // 1. Gap between vertically stacked siblings: the rhythm of the whole page.
  for (const el of document.querySelectorAll('main *')) {
    if (!visible(el)) continue;
    const kids = [...el.children].filter(visible);
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i].getBoundingClientRect();
      const b = kids[i + 1].getBoundingClientRect();
      if (b.top < a.bottom - 1) continue;           // overlapping, not stacked
      const stacked = Math.abs(a.left - b.left) < 4; // vertically stacked, not side by side
      if (!stacked) continue;
      const gap = px(b.top - a.bottom);
      if (gap < 40 && gap > 0) out.sectionGaps.push({ gap, parent: describe(el), a: describe(kids[i]), b: describe(kids[i + 1]) });
    }
  }

  // 2. Padding inside panels and cards.
  for (const el of document.querySelectorAll('.panel, .panel-inset, .option, article')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const pt = parseFloat(cs.paddingTop);
    const pb = parseFloat(cs.paddingBottom);
    if (Number.isFinite(pt)) out.panelPad.push({ pad: px(Math.min(pt, pb)), el: describe(el) });
  }

  // 3. Padding inside interactive controls.
  for (const el of document.querySelectorAll('.btn, .field, .option')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    out.cards.push({ pad: px(parseFloat(cs.paddingTop)), el: describe(el) });
  }

  // 4. Gap between rows of a list or stack.
  for (const el of document.querySelectorAll('ul, ol, [role=list]')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const kids = [...el.children].filter(visible);
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i].getBoundingClientRect();
      const b = kids[i + 1].getBoundingClientRect();
      if (b.top < a.bottom - 1) continue;
      out.listGaps.push({ gap: px(b.top - a.bottom), el: describe(el) });
    }
    if (cs.rowGap !== 'normal') out.listGaps.push({ gap: px(parseFloat(cs.rowGap)), el: describe(el) + ' [row-gap]' });
  }

  // 5. Line height on running text.
  for (const el of document.querySelectorAll('p, li, dd, .prose-note')) {
    if (!visible(el)) continue;
    const text = (el.textContent || '').trim();
    if (text.length < 40) continue;                 // needs to actually wrap
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight);
    if (!Number.isFinite(lh)) continue;
    const size = parseFloat(cs.fontSize);
    out.leadings.push({ ratio: Math.round((lh / size) * 100) / 100, size: px(size), el: describe(el) });
  }

  const summarise = (rows, key) => {
    const counts = new Map();
    for (const r of rows) counts.set(r[key], (counts.get(r[key]) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([v, n]) => ({ v, n }));
  };

  return {
    sectionGaps: summarise(out.sectionGaps, 'gap'),
    panelPad: summarise(out.panelPad, 'pad'),
    cards: summarise(out.cards, 'pad'),
    listGaps: summarise(out.listGaps, 'gap'),
    leadings: summarise(out.leadings, 'ratio'),
    target: TARGET,
    counts: {
      sectionGaps: out.sectionGaps.length, panelPad: out.panelPad.length,
      cards: out.cards.length, listGaps: out.listGaps.length, leadings: out.leadings.length,
    },
  };
})()`;

interface Cdp {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
  goto(path: string): Promise<void>;
  eval<T>(expression: string): Promise<T>;
  close(): void;
}

async function connect(wsUrl: string): Promise<Cdp> {
  const cdp = {
    nextId: 1,
    pending: new Map<number, (v: unknown) => void>(),
  } as Cdp & { nextId: number; pending: Map<number, (v: unknown) => void>; ws?: WebSocket };
  await new Promise<void>((resolve, reject) => {
    cdp.ws = new WebSocket(wsUrl);
    cdp.ws.addEventListener("open", () => resolve(), { once: true });
    cdp.ws.addEventListener("error", () => reject("websocket failed"), { once: true });
  });
  cdp.ws!.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
    if (typeof msg.id !== "number") return;
    const resolve = cdp.pending.get(msg.id);
    cdp.pending.delete(msg.id);
    resolve?.(msg.result);
  });
  cdp.send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = cdp.nextId++;
      cdp.pending.set(id, resolve);
      cdp.ws!.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (cdp.pending.delete(id)) resolve(undefined);
      }, 30_000);
    });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  cdp.eval = async <T,>(expression: string): Promise<T> => {
    const res = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value as T;
  };
  cdp.goto = async (path: string) => {
    await cdp.send("Page.navigate", { url: `${BASE}${path}` });
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if ((await cdp.eval("document.readyState === 'complete' && document.body.innerText.length > 200")) === true) {
        await new Promise((r) => setTimeout(r, 500));
        return;
      }
    }
  };
  cdp.close = () => cdp.ws?.close();
  return cdp;
}

async function main(): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), "specwise-space-"));
  let edge: ChildProcess | null = null;
  let cdp: Cdp | null = null;
  try {
    edge = spawn(
      EDGE,
      [
        "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
        "--disable-extensions", `--user-data-dir=${profile}`,
        "--remote-debugging-port=9356", "about:blank",
      ],
      { stdio: "ignore" },
    );
    await new Promise((r) => setTimeout(r, 2500));

    let targets: Array<{ type: string; url: string; webSocketDebuggerUrl: string }> = [];
    for (let i = 0; i < 40 && !targets.length; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9356/json/list");
        if (res.ok) targets = (await res.json()) as typeof targets;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const target = targets.find((t) => t.type === "page" && !t.url.startsWith("edge://")) ?? targets[0];
    if (!target) throw new Error("no devtools target");
    cdp = await connect(target.webSocketDebuggerUrl);

    const merged = {
      sectionGaps: new Map<number, number>(),
      panelPad: new Map<number, number>(),
      cards: new Map<number, number>(),
      listGaps: new Map<number, number>(),
      leadings: new Map<number, number>(),
      target: null as unknown,
    };

    for (const path of PATHS) {
      await cdp.goto(path);
      const a = await cdp.eval<any>(AUDIT);
      if (!a) continue;
      merged.target = a.target;
      for (const k of Object.keys(merged) as Array<keyof typeof merged>) {
        if (k === "target") continue;
        for (const row of a[k] as Array<{ v: number; n: number }>) {
          (merged[k] as Map<number, number>).set(row.v, ((merged[k] as Map<number, number>).get(row.v) ?? 0) + row.n);
        }
      }
      console.log(`  ${path}  gaps:${a.counts.sectionGaps} panels:${a.counts.panelPad} lists:${a.counts.listGaps} text:${a.counts.leadings}`);
    }

    const fmt = (m: Map<number, number>) =>
      [...m.entries()].sort((x, y) => x[0] - y[0]).map(([v, n]) => `${v}px x${n}`).join("  ");

    console.log(`\n=== observed across ${PATHS.length} pages (targets ${JSON.stringify(merged.target)}) ===`);
    console.log(`section gaps : ${fmt(merged.sectionGaps as Map<number, number>)}`);
    console.log(`panel pad    : ${fmt(merged.panelPad as Map<number, number>)}`);
    console.log(`control pad  : ${fmt(merged.cards as Map<number, number>)}`);
    console.log(`list gaps    : ${fmt(merged.listGaps as Map<number, number>)}`);
    console.log(`line height  : ${fmt(merged.leadings as Map<number, number>)}`);
  } finally {
    cdp?.close();
    edge?.kill();
    await new Promise((r) => setTimeout(r, 1500));
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});