import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const integration = url && anonKey ? describe : describe.skip;

integration("RLS de Supabase", () => {
  it("expone solo campos públicos de registros pendientes o verificados", async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const eventId = process.env.TEST_EVENT_ID || "00000000-0000-4000-8000-000000000001";
    const { data, error } = await client.rpc("public_registered_predictions", { p_event_id: eventId });
    expect(error).toBeNull();
    for (const row of data || []) {
      expect(Object.keys(row).sort()).toEqual(["created_at", "display_amount", "masked_name", "status", "team_selected", "verified_at"]);
      expect(["PENDING", "VERIFIED"]).toContain(row.status);
    }
  });

  it("bloquea al público al intentar listar registros", async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const { data, error } = await client.from("predictions").select("id,phone");
    expect(error || data?.length === 0).toBeTruthy();
  });

  it("bloquea al público al intentar cambiar un estado", async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const { data, error } = await client.from("predictions").update({ status: "VERIFIED" }).not("id", "is", null).select("id");
    expect(error || data?.length === 0).toBeTruthy();
  });

  const adminTest = adminEmail && adminPassword ? it : it.skip;
  adminTest("permite listar a un administrador autenticado", async () => {
    const client = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const { error: authError } = await client.auth.signInWithPassword({ email: adminEmail!, password: adminPassword! });
    expect(authError).toBeNull();
    const { error } = await client.from("predictions").select("id").limit(1);
    expect(error).toBeNull();
  });
});
