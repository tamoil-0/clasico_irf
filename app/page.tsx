import { PredictionForm } from "@/components/prediction-form";
import { PublicHeader } from "@/components/public-header";
import { getPublicExperience } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const experience = await getPublicExperience();
  return (
    <div className="min-h-screen pb-[max(2rem,env(safe-area-inset-bottom))]">
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <PredictionForm {...experience} />
      </main>
      <footer className="mx-auto max-w-2xl px-4 pt-4 text-center text-[11px] text-zinc-700">Impact Regional Fellowship · Dinámica privada</footer>
    </div>
  );
}
