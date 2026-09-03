import type { EventRecord, PublicSettings } from "@/lib/types";

// Solo se usa si Supabase todavía no fue configurado. Los componentes consumen
// el mismo modelo que la base de datos; nada del partido vive hardcodeado en ellos.
export const DEFAULT_EVENT: EventRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Clásico IRF",
  team_a: "Universitario",
  team_b: "Alianza Lima",
  team_a_logo: "/teams/universitario.svg",
  team_b_logo: "/teams/alianza-lima.svg",
  match_date: "2026-09-12",
  match_time: "20:00",
  betting_close_at: "2026-09-12T19:45:00-05:00",
  status: "OPEN",
  minimum_amount: 10,
  multiplier: 1.5,
  result: null,
  risk_mode: "OPEN",
  risk_limit_amount: 0,
};

export const DEFAULT_SETTINGS: PublicSettings = {
  payment_qr_url: null,
  payment_receiver_name: "",
  rules_text: "El registro se valida manualmente. Solo participan registros confirmados antes del cierre.",
  maintenance_mode: false,
  max_receipt_mb: 5,
};

// Número Yape oficial. Se muestra formateado y se copia sin espacios.
export const PAYMENT_PHONE_DISPLAY = "+51 916 294 194";
export const PAYMENT_PHONE_VALUE = "+51916294194";

export const DRAW_RULE_TEXT = "Si el partido termina empatado, las participaciones verificadas serán destinadas a apoyar los fondos y actividades de IRF.";

export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
