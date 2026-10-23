import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/constants";
import { validateSetup } from "../src/shared/rules";
import type { Player, Role, Room } from "../src/shared/types";
import { reduce, sanitizeSettings, wakeAt, type Action } from "../src/server/gameMachine";
import { checkWin, resolveMafiaKill, tallyVotes } from "../src/server/resolve";
import { assignRoles } from "../src/server/roles";
import { toPlayerView, toPublicView } from "../src/server/view";
import { HAPTIC, hapticFor } from "../src/client/haptics";
import { announcementText } from "../src/components/phases";
import { clearSession, isSessionExpired, loadSession, saveSession, setFlash, takeFlash } from "../src/client/session";

const ctx = { now: 1_000, rng: () => 0 };
const TURN_MS = DEFAULT_SETTINGS.nightSec * 1000;

function player(id: string, extra: Partial<Player> = {}): Player {
  return { id, name: id, token: `t-${id}`, socketId: null, connected: true, disconnectedAt: null, isGM: false, role: null, alive: true, revealed: false, ...extra };
}

const emptyNight = (): Room["night"] => ({
  turn: null,
  queue: [],
  ghostEndsAt: null,
  mafiaSelection: null,
  mafiaTarget: null,
  doctorTarget: null,
  detectiveTarget: null,
  sniperTarget: null,
});

function room(players: Player[], extra: Partial<Room> = {}): Room {
  const has = (r: Role) => players.some((p) => p.role === r);
  return {
    code: "ABCD",
    phase: "LOBBY",
    round: 0,
    // Settings follow the roles in play, so the night only has turns for them.
    settings: players.some((p) => p.role)
      ? { ...DEFAULT_SETTINGS, doctor: has("DOCTOR"), detective: has("DETECTIVE"), sniper: has("SNIPER"), sheik: has("SHEIK"), upright: has("UPRIGHT") }
      : { ...DEFAULT_SETTINGS },
    players,
    hostId: players[0].id,
    deadline: null,
    night: emptyNight(),
    votes: {},
    revealAcks: [],
    investigations: {},
    sniperShotUsed: false,
    godfatherId: null,
    revenge: null,
    announcements: [],
    log: [],
    winner: null,
    createdAt: 0,
    lastActivity: 0,
    ...extra,
  };
}

function run(r: Room, ...actions: Action[]): Room {
  for (const a of actions) {
    const res = reduce(r, a, ctx);
    if (!res.ok) throw new Error(res.error);
    r = res.room;
  }
  return r;
}

/** Starts the night the way a real game does: the last role-reveal ack. */
function atNight(r: Room): Room {
  const playing = r.players.filter((p) => !p.isGM);
  return run({ ...r, phase: "ROLE_REVEAL", round: r.round || 1, revealAcks: playing.slice(0, -1).map((p) => p.id) }, { type: "REVEAL_ACK", by: playing.at(-1)!.id });
}

/** m=Mafia, d=Doctor, x=Detective, c1/c2=Citizens (not yet at night). */
function classicRoom(): Room {
  const roles: [string, Role][] = [["m", "MAFIA"], ["d", "DOCTOR"], ["x", "DETECTIVE"], ["c1", "CITIZEN"], ["c2", "CITIZEN"]];
  return room(roles.map(([id, role]) => player(id, { role })), { round: 1 });
}
const nightRoom = () => atNight(classicRoom());

/** m=Mafia, c1..c4=Citizens, plus one special role in seat "s". */
function specialRoom(role: Role, phase: Room["phase"] = "LOBBY"): Room {
  const ids: [string, Role][] = [["m", "MAFIA"], ["s", role], ["c1", "CITIZEN"], ["c2", "CITIZEN"], ["c3", "CITIZEN"], ["c4", "CITIZEN"]];
  return room(ids.map(([id, r]) => player(id, { role: r })), { phase, round: 1 });
}
const act = (by: string, target: string): Action => ({ type: "NIGHT_ACT", by, target });
/** Lets the post-vote result screen time out, as it does in a real game. */
const pastVerdict = (r: Room): Room => {
  expect(r.phase).toBe("VERDICT");
  return run(r, { type: "TIMEOUT", deadline: wakeAt(r)! });
};
const alive = (r: Room, id: string) => r.players.find((p) => p.id === id)!.alive;
const votes = (by: string[], target: string) => by.map((b) => ({ type: "VOTE", by: b, target }) as Action);

