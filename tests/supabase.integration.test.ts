import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const integration = url && anonKey ? describe : describe.skip;

integration("RLS de Supabase", () => {
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
