import { randomInt } from "node:crypto";
import type { Server, Socket } from "socket.io";
import { HOST_GRACE_MS, ROOM_IDLE_TTL_MS } from "../shared/constants";
import type { Ack, ClientToServerEvents, Player, Room, ServerToClientEvents, SocketData } from "../shared/types";
import { migrateHost, reduce, type Action } from "./gameMachine";
import { allRooms, cleanName, createRoom, deleteRoom, findSession, getRoom, joinRoom, saveRoom } from "./roomStore";
import { cancel, cancelRoom, scheduleAt } from "./timers";
import { toPlayerView, toPublicView } from "./view";

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const rng = () => randomInt(2 ** 30) / 2 ** 30;

/** Clients may omit or spoof the ack argument, so never call it blindly. */
function safe<T>(ack: unknown): Ack<T> {
  return typeof ack === "function" ? (ack as Ack<T>) : () => {};
}

export function registerSocketHandlers(io: IO): void {
  // Every player gets their own redacted view. Projector screens share the
  // public view, which carries no secrets at all.
  function broadcast(room: Room): void {
    const now = Date.now();
    for (const p of room.players) {
      if (p.socketId) io.to(p.socketId).emit("room:state", toPlayerView(room, p.id, now));
    }
    io.to(screenChannel(room.code)).emit("room:state", toPublicView(room, now));
  }

  const screenChannel = (code: string) => `screen:${code}`;

  function syncPhaseTimer(room: Room): void {
    const key = `phase:${room.code}`;
    if (room.deadline === null) return cancel(key);
    const deadline = room.deadline;
    scheduleAt(key, deadline, () => dispatch(room.code, { type: "TIMEOUT", deadline }));
  }

  function dispatch(code: string, action: Action): { ok: true; room: Room } | { ok: false; error: string } {
    const room = getRoom(code);
    if (!room) return { ok: false, error: "الغرفة غير موجودة." };
    const res = reduce(room, action, { now: Date.now(), rng });
    if (res.ok) {
      saveRoom(res.room);
      syncPhaseTimer(res.room);
      broadcast(res.room);
    }
    return res;
  }

  function closeSocket(socketId: string, reason: string): void {
    const s = io.sockets.sockets.get(socketId);
    if (!s) return;
    s.emit("room:closed", { reason });
    s.data = {};
  }

  function markDisconnected(room: Room, player: Player): void {
    player.socketId = null;
    player.connected = false;
    player.disconnectedAt = Date.now();
    if (player.id === room.hostId) {
      scheduleAt(`host:${room.code}`, Date.now() + HOST_GRACE_MS, () => {
        const r = getRoom(room.code);
        const host = r?.players.find((p) => p.id === r.hostId);
        if (r && (!host || !host.connected) && migrateHost(r)) broadcast(r);
      });
    }
  }

  /** Attaches `socket` to `player`, replacing any older socket that player had. */
  function bind(socket: GameSocket, room: Room, player: Player): void {
    unbind(socket);
    if (player.socketId && player.socketId !== socket.id) {
      closeSocket(player.socketId, "فُتح مقعدك على جهاز أو نافذة أخرى.");
    }
    player.socketId = socket.id;
    player.connected = true;
    player.disconnectedAt = null;
    room.lastActivity = Date.now();
    socket.data = { code: room.code, playerId: player.id };
    if (player.id === room.hostId) cancel(`host:${room.code}`);
  }

  /** Detaches `socket` from whatever seat it held, if it still owns it. */
  function unbind(socket: GameSocket): Room | null {
    const { code, playerId } = socket.data;
    socket.data = {};
    const room = code ? getRoom(code) : undefined;
    const player = room?.players.find((p) => p.id === playerId);
    if (!room || !player || player.socketId !== socket.id) return null;
    markDisconnected(room, player);
    return room;
  }

  /** Runs a game action as the socket's player. */
  function act(socket: GameSocket, ack: unknown, build: (playerId: string) => Action): void {
    const reply = safe(ack);
    const { code, playerId } = socket.data;
    if (!code || !playerId) return reply({ ok: false, error: "لست في غرفة." });
    const res = dispatch(code, build(playerId));
    reply(res.ok ? { ok: true, data: undefined } : res);
  }

  io.on("connection", (socket: GameSocket) => {
    socket.on("room:create", (p, ack) => {
      const reply = safe<{ code: string; playerId: string; token: string }>(ack);
      const name = cleanName(p?.name);
      if (!name) return reply({ ok: false, error: "أدخل اسمك." });
      const { room, player } = createRoom(name, !!p.asGM, p.settings);
      bind(socket, room, player);
      reply({ ok: true, data: { code: room.code, playerId: player.id, token: player.token } });
      broadcast(room);
    });

    socket.on("room:join", (p, ack) => {
      const reply = safe<{ code: string; playerId: string; token: string }>(ack);
      const name = cleanName(p?.name);
      if (!name) return reply({ ok: false, error: "أدخل اسمك." });
      if (typeof p.code !== "string") return reply({ ok: false, error: "أدخل رمز الغرفة." });
      const res = joinRoom(p.code, name);
      if ("error" in res) return reply({ ok: false, error: res.error });
      bind(socket, res.room, res.player);
      reply({ ok: true, data: { code: res.room.code, playerId: res.player.id, token: res.player.token } });
      broadcast(res.room);
    });

    socket.on("room:resume", (p, ack) => {
      const reply = safe(ack);
      const session = typeof p?.code === "string" ? findSession(p.code, p.playerId, p.token) : null;
      if (!session) return reply({ ok: false, error: "SESSION_INVALID" });
      bind(socket, session.room, session.player);
      reply({ ok: true, data: undefined });
      broadcast(session.room);
    });

    socket.on("room:leave", (ack) => {
      const reply = safe(ack);
      const { code, playerId } = socket.data;
      if (!code || !playerId) return reply({ ok: true, data: undefined });
      const room = getRoom(code);
      if (room?.phase === "LOBBY") {
        socket.data = {};
        dispatch(code, { type: "LEAVE", by: playerId });
      } else {
        const r = unbind(socket);
        if (r) broadcast(r);
      }
      const after = getRoom(code);
      if (after && after.players.length === 0) {
        cancelRoom(code);
        deleteRoom(code);
      }
      reply({ ok: true, data: undefined });
    });

    socket.on("room:kick", (p, ack) => {
      const target = getRoom(socket.data.code ?? "")?.players.find((q) => q.id === p?.playerId);
      act(socket, ack, (by) => ({ type: "KICK", by, target: String(p?.playerId) }));
      // Only notify if the kick actually removed them.
      if (target?.socketId && !getRoom(socket.data.code ?? "")?.players.some((q) => q.id === target.id)) {
        closeSocket(target.socketId, "أخرجك المضيف من الغرفة.");
      }
    });

    socket.on("room:updateSettings", (p, ack) => act(socket, ack, (by) => ({ type: "UPDATE_SETTINGS", by, settings: p ?? {} })));
    socket.on("room:setGM", (p, ack) => act(socket, ack, (by) => ({ type: "SET_GM", by, target: p?.playerId ?? null })));
    socket.on("game:start", (ack) => act(socket, ack, (by) => ({ type: "START", by })));
    socket.on("game:advance", (ack) => act(socket, ack, (by) => ({ type: "ADVANCE", by })));
    socket.on("game:playAgain", (ack) => act(socket, ack, (by) => ({ type: "PLAY_AGAIN", by })));
    socket.on("reveal:ack", (ack) => act(socket, ack, (by) => ({ type: "REVEAL_ACK", by })));
    socket.on("vote:cast", (p, ack) => act(socket, ack, (by) => ({ type: "VOTE", by, target: String(p?.targetId) })));
    socket.on("revenge:pick", (p, ack) => act(socket, ack, (by) => ({ type: "REVENGE_PICK", by, target: String(p?.targetId) })));

    socket.on("night:act", (p, ack) => {
      const reply = safe<{ investigation?: { round: number; targetId: string; isMafia: boolean } }>(ack);
      const { code, playerId } = socket.data;
      if (!code || !playerId) return reply({ ok: false, error: "لست في غرفة." });
      const res = dispatch(code, { type: "NIGHT_ACT", by: playerId, target: String(p?.targetId) });
      if (!res.ok) return reply(res);
      // The detective learns the answer immediately and privately.
      const investigation = res.room.investigations[playerId]?.at(-1);
      reply({ ok: true, data: investigation?.targetId === p.targetId ? { investigation } : {} });
    });

    // A projector / TV screen: watches a room without taking a seat.
    socket.on("screen:watch", (p, ack) => {
      const reply = safe(ack);
      const room = typeof p?.code === "string" ? getRoom(p.code) : undefined;
      if (!room) return reply({ ok: false, error: "الغرفة غير موجودة." });
      socket.join(screenChannel(room.code));
      reply({ ok: true, data: undefined });
      socket.emit("room:state", toPublicView(room));
    });

    socket.on("disconnect", () => {
      const room = unbind(socket);
      if (room) broadcast(room);
    });
  });

  // Garbage-collect rooms nobody is connected to.
  setInterval(() => {
    const now = Date.now();
    for (const room of [...allRooms()]) {
      if (!room.players.some((p) => p.connected) && now - room.lastActivity > ROOM_IDLE_TTL_MS) {
        cancelRoom(room.code);
        deleteRoom(room.code);
      }
    }
  }, 5 * 60_000).unref();
}
