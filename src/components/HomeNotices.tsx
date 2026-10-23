"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SESSION_ENDED_MESSAGE, clearSession, isSessionExpired, loadSession, takeFlash, type StoredSession } from "@/client/session";
import { call } from "@/client/socket";
import type { Phase } from "@/shared/types";
import { Button } from "./ui";

/**
 * Home-page notices: a one-time message from the page that sent the player
 * here, and a check of any saved game. A still-live seat can be resumed; an
 * expired or vanished one is cleared with a friendly message.
 */
export function HomeNotices() {
  const [toast, setToast] = useState<string | null>(null);
  const [active, setActive] = useState<StoredSession | null>(null);

  useEffect(() => {
    const flash = takeFlash();
    if (flash) setToast(flash);

    const session = loadSession();
    if (!session) return;
    if (isSessionExpired(session)) {
      clearSession();
      setToast(SESSION_ENDED_MESSAGE);
      return;
    }
    let cancelled = false;
    call<{ phase: Phase }>("room:check", { code: session.code, playerId: session.playerId, token: session.token }).then((res) => {
      if (cancelled) return;
      if (res.ok) setActive(session);
      else if (res.error === "ROOM_GONE" || res.error === "SESSION_INVALID") {
        clearSession();
        setToast(SESSION_ENDED_MESSAGE);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  async function abandon() {
    if (!active) return;
    // Take the seat back just long enough to leave it properly.
    await call("room:resume", { code: active.code, playerId: active.playerId, token: active.token });
    await call("room:leave");
    clearSession();
    setActive(null);
  }

  return (
    <>
      {toast && (
        <button type="button" onClick={() => setToast(null)} role="status" className="glass neon fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center font-bold">
          {toast}
        </button>
      )}
      {active && (
        <section className="glass neon flex flex-col gap-3 rounded-2xl p-4 text-center">
          <p className="font-bold text-white">
            لديك لعبة جارية في الغرفة{" "}
            <span dir="ltr" className="neon-text tracking-widest">
              {active.code}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/room/${active.code}`} className="neon-button flex items-center justify-center rounded-full py-3 font-bold text-white">
              العودة إلى غرفتك
            </Link>
            <Button variant="ghost" onClick={abandon}>
              الخروج منها
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
