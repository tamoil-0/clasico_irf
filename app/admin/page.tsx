import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdmin();
  const supabase = createAdminClient();
  const [{ data: event }, { data: settings }, { data: predictions }, { data: settlements }] = await Promise.all([
    supabase.from("events").select("*").order("created_at", { ascending: false }).limit(1).single(),
    supabase.from("settings").select("*").limit(1).single(),
    supabase.from("predictions").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("settlements").select("*,predictions(code,name,phone,team_selected,verified_amount)").order("created_at", { ascending: false }).limit(500),
  ]);
  if (!event || !settings) throw new Error("Ejecuta las migraciones y el seed de Supabase.");
  return <AdminDashboard userEmail={user.email || "Admin"} event={event} settings={settings} predictions={predictions || []} settlements={settlements || []} />;
}
