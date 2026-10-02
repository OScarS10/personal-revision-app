/**
 * Capture screenshots of the built site, so layout can be looked at rather than
 * inferred from the markup.
 *
 * Shares the DevTools approach in check-browser.ts and adds no dependency:
 * Node's built-in WebSocket drives Edge directly.
 *
 * Requires a production server already listening on BASE (default :3000), the
 * same as the browser check.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EDGE =
  process.env.EDGE ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OUT = process.env.SHOT_DIR ?? join(process.cwd(), "screenshots");

interface DebugTarget {
  webSocketDebuggerUrl: string;
  url: string;
  type: string;
}

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, scale: 2 },
  { name: "tablet", width: 768, height: 1024, scale: 2 },
  { name: "desktop", width: 1440, height: 900, scale: 1 },
];

class Cdp {
  private ws!: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve(value: unknown): void; reject(reason: string): void }
  >();

  static async connect(wsUrl: string): Promise<Cdp> {
    const cdp = new Cdp();
    await new Promise<void>((resolve, reject) => {
      cdp.ws = new WebSocket(wsUrl);
      cdp.ws.addEventListener("open", () => resolve(), { once: true });
      cdp.ws.addEventListener("error", () => reject("websocket failed"), { once: true });
    });
    cdp.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (typeof msg.id !== "number") return;
      const entry = cdp.pending.get(msg.id);
      cdp.pending.delete(msg.id);
      if (!entry) return;
      if (msg.error) entry.reject(msg.error.message);
      else entry.resolve(msg.result);
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
    // Poll for the client-only content rather than trusting a fixed delay: a
    // screenshot of the loading shell would be a misleading thing to review.
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const res = (await this.send("Runtime.evaluate", {
        expression:
          "document.readyState === 'complete' && !!document.querySelector('main') && document.body.innerText.length > 200",
        returnByValue: true,
      })) as { result?: { value?: boolean } };
      if (res.result?.value) {
        await new Promise((r) => setTimeout(r, 400));
        return;
      }
    }
  }

  async setViewport(width: number, height: number, scale: number): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: width < 700,
    });
  }

  async screenshot(fullPage: boolean): Promise<string> {
    const res = (await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    })) as { data: string };
    return res.data;
  }

  /**
   * Elements wider than the viewport are the usual cause of a sideways scroll on
   * a phone, and they are invisible in a full-page screenshot because the image
   * is as wide as the document. Measured rather than eyeballed.
   */
  async overflow(): Promise<Array<{ tag: string; cls: string; over: number }>> {
    const res = (await this.send("Runtime.evaluate", {
      expression: `(() => {
        const w = document.documentElement.clientWidth;
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          const over = Math.round(r.right - w);
          if (over > 1) out.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 70), over });
        }
        return out.slice(0, 12);
      })()`,
      returnByValue: true,
    })) as { result?: { value?: Array<{ tag: string; cls: string; over: number }> } };
    return res.result?.value ?? [];
  }

  /** Fonts and images that have not finished loading distort a screenshot. */
  async settle(): Promise<void> {
    await this.send("Runtime.evaluate", {
      expression:
        "Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))])",
      awaitPromise: true,
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

const PATHS = (process.env.SHOT_PATHS ?? "/stats/,/plan/,/practice/,/").split(",");

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "specwise-shot-"));
  const edgeArgs = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    "--hide-scrollbars",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=9344",
    "about:blank",
  ];

  let edge: ChildProcess | null = null;
  let cdp: Cdp | null = null;

  try {
    edge = spawn(EDGE, edgeArgs, { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 2500));

    const targets = await (async (): Promise<DebugTarget[]> => {
      let lastError = "";
      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch("http://127.0.0.1:9344/json/list");
          if (res.ok) return (await res.json()) as DebugTarget[];
        } catch (e) {
          lastError = String(e);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`devtools endpoint unreachable: ${lastError}`);
    })();

    const target =
      targets.find((t) => t.type === "page" && !t.url.startsWith("edge://")) ??
      targets.find((t) => t.type === "page") ??
      targets[0];
    if (!target) throw new Error("no debuggable target");
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);

    for (const path of PATHS) {
      const slug = path === "/" ? "home" : path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      for (const vp of VIEWPORTS) {
        await cdp.setViewport(vp.width, vp.height, vp.scale);
        await cdp.goto(path);
        await cdp.settle();

        const name = `${slug}-${vp.name}.png`;
        writeFileSync(join(OUT, name), Buffer.from(await cdp.screenshot(true), "base64"));

        const over = await cdp.overflow();
        console.log(`${name}  ${vp.width}x${vp.height}`);
        for (const o of over) {
          console.log(`    overflows by ${o.over}px: <${o.tag}> ${o.cls}`);
        }
      }
    }

    // Dark mode, since the toggle exists and a screenshot is the only way to see
    // whether the palette actually holds up.
    await cdp.setViewport(1440, 900, 1);
    for (const path of PATHS) {
      const slug = path === "/" ? "home" : path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
      await cdp.goto(path);
      await cdp.settle();
      await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const raw = localStorage.getItem('specwise.state.v1');
          const s = raw ? JSON.parse(raw) : {};
          s.theme = 'dark';
          localStorage.setItem('specwise.state.v1', JSON.stringify(s));
          document.documentElement.classList.add('dark');
          return true;
        })()`,
      });
      await new Promise((r) => setTimeout(r, 500));
      writeFileSync(join(OUT, `${slug}-dark.png`), Buffer.from(await cdp.screenshot(true), "base64"));
      console.log(`${slug}-dark.png`);
    }

    console.log(`\nscreenshots written to ${OUT}`);
  } finally {
    cdp?.close();
    edge?.kill();
    // Wait for the browser to actually exit, otherwise its lock files are still
    // open and removing the profile fails with EPERM.
    await new Promise((r) => setTimeout(r, 1500));
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});