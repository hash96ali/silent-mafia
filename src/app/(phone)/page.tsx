import { EntryForm } from "@/components/EntryForm";
import { CrosshairIcon } from "@/components/icons";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <header className="flex flex-col items-center text-center">
        <CrosshairIcon className="neon-text mb-3 size-12" />
        <h1 className="neon-text text-5xl font-black">المافيا</h1>
        <p className="mt-1 text-lg font-bold text-white">ليلة الغموض</p>
        <p className="mt-2 text-sm text-neutral-400">المدينة نائمة... ولا أحد يتحرك.</p>
      </header>
      <EntryForm />
    </div>
  );
}
