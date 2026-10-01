/** Presentation-only formatting helpers. */

export function fmtTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${`${minutes % 60}`.padStart(2, "0")}:${`${seconds}`.padStart(2, "0")}`;
  }
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
}

export function fmtDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function fmtPercent(value: number | null, dp = 0): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(dp)}%`;
}

export function fmtDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 days ago", "in 2 hours" - short relative phrasing. */
export function fmtRelative(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (abs < minute) return "just now";
  const suffix = diff < 0 ? "ago" : "";
  const prefix = diff < 0 ? "" : "in ";

  if (abs < hour) {
    const n = Math.round(abs / minute);
    return `${prefix}${n} min${n === 1 ? "" : "s"} ${suffix}`.trim();
  }
  if (abs < day) {
    const n = Math.round(abs / hour);
    return `${prefix}${n} hour${n === 1 ? "" : "s"} ${suffix}`.trim();
  }
  const n = Math.round(abs / day);
  return `${prefix}${n} day${n === 1 ? "" : "s"} ${suffix}`.trim();
}

/** Grade band from a mastery figure, matching the analysis page. */
export function masteryWord(mastery: number): string {
  if (mastery >= 0.85) return "Secure";
  if (mastery >= 0.7) return "Solid";
  if (mastery >= 0.55) return "Shaky";
  if (mastery >= 0.4) return "Weak";
  return "Very weak";
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
