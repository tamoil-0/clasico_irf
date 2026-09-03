"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MAX_LOGO_MB, TEAM_ASSETS_BUCKET, managedTeamAssetPath } from "@/lib/storage";
import { validateLogo, validateLogoSignature, verificationSchema } from "@/lib/validation";

export type AdminActionState = { ok?: boolean; error?: string };

export async function login(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Ingresa un correo y contraseña válidos." };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Credenciales incorrectas." };
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) { await supabase.auth.signOut(); return { error: "Este usuario no tiene acceso administrativo." }; }
  redirect("/admin");
}

export async function logout() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

export async function verifyPrediction(formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = verificationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Monto o registro inválido." };
  const { error } = await (await createServerSupabaseClient()).rpc("verify_prediction_atomic", {
    p_prediction_id: parsed.data.predictionId,
    p_verified_amount: parsed.data.verifiedAmount,
    p_admin_note: parsed.data.adminNote || null,
  });
  if (error) return { error: error.message.includes("RISK_LIMIT") ? "El monto supera el límite de riesgo configurado para este equipo." : "No se pudo confirmar el registro." };
  revalidatePath("/admin"); revalidatePath("/");
  return { ok: true };
}

export async function rejectPrediction(formData: FormData): Promise<AdminActionState> {
  const user = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("predictionId"));
  const note = z.string().trim().max(500).safeParse(formData.get("adminNote") || "");
  if (!id.success || !note.success) return { error: "Datos inválidos." };
  const { error } = await createAdminClient().from("predictions").update({ status: "REJECTED", admin_note: note.data || null, verified_at: new Date().toISOString(), verified_by: user.id }).eq("id", id.data).eq("status", "PENDING");
  if (error) return { error: "No se pudo rechazar el registro." };
  revalidatePath("/admin");
  return { ok: true };
}

export async function receiptUrl(predictionId: string) {
  await requireAdmin();
  const id = z.string().uuid().parse(predictionId);
  const supabase = createAdminClient();
  const { data: prediction } = await supabase.from("predictions").select("receipt_path").eq("id", id).single();
  if (!prediction?.receipt_path) return { error: "Este registro no tiene comprobante." };
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(prediction.receipt_path, 120);
  return error ? { error: "No se pudo abrir el comprobante." } : { url: data.signedUrl };
}

const eventSchema = z.object({
  id: z.string().uuid(), title: z.string().min(3).max(80), team_a: z.string().min(2).max(80), team_b: z.string().min(2).max(80),
  team_a_logo: z.string().max(500), team_b_logo: z.string().max(500), match_date: z.string().date(), match_time: z.string().regex(/^\d{2}:\d{2}$/),
  betting_close_at: z.string().datetime({ offset: true }), minimum_amount: z.coerce.number().positive(), multiplier: z.coerce.number().min(1).max(10),
  status: z.enum(["OPEN", "CLOSED", "FINISHED", "CANCELLED"]), risk_mode: z.enum(["OPEN", "WARN", "HARD_LIMIT"]), risk_limit_amount: z.coerce.number().min(0),
});

export async function updateEvent(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = eventSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Revisa la configuración del evento." };
  const { id, ...values } = parsed.data;
  const { error } = await createAdminClient().from("events").update(values).eq("id", id);
  if (error) return { error: "No se pudo guardar el evento." };
  revalidatePath("/"); revalidatePath("/admin");
  return { ok: true };
}

const settingsSchema = z.object({
  id: z.string().uuid(), payment_receiver_name: z.string().max(100), rules_text: z.string().min(10).max(5000),
  maintenance_mode: z.boolean(), max_receipt_mb: z.coerce.number().int().min(1).max(10),
});

export async function updateSettings(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse({ ...Object.fromEntries(formData), maintenance_mode: formData.get("maintenance_mode") === "on" });
  if (!parsed.success) return { error: "Revisa la configuración general." };
  const { id, ...values } = parsed.data;
  const { error } = await createAdminClient().from("settings").update(values).eq("id", id);
  if (error) return { error: "No se pudo guardar la configuración." };
  revalidatePath("/"); revalidatePath("/admin");
  return { ok: true };
}

