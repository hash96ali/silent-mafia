import { LIMITS, REVENGE_SEC } from "../shared/constants";
import { SKIP, type Phase, type Player, type Room, type Settings, type VoteTarget } from "../shared/types";
import { checkWin, resolveMafiaKill, resolveSniperShot, tallyVotes, voteWeight } from "./resolve";
import { ROLE_LABEL_AR } from "../shared/roleText";
import { validateSetup } from "../shared/rules";
import { assignRoles, type Rng } from "./roles";

// The game's state machine. `reduce` is pure: it never mutates its input and
// gets time and randomness from `ctx`, so every rule is unit-testable.

export type Action =
  | { type: "UPDATE_SETTINGS"; by: string; settings: Partial<Settings> }
  | { type: "KICK"; by: string; target: string }
  | { type: "SET_GM"; by: string; target: string | null }
  | { type: "LEAVE"; by: string }
  | { type: "START"; by: string }
  | { type: "REVEAL_ACK"; by: string }
  | { type: "NIGHT_ACT"; by: string; target: string }
  | { type: "VOTE"; by: string; target: VoteTarget }
  | { type: "REVENGE_PICK"; by: string; target: string }
  | { type: "ADVANCE"; by: string }
  | { type: "TIMEOUT"; deadline: number }
  | { type: "PLAY_AGAIN"; by: string };

export type Result = { ok: true; room: Room } | { ok: false; error: string };
export interface Ctx {
  now: number;
  rng: Rng;
}

class GameError extends Error {}

function fail(message: string): never {
  throw new GameError(message);
}

export function reduce(prev: Room, action: Action, ctx: Ctx): Result {
  const room = structuredClone(prev);
  try {
    apply(room, action, ctx);
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message };
    throw e;
  }
  room.lastActivity = ctx.now;
  return { ok: true, room };
}

function apply(room: Room, a: Action, ctx: Ctx): void {
  switch (a.type) {
    case "UPDATE_SETTINGS":
      requireHost(room, a.by);
      requirePhase(room, "LOBBY");
      room.settings = sanitizeSettings(room.settings, a.settings);
      return;

    case "KICK":
      requireHost(room, a.by);
      requirePhase(room, "LOBBY");
      if (a.target === a.by) fail("لا يمكنك إخراج نفسك.");
      getPlayer(room, a.target);
      room.players = room.players.filter((p) => p.id !== a.target);
      return;

    case "SET_GM":
      requireHost(room, a.by);
      requirePhase(room, "LOBBY");
      if (a.target) getPlayer(room, a.target);
      for (const p of room.players) p.isGM = p.id === a.target;
      return;

    case "LEAVE":
      requirePhase(room, "LOBBY");
      getPlayer(room, a.by);
      room.players = room.players.filter((p) => p.id !== a.by);
      if (room.hostId === a.by) migrateHost(room);
      return;

    case "START": {
      requireHost(room, a.by);
      requirePhase(room, "LOBBY");
      const playing = room.players.filter((p) => !p.isGM);
      const err = validateSetup(playing.length, room.settings);
      if (err) fail(err);
      const roles = assignRoles(
        playing.map((p) => p.id),
        room.settings,
        ctx.rng,
      );
      for (const p of room.players) {
        p.role = roles[p.id] ?? null;
        p.alive = true;
        p.revealed = false;
      }
      room.round = 1;
      room.investigations = {};
      room.sniperShotUsed = false;
      room.revenge = null;
      room.announcements = [];
      room.log = [];
      room.winner = null;
      for (const p of playing) log(room, ctx, `${p.name}: ${ROLE_LABEL_AR[p.role!]}.`, true);
      enterPhase(room, "ROLE_REVEAL", ctx);
      return;
    }

    case "REVEAL_ACK": {
      requirePhase(room, "ROLE_REVEAL");
      const p = getPlayer(room, a.by);
      if (p.isGM) fail("الراوي ليس لديه دور.");
      if (!room.revealAcks.includes(p.id)) room.revealAcks.push(p.id);
      if (playingPlayers(room).every((q) => room.revealAcks.includes(q.id))) enterPhase(room, "NIGHT", ctx);
      return;
    }

    case "NIGHT_ACT":
      requirePhase(room, "NIGHT");
      nightAct(room, a.by, a.target, ctx);
      if (nightComplete(room)) finishNight(room, ctx);
      return;

    case "VOTE": {
      requirePhase(room, "VOTING");
      const voter = requireAlive(room, a.by);
      if (a.target !== SKIP) {
        if (a.target === voter.id) fail("لا يمكنك التصويت لنفسك.");
        requireAlive(room, a.target);
      }
      room.votes[voter.id] = a.target;
      if (alivePlayers(room).every((p) => p.id in room.votes)) finishVoting(room, ctx);
      return;
    }

    case "REVENGE_PICK": {
      requirePhase(room, "REVENGE");
      if (a.by !== room.revenge?.uprightId) fail("وحده المواطن الصالح المُعدَم يمكنه الاختيار.");
      const target = requireAlive(room, a.target);
      target.alive = false;
      room.announcements.push({ kind: "REVENGE", round: room.round, killedIds: [target.id], byId: a.by });
      log(room, ctx, `سحب ${getPlayer(room, a.by).name} معه ${target.name}.`, false);
      endDay(room, ctx);
      return;
    }

    case "ADVANCE":
      if (a.by !== room.hostId && !getPlayer(room, a.by).isGM) fail("وحده المضيف أو الراوي يمكنه التقدّم.");
      advance(room, ctx);
      return;

    case "TIMEOUT":
      if (room.deadline === null || room.deadline !== a.deadline) fail("مؤقت منتهي.");
      advance(room, ctx);
      return;

    case "PLAY_AGAIN":
      requireHost(room, a.by);
      requirePhase(room, "GAME_OVER");
      for (const p of room.players) {
        p.role = null;
        p.alive = true;
        p.revealed = false;
      }
      room.round = 0;
      room.winner = null;
      enterPhase(room, "LOBBY", ctx);
      return;
  }
}