describe("roles", () => {
  it("deals exactly the configured roles", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g"];
    const roles = Object.values(assignRoles(ids, { ...DEFAULT_SETTINGS, mafiaCount: 2 }, Math.random));
    expect(roles.filter((r) => r === "MAFIA")).toHaveLength(2);
    expect(roles.filter((r) => r === "DOCTOR")).toHaveLength(1);
    expect(roles.filter((r) => r === "DETECTIVE")).toHaveLength(1);
    expect(roles.filter((r) => r === "CITIZEN")).toHaveLength(3);
  });

  it("rejects setups where Mafia would not be outnumbered", () => {
    expect(validateSetup(4, { ...DEFAULT_SETTINGS, mafiaCount: 2, doctor: false, detective: false })).toMatch(/5 لاعبين/);
    expect(validateSetup(5, { ...DEFAULT_SETTINGS, mafiaCount: 2, doctor: false, detective: false })).toBeNull();
  });
});

describe("resolveMafiaKill", () => {
  const night = (mafiaTarget: string | null, doctorTarget: string | null) => ({ ...emptyNight(), mafiaTarget, doctorTarget });
  it("kills the Godfather's target", () => expect(resolveMafiaKill(night("c1", "c2")).killedId).toBe("c1"));
  it("doctor save prevents the kill", () => expect(resolveMafiaKill(night("c1", "c1")).killedId).toBeNull());
  it("no target means no kill", () => expect(resolveMafiaKill(night(null, null)).killedId).toBeNull());
});

describe("tallyVotes", () => {
  it("executes a clear plurality", () => {
    expect(tallyVotes({ a: "x", b: "x", c: "y" }).executedId).toBe("x");
  });
  it("a tie executes nobody", () => {
    expect(tallyVotes({ a: "x", b: "y" }).executedId).toBeNull();
  });
  it("skip matching the leader executes nobody", () => {
    expect(tallyVotes({ a: "x", b: "SKIP" }).executedId).toBeNull();
    expect(tallyVotes({ a: "x", b: "x", c: "SKIP" }).executedId).toBe("x");
  });
});

describe("checkWin", () => {
  it("town wins when all Mafia are dead", () => {
    expect(checkWin([player("m", { role: "MAFIA", alive: false }), player("c", { role: "CITIZEN" })])).toBe("TOWN");
  });
  it("Mafia wins at parity", () => {
    expect(checkWin([player("m", { role: "MAFIA" }), player("c", { role: "CITIZEN" })])).toBe("MAFIA");
  });
  it("game continues otherwise", () => {
    expect(checkWin([player("m", { role: "MAFIA" }), player("a", { role: "CITIZEN" }), player("b", { role: "CITIZEN" })])).toBeNull();
  });
});

describe("state machine", () => {
  it("only the host can start, and only with enough players", () => {
    const r = room(["h", "a"].map((id) => player(id)));
    expect(reduce(r, { type: "START", by: "a" }, ctx)).toEqual({ ok: false, error: "وحده المضيف يمكنه فعل ذلك." });
    expect(reduce(r, { type: "START", by: "h" }, ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/3 لاعبين/) });
  });

  it("START deals roles to everyone except the GM, names a Godfather, and enters ROLE_REVEAL", () => {
    const r = room(["h", "a", "b", "c", "d"].map((id) => player(id, { isGM: id === "h" })));
    const next = run(r, { type: "START", by: "h" });
    expect(next.phase).toBe("ROLE_REVEAL");
    expect(next.players.find((p) => p.id === "h")!.role).toBeNull();
    expect(next.players.filter((p) => p.role).length).toBe(4);
    expect(next.players.find((p) => p.id === next.godfatherId)!.role).toBe("MAFIA");
    expect(r.phase).toBe("LOBBY"); // input untouched
  });

  it("all reveal acks start the first night on the Mafia turn", () => {
    const r = room(["h", "a", "b", "c"].map((id) => player(id)));
    const next = run(r, { type: "START", by: "h" }, ...["h", "a", "b", "c"].map((by) => ({ type: "REVEAL_ACK", by }) as Action));
    expect(next.phase).toBe("NIGHT");
    expect(next.night.turn).toBe("MAFIA");
    expect(next.deadline).toBe(ctx.now + TURN_MS); // the Mafia turn's own timer
  });

  it("voting out the last Mafia ends the game for the town", () => {
    const r = run(
      { ...classicRoom(), phase: "VOTING" },
      ...["d", "x", "c1", "c2"].map((by) => ({ type: "VOTE", by, target: "m" }) as Action),
      { type: "VOTE", by: "m", target: "c1" },
    );
    expect(alive(r, "m")).toBe(false);
    const end = pastVerdict(r);
    expect(end.phase).toBe("GAME_OVER");
    expect(end.winner).toBe("TOWN");
  });

  it("after the vote, the result stays on screen before the game moves on", () => {
    const r = run({ ...classicRoom(), phase: "VOTING" }, ...votes(["d", "x"], "c1"), { type: "VOTE", by: "c1", target: "SKIP" });
    // Not everyone voted: end voting by timer.
    const v = run({ ...r, deadline: 9_000 }, { type: "TIMEOUT", deadline: 9_000 });
    expect(v.phase).toBe("VERDICT");
    expect(v.deadline).toBe(ctx.now + 10_000);
    expect(v.announcements.at(-1)).toMatchObject({ kind: "VOTE", killedIds: ["c1"], tally: { c1: 2, SKIP: 1 }, notVoted: 2 });
    expect(toPublicView(v).announcements.at(-1)!.tally).toEqual({ c1: 2, SKIP: 1 }); // counts only, never who voted for whom
    expect(JSON.stringify(toPublicView(v))).not.toMatch(/"votes"/);
    // The host can skip the result screen.
    expect(run(v, { type: "ADVANCE", by: "m" }).phase).toBe("NIGHT");
  });
});

