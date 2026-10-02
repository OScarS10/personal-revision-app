"use client";

import { useMemo } from "react";
import { useNow } from "@/components/clock";
import { useStore } from "@/components/store-provider";

/*
  Backup prompt.

  Progress lives in one browser's localStorage. Clearing site data, a browser
  reset, or switching device destroys all of it, and the app has no account to
  recover from. That makes backup the one genuinely irreversible risk in the
  product, so it is surfaced on the dashboard rather than left in a settings
  page nobody opens.

  The prompt is evidence-based. It appears because the learner has answers worth
  protecting and has not exported recently, not on a timer for its own sake.
*/

export type BackupUrgency = "none" | "soon" | "overdue";

export interface BackupStatus {
  urgency: BackupUrgency;
  /** Days since the last export, or null when never. */
  daysSince: number | null;
  answersAtRisk: number;
  message: string;
}

const DAY = 86_400_000;

export function backupStatus(lastExportAt: number | null, answers: number, now = Date.now()): BackupStatus {
  const daysSince = lastExportAt === null ? null : Math.floor((now - lastExportAt) / DAY);
  const atRisk = answers;

  if (atRisk === 0) {
    return {
      urgency: "none",
      daysSince,
      answersAtRisk: 0,
      message: "Nothing to back up yet.",
    };
  }

  if (daysSince === null) {
    return {
      urgency: "overdue",
      daysSince: null,
      answersAtRisk: atRisk,
      message: `You have ${atRisk} answered question${atRisk === 1 ? "" : "s"} recorded in this browser and have never exported. Clearing site data would delete all of it.`,
    };
  }

  if (daysSince >= 14) {
    return {
      urgency: "overdue",
      daysSince,
      answersAtRisk: atRisk,
      message: `Last backup was ${daysSince} days ago. ${atRisk} answers live in this browser only.`,
    };
  }

  if (daysSince >= 3) {
    return {
      urgency: "soon",
      daysSince,
      answersAtRisk: atRisk,
      message: `Last backup was ${daysSince} days ago.`,
    };
  }

  return {
    urgency: "none",
    daysSince,
    answersAtRisk: atRisk,
    message: `Backed up ${daysSince === 0 ? "today" : `${daysSince} day${daysSince === 1 ? "" : "s"} ago`}.`,
  };
}

export function BackupPrompt() {
  const { state, hydrated } = useStore();
  // The shared clock, so the prompt does not read the clock during render.
  const now = useNow();
  const status = useMemo(
    () => backupStatus(state.lastExportAt, state.answers.length, now),
    [state.lastExportAt, state.answers.length, now],
  );

  if (!hydrated || status.urgency === "none") return null;

  const tone =
    status.urgency === "overdue" ? "border-warn" : "border-rule";

  return (
    <div className={`panel ${tone} mb-6 flex flex-wrap items-center gap-3 p-3`}>
      <span className="min-w-0 flex-1 text-[13px]">{status.message}</span>
      <a className="btn btn-sm btn-primary" href="/stats#data">
        Export now
      </a>
    </div>
  );
}