function advance(room: Room, ctx: Ctx): void {
  switch (room.phase) {
    case "ROLE_REVEAL":
      return enterPhase(room, "NIGHT", ctx);
    case "NIGHT":
      return finishNight(room, ctx);
    case "DAY":
      return enterPhase(room, "VOTING", ctx);
    case "VOTING":
      return finishVoting(room, ctx);
    case "REVENGE":
      log(room, ctx, `لم يسحب ${getPlayer(room, room.revenge!.uprightId).name} أحداً معه.`, false);
      return endDay(room, ctx);
    default:
      fail("لا توجد مرحلة تالية.");
  }
}

// ---------- Night ----------

function nightAct(room: Room, by: string, targetId: string, ctx: Ctx): void {
  const actor = requireAlive(room, by);
  if (targetId === SKIP) {
    if (actor.role !== "SNIPER") fail("وحده القناص يمكنه إمساك النار.");
    requireSniperShot(room);
    room.night.sniperTarget = SKIP;
    return;
  }
  const target = requireAlive(room, targetId);

  switch (actor.role) {
    case "MAFIA":
      if (target.role === "MAFIA") fail("لا يمكنك استهداف فرد من المافيا.");
      room.night.mafiaVotes[actor.id] = target.id;
      return;
    case "DOCTOR":
      room.night.doctorTarget = target.id;
      return;
    case "DETECTIVE":
      if (room.night.detectiveTarget) fail("لقد حققت بالفعل هذه الليلة.");
      if (target.id === actor.id) fail("لا يمكنك التحقيق مع نفسك.");
      room.night.detectiveTarget = target.id;
      (room.investigations[actor.id] ??= []).push({
        round: room.round,
        targetId: target.id,
        isMafia: target.role === "MAFIA",
      });
      log(room, ctx, `حقق الشرطي مع ${target.name} (${target.role === "MAFIA" ? "مافيا" : "بريء"}).`, true);
      return;
    case "SNIPER":
      requireSniperShot(room);
      if (target.id === actor.id) fail("لا يمكنك إطلاق النار على نفسك.");
      room.night.sniperTarget = target.id;
      return;
    default:
      fail("ليس لديك فعل في الليل.");
  }
}

function requireSniperShot(room: Room): void {
  if (room.sniperShotUsed) fail("لقد استخدمت رصاصتك الوحيدة.");
  if (room.night.sniperTarget !== null) fail("لقد اتخذت قرارك هذه الليلة.");
}

