import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/constants";
import { validateSetup } from "../src/shared/rules";
import type { Player, Role, Room } from "../src/shared/types";
import { reduce, type Action } from "../src/server/gameMachine";
import { checkWin, resolveMafiaKill as resolveNight, tallyVotes } from "../src/server/resolve";
import { assignRoles } from "../src/server/roles";
import { sanitizeSettings } from "../src/server/gameMachine";
import { toPlayerView, toPublicView } from "../src/server/view";

const ctx = { now: 1_000, rng: () => 0 };

function player(id: string, extra: Partial<Player> = {}): Player {
  return { id, name: id, token: `t-${id}`, socketId: null, connected: true, disconnectedAt: null, isGM: false, role: null, alive: true, revealed: false, ...extra };
}

function room(players: Player[], extra: Partial<Room> = {}): Room {
  return {
    code: "ABCD",
    phase: "LOBBY",
    round: 0,
    settings: { ...DEFAULT_SETTINGS },
    players,
    hostId: players[0].id,
    deadline: null,
    night: { mafiaVotes: {}, doctorTarget: null, detectiveTarget: null, sniperTarget: null },
    votes: {},
    revealAcks: [],
    investigations: {},
    sniperShotUsed: false,
    revenge: null,
    announcements: [],
    log: [],
    winner: null,
    createdAt: 0,
    lastActivity: 0,
    ...extra,
  };
}

/** A room already in NIGHT with fixed roles: m=Mafia, d=Doctor, x=Detective, c1/c2=Citizens. */
function nightRoom(): Room {
  const roles: [string, Role][] = [["m", "MAFIA"], ["d", "DOCTOR"], ["x", "DETECTIVE"], ["c1", "CITIZEN"], ["c2", "CITIZEN"]];
  return room(roles.map(([id, role]) => player(id, { role })), { phase: "NIGHT", round: 1 });
}

function run(r: Room, ...actions: Action[]): Room {
  for (const a of actions) {
    const res = reduce(r, a, ctx);
    if (!res.ok) throw new Error(res.error);
    r = res.room;
  }
  return r;
}

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

