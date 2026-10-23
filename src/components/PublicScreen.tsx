"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { NIGHT_TURN_LABEL, ROLE_LABEL_AR } from "@/shared/roleText";
import type { Phase, PlayerView } from "@/shared/types";
import { CrosshairIcon } from "./icons";
import { TopBar } from "./PhaseTimer";
import { PHASE_TAGLINE, PHASE_TITLE, PhaseBackdrop, PhaseCurtain, VoteTally, announcementText, nameIn, recentAnnouncements, winnerText } from "./phases";
import { arDigits } from "./ui";

// Big-screen layout for a projector or TV. It renders the public view only
// (the server never sends this screen a secret), so it's safe to show the room.

/** The projector addresses the whole room, so a few taglines differ from the phones'. */
const SCREEN_TAGLINE: Partial<Record<Phase, string>> = {
  LOBBY: "امسح الرمز بهاتفك للانضمام",
  ROLE_REVEAL: "كل لاعب يطّلع على دوره بسرية على هاتفه",
  NIGHT: "المدينة نائمة... الجميع يتخذ قراره بصمت",
  VOTING: "صوّتوا بسرية على هواتفكم",
};

export function PublicScreen({ view, now }: { view: PlayerView; now: () => number }) {
  const night = view.phase === "NIGHT";
  const players = view.players.filter((p) => !p.isGM);
  const recent = recentAnnouncements(view);
  const verdict = view.phase === "VERDICT" ? view.announcements.at(-1) : undefined;

  return (
    <div data-phase={view.phase} className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-6 py-6 lg:px-10">
      <PhaseBackdrop phase={view.phase} />
      <PhaseCurtain view={view} />
      <TopBar subtitle="ليلة الغموض" deadline={view.deadline} now={now} night={night || view.phase === "ROLE_REVEAL"} />

      <header className="text-center">
        <h1 className="neon-text text-5xl font-black lg:text-7xl">{PHASE_TITLE[view.phase]}</h1>
        <p className="mt-3 text-xl text-neutral-300 lg:text-2xl">
          {view.phase === "GAME_OVER" ? winnerText(view) : (SCREEN_TAGLINE[view.phase] ?? PHASE_TAGLINE[view.phase])}
        </p>
      </header>

      {view.nightTurn && (
        <p className="glass neon mx-auto rounded-full px-10 py-3 text-3xl font-black text-white lg:text-4xl">الآن {NIGHT_TURN_LABEL[view.nightTurn]}</p>
      )}

      {view.phase === "LOBBY" ? (
        <JoinCard code={view.code} />
      ) : (
        <>
          {view.phase !== "ROLE_REVEAL" &&
            recent.map((a, i) => (
              <p key={i} className="glass neon mx-auto rounded-2xl px-8 py-5 text-center text-2xl font-bold lg:text-3xl">
                {announcementText(a, view)}
              </p>
            ))}
          {verdict && (
            <section className="glass mx-auto w-full max-w-3xl rounded-2xl p-6">
              <VoteTally a={verdict} view={view} big />
            </section>
          )}
          {view.phase === "REVENGE" && (
            <p className="glass neon mx-auto rounded-2xl px-8 py-4 text-center text-2xl font-bold">
              {nameIn(view, view.revengeBy)} يختار الآن من سيسحبه معه…
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