describe("sequential night turns", () => {
  it("runs Mafia → Doctor → Detective, then resolves", () => {
    let r = nightRoom();
    expect(r.night.turn).toBe("MAFIA");
    expect(r.night.queue).toEqual(["DOCTOR", "DETECTIVE"]);

    r = run(r, act("m", "c1"));
    expect(r.night.turn).toBe("DOCTOR");
    r = run(r, act("d", "c2"));
    expect(r.night.turn).toBe("DETECTIVE");
    r = run(r, act("x", "m"), { type: "NIGHT_DONE", by: "x" });

    expect(r.phase).toBe("MORNING");
    expect(alive(r, "c1")).toBe(false);
    expect(r.announcements.at(-1)).toMatchObject({ kind: "NIGHT", killedIds: ["c1"] });
    expect(r.investigations.x).toEqual([{ round: 1, targetId: "m", isMafia: true }]);
  });

  it("nobody can act out of turn", () => {
    const r = nightRoom();
    expect(reduce(r, act("d", "c1"), ctx)).toMatchObject({ ok: false, error: "ليس دورك الآن." });
    expect(reduce(r, act("x", "m"), ctx).ok).toBe(false);
    expect(reduce(r, act("c1", "m"), ctx).ok).toBe(false);
    expect(reduce(r, act("m", "m"), ctx).ok).toBe(false); // can't target Mafia
    const doctorTurn = run(r, act("m", "c1"));
    expect(reduce(doctorTurn, act("m", "c2"), ctx).ok).toBe(false); // Mafia's turn is over
  });

  it("every role gets its own full turn timer", () => {
    const r = nightRoom(); // Mafia, Doctor, Detective
    expect(r.deadline).toBe(ctx.now + TURN_MS);
    expect(wakeAt(r)).toBe(ctx.now + TURN_MS);
    expect(reduce(r, { type: "TIMEOUT", deadline: 4_000 }, ctx).ok).toBe(false);

    // The Mafia uses its whole turn; the Doctor still gets a full turn of its own.
    const late = { now: ctx.now + TURN_MS, rng: ctx.rng };
    const res = reduce(r, { type: "TIMEOUT", deadline: wakeAt(r)! }, late);
    expect(res.ok).toBe(true);
    const next = (res as { room: Room }).room;
    expect(next.night.turn).toBe("DOCTOR");
    expect(next.night.mafiaTarget).toBeNull();
    expect(next.deadline).toBe(late.now + TURN_MS);
  });

  it("everyone is told the latest the night can end", () => {
    const r = nightRoom();
    expect(toPlayerView(r, "c1").nightEndsBy).toBe(ctx.now + 3 * TURN_MS);
    const doctorTurn = run(r, act("m", "c1")); // Mafia decided instantly
    expect(toPublicView(doctorTurn).nightEndsBy).toBe(ctx.now + 2 * TURN_MS);
    expect(toPlayerView({ ...r, phase: "DAY" }, "c1").nightEndsBy).toBeNull();
  });

  it("the stage tells every screen which night turn to show", () => {
    let r = nightRoom();
    expect(toPlayerView(r, "c1").stage).toBe("NIGHT_MAFIA_TURN");
    r = run(r, act("m", "c1"));
    expect(toPublicView(r).stage).toBe("NIGHT_DOCTOR_TURN");
    r = run(r, act("d", "c2"));
    expect(toPlayerView(r, "x").stage).toBe("NIGHT_SPECIAL_TURN");
    r = run(r, act("x", "m"), { type: "NIGHT_DONE", by: "x" });
    expect(toPlayerView(r, "c2").stage).toBe("DAY_ANNOUNCEMENT");
    r = run(r, { type: "TIMEOUT", deadline: wakeAt(r)! });
    expect(r.phase).toBe("DAY");
    expect(toPlayerView(r, "c2").stage).toBe("DISCUSSION");
  });

  it("a dead role's turn still runs, with the same visible countdown, then skips itself", () => {
    const base = classicRoom();
    base.players.find((p) => p.id === "d")!.alive = false;
    let r = run(atNight(base), act("m", "c1"));
    expect(r.night.turn).toBe("DOCTOR");
    expect(r.deadline).toBe(ctx.now + TURN_MS); // same turn countdown as a live role
    expect(r.night.ghostEndsAt).toBeGreaterThan(ctx.now);
    expect(r.night.ghostEndsAt).toBeLessThanOrEqual(r.deadline!);
    expect(toPublicView(r)).not.toHaveProperty("night");
    expect(JSON.stringify(toPlayerView(r, "c1"))).not.toContain("ghost");

    r = run(r, { type: "TIMEOUT", deadline: wakeAt(r)! });
    expect(r.night.turn).toBe("DETECTIVE");
  });

  it("only the roles the host enabled get a turn", () => {
    expect(atNight(specialRoom("SHEIK")).night.queue).toEqual([]); // Sheik has no night action
    expect(atNight(specialRoom("SNIPER")).night.queue).toEqual(["SNIPER"]);
  });
});

