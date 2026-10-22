"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { ROLE_LABEL_AR } from "@/shared/roleText";
import { SKIP, type Announcement, type Phase, type PlayerView } from "@/shared/types";
import { BallotIcon, CrosshairIcon, MoonIcon, SilhouetteIcon, SunIcon } from "./icons";
import { arDigits } from "./ui";

// Phase wording and visuals shared by the phone screens and the projector.

export const PHASE_TITLE: Record<Phase, string> = {
  LOBBY: "غرفة الانتظار",
  ROLE_REVEAL: "كشف الأدوار",
  NIGHT: "مرحلة الليل",
  DAY: "مرحلة النهار",
  VOTING: "مرحلة التصويت",
  VERDICT: "نتيجة التصويت",
  REVENGE: "انتقام المواطن الصالح",
  GAME_OVER: "نهاية اللعبة",
};

export const PHASE_TAGLINE: Record<Phase, string> = {
  LOBBY: "اجمع اللاعبين... الليل يقترب",
  ROLE_REVEAL: "اضغط مطولاً على الكارت لرؤية دورك بسرية",
  NIGHT: "المدينة نائمة... اتخذ قرارك بصمت",
  DAY: "استيقظت المدينة... ناقشوا من بينكم من المافيا",
  VOTING: "صوّت بسرية لإخراج المشتبه به",
  VERDICT: "هذا ما قررته المدينة",
  REVENGE: "المواطن الصالح يختار من يسحبه معه",
  GAME_OVER: "انكشفت كل الأوراق",
};

const PHASE_ICON: Record<Phase, ComponentType<SVGProps<SVGSVGElement>>> = {
  LOBBY: CrosshairIcon,
  ROLE_REVEAL: SilhouetteIcon,
  NIGHT: MoonIcon,
  DAY: SunIcon,
  VOTING: BallotIcon,
  VERDICT: BallotIcon,
  REVENGE: CrosshairIcon,
  GAME_OVER: CrosshairIcon,
};

export function winnerText(view: PlayerView) {
  return view.winner === "MAFIA" ? "انتصرت المافيا وسيطرت على المدينة" : "انتصرت المدينة وتم القضاء على المافيا";
}

export function nameIn(view: PlayerView, id: string | null | undefined) {
  return view.players.find((p) => p.id === id)?.name ?? "؟";
}

export function announcementText(a: Announcement, view: PlayerView): string {
  const names = (ids: string[]) => ids.map((id) => nameIn(view, id)).join(" و");
  if (a.kind === "NIGHT") return a.killedIds.length ? `قُتل ${names(a.killedIds)} الليلة الماضية.` : "نجا الجميع هذه الليلة.";
  if (a.kind === "REVENGE") return `سحب ${names([a.byId!])} معه ${names(a.killedIds)}.`;
  if (a.revealedId && !a.killedIds.length) return `انكشف ${names([a.revealedId])}: إنه شيخ المواطنين! ينجو ويصبح صوته بثلاثة أصوات.`;
  if (a.revealedId) return `أُعدم ${names(a.killedIds)}، وكان ${ROLE_LABEL_AR.UPRIGHT}!`;
  return a.killedIds.length ? `أعدمت المدينة ${names(a.killedIds)}.` : "لم تتفق المدينة. لم يُعدم أحد.";
}

/** The announcements that belong to the current moment (a drag-down is shown with the vote that caused it). */
export function recentAnnouncements(view: PlayerView): Announcement[] {
  return view.announcements.slice(view.announcements.at(-1)?.kind === "REVENGE" ? -2 : -1);
}

/** What the transition card says under the phase title. */
function curtainLine(view: PlayerView): string {
  const last = view.announcements.at(-1);
  if (view.phase === "GAME_OVER") return winnerText(view);
  if ((view.phase === "DAY" || view.phase === "VERDICT") && last) return announcementText(last, view);
  return PHASE_TAGLINE[view.phase];
}

/** Full-page tint that changes colour with the phase (see `[data-phase]` in globals.css). */
export function PhaseBackdrop({ phase }: { phase: Phase }) {
  return <div className="phase-backdrop pointer-events-none fixed inset-0 -z-10 transition-[background] duration-700" data-dark={phase === "NIGHT"} aria-hidden />;
}

const CURTAIN_MS = 3200;

/**
 * Full-screen card on every phase change, so nobody misses it: big icon, the
 * phase name and what just happened. Every phone also vibrates at the same
 * moment. Tap to dismiss early. Not shown for the screen you open on.
 */
export function PhaseCurtain({ view, vibrate = true }: { view: PlayerView; vibrate?: boolean }) {
  const key = `${view.phase}-${view.round}`;
  const seen = useRef<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  // Raise only when the phase actually changes from one we already showed.
  // Comparing with the previous key (rather than "first run") also keeps
  // React's double-run of effects in development from raising it on load.
  useEffect(() => {
    const prev = seen.current;
    seen.current = key;
    if (prev === null || prev === key || view.phase === "LOBBY") return;
    setShown(key);
    if (vibrate) navigator.vibrate?.([120, 60, 120]);
  }, [key]); // only a phase/round change raises the curtain

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), CURTAIN_MS);
    return () => clearTimeout(t);
  }, [shown]);

  if (shown !== key) return null;
  const Icon = PHASE_ICON[view.phase];
  return (
    <button
      type="button"
      onClick={() => setShown(null)}
      className="curtain fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 px-6 text-center backdrop-blur-md"
      aria-live="assertive"
    >
      <Icon className="curtain-icon size-24 text-[var(--color-blood-soft)] sm:size-32" />
      <h2 className="neon-text text-5xl font-black sm:text-7xl">{PHASE_TITLE[view.phase]}</h2>
      <p className="max-w-2xl text-xl font-bold text-white sm:text-3xl">{curtainLine(view)}</p>
      <span className="mt-4 text-xs text-neutral-400">اضغط للمتابعة</span>
    </button>
  );
}

/** Vote result: who got how many (weighted) votes, abstentions and non-voters. No one's individual vote is shown. */
export function VoteTally({ a, view, big = false }: { a: Announcement; view: PlayerView; big?: boolean }) {
  const tally = a.tally ?? {};
  const rows = Object.entries(tally)
    .filter(([id]) => id !== SKIP)
    .sort((x, y) => y[1] - x[1]);
  const max = Math.max(1, ...Object.values(tally));
  const skips = tally[SKIP] ?? 0;
  const outcome = a.killedIds[0] ?? a.revealedId;

  return (
    <div className={`flex flex-col ${big ? "gap-3 text-2xl" : "gap-2 text-sm"}`}>
      {rows.length === 0 && <p className="text-neutral-400">لم يصوّت أحد ضد أي لاعب.</p>}
      {rows.map(([id, n]) => (
        <div key={id} className="flex items-center gap-3">
          <span className={`w-28 shrink-0 truncate font-bold sm:w-40 ${id === outcome ? "neon-text" : ""}`}>{nameIn(view, id)}</span>
          <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-white/5">
            <span className={`absolute inset-y-0 right-0 rounded-full ${id === outcome ? "bg-[var(--color-blood-soft)]" : "bg-white/30"}`} style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="shrink-0 text-start font-bold whitespace-nowrap tabular-nums">{arDigits(n)} صوت</span>
        </div>
      ))}
      <p className="mt-1 flex flex-wrap gap-x-5 text-neutral-400">
        <span>امتنع: {arDigits(skips)}</span>
        <span>لم يصوّت قبل انتهاء الوقت: {arDigits(a.notVoted ?? 0)}</span>
      </p>
    </div>
  );
}