export function nightActors(room: Room) {
  const alive = alivePlayers(room);
  return {
    mafia: alive.filter((p) => p.role === "MAFIA"),
    doctor: alive.find((p) => p.role === "DOCTOR") ?? null,
    detective: alive.find((p) => p.role === "DETECTIVE") ?? null,
    /** Only while the shot is unused; they must shoot or hold fire each night. */
    sniper: room.sniperShotUsed ? null : (alive.find((p) => p.role === "SNIPER") ?? null),
  };
}

function nightComplete(room: Room): boolean {
  const { mafia, doctor, detective, sniper } = nightActors(room);
  return (
    mafia.every((m) => m.id in room.night.mafiaVotes) &&
    (!doctor || room.night.doctorTarget !== null) &&
    (!detective || room.night.detectiveTarget !== null) &&
    (!sniper || room.night.sniperTarget !== null)
  );
}

function finishNight(room: Room, ctx: Ctx): void {
  const { targetId, killedId } = resolveMafiaKill(room.night, ctx.rng);
  const name = (id: string | null) => (id ? getPlayer(room, id).name : "لا أحد");
  log(room, ctx, `استهدفت المافيا ${name(targetId)}، وحمى الطبيب ${name(room.night.doctorTarget)}.`, true);
  const killed = new Set(killedId ? [killedId] : []);

  // The shot and the Mafia kill happen at the same time, so a Sniper killed
  // by the Mafia tonight still fires.
  const shot = room.night.sniperTarget;
  const sniper = room.players.find((p) => p.role === "SNIPER");
  if (shot && shot !== SKIP && sniper) {
    room.sniperShotUsed = true;
    const target = getPlayer(room, shot);
    const dead = resolveSniperShot(sniper, target);
    dead.forEach((id) => killed.add(id));
    log(room, ctx, `أطلق القناص على ${target.name}${dead.length > 1 ? " (ليس مافيا؛ مات القناص أيضاً)" : " (مافيا)"}.`, true);
  }

  for (const id of killed) getPlayer(room, id).alive = false;
  room.announcements.push({ kind: "NIGHT", round: room.round, killedIds: [...killed] });
  log(room, ctx, killed.size ? `مات ${[...killed].map(name).join(" و")} في الليل.` : "نجا الجميع هذه الليلة.", false);

  if (!endIfWon(room, ctx)) enterPhase(room, "DAY", ctx);
}

// ---------- Day vote ----------

function finishVoting(room: Room, ctx: Ctx): void {
  const { executedId, tally } = tallyVotes(room.votes, (id) => voteWeight(getPlayer(room, id)));
  const voted = executedId ? getPlayer(room, executedId) : null;

  if (!voted) {
    room.announcements.push({ kind: "VOTE", round: room.round, killedIds: [], tally });
    log(room, ctx, "لم تتفق المدينة؛ لم يُعدم أحد.", false);
    return endDay(room, ctx);
  }

  // An unrevealed Sheik survives his first conviction by showing his card.
  if (voted.role === "SHEIK" && !voted.revealed) {
    voted.revealed = true;
    room.announcements.push({ kind: "VOTE", round: room.round, killedIds: [], revealedId: voted.id, tally });
    log(room, ctx, `انكشف ${voted.name} كشيخ المواطنين ونجا، وأصبح صوته بثلاثة أصوات.`, false);
    return endDay(room, ctx);
  }

  voted.alive = false;
  if (voted.role === "UPRIGHT") {
    voted.revealed = true;
    room.announcements.push({ kind: "VOTE", round: room.round, killedIds: [voted.id], revealedId: voted.id, tally });
    log(room, ctx, `أُعدم ${voted.name} وانكشف أنه المواطن الصالح.`, false);
    // Win is checked after the drag-down, since it can change the outcome.
    room.revenge = { uprightId: voted.id };
    return enterPhase(room, "REVENGE", ctx);
  }

  room.announcements.push({ kind: "VOTE", round: room.round, killedIds: [voted.id], tally });
  log(room, ctx, `أعدمت المدينة ${voted.name} بالتصويت.`, false);
  endDay(room, ctx);
}

/** Ends the day: game over if someone has won, otherwise the next night. */
function endDay(room: Room, ctx: Ctx): void {
  room.revenge = null;
  if (endIfWon(room, ctx)) return;
  room.round += 1;
  enterPhase(room, "NIGHT", ctx);
}