describe("resolveNight", () => {
  it("kills the Mafia target", () => {
    expect(resolveNight({ mafiaVotes: { m: "c1" }, doctorTarget: "c2", detectiveTarget: null, sniperTarget: null }, Math.random).killedId).toBe("c1");
  });
  it("doctor save prevents the kill", () => {
    expect(resolveNight({ mafiaVotes: { m: "c1" }, doctorTarget: "c1", detectiveTarget: null, sniperTarget: null }, Math.random).killedId).toBeNull();
  });
  it("uses the Mafia majority", () => {
    expect(resolveNight({ mafiaVotes: { m1: "a", m2: "b", m3: "b" }, doctorTarget: null, detectiveTarget: null, sniperTarget: null }, () => 0).killedId).toBe("b");
  });
  it("breaks a Mafia tie at random", () => {
    const night = { mafiaVotes: { m1: "a", m2: "b" }, doctorTarget: null, detectiveTarget: null, sniperTarget: null };
    expect(resolveNight(night, () => 0).killedId).toBe("a");
    expect(resolveNight(night, () => 0.99).killedId).toBe("b");
  });
  it("no Mafia votes means no kill", () => {
    expect(resolveNight({ mafiaVotes: {}, doctorTarget: null, detectiveTarget: null, sniperTarget: null }, Math.random).killedId).toBeNull();
  });
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

  it("START deals roles to everyone except the GM and enters ROLE_REVEAL", () => {
    const r = room(["h", "a", "b", "c", "d"].map((id) => player(id, { isGM: id === "h" })));
    const next = run(r, { type: "START", by: "h" });
    expect(next.phase).toBe("ROLE_REVEAL");
    expect(next.players.find((p) => p.id === "h")!.role).toBeNull();
    expect(next.players.filter((p) => p.role).length).toBe(4);
    expect(r.phase).toBe("LOBBY"); // input untouched
  });

  it("all reveal acks start the first night with a deadline", () => {
    const r = room(["h", "a", "b", "c"].map((id) => player(id)));
    const next = run(r, { type: "START", by: "h" }, ...["h", "a", "b", "c"].map((by) => ({ type: "REVEAL_ACK", by }) as Action));
    expect(next.phase).toBe("NIGHT");
    expect(next.deadline).toBe(ctx.now + DEFAULT_SETTINGS.nightSec * 1000);
  });

  it("night resolves once every night actor has acted", () => {
    let r = run(nightRoom(), { type: "NIGHT_ACT", by: "m", target: "c1" }, { type: "NIGHT_ACT", by: "d", target: "c2" });
    expect(r.phase).toBe("NIGHT");
    r = run(r, { type: "NIGHT_ACT", by: "x", target: "m" });
    expect(r.phase).toBe("DAY");
    expect(r.players.find((p) => p.id === "c1")!.alive).toBe(false);
    expect(r.announcements.at(-1)).toMatchObject({ kind: "NIGHT", killedIds: ["c1"] });
    expect(r.investigations.x).toEqual([{ round: 1, targetId: "m", isMafia: true }]);
  });

  it("rejects illegal night actions", () => {
    const r = nightRoom();
    expect(reduce(r, { type: "NIGHT_ACT", by: "c1", target: "m" }, ctx).ok).toBe(false);
    expect(reduce(r, { type: "NIGHT_ACT", by: "m", target: "m" }, ctx).ok).toBe(false);
    const once = run(r, { type: "NIGHT_ACT", by: "x", target: "c1" });
    expect(reduce(once, { type: "NIGHT_ACT", by: "x", target: "c2" }, ctx).ok).toBe(false);
  });

  it("voting out the last Mafia ends the game for the town", () => {
    const r = run(
      { ...nightRoom(), phase: "VOTING" },
      ...["d", "x", "c1", "c2"].map((by) => ({ type: "VOTE", by, target: "m" }) as Action),
      { type: "VOTE", by: "m", target: "c1" },
    );
    expect(r.phase).toBe("GAME_OVER");
    expect(r.winner).toBe("TOWN");
  });

  it("a timeout only fires for the current deadline", () => {
    const r = { ...nightRoom(), deadline: 5_000 };
    expect(reduce(r, { type: "TIMEOUT", deadline: 4_000 }, ctx).ok).toBe(false);
    expect(run(r, { type: "TIMEOUT", deadline: 5_000 }).phase).toBe("DAY");
  });
});

describe("view redaction", () => {
  it("a citizen sees only their own role", () => {
    const v = toPlayerView(nightRoom(), "c1");
    expect(v.players.filter((p) => p.role).map((p) => p.id)).toEqual(["c1"]);
    expect(v.mafiaVotes).toBeUndefined();
    expect(v.gm).toBeUndefined();
    expect(JSON.stringify(v)).not.toContain("t-");
  });

  it("Mafia see each other and their votes, nothing else", () => {
    const r = nightRoom();
    r.players.push(player("m2", { role: "MAFIA" }));
    r.night.mafiaVotes = { m2: "c1" };
    const v = toPlayerView(r, "m");
    expect(v.players.filter((p) => p.role).map((p) => p.id).sort()).toEqual(["m", "m2"]);
    expect(v.mafiaVotes).toEqual({ m2: "c1" });
  });

  it("the GM sees everything", () => {
    const r = nightRoom();
    r.players.push(player("gm", { isGM: true }));
    const v = toPlayerView(r, "gm");
    expect(v.players.filter((p) => p.role)).toHaveLength(5);
    expect(v.gm).toBeDefined();
  });

  it("dead players' roles are revealed only when the setting is on", () => {
    const r = nightRoom();
    r.players.find((p) => p.id === "d")!.alive = false;
    expect(r.settings.revealRoleOnDeath).toBe(false); // secret by default
    expect(toPlayerView(r, "c1").players.find((p) => p.id === "d")!.role).toBeUndefined();
    r.settings.revealRoleOnDeath = true;
    expect(toPlayerView(r, "c1").players.find((p) => p.id === "d")!.role).toBe("DOCTOR");
  });
});