describe("Detective result", () => {
  it("the turn waits on the result screen until the Detective acknowledges", () => {
    let r = run(nightRoom(), act("m", "c1"), act("d", "c2"), act("x", "m"));
    expect(r.phase).toBe("NIGHT");
    expect(r.night.turn).toBe("DETECTIVE");
    expect(toPlayerView(r, "x").investigations).toEqual([{ round: 1, targetId: "m", isMafia: true }]);
    expect(reduce(r, act("x", "c1"), ctx).ok).toBe(false); // one investigation per night
    expect(reduce(r, { type: "NIGHT_DONE", by: "c1" }, ctx).ok).toBe(false);
    r = run(r, { type: "NIGHT_DONE", by: "x" });
    expect(r.phase).toBe("MORNING");
  });

  it("can't skip the turn without investigating, but the turn's time still runs out", () => {
    const r = run(nightRoom(), act("m", "c1"), act("d", "c2"));
    expect(reduce(r, { type: "NIGHT_DONE", by: "x" }, ctx).ok).toBe(false);
    expect(run(r, act("x", "m"), { type: "TIMEOUT", deadline: wakeAt(run(r, act("x", "m")))! }).phase).toBe("MORNING");
  });
});

describe("End game", () => {
  it("the host can end mid-game: everyone back in the lobby, still seated, all game state cleared", () => {
    const mid = run(nightRoom(), act("m", "c1"), act("d", "c2"), act("x", "m"), { type: "NIGHT_DONE", by: "x" });
    expect(alive(mid, "c1")).toBe(false);
    const r = run(mid, { type: "END_GAME", by: "m" }); // m is the host
    expect(r.phase).toBe("LOBBY");
    expect(r.players.map((p) => p.id)).toEqual(["m", "d", "x", "c1", "c2"]);
    expect(r.players.every((p) => p.alive && p.role === null && !p.revealed)).toBe(true);
    expect(r).toMatchObject({ round: 0, deadline: null, godfatherId: null, winner: null, revenge: null, sniperShotUsed: false, votes: {}, investigations: {}, announcements: [], log: [] });
    expect(r.night.turn).toBeNull();
    expect(toPlayerView(r, "c1").players.filter((p) => p.role)).toHaveLength(0);
  });

  it("only the host can end, and only once a game has started", () => {
    expect(reduce(nightRoom(), { type: "END_GAME", by: "c1" }, ctx).ok).toBe(false);
    expect(reduce(classicRoom(), { type: "END_GAME", by: "m" }, ctx).ok).toBe(false);
  });
});

