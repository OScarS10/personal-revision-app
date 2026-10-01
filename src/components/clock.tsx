"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
  A shared clock.

  A countdown does not belong in React state: driving it from an interval that
  calls setState re-renders the whole question card four times a second, and
  storing the remaining time in state means the display can drift from the
  deadline it is supposed to represent.

  Instead there is one interval for the whole app. It publishes a timestamp,
  subscribers derive what they need from it, and getSnapshot stays referentially
  stable between ticks so useSyncExternalStore does not loop.
*/

const TICK_MS = 250;

let now = 0;
let intervalId: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (intervalId === null) {
    now = Date.now();
    intervalId = window.setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => 0;

/** A shared timestamp that advances every 250ms while any component listens. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export interface CountdownProps {
  deadline: number;
  onExpire(): void;
  className?: string;
  "aria-live"?: "off" | "polite" | "assertive";
  children(now: number): React.ReactNode;
}

/**
 * Render-driven countdown.
 *
 * Mount this only while a timer is genuinely running, so the shared interval is
 * never started for untimed practice. Expiry is reported through a stable
 * callback: the clock is the external system here, and the effect is reacting to
 * a change in it rather than setting state synchronously on mount.
 */
export function Countdown({
  deadline,
  onExpire,
  className,
  children,
  "aria-live": ariaLive,
}: CountdownProps) {
  const now = useNow();
  const expired = now >= deadline;

  useEffect(() => {
    if (expired) onExpire();
  }, [expired, onExpire]);

  return (
    <span className={className} aria-live={ariaLive}>
      {children(now)}
    </span>
  );
}

/** Whole seconds left, never negative. */
export function secondsLeft(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
