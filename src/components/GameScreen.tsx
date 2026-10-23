"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useHaptics, useHapticsNeedsTap } from "@/client/haptics";
import { call } from "@/client/socket";
import { SKIP, type Announcement, type PlayerView, type PublicPlayer } from "@/shared/types";
import { BallotIcon, CrosshairIcon, MoonIcon, SunIcon } from "./icons";
import { LeaveButton } from "./Lobby";
import { PHASE_TAGLINE, PHASE_TITLE, PhaseBackdrop, PhaseCurtain, VoteTally, announcementText, recentAnnouncements, winnerText } from "./phases";
import { BigTimer, TopBar } from "./PhaseTimer";
import { PlayerList } from "./PlayerList";
import { RoleCard } from "./RoleCard";
import { SecretPanel } from "./SecretPanel";
import { NIGHT_TURN_LABEL, ROLE_LABEL_AR } from "@/shared/roleText";
import { Button, ErrorText, Panel, arDigits } from "./ui";

type Run = (event: Parameters<typeof call>[0], ...args: unknown[]) => Promise<boolean>;

export function GameScreen({ view, now }: { view: PlayerView; now: () => number }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const me = view.players.find((p) => p.id === view.meId)!;
  const canAdvance = (view.isHost || me.isGM) && ["ROLE_REVEAL", "NIGHT", "MORNING", "DAY", "VOTING", "VERDICT", "REVENGE"].includes(view.phase);
  const canEnd = view.isHost && view.phase !== "GAME_OVER";
  const recent = recentAnnouncements(view);
  const night = view.phase === "NIGHT";
  const myRevenge = view.stage === "REVENGE" && view.revengeBy === me.id;

  useHaptics(view);
  const needsTap = useHapticsNeedsTap(view.settings.haptics !== "OFF");

  const run: Run = async (event, ...args) => {
    setError(null);
    const res = await call(event, ...args);
    if (!res.ok) setError(res.error);
    return res.ok;
  };
  const hostControls = (
    <HostControls canAdvance={canAdvance} canEnd={canEnd} onAdvance={() => run("game:advance")} onEnd={() => setConfirmEnd(true)} />
  );

  return (
    <div data-phase={view.phase} className="flex flex-col gap-4">
      <PhaseBackdrop phase={view.phase} />
      <PhaseCurtain view={view} />
      <TopBar subtitle="ليلة الغموض" deadline={view.deadline} now={now} night={night || view.phase === "ROLE_REVEAL"} />
      {needsTap && <p className="glass rounded-full px-4 py-2 text-center text-xs text-neutral-300">اضغط في أي مكان على الشاشة لتفعيل الاهتزاز</p>}

      <header className="flex flex-col items-center gap-3 text-center">
        <div>
          <h1 className="neon-text text-3xl font-black">{PHASE_TITLE[view.phase]}</h1>
          <p className="mt-1 text-sm text-neutral-400">{view.phase === "GAME_OVER" ? winnerText(view) : PHASE_TAGLINE[view.phase]}</p>
        </div>
        <BigTimer deadline={view.deadline} now={now} className="text-6xl" />
        <p dir="ltr" className="text-[11px] tracking-[0.2em] text-neutral-600 uppercase">
          Room {view.code} · Round {view.round}
        </p>
      </header>

      {me.role && view.phase !== "GAME_OVER" && <MyRoleCard view={view} me={me} />}

      {view.stage !== "ROLE_REVEAL" && view.stage !== "DAY_ANNOUNCEMENT" && recent.map((a, i) => <AnnouncementBanner key={i} a={a} view={view} />)}

      <StageBody view={view} me={me} run={run} />

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

      {hostControls}
      {view.phase === "GAME_OVER" && view.isHost && <Button onClick={() => run("game:playAgain")}>العب مرة أخرى</Button>}
      <LeaveButton />

      {night && !me.isGM && <NightScene view={view} me={me} now={now} run={run} error={error} hostControls={hostControls} />}
      <DetectiveResult view={view} />
      {myRevenge && <RevengePicker view={view} run={run} />}
      {confirmEnd && (
        <ConfirmDialog
          text="هل أنت متأكد من إنهاء الجولة وإعادة الجميع إلى غرفة الانتظار؟"
          confirmLabel="نعم، أنهِ اللعبة"
          onCancel={() => setConfirmEnd(false)}
          onConfirm={async () => {
            setConfirmEnd(false);
            await run("game:end");
          }}
        />
      )}
    </div>
  );
}