describe("Godfather", () => {
  /** m and m2 are Mafia; rng 0 makes m the first Godfather. */
  const twoMafia = () => {
    const r = classicRoom();
    r.players.push(player("m2", { role: "MAFIA" }), player("c3", { role: "CITIZEN" }));
    return r;
  };

  it("only the Godfather can choose the kill", () => {
    const r = atNight(twoMafia());
    expect(r.godfatherId).toBe("m");
    expect(reduce(r, act("m2", "c1"), ctx)).toMatchObject({ ok: false, error: "وحده كبير المافيا يقرر الضحية." });
    expect(reduce(r, { type: "NIGHT_SELECT", by: "m2", target: "c1" }, ctx).ok).toBe(false);
    expect(run(r, act("m", "c1")).night.mafiaTarget).toBe("c1");
  });

  it("the other Mafia see the Godfather's pick live; nobody else does", () => {
    const r = run(atNight(twoMafia()), { type: "NIGHT_SELECT", by: "m", target: "c2" });
    expect(toPlayerView(r, "m2")).toMatchObject({ godfatherId: "m", mafiaSelection: "c2", nightTurn: "MAFIA" });
    const citizen = toPlayerView(r, "c1");
    expect(citizen.godfatherId).toBeUndefined();
    expect(citizen.mafiaSelection).toBeUndefined();
    expect(toPlayerView(run(r, act("m", "c2")), "m2").mafiaSelection).toBeUndefined(); // Mafia turn over
  });

  it("if time runs out, the Godfather's highlighted pick still counts", () => {
    const r = run(atNight(twoMafia()), { type: "NIGHT_SELECT", by: "m", target: "c2" });
    expect(run(r, { type: "TIMEOUT", deadline: wakeAt(r)! }).night.mafiaTarget).toBe("c2");
  });

  it("passes to a living Mafia member when the Godfather is voted out", () => {
    const r = run({ ...twoMafia(), phase: "VOTING" }, ...votes(["d", "x", "c1", "c2", "c3", "m2"], "m"), { type: "VOTE", by: "m", target: "c1" });
    expect(alive(r, "m")).toBe(false);
    expect(r.godfatherId).toBe("m2");
    const night = pastVerdict(r);
    expect(night.phase).toBe("NIGHT");
    expect(run(night, act("m2", "c1")).night.mafiaTarget).toBe("c1");
  });

  it("passes on when the Sniper kills the Godfather at night", () => {
    const base = specialRoom("SNIPER");
    base.players.push(player("m2", { role: "MAFIA" }), player("c5", { role: "CITIZEN" }));
    const r = run(atNight(base), act("m", "c1"), act("s", "m"));
    expect(alive(r, "m")).toBe(false);
    expect(r.godfatherId).toBe("m2");
  });
});

describe("view redaction", () => {
  it("a citizen sees only their own role", () => {
    const v = toPlayerView(nightRoom(), "c1");
    expect(v.players.filter((p) => p.role).map((p) => p.id)).toEqual(["c1"]);
    expect(v.gm).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain("t-");
  });

  it("Mafia see each other", () => {
    const r = classicRoom();
    r.players.push(player("m2", { role: "MAFIA" }));
    const v = toPlayerView(atNight(r), "m");
    expect(v.players.filter((p) => p.role).map((p) => p.id).sort()).toEqual(["m", "m2"]);
  });

  it("the GM sees everything", () => {
    const r = nightRoom();
    r.players.push(player("gm", { isGM: true }));
    const v = toPlayerView(r, "gm");
    expect(v.players.filter((p) => p.role)).toHaveLength(5);
    expect(v.gm).toBeDefined();
    expect(v.godfatherId).toBe("m");
  });

  it("dead players' roles are revealed only when the setting is on", () => {
    const r = nightRoom();
    r.players.find((p) => p.id === "d")!.alive = false;
    expect(r.settings.revealRoleOnDeath).toBe(true); // revealed on elimination by default
    expect(toPlayerView(r, "c1").players.find((p) => p.id === "d")!.role).toBe("DOCTOR");
    r.settings.revealRoleOnDeath = false;
    expect(toPlayerView(r, "c1").players.find((p) => p.id === "d")!.role).toBeUndefined();
  });
});

