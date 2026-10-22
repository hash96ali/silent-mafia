import { SKIP, type NightState, type Player, type Team, type VoteTarget } from "../shared/types";
import type { Rng } from "./roles";

function countVotes(votes: Record<string, string>, weightOf: (voterId: string) => number = () => 1): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [voter, target] of Object.entries(votes)) counts.set(target, (counts.get(target) ?? 0) + weightOf(voter));
  return counts;
}

/**
 * Picks the Mafia's victim by majority. A tie between top picks is broken at
 * random so a split Mafia still kills someone. Then the doctor's save applies.
 */
export function resolveMafiaKill(night: NightState, rng: Rng): { targetId: string | null; killedId: string | null } {
  const counts = countVotes(night.mafiaVotes);
  if (counts.size === 0) return { targetId: null, killedId: null };

  const max = Math.max(...counts.values());
  const top = [...counts].filter(([, n]) => n === max).map(([id]) => id);
  const targetId = top[Math.floor(rng() * top.length)];
  const killedId = targetId === night.doctorTarget ? null : targetId;
  return { targetId, killedId };
}

/**
 * The Sniper's single shot. Hitting Mafia kills only the target; hitting
 * anyone else kills both the target and the Sniper. The doctor can't stop it.
 */
export function resolveSniperShot(sniper: Player, target: Player): string[] {
  return target.role === "MAFIA" ? [target.id] : [target.id, sniper.id];
}

/** A revealed Sheik's vote counts triple. */
export function voteWeight(p: Pick<Player, "role" | "revealed">): number {
  return p.role === "SHEIK" && p.revealed ? 3 : 1;
}

/**
 * Day vote: the single player with strictly the most (weighted) votes is
 * executed. Ties, or SKIP getting at least as many votes as the leader,
 * execute nobody.
 */
export function tallyVotes(
  votes: Record<string, VoteTarget>,
  weightOf?: (voterId: string) => number,
): { executedId: string | null; tally: Record<string, number> } {
  const counts = countVotes(votes, weightOf);
  const tally = Object.fromEntries(counts);
  const skips = counts.get(SKIP) ?? 0;
  counts.delete(SKIP);
  if (counts.size === 0) return { executedId: null, tally };

  const max = Math.max(...counts.values());
  const top = [...counts].filter(([, n]) => n === max);
  if (top.length > 1 || skips >= max) return { executedId: null, tally };
  return { executedId: top[0][0], tally };
}

export function checkWin(players: readonly Player[]): Team | null {
  const alive = players.filter((p) => p.alive && !p.isGM && p.role);
  const mafia = alive.filter((p) => p.role === "MAFIA").length;
  const town = alive.length - mafia;
  if (mafia === 0) return "TOWN";
  if (mafia >= town) return "MAFIA";
  return null;
}
