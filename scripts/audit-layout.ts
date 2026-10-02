/**
 * Layout audit of the built site.
 *
 * Screenshots are not reviewable as text, so the useful question is measurable:
 * does anything overflow, is any text under a legible size or contrast, are tap
 * targets big enough, and is line length sane. This walks the rendered DOM and
 * reports concrete numbers with the selector that produced them.
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
const PATHS = (process.env.SHOT_PATHS ?? "/stats/").split(",");

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

/**
 * Minimum legible body size and target size.
 *
 * WCAG 2.2 asks for 24x24 CSS px on pointer targets (2.5.8, minimum) and treats
 * text below 18.66px bold / 24px regular as needing 1.4.5 contrast. Body text
 * here is far smaller than that, so it has to clear 4.5:1 to be legible at all.
 */
const MIN_TAP = 24;
const MIN_BODY_PX = 12;
const MIN_CONTRAST = 4.5;
const MAX_LINE_PX = 1100;

interface DebugTarget {
  webSocketDebuggerUrl: string;
  type: string;
  url: string;
}

interface Finding {
  kind: string;
  detail: string;
  count: number;
}

class Cdp {
  private ws!: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { resolve(v: unknown): void; reject(r: string): void }>();

  static async connect(wsUrl: string): Promise<Cdp> {
    const cdp = new Cdp();
    await new Promise<void>((resolve, reject) => {
      cdp.ws = new WebSocket(wsUrl);
      cdp.ws.addEventListener("open", () => resolve(), { once: true });
      cdp.ws.addEventListener("error", () => reject("websocket failed"), { once: true });
    });
    cdp.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (typeof msg.id !== "number") return;
      const e = cdp.pending.get(msg.id);
      cdp.pending.delete(msg.id);
      if (!e) return;
      if (msg.error) e.reject(msg.error.message);
      else e.resolve(msg.result);
    });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    return cdp;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(`${method} timed out`);
      }, 30_000);
    });
  }

  async goto(path: string): Promise<void> {
    await this.send("Page.navigate", { url: `${BASE}${path}` });
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const res = (await this.eval("document.readyState === 'complete' && document.body.innerText.length > 200"));
      if (res === true) {
        await new Promise((r) => setTimeout(r, 500));
        return;
      }
    }
  }

  async eval<T>(expression: string): Promise<T> {
    const res = (await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as {
      result?: { value?: T; description?: string };
      exceptionDetails?: { text?: string; exception?: { description?: string } };
    };
    if (res.exceptionDetails) {
      throw new Error(
        `page script failed: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`,
      );
    }
    return res.result?.value as T;
  }

  async setViewport(width: number, height: number): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
  }

  /**
   * The theme follows prefers-color-scheme until a choice is stored, so the
   * dark pass has to emulate the media feature, not just paint it.
   */
  async setColorScheme(dark: boolean): Promise<void> {
    await this.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }],
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Already closed.
    }
  }
}

/**
 * Run inside the page: measure layout, contrast and tap targets.
 *
 * A plain template literal, not String.raw, because the thresholds below are
 * interpolated into the page script and String.raw passes ${...} through as
 * literal text, which is a syntax error in the browser.
 */