describe("settings", () => {
  it("enabling the Sniper forces the Detective off", () => {
    const s = sanitizeSettings(DEFAULT_SETTINGS, { sniper: true });
    expect(s).toMatchObject({ sniper: true, detective: false });
    expect(sanitizeSettings(s, { detective: true }).detective).toBe(false);
    expect(sanitizeSettings(s, { sniper: false, detective: true }).detective).toBe(true);
  });

  it("deals every enabled custom role exactly once", () => {
    const s = { ...DEFAULT_SETTINGS, sheik: true, sniper: true, upright: true, detective: false };
    const roles = Object.values(assignRoles(["a", "b", "c", "d", "e", "f", "g"], s, Math.random));
    for (const r of ["MAFIA", "DOCTOR", "SHEIK", "SNIPER", "UPRIGHT"]) expect(roles.filter((x) => x === r)).toHaveLength(1);
    expect(roles).not.toContain("DETECTIVE");
    expect(validateSetup(4, s)).toMatch(/5 لاعبين/);
  });
});

describe("Sniper", () => {
  it("shooting Mafia kills only the target and spends the bullet", () => {
    const r = run(atNight(specialRoom("SNIPER")), act("m", "c1"), act("s", "m"));
    expect(r.phase).toBe("GAME_OVER");
    expect([alive(r, "m"), alive(r, "s"), alive(r, "c1")]).toEqual([false, true, false]);
    expect(r.sniperShotUsed).toBe(true);
    expect(r.winner).toBe("TOWN");
  });

  it("shooting a non-Mafia kills both target and Sniper, even if the doctor saved them", () => {
    const base = specialRoom("SNIPER");
    base.players.push(player("d", { role: "DOCTOR" }));
    base.settings.doctor = true;
    const r = run(atNight(base), act("m", "c1"), act("d", "c2"), act("s", "c2"));
    expect(r.phase).toBe("MORNING");
    expect([alive(r, "c2"), alive(r, "s"), alive(r, "c1")]).toEqual([false, false, false]);
    expect(r.announcements.at(-1)!.killedIds.sort()).toEqual(["c1", "c2", "s"]);
  });

  it("can hold fire on its turn", () => {
    let r = run(atNight(specialRoom("SNIPER")), act("m", "c1"));
    expect(r.night.turn).toBe("SNIPER");
    r = run(r, act("s", "SKIP"));
    expect(r.phase).toBe("MORNING");
    expect(r.sniperShotUsed).toBe(false);
  });

  it("has only one bullet per game; the spent Sniper's turn runs as a ghost turn", () => {
    const r = run(atNight({ ...specialRoom("SNIPER"), sniperShotUsed: true }), act("m", "c1"));
    expect(r.night.turn).toBe("SNIPER");
    expect(r.night.ghostEndsAt).not.toBeNull();
    expect(reduce(r, act("s", "m"), ctx).ok).toBe(false);
    expect(run(r, { type: "TIMEOUT", deadline: wakeAt(r)! }).phase).toBe("MORNING");
  });

  it("only the Sniper can skip", () => {
    expect(reduce(atNight(specialRoom("SNIPER")), act("m", "SKIP"), ctx).ok).toBe(false);
  });
});

describe("Sheik of Citizens", () => {
  it("survives his first conviction by revealing, then votes with weight 3", () => {
    let r = run(specialRoom("SHEIK", "VOTING"), ...votes(["m", "c1", "c2", "c3"], "s"), { type: "VOTE", by: "c4", target: "m" }, { type: "VOTE", by: "s", target: "m" });
    expect(alive(r, "s")).toBe(true);
    expect(r.players.find((p) => p.id === "s")!.revealed).toBe(true);
    expect(r.announcements.at(-1)).toMatchObject({ kind: "VOTE", killedIds: [], revealedId: "s" });
    r = pastVerdict(r);
    expect(r.phase).toBe("NIGHT");
    expect(toPlayerView(r, "c1").players.find((p) => p.id === "s")).toMatchObject({ role: "SHEIK", voteWeight: 3 });

    // Next day: Sheik (3) + c1 (1) outvote three others for c4.
    r = run({ ...r, phase: "VOTING", votes: {} }, { type: "VOTE", by: "s", target: "m" }, { type: "VOTE", by: "c1", target: "m" }, ...votes(["m", "c2", "c3"], "c4"), { type: "VOTE", by: "c4", target: "c3" });
    expect(r.announcements.at(-1)!.tally).toMatchObject({ m: 4, c4: 3 });
    expect(alive(r, "m")).toBe(false);
  });

  it("is executed normally the second time", () => {
    const r = specialRoom("SHEIK", "VOTING");
    r.players.find((p) => p.id === "s")!.revealed = true;
    const next = run(r, ...votes(["m", "c1", "c2", "c3", "c4"], "s"), { type: "VOTE", by: "s", target: "m" });
    expect(alive(next, "s")).toBe(false);
  });

  it("dies to the Mafia at night without revealing", () => {
    const r = run(atNight(specialRoom("SHEIK")), act("m", "s"));
    expect(alive(r, "s")).toBe(false);
    expect(r.players.find((p) => p.id === "s")!.revealed).toBe(false);
  });
});

