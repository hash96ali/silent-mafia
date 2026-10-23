"use client";

import type { SessionInfo } from "@/shared/types";

// The session token lets a player who refreshed, locked their phone or lost
// Wi-Fi reclaim the same seat. localStorage can be unavailable (private mode),
// so every access is guarded and the app still works for the current tab.

const KEY = "silent-mafia:session";
const FLASH_KEY = "silent-mafia:flash";

/** A session older than this (no activity) is treated as over. */
export const SESSION_MAX_IDLE_MS = 2 * 60 * 60_000;

export type StoredSession = SessionInfo & { lastSeen: number };

let memory: StoredSession | null = null;
let memoryFlash: string | null = null;

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<StoredSession>;
      // Sessions saved before lastSeen existed count as fresh.
      return { ...(s as SessionInfo), lastSeen: s.lastSeen ?? Date.now() };
    }
  } catch {}
  return memory;
}

export function saveSession(s: SessionInfo): void {
  memory = { code: s.code, playerId: s.playerId, token: s.token, lastSeen: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {}
}

/** Records activity on the current session (throttled to once a minute). */
export function touchSession(): void {
  const s = loadSession();
  if (!s || Date.now() - s.lastSeen < 60_000) return;
  saveSession(s);
}

export function isSessionExpired(s: Pick<StoredSession, "lastSeen">, now = Date.now()): boolean {
  return now - s.lastSeen > SESSION_MAX_IDLE_MS;
}

export function clearSession(): void {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

/** A one-time message to show on the next page (e.g. after being sent home). */
export function setFlash(message: string): void {
  memoryFlash = message;
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {}
}

export function takeFlash(): string | null {
  let message = memoryFlash;
  try {
    message = sessionStorage.getItem(FLASH_KEY) ?? message;
    sessionStorage.removeItem(FLASH_KEY);
  } catch {}
  memoryFlash = null;
  return message;
}

export const SESSION_ENDED_MESSAGE = "جلسة اللعبة السابقة انتهت، تم إعادتك للصفحة الرئيسية.";
