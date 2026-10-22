"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { loadSession } from "@/client/session";
import { EntryForm } from "@/components/EntryForm";

export default function JoinPage() {
  const code = String(useParams<{ code: string }>().code).toUpperCase();
  const router = useRouter();

  // Already seated in this room (e.g. re-scanned the QR code): go straight back in.
  useEffect(() => {
    if (loadSession()?.code === code) router.replace(`/room/${code}`);
  }, [code, router]);

  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <header className="text-center">
        <p className="text-sm text-neutral-400">الانضمام إلى الغرفة</p>
        <h1 dir="ltr" className="neon-text text-5xl font-black tracking-[0.3em]">
          {code}
        </h1>
      </header>
      <EntryForm fixedCode={code} />
    </div>
  );
}
