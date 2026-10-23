"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearSession, setFlash } from "@/client/session";
import { call } from "@/client/socket";
import { HomeIcon } from "./icons";
import { ConfirmDialog } from "./ui";

/**
 * Top-bar home button: asks first, then leaves the room on the server,
 * forgets the saved seat and goes to the home page.
 */
export function HomeButton({ inGame }: { inGame: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  async function leave() {
    setAsking(false);
    await call("room:leave"); // best effort: still leave locally if the network is down
    clearSession();
    setFlash("خرجت من الغرفة.");
    router.replace("/");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label="العودة للصفحة الرئيسية"
        title="العودة للصفحة الرئيسية"
        className="glass flex size-9 shrink-0 items-center justify-center rounded-full text-neutral-200 active:scale-95"
      >
        <HomeIcon className="size-5" />
      </button>
      {asking && (
        <ConfirmDialog
          text="هل تريد الخروج والعودة للصفحة الرئيسية؟"
          detail={inGame ? "يبقى مقعدك في اللعبة الحالية لكن لن تتمكن من العودة إليه." : "ستُزال من قائمة اللاعبين في هذه الغرفة."}
          confirmLabel="نعم، اخرج"
          onConfirm={leave}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}
