"use client";

import { useEffect, useState, type ReactNode } from "react";
import { call } from "@/client/socket";
import { SKIP, type Announcement, type PlayerView, type PublicPlayer } from "@/shared/types";
import { BallotIcon, CrosshairIcon } from "./icons";
import { LeaveButton } from "./Lobby";
import { PHASE_TAGLINE, PHASE_TITLE, PhaseBackdrop, PhaseCurtain, VoteTally, announcementText, recentAnnouncements, winnerText } from "./phases";
import { TopBar } from "./PhaseTimer";
import { PlayerList } from "./PlayerList";
import { RoleCard } from "./RoleCard";
import { SecretPanel } from "./SecretPanel";
import { NIGHT_TURN_LABEL, ROLE_LABEL_AR } from "@/shared/roleText";
import { Button, ErrorText, Panel, arDigits } from "./ui";

type Run = (event: Parameters<typeof call>[0], ...args: unknown[]) => Promise<boolean>;

export function GameScreen({ view, now }: { view: PlayerView; now: () => number }) {
  const [error, setError] = useState<string | null>(null);
  const me = view.players.find((p) => p.id === view.meId)!;
  const canAdvance = (view.isHost || me.isGM) && ["ROLE_REVEAL", "NIGHT", "DAY", "VOTING", "VERDICT", "REVENGE"].includes(view.phase);
  const recent = recentAnnouncements(view);
  const night = view.phase === "NIGHT";

  const run: Run = async (event, ...args) => {
    setError(null);
    const res = await call(event, ...args);
    if (!res.ok) setError(res.error);
    return res.ok;
  };

  // Silent cues. Phase changes buzz every phone (PhaseCurtain); each later
  // night turn buzzes every living player too, so a buzz never singles
  // anyone out. The Mafia turn opens the night, so the curtain covers it.
  const myRevenge = view.phase === "REVENGE" && view.revengeBy === me.id;
  useEffect(() => {
    if (night && me.alive && !me.isGM && view.nightTurn && view.nightTurn !== "MAFIA") navigator.vibrate?.([40, 80, 40]);
  }, [view.nightTurn]); // only night-turn changes buzz here

  return (
    <div data-phase={view.phase} className="flex flex-col gap-4">
      <PhaseBackdrop phase={view.phase} />
      <PhaseCurtain view={view} />
      <TopBar subtitle="ليلة الغموض" deadline={view.deadline} now={now} night={night || view.phase === "ROLE_REVEAL"} />

      <header className="text-center">
        <h1 className="neon-text text-3xl font-black">{PHASE_TITLE[view.phase]}</h1>
        <p className="mt-1 text-sm text-neutral-400">{view.phase === "GAME_OVER" ? winnerText(view) : PHASE_TAGLINE[view.phase]}</p>
        <p dir="ltr" className="mt-1 text-[11px] tracking-[0.2em] text-neutral-600 uppercase">
          Room {view.code} · Round {view.round}
        </p>
      </header>

      {me.role && view.phase !== "GAME_OVER" && (
        <RoleCard
          role={me.role}
          godfather={view.godfatherId === me.id}
          large={view.phase === "ROLE_REVEAL"}
          teammates={view.players
            .filter((p) => p.role === "MAFIA" && p.id !== me.id && p.alive)
            .map((p) => (p.id === view.godfatherId ? `${p.name} (الكبير)` : p.name))}
        />
      )}

      {view.phase !== "ROLE_REVEAL" && recent.map((a, i) => <AnnouncementBanner key={i} a={a} view={view} />)}

      <PhaseBody view={view} me={me} run={run} />

      {view.progress.required > 0 && view.phase !== "REVENGE" && (
        <p className="text-center text-xs text-neutral-500">
          جاهز {arDigits(view.progress.done)} من {arDigits(view.progress.required)}
        </p>
      )}
      <ErrorText>{error}</ErrorText>

      <Panel title="اللاعبون" eyebrow="Players">
        <PlayerList view={view} />
      </Panel>

      {view.log.length > 0 && view.phase === "GAME_OVER" && (
        <Panel title="أحداث اللعبة" eyebrow="Story">
          <ol className="flex flex-col gap-1.5 text-sm">
            {view.log.map((e, i) => (
              <li key={i} dir="auto" className={e.secret ? "text-neutral-500" : "text-neutral-200"}>
                <span className="text-ember/70">ج{arDigits(e.round)}: </span>
                {e.text}
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {canAdvance && (
        <Button variant="ghost" onClick={() => run("game:advance")}>
          تخطَّ إلى المرحلة التالية
        </Button>
      )}
      {view.phase === "GAME_OVER" && view.isHost && <Button onClick={() => run("game:playAgain")}>العب مرة أخرى</Button>}
      <LeaveButton />

      {myRevenge && <RevengePicker view={view} run={run} />}
    </div>
  );
}

function PhaseBody({ view, me, run }: { view: PlayerView; me: PublicPlayer; run: Run }) {
  const alive = view.players.filter((p) => p.alive && !p.isGM);
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? "—";

  if (view.phase === "ROLE_REVEAL") {
    if (!me.role) return <Panel>اللاعبون يطّلعون على أدوارهم…</Panel>;
    return (
      <Button disabled={view.hasAckedReveal} onClick={() => run("reveal:ack")}>
        {view.hasAckedReveal ? "بانتظار الآخرين…" : "رأيت دوري"}
      </Button>
    );
  }

  if (view.phase === "GAME_OVER") {
    return (
      <Panel className="neon text-center">
        <p className={`text-2xl font-black ${view.winner === "MAFIA" ? "neon-text" : "text-white"}`}>
          {view.winner === "MAFIA" ? "فازت المافيا" : "فازت المدينة"}
        </p>
      </Panel>
    );
  }

  // Each phase and each night turn starts covered again.
  const secretKey = `${view.phase}-${view.round}-${view.nightTurn ?? ""}`;
  const verdict = view.announcements.at(-1);
  if (view.phase === "VERDICT" && verdict) {
    return (
      <Panel title="نتيجة التصويت" eyebrow="Verdict" subtitle={view.revengeBy ? "بعدها يختار المواطن الصالح من يسحبه معه." : "بعدها يبدأ الليل."}>
        <VoteTally a={verdict} view={view} />
      </Panel>
    );
  }
  if (me.isGM) {
    return (
      <SecretPanel resetKey={secretKey}>
        <GmPanel view={view} nameOf={nameOf} />
      </SecretPanel>
    );
  }

  if (view.phase === "REVENGE" && view.revengeBy !== me.id) {
    return <Panel>{nameOf(view.revengeBy)}، المواطن الصالح، يختار من سيسحبه معه…</Panel>;
  }

  if (!me.alive) {
    const dragged = view.announcements.find((a) => a.kind === "REVENGE" && a.killedIds.includes(me.id));
    return (
      <Panel title="وضع المشاهدة" eyebrow="Spectator">
        <p className="text-neutral-300">{dragged ? `سحبك ${nameOf(dragged.byId)} معه.` : "لقد خرجت من اللعبة."}</p>
        <p className="mt-1 text-sm text-neutral-500">تابع بصمت؛ لا يمكنك التصويت أو القيام بأي فعل.</p>
      </Panel>
    );
  }

  if (view.phase === "DAY") {
    return (
      <Panel title="النقاش" eyebrow="Discussion">
        <p className="text-sm text-neutral-300">ناقشوا من قد يكون من المافيا. يبدأ التصويت عند انتهاء الوقت.</p>
      </Panel>
    );
  }

  if (view.phase === "VOTING") {
    return (
      <SecretPanel resetKey={secretKey}>
      <Panel title="صوّت لإخراج لاعب:" eyebrow="Cast your vote" subtitle={me.voteWeight > 1 ? `صوتك يُحسب ×${arDigits(me.voteWeight)}` : "تصويتك سري."}>
        <TargetPicker
          key={`vote-${view.round}`}
          candidates={alive.filter((p) => p.id !== me.id)}
          current={view.myVote}
          allowSkip="امتناع عن التصويت"
          confirmLabel={(id) => (id === SKIP ? "تأكيد الامتناع" : "تأكيد التصويت في الخفاء")}
          onConfirm={(id) => run("vote:cast", { targetId: id })}
          Icon={BallotIcon}
        />
      </Panel>
      </SecretPanel>
    );
  }

  // NIGHT: every living player gets the same cover, actions or not.
  return (
    <SecretPanel resetKey={secretKey}>
      <NightBody view={view} me={me} run={run} nameOf={nameOf} />
    </SecretPanel>
  );
}

/**
 * Night runs one role at a time (Mafia → Doctor → Detective → Sniper). A
 * player only gets controls on their own turn; everyone else sees whose turn
 * it is, the same "wait silently" screen a citizen sees.
 */
function NightBody({ view, me, run, nameOf }: { view: PlayerView; me: PublicPlayer; run: Run; nameOf: (id: string | null | undefined) => string }) {
  const alive = view.players.filter((p) => p.alive && !p.isGM);
  const pick = (id: string) => run("night:act", { targetId: id });
  const turn = view.nightTurn;
  const wait = (extra?: ReactNode) => (
    <>
      {extra}
      <Sleeping text={turn ? `الآن ${NIGHT_TURN_LABEL[turn]}… انتظر بصمت` : "المدينة نائمة…"} />
    </>
  );

  switch (me.role) {
    case "MAFIA": {
      if (turn !== "MAFIA") {
        return wait(
          <Panel>
            <p className="text-sm text-neutral-300">
              ضحية الليلة: <span className="font-bold text-ember">{view.myNightTarget ? nameOf(view.myNightTarget) : "لم تُحدَّد"}</span>
            </p>
          </Panel>,
        );
      }
      const victims = alive.filter((p) => p.role !== "MAFIA");
      if (view.godfatherId === me.id) {
        return (
          <Panel title="أنت كبير المافيا: اختر الضحية" eyebrow="Godfather" subtitle="القرار لك وحدك. يرى أفراد المافيا اختيارك مباشرة.">
            <TargetPicker
              key={`m-${view.round}`}
              candidates={victims}
              current={view.mafiaSelection ?? null}
              confirmLabel={() => "تأكيد الخيار في الخفاء"}
              onConfirm={pick}
              onSelect={(id) => void call("night:select", { targetId: id })}
            />
          </Panel>
        );
      }
      return (
        <Panel title={`كبير المافيا ${nameOf(view.godfatherId)} يختار الضحية`} eyebrow="Watching" subtitle="تابع اختياره مباشرة؛ القرار له وحده.">
          <ul className="flex flex-col gap-2.5">
            {victims.map((p, i) => {
              const lit = p.id === view.mafiaSelection;
              return (
                <li key={p.id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${lit ? "neon bg-blood/10" : "border-white/[0.07] bg-black/40"}`}>
                  <span className="flex-1 font-semibold">
                    <span className="text-neutral-400">{arDigits(i + 1)}. </span>
                    {p.name}
                  </span>
                  {lit && (
                    <span className="flex items-center gap-1 text-sm font-bold text-ember">
                      اختيار الكبير
                      <CrosshairIcon className="size-4" />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      );
    }
    case "DOCTOR":
      if (turn !== "DOCTOR") return wait();
      return (
        <Panel title="اختر من تحميه:" eyebrow="Protect" subtitle="شخص واحد تنقذه من المافيا هذه الليلة.">
          <TargetPicker key={`d-${view.round}`} candidates={alive} current={view.myNightTarget} confirmLabel={() => "تأكيد الحماية في الخفاء"} onConfirm={pick} />
        </Panel>
      );
    case "DETECTIVE": {
      const tonight = view.investigations?.find((i) => i.round === view.round);
      if (turn !== "DETECTIVE") return wait(tonight && <Verdict name={nameOf(tonight.targetId)} isMafia={tonight.isMafia} />);
      return (
        <Panel title="اختر من تحقق معه:" eyebrow="Investigate" subtitle="ستعرف النتيجة فوراً وبسرية.">
          {tonight ? (
            <Verdict name={nameOf(tonight.targetId)} isMafia={tonight.isMafia} />
          ) : (
            <TargetPicker key={`x-${view.round}`} candidates={alive.filter((p) => p.id !== me.id)} current={null} confirmLabel={() => "تحقّق في الخفاء"} onConfirm={pick} />
          )}
          {!!view.investigations?.length && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-white/10 pt-3 text-sm text-neutral-400">
              {view.investigations.map((i) => (
                <li key={i.round}>
                  الليلة {arDigits(i.round)}: {nameOf(i.targetId)} — {i.isMafia ? <span className="text-ember">مافيا</span> : "بريء"}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      );
    }
    case "SNIPER":
      if (!view.sniperShotAvailable) return <Sleeping text="أطلقت رصاصتك الوحيدة. المدينة نائمة…" />;
      if (turn !== "SNIPER") {
        return wait(
          view.myNightTarget && view.myNightTarget !== SKIP ? (
            <Panel>
              <p className="text-sm text-neutral-300">رصاصتك نحو {nameOf(view.myNightTarget)} تصيب مع الفجر.</p>
            </Panel>
          ) : undefined,
        );
      }
      return (
        <Panel title="اختر هدفك:" eyebrow="One bullet" subtitle="إن أصبت مافيا تنجو، وإن أصبت بريئاً تموتان معاً.">
          <TargetPicker
            key={`s-${view.round}`}
            candidates={alive.filter((p) => p.id !== me.id)}
            current={null}
            allowSkip="أمسك النار هذه الليلة"
            confirmLabel={(id) => (id === SKIP ? "تأكيد عدم الإطلاق" : "أطلق النار في الخفاء")}
            onConfirm={pick}
          />
        </Panel>
      );
    default:
      return wait();
  }
}

/**
 * Numbered rows with a check square; the chosen row lights up with a
 * "مختار" tag and a confirm button appears, so a stray tap can't act.
 */
function TargetPicker({
  candidates,
  current,
  confirmLabel,
  onConfirm,
  allowSkip,
  note,
  onSelect,
  Icon = CrosshairIcon,
}: {
  candidates: PublicPlayer[];
  current: string | null;
  confirmLabel: (id: string) => string;
  onConfirm: (id: string) => Promise<boolean>;
  allowSkip?: string;
  note?: (id: string) => string;
  /** Called as the highlighted row changes, before confirming. */
  onSelect?: (id: string | null) => void;
  /** Crosshair for night actions; the day vote uses a ballot so it never looks like a kill. */
  Icon?: typeof CrosshairIcon;
}) {
  const [selected, setSelectedState] = useState<string | null>(null);
  const setSelected = (id: string | null) => {
    setSelectedState(id);
    onSelect?.(id);
  };
  const [busy, setBusy] = useState(false);
  const options = [...candidates.map((p) => ({ id: p.id, label: p.name })), ...(allowSkip ? [{ id: SKIP as string, label: allowSkip }] : [])];

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    if (await onConfirm(selected)) setSelected(null);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {options.map((o, i) => {
        const isSelected = o.id === selected;
        const isCurrent = o.id === current && !selected;
        const lit = isSelected || isCurrent;
        return (
          <button
            key={o.id}
            onClick={() => setSelected(isSelected ? null : o.id)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-start transition ${
              lit ? "neon bg-blood/10" : "border-white/[0.07] bg-black/40 active:bg-white/[0.04]"
            }`}
          >
            <span className={`flex-1 font-semibold ${o.id === SKIP ? "text-neutral-400" : "text-white"}`}>
              {o.id !== SKIP && <span className="text-neutral-400">{arDigits(i + 1)}. </span>}
              {o.label}
              {note?.(o.id) && <span className="ms-2 text-xs font-normal text-neutral-500">{note(o.id)}</span>}
            </span>
            {lit ? (
              <span className="flex items-center gap-1 text-sm font-bold text-ember">
                {isSelected ? "مختار" : "تم التأكيد"}
                <Icon className="size-4" />
              </span>
            ) : (
              <span className="size-5 rounded-md border border-white/10 bg-white/[0.04]" aria-hidden />
            )}
          </button>
        );
      })}
      {selected && (
        <Button className="mt-2" disabled={busy} onClick={confirm} icon={<Icon className="size-5" />}>
          {confirmLabel(selected)}
        </Button>
      )}
    </div>
  );
}

function RevengePicker({ view, run }: { view: PlayerView; run: Run }) {
  const alive = view.players.filter((p) => p.alive && !p.isGM);
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/85 p-4 backdrop-blur-sm sm:items-center">
      <div className="glass neon max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl p-4">
        <p className="text-xs font-semibold text-amber-300">المواطن الصالح · Upright Citizen</p>
        <h2 className="neon-text mt-1 text-2xl font-black">اسحب أحدهم معك</h2>
        <p className="mt-1 mb-4 text-sm text-neutral-400">صوّتت المدينة لإخراجك. اختر لاعباً واحداً ليخرج معك.</p>
        <TargetPicker candidates={alive} current={null} confirmLabel={() => "اسحبه معي"} onConfirm={(id) => run("revenge:pick", { targetId: id })} />
      </div>
    </div>
  );
}

function GmPanel({ view, nameOf }: { view: PlayerView; nameOf: (id: string | null | undefined) => string }) {
  const gm = view.gm;
  if (!gm) return null;
  const rows: [string, ReactNode][] =
    view.phase === "NIGHT"
      ? [
          ["الدور الحالي", gm.night.turn ? `${NIGHT_TURN_LABEL[gm.night.turn]}${gm.night.ghostEndsAt ? " (شكلي: صاحب الدور لا يستطيع اللعب)" : ""}` : "—"],
          ["كبير المافيا", nameOf(view.godfatherId)],
          [ROLE_LABEL_AR.MAFIA, gm.night.mafiaTarget ? `${nameOf(gm.night.mafiaTarget)} ✓` : gm.night.mafiaSelection ? `${nameOf(gm.night.mafiaSelection)} (يفكر)` : "—"],
          [ROLE_LABEL_AR.DOCTOR, nameOf(gm.night.doctorTarget)],
          [ROLE_LABEL_AR.DETECTIVE, nameOf(gm.night.detectiveTarget)],
          [ROLE_LABEL_AR.SNIPER, gm.night.sniperTarget === SKIP ? "أمسك النار" : nameOf(gm.night.sniperTarget)],
        ]
      : view.phase === "VOTING"
        ? Object.entries(gm.votes).map(([v, t]) => [nameOf(v), t === SKIP ? "امتناع" : nameOf(t)])
        : [];
  const players = view.players.filter((p) => !p.isGM);
  return (
    <>
      <Panel
        title="لوحة الراوي"
        eyebrow="Game Master · live"
        subtitle={view.progress.required ? `${view.phase === "NIGHT" ? "أدوار منتهية" : "جاهز"} ${arDigits(view.progress.done)} من ${arDigits(view.progress.required)}` : undefined}
      >
        {rows.length ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-neutral-500">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-neutral-400">اروِ أحداث {PHASE_TITLE[view.phase]}.</p>
        )}
      </Panel>
      <Panel title="الأدوار السرية" eyebrow="All roles">
        <ul className="grid grid-cols-2 gap-1.5 text-sm">
          {players.map((p) => (
            <li key={p.id} className={`flex justify-between gap-2 rounded-lg bg-black/40 px-2.5 py-1.5 ${p.alive ? "" : "opacity-45 line-through"}`}>
              <span className="truncate">{p.name}</span>
              <span className={p.role === "MAFIA" ? "text-ember" : "text-neutral-400"}>{p.role ? ROLE_LABEL_AR[p.role] : "—"}</span>
            </li>
          ))}
        </ul>
      </Panel>
      {view.log.length > 0 && (
        <Panel title="السجل الكامل" eyebrow="Full log">
          <ol className="flex max-h-64 flex-col gap-1.5 overflow-y-auto text-sm">
            {view.log.map((e, i) => (
              <li key={i} className={e.secret ? "text-neutral-500" : "text-neutral-200"}>
                <span className="text-ember/70">ج{arDigits(e.round)}: </span>
                {e.text}
              </li>
            ))}
          </ol>
        </Panel>
      )}
    </>
  );
}

function Verdict({ name, isMafia }: { name: string; isMafia: boolean }) {
  return (
    <p className={`rounded-xl border px-4 py-6 text-center text-xl font-bold ${isMafia ? "neon bg-blood/15 text-ember" : "border-emerald-500/50 bg-emerald-900/20 text-emerald-300"}`}>
      {name} {isMafia ? "من المافيا!" : "بريء"}
    </p>
  );
}

function Sleeping({ text }: { text: string }) {
  return (
    <Panel>
      <p className="animate-pulse py-12 text-center text-xl font-bold text-neutral-500">{text}</p>
    </Panel>
  );
}

function AnnouncementBanner({ a, view }: { a: Announcement; view: PlayerView }) {
  return <p className="glass neon rounded-xl px-4 py-3 text-center text-base font-bold">{announcementText(a, view)}</p>;
}
