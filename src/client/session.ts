"use client";

import type { SessionInfo } from "@/shared/types";

// The session token lets a player who refreshed, locked their phone or lost
// Wi-Fi reclaim the same seat. localStorage can be unavailable (private mode),
// so every access is guarded and the app still works for the current tab.

const KEY = "silent-mafia:session";
let memory: SessionInfo | null = null;

export function loadSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as SessionInfo;
  } catch {}
  return memory;
}

export function saveSession(s: SessionInfo): void {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function clearSession(): void {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
