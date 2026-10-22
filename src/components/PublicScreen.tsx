"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { ROLE_LABEL_AR } from "@/shared/roleText";
import type { Announcement, Phase, PlayerView } from "@/shared/types";
import { CrosshairIcon } from "./icons";
import { TopBar } from "./PhaseTimer";
import { arDigits } from "./ui";

// Big-screen layout for a projector or TV. It renders the public view only
// (the server never sends this screen a secret), so it's safe to show the room.

const TITLE: Record<Phase, string> = {
  LOBBY: "غرفة الانتظار",
  ROLE_REVEAL: "كشف الأدوار",
  NIGHT: "مرحلة الليل",
  DAY: "مرحلة النهار",
  VOTING: "مرحلة التصويت",
  REVENGE: "انتقام المواطن الصالح",
  GAME_OVER: "نهاية اللعبة",
};

const TAGLINE: Record<Phase, string> = {
  LOBBY: "امسح الرمز بهاتفك للانضمام",
  ROLE_REVEAL: "كل لاعب يطّلع على دوره بسرية على هاتفه",
  NIGHT: "المدينة نائمة... الجميع يتخذ قراره بصمت",
  DAY: "استيقظت المدينة... ناقشوا من بينكم من المافيا",
  VOTING: "صوّتوا بسرية على هواتفكم",
  REVENGE: "المواطن الصالح يختار من يسحبه معه",
  GAME_OVER: "انكشفت كل الأوراق",
};

export function PublicScreen({ view, now }: { view: PlayerView; now: () => number }) {
  const night = view.phase === "NIGHT";
  const players = view.players.filter((p) => !p.isGM);
  const recent = view.announcements.slice(view.announcements.at(-1)?.kind === "REVENGE" ? -2 : -1);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-6 py-6 lg:px-10">
      {night && <div className="pointer-events-none fixed inset-0 -z-10 bg-black/60" aria-hidden />}
      <TopBar subtitle="ليلة الغموض" deadline={view.deadline} now={now} night={night || view.phase === "ROLE_REVEAL"} />

      <header className="text-center">
        <h1 className="neon-text text-5xl font-black lg:text-7xl">{TITLE[view.phase]}</h1>
        <p className="mt-3 text-xl text-neutral-300 lg:text-2xl">
          {view.phase === "GAME_OVER" ? (view.winner === "MAFIA" ? "انتصرت المافيا وسيطرت على المدينة" : "انتصرت المدينة وتم القضاء على المافيا") : TAGLINE[view.phase]}
        </p>
      </header>

      {view.phase === "LOBBY" ? (
        <JoinCard code={view.code} />
      ) : (
        <>
          {view.phase !== "ROLE_REVEAL" && recent.map((a, i) => <Banner key={i} a={a} view={view} />)}
          {view.phase === "REVENGE" && (
            <p className="glass neon mx-auto rounded-2xl px-8 py-4 text-center text-2xl font-bold">
              {nameOf(view, view.revengeBy)} يختار الآن من سيسحبه معه…
            </p>
          )}
          {view.progress.required > 0 && view.phase !== "REVENGE" && (
            <p className="text-center text-xl text-neutral-400">
              {view.phase === "VOTING" ? "صوّت" : "جاهز"} {arDigits(view.progress.done)} من {arDigits(view.progress.required)}
            </p>
          )}
        </>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold text-neutral-300">
          اللاعبون ({arDigits(players.filter((p) => p.alive).length)} على قيد الحياة)
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {players.map((p, i) => (
            <li
              key={p.id}
              className={`glass flex items-center gap-3 rounded-2xl px-4 py-4 text-xl ${p.alive ? "" : "opacity-40"} ${p.revealed && p.alive ? "neon" : ""}`}
            >
              <span className={`size-2.5 shrink-0 rounded-full ${p.connected ? "bg-emerald-400" : "bg-neutral-600"}`} />
              <span className={`flex-1 truncate font-bold ${p.alive ? "" : "line-through"}`}>
                <span className="text-neutral-500">{arDigits(i + 1)}. </span>
                {p.name}
              </span>
              {p.role && <span className={`shrink-0 text-base ${p.role === "MAFIA" ? "text-ember" : "text-amber-300"}`}>{ROLE_LABEL_AR[p.role]}</span>}
              {!p.role && !p.alive && <span className="shrink-0 text-base text-neutral-500">خرج</span>}
            </li>
          ))}
        </ul>
      </section>

      {view.phase === "GAME_OVER" && view.log.length > 0 && (
        <section className="glass rounded-2xl p-5">
          <h2 className="mb-3 text-lg font-bold">أحداث اللعبة</h2>
          <ol className="grid gap-1.5 text-lg lg:grid-cols-2">
            {view.log.map((e, i) => (
              <li key={i} className={e.secret ? "text-neutral-500" : "text-neutral-200"}>
                <span className="text-ember/70">ج{arDigits(e.round)}: </span>
                {e.text}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function JoinCard({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(`${window.location.origin}/join/${code}`), [code]);
  return (
    <div className="glass neon mx-auto flex flex-col items-center gap-8 rounded-3xl p-8 sm:flex-row">
      {url && (
        <div className="rounded-2xl bg-white p-4 shadow-[0_0_40px_rgb(255_30_40/0.5)]">
          <QRCodeSVG value={url} size={240} />
        </div>
      )}
      <div className="text-center sm:text-start">
        <p className="text-lg text-neutral-400">رمز الغرفة</p>
        <p dir="ltr" className="neon-text text-7xl font-black tracking-[0.3em] lg:text-8xl">
          {code}
        </p>
        <p dir="ltr" className="mt-3 text-lg text-neutral-400">
          {url.replace(/^https?:\/\//, "")}
        </p>
        <p className="mt-4 flex items-center justify-center gap-2 text-neutral-500 sm:justify-start">
          <CrosshairIcon className="size-5" /> الأدوار سرية، تظهر فقط على هاتف كل لاعب
        </p>
      </div>
    </div>
  );
}

function nameOf(view: PlayerView, id: string | null | undefined) {
  return view.players.find((p) => p.id === id)?.name ?? "؟";
}

function Banner({ a, view }: { a: Announcement; view: PlayerView }) {
  const names = (ids: string[]) => ids.map((id) => nameOf(view, id)).join(" و");
  let text: string;
  if (a.kind === "NIGHT") text = a.killedIds.length ? `قُتل ${names(a.killedIds)} الليلة الماضية.` : "نجا الجميع هذه الليلة.";
  else if (a.kind === "REVENGE") text = `سحب ${names([a.byId!])} معه ${names(a.killedIds)}.`;
  else if (a.revealedId && !a.killedIds.length) text = `انكشف ${names([a.revealedId])}: إنه شيخ المواطنين! ينجو ويصبح صوته بثلاثة أصوات.`;
  else if (a.revealedId) text = `أُعدم ${names(a.killedIds)}، وكان ${ROLE_LABEL_AR.UPRIGHT}!`;
  else text = a.killedIds.length ? `أعدمت المدينة ${names(a.killedIds)}.` : "لم تتفق المدينة. لم يُعدم أحد.";
  return <p className="glass mx-auto rounded-2xl px-8 py-5 text-center text-2xl font-bold lg:text-3xl">{text}</p>;
}
