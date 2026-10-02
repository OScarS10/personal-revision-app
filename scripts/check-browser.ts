/*
  Headless browser check.

  Everything else in this project is verified against server-rendered HTML or the
  pure modules, but the app's real behaviour is client-side: hydration, the
  external store, the session engine, keyboard shortcuts. None of that exists in
  a curl response, so this drives an actual browser.

  Uses the DevTools protocol over Node's built-in WebSocket, so there is no
  Playwright or Puppeteer dependency to install or keep current.

  Requires a production server already listening on BASE (default :3000).
*/

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EDGE =
  process.env.EDGE ??
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

interface Failure {
  step: string;
  reason: string;
}

/** One entry from the DevTools /json/list endpoint. */
interface DebugTarget {
  webSocketDebuggerUrl: string;
  url: string;
  type: string;
}

/** Virtual key codes, so CDP dispatches the key the browser recognises. */
function keyCode(key: string): number {
  const map: Record<string, number> = {
    Enter: 13,
    Escape: 27,
    "?": 191,
    "1": 49,
    "2": 50,
    "3": 51,
    "4": 52,
    "5": 53,
    "6": 54,
  };
  return map[key] ?? 0;
}

const failures: Failure[] = [];
const fail = (step: string, reason: string) => failures.push({ step, reason });

