import type { Role, Settings } from "../shared/types";

export type Rng = () => number;

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function assignRoles(playerIds: readonly string[], s: Settings, rng: Rng): Record<string, Role> {
  const deck: Role[] = Array(s.mafiaCount).fill("MAFIA");
  if (s.doctor) deck.push("DOCTOR");
  if (s.detective && !s.sniper) deck.push("DETECTIVE");
  if (s.sheik) deck.push("SHEIK");
  if (s.sniper) deck.push("SNIPER");
  if (s.upright) deck.push("UPRIGHT");
  while (deck.length < playerIds.length) deck.push("CITIZEN");

  const dealt = shuffle(deck, rng);
  return Object.fromEntries(playerIds.map((id, i) => [id, dealt[i]]));
}
