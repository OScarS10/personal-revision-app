"use client";

import type { ReactNode } from "react";

/** Small, unembellished building blocks shared across pages. */

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`label ${className ?? ""}`}>{children}</div>;
}

export function SectionHead({
  index,
  title,
  hint,
  action,
}: {
  index?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-2.5">
      <div className="min-w-0">
        {/*
          The title is a heading, not an eyebrow label. Sharing the 10.5px
          uppercase .label token with stat metadata left sections with no
          visual weight, so the index stays small and the title becomes a real
          h2.
        */}
        <h2 className="flex items-baseline gap-2 text-[13px] font-semibold tracking-tight text-ink">
          {index ? <span className="label num text-ink-3">{index}</span> : null}
          <span>{title}</span>
        </h2>
        {hint ? <p className="prose-note mt-1 text-[13px]">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-rule pb-5">
      {eyebrow ? <div className="label mb-2">{eyebrow}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="font-display text-[1.7rem] leading-[1.15] text-ink">{title}</h1>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {lede ? (
        <p className="prose-note mt-2 max-w-[62ch] text-[13.5px]">{lede}</p>
      ) : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: "ok" | "warn" | "bad" | "muted";
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "bad"
          ? "text-bad"
          : tone === "muted"
            ? "text-ink-3"
            : "text-ink";
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`num text-[1.45rem] leading-none font-medium ${toneClass}`}>{value}</span>
        {unit ? <span className="text-ink-3 text-[12px]">{unit}</span> : null}
      </div>
      {hint ? <div className="text-ink-3 mt-1 text-[12px] leading-snug">{hint}</div> : null}
    </div>
  );
}

export function Meter({
  value,
  tone,
  empty,
  label,
}: {
  value: number;
  tone?: "ok" | "warn" | "bad" | "muted" | "accent";
  empty?: boolean;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className="meter"
      data-tone={tone ?? "accent"}
      data-empty={empty ? "true" : undefined}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {!empty ? <span style={{ width: `${pct}%` }} /> : null}
    </div>
  );
}

const SEVERITY_TONE: Record<string, "ok" | "warn" | "bad" | "muted" | "accent"> = {
  strong: "ok",
  shaky: "warn",
  weak: "bad",
  critical: "bad",
  untested: "muted",
};

const SEVERITY_TEXT: Record<string, string> = {
  strong: "text-ok",
  shaky: "text-warn",
  weak: "text-bad",
  critical: "text-bad",
  untested: "text-ink-3",
};

export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad" | "accent";
  title?: string;
}) {
  const cls =
    tone === "ok"
      ? "text-ok border-ok/30 bg-ok-soft"
      : tone === "warn"
        ? "text-warn border-warn/30 bg-warn-soft"
        : tone === "bad"
          ? "text-bad border-bad/30 bg-bad-soft"
          : tone === "accent"
            ? "text-accent border-accent/30 bg-accent-soft"
            : "text-ink-2 border-rule bg-surface-2";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[11px] leading-none font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`text-[11.5px] font-medium capitalize ${SEVERITY_TEXT[severity] ?? "text-ink-3"}`}>
      {severity}
    </span>
  );
}

export function severityTone(severity: string) {
  return SEVERITY_TONE[severity] ?? "muted";
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-inset px-5 py-8 text-center">
      <p className="font-display text-ink text-[1.05rem]">{title}</p>
      <p className="prose-note mx-auto mt-1.5 max-w-[52ch] text-[13px]">{body}</p>
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

/** Segmented control, used for subject and mode switches. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  ariaLabel,
}: {
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="border-rule bg-surface-2 inline-flex rounded-[3px] border p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={[
              "rounded-[2px] font-medium transition-colors",
              size === "sm" ? "px-2 py-1 text-[12px]" : "px-3 py-1.5 text-[13px]",
              active
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
                : "text-ink-3 hover:text-ink-2",
            ].join(" ")}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A compact key/value row used in the stats tables. */
export function DataRow({
  label,
  children,
  mono,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="border-rule flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <span className="text-ink-2 text-[13px]">{label}</span>
      <span className={mono ? "num text-[13px]" : "text-[13px]"}>{children}</span>
    </div>
  );
}
