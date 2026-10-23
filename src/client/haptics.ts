"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "@/shared/types";

export type HapticPattern = number | number[];

export const HAPTIC = {
  /** Mafia turn: the Godfather gets a heavier pulse than the rest of the Mafia. */
  GODFATHER: [400, 120, 400],
  MAFIA: [200, 100, 200],
  DOCTOR: [300],
  /** Detective / Sniper micro-turn. */
  SPECIAL: [100, 60, 100, 60, 100],
  /** Day announcement and voting opening, for every living player. */
  ALERT: [120, 60, 120],
  REVENGE: [300, 100, 300],
  /** "ALL" mode: the same buzz for every living player on every turn. */
  EVERYONE: [200, 100, 200],
} satisfies Record<string, HapticPattern>;

type UserActivationNav = Navigator & { userActivation?: { hasBeenActive: boolean } };

export const hapticsSupported = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/** Browsers ignore vibration until the person has tapped the page at least once. */
export const hapticsUnlocked = () => {
  const ua = (navigator as UserActivationNav).userActivation;
  return !ua || ua.hasBeenActive;
};

/**
 * Vibrates if the browser allows it. Returns false instead of throwing when
 * vibration is unsupported (e.g. iPhone Safari) or still blocked because
 * nobody has touched the page yet.
 */
export function triggerHaptic(pattern: HapticPattern): boolean {
  try {
    if (!hapticsSupported() || !hapticsUnlocked()) return false;
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/** Which pattern (if any) this player feels when the game reaches the view's current stage. */
export function hapticFor(view: PlayerView): HapticPattern | null {
  const me = view.players.find((p) => p.id === view.meId);
  const mode = view.settings.haptics;
  if (!me || mode === "OFF") return null;
  const alive = me.alive && !me.isGM;

  switch (view.stage) {
    case "NIGHT_MAFIA_TURN":
    case "NIGHT_DOCTOR_TURN":
    case "NIGHT_SPECIAL_TURN": {
      if (!alive) return null;
      if (mode === "ALL") return HAPTIC.EVERYONE;
      const turn = view.nightTurn;
      if (turn === "MAFIA" && me.role === "MAFIA") return view.godfatherId === me.id ? HAPTIC.GODFATHER : HAPTIC.MAFIA;
      if (turn === "DOCTOR" && me.role === "DOCTOR") return HAPTIC.DOCTOR;
      if (turn === "DETECTIVE" && me.role === "DETECTIVE") return HAPTIC.SPECIAL;
      if (turn === "SNIPER" && me.role === "SNIPER" && view.sniperShotAvailable) return HAPTIC.SPECIAL;
      return null;
    }
    case "DAY_ANNOUNCEMENT":
    case "VOTING":
      return alive ? HAPTIC.ALERT : null;
    case "REVENGE":
      return view.revengeBy === me.id ? HAPTIC.REVENGE : null;
    default:
      return null;
  }
}

/**
 * Buzzes when the server moves to a new stage or night turn. It never fires
 * for the screen a player loads or refreshes into, only for real changes.
 */
export function useHaptics(view: PlayerView): void {
  const key = `${view.stage}-${view.round}-${view.nightTurn ?? ""}`;
  const last = useRef<string | null>(null);
  useEffect(() => {
    const prev = last.current;
    last.current = key;
    if (prev === null || prev === key) return;
    const pattern = hapticFor(view);
    if (pattern) triggerHaptic(pattern);
  }, [key]); // only a stage / turn change should buzz
}

/** True while vibration is on for this room but the browser still needs a first tap to allow it. */
export function useHapticsNeedsTap(enabled: boolean): boolean {
  const [needsTap, setNeedsTap] = useState(false);
  useEffect(() => {
    if (!enabled || !hapticsSupported() || hapticsUnlocked()) return setNeedsTap(false);
    setNeedsTap(true);
    const unlock = () => setNeedsTap(false);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [enabled]);
  return needsTap;
}
