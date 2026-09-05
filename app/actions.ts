"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, getSupabaseServerConfiguration } from "@/lib/supabase/admin";
import { predictionFieldsSchema, validateReceipt, validateReceiptSignature } from "@/lib/validation";
import { predictionCode, requestFingerprint } from "@/lib/security";
import { validateEligibility } from "@/lib/eligibility";

export type PredictionActionState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createPrediction(_: PredictionActionState, formData: FormData): Promise<PredictionActionState> {
  const supabaseConfiguration = getSupabaseServerConfiguration();
  if (!supabaseConfiguration.configured) {
    console.error("[prediction:create] Configuración de Supabase incompleta.", { missing: supabaseConfiguration.missing });
    return { error: "Supabase no está configurado correctamente en el servidor." };
  }
  if (!process.env.RATE_LIMIT_SECRET?.trim() && process.env.NODE_ENV === "production") {
    console.error("[prediction:create] Falta RATE_LIMIT_SECRET en producción.");
    return { error: "La configuración de seguridad del servidor está incompleta." };
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    logOperationError("client", error);
    return { error: "No se pudo iniciar la conexión segura con Supabase." };
  }

  const parsed = predictionFieldsSchema.safeParse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    refundPhone: formData.get("refundPhone"),
    teamSelected: formData.get("teamSelected"),
    amount: formData.get("amount"),
    acceptedRules: formData.get("acceptedRules"),
    idempotencyKey: formData.get("idempotencyKey"),
    website: formData.get("website") ?? "",
  });
  if (!parsed.success) return { error: "Revisa los campos marcados.", fieldErrors: parsed.error.flatten().fieldErrors };

  const [{ data: event, error: eventError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("events").select("id,status,betting_close_at,minimum_amount,multiplier,risk_mode,risk_limit_amount").eq("id", parsed.data.eventId).maybeSingle(),
    supabase.from("settings").select("payment_qr_path,maintenance_mode,max_receipt_mb").limit(1).maybeSingle(),
  ]);
  if (eventError) {
    logOperationError("event-read", eventError);
    return { error: "No se pudo validar el evento. Inténtalo nuevamente." };
  }
  if (settingsError) {
    logOperationError("settings-read", settingsError);
    return { error: "No se pudo cargar la configuración del registro. Inténtalo nuevamente." };
  }
  if (!event) return { error: "Este evento ya no está disponible." };
  if (!settings) return { error: "No se encontró la configuración necesaria para registrar la participación." };
  if (settings.maintenance_mode) return { error: "El sitio está temporalmente en mantenimiento." };
  const eligibilityError = validateEligibility({ amount: parsed.data.amount, minimumAmount: Number(event.minimum_amount), status: event.status, closesAt: event.betting_close_at });
  if (eligibilityError) return { error: eligibilityError };

  const fileValue = formData.get("receipt");
  const receipt = fileValue instanceof File ? fileValue : null;
  if (!settings.payment_qr_path) return { error: "El QR oficial todavía no está configurado. Los registros permanecen cerrados." };
  const receiptError = validateReceipt(receipt, true, settings.max_receipt_mb);
  if (receiptError) return { error: receiptError };
  const signatureError = await validateReceiptSignature(receipt!);
  if (signatureError) return { error: signatureError };

  const code = predictionCode();
  let fingerprint: string;
  try {
    fingerprint = await requestFingerprint();
  } catch (error) {
    logOperationError("rate-limit", error);
    return { error: "No se pudo validar la seguridad de la solicitud. Inténtalo nuevamente." };
  }
  let receiptPath: string | null = null;
  if (receipt && receipt.size > 0) {
    const ext = receipt.type === "image/png" ? "png" : receipt.type === "image/webp" ? "webp" : "jpg";
    receiptPath = `${event.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("receipts").upload(receiptPath, receipt, { contentType: receipt.type, upsert: false });
    if (error) {
      logOperationError("receipt-upload", error);
      return { error: "No se pudo subir el comprobante." };
    }
  }

  const { data, error } = await supabase.rpc("create_prediction_atomic", {
    p_event_id: event.id,
    p_code: code,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone,
    p_refund_phone: parsed.data.refundPhone,
    p_team_selected: parsed.data.teamSelected,
    p_declared_amount: parsed.data.amount,
    p_receipt_path: receiptPath,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_request_fingerprint: fingerprint,
  });
  if (error) {
    logOperationError("prediction-rpc", error);
    if (receiptPath) {
      const { error: cleanupError } = await supabase.storage.from("receipts").remove([receiptPath]);
      if (cleanupError) logOperationError("receipt-cleanup", cleanupError);
    }
    const friendly = error.message.includes("RATE_LIMIT") ? "Demasiados intentos. Espera unos minutos." :
      error.message.includes("DUPLICATE") ? "Este registro ya fue recibido." :
      error.message.includes("RISK_LIMIT") ? "Este equipo alcanzó temporalmente el límite de registros." :
      error.message.includes("EVENT_CLOSED") ? "Los registros están cerrados." : "No se pudo registrar la participación. Inténtalo nuevamente.";
    return { error: friendly };
  }
  revalidatePath("/");
  redirect(`/registro/${String(data)}`);
}

function logOperationError(stage: string, error: unknown) {
  const safeError = error && typeof error === "object" ? {
    name: "name" in error ? String(error.name) : undefined,
    code: "code" in error ? String(error.code) : undefined,
    message: "message" in error ? String(error.message) : "Error sin mensaje",
  } : { message: String(error) };
  console.error(`[prediction:create] ${stage}`, safeError);
}
