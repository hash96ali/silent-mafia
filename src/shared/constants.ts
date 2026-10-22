import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  mafiaCount: 1,
  doctor: true,
  detective: true,
  sheik: false,
  sniper: false,
  upright: false,
  nightSec: 60,
  daySec: 180,
  voteSec: 60,
  revealRoleOnDeath: true,
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

/** Time an executed Upright Citizen gets to pick who to drag down. */
export const REVENGE_SEC = 30;

/** How long a disconnected host keeps the host role before it moves to someone else. */
export const HOST_GRACE_MS = 30_000;
/** Rooms with nobody connected are deleted after this much inactivity. */
export const ROOM_IDLE_TTL_MS = 30 * 60_000;