export async function uploadPaymentQr(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const settingsId = z.string().uuid().safeParse(formData.get("settingsId"));
  const file = formData.get("qr");
  if (!settingsId.success || !(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) return { error: "Sube un QR JPG, PNG o WEBP de hasta 5 MB." };
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `qr/${crypto.randomUUID()}.${ext}`;
  const supabase = createAdminClient();
  const { error: uploadError } = await supabase.storage.from("payment-assets").upload(path, file, { contentType: file.type });
  if (uploadError) return { error: "No se pudo subir el QR." };
  const { data: previous } = await supabase.from("settings").select("payment_qr_path").eq("id", settingsId.data).single();
  const { error } = await supabase.from("settings").update({ payment_qr_path: path }).eq("id", settingsId.data);
  if (error) { await supabase.storage.from("payment-assets").remove([path]); return { error: "No se pudo guardar el QR." }; }
  if (previous?.payment_qr_path) await supabase.storage.from("payment-assets").remove([previous.payment_qr_path]);
  revalidatePath("/"); revalidatePath("/admin");
  return { ok: true };
}

const LOGO_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg", "image/jpeg": "jpg" };

export async function uploadTeamLogo(_: AdminActionState, formData: FormData): Promise<AdminActionState> {
  await requireAdmin();
  const parsed = z.object({ eventId: z.string().uuid(), slot: z.enum(["team_a_logo", "team_b_logo"]) })
    .safeParse({ eventId: formData.get("eventId"), slot: formData.get("slot") });
  if (!parsed.success) return { error: "Datos inválidos." };

  const value = formData.get("logo");
  const file = value instanceof File ? value : null;
  const logoError = validateLogo(file, MAX_LOGO_MB);
  if (logoError) return { error: logoError };
  const signatureError = await validateLogoSignature(file!);
  if (signatureError) return { error: signatureError };

  const supabase = createAdminClient();
  const path = `teams/${crypto.randomUUID()}.${LOGO_EXTENSIONS[file!.type]}`;
  const { error: uploadError } = await supabase.storage.from(TEAM_ASSETS_BUCKET).upload(path, file!, { contentType: file!.type, upsert: false });
  if (uploadError) return { error: "No se pudo subir el logo." };

  const { data: current } = await supabase.from("events").select("team_a_logo,team_b_logo").eq("id", parsed.data.eventId).single();
  const { data: published } = supabase.storage.from(TEAM_ASSETS_BUCKET).getPublicUrl(path);
  const { error } = await supabase.from("events").update({ [parsed.data.slot]: published.publicUrl }).eq("id", parsed.data.eventId);
  if (error) {
    await supabase.storage.from(TEAM_ASSETS_BUCKET).remove([path]);
    return { error: "No se pudo guardar el logo." };
  }

  // Solo se borra lo que subió esta app; rutas locales o URLs externas se dejan intactas.
  const previous = managedTeamAssetPath(current?.[parsed.data.slot]);
  if (previous && previous !== path) await supabase.storage.from(TEAM_ASSETS_BUCKET).remove([previous]);

  revalidatePath("/"); revalidatePath("/admin");
  return { ok: true };
}

export async function setMatchResult(eventId: string, result: "TEAM_A" | "DRAW" | "TEAM_B") {
  await requireAdmin();
  const parsed = z.object({ eventId: z.string().uuid(), result: z.enum(["TEAM_A", "DRAW", "TEAM_B"]) }).parse({ eventId, result });
  const { error } = await (await createServerSupabaseClient()).rpc("set_event_result", { p_event_id: parsed.eventId, p_result: parsed.result });
  if (error) return { error: "No se pudo registrar el resultado." };
  revalidatePath("/admin");
  return { ok: true };
}

export async function markSettlement(settlementId: string, status: "SETTLED" | "VOID") {
  await requireAdmin();
  const parsed = z.object({ settlementId: z.string().uuid(), status: z.enum(["SETTLED", "VOID"]) }).parse({ settlementId, status });
  const { error } = await createAdminClient().from("settlements").update({ status: parsed.status, settled_at: parsed.status === "SETTLED" ? new Date().toISOString() : null }).eq("id", parsed.settlementId);
  if (error) return { error: "No se pudo actualizar la liquidación." };
  revalidatePath("/admin");
  return { ok: true };
}
