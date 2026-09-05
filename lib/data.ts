import "server-only";
import { DEFAULT_EVENT, DEFAULT_SETTINGS, hasSupabaseEnv } from "@/lib/config";
import { isRegistrationOpen } from "@/lib/eligibility";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRecord, PublicPrediction, PublicSettings } from "@/lib/types";

export async function getPublicExperience(): Promise<{ event: EventRecord; settings: PublicSettings; predictions: PublicPrediction[]; configured: boolean; registrationOpen: boolean }> {
  if (!hasSupabaseEnv() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { event: DEFAULT_EVENT, settings: DEFAULT_SETTINGS, predictions: [], configured: false, registrationOpen: isRegistrationOpen(DEFAULT_EVENT.status, DEFAULT_EVENT.betting_close_at) };
  }
  const supabase = createAdminClient();
  const [{ data: event }, { data: settings }] = await Promise.all([
    supabase.from("events").select("id,title,team_a,team_b,team_a_logo,team_b_logo,match_date,match_time,betting_close_at,status,minimum_amount,multiplier,result,risk_mode,risk_limit_amount").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("settings").select("payment_qr_path,payment_receiver_name,rules_text,maintenance_mode,max_receipt_mb").limit(1).maybeSingle(),
  ]);
  if (!event || !settings) return { event: DEFAULT_EVENT, settings: DEFAULT_SETTINGS, predictions: [], configured: false, registrationOpen: isRegistrationOpen(DEFAULT_EVENT.status, DEFAULT_EVENT.betting_close_at) };
  const { data: predictions, error: predictionsError } = await supabase.rpc("public_registered_predictions", { p_event_id: event.id });
  let signedQr: string | null = null;
  if (settings.payment_qr_path) {
    const { data } = await supabase.storage.from("payment-assets").createSignedUrl(settings.payment_qr_path, 300);
    signedQr = data?.signedUrl ?? null;
  }
  const typedEvent = event as EventRecord;
  return {
    event: typedEvent,
    settings: { ...settings, payment_qr_url: signedQr } as PublicSettings,
    predictions: predictionsError ? [] : (predictions as PublicPrediction[] ?? []),
    configured: true,
    registrationOpen: isRegistrationOpen(typedEvent.status, typedEvent.betting_close_at),
  };
}
