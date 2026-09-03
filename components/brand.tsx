import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label="Impact Regional Fellowship">
      <Image src="/irf-logo.png" alt="IRF" width={1675} height={540} priority className={compact ? "h-7 w-auto" : "h-9 w-auto"} />
      {!compact && <span className="hidden h-5 border-l border-white/15 pl-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500 sm:block">Dinámica especial</span>}
    </div>
  );
}
