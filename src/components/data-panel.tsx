"use client";

import { useCallback, useRef, useState } from "react";
import type { SubjectId } from "@/lib/types";
import { SUBJECTS } from "@/lib/specs";
import { exportState, importState } from "@/lib/store";
import { useStore } from "@/components/store-provider";
import { fmtDateTime } from "@/components/format";

/*
  Data management.

  Everything lives in this browser's localStorage, so the export button is the
  only backup that exists. That makes it the most important control on the app,
  which is why it is a real download rather than a link hidden in a menu.
*/

type Message = { tone: "ok" | "bad"; text: string } | null;

export function DataPanel({ subject }: { subject: SubjectId }) {
  const { state, replaceState, resetAll, resetSubject } = useStore();

  const [message, setMessage] = useState<Message>(null);
  const [confirming, setConfirming] = useState<"all" | "subject" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = useCallback(() => {
    const blob = new Blob([exportState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revision-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "ok", text: "Progress downloaded." });
  }, [state]);

  const onFile = useCallback(
    async (file: File) => {
      const result = importState(await file.text());
      if (!result.ok || !result.state) {
        setMessage({ tone: "bad", text: result.error ?? "That file could not be read." });
        return;
      }
      replaceState(result.state);
      setMessage({
        tone: "ok",
        text: `Imported ${result.summary?.answers ?? 0} answers across ${
          result.summary?.chapters ?? 0
        } chapters.`,
      });
    },
    [replaceState],
  );

  return (
    <div className="panel p-4">
      <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink-2">
        Your progress is stored only in this browser. There is no account and no server, so nothing
        syncs between devices and clearing site data will delete it. Export regularly if the
        progress matters.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={exportJson} type="button">
          Export progress
        </button>
        <button
          className="btn"
          onClick={() => fileRef.current?.click()}
          type="button"
        >
          Import from file
        </button>
        <input
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
          ref={fileRef}
          type="file"
        />
      </div>

      <div className="rule-top flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 text-[12px] text-ink-3">
        <span className="num">{state.answers.length} answers stored</span>
        <span className="num">{state.sessions} sessions completed</span>
        {state.updatedAt ? <span>last saved {fmtDateTime(state.updatedAt)}</span> : null}
      </div>

      <div className="rule-top mt-4 flex flex-wrap items-center gap-2 pt-3">
        <span className="label mb-0">Danger zone</span>
        {confirming === "subject" ? (
          <>
            <span className="text-[13px] text-bad">
              Delete all {SUBJECTS[subject].shortName} progress?
            </span>
            <button
              className="btn btn-sm"
              onClick={() => {
                resetSubject(subject);
                setConfirming(null);
                setMessage({ tone: "ok", text: `${SUBJECTS[subject].shortName} progress cleared.` });
              }}
              type="button"
            >
              Yes, clear it
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)} type="button">
              Cancel
            </button>
          </>
        ) : confirming === "all" ? (
          <>
            <span className="text-[13px] text-bad">Delete everything? This cannot be undone.</span>
            <button
              className="btn btn-sm"
              onClick={() => {
                resetAll();
                setConfirming(null);
                setMessage({ tone: "ok", text: "All progress cleared." });
              }}
              type="button"
            >
              Yes, delete everything
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(null)} type="button">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming("subject")} type="button">
              Clear {SUBJECTS[subject].shortName}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirming("all")} type="button">
              Clear everything
            </button>
          </>
        )}
      </div>

      {message ? (
        <p
          className={`mt-3 text-[13px] ${message.tone === "ok" ? "text-ok" : "text-bad"}`}
          role="status"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
