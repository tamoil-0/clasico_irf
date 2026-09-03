import { Brand } from "@/components/brand";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[.07] bg-[#0a0a0a]/85 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <Brand />
        <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-secondary">Clásico IRF</span>
      </div>
    </header>
  );
}
