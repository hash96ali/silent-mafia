import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  icon,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost"; icon?: ReactNode }) {
  const look =
    variant === "primary"
      ? "neon-button rounded-full py-4 text-lg font-bold text-white"
      : "rounded-full border border-white/10 bg-white/[0.03] py-3 font-semibold text-neutral-200 active:bg-white/[0.06] disabled:text-neutral-600";
  return (
    <button className={`flex w-full items-center justify-center gap-2 px-5 transition ${look} ${className}`} {...props}>
      {children}
      {icon}
    </button>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base text-white placeholder:text-neutral-600 focus:border-blood-soft focus:shadow-[0_0_12px_rgb(255_30_40/0.4)] focus:outline-none ${className}`}
      {...props}
    />
  );
}

/** Glass panel. `title` is the Arabic heading; `eyebrow` the small English label opposite it. */
export function Panel({
  title,
  eyebrow,
  subtitle,
  children,
  className = "",
}: {
  title?: ReactNode;
  eyebrow?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass rounded-2xl p-4 ${className}`}>
      {(title || eyebrow) && (
        <header className="mb-3">
          <div className="flex items-baseline justify-between gap-3">
            {title && <h2 className="text-base font-bold text-white">{title}</h2>}
            {eyebrow && (
              <span dir="ltr" className="text-[11px] font-semibold tracking-[0.15em] text-neutral-500 uppercase">
                {eyebrow}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-neutral-400">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p className="text-center text-sm text-ember" role="alert">
      {children}
    </p>
  ) : null;
}

/** Arabic-Indic digits, e.g. 28 -> ٢٨. */
export function arDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

/** Centered confirm / cancel dialog for actions that are hard to undo. */
export function ConfirmDialog({
  text,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  text: string;
  detail?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="glass neon w-full max-w-sm rounded-2xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-bold text-white">{text}</p>
        {detail && <p className="mt-2 text-sm text-neutral-400">{detail}</p>}
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
