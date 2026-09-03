"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicExperience } from "@/lib/data";
import { predictionFieldsSchema, validateReceipt, validateReceiptSignature } from "@/lib/validation";
import { predictionCode, requestFingerprint } from "@/lib/security";
import { validateEligibility } from "@/lib/eligibility";

export type PredictionActionState = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createPrediction(_: PredictionActionState, formData: FormData): Promise<PredictionActionState> {
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

  const { event, settings, configured } = await getPublicExperience();
  if (!configured) return { error: "El sistema aún no está conectado a Supabase." };
  if (parsed.data.eventId !== event.id) return { error: "Este evento ya no está disponible." };
  if (settings.maintenance_mode) return { error: "El sitio está temporalmente en mantenimiento." };
  const eligibilityError = validateEligibility({ amount: parsed.data.amount, minimumAmount: Number(event.minimum_amount), status: event.status, closesAt: event.betting_close_at });
  if (eligibilityError) return { error: eligibilityError };

  const fileValue = formData.get("receipt");
  const receipt = fileValue instanceof File ? fileValue : null;
  if (!settings.payment_qr_url) return { error: "El QR oficial todavía no está configurado. Los registros permanecen cerrados." };
  const receiptError = validateReceipt(receipt, true, settings.max_receipt_mb);
  if (receiptError) return { error: receiptError };
  const signatureError = await validateReceiptSignature(receipt!);
  if (signatureError) return { error: signatureError };

  const code = predictionCode();
  const supabase = createAdminClient();
  const fingerprint = await requestFingerprint();
  let receiptPath: string | null = null;
  if (receipt && receipt.size > 0) {
    const ext = receipt.type === "image/png" ? "png" : receipt.type === "image/webp" ? "webp" : "jpg";
    receiptPath = `${event.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("receipts").upload(receiptPath, receipt, { contentType: receipt.type, upsert: false });
    if (error) return { error: "No pudimos subir el comprobante. Intenta otra vez." };
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
    if (receiptPath) await supabase.storage.from("receipts").remove([receiptPath]);
    const friendly = error.message.includes("RATE_LIMIT") ? "Demasiados intentos. Espera unos minutos." :
      error.message.includes("DUPLICATE") ? "Este registro ya fue recibido." :
      error.message.includes("RISK_LIMIT") ? "Este equipo alcanzó temporalmente el límite de registros." :
      error.message.includes("EVENT_CLOSED") ? "Los registros están cerrados." : "No pudimos registrar tu predicción. Intenta nuevamente.";
    return { error: friendly };
  }
  redirect(`/registro/${String(data)}`);
}
