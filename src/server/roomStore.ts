import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { CODE_ALPHABET, CODE_LENGTH, DEFAULT_SETTINGS, LIMITS } from "../shared/constants";
import type { Player, Room, Settings } from "../shared/types";
import { emptyNight, sanitizeSettings } from "./gameMachine";

// In-memory authoritative store. A restart drops all games; swap this module
// for Redis/Postgres if rooms need to outlive the process.

const rooms = new Map<string, Room>();

export const getRoom = (code: string) => rooms.get(normalizeCode(code));
export const saveRoom = (room: Room) => void rooms.set(room.code, room);
export const deleteRoom = (code: string) => void rooms.delete(code);
export const allRooms = () => rooms.values();

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.replace(/\s+/g, " ").trim().slice(0, LIMITS.nameMaxLength);
  return n || null;
}

function generateCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

function newPlayer(name: string, isGM: boolean): Player {
  return {
    id: randomUUID(),
    name,
    token: randomBytes(24).toString("base64url"),
    socketId: null,
    connected: false,
    disconnectedAt: null,
    isGM,
    role: null,
    alive: true,
    revealed: false,
  };
}

export function createRoom(hostName: string, asGM: boolean, settings: Partial<Settings> = {}, now = Date.now()) {
  const host = newPlayer(hostName, asGM);
  const room: Room = {
    code: generateCode(),
    phase: "LOBBY",
    round: 0,
    settings: sanitizeSettings(DEFAULT_SETTINGS, settings),
    players: [host],
    hostId: host.id,
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
    createdAt: now,
    lastActivity: now,
  };
  saveRoom(room);
  return { room, player: host };
}

export function joinRoom(code: string, name: string): { room: Room; player: Player } | { error: string } {
  const room = getRoom(code);
  if (!room) return { error: "الغرفة غير موجودة." };
  if (room.phase !== "LOBBY") return { error: "بدأت هذه اللعبة بالفعل." };
  if (room.players.length >= LIMITS.maxPlayers) return { error: "الغرفة ممتلئة." };
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return { error: "هذا الاسم مستخدم بالفعل." };

  const player = newPlayer(name, false);
  room.players.push(player);
  room.lastActivity = Date.now();
  return { room, player };
}

export function findSession(code: string, playerId: string, token: string) {
  const room = getRoom(code);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player || player.token !== token) return null;
  return { room, player };
}