const AUDIT = `(() => {
  const MIN_BODY_PX = ${MIN_BODY_PX};
  const MIN_CONTRAST = ${MIN_CONTRAST};
  const MAX_LINE_PX = ${MAX_LINE_PX};
  const vw = document.documentElement.clientWidth;
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = (s) => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const ratio = (fg, bg) => { const a = lum(fg), b = lum(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

  function bgOf(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0.85)) return c.slice(0, 3);
      n = n.parentElement;
    }
    return [255, 255, 255];
  }

  const describe = (el) => el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');

  const sel = 'p, span, li, td, th, label, h1, h2, h3, h4, h5, h6, a, button, div, dd, dt';
  const small = [], lowContrast = [], smallTargets = [], wide = [], overflow = [];

  for (const el of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const text = (el.textContent || '').trim();
    const hasDirectText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length);

    if (hasDirectText && text.length > 1) {
      const size = parseFloat(cs.fontSize);
      if (size < MIN_BODY_PX) small.push({ el: describe(el), size, text: text.slice(0, 40) });
      const fg = parse(cs.color);
      if (fg) {
        const c = ratio(fg.slice(0, 3), bgOf(el));
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        const need = large ? 3 : MIN_CONTRAST;
        if (c < need) lowContrast.push({ el: describe(el), ratio: Math.round(c * 100) / 100, need, size });
      }
      /*
        Measure the widest rendered line, not the element box. A block-level
        eyebrow spans the whole 1120px container but only ever inks one short
        word, and flagging it as an over-long line is pure noise.
      */
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects()).filter((x) => x.width > 0);
      const longest = rects.reduce((m, x) => Math.max(m, x.width), 0);
      range.detach?.();
      if (longest > MAX_LINE_PX) wide.push({ el: describe(el), width: Math.round(longest) });
    }

    if (el.matches('button, a, [role=button], input, select, summary')) {
      if ((r.width < ${MIN_TAP} || r.height < ${MIN_TAP}) && !el.closest('[hidden]')) {
        smallTargets.push({ el: describe(el), w: Math.round(r.width), h: Math.round(r.height), text: text.slice(0, 24) });
      }
    }

    const over = Math.round(r.right - vw);
    if (over > 1) overflow.push({ el: describe(el), over });
  }

  const doc = document.documentElement;
  return {
    scrollW: doc.scrollWidth, clientW: doc.clientWidth,
    bg: getComputedStyle(document.body).backgroundColor,
    small: small.slice(0, 12), lowContrast: lowContrast.slice(0, 12),
    smallTargets: smallTargets.slice(0, 12), wide: wide.slice(0, 8), overflow: overflow.slice(0, 12),
  };
})()`;

interface Audit {
  scrollW: number;
  clientW: number;
  bg: string;
  small: Array<{ el: string; size: number; text: string }>;
  lowContrast: Array<{ el: string; ratio: number; need: number; size: number }>;
  smallTargets: Array<{ el: string; w: number; h: number; text: string }>;
  wide: Array<{ el: string; width: number }>;
  overflow: Array<{ el: string; over: number }>;
}

async function main(): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), "specwise-audit-"));
  const args = [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--disable-extensions", `--user-data-dir=${profile}`,
    "--remote-debugging-port=9355", "about:blank",
  ];
  let edge: ChildProcess | null = null;
  let cdp: Cdp | null = null;

  try {
    edge = spawn(EDGE, args, { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 2500));
    const targets = await (async (): Promise<DebugTarget[]> => {
      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch("http://127.0.0.1:9355/json/list");
          if (res.ok) return (await res.json()) as DebugTarget[];
        } catch {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      throw new Error("devtools unreachable");
    })();
    const t = targets.find((x) => x.type === "page" && !x.url.startsWith("edge://")) ?? targets[0];
    if (!t) throw new Error("no target");
    cdp = await Cdp.connect(t.webSocketDebuggerUrl);

    const dark = process.env.SHOT_DARK === "1";
    if (dark) await cdp.setColorScheme(true);

    for (const path of PATHS) {
      for (const vp of VIEWPORTS) {
        await cdp.setViewport(vp.width, vp.height);
        await cdp.goto(path);
        const a = (await cdp.eval<Audit>(AUDIT))!;

        const findings: Finding[] = [];
        if (a.scrollW > a.clientW + 1) {
          findings.push({ kind: "h-scroll", detail: `document scrolls sideways: ${a.scrollW} > ${a.clientW}`, count: a.overflow.length });
        }
        for (const o of a.overflow) findings.push({ kind: "overflow", detail: `${o.el} overflows by ${o.over}px`, count: 1 });
        for (const s of a.small) findings.push({ kind: "tiny-text", detail: `${s.el} at ${s.size}px: "${s.text}"`, count: 1 });
        for (const l of a.lowContrast) findings.push({ kind: "contrast", detail: `${l.el} ${l.ratio}:1 (needs ${l.need}) at ${l.size}px`, count: 1 });
        for (const t of a.smallTargets) findings.push({ kind: "tap", detail: `${t.el} is ${t.w}x${t.h}px "${t.text}"`, count: 1 });
        for (const w of a.wide) findings.push({ kind: "line-length", detail: `${w.el} is ${w.width}px wide`, count: 1 });

        console.log(`\n=== ${path} @ ${vp.name} (${vp.width}px)${dark ? " dark" : ""} bg=${a.bg} ===`);
        if (!findings.length) console.log("  no findings");
        else for (const f of findings) console.log(`  [${f.kind}] ${f.detail}`);
      }
    }
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