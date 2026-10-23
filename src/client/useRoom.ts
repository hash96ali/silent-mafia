"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerView } from "@/shared/types";
import { call, getSocket } from "./socket";
import { clearSession, isSessionExpired, loadSession, touchSession } from "./session";

/**
 * no-session: nothing saved for this room (e.g. opened a shared link) → join form.
 * ended: the saved session is over (room gone, seat gone, or idle > 2h) → home.
 * closed: this device was removed (kicked, or the seat opened elsewhere) → home.
 */
export type RoomStatus = "connecting" | "in-room" | "no-session" | "ended" | "closed";

/**
 * Connects to a room and keeps `view` in sync. Re-sends the stored session on
 * every (re)connect, so refreshes and dropped connections resume seamlessly.
 */
export function useRoom(code: string) {
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [view, setView] = useState<PlayerView | null>(null);
  const [connected, setConnected] = useState(true);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  /** Name of the host who just ended the game, until the notice is dismissed. */
  const [resetBy, setResetBy] = useState<string | null>(null);
  /** serverNow - Date.now(), so countdowns agree across phones with wrong clocks. */
  const clockOffset = useRef(0);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    const resume = async () => {
      setConnected(true);
      const session = loadSession();
      if (!session || session.code !== code) return setStatus("no-session");
      if (isSessionExpired(session)) {
        clearSession();
        return setStatus("ended");
      }
      const res = await call("room:resume", { code: session.code, playerId: session.playerId, token: session.token });
      if (cancelled) return;
      // A network error is retried on the next connect; a missing room or seat is final.
      if (!res.ok && (res.error === "ROOM_GONE" || res.error === "SESSION_INVALID")) {
        clearSession();
        setStatus("ended");
      }
    };
    const onState = (v: PlayerView) => {
      touchSession();
      clockOffset.current = v.serverNow - Date.now();
      setView(v);
      setStatus("in-room");
    };
    const onClosed = ({ reason }: { reason: string }) => {
      clearSession();
      setClosedReason(reason);
      setStatus("closed");
    };
    const onDisconnect = () => setConnected(false);
    const onReset = ({ by }: { by: string }) => setResetBy(by || "المضيف");
    // Phones often silently drop sockets while locked; reconnect as soon as the screen is back.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !socket.connected) socket.connect();
    };

    socket.on("connect", resume);
    socket.on("room:state", onState);
    socket.on("room:closed", onClosed);
    socket.on("disconnect", onDisconnect);
    socket.on("game:reset", onReset);
    document.addEventListener("visibilitychange", onVisible);
    if (socket.connected) resume();

    return () => {
      cancelled = true;
      socket.off("connect", resume);
      socket.off("room:state", onState);
      socket.off("room:closed", onClosed);
      socket.off("disconnect", onDisconnect);
      socket.off("game:reset", onReset);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code]);

  const now = useCallback(() => Date.now() + clockOffset.current, []);

  const clearReset = useCallback(() => setResetBy(null), []);
  return { status, view, connected, closedReason, now, resetBy, clearReset };
}
