"use client";

import { useState } from "react";
import type { Role } from "@/shared/types";
import { SilhouetteIcon } from "./icons";
import { ROLE_BLURB, roleTitle } from "@/shared/roleText";

/**
 * "YOUR ROLE" panel with the hidden-card portrait. Privacy-first: the role
 * name stays blurred unless the card is held down, so it's never left
 * readable for a neighbour to glance at.
 */
export function RoleCard({ role, teammates, large = false }: { role: Role; teammates?: string[]; large?: boolean }) {
  const [held, setHeld] = useState(false);
  const show = () => {
    setHeld(true);
    navigator.vibrate?.(30);
  };
  const hide = () => setHeld(false);
  const mafia = role === "MAFIA";

  return (
    <button
      type="button"
      onPointerDown={show}
      onPointerUp={hide}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onContextMenu={(e) => e.preventDefault()}
      aria-label="اضغط مطولاً لإظهار دورك"
      className={`no-select glass w-full touch-none rounded-2xl p-3 text-start transition ${held ? "neon" : ""}`}
    >
      <div className="flex items-stretch gap-3">
        <div className="flex flex-1 flex-col justify-center">
          <span dir="ltr" className="self-end text-[11px] font-semibold tracking-[0.15em] text-neutral-500 uppercase">
            Your role
          </span>
          <span className="mt-1 text-sm text-neutral-300">دورك:</span>
          {/* Hidden: same placeholder and colour for every role, so length or tint gives nothing away. */}
          <span className={`font-black ${large ? "text-3xl" : "text-2xl"} ${held ? (mafia ? "neon-text" : "text-white") : "text-neutral-400 blur-[6px]"}`}>
            {held ? roleTitle(role) : "●●●●● (●●●●)"}
          </span>
          {held ? (
            <>
              {large && <span className="mt-2 text-sm text-neutral-300">{ROLE_BLURB[role]}</span>}
              {teammates && teammates.length > 0 && <span className="mt-1 text-sm text-ember">رفاقك في المافيا: {teammates.join("، ")}</span>}
            </>
          ) : (
            <span className="mt-1 text-xs text-neutral-500">اضغط مطولاً لإظهار دورك · غطِّ شاشتك</span>
          )}
        </div>
        <div className={`flex w-24 shrink-0 flex-col items-center justify-end overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b ${mafia && held ? "from-blood/30" : "from-white/5"} to-black/60 pt-3`}>
          <SilhouetteIcon className={`w-16 ${mafia && held ? "text-blood/60" : "text-black"} drop-shadow-[0_0_8px_rgb(255_30_40/0.35)]`} />
          <span className="w-full bg-black/70 py-1 text-center text-[11px] font-semibold text-neutral-200">كارت مخفي</span>
        </div>
      </div>
    </button>
  );
}
