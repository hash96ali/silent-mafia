import { stageOf, type Player, type PlayerView, type PublicPlayer, type Room } from "../shared/types";
import { phaseProgress } from "./gameMachine";
import { voteWeight } from "./resolve";

// Builds what a single client is allowed to see. This is the only path by
// which room state leaves the server, so every secret must be filtered here.

/** `viewer` null is the public projector screen: it only sees what everyone may see. */
function canSeeRole(room: Room, viewer: Player | null, target: Player): boolean {
  if (!target.role) return false;
  if (room.phase === "GAME_OVER" || target.revealed) return true;
  if (viewer && (viewer.isGM || viewer.id === target.id)) return true;
  if (viewer?.role === "MAFIA" && target.role === "MAFIA") return true;
  return !target.alive && room.settings.revealRoleOnDeath;
}

/** The view for the shared projector / TV screen. */
export function toPublicView(room: Room, now = Date.now()): PlayerView {
  return toPlayerView(room, null, now);
}

export function toPlayerView(room: Room, viewerId: string | null, now = Date.now()): PlayerView {
  const viewer = viewerId === null ? null : room.players.find((p) => p.id === viewerId);
  if (viewer === undefined) throw new Error(`Player ${viewerId} is not in room ${room.code}`);

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

  const isMafia = viewer?.role === "MAFIA";
  const seesGodfather = isMafia || !!viewer?.isGM || room.phase === "GAME_OVER";
  const night = room.phase === "NIGHT";
  const myNightTarget =
    !night || !viewer
      ? null
      : isMafia
        ? room.night.mafiaTarget
        : viewer.role === "DOCTOR"
          ? room.night.doctorTarget
          : viewer.role === "DETECTIVE"
            ? room.night.detectiveTarget
            : viewer.role === "SNIPER"
              ? room.night.sniperTarget
              : null;

  const fullLog = !!viewer?.isGM || room.phase === "GAME_OVER";
  // How many night actors have acted reveals how many special roles are alive,
  // so only the GM gets the night count.
  const progress = room.phase === "NIGHT" && !viewer?.isGM ? { done: 0, required: 0 } : phaseProgress(room);

  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    settings: room.settings,
    deadline: room.deadline,
    serverNow: now,
    meId: viewer?.id ?? "",
    isHost: !!viewer && viewer.id === room.hostId,
    players,
    myNightTarget,
    myVote: viewer && room.phase === "VOTING" ? (room.votes[viewer.id] ?? null) : null,
    hasAckedReveal: !!viewer && room.revealAcks.includes(viewer.id),
    stage: stageOf(room.phase, night ? room.night.turn : null),
    nightTurn: night ? room.night.turn : null,
    ...(seesGodfather && room.godfatherId ? { godfatherId: room.godfatherId } : {}),
    ...(isMafia && night && room.night.turn === "MAFIA" ? { mafiaSelection: room.night.mafiaSelection } : {}),
    ...(viewer?.role === "DETECTIVE" ? { investigations: room.investigations[viewer.id] ?? [] } : {}),
    ...(viewer?.role === "SNIPER" ? { sniperShotAvailable: !room.sniperShotUsed } : {}),
    revengeBy: room.revenge?.uprightId ?? null,
    announcements: room.announcements,
    progress,
    winner: room.winner,
    log: fullLog ? room.log : room.log.filter((e) => !e.secret),
    ...(viewer?.isGM
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
