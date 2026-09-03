import Link from "next/link";
import { Check, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { hasSupabaseEnv } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculatedReturn } from "@/lib/risk";
import { soles } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const supabase = createAdminClient();
  const { data } = await supabase.from("predictions").select("code,team_selected,declared_amount,events(team_a,team_b,multiplier)").eq("code", code).maybeSingle();
  if (!data) notFound();
  const eventData = Array.isArray(data.events) ? data.events[0] : data.events;
  const team = data.team_selected === "TEAM_A" ? eventData?.team_a : eventData?.team_b;
  const amount = Number(data.declared_amount);
  const multiplier = Number(eventData?.multiplier ?? 1.5);
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="glass-panel reveal w-full max-w-md overflow-hidden">
        <div className="border-b border-white/10 px-6 py-5"><Brand /></div>
        <div className="p-6 sm:p-8">
          <div className="flex size-14 items-center justify-center rounded-full bg-irf-gradient text-ink shadow-glow"><Check size={28} strokeWidth={3} /></div>
          <h1 className="mt-5 text-2xl font-black">¡Registro recibido! 🎉</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">Tu participación está pendiente de verificación.</p>
          <dl className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20 px-4">
            <Row label="Equipo" value={team || "—"} /><Row label="Monto declarado" value={soles(amount)} /><Row label="Posible resultado configurado" value={soles(calculatedReturn(amount, multiplier))} accent /><Row label="Estado" value="Pendiente de verificación" /><Row label="Código" value={code} mono />
          </dl>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/[.04] p-3 text-xs leading-relaxed text-zinc-500"><Clock3 size={17} className="mt-0.5 shrink-0 text-primary" /> Verificaremos manualmente el pago y, una vez confirmado, tu participación aparecerá en la lista pública. Guarda tu código.</div>
          <Link href="/" className="secondary-button mt-6 w-full">Volver al inicio</Link>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return <div className="flex items-start justify-between gap-5 py-3.5"><dt className="text-xs leading-snug text-zinc-500">{label}</dt><dd className={`text-right text-sm font-bold ${accent ? "text-secondary" : "text-white"} ${mono ? "font-mono tracking-wider" : ""}`}>{value}</dd></div>;
}