function endIfWon(room: Room, ctx: Ctx): boolean {
  const winner = checkWin(room.players);
  if (!winner) return false;
  room.winner = winner;
  log(room, ctx, winner === "MAFIA" ? "سيطرت المافيا على المدينة." : "تم القضاء على كل المافيا. فازت المدينة.", false);
  enterPhase(room, "GAME_OVER", ctx);
  return true;
}

// ---------- Phase entry ----------

function enterPhase(room: Room, phase: Phase, ctx: Ctx): void {
  room.phase = phase;
  const sec = { NIGHT: room.settings.nightSec, DAY: room.settings.daySec, VOTING: room.settings.voteSec, REVENGE: REVENGE_SEC }[phase as string] ?? 0;
  room.deadline = sec > 0 ? ctx.now + sec * 1000 : null;
  if (phase === "ROLE_REVEAL") room.revealAcks = [];
  if (phase === "NIGHT") room.night = { mafiaVotes: {}, doctorTarget: null, detectiveTarget: null, sniperTarget: null };
  if (phase === "VOTING") room.votes = {};
}

/** Counts how many required players have acted in the current phase, for progress UI. */
export function phaseProgress(room: Room): { done: number; required: number } {
  switch (room.phase) {
    case "ROLE_REVEAL":
      return { done: room.revealAcks.length, required: playingPlayers(room).length };
    case "NIGHT": {
      const { mafia, doctor, detective, sniper } = nightActors(room);
      const done =
        mafia.filter((m) => m.id in room.night.mafiaVotes).length +
        Number(!!doctor && room.night.doctorTarget !== null) +
        Number(!!detective && room.night.detectiveTarget !== null) +
        Number(!!sniper && room.night.sniperTarget !== null);
      return { done, required: mafia.length + Number(!!doctor) + Number(!!detective) + Number(!!sniper) };
    }
    case "REVENGE":
      return { done: 0, required: 1 };
    case "VOTING":
      return { done: Object.keys(room.votes).length, required: alivePlayers(room).length };
    default:
      return { done: 0, required: 0 };
  }
}

// ---------- Helpers ----------

/** Hands the host role to the first connected non-host player, if any. Mutates `room`. */
export function migrateHost(room: Room): boolean {
  const next = room.players.find((p) => p.id !== room.hostId && p.connected);
  if (!next) return false;
  room.hostId = next.id;
  return true;
}

export function sanitizeSettings(base: Settings, patch: Partial<Settings>): Settings {
  const int = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const sniper = bool(patch.sniper, base.sniper);
  return {
    mafiaCount: int(patch.mafiaCount, base.mafiaCount, 1, LIMITS.maxMafia),
    doctor: bool(patch.doctor, base.doctor),
    // The Sniper and the Detective can't be in the same game.
    detective: sniper ? false : bool(patch.detective, base.detective),
    sheik: bool(patch.sheik, base.sheik),
    sniper,
    upright: bool(patch.upright, base.upright),
    nightSec: int(patch.nightSec, base.nightSec, 0, LIMITS.maxPhaseSec),
    daySec: int(patch.daySec, base.daySec, 0, LIMITS.maxPhaseSec),
    voteSec: int(patch.voteSec, base.voteSec, 0, LIMITS.maxPhaseSec),
    revealRoleOnDeath: bool(patch.revealRoleOnDeath, base.revealRoleOnDeath),
  };
}

function getPlayer(room: Room, id: string): Player {
  return room.players.find((p) => p.id === id) ?? fail("اللاعب غير موجود.");
}

function requireHost(room: Room, id: string): void {
  if (room.hostId !== id) fail("وحده المضيف يمكنه فعل ذلك.");
}

function requirePhase(room: Room, phase: Phase): void {
  if (room.phase !== phase) fail("غير مسموح في هذه المرحلة.");
}

function requireAlive(room: Room, id: string): Player {
  const p = getPlayer(room, id);
  if (p.isGM) fail("الراوي لا يشارك في اللعب.");
  if (!p.alive) fail(`${p.name} ميت.`);
  return p;
}

const playingPlayers = (room: Room) => room.players.filter((p) => !p.isGM);
const alivePlayers = (room: Room) => room.players.filter((p) => !p.isGM && p.alive);

function log(room: Room, ctx: Ctx, text: string, secret: boolean): void {
  room.log.push({ round: room.round, phase: room.phase, text, secret, at: ctx.now });
}
