import type { Player, PlayerView, PublicPlayer, Room } from "../shared/types";
import { phaseProgress } from "./gameMachine";
import { voteWeight } from "./resolve";

// Builds what a single client is allowed to see. This is the only path by
// which room state leaves the server, so every secret must be filtered here.

function canSeeRole(room: Room, viewer: Player, target: Player): boolean {
  if (!target.role) return false;
  if (viewer.isGM || room.phase === "GAME_OVER" || viewer.id === target.id || target.revealed) return true;
  if (viewer.role === "MAFIA" && target.role === "MAFIA") return true;
  return !target.alive && room.settings.revealRoleOnDeath;
}

export function toPlayerView(room: Room, viewerId: string, now = Date.now()): PlayerView {
  const viewer = room.players.find((p) => p.id === viewerId);
  if (!viewer) throw new Error(`Player ${viewerId} is not in room ${room.code}`);

  const players: PublicPlayer[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    connected: p.connected,
    isHost: p.id === room.hostId,
    isGM: p.isGM,
    revealed: p.revealed,
    voteWeight: voteWeight(p),
    ...(canSeeRole(room, viewer, p) ? { role: p.role! } : {}),
  }));

  const isMafia = viewer.role === "MAFIA";
  const myNightTarget =
    room.phase !== "NIGHT"
      ? null
      : isMafia
        ? (room.night.mafiaVotes[viewer.id] ?? null)
        : viewer.role === "DOCTOR"
          ? room.night.doctorTarget
          : viewer.role === "DETECTIVE"
            ? room.night.detectiveTarget
            : viewer.role === "SNIPER"
              ? room.night.sniperTarget
              : null;

  const fullLog = viewer.isGM || room.phase === "GAME_OVER";

  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    settings: room.settings,
    deadline: room.deadline,
    serverNow: now,
    meId: viewer.id,
    isHost: viewer.id === room.hostId,
    players,
    myNightTarget,
    myVote: room.phase === "VOTING" ? (room.votes[viewer.id] ?? null) : null,
    hasAckedReveal: room.revealAcks.includes(viewer.id),
    ...(isMafia && room.phase === "NIGHT" ? { mafiaVotes: room.night.mafiaVotes } : {}),
    ...(viewer.role === "DETECTIVE" ? { investigations: room.investigations[viewer.id] ?? [] } : {}),
    ...(viewer.role === "SNIPER" ? { sniperShotAvailable: !room.sniperShotUsed } : {}),
    revengeBy: room.revenge?.uprightId ?? null,
    announcements: room.announcements,
    progress: phaseProgress(room),
    winner: room.winner,
    log: fullLog ? room.log : room.log.filter((e) => !e.secret),
    ...(viewer.isGM
      ? {
          gm: {
            night: room.night,
            votes: room.votes,
            revealAcks: room.revealAcks,
            investigations: room.investigations,
          },
        }
      : {}),
  };
}