describe("Upright Citizen", () => {
  it("when voted out, drags down a player of their choice before the night", () => {
    let r = run(specialRoom("UPRIGHT", "VOTING"), ...votes(["m", "c1", "c2", "c3", "c4"], "s"), { type: "VOTE", by: "s", target: "m" });
    expect(toPlayerView(r, "c1").revengeBy).toBe("s"); // the result screen says a drag-down comes next
    r = pastVerdict(r);
    expect(r.phase).toBe("REVENGE");
    expect(r.revenge).toEqual({ uprightId: "s" });
    expect(r.deadline).toBe(ctx.now + 30_000);
    expect(alive(r, "s")).toBe(false);
    expect(toPlayerView(r, "c1").players.find((p) => p.id === "s")!.role).toBe("UPRIGHT");

    expect(reduce(r, { type: "REVENGE_PICK", by: "c1", target: "m" }, ctx).ok).toBe(false);
    r = run(r, { type: "REVENGE_PICK", by: "s", target: "m" });
    expect(alive(r, "m")).toBe(false);
    expect(r.announcements.at(-1)).toMatchObject({ kind: "REVENGE", killedIds: ["m"], byId: "s" });
    expect(r.phase).toBe("GAME_OVER");
    expect(r.winner).toBe("TOWN");
  });

  it("taking nobody (timeout) moves on to the next night", () => {
    let r = pastVerdict(run(specialRoom("UPRIGHT", "VOTING"), ...votes(["m", "c1", "c2", "c3", "c4"], "s"), { type: "VOTE", by: "s", target: "m" }));
    r = run(r, { type: "TIMEOUT", deadline: r.deadline! });
    expect(r.phase).toBe("NIGHT");
    expect(r.round).toBe(2);
    expect(r.revenge).toBeNull();
  });

  it("gets no revenge when killed at night", () => {
    const r = run(atNight(specialRoom("UPRIGHT")), act("m", "s"));
    expect(r.phase).toBe("MORNING");
    expect(r.revenge).toBeNull();
  });
});

describe("projector safety", () => {
  it("the public screen view carries no secrets", () => {
    const r = run(nightRoom(), { type: "NIGHT_SELECT", by: "m", target: "c1" });
    r.investigations = { x: [{ round: 1, targetId: "m", isMafia: true }] };
    const v = toPublicView(r);
    expect(v.nightTurn).toBe("MAFIA"); // whose turn it is is public, like a narrator calling it
    expect(v.players.filter((p) => p.role)).toHaveLength(0);
    expect(v.meId).toBe("");
    expect(v.godfatherId).toBeUndefined();
    expect(v.mafiaSelection).toBeUndefined();
    expect(v.investigations).toBeUndefined();
    expect(v.gm).toBeUndefined();
    expect(v.log).toHaveLength(0);
    expect(JSON.stringify(v)).not.toMatch(/"role"|"c1"\]|t-m|ghost/);
  });

  it("only public role reveals reach the screen", () => {
    const r = specialRoom("SHEIK", "DAY");
    r.players.find((p) => p.id === "s")!.revealed = true;
    expect(toPublicView(r).players.filter((p) => p.role).map((p) => p.id)).toEqual(["s"]);
    expect(toPublicView({ ...r, phase: "GAME_OVER" }).players.filter((p) => p.role)).toHaveLength(6);
  });

  it("night turn progress is shown to the GM only", () => {
    const r = run(nightRoom(), act("m", "c1"));
    expect(toPlayerView(r, "c1").progress).toEqual({ done: 0, required: 0 });
    expect(toPublicView(r).progress).toEqual({ done: 0, required: 0 });
    r.players.push(player("gm", { isGM: true }));
    expect(toPlayerView(r, "gm").progress).toEqual({ done: 1, required: 3 });
  });
});

