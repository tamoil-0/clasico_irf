"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient, getSupabaseServerConfiguration } from "@/lib/supabase/admin";
import {
  PREDICTION_MESSAGES,
  hasFieldErrors,
  predictionFieldsSchema,
  validateParticipationAmount,
  validateReceipt,
  validateReceiptSignature,
  type PredictionFieldErrors,
} from "@/lib/validation";
import { predictionCode, requestFingerprint } from "@/lib/security";
import { validateEventAvailability } from "@/lib/eligibility";
import { PREDICTION_ERRORS, friendlyRpcState, safeErrorDetails, type PredictionActionState } from "@/lib/prediction-errors";

export type { PredictionActionState };

const { unavailable: UNAVAILABLE, retry: RETRY, uploadFailed: UPLOAD_FAILED, staleRequest: STALE_REQUEST } = PREDICTION_ERRORS;
const HIDDEN_FIELDS = ["eventId", "idempotencyKey", "website"] as const;

export async function createPrediction(_: PredictionActionState, formData: FormData): Promise<PredictionActionState> {
  const supabaseConfiguration = getSupabaseServerConfiguration();
  if (!supabaseConfiguration.configured) {
    console.error("[prediction:create] Configuración del servidor incompleta.", { missing: supabaseConfiguration.missing });
    return { error: UNAVAILABLE };
  }
  if (!process.env.RATE_LIMIT_SECRET?.trim() && process.env.NODE_ENV === "production") {
    console.error("[prediction:create] Falta el secreto de rate limiting en producción.");
    return { error: UNAVAILABLE };
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    logOperationError("client", error);
    return { error: UNAVAILABLE };
  }

  const rawAmount = formData.get("amount");
  const parsed = predictionFieldsSchema.safeParse({
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    refundPhone: formData.get("refundPhone"),
    teamSelected: formData.get("teamSelected"),
    amount: rawAmount,
    acceptedRules: formData.get("acceptedRules"),
    idempotencyKey: formData.get("idempotencyKey"),
    website: formData.get("website") ?? "",
  });
  const schemaErrors: PredictionFieldErrors = parsed.success ? {} : parsed.error.flatten().fieldErrors;

  // eventId/idempotencyKey/website no tienen campo visible: si fallan, la página
  // está desactualizada o la petición no salió del formulario.
  const brokenHiddenFields = HIDDEN_FIELDS.filter((field) => schemaErrors[field]?.length);
  if (brokenHiddenFields.length) {
    console.error("[prediction:create] Solicitud con campos internos inválidos.", { fields: brokenHiddenFields });
    return { error: STALE_REQUEST };
  }

  const [{ data: event, error: eventError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("events").select("id,status,betting_close_at,minimum_amount,multiplier,risk_mode,risk_limit_amount").eq("id", String(formData.get("eventId") ?? "")).maybeSingle(),
    supabase.from("settings").select("payment_qr_path,maintenance_mode,max_receipt_mb").limit(1).maybeSingle(),
  ]);
  if (eventError) {
    logOperationError("event-read", eventError);
    return { error: UNAVAILABLE };
  }
  if (settingsError) {
    logOperationError("settings-read", settingsError);
    return { error: UNAVAILABLE };
  }
  if (!event) return { error: PREDICTION_ERRORS.eventGone };
  if (!settings) return { error: UNAVAILABLE };
  if (settings.maintenance_mode) return { error: PREDICTION_ERRORS.maintenance };

  // El estado del evento manda: si está cerrado no tiene sentido marcar campos.
  const availabilityError = validateEventAvailability({ status: event.status, closesAt: event.betting_close_at });
  if (availabilityError) return { error: availabilityError };
  if (!settings.payment_qr_path) return { error: PREDICTION_ERRORS.registrationPaused };

  const maxReceiptMb = Number(settings.max_receipt_mb) > 0 ? Number(settings.max_receipt_mb) : 5;
  const fileValue = formData.get("receipt");
  const receipt = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;

  // Se valida todo junto para devolver de una sola vez cada campo con problema.
  const fieldErrors: PredictionFieldErrors = {};
  for (const [field, messages] of Object.entries(schemaErrors)) {
    if (!HIDDEN_FIELDS.includes(field as (typeof HIDDEN_FIELDS)[number]) && messages?.length) fieldErrors[field] = messages;
  }
  // El mínimo real vive en el evento, así que este chequeo reemplaza al del esquema.
  const amountError = validateParticipationAmount(rawAmount, Number(event.minimum_amount));
  if (amountError) fieldErrors.amount = [amountError];
  else delete fieldErrors.amount;

  const receiptError = validateReceipt(receipt, true, maxReceiptMb);
  if (receiptError) fieldErrors.receipt = [receiptError];
  else {
    const signatureError = await validateReceiptSignature(receipt!);
    if (signatureError) fieldErrors.receipt = [signatureError];
  }
  if (hasFieldErrors(fieldErrors)) return { error: PREDICTION_MESSAGES.summary, fieldErrors };
  if (!parsed.success) return { error: STALE_REQUEST };

  const code = predictionCode();
  let fingerprint: string;
  try {
    fingerprint = await requestFingerprint();
  } catch (error) {
    logOperationError("rate-limit", error);
    return { error: RETRY };
  }

  const ext = receipt!.type === "image/png" ? "png" : receipt!.type === "image/webp" ? "webp" : "jpg";
  const receiptPath = `${event.id}/${crypto.randomUUID()}.${ext}`;
  const { error: uploadError } = await supabase.storage.from("receipts").upload(receiptPath, receipt!, { contentType: receipt!.type, upsert: false });
  if (uploadError) {
    logOperationError("receipt-upload", uploadError);
    return { error: UPLOAD_FAILED };
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
    const { error: cleanupError } = await supabase.storage.from("receipts").remove([receiptPath]);
    if (cleanupError) logOperationError("receipt-cleanup", cleanupError);
    return friendlyRpcState(error, Number(event.minimum_amount));
  }
  revalidatePath("/");
  redirect(`/registro/${String(data)}`);
}

function logOperationError(stage: string, error: unknown) {
  console.error(`[prediction:create] ${stage}`, safeErrorDetails(error));
}
