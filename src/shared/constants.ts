import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  mafiaCount: 1,
  doctor: true,
  detective: true,
  sheik: false,
  sniper: false,
  upright: false,
  nightSec: 30,
  daySec: 180,
  voteSec: 60,
  revealRoleOnDeath: true,
  haptics: "ROLE",
};

export const LIMITS = {
  maxPlayers: 20,
  nameMaxLength: 20,
  maxMafia: 6,
  maxPhaseSec: 900,
} as const;

/** Room codes avoid I and O so they can't be confused with 1 and 0. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;

/**
 * A night turn for a role that can't act still runs, for a random 6-14s, so
 * players can't tell that role is dead. It never shows a different countdown.
 */
export const GHOST_TURN_MIN_MS = 6_000;
export const GHOST_TURN_SPREAD_MS = 8_000;

/** How long the morning announcement stays on screen before discussion. */
export const MORNING_SEC = 15;

/** How long the vote result stays on screen before the game moves on. */
export const VERDICT_SEC = 10;

/** Time an executed Upright Citizen gets to pick who to drag down. */
export const REVENGE_SEC = 30;

/** How long a disconnected host keeps the host role before it moves to someone else. */
export const HOST_GRACE_MS = 30_000;
/** Rooms with nobody connected are deleted after this much inactivity. */
export const ROOM_IDLE_TTL_MS = 30 * 60_000;
