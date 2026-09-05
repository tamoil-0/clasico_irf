import "server-only";
import { DEFAULT_EVENT, DEFAULT_SETTINGS } from "@/lib/config";
import { isRegistrationOpen } from "@/lib/eligibility";
import { createAdminClient, getSupabaseServerConfiguration } from "@/lib/supabase/admin";
import type { EventRecord, PublicPrediction, PublicSettings } from "@/lib/types";

export interface PublicExperience {
  event: EventRecord;
  settings: PublicSettings;
  predictions: PublicPrediction[];
  supabaseConfigured: boolean;
  eventExists: boolean;
  settingsExists: boolean;
  dataError: boolean;
  registrationOpen: boolean;
}

const unavailableExperience: PublicExperience = {
  event: DEFAULT_EVENT,
  settings: DEFAULT_SETTINGS,
  predictions: [],
  supabaseConfigured: false,
  eventExists: false,
  settingsExists: false,
  dataError: false,
  registrationOpen: false,
};

export async function getPublicExperience(): Promise<PublicExperience> {
  const configuration = getSupabaseServerConfiguration();
  if (!configuration.configured) return unavailableExperience;

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    logPublicDataError("client", error);
    return unavailableExperience;
  }

  const [{ data: event, error: eventError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("events").select("id,title,team_a,team_b,team_a_logo,team_b_logo,match_date,match_time,betting_close_at,status,minimum_amount,multiplier,result,risk_mode,risk_limit_amount").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("settings").select("payment_qr_path,payment_receiver_name,rules_text,maintenance_mode,max_receipt_mb").limit(1).maybeSingle(),
  ]);

  if (eventError) logPublicDataError("event-read", eventError);
  if (settingsError) logPublicDataError("settings-read", settingsError);

  const typedEvent = event ? event as EventRecord : DEFAULT_EVENT;
  const eventExists = Boolean(event);
  const settingsExists = Boolean(settings);
  const dataError = Boolean(eventError || settingsError);
  let predictions: PublicPrediction[] = [];
  if (event) {
    const { data, error } = await supabase.rpc("public_registered_predictions", { p_event_id: event.id });
    if (error) logPublicDataError("predictions-read", error);
    else predictions = data as PublicPrediction[] ?? [];
  }

  let signedQr: string | null = null;
  if (settings?.payment_qr_path) {
    const { data, error } = await supabase.storage.from("payment-assets").createSignedUrl(settings.payment_qr_path, 300);
    if (error) logPublicDataError("qr-read", error);
    signedQr = data?.signedUrl ?? null;
  }

  return {
    event: typedEvent,
    settings: settings ? { ...settings, payment_qr_url: signedQr } as PublicSettings : DEFAULT_SETTINGS,
    predictions,
    supabaseConfigured: true,
    eventExists,
    settingsExists,
    dataError,
    registrationOpen: eventExists && isRegistrationOpen(typedEvent.status, typedEvent.betting_close_at),
  };
}

function logPublicDataError(stage: string, error: unknown) {
  const safeError = error && typeof error === "object" ? {
    name: "name" in error ? String(error.name) : undefined,
    code: "code" in error ? String(error.code) : undefined,
    message: "message" in error ? String(error.message) : "Error sin mensaje",
  } : { message: String(error) };
  console.error(`[public-experience] ${stage}`, safeError);
}
