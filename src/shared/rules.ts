import type { Settings } from "./types";

/** Settings that each add one special town role to the deck. */
export const TOWN_SPECIALS = ["doctor", "detective", "sheik", "sniper", "upright"] as const satisfies readonly (keyof Settings)[];

/** Returns an error message if `playerCount` players can't play with these settings. */
export function validateSetup(playerCount: number, s: Settings): string | null {
  if (s.mafiaCount < 1) return "يجب وجود فرد مافيا واحد على الأقل.";
  const specials = s.mafiaCount + TOWN_SPECIALS.filter((k) => s[k]).length;
  if (playerCount < specials) return `تحتاج إلى ${specials} لاعبين على الأقل لهذه الأدوار.`;
  // Mafia must start strictly outnumbered, or they win immediately.
  if (playerCount < s.mafiaCount * 2 + 1) return `تحتاج إلى ${s.mafiaCount * 2 + 1} لاعبين على الأقل مع ${s.mafiaCount} من المافيا.`;
  return null;
}
