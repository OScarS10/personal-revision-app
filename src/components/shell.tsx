"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "@/components/store-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SUBJECTS, SUBJECT_ORDER } from "@/lib/specs";
import { buildReviewQueue, summariseReview } from "@/lib/spaced";
import type { SubjectId } from "@/lib/types";

const NAV: Array<{ href: string; label: string; hint: string }> = [
  { href: "/", label: "Overview", hint: "Where you stand" },
  { href: "/plan", label: "Today", hint: "What to do next, and what's due" },
  { href: "/practice", label: "Practice", hint: "Adaptive questions with feedback" },
  { href: "/test", label: "Mock", hint: "Timed paper, feedback at the end" },
  { href: "/review", label: "Review", hint: "Spaced repetition queue" },
  { href: "/notebook", label: "Notebook", hint: "Everything you got wrong" },
  { href: "/chapters", label: "Chapters", hint: "Choose what to revise, read notes" },
  { href: "/stats", label: "Analysis", hint: "Full model breakdown" },
];

function SubjectBar() {
  const { state, hydrated } = useStore();
  const pathname = usePathname();

  const totalEnabled = useMemo(
    () => SUBJECT_ORDER.reduce((sum, s) => sum + (state.enabled[s]?.length ?? 0), 0),
    [state.enabled],
  );

  const [open, setOpen] = useState(false);

  return (
    <div className="border-rule bg-surface sticky top-0 z-30 border-b">
      <div className="page-wide">
        <div className="flex h-14 items-center justify-between gap-4">
          {/*
            -my-1 cancels the padding back out so the 44px row is unchanged,
            but the link becomes a 26px-tall target instead of an 18px one.
          */}
          <Link href="/" className="-my-1 flex shrink-0 items-baseline gap-2 py-1">
            <span className="font-display text-ink text-[1.15rem] leading-none font-semibold tracking-tight">
              Specwise
            </span>
            <span className="label hidden lg:inline">Revision</span>
          </Link>

          {/*
            Eight links plus the brand and theme toggle need ~1010px. Below lg
            they do not fit, so the menu button covers that band instead of the
            header overflowing sideways.
          */}
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.hint}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "rounded-[3px] px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink-2",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {!hydrated ? (
              <span className="label">Loading</span>
            ) : totalEnabled === 0 ? (
              <Link href="/chapters" className="btn btn-sm">
                Pick chapters
              </Link>
            ) : (
              <span className="label num hidden xl:inline">
                {totalEnabled} chapter{totalEnabled === 1 ? "" : "s"}
              </span>
            )}

            {/*
              The segmented control is far wider than the icon and only fits once
              the nav has the full row to itself. Promoting it at lg is what made
              the 768-1180px band scroll sideways.
            */}
            <span className="hidden xl:inline-flex">
              <ThemeToggle />
            </span>
            <span className="inline-flex xl:hidden">
              <ThemeToggle compact />
            </span>

            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Open menu"
              className="btn btn-sm btn-ghost lg:hidden"
            >
              Menu
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="border-rule bg-surface animate-in border-t lg:hidden">
          <nav className="page-wide flex flex-col py-1" aria-label="Main (mobile)">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-rule text-ink-2 border-b py-2.5 text-[14px] last:border-b-0"
              >
                {item.label}
                <span className="text-ink-3 ml-2 text-[12px]">{item.hint}</span>
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function StorageWarning() {
  const { storageError, hydrated } = useStore();
  if (!hydrated || !storageError) return null;
  return (
    <div className="border-warn/30 bg-warn-soft">
      <div className="page-wide py-2 text-[12.5px] text-warn">{storageError}</div>
    </div>
  );
}

function Footer() {
  const { state } = useStore();
  return (
    <footer className="border-rule mt-12 border-t">
      <div className="page-wide flex flex-wrap items-center justify-between gap-3 py-5">
        <p className="text-ink-3 text-[12px]">
          Progress is stored in this browser only. Nothing is uploaded.
        </p>
        <p className="num text-ink-3 text-[11.5px]">
          {Object.keys(state.skills).length} chapters tracked &middot; {state.answers.length} answers
          &middot; {state.sessions} session{state.sessions === 1 ? "" : "s"}
        </p>
      </div>
    </footer>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <SubjectBar />
      <StorageWarning />
      <main className="page-wide flex-1 pt-6 pb-10 md:pt-8">{children}</main>
      <Footer />
    </>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StoreProvider>
      <Shell>{children}</Shell>
    </StoreProvider>
  );
}

/** Count of chapters due for review right now, for the nav badge. */
export function useDueCount(): number {
  const { state, hydrated } = useStore();
  return useMemo(() => {
    if (!hydrated) return 0;
    const all = SUBJECT_ORDER.flatMap((s) => state.enabled[s] ?? []);
    return summariseReview(buildReviewQueue(state, all)).ready;
  }, [state, hydrated]);
}

export function subjectName(id: SubjectId): string {
  return SUBJECTS[id].name;
}
