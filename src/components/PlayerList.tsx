"use client";

import type { PlayerView } from "@/shared/types";
import { ROLE_LABEL_AR } from "@/shared/roleText";
import { arDigits } from "./ui";

export function PlayerList({
  view,
  onKick,
  onToggleGM,
}: {
  view: PlayerView;
  onKick?: (id: string) => void;
  onToggleGM?: (id: string, on: boolean) => void;
}) {
  const dragged = new Set(view.announcements.filter((a) => a.kind === "REVENGE").flatMap((a) => a.killedIds));
  // Your own role, your Mafia teammates' and (for the GM) everyone's stay behind
  // a cover; here we only badge roles that are public, so a glance leaks nothing.
  const showRoles = view.phase === "GAME_OVER";
  // A role is public once revealed, at game over, or on death when the host chose that.
  const isPublic = (p: (typeof view.players)[number]) => showRoles || p.revealed || (!p.alive && view.settings.revealRoleOnDeath);
  return (
    <ul className="flex flex-col gap-2">
      {view.players.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/35 px-3 py-2.5 ${p.alive ? "" : "opacity-45"}`}
        >
          <span
            className={`size-2 shrink-0 rounded-full ${p.connected ? "bg-emerald-400 shadow-[0_0_6px_rgb(52_211_153/0.8)]" : "bg-neutral-600"}`}
            title={p.connected ? "متصل" : "غير متصل"}
          />
          <span className={`flex-1 truncate ${p.alive ? "" : "line-through"}`}>
            <span className="text-neutral-500">{arDigits(i + 1)}. </span>
            {p.name}
            {p.id === view.meId && <span className="text-neutral-500"> (أنت)</span>}
          </span>
          {p.isHost && <Badge>المضيف</Badge>}
          {p.isGM && <Badge>الراوي</Badge>}
          {p.role && isPublic(p) && <Badge tone={p.role === "MAFIA" ? "red" : p.revealed ? "gold" : "plain"}>{ROLE_LABEL_AR[p.role]}</Badge>}
          {p.revealed && p.alive && <Badge tone="gold">مكشوف</Badge>}
          {p.voteWeight > 1 && p.alive && <Badge tone="gold">صوت ×{arDigits(p.voteWeight)}</Badge>}
          {dragged.has(p.id) && <Badge>مسحوب</Badge>}
          {!p.alive && !dragged.has(p.id) && <Badge>ميت</Badge>}
          {onToggleGM && (
            <button onClick={() => onToggleGM(p.id, !p.isGM)} className="text-xs text-neutral-500 underline">
              {p.isGM ? "إلغاء الراوي" : "اجعله راوياً"}
            </button>
          )}
          {onKick && p.id !== view.meId && (
            <button onClick={() => onKick(p.id)} className="text-xs text-ember underline" aria-label={`إخراج ${p.name}`}>
              إخراج
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "red" | "gold" }) {
  const look = {
    red: "border-blood-soft/70 text-ember shadow-[0_0_8px_rgb(255_30_40/0.35)]",
    gold: "border-amber-400/60 text-amber-300",
    plain: "border-white/10 text-neutral-400",
  }[tone];
  return <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${look}`}>{children}</span>;
}
