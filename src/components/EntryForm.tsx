"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { call } from "@/client/socket";
import { saveSession } from "@/client/session";
import { CODE_LENGTH, LIMITS } from "@/shared/constants";
import type { SessionInfo } from "@/shared/types";
import { Button, ErrorText, Input, Panel } from "./ui";

/** Create-or-join form. `fixedCode` locks it to joining that room (the shared /join/CODE link). */
export function EntryForm({ fixedCode }: { fixedCode?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"join" | "create">(fixedCode ? "join" : "create");
  const [name, setName] = useState("");
  const [code, setCode] = useState(fixedCode ?? "");
  const [asGM, setAsGM] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res =
      mode === "create"
        ? await call<SessionInfo>("room:create", { name, asGM })
        : await call<SessionInfo>("room:join", { code, name });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    saveSession(res.data);
    router.push(`/room/${res.data.code}`);
  }

  const canSubmit = name.trim() && (mode === "create" || code.trim().length === CODE_LENGTH);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {!fixedCode && (
        <div className="glass grid grid-cols-2 gap-1 rounded-full p-1">
          {(["create", "join"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full py-2 text-sm font-bold transition ${mode === m ? "neon bg-blood/20 text-white" : "text-neutral-500"}`}
            >
              {m === "create" ? "استضافة لعبة" : "الانضمام للعبة"}
            </button>
          ))}
        </div>
      )}

      <Panel>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-neutral-400">
            اسمك
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.nameMaxLength} autoComplete="nickname" placeholder="مثال: سارة" />
          </label>

          {mode === "join" && (
            <label className="flex flex-col gap-1 text-sm text-neutral-400">
              رمز الغرفة
              <Input
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                maxLength={CODE_LENGTH}
                readOnly={!!fixedCode}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="ABCD"
                className="text-center text-xl font-bold tracking-[0.5em]"
              />
            </label>
          )}

          {mode === "create" && (
            <label className="flex items-center gap-3 text-sm text-neutral-300">
              <input type="checkbox" checked={asGM} onChange={(e) => setAsGM(e.target.checked)} className="size-5 accent-blood" />
              سأكون الراوي (لن أحصل على دور)
            </label>
          )}
        </div>
      </Panel>

      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={!canSubmit || busy}>
        {busy ? "…" : mode === "create" ? "إنشاء غرفة" : "انضمام"}
      </Button>
    </form>
  );
}
