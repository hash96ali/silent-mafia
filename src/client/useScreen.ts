"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerView } from "@/shared/types";
import { call, getSocket } from "./socket";

/**
 * Watches a room as a projector / TV screen. It holds no seat and no session,
 * and the server only ever sends it the public view.
 */
export function useScreen(code: string) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const clockOffset = useRef(0);

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    const watch = async () => {
      setConnected(true);
      const res = await call("screen:watch", { code });
      if (!cancelled && !res.ok) setError(res.error);
    };
    const onState = (v: PlayerView) => {
      if (v.code !== code) return;
      clockOffset.current = v.serverNow - Date.now();
      setView(v);
      setError(null);
    };
    const onDisconnect = () => setConnected(false);

    socket.on("connect", watch);
    socket.on("room:state", onState);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) watch();

    // Keep the projector from dimming or sleeping mid-game, where supported.
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    const keepAwake = () => {
      if (document.visibilityState === "visible") nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    };
    keepAwake();
    document.addEventListener("visibilitychange", keepAwake);

    return () => {
      cancelled = true;
      socket.off("connect", watch);
      socket.off("room:state", onState);
      socket.off("disconnect", onDisconnect);
      document.removeEventListener("visibilitychange", keepAwake);
      lock?.release().catch(() => {});
    };
  }, [code]);

  const now = useCallback(() => Date.now() + clockOffset.current, []);
  return { view, error, connected, now };
}
