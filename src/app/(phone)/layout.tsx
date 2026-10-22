import { PhaseBackdrop } from "@/components/phases";

/** Phone-width column for the player-facing pages. */
export default function PhoneLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-4 pb-6">
      <PhaseBackdrop phase="LOBBY" />
      {children}
    </main>
  );
}
