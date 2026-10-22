"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { clearSession } from "@/client/session";
import { call } from "@/client/socket";
import { LIMITS } from "@/shared/constants";
import { validateSetup } from "@/shared/rules";
import type { PlayerView, Role, Settings } from "@/shared/types";
import { ScreenIcon } from "./icons";
import { TopBar } from "./PhaseTimer";
import { PlayerList } from "./PlayerList";
import { ROLE_LABEL, ROLE_LABEL_AR } from "@/shared/roleText";
import { Button, ErrorText, Panel, arDigits } from "./ui";

export function Lobby({ view }: { view: PlayerView }) {
  const [error, setError] = useState<string | null>(null);
  const playing = view.players.filter((p) => !p.isGM).length;
  const setupError = validateSetup(playing, view.settings);

  async function run(event: Parameters<typeof call>[0], ...args: unknown[]) {
    setError(null);
    const res = await call(event, ...args);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <TopBar subtitle="ليلة الغموض" deadline={null} now={Date.now} night />
      <header className="text-center">
        <h1 className="neon-text text-3xl font-black">غرفة الانتظار</h1>
        <p className="mt-1 text-sm text-neutral-400">اجمع اللاعبين... الليل يقترب</p>
      </header>

      <ShareCode code={view.code} />

      <Panel
        title={`اللاعبون: ${arDigits(playing)}${view.players.some((p) => p.isGM) ? " + الراوي" : ""}`}
        eyebrow="Players"
      >
        <PlayerList
          view={view}
          onKick={view.isHost ? (id) => run("room:kick", { playerId: id }) : undefined}
          onToggleGM={view.isHost ? (id, on) => run("room:setGM", { playerId: on ? id : null }) : undefined}
        />
      </Panel>

      <SettingsForm settings={view.settings} editable={view.isHost} onChange={(patch) => run("room:updateSettings", patch)} />

      <ErrorText>{error}</ErrorText>
      {view.isHost ? (
        <div className="sticky bottom-4 flex flex-col gap-2">
          {setupError && <p className="text-center text-sm text-neutral-400">{setupError}</p>}
          <Button disabled={!!setupError} onClick={() => run("game:start")}>
            ابدأ اللعبة
          </Button>
        </div>
      ) : (
        <p className="animate-pulse text-center text-sm text-neutral-500">بانتظار المضيف لبدء اللعبة…</p>
      )}
      <LeaveButton />
    </div>
  );
}

