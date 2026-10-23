"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { ROLE_LABEL_AR } from "@/shared/roleText";
import { SKIP, type Announcement, type Phase, type PlayerView } from "@/shared/types";
import { BallotIcon, CrosshairIcon, MoonIcon, SilhouetteIcon, SkullIcon, SunIcon } from "./icons";
import { arDigits } from "./ui";

// Phase wording and visuals shared by the phone screens and the projector.

export const PHASE_TITLE: Record<Phase, string> = {
  LOBBY: "غرفة الانتظار",
  ROLE_REVEAL: "كشف الأدوار",
  NIGHT: "مرحلة الليل",
  MORNING: "إعلان الصباح",
  DAY: "مرحلة النقاش",
  VOTING: "مرحلة التصويت",
  VERDICT: "نتيجة التصويت",
  REVENGE: "انتقام المواطن الصالح",
  GAME_OVER: "نهاية اللعبة",
};

export const PHASE_TAGLINE: Record<Phase, string> = {
  LOBBY: "اجمع اللاعبين... الليل يقترب",
  ROLE_REVEAL: "اضغط مطولاً على الكارت لرؤية دورك بسرية",
  NIGHT: "المدينة نائمة... اتخذ قرارك بصمت",
  MORNING: "أشرقت الشمس... وهذا ما حدث في الليل",
  DAY: "ناقشوا من بينكم من المافيا",
  VOTING: "صوّت بسرية لإخراج المشتبه به",
  VERDICT: "هذا ما قررته المدينة",
  REVENGE: "المواطن الصالح يختار من يسحبه معه",
  GAME_OVER: "انكشفت كل الأوراق",
};

const PHASE_ICON: Record<Phase, ComponentType<SVGProps<SVGSVGElement>>> = {
  LOBBY: CrosshairIcon,
  ROLE_REVEAL: SilhouetteIcon,
  NIGHT: MoonIcon,
  MORNING: SunIcon,
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
  if (a.kind === "NIGHT") {
    if (a.killedIds.length === 0) return "طلع الصباح... هادئة كانت الليلة، ولم يمت أحد!";
    if (a.killedIds.length === 1) return `طلع الصباح... للأسف تم اغتيال اللاعب ${names(a.killedIds)} الليلة الماضية.`;
    return `طلع الصباح... للأسف تم اغتيال ${names(a.killedIds)} الليلة الماضية.`;
  }
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
  if (view.phase === "VERDICT" && last) return announcementText(last, view);
  return PHASE_TAGLINE[view.phase];
}

/** Full-page tint that changes colour with the phase (see `[data-phase]` in globals.css). */
export function PhaseBackdrop({ phase }: { phase: Phase }) {
  return <div className="phase-backdrop pointer-events-none fixed inset-0 -z-10 transition-[background] duration-700" data-dark={phase === "NIGHT"} aria-hidden />;
}

const CURTAIN_MS = 3200;

/**
 * Full-screen card on every phase change, so nobody misses it: big icon, the
 * phase name and what just happened. Tap to dismiss early. Not shown for the
 * screen you open on, nor for the morning, whose own screen is the big reveal.
 * Vibration is handled separately (client/haptics.ts).
 */
export function PhaseCurtain({ view }: { view: PlayerView }) {
  const key = `${view.phase}-${view.round}`;
  const seen = useRef<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  // Raise only when the phase actually changes from one we already showed.
  // Comparing with the previous key (rather than "first run") also keeps
  // React's double-run of effects in development from raising it on load.
  useEffect(() => {
    const prev = seen.current;
    seen.current = key;
    if (prev === null || prev === key || view.phase === "LOBBY" || view.phase === "MORNING") return;
    setShown(key);
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

/**
 * The morning announcement card: a skull and name for each player who died in
 * the night (several when the Sniper's shot took two), or a calm "nobody
 * died" card. Shows a dead player's role only when roles are public.
 */
export function MorningCard({ view, big = false }: { view: PlayerView; big?: boolean }) {
  return (
    <>
      {/* Night fading into dawn as the morning screen arrives. */}
      <div key={view.round} className="dawn-fade pointer-events-none fixed inset-0 z-40" aria-hidden />
      <MorningOutcome view={view} big={big} />
    </>
  );
}

function MorningOutcome({ view, big }: { view: PlayerView; big: boolean }) {
  const night = [...view.announcements].reverse().find((a) => a.kind === "NIGHT" && a.round === view.round);
  const dead = (night?.killedIds ?? []).map((id) => view.players.find((p) => p.id === id)).filter((p) => !!p);

  if (dead.length === 0) {
    return (
      <section className={`dawn-card glass neon flex flex-col items-center gap-4 rounded-3xl px-6 text-center ${big ? "py-14" : "py-10"}`}>
        <SunIcon className={`neon-text ${big ? "size-24" : "size-16"}`} />
        <p className={`font-black text-white ${big ? "text-5xl" : "text-2xl"}`}>طلع الصباح...</p>
        <p className={`font-bold text-neutral-200 ${big ? "text-3xl" : "text-lg"}`}>هادئة كانت الليلة، ولم يمت أحد!</p>
      </section>
    );
  }

  return (
    <section className={`dawn-card glass neon flex flex-col items-center gap-4 rounded-3xl px-6 text-center py-8`}>
      <p className={`font-black text-white ${big ? "text-5xl" : "text-2xl"}`}>طلع الصباح...</p>
      <p className={`text-neutral-300 ${big ? "text-2xl" : "text-base"}`}>
        {dead.length === 1 ? "للأسف تم اغتيال اللاعب" : dead.length === 2 ? "للأسف سقط لاعبان" : `للأسف سقط ${arDigits(dead.length)} لاعبين`} الليلة الماضية:
      </p>
      <ul className={`flex flex-wrap justify-center gap-3 ${big ? "gap-5" : ""}`}>
        {dead.map((p) => (
          <li key={p.id} className="flex flex-col items-center gap-2 rounded-2xl border border-red-500/40 bg-red-950/40 px-5 py-4 shadow-[0_0_30px_rgb(255_30_40/0.35)]">
            <SkullIcon className={`text-red-300 drop-shadow-[0_0_12px_rgb(255_40_50/0.8)] ${big ? "size-20" : "size-12"}`} />
            <span className={`font-black text-white ${big ? "text-4xl" : "text-2xl"}`}>{p.name}</span>
            {p.role && <span className={`text-red-200/80 ${big ? "text-xl" : "text-sm"}`}>كان: {ROLE_LABEL_AR[p.role]}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