// ---------- Custom roles ----------

/** m=Mafia, c1..c4=Citizens, plus one special role in seat "s". */
function withSpecial(role: Role, phase: Room["phase"] = "NIGHT"): Room {
  const ids: [string, Role][] = [["m", "MAFIA"], ["s", role], ["c1", "CITIZEN"], ["c2", "CITIZEN"], ["c3", "CITIZEN"], ["c4", "CITIZEN"]];
  return room(ids.map(([id, r]) => player(id, { role: r })), { phase, round: 1 });
}
const alive = (r: Room, id: string) => r.players.find((p) => p.id === id)!.alive;
const votes = (by: string[], target: string) => by.map((b) => ({ type: "VOTE", by: b, target }) as Action);

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
    const r = run(withSpecial("SNIPER"), { type: "NIGHT_ACT", by: "s", target: "m" }, { type: "NIGHT_ACT", by: "m", target: "c1" });
    expect(r.phase).toBe("GAME_OVER");
    expect([alive(r, "m"), alive(r, "s"), alive(r, "c1")]).toEqual([false, true, false]);
    expect(r.sniperShotUsed).toBe(true);
    expect(r.winner).toBe("TOWN");
  });

  it("shooting a non-Mafia kills both target and Sniper, even if the doctor saved them", () => {
    const base = withSpecial("SNIPER");
    base.players.push(player("d", { role: "DOCTOR" }));
    const r = run(base, { type: "NIGHT_ACT", by: "d", target: "c2" }, { type: "NIGHT_ACT", by: "s", target: "c2" }, { type: "NIGHT_ACT", by: "m", target: "c1" });
    expect(r.phase).toBe("DAY");
    expect([alive(r, "c2"), alive(r, "s"), alive(r, "c1")]).toEqual([false, false, false]);
    expect(r.announcements.at(-1)!.killedIds.sort()).toEqual(["c1", "c2", "s"]);
  });

  it("can hold fire, and the night waits for that decision", () => {
    let r = run(withSpecial("SNIPER"), { type: "NIGHT_ACT", by: "m", target: "c1" });
    expect(r.phase).toBe("NIGHT");
    r = run(r, { type: "NIGHT_ACT", by: "s", target: "SKIP" });
    expect(r.phase).toBe("DAY");
    expect(r.sniperShotUsed).toBe(false);
  });

  it("has only one bullet per game", () => {
    const r = { ...withSpecial("SNIPER"), sniperShotUsed: true };
    expect(reduce(r, { type: "NIGHT_ACT", by: "s", target: "m" }, ctx)).toMatchObject({ ok: false });
    // With the bullet spent, the Sniper is no longer waited on.
    expect(run(r, { type: "NIGHT_ACT", by: "m", target: "c1" }).phase).toBe("DAY");
  });

  it("only the Sniper can skip", () => {
    expect(reduce(withSpecial("SNIPER"), { type: "NIGHT_ACT", by: "m", target: "SKIP" }, ctx).ok).toBe(false);
  });
});

