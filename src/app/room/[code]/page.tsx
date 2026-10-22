"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRoom } from "@/client/useRoom";
import { GameScreen } from "@/components/GameScreen";
import { Lobby } from "@/components/Lobby";

export default function RoomPage() {
  const code = String(useParams<{ code: string }>().code).toUpperCase();
  const router = useRouter();
  const { status, view, connected, closedReason, now } = useRoom(code);

  // No saved seat for this room: send them to the join form for it.
  useEffect(() => {
    if (status === "no-session") router.replace(`/join/${code}`);
  }, [status, code, router]);

  if (status === "closed") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <p className="text-neutral-300">{closedReason}</p>
        <Link href="/" className="neon-text underline">
          العودة للبداية
        </Link>
      </div>
    );
  }

  if (!view) {
    return <div className="flex flex-1 items-center justify-center animate-pulse text-neutral-500">جارٍ الاتصال…</div>;
  }

  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-30 bg-amber-500/90 py-1 text-center text-xs font-bold text-black">جارٍ إعادة الاتصال…</div>
      )}
      {view.phase === "LOBBY" ? <Lobby view={view} /> : <GameScreen view={view} now={now} />}
    </>
  );
}