describe("haptics", () => {
  const twoMafia = () => {
    const r = classicRoom();
    r.players.push(player("m2", { role: "MAFIA" }), player("c3", { role: "CITIZEN" }));
    return atNight(r);
  };
  const feel = (r: Room, id: string) => hapticFor(toPlayerView(r, id));

  it("ROLE mode: only the player whose turn it is buzzes, the Godfather harder", () => {
    let r = twoMafia();
    expect(feel(r, "m")).toEqual(HAPTIC.GODFATHER);
    expect(feel(r, "m2")).toEqual(HAPTIC.MAFIA);
    expect(feel(r, "d")).toBeNull();
    expect(feel(r, "c1")).toBeNull();
    r = run(r, act("m", "c1"));
    expect(feel(r, "d")).toEqual(HAPTIC.DOCTOR);
    expect(feel(r, "m")).toBeNull();
    r = run(r, act("d", "c2"));
    expect(feel(r, "x")).toEqual(HAPTIC.SPECIAL);
  });

  it("everyone alive gets an alert for the morning and for voting", () => {
    const r = run(twoMafia(), act("m", "c1"), act("d", "c2"), act("x", "m"), { type: "NIGHT_DONE", by: "x" });
    expect(r.phase).toBe("MORNING");
    expect(feel(r, "c2")).toEqual(HAPTIC.ALERT);
    expect(feel(r, "c1")).toBeNull(); // died tonight
    expect(feel({ ...r, phase: "VOTING" }, "m2")).toEqual(HAPTIC.ALERT);
  });

  it("ALL mode buzzes every living player on every turn; OFF never buzzes", () => {
    const base = twoMafia();
    const all = { ...base, settings: { ...base.settings, haptics: "ALL" as const } };
    for (const id of ["m", "m2", "d", "x", "c1"]) expect(feel(all, id)).toEqual(HAPTIC.EVERYONE);
    const off = { ...base, settings: { ...base.settings, haptics: "OFF" as const } };
    for (const id of ["m", "m2", "d", "x", "c1"]) expect(feel(off, id)).toBeNull();
  });
});

describe("morning announcement", () => {
  const morningText = (r: Room) => {
    const v = toPlayerView(r, "c1");
    return announcementText(v.announcements.at(-1)!, v);
  };

  it("one player killed", () => {
    const r = run(nightRoom(), act("m", "c2"), act("d", "x"), act("x", "m"), { type: "NIGHT_DONE", by: "x" });
    expect(r.phase).toBe("MORNING");
    expect(r.deadline).toBe(ctx.now + 15_000);
    expect(alive(r, "c2")).toBe(false);
    expect(morningText(r)).toBe("طلع الصباح... للأسف تم اغتيال اللاعب c2 الليلة الماضية.");
  });

  it("saved by the Doctor: nobody died", () => {
    const r = run(nightRoom(), act("m", "c2"), act("d", "c2"), act("x", "m"), { type: "NIGHT_DONE", by: "x" });
    expect(alive(r, "c2")).toBe(true);
    expect(morningText(r)).toBe("طلع الصباح... هادئة كانت الليلة، ولم يمت أحد!");
  });

  it("a Sniper miss lists every player who fell", () => {
    const base = specialRoom("SNIPER");
    base.players.push(player("m2", { role: "MAFIA" }), player("c5", { role: "CITIZEN" }));
    const r = run(atNight(base), act("m", "c1"), act("s", "c2"));
    expect(r.phase).toBe("MORNING");
    expect(r.announcements.at(-1)!.killedIds.sort()).toEqual(["c1", "c2", "s"]);
    for (const name of ["c1", "c2", "s"]) expect(morningText(r)).toContain(name);
  });

  it("the host moves the town on to discussion", () => {
    const r = run(nightRoom(), act("m", "c2"), act("d", "x"), act("x", "m"), { type: "NIGHT_DONE", by: "x" });
    expect(reduce(r, { type: "ADVANCE", by: "c1" }, ctx).ok).toBe(false);
    expect(run(r, { type: "ADVANCE", by: "m" }).phase).toBe("DAY");
  });
});

describe("stored session", () => {
  it("expires after 2 hours without activity", () => {
    const now = 10 * 60 * 60_000;
    expect(isSessionExpired({ lastSeen: now - 60 * 60_000 }, now)).toBe(false);
    expect(isSessionExpired({ lastSeen: now - 2 * 60 * 60_000 - 1 }, now)).toBe(true);
  });

  it("saves, loads and clears (works without localStorage)", () => {
    saveSession({ code: "ABCD", playerId: "p", token: "t" });
    const s = loadSession()!;
    expect(s).toMatchObject({ code: "ABCD", playerId: "p", token: "t" });
    expect(isSessionExpired(s)).toBe(false);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it("a notice is shown once", () => {
    setFlash("hello");
    expect(takeFlash()).toBe("hello");
    expect(takeFlash()).toBeNull();
  });
});