function ShareCode({ code }: { code: string }) {
  const [url, setUrl] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(`${window.location.origin}/join/${code}`), [code]);

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "انضم إلى لعبة المافيا", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {}
  }

  return (
    <Panel className="text-center">
      <p className="text-xs text-neutral-500">رمز الغرفة</p>
      <p dir="ltr" className="neon-text text-5xl font-black tracking-[0.3em]">
        {code}
      </p>
      {showQr && url && (
        <div className="mx-auto mt-4 w-fit rounded-xl bg-white p-3 shadow-[0_0_24px_rgb(255_30_40/0.5)]">
          <QRCodeSVG value={url} size={180} />
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={() => setShowQr((s) => !s)}>
          {showQr ? "إخفاء الرمز" : "رمز QR"}
        </Button>
        <Button variant="ghost" onClick={share}>
          {copied ? "تم النسخ" : "مشاركة الرابط"}
        </Button>
      </div>
      <a
        href={`/screen/${code}`}
        target="_blank"
        rel="noopener"
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-blood-soft/40 bg-blood/10 py-3 font-semibold text-white"
      >
        <ScreenIcon className="size-5" />
        فتح شاشة العرض (للبروجكتر)
      </a>
      <p className="mt-1 text-xs text-neutral-500">اعرضها على الشاشة الكبيرة بدل شاشة المضيف؛ لا تظهر فيها أي أدوار سرية.</p>
    </Panel>
  );
}

const TIMER_OPTIONS = [0, 30, 45, 60, 90, 120, 180, 300, 600];
const fmt = (s: number) => (s === 0 ? "بلا مؤقت" : s < 60 ? `${arDigits(s)} ثانية` : `${arDigits(s / 60)} دقيقة`);

function SettingsForm({ settings, editable, onChange }: { settings: Settings; editable: boolean; onChange: (p: Partial<Settings>) => void }) {
  const roleToggles: { key: keyof Settings; role: Role; locked?: string }[] = [
    { key: "doctor", role: "DOCTOR" },
    { key: "detective", role: "DETECTIVE", locked: settings.sniper ? "معطّل لوجود القناص في اللعبة" : undefined },
    { key: "sheik", role: "SHEIK" },
    { key: "sniper", role: "SNIPER" },
    { key: "upright", role: "UPRIGHT" },
  ];
  const timers: [keyof Settings, string][] = [
    ["nightSec", "مؤقت كل دور ليلي"],
    ["daySec", "مؤقت النقاش"],
    ["voteSec", "مؤقت التصويت"],
  ];

  return (
    <Panel title="إعدادات الغرفة" eyebrow={editable ? "Settings" : "Host only"}>
      <fieldset disabled={!editable} className="flex flex-col gap-3 text-sm disabled:opacity-70">
        <div className="flex items-center justify-between">
          <span className="font-semibold">
            عدد {ROLE_LABEL_AR.MAFIA} <span className="text-neutral-500">(Mafia)</span>
          </span>
          <div className="flex items-center gap-3">
            <Stepper label="+" onClick={() => onChange({ mafiaCount: settings.mafiaCount + 1 })} disabled={settings.mafiaCount >= LIMITS.maxMafia} />
            <span className="neon-text w-5 text-center text-lg font-bold">{arDigits(settings.mafiaCount)}</span>
            <Stepper label="−" onClick={() => onChange({ mafiaCount: settings.mafiaCount - 1 })} disabled={settings.mafiaCount <= 1} />
          </div>
        </div>

        <p className="mt-1 text-xs text-neutral-500">الأدوار</p>
        {roleToggles.map(({ key, role, locked }) => (
          <Toggle
            key={key}
            checked={settings[key] as boolean}
            disabled={!!locked}
            onChange={(v) => onChange({ [key]: v })}
            label={
              <>
                {ROLE_LABEL_AR[role]} <span className="text-neutral-500">({ROLE_LABEL[role]})</span>
              </>
            }
            hint={locked}
          />
        ))}

        <div className="neon-rule my-1 opacity-40" />
        <Toggle checked={settings.revealRoleOnDeath} onChange={(v) => onChange({ revealRoleOnDeath: v })} label="كشف دور اللاعب عند موته" />
        {timers.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between">
            <span className="font-semibold">{label}</span>
            <select
              value={settings[key] as number}
              onChange={(e) => onChange({ [key]: Number(e.target.value) })}
              className="rounded-lg border border-white/10 bg-black/50 px-2 py-1.5"
            >
              {[...new Set([...TIMER_OPTIONS, settings[key] as number])].sort((a, b) => a - b).map((s) => (
                <option key={s} value={s}>
                  {fmt(s)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
    </Panel>
  );
}

/** Neon on/off switch. */
function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-3 ${disabled ? "opacity-45" : ""}`}>
      <span className="flex flex-col">
        <span className="font-semibold">{label}</span>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </span>
      <span className="relative shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-6 w-11 rounded-full border border-white/10 bg-white/10 transition peer-checked:border-blood-soft peer-checked:bg-blood peer-checked:shadow-[0_0_12px_rgb(255_30_40/0.7)]" />
        <span className="absolute top-1 right-1 size-4 rounded-full bg-white transition peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

function Stepper({ label, ...props }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="size-8 rounded-lg border border-white/10 bg-black/40 text-lg leading-none disabled:opacity-30" {...props}>
      {label}
    </button>
  );
}

export function LeaveButton() {
  async function leave() {
    if (!confirm("هل تريد مغادرة الغرفة؟")) return;
    await call("room:leave");
    clearSession();
    window.location.href = "/";
  }
  return (
    <button onClick={leave} className="mt-2 text-center text-xs text-neutral-600 underline">
      مغادرة الغرفة
    </button>
  );
}