describe("Sheik of Citizens", () => {
  it("survives his first conviction by revealing, then votes with weight 3", () => {
    let r = run(withSpecial("SHEIK", "VOTING"), ...votes(["m", "c1", "c2", "c3"], "s"), { type: "VOTE", by: "c4", target: "m" }, { type: "VOTE", by: "s", target: "m" });
    expect(alive(r, "s")).toBe(true);
    expect(r.players.find((p) => p.id === "s")!.revealed).toBe(true);
    expect(r.announcements.at(-1)).toMatchObject({ kind: "VOTE", killedIds: [], revealedId: "s" });
    expect(r.phase).toBe("NIGHT");
    expect(toPlayerView(r, "c1").players.find((p) => p.id === "s")).toMatchObject({ role: "SHEIK", voteWeight: 3 });

    // Next day: Sheik (3) + c1 (1) outvote three others for c2.
    r = run({ ...r, phase: "VOTING", votes: {} }, { type: "VOTE", by: "s", target: "m" }, { type: "VOTE", by: "c1", target: "m" }, ...votes(["m", "c2", "c3"], "c4"), { type: "VOTE", by: "c4", target: "c3" });
    expect(r.announcements.at(-1)!.tally).toMatchObject({ m: 4, c4: 3 });
    expect(alive(r, "m")).toBe(false);
  });

  it("is executed normally the second time", () => {
    const r = withSpecial("SHEIK", "VOTING");
    r.players.find((p) => p.id === "s")!.revealed = true;
    const next = run(r, ...votes(["m", "c1", "c2", "c3", "c4"], "s"), { type: "VOTE", by: "s", target: "m" });
    expect(alive(next, "s")).toBe(false);
  });

  it("dies to the Mafia at night without revealing", () => {
    const r = run(withSpecial("SHEIK"), { type: "NIGHT_ACT", by: "m", target: "s" });
    expect(alive(r, "s")).toBe(false);
    expect(r.players.find((p) => p.id === "s")!.revealed).toBe(false);
  });
});

describe("Upright Citizen", () => {
  it("when voted out, drags down a player of their choice before the night", () => {
    let r = run(withSpecial("UPRIGHT", "VOTING"), ...votes(["m", "c1", "c2", "c3", "c4"], "s"), { type: "VOTE", by: "s", target: "m" });
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
    let r = run(withSpecial("UPRIGHT", "VOTING"), ...votes(["m", "c1", "c2", "c3", "c4"], "s"), { type: "VOTE", by: "s", target: "m" });
    r = run(r, { type: "TIMEOUT", deadline: r.deadline! });
    expect(r.phase).toBe("NIGHT");
    expect(r.round).toBe(2);
    expect(r.revenge).toBeNull();
  });

  it("gets no revenge when killed at night", () => {
    const r = run(withSpecial("UPRIGHT"), { type: "NIGHT_ACT", by: "m", target: "s" });
    expect(r.phase).toBe("DAY");
    expect(r.revenge).toBeNull();
  });
});

describe("projector safety", () => {
  it("the public screen view carries no secrets", () => {
    const r = nightRoom();
    r.night.mafiaVotes = { m: "c1" };
    r.investigations = { x: [{ round: 1, targetId: "m", isMafia: true }] };
    r.log = [{ round: 1, phase: "NIGHT", text: "secret", secret: true, at: 0 }];
    const v = toPublicView(r);
    expect(v.players.filter((p) => p.role)).toHaveLength(0);
    expect(v.meId).toBe("");
    expect(v.mafiaVotes).toBeUndefined();
    expect(v.investigations).toBeUndefined();
    expect(v.gm).toBeUndefined();
    expect(v.log).toHaveLength(0);
    expect(JSON.stringify(v)).not.toMatch(/MAFIA|DOCTOR|DETECTIVE|t-/);
  });

  it("only public role reveals reach the screen", () => {
    const r = withSpecial("SHEIK", "DAY");
    r.players.find((p) => p.id === "s")!.revealed = true;
    expect(toPublicView(r).players.filter((p) => p.role).map((p) => p.id)).toEqual(["s"]);
    expect(toPublicView({ ...r, phase: "GAME_OVER" }).players.filter((p) => p.role)).toHaveLength(6);
  });

  it("the night ready-count is hidden from everyone but the GM", () => {
    const r = run(nightRoom(), { type: "NIGHT_ACT", by: "m", target: "c1" });
    expect(toPlayerView(r, "c1").progress).toEqual({ done: 0, required: 0 });
    expect(toPublicView(r).progress).toEqual({ done: 0, required: 0 });
    r.players.push(player("gm", { isGM: true }));
    expect(toPlayerView(r, "gm").progress).toEqual({ done: 1, required: 3 });
  });
});
