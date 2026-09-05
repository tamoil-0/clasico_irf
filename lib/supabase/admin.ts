import "server-only";
import { createClient } from "@supabase/supabase-js";

export function getSupabaseServerConfiguration() {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
  const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
  return { configured: missing.length === 0, missing };
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Faltan las variables privadas de Supabase.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
