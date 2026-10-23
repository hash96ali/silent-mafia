"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { MoonIcon, SunIcon } from "./icons";
import { arDigits } from "./ui";

/** "المتبقي: ٠٠:٢٨" pill counting down to a server deadline. `now` returns server-corrected time. */
export function PhaseTimer({ deadline, now, night }: { deadline: number | null; now: () => number; night: boolean }) {
  const [left, setLeft] = useState(() => (deadline ? deadline - now() : 0));

  useEffect(() => {
    if (!deadline) return;
    const tick = () => setLeft(Math.max(0, deadline - now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline, now]);

  if (!deadline) return null;
  const sec = Math.ceil(left / 1000);
  const mmss = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const Icon = night ? MoonIcon : SunIcon;
  return (
    <span className={`neon flex items-center gap-2 rounded-full border bg-black/50 px-3 py-1 text-sm font-semibold ${sec <= 10 ? "animate-pulse" : ""}`}>
      <span>
        المتبقي: <span className="tabular-nums" dir="ltr">{arDigits(mmss)}</span>
      </span>
      <Icon className="size-4 text-white" />
    </span>
  );
}

/** Brand on the right; timer pill and the home button on the left; neon rule underneath. */
export function TopBar({
  subtitle,
  deadline,
  now,
  night,
  home,
}: {
  subtitle: string;
  deadline: number | null;
  now: () => number;
  night: boolean;
  home?: ReactNode;
}) {
  return (
    <div className="-mx-4 mb-2 px-4">
      <div className="flex items-center justify-between gap-2 py-2">
        <p className="text-sm font-bold">
          <span className="neon-text">المافيا:</span> <span className="text-white">{subtitle}</span>
        </p>
        <div className="flex items-center gap-2">
          <PhaseTimer deadline={deadline} now={now} night={night} />
          {home}
        </div>
      </div>
      <div className="neon-rule" />
    </div>
  );
}

/**
 * Large countdown with a draining bar, for the phase header, the night scene
 * and the projector. Goes red and pulses in the last 10 seconds.
 */
export function BigTimer({ deadline, now, className = "text-5xl" }: { deadline: number | null; now: () => number; className?: string }) {
  const [left, setLeft] = useState(() => (deadline ? deadline - now() : 0));
  // The bar is relative to how much time there was when this deadline arrived.
  const total = useMemo(() => (deadline ? Math.max(1000, deadline - now()) : 1), [deadline, now]);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => setLeft(Math.max(0, deadline - now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline, now]);

  if (!deadline) return null;
  const sec = Math.ceil(left / 1000);
  // No leading zero: the Arabic zero is just a dot ("٠:٢٣" reads like "·:23"), so under a
  // minute show only the seconds, and above it drop the zero-padding on minutes.
  const mmss = sec < 60 ? String(sec) : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const urgent = sec <= 10;
  return (
    <div className="flex w-full flex-col items-center gap-2" role="timer" aria-label={`المتبقي ${sec} ثانية`}>
      <span dir="ltr" className={`font-black leading-none tabular-nums ${urgent ? "animate-pulse text-red-500 [text-shadow:0_0_18px_rgb(255_30_40/0.9)]" : "neon-text"} ${className}`}>
        {arDigits(mmss)}
      </span>
      <span className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
        <span
          className={`block h-full rounded-full transition-[width] duration-300 ease-linear ${urgent ? "bg-red-500" : "bg-[var(--color-blood-soft)]"}`}
          style={{ width: `${Math.min(100, (left / total) * 100)}%` }}
        />
      </span>
    </div>
  );
}

/** Small line under the turn timer: the most the night can still last (every remaining turn at full time). */
export function NightEndsBy({ at, now, className = "text-sm" }: { at: number | null; now: () => number; className?: string }) {
  const [left, setLeft] = useState(() => (at ? at - now() : 0));
  useEffect(() => {
    if (!at) return;
    const tick = () => setLeft(Math.max(0, at - now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [at, now]);
  if (!at) return null;
  const sec = Math.ceil(left / 1000);
  return (
    <p className={`text-neutral-400 ${className}`}>
      الليل كله ينتهي خلال <span dir="ltr" className="font-bold tabular-nums text-neutral-200">{arDigits(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`)}</span> كحد أقصى
    </p>
  );
}
