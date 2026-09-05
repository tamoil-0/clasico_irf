"use client";
/* eslint-disable @next/next/no-img-element -- logos are admin-configurable; QR URLs are short-lived and previews use blob URLs */

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleCheck, Copy, Hourglass, ImagePlus, LockKeyhole, QrCode, X } from "lucide-react";
import { createPrediction, type PredictionActionState } from "@/app/actions";
import { TeamLogo } from "@/components/team-logo";
import { DRAW_RULE_TEXT, PAYMENT_PHONE_DISPLAY, PAYMENT_PHONE_VALUE } from "@/lib/config";
import { formatMatch, soles } from "@/lib/format";
import { calculatedReturn } from "@/lib/risk";
import type { EventRecord, PublicPrediction, PublicSettings, TeamSelection } from "@/lib/types";

const initialState: PredictionActionState = {};

type PredictionFormProps = {
  event: EventRecord;
  settings: PublicSettings;
  predictions: PublicPrediction[];
  supabaseConfigured: boolean;
  eventExists: boolean;
  settingsExists: boolean;
  dataError: boolean;
  registrationOpen: boolean;
};

export function PredictionForm({ event, settings, predictions, supabaseConfigured, eventExists, settingsExists, dataError, registrationOpen }: PredictionFormProps) {
  const [team, setTeam] = useState<TeamSelection | "">("");
  const [amount, setAmount] = useState(Number(event.minimum_amount));
  const [custom, setCustom] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(createPrediction, initialState);
  useEffect(() => () => { if (receiptPreview) URL.revokeObjectURL(receiptPreview); }, [receiptPreview]);

  const canRegister = supabaseConfigured && eventExists && settingsExists && !dataError && registrationOpen && !settings.maintenance_mode && Boolean(settings.payment_qr_url);
  const chosenName = team === "TEAM_A" ? event.team_a : team === "TEAM_B" ? event.team_b : null;
  const possible = useMemo(() => calculatedReturn(amount || 0, Number(event.multiplier)), [amount, event.multiplier]);
  const fieldError = (key: string) => state.fieldErrors?.[key]?.[0];

  function selectReceipt(file?: File) {
    if (receiptPreview) URL.revokeObjectURL(receiptPreview);
    setReceiptPreview(file ? URL.createObjectURL(file) : null);
  }

  function removeReceipt() {
    if (receiptRef.current) receiptRef.current.value = "";
    selectReceipt();
  }

  return (
    <div className="space-y-5">
      <section className="reveal text-center">
        <span className="eyebrow"><span className="size-1.5 rounded-full bg-secondary shadow-[0_0_10px_#ffc725]" /> Edición especial</span>
        <h1 className="mt-4 text-4xl font-black uppercase leading-none tracking-[-.05em] sm:text-5xl"><span className="bg-irf-gradient bg-clip-text text-transparent">{event.title}</span></h1>
        <p className="mt-3 text-sm font-medium capitalize text-zinc-400">{formatMatch(event.match_date, event.match_time)}</p>
      </section>

      {!supabaseConfigured && <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-center text-xs leading-relaxed text-amber-100">El sistema está temporalmente fuera de servicio.</div>}
      {supabaseConfigured && dataError && <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-center text-xs leading-relaxed text-amber-100">No pudimos cargar toda la información del evento. Inténtalo nuevamente.</div>}
      {supabaseConfigured && !dataError && !eventExists && <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-center text-xs leading-relaxed text-amber-100">El evento todavía no está disponible.</div>}

      <section className="grid grid-cols-2 gap-3" aria-label="Condiciones">
        <div className="glass-panel p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Monto mínimo</p><p className="mt-1 text-xl font-black">{soles(event.minimum_amount)}</p></div>
        <div className="glass-panel p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Multiplicador</p><p className="mt-1 text-xl font-black text-secondary">{Number(event.multiplier).toFixed(2)}×</p></div>
      </section>

      <details className="glass-panel group p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold"><span>¿Y si empatan?</span><ChevronDown size={18} className="text-primary transition group-open:rotate-180" /></summary>
        <p className="mt-3 border-t border-white/10 pt-3 text-sm leading-relaxed text-zinc-400">{DRAW_RULE_TEXT}</p>
      </details>

      <RegisteredParticipations event={event} rows={predictions} />

      <section aria-labelledby="choose-team" className="glass-panel p-4 sm:p-5">
        <div className="mb-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Paso 1</p>
          <h2 id="choose-team" className="mt-1 text-lg font-black">Selecciona un equipo para continuar</h2>
          {chosenName && <p className="mt-1 text-xs font-semibold text-secondary">{chosenName}</p>}
        </div>
        <div className="relative grid grid-cols-2 gap-3">
          {(["TEAM_A", "TEAM_B"] as TeamSelection[]).map((key) => {
            const selected = team === key;
            const name = key === "TEAM_A" ? event.team_a : event.team_b;
            const logo = key === "TEAM_A" ? event.team_a_logo : event.team_b_logo;
            return <button key={key} type="button" onClick={() => { setTeam(key); if (!idempotencyKey) setIdempotencyKey(crypto.randomUUID()); }} aria-pressed={selected} className={`relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border p-4 transition ${selected ? "border-secondary bg-secondary/[.09] shadow-[0_0_24px_rgba(255,199,37,.14)]" : "border-white/10 bg-black/25 hover:border-white/25"}`}>
              {selected && <span className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full bg-irf-gradient text-ink"><Check size={15} strokeWidth={3} /></span>}
              <TeamLogo src={logo} name={name} className="size-16 sm:size-20 md:size-24" />
              <span className="text-center text-sm font-extrabold leading-tight">{name}</span>
            </button>;
          })}
          <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-zinc-950 text-[9px] font-black text-zinc-400">VS</span>
        </div>
        {fieldError("teamSelected") && <p className="mt-2 text-xs text-red-400">Elige un equipo.</p>}
      </section>

      {team && canRegister ? (
        <form action={action} className="glass-panel space-y-6 p-4 sm:p-6" noValidate>
          <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Paso 2</p><h2 className="mt-1 text-lg font-black">Registra tu participación</h2></div>
          <input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="teamSelected" value={team} /><input type="hidden" name="amount" value={amount} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <div className="absolute -left-[9999px]" aria-hidden="true"><label>Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>

          <div>
            <label className="field-label">Monto</label>
            <div className="grid grid-cols-4 gap-2">{[10,20,30,50].map((value) => <button key={value} type="button" onClick={() => { setAmount(value); setCustom(""); }} className={`min-h-11 rounded-xl border text-sm font-bold transition ${amount === value && !custom ? "border-secondary bg-secondary/10 text-secondary" : "border-white/10 bg-white/[.04] text-zinc-300"}`}>S/{value}</button>)}</div>
            <label className="mt-3 block"><span className="sr-only">Otro monto</span><input className="field" inputMode="decimal" min={event.minimum_amount} max={10000} value={custom} onChange={(e) => { setCustom(e.target.value); setAmount(Number(e.target.value)); }} placeholder="Otro monto" /></label>
            <div className="mt-3 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/[.07] px-4 py-3"><span className="text-xs text-zinc-400">Posible resultado configurado</span><strong className="text-lg text-secondary">{soles(possible)}</strong></div>
          </div>

          <div className="border-t border-white/10 pt-5"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Tus datos</p></div>
          <div><label className="field-label" htmlFor="name">Nombre completo</label><input className="field" id="name" name="name" autoComplete="name" maxLength={100} placeholder="Tu nombre y apellido" required />{fieldError("name") && <p className="mt-1.5 text-xs text-red-400">{fieldError("name")}</p>}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="field-label" htmlFor="phone">WhatsApp / celular</label><input className="field" id="phone" name="phone" inputMode="numeric" autoComplete="tel" maxLength={9} placeholder="987654321" required />{fieldError("phone") && <p className="mt-1.5 text-xs text-red-400">{fieldError("phone")}</p>}</div>
            <div><label className="field-label" htmlFor="refundPhone">Número para devolución o contacto</label><input className="field" id="refundPhone" name="refundPhone" inputMode="numeric" autoComplete="tel" maxLength={9} placeholder="987654321" required />{fieldError("refundPhone") && <p className="mt-1.5 text-xs text-red-400">{fieldError("refundPhone")}</p>}</div>
          </div>

          <section className="rounded-2xl border border-primary/20 bg-primary/[.055] p-4 sm:p-5" aria-labelledby="payment-title">
            <div className="flex items-center justify-center gap-2 text-primary sm:justify-start"><QrCode size={17} /><p className="text-[10px] font-bold uppercase tracking-[.22em]">Realiza tu aporte</p></div>
            <h3 id="payment-title" className="mt-1.5 text-center text-base font-black sm:text-left">Yapea escaneando el QR o al número</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-[auto,1fr] sm:items-center sm:gap-5">
              <div className="mx-auto w-fit rounded-2xl bg-white p-2.5 shadow-xl sm:mx-0"><img src={settings.payment_qr_url!} alt="QR oficial de pago IRF" className="size-[180px] object-contain sm:size-[200px] lg:size-[220px]" /></div>
              <div className="space-y-3 text-center sm:text-left">
                {settings.payment_receiver_name && <div><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Titular</p><p className="mt-0.5 text-sm font-bold text-zinc-100">{settings.payment_receiver_name}</p></div>}
                <div><p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Número Yape</p><p className="mt-0.5 text-lg font-black tracking-wide text-secondary sm:text-xl">{PAYMENT_PHONE_DISPLAY}</p></div>
                <CopyPhoneButton />
                <p className="text-[11px] leading-relaxed text-zinc-500">Luego sube la captura de tu comprobante.</p>
              </div>
            </div>
          </section>

          <div className="space-y-3">
            <label className="field-label">Comprobante de pago <span className="text-primary">*</span></label>
            {receiptPreview ? <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-3"><img src={receiptPreview} alt="Vista previa del comprobante" className="mx-auto max-h-72 w-full rounded-xl object-contain" /><button type="button" onClick={removeReceipt} className="absolute right-5 top-5 flex size-9 items-center justify-center rounded-full bg-black/80 text-white" aria-label="Eliminar comprobante"><X size={18}/></button><p className="mt-3 text-center text-xs text-zinc-500">Puedes eliminarlo y seleccionar otra imagen.</p></div> : <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 text-center transition hover:border-primary/50" htmlFor="receipt"><ImagePlus className="text-primary" /><span className="text-sm font-bold">Subir captura</span><span className="text-[11px] text-zinc-500">JPG, JPEG, PNG o WEBP · Máx. {settings.max_receipt_mb} MB</span></label>}
            <input ref={receiptRef} className="sr-only" id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectReceipt(event.target.files?.[0])} required />
          </div>

          <div>
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-zinc-300"><input type="checkbox" name="acceptedRules" checked={acceptedRules} onChange={(event) => setAcceptedRules(event.target.checked)} className="mt-0.5 size-5 rounded border-white/20 bg-white/5 text-primary focus:ring-primary/30" required /><span>He leído y acepto las reglas de la dinámica.</span></label>
            {!acceptedRules && <p className="mt-2 text-xs text-amber-300">Debes aceptar las reglas de la dinámica para continuar.</p>}
            {fieldError("acceptedRules") && <p className="mt-2 text-xs text-red-400">{fieldError("acceptedRules")}</p>}
          </div>
          {state.error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{state.error}</div>}
          <button className="primary-button" type="submit" disabled={pending || !acceptedRules || !idempotencyKey || !receiptPreview || amount < Number(event.minimum_amount)}>{pending ? "Registrando…" : "Registrar participación"}</button>
          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-600"><LockKeyhole size={13} /> El pago será verificado manualmente.</p>
        </form>
      ) : !supabaseConfigured || dataError ? <UnavailableCard title="Servicio no disponible" text="No es posible abrir nuevos registros en este momento." /> : !eventExists ? <UnavailableCard title="Evento no disponible" text="El evento todavía no está disponible." /> : !settingsExists ? <UnavailableCard title="Registro no disponible" text="Falta la configuración operativa necesaria para abrir registros." /> : !registrationOpen ? <UnavailableCard title="Registros cerrados" text="Ya no se aceptan nuevas participaciones. Las registradas siguen visibles arriba." /> : settings.maintenance_mode ? <UnavailableCard title="Sitio en mantenimiento" text="Los registros están temporalmente pausados." /> : !settings.payment_qr_url ? <UnavailableCard title="QR oficial pendiente" text="Los registros permanecen cerrados hasta que un administrador cargue el QR oficial de IRF." /> : null}

      <details className="border-t border-white/10 px-1 pt-5 text-sm text-zinc-500"><summary className="cursor-pointer font-semibold text-zinc-300">Reglas de la dinámica</summary><p className="mt-3 whitespace-pre-line leading-relaxed">{settings.rules_text}</p></details>
    </div>
  );
}

// Chrome bloquea navigator.clipboard fuera de contexto seguro; execCommand cubre ese caso.
function legacyCopy(value: string) {
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, value.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

function CopyPhoneButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copyPhone() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(PAYMENT_PHONE_VALUE);
      else if (!legacyCopy(PAYMENT_PHONE_VALUE)) return;
      setCopied(true);
    } catch {
      if (legacyCopy(PAYMENT_PHONE_VALUE)) setCopied(true);
    }
  }

  return (
    <div>
      <button type="button" onClick={copyPhone} aria-label={`Copiar el número Yape ${PAYMENT_PHONE_DISPLAY}`} className="secondary-button min-h-10 w-full py-2 text-xs sm:w-auto">
        {copied ? <><Check size={15} strokeWidth={3} className="text-emerald-400" /> Copiado</> : <><Copy size={15} className="text-primary" /> Copiar número</>}
      </button>
      <span aria-live="polite" className="sr-only">{copied ? "Número copiado al portapapeles." : ""}</span>
    </div>
  );
}

function RegisteredParticipations({ event, rows }: { event: EventRecord; rows: PublicPrediction[] }) {
  const pendingRows = rows.filter((row) => row.status === "PENDING");
  const verifiedRows = rows.filter((row) => row.status === "VERIFIED");
  const pendingTotal = pendingRows.reduce((sum, row) => sum + Number(row.display_amount), 0);
  const verifiedTotal = verifiedRows.reduce((sum, row) => sum + Number(row.display_amount), 0);

  return <section className="glass-panel p-4 sm:p-5" aria-labelledby="registered-title"><div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Transparencia</p><h2 id="registered-title" className="mt-1 text-lg font-black uppercase">Participaciones registradas</h2></div><div className="grid grid-cols-3 gap-2"><div className="rounded-lg bg-white/[.04] px-3 py-2"><p className="text-[9px] uppercase text-zinc-600">Total</p><p className="font-black">{rows.length}</p></div><div className="rounded-lg bg-amber-400/[.06] px-3 py-2"><p className="text-[9px] uppercase text-amber-300/70">Pendiente</p><p className="text-xs font-black text-amber-300 sm:text-sm">{soles(pendingTotal)}</p></div><div className="rounded-lg bg-emerald-400/[.06] px-3 py-2"><p className="text-[9px] uppercase text-emerald-300/70">Verificado</p><p className="text-xs font-black text-emerald-300 sm:text-sm">{soles(verifiedTotal)}</p></div></div></div>
    {rows.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((row, index) => {
      const isVerified = row.status === "VERIFIED";
      return <article key={`${row.masked_name}-${row.created_at}-${index}`} className={`rounded-xl border bg-black/20 p-4 ${isVerified ? "border-emerald-400/15" : "border-amber-400/15"}`}><div className="flex items-start justify-between gap-2"><div><h3 className="font-bold">{row.masked_name}</h3><p className="mt-1 text-xs text-zinc-500">{row.team_selected === "TEAM_A" ? event.team_a : event.team_b}</p></div>{isVerified ? <CircleCheck size={18} className="shrink-0 text-emerald-400"/> : <Hourglass size={18} className="shrink-0 text-amber-300"/>}</div><p className="mt-4 text-xl font-black text-secondary">{soles(row.display_amount)}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{formatRegistrationDate(row.created_at)}</p><p className={`mt-3 text-[10px] font-bold ${isVerified ? "text-emerald-400" : "text-amber-300"}`}>{isVerified ? "✓ Verificado" : "Pendiente de verificación"}</p></article>;
    })}</div> : <p className="py-8 text-center text-sm text-zinc-600">Aún no hay participaciones registradas.</p>}
  </section>;
}

function formatRegistrationDate(value: string) { return new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" }).format(new Date(value)).replace(",", " ·").toUpperCase(); }
function UnavailableCard({ title, text }: { title: string; text: string }) { return <div className="glass-panel border-primary/20 p-8 text-center"><p className="text-xs font-bold uppercase tracking-[.24em] text-primary">Estado del evento</p><h2 className="mt-3 text-2xl font-black uppercase">{title}</h2><p className="mt-2 text-sm text-zinc-500">{text}</p></div>; }
