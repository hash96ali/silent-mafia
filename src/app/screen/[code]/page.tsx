"use client";

import { useParams } from "next/navigation";
import { useScreen } from "@/client/useScreen";
import { PublicScreen } from "@/components/PublicScreen";

/** Projector / TV screen: public information only, safe to show the whole room. */
export default function ScreenPage() {
  const code = String(useParams<{ code: string }>().code).toUpperCase();
  const { view, error, connected, now } = useScreen(code);

  if (!view) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-2xl text-neutral-500">
        <span className={error ? "text-ember" : "animate-pulse"}>{error ?? "جارٍ الاتصال…"}</span>
      </div>
    );
  }
  return (
    <>
      {!connected && <div className="fixed inset-x-0 top-0 z-30 bg-amber-500/90 py-1 text-center text-sm font-bold text-black">جارٍ إعادة الاتصال…</div>}
      <PublicScreen view={view} now={now} />
    </>
  );
}
