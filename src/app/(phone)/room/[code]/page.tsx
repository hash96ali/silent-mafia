"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { triggerHaptic } from "@/client/haptics";
import { SESSION_ENDED_MESSAGE, setFlash } from "@/client/session";
import { useRoom } from "@/client/useRoom";
import { GameScreen } from "@/components/GameScreen";
import { Lobby } from "@/components/Lobby";

export default function RoomPage() {
  const code = String(useParams<{ code: string }>().code).toUpperCase();
  const router = useRouter();
  const { status, view, connected, closedReason, now, resetBy, clearReset } = useRoom(code);

  // The host ended the game: everyone is already back in the lobby; tell them why.
  useEffect(() => {
    if (!resetBy) return;
    if (view?.settings.haptics !== "OFF") triggerHaptic([100, 60, 100, 60, 300]);
    const t = setTimeout(clearReset, 5000);
    return () => clearTimeout(t);
  }, [resetBy]); // only a new reset should notify

  useEffect(() => {
    // No saved seat for this room (e.g. a shared link): go to its join form.
    if (status === "no-session") router.replace(`/join/${code}`);
    // The saved session is over (room gone, seat gone, idle too long), or this
    // device was removed: go home and say why instead of hanging in a dead room.
    if (status === "ended" || status === "closed") {
      setFlash(status === "closed" && closedReason ? closedReason : SESSION_ENDED_MESSAGE);
      router.replace("/");
    }
  }, [status, code, router, closedReason]);

  if (!view || status === "ended" || status === "closed") {
    return <div className="flex flex-1 items-center justify-center animate-pulse text-neutral-500">جارٍ الاتصال…</div>;
  }

  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-30 bg-amber-500/90 py-1 text-center text-xs font-bold text-black">جارٍ إعادة الاتصال…</div>
      )}
      {resetBy && (
        <button
          type="button"
          onClick={clearReset}
          className="glass neon fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center font-bold"
          role="status"
        >
          أنهى المضيف {resetBy} اللعبة. عدتم جميعاً إلى غرفة الانتظار.
        </button>
      )}
      {view.phase === "LOBBY" ? <Lobby view={view} /> : <GameScreen view={view} now={now} />}
    </>
  );
}