/** Minimal CDP client over the built-in WebSocket. */
class Cdp {
  private ws!: WebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve(value: unknown): void; reject(reason: string): void }
  >();
  readonly consoleErrors: string[] = [];
  readonly pageErrors: string[] = [];

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
        method?: string;
        params?: Record<string, unknown>;
      };

      if (typeof msg.id === "number") {
        const entry = cdp.pending.get(msg.id);
        cdp.pending.delete(msg.id);
        if (!entry) return;
        if (msg.error) entry.reject(msg.error.message);
        else entry.resolve(msg.result);
        return;
      }

      if (msg.method === "Runtime.consoleAPICalled") {
        const type = msg.params?.type;
        const text = (msg.params?.args as Array<{ value?: unknown; description?: string }> | undefined)
          ?.map((a) => String(a.value ?? a.description ?? ""))
          .join(" ");
        if (type === "error") cdp.consoleErrors.push(text ?? "console.error");
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params?.exceptionDetails as
          | { text?: string; exception?: { description?: string } }
          | undefined;
        cdp.pageErrors.push(d?.exception?.description ?? d?.text ?? "exception");
      }
    });

    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    return cdp;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(`${method} timed out`);
        }
      }, 30_000);
    });
  }

  /**
   * Evaluate an expression in the page and return its JSON value.
   *
   * innerText reflects CSS text-transform, so a label styled uppercase comes back
   * uppercase. Helpers here match case-insensitively for that reason.
   */
  async eval<T>(expression: string): Promise<T> {
    const res = (await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: T }; exceptionDetails?: { text?: string } };
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text ?? "eval threw");
    return res.result?.value as T;
  }

  /** Read the page's visible text, lowercased for case-insensitive matching. */
  async text(): Promise<string> {
    return (await this.eval<string>("document.body ? document.body.innerText : ''")).toLowerCase();
  }

  /** Wait for some text to appear anywhere on the page. */
  async waitForText(needle: string, label: string, timeoutMs = 20_000): Promise<boolean> {
    return this.waitFor(
      `document.body.innerText.toLowerCase().includes(${JSON.stringify(needle.toLowerCase())})`,
      label,
      timeoutMs,
    );
  }

  /** Wait until an expression becomes truthy, polling in the page. */
  async waitFor(expression: string, label: string, timeoutMs = 20_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.eval<boolean>(`!!(${expression})`)) return true;
      } catch {
        // Page may be mid-navigation; keep polling.
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    fail("waitFor", `${label}: never became true`);
    return false;
  }

  async goto(path: string): Promise<void> {
    await this.send("Page.navigate", { url: `${BASE}${path}` });
    await new Promise((r) => setTimeout(r, 400));
  }

  /** Click the first element whose trimmed text matches. */
  async clickByText(selector: string, text: string): Promise<boolean> {
    const script = `(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const el = els.find(e => (e.textContent || '').trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}));
      if (!el) return false;
      el.scrollIntoView();
      el.click();
      return true;
    })()`;
    return this.eval<boolean>(script);
  }

  /**
   * Dispatch a real key press via CDP, so the page's own keydown listener runs
   * exactly as it would for a person typing.
   */
  async pressKey(key: string, code?: string): Promise<void> {
    const base = { key, code: code ?? key, windowsVirtualKeyCode: keyCode(key) };
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  /**
   * Classify what is on screen, distinguishing a live question from the setup
   * form.
   *
   * Scoping matters here: the chapter filter is also an input.field, so a naive
   * querySelector picks up the search box and the check types its answer into
   * the chapter filter instead of a question.
   */
  async questionKind(): Promise<"choice" | "typed" | "setup" | "summary" | "none"> {
    return this.eval<"choice" | "typed" | "setup" | "summary" | "none">(`(() => {
      const text = document.body.innerText;
      if (text.includes('Session complete')) return 'summary';
      const onSetup = /Start \\d+ questions|Start paper/.test(text);
      if (document.querySelector('.option')) return onSetup ? 'setup' : 'choice';
      const field = document.querySelector(
        'textarea, input.field:not([type=search]), input.math-input, input:not([type=checkbox]):not([type=radio]):not([type=search])',
      );
      if (field) return onSetup ? 'setup' : 'typed';
      return onSetup ? 'setup' : 'none';
    })()`);
  }

  /** Wait until a live question is on screen, and report which kind. */
  async waitForQuestion(timeoutMs = 25_000): Promise<"choice" | "typed" | "summary" | "none"> {
    const deadline = Date.now() + timeoutMs;
    let last: string = "not checked";
    while (Date.now() < deadline) {
      const kind = await this.questionKind();
      last = kind;
      if (kind === "choice" || kind === "typed" || kind === "summary") return kind;
      await new Promise((r) => setTimeout(r, 150));
    }
    const text = await this.text();
    fail(
      "waitFor",
      `a live question never appeared (last state: ${last}); page said: ${text.slice(0, 140)}`,
    );
    return "none";
  }

  /** Answer whatever question is on screen, using the keyboard where possible. */
  async answerCurrentQuestion(): Promise<"choice" | "typed" | "none"> {
    const kind = await this.questionKind();
    if (kind === "summary" || kind === "setup" || kind === "none") return "none";

    if (kind === "choice") {
      // Single choice auto-submits on click, so one press of "1" is a full answer.
      await this.pressKey("1", "Digit1");
      return "choice";
    }

    await this.eval(`(() => {
      const f = document.querySelector(
        'textarea, input.field:not([type=search]), input:not([type=checkbox]):not([type=radio]):not([type=search])',
      );
      if (!f) return false;
      f.focus();
      const proto = f.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(f, '1');
      f.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await this.pressKey("Enter");
    return "typed";
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Already closed.
    }
  }
}

async function main(): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), "specwise-cdp-"));
  const edgeArgs = [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    `--user-data-dir=${profile}`,
    "--remote-debugging-port=9333",
    "about:blank",
  ];

  let edge: ChildProcess | null = null;
  let cdp: Cdp | null = null;

  try {
    edge = spawn(EDGE, edgeArgs, { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 2500));

    // The browser prints the ws endpoint on stderr, but it is easier to ask it.
    const targets = await (async (): Promise<DebugTarget[]> => {
      let lastError = "";
      for (let i = 0; i < 40; i++) {
        try {
          const res = await fetch("http://127.0.0.1:9333/json/list");
          if (res.ok) return (await res.json()) as DebugTarget[];
        } catch (e) {
          lastError = String(e);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error(`devtools endpoint unreachable: ${lastError}`);
    })();

    // Pick a real page target. Edge can open with a sync-confirmation dialog
    // listed first, so selecting targets[0] silently attaches to the wrong page
    // and every later assertion fails for the wrong reason.
    const target =
      targets.find((t) => t.type === "page" && !t.url.startsWith("edge://")) ??
      targets.find((t) => t.type === "page") ??
      targets[0];
    if (!target) throw new Error("no debuggable target");
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);

    // ---------------------------------------------------------- dashboard
    await cdp.goto("/");
    // Shell and nav are server-rendered, so their presence proves nothing. The
    // thing worth testing is the client-only part: the store hydrating from
    // localStorage and the loading shell being replaced.
    const hydrated = await cdp.waitForText("answered today", "dashboard hydrates past the loading shell");

    if (hydrated) {
      const text = await cdp.text();
      for (const marker of ["due for review", "day streak", "answered today"]) {
        if (!text.includes(marker)) fail("dashboard", `missing "${marker}" after hydration`);
      }
      if (text.includes("loading")) fail("dashboard", "still showing the loading shell");

      // Nothing has been answered yet, so localStorage is legitimately empty:
      // the store only writes on the first mutation. Reading a value here would
      // fail for a fresh browser and prove nothing. Instead confirm the store
      // loaded, then prove a write happens when the learner acts.
      // The stored state is fresh, so the "weakest chapters" table must be
      // absent. If it is present, stale module state is leaking between runs.
      const hasWeakest = await cdp.eval<boolean>(
        "document.body.innerText.includes('Weakest right now')",
      );
      if (hasWeakest) {
        fail("dashboard", "shows a weakest-chapters table on a fresh profile, so state leaked");
      }
      const stored = await cdp.eval<string | null>("localStorage.getItem('specwise.state.v1')");
      if (stored) {
        const parsed = JSON.parse(stored) as { answers?: unknown[] };
        if ((parsed.answers?.length ?? 0) > 0) {
          fail("dashboard", "a fresh profile already has answers, so the check is not clean");
        }
      }
    }

    // ----------------------------------------------------------- practice
    await cdp.goto("/practice");
    if (await cdp.waitFor("document.querySelectorAll('input[type=checkbox]').length > 5", "practice lists chapters")) {
      const started = await cdp.clickByText("button", "Start 10 questions");
      if (!started) {
        fail("practice", 'no "Start 10 questions" button');
      } else if (await cdp.waitFor("document.body.innerText.includes('Skip') || document.querySelector('textarea, input[type=number]')", "a question renders", 25_000)) {
        // The registry is populated in the browser, so a question here proves
        // the client bundle can generate items. Assert the prompt looks like a
        // real question rather than trying to pattern-match one template.
        const prompt = await cdp.eval<string>(
          "document.querySelector('.page')?.innerText?.slice(0, 400) ?? ''",
        );
        if (prompt.length < 40) {
          fail("practice", `question panel looks empty: ${JSON.stringify(prompt)}`);
        }
        if (/recall-|not assessed within|odd one out/i.test(prompt)) {
          fail("practice", "served a specification-recall item instead of a bespoke question");
        }

        // Answer, and require the app to mark it. A choice question auto-submits
        // on click; a typed one needs a value and Enter.
        const answered = await cdp.eval<boolean>(`(() => {
          const option = document.querySelector('.option');
          if (option) { option.click(); return true; }
          const field = document.querySelector('textarea, input.field, input:not([type=checkbox]):not([type=radio])');
          if (!field) return false;
          const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(field, '1');
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return true;
        })()`);

        if (!answered) {
          fail("practice", "found no answerable control on the question");
        } else {
          await new Promise((r) => setTimeout(r, 700));
          const afterAnswer = await cdp.eval<string>("document.body.innerText");
          if (!/correct|not quite|partly right|answer is|none of your|wrong/i.test(afterAnswer)) {
            const snippet = afterAnswer.replace(/\s+/g, " ").slice(0, 160);
            fail("practice", `no marking feedback after answering; page said: ${snippet}`);
          }
        }
      }
    }

    // ------------------------------------------------------------- review
    await cdp.goto("/review");
    await cdp.waitForText("spaced repetition", "review page hydrates");

    // ------------------------------------------------------------ chapters
    await cdp.goto("/chapters");
    if (await cdp.waitFor("document.querySelectorAll('.spec-ref').length > 5", "chapters list renders")) {
      const before = await cdp.eval<number>("document.querySelectorAll('input[type=checkbox]:checked').length");
      await cdp.eval("document.querySelectorAll('input[type=checkbox]')[0]?.click()");
      await new Promise((r) => setTimeout(r, 400));
      const after = await cdp.eval<number>("document.querySelectorAll('input[type=checkbox]:checked').length");
      if (before === after) {
        fail("chapters", "toggling a chapter did not change the selection, so the checkbox is not wired");
      }
    }

    // -------------------------------------------------------------- stats
    await cdp.goto("/stats");
    if (await cdp.waitFor("document.body.innerText.includes('Progress')", "stats hydrates")) {
      // The profile figures only appear once the store has hydrated, so this
      // doubles as a hydration check for a second route.
      const hasData = await cdp.waitForText(
        "estimated grade",
        "stats profile renders after hydration",
      );
      if (!hasData) {
        const text = await cdp.eval<string>("document.body.innerText.slice(0, 300)");
        fail("stats", `profile never rendered; page said: ${text.replace(/\n/g, " ")}`);
      }
    }

    // ------------------------------------------------- the difficulty control
    /*
      The reported symptom was that setting a difficulty did nothing, so the
      control has to be proved to reach stored state rather than merely render.

      A rendered control that is never read back is the classic version of this
      bug: the segmented buttons update local state and look correct, while the
      value the session actually uses stays at its default. Selecting each
      option and reloading is the cheapest check that the setting is persisted
      and survives a fresh hydration, which is where a control wired to the
      wrong store would fall over.
    */
    await cdp.goto("/practice");
    if (await cdp.waitFor("!!document.querySelector('input[type=checkbox]')", "practice setup")) {
      for (const setting of ["Gentle", "Challenging", "Standard"]) {
        const clicked = await cdp.eval<boolean>(
          `(() => {
            const buttons = [...document.querySelectorAll('button')];
            const target = buttons.find((b) => b.textContent.trim() === ${JSON.stringify(setting)});
            if (!target) return false;
            target.click();
            return true;
          })()`,
        );
        if (!clicked) {
          fail("difficulty", `no ${setting} option on the practice setup screen`);
          continue;
        }
        await new Promise((r) => setTimeout(r, 300));

        // Read the persisted value rather than the pressed styling, since the
        // styling is set by the same state that could be wrong.
        const stored = await cdp.eval<string>(
          "JSON.parse(localStorage.getItem('specwise.state.v1') || '{}')?.config?.difficulty ?? ''",
        );
        const expected = setting.toLowerCase();
        if (stored !== expected) {
          fail("difficulty", `chose ${setting} but stored config.difficulty is "${stored}"`);
        }

        // A reload proves it reached storage rather than just React state.
        await cdp.goto("/practice");
        await cdp.waitFor("!!document.querySelector('input[type=checkbox]')", "practice setup after reload");
        const afterReload = await cdp.eval<string>(
          "JSON.parse(localStorage.getItem('specwise.state.v1') || '{}')?.config?.difficulty ?? ''",
        );
        if (afterReload !== expected) {
          fail("difficulty", `${setting} did not survive a reload (got "${afterReload}")`);
        }
      }
      console.log("  difficulty control: all three settings persist across a reload");
    } else {
      fail("difficulty", "the practice setup screen never rendered, so the difficulty control was never checked");
    }

    // ------------------------------------------------- a whole session
    /*
      Answering one question proves the marking path. Walking an entire session
      proves the things that only go wrong over time: the counter advancing, the
      summary screen appearing at the right point, and the summary's totals
      agreeing with the answers given.
    */
    await cdp.goto("/practice");
    if (
      await cdp.waitFor("document.querySelectorAll('input[type=checkbox]').length > 5", "practice lists chapters")
    ) {
      // Match the button by prefix rather than a fixed count. The label is
      // "Start 10 questions" by default, and hard-coding a number silently broke
      // the walk when the default length differed.
      await cdp.clickByText("button", "Start");
      if ((await cdp.waitForQuestion()) !== "none") {
        let answered = 0;

        // Cap generously above the longest selectable session, so the walk can
        // always reach the summary rather than stopping mid-session.
        for (let i = 0; i < 30; i++) {
          const onSummary = await cdp.eval<boolean>(
            "document.body.innerText.includes('Session complete')",
          );
          if (onSummary) break;

          const kind = await cdp.answerCurrentQuestion();
          if (kind === "none") {
            fail("session", `stuck on a question with no answerable control at step ${i + 1}`);
            break;
          }

          // Feedback must appear, then Enter advances.
          const marked = await cdp.waitForText(
            "correct",
            `feedback appears for question ${i + 1}`,
            6_000,
          );
          if (!marked) {
            const text = await cdp.text();
            fail("session", `no feedback on question ${i + 1}: ${text.slice(0, 120)}`);
            break;
          }
          answered++;
          // On the final question Enter is what triggers the summary, so this
          // must run every time rather than only between questions.
          await cdp.pressKey("Enter");
          await new Promise((r) => setTimeout(r, 400));
        }

        const summaryShown =
          answered > 0
            ? await cdp.waitForText(
                "session complete",
                "the summary appears once the last question is passed",
                15_000,
              )
            : false;

        // Count the steps so a report says how far the walk got.
        console.log(`  session walk: answered ${answered} question(s), summary ${summaryShown ? "shown" : "not reached"}`);

        if (summaryShown) {
          const text = await cdp.text();
          if (!/accuracy/i.test(text)) {
            fail("session", "the summary is missing an accuracy figure");
          }
          if (!/mean difficulty/i.test(text)) {
            fail("session", "the summary is missing the mean difficulty figure");
          }
          if (!/by chapter/i.test(text)) {
            fail("session", "the summary has no per-chapter breakdown, so it likely saw one chapter only");
          }
        }

        // The counter in the stored state must match what we just answered.
        // This runs whether or not the summary appeared, since answers are
        // recorded the moment they are marked.
        const stored = await cdp.eval<string | null>(
          "localStorage.getItem('specwise.state.v1')",
        );
        if (!stored) {
          fail("session", "completing questions did not write to localStorage");
        } else {
          const parsed = JSON.parse(stored) as {
            version?: number;
            answers?: unknown[];
            skills?: Record<string, unknown>;
          };
          if (parsed.version !== 1) fail("persistence", `unexpected state version ${parsed.version}`);
          if (!Array.isArray(parsed.answers) || parsed.answers.length < answered) {
            fail(
              "persistence",
              `expected at least ${answered} stored answers, found ${parsed.answers?.length ?? 0}`,
            );
          }
          if (!parsed.skills || Object.keys(parsed.skills).length === 0) {
            fail("persistence", "answers were stored but the ability model was not updated");
          }

          await cdp.goto("/stats");
          if (await cdp.waitForText("attempts on record", "stats shows recorded answers", 25_000)) {
            const statsText = await cdp.text();
            const zeroAttempts = /accuracy\s*0%\s*0 attempts/.test(statsText);
            if (zeroAttempts) {
              fail("persistence", "after reload the stats page reports 0 attempts, so nothing was restored");
            }
          }
        }
      }
    }

    // ------------------------------------------------- keyboard shortcuts
    await cdp.goto("/practice");
    if (
      (await cdp.waitFor("document.querySelectorAll('input[type=checkbox]').length > 5", "practice lists chapters")) &&
      (await cdp.clickByText("button", "Start")) &&
      (await cdp.waitForQuestion(25_000) === "choice")
    ) {
      // "?" reveals the answer, which is documented in the help hint.
      await cdp.pressKey("?", "Slash");
      if (!(await cdp.waitForText("correct", "'?' reveals the answer", 6_000))) {
        fail("keyboard", "pressing '?' did not reveal the answer");
      }

      /*
        Escape advances past a revealed question. The "n / total" counter is the
        signal, not the progress meter: revealing question 1 and then moving to
        question 2 both fill the meter to 1/10, so the meter's style is identical
        either way and comparing it reports a failure that never happened.
      */
      const counter = () =>
        cdp!.eval<string>(
          "document.body.innerText.match(/\\b\\d+\\s*\\/\\s*\\d+\\b/)?.[0] ?? ''",
        );
      const beforeCounter = await counter();
      await cdp.pressKey("Escape");
      await new Promise((r) => setTimeout(r, 500));
      const afterCounter = await counter();
      if (
        beforeCounter === afterCounter &&
        !(await cdp.eval<boolean>("document.body.innerText.includes('Session complete')"))
      ) {
        fail(
          "keyboard",
          `pressing Escape did not advance (counter stayed at ${afterCounter || "none"})`,
        );
      }

      // Undo must be available and must take the session back a step.
      if (await cdp.eval<boolean>("!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Undo' && !b.disabled)")) {
        await cdp.clickByText("button", "Undo");
        await new Promise((r) => setTimeout(r, 400));
        const undone = await cdp.eval<boolean>(
          "document.body.innerText.includes('Session complete') === false",
        );
        if (!undone) fail("keyboard", "undo left the session in a finished state");
      } else {
        fail("keyboard", "undo was unavailable on the second question, so it cannot be tested");
      }
    }

    // ---------------------------------------------------------- test mode
    /*
      Mock test is the one mode that withholds feedback. Checking that the
      counter appears in the header, since the countdown renders mm:ss.
    */
    await cdp.goto("/test");
    if (await cdp.waitFor("document.body.innerText.toLowerCase().includes('sit a paper')", "test setup loads")) {
      await cdp.clickByText("button", "Start paper");
      if ((await cdp.waitForQuestion()) !== "none") {
        const hasTimer = await cdp.eval<boolean>(`(() => {
          const text = document.querySelector('.page')?.innerText ?? '';
          return /\\b\\d{1,2}:\\d{2}\\b/.test(text);
        })()`);
        if (!hasTimer) {
          fail("test mode", "no mm:ss countdown is visible, so the timer is not running");
        }
      }
    }

    // ------------------------------------------------------------- plan
    /*
      The plan is the feature that turns a diagnosis into an instruction, so it
      needs its own check: it must produce a queue, and setting an exam date has
      to change what it says.
    */
    await cdp.goto("/plan");
    if (await cdp.waitForText("what to do today", "plan page loads")) {
      const planText = await cdp.text();
      if (!/exam dates/i.test(planText)) {
        fail("plan", "no exam date controls, so nothing can be weighted by deadline");
      }
      if (!/today.s plan|nothing queued|no chapters selected/i.test(planText)) {
        fail("plan", "the plan section is missing entirely");
      }

      const setDate = await cdp.eval<boolean>(`(() => {
        const input = document.querySelector('input[type=date]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        const d = new Date();
        d.setDate(d.getDate() + 5);
        const value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        setter?.call(input, value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);

      if (setDate) {
        const counted = await cdp.waitForText(
          "5d",
          "the exam countdown appears once a date is set",
          8000,
        );
        if (!counted) {
          const after = await cdp.text();
          fail("plan", `exam date was set but no countdown appeared; page said: ${after.slice(0, 160)}`);
        }
      } else {
        fail("plan", "no date input found to set an exam date");
      }
    }

    // --------------------------------------------------------- notebook
    await cdp.goto("/notebook");
    if (await cdp.waitForText("wrong answers", "notebook loads")) {
      const nb = await cdp.text();
      // A full session ran above, so there should be something to review unless
      // every single answer happened to be right.
      if (/nothing wrong yet/i.test(nb)) {
        fail("notebook", "a completed session produced no notebook entries");
      }
    }

    // ------------------------------------------------- extended answers
    /*
      Extended-answer items are where most AQA Economics and OCR CS marks sit,
      so the self-marking interaction has to be exercised rather than assumed:
      write, tick, submit, and confirm a self-assessed score came back.

      Practice opens on Edexcel Mathematics, which has no extended items, so the
      subject has to be requested explicitly or this check proves nothing.
    */
    await cdp.goto("/practice?subject=aqa-economics&chapters=econ-4.1.6");
    if (
      (await cdp.waitFor(
        "document.querySelectorAll('input[type=checkbox]').length > 5",
        "practice for extended",
      )) &&
      // Longest session available. The chapter mixes multiple-choice items with
      // extended ones, so a 10-question session can end without ever producing
      // an extended answer, and the check would then be testing nothing.
      (await cdp.eval<boolean>(
        "document.body.innerText.includes('1 chapter in this subject') && document.body.innerText.includes('AQA Economics')",
      )) &&
      (await cdp.clickByText("button", "25")) &&
      (await cdp.clickByText("button", "Start"))
    ) {
      let sawExtended = false;
      const kindsSeen: string[] = [];
      for (let i = 0; i < 30; i++) {
        const kind = await cdp.questionKind();
        if (kind === "summary" || kind === "none") break;
        // Remember the prompt of anything that is not extended, so a failure can
        // name what was actually served instead of just counting.
        kindsSeen.push(
          (
            await cdp.eval<string>(
              "document.querySelector('h2')?.innerText?.trim().slice(0, 60) ?? ''",
            )
          ) || "(untitled)",
        );

        const isExtended = await cdp.eval<boolean>(
          "!!document.querySelector('textarea[rows=\\\"12\\\"]')",
        );
        if (!isExtended) {
          await cdp.answerCurrentQuestion();
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        sawExtended = true;

        const typed = await cdp.eval<boolean>(`(() => {
          const f = document.querySelector('textarea');
          if (!f) return false;
          f.focus();
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          setter?.call(f, 'A short answer hitting only the first point.');
          f.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`);
        if (!typed) {
          fail("extended", "the extended answer textarea did not accept input");
          break;
        }

        if (!(await cdp.eval<boolean>("document.body.innerText.toLowerCase().includes('mark scheme')"))) {
          fail("extended", "no mark scheme shown alongside the answer box");
        }

        // Submitting with nothing claimed would award a score the learner did not
        // earn, so the control has to stay disabled until a point is ticked.
        const blockedBeforeTick = await cdp.eval<boolean | null>(`(() => {
          const btn = [...document.querySelectorAll('button')].find(b => /lock in|check answer|submit|reveal/i.test(b.textContent || ''));
          return btn ? btn.disabled : null;
        })()`);
        if (blockedBeforeTick === false) {
          fail("extended", "submit was enabled with no scheme points claimed");
        }

        const ticked = await cdp.eval<boolean>(`(() => {
          const boxes = [...document.querySelectorAll('input[type=checkbox]')];
          const box = boxes[boxes.length - 1];
          if (!box) return false;
          box.click();
          return true;
        })()`);
        if (!ticked) {
          fail("extended", "no tickable mark scheme point found");
          break;
        }

        await cdp.pressKey("Enter");
        if (
          !(await cdp.waitForText(
            "self-assessed",
            "an extended answer reports a self-assessed score",
            8000,
          ))
        ) {
          const after = await cdp.text();
          fail("extended", `no self-assessed score after marking; page said: ${after.slice(0, 160)}`);
        }
        break;
      }
      if (!sawExtended) {
        fail(
          "extended",
          `no extended-answer item was reachable from practice; saw: ${kindsSeen.join(" | ").slice(0, 240)}`,
        );
      }
    }

    // ------------------------------------------------------- error budget
    if (cdp.pageErrors.length > 0) {
      fail("console", `${cdp.pageErrors.length} uncaught exception(s): ${cdp.pageErrors[0]?.slice(0, 160)}`);
    }
    if (cdp.consoleErrors.length > 0) {
      fail("console", `${cdp.consoleErrors.length} console error(s): ${cdp.consoleErrors[0]?.slice(0, 160)}`);
    }
  } finally {
    cdp?.close();
    edge?.kill();
    // Edge keeps file handles on the profile for a moment after exit, so a
    // failed cleanup must not mask the check results.
    await new Promise((r) => setTimeout(r, 400));
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // A leftover temp profile is harmless.
    }
  }
}

main()
  .then(() => {
    if (failures.length > 0) {
      console.log(`\n${failures.length} failure(s):`);
      for (const f of failures) console.log(`  [${f.step}] ${f.reason}`);
      process.exit(1);
    }
    console.log("headless check: all steps passed");
  })
  .catch((err) => {
    console.error(`headless check could not run: ${String(err)}`);
    process.exit(1);
  });