function MyRoleCard({ view, me }: { view: PlayerView; me: PublicPlayer }) {
  return (
    <RoleCard
      role={me.role!}
      godfather={view.godfatherId === me.id}
      large={view.phase === "ROLE_REVEAL"}
      teammates={view.players
        .filter((p) => p.role === "MAFIA" && p.id !== me.id && p.alive)
        .map((p) => (p.id === view.godfatherId ? `${p.name} (الكبير)` : p.name))}
    />
  );
}

/** Host-only: skip the current phase/turn, and end the whole game. */
function HostControls({ canAdvance, canEnd, onAdvance, onEnd }: { canAdvance: boolean; canEnd: boolean; onAdvance: () => void; onEnd: () => void }) {
  if (!canAdvance && !canEnd) return null;
  return (
    <div className="flex gap-2">
      {canAdvance && (
        <Button variant="ghost" onClick={onAdvance}>
          تخطَّ إلى المرحلة التالية
        </Button>
      )}
      {canEnd && (
        <Button variant="ghost" onClick={onEnd} className="border-red-500/40! text-red-300!">
          إنهاء اللعبة
        </Button>
      )}
    </div>
  );
}

function ConfirmDialog({ text, confirmLabel, onConfirm, onCancel }: { text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="glass neon w-full max-w-sm rounded-2xl p-5 text-center">
        <p className="text-lg font-bold text-white">{text}</p>
        <p className="mt-2 text-sm text-neutral-400">تُمسح الأدوار والأصوات، ويبقى كل اللاعبين في الغرفة.</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={onConfirm} className="bg-none! bg-red-600!">
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Swaps the main panel by the server's stage, so every phone changes screen the moment the server does. */
function StageBody({ view, me, run }: { view: PlayerView; me: PublicPlayer; run: Run }) {
  const alive = view.players.filter((p) => p.alive && !p.isGM);
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? "—";
  const last = view.announcements.at(-1);

  // Stages everyone sees the same way, dead or alive.
  switch (view.stage) {
    case "ROLE_REVEAL":
      if (!me.role) return <Panel>اللاعبون يطّلعون على أدوارهم…</Panel>;
      return (
        <Button disabled={view.hasAckedReveal} onClick={() => run("reveal:ack")}>
          {view.hasAckedReveal ? "بانتظار الآخرين…" : "رأيت دوري"}
        </Button>
      );
    case "GAME_OVER":
      return (
        <Panel className="neon text-center">
          <p className={`text-2xl font-black ${view.winner === "MAFIA" ? "neon-text" : "text-white"}`}>
            {view.winner === "MAFIA" ? "فازت المافيا" : "فازت المدينة"}
          </p>
        </Panel>
      );
    case "DAY_ANNOUNCEMENT":
      return (
        <section className="glass neon flex flex-col items-center gap-3 rounded-2xl px-4 py-10 text-center">
          <SunIcon className="neon-text size-14" />
          <p className="text-2xl font-black text-white">{last ? announcementText(last, view) : "أشرقت الشمس."}</p>
          <p className="text-sm text-neutral-400">يبدأ النقاش خلال لحظات…</p>
        </section>
      );
    case "VERDICT":
      if (!last) return null;
      return (
        <Panel title="نتيجة التصويت" eyebrow="Verdict" subtitle={view.revengeBy ? "بعدها يختار المواطن الصالح من يسحبه معه." : "بعدها يبدأ الليل."}>
          <VoteTally a={last} view={view} />
        </Panel>
      );
  }

  // The GM's dashboard lists every role, so it stays behind the cover.
  if (me.isGM) {
    return (
      <SecretPanel resetKey={`${view.stage}-${view.round}-${view.nightTurn ?? ""}`}>
        <GmPanel view={view} nameOf={nameOf} />
      </SecretPanel>
    );
  }

  if (view.stage === "REVENGE" && view.revengeBy !== me.id) {
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

  switch (view.stage) {
    case "DISCUSSION":
      return (
        <Panel title="النقاش" eyebrow="Discussion">
          <p className="text-sm text-neutral-300">ناقشوا من قد يكون من المافيا. يبدأ التصويت عند انتهاء الوقت.</p>
        </Panel>
      );
    case "VOTING":
      // Open list, no cover: the day vote happens in plain sight.
      return (
        <Panel title="صوّت لإخراج لاعب:" eyebrow="Cast your vote" subtitle={me.voteWeight > 1 ? `صوتك يُحسب ×${arDigits(me.voteWeight)}` : "اختر لاعباً ثم أكّد."}>
          <TargetPicker
            key={`vote-${view.round}`}
            candidates={alive.filter((p) => p.id !== me.id)}
            current={view.myVote}
            allowSkip="امتناع عن التصويت"
            confirmLabel={(id) => (id === SKIP ? "تأكيد الامتناع" : "تأكيد التصويت")}
            onConfirm={(id) => run("vote:cast", { targetId: id })}
            Icon={BallotIcon}
          />
        </Panel>
      );
    default:
      // Night is drawn by NightScene on top of the page.
      return null;
  }
}

/**
 * The whole screen turns to night for every player. It shows the night's
 * countdown and whose turn it is; a player's menu appears only when their
 * own turn comes up, openly, with no cover to tap.
 */
function NightScene({
  view,
  me,
  now,
  run,
  error,
  hostControls,
}: {
  view: PlayerView;
  me: PublicPlayer;
  now: () => number;
  run: Run;
  error: string | null;
  hostControls: ReactNode;
}) {
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? "—";
  const turn = view.nightTurn;
  const myTurn = isMyTurn(view, me);

  return (
    <div data-phase="NIGHT" className="night-scene fixed inset-0 z-30 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 px-4 pt-6 pb-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <MoonIcon className="size-10 text-neutral-200 drop-shadow-[0_0_14px_rgb(255_255_255/0.4)]" />
          <BigTimer deadline={view.deadline} now={now} className={myTurn ? "text-6xl" : "text-8xl"} />
          {turn && <p className="text-xl font-bold text-white">الآن {NIGHT_TURN_LABEL[turn]}</p>}
        </div>

        {myTurn ? (
          <NightAction view={view} me={me} run={run} nameOf={nameOf} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <p className="animate-pulse text-3xl font-black text-neutral-300">{me.alive ? "الليل حالك…" : "أنت تشاهد بصمت…"}</p>
            <p className="text-sm text-neutral-500">{me.alive ? "أغمض عينيك وانتظر بصمت حتى يأتي دورك." : "لا يمكنك القيام بأي فعل."}</p>
            <NightNote view={view} me={me} nameOf={nameOf} />
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        {me.role && <MyRoleCard view={view} me={me} />}
        {hostControls}
      </div>
    </div>
  );
}

function isMyTurn(view: PlayerView, me: PublicPlayer): boolean {
  const turn = view.nightTurn;
  if (!turn || !me.alive || me.role !== turn) return false;
  if (turn === "SNIPER") return !!view.sniperShotAvailable;
  // The Detective's turn stays open while they read the result; the result screen covers it.
  if (turn === "DETECTIVE") return !view.investigations?.some((i) => i.round === view.round);
  return true;
}

/** A line of private context while waiting (only on this player's own phone). */
function NightNote({ view, me, nameOf }: { view: PlayerView; me: PublicPlayer; nameOf: (id: string | null | undefined) => string }) {
  if (me.role === "MAFIA" && view.myNightTarget) return <p className="mt-3 text-sm text-ember">ضحية الليلة: {nameOf(view.myNightTarget)}</p>;
  if (me.role === "SNIPER" && view.myNightTarget && view.myNightTarget !== SKIP) {
    return <p className="mt-3 text-sm text-neutral-300">رصاصتك نحو {nameOf(view.myNightTarget)} تصيب مع الفجر.</p>;
  }
  return null;
}

/** The menu for this player's own night turn; null when it isn't their turn. */
function NightAction({ view, me, run, nameOf }: { view: PlayerView; me: PublicPlayer; run: Run; nameOf: (id: string | null | undefined) => string }) {
  if (!isMyTurn(view, me)) return null;
  const alive = view.players.filter((p) => p.alive && !p.isGM);
  const pick = (id: string) => run("night:act", { targetId: id });

  switch (me.role) {
    case "MAFIA": {
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
      return (
        <Panel title="اختر من تحميه:" eyebrow="Protect" subtitle="شخص واحد تنقذه من المافيا هذه الليلة.">
          <TargetPicker key={`d-${view.round}`} candidates={alive} current={view.myNightTarget} confirmLabel={() => "تأكيد الحماية في الخفاء"} onConfirm={pick} />
        </Panel>
      );
    case "DETECTIVE":
      return (
        <Panel title="اختر من تحقق معه:" eyebrow="Investigate" subtitle="ستظهر النتيجة على شاشتك فوراً.">
          <TargetPicker key={`x-${view.round}`} candidates={alive.filter((p) => p.id !== me.id)} current={null} confirmLabel={() => "تحقّق في الخفاء"} onConfirm={pick} />
          {!!view.investigations?.length && (
            <ul className="mt-3 flex flex-col gap-1 border-t border-white/10 pt-3 text-sm text-neutral-400">
              {view.investigations.map((i) => (
                <li key={i.round}>
                  الليلة {arDigits(i.round)}: {nameOf(i.targetId)} — {i.isMafia ? <span className="text-red-400">مافيا</span> : "سليم"}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      );
    case "SNIPER":
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
      return null;
  }
}

const RESULT_SECONDS = 10;

/**
 * Full-screen investigation result on the Detective's phone: a stark red
 * "مافيا" warning or a calm "سليم". Closes with "فهمت" or after 10s, and
 * only then does the night move past the Detective's turn.
 */
function DetectiveResult({ view }: { view: PlayerView }) {
  const tonight = view.phase === "NIGHT" ? view.investigations?.find((i) => i.round === view.round) : undefined;
  const key = tonight ? `${view.round}-${tonight.targetId}` : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [left, setLeft] = useState(RESULT_SECONDS);
  const open = !!key && dismissed !== key;

  useEffect(() => {
    if (!open) return;
    setLeft(RESULT_SECONDS);
    const id = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(id);
  }, [open, key]);

  const done = () => {
    setDismissed(key);
    if (view.nightTurn === "DETECTIVE") void call("night:done");
  };
  useEffect(() => {
    if (open && left <= 0) done();
  }, [left]); // the countdown reaching zero closes it

  if (!open || !tonight) return null;
  const name = view.players.find((p) => p.id === tonight.targetId)?.name ?? "؟";
  const mafia = tonight.isMafia;
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 text-center ${
        mafia ? "bg-[radial-gradient(circle_at_50%_40%,#7a0a10,#1a0002_70%)]" : "bg-[radial-gradient(circle_at_50%_40%,#1d3b34,#05100d_70%)]"
      }`}
      role="alertdialog"
      aria-live="assertive"
    >
      <p className="text-lg text-neutral-300">نتيجة التحقيق مع</p>
      <p className="text-4xl font-black text-white">{name}</p>
      <div
        className={`w-full max-w-sm rounded-3xl border-2 px-6 py-8 ${
          mafia ? "border-red-400 bg-red-600/30 shadow-[0_0_60px_rgb(255_30_40/0.7)]" : "border-emerald-300/70 bg-emerald-500/10 shadow-[0_0_40px_rgb(60_220_160/0.35)]"
        }`}
      >
        <p className={`text-6xl font-black ${mafia ? "text-red-300 [text-shadow:0_0_24px_rgb(255_40_50/0.9)]" : "text-emerald-200"}`}>{mafia ? "مافيا" : "سليم"}</p>
        <p dir="ltr" className={`mt-2 text-xl font-bold ${mafia ? "text-red-200" : "text-emerald-100/80"}`}>
          {mafia ? "Mafia" : "Innocent / Safe"}
        </p>
      </div>
      <p className="text-sm text-neutral-400">يُغلق خلال {arDigits(Math.max(0, left))} ثوانٍ</p>
      <Button onClick={done} variant={mafia ? "primary" : "ghost"} className="max-w-sm py-4 text-lg">
        فهمت
      </Button>
    </div>
  );
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

function AnnouncementBanner({ a, view }: { a: Announcement; view: PlayerView }) {
  return <p className="glass neon rounded-xl px-4 py-3 text-center text-base font-bold">{announcementText(a, view)}</p>;
}
