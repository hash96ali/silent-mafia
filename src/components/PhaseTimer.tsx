"use client";

import { useEffect, useState } from "react";
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

/** Brand on the right, timer pill on the left, neon rule underneath. */
export function TopBar({ subtitle, deadline, now, night }: { subtitle: string; deadline: number | null; now: () => number; night: boolean }) {
  return (
    <div className="-mx-4 mb-2 px-4">
      <div className="flex items-center justify-between py-2">
        <p className="text-sm font-bold">
          <span className="neon-text">المافيا:</span> <span className="text-white">{subtitle}</span>
        </p>
        <PhaseTimer deadline={deadline} now={now} night={night} />
      </div>
      <div className="neon-rule" />
    </div>
  );
}
