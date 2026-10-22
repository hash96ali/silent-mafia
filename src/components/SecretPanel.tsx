"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LockIcon } from "./icons";

const AUTO_CLOSE_MS = 20_000;

/**
 * Covers anything secret (night actions, votes, the GM dashboard) so a
 * projected or glanced-at screen never shows it by default. Every player gets
 * the same cover, so a covered screen says nothing about who has an action.
 * It closes again after 20s without a touch, and whenever `resetKey` changes
 * (pass the phase + round so each phase starts covered).
 */
export function SecretPanel({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
  };

  useEffect(() => setOpen(false), [resetKey]);
  useEffect(() => {
    if (open) arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open]);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="glass flex w-full flex-col items-center gap-2 rounded-2xl px-4 py-10 text-center">
        <LockIcon className="neon-text size-9" />
        <span className="text-lg font-bold text-white">اضغط لفتح شاشتك السرية</span>
        <span className="text-xs text-neutral-500">تأكد أن لا أحد يرى شاشتك · تُغلق تلقائياً</span>
      </button>
    );
  }

  return (
    <div onPointerDown={arm} className="flex flex-col gap-2">
      {children}
      <button type="button" onClick={() => setOpen(false)} className="mx-auto flex items-center gap-1.5 py-1 text-sm text-neutral-400 underline">
        <LockIcon className="size-4" />
        إخفاء الشاشة السرية
      </button>
    </div>
  );
}
