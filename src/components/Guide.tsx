"use client";

import { useEffect, type ReactNode } from "react";
import type { Settings } from "@/shared/types";
import { BookIcon, CrosshairIcon } from "./icons";
import { Button } from "./ui";

interface RoleEntry {
  title: string;
  en: string;
  text: ReactNode;
  mafia?: boolean;
  /** Shown only when this returns true for the room's settings. */
  enabled?: (s: Settings) => boolean;
}

const ROLES: RoleEntry[] = [
  {
    title: "المافيا وكبير المافيا",
    en: "Mafia & Godfather",
    mafia: true,
    text: "يختارون لاعبًا واحدًا كل ليلة لاغتياله. يتحكم «كبير المافيا» بالقرار النهائي، وفي حال مقتله تنتقل الرتبة تلقائيًا لمافيا آخر.",
  },
  {
    title: "الدكتور",
    en: "Doctor",
    enabled: (s) => s.doctor,
    text: "يختار لاعبًا واحدًا كل ليلة لحمايته من القتل (إذا اختار المافيا والدكتور نفس الشخص، ينجو الشخص ولا يموت أحد).",
  },
  {
    title: "الشرطي / المحقق",
    en: "Detective",
    enabled: (s) => s.detective && !s.sniper,
    text: "يسأل عن أي لاعب في الليل ليكشف حقيقته، وتظهر له النتيجة بشاشة كبيرة وواضحة («مافيا» أو «سليم»).",
  },
  {
    title: "القناص",
    en: "Sniper",
    enabled: (s) => s.sniper,
    text: (
      <>
        يملك طلقة واحدة طوال القيم؛ إن أصاب «مافيا» يُستبعد المافيا ويستمر القناص، وإن أصاب «مواطن» يُستبعد الاثنان معاً.{" "}
        <span className="text-neutral-500">(لا يجتمع مع الشرطي في قيم واحد)</span>
      </>
    ),
  },
  {
    title: "شيخ المواطنين",
    en: "Sheik of Citizens",
    enabled: (s) => s.sheik,
    text: (
      <>
        إذا تم التصويت عليه بالنهار، لا يُطرد بل ينكشف دوره للجميع، ويصبح صوته يعادل <strong className="text-white">3 أصوات</strong> في كافة التصويتات
        القادمة.
      </>
    ),
  },
  {
    title: "المواطن الصالح",
    en: "Upright Citizen",
    enabled: (s) => s.upright,
    text: "إذا تم التصويت عليه وإقصاؤه في النهار، يحق له اختيار أي لاعب ليخرج ويُستبعد معه فوراً.",
  },
  {
    title: "المواطن",
    en: "Citizen",
    text: "ليس له فعل في الليل. في النهار يناقش ويصوّت لكشف المافيا وإخراجهم.",
  },
];

/** "How to play & roles" guide. Optional roles appear only when the host has them on. */
export function GuideModal({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roles = ROLES.filter((r) => !r.enabled || r.enabled(settings));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="دليل طريقة اللعبة والأدوار" onClick={onClose}>
      <div className="glass neon flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <h2 className="flex items-center gap-2 text-xl font-black text-white">
            <BookIcon className="neon-text size-6" />
            دليل طريقة اللعبة والأدوار
          </h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-2xl leading-none text-neutral-400" aria-label="إغلاق">
            ×
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold tracking-wide text-neutral-400">الهدف العام</h3>
            <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-4">
              <p className="font-bold text-red-300">هدف المافيا</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-200">اغتيال جميع المواطنين والتخلص منهم خفية دون كشف هويتهم.</p>
            </div>
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-4">
              <p className="font-bold text-emerald-200">هدف المواطنين</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-200">
                التركيز، البحث، كشف أفراد المافيا، وإخراجهم بعملية التصويت الجماعي قبل أن يقضوا على المدينة.
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold tracking-wide text-neutral-400">دليل الأدوار والقواعد · في هذه الغرفة</h3>
            {roles.map((r) => (
              <article
                key={r.en}
                className={`rounded-2xl border p-4 ${r.mafia ? "border-red-500/40 bg-red-950/25" : "border-white/10 bg-black/40"}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className={`font-bold ${r.mafia ? "text-red-300" : "text-white"}`}>{r.title}</p>
                  <span dir="ltr" className="text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
                    {r.en}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-300">{r.text}</p>
              </article>
            ))}
          </section>
        </div>

        <footer className="border-t border-white/10 px-5 py-4">
          <Button onClick={onClose} icon={<CrosshairIcon className="size-5" />}>
            فهمت، لنبدأ
          </Button>
        </footer>
      </div>
    </div>
  );
}
