import "server-only";
import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  if (!hasSupabaseEnv()) redirect("/admin/login?error=Supabase+no+está+configurado");
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) redirect("/admin/login?error=Tu+usuario+no+es+administrador");
  return user;
}
