"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/types";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type CallResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

let socket: GameSocket | null = null;

/** One shared connection per tab, to the same origin that served the page. */
export function getSocket(): GameSocket {
  socket ??= io({ autoConnect: false, transports: ["websocket", "polling"] });
  if (!socket.connected) socket.connect();
  return socket;
}

/** Emits an event that takes an ack callback and resolves with the server's reply. */
export async function call<T = undefined>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<CallResult<T>> {
  try {
    // Socket.io's typed emitWithAck doesn't accept a dynamic event name, hence the cast.
    const s = getSocket() as unknown as { timeout(ms: number): { emitWithAck(e: string, ...a: unknown[]): Promise<CallResult<T>> } };
    return await s.timeout(8000).emitWithAck(event, ...args);
  } catch {
    return { ok: false, error: "مشكلة في الاتصال. حاول مرة أخرى." };
  }
}
