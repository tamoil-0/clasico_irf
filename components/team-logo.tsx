"use client";
/* eslint-disable @next/next/no-img-element -- los logos son SVG/PNG administrables (locales o de Storage); el optimizador no aporta y rompe los SVG */

import { useState } from "react";

export const TEAM_LOGO_FALLBACK = "/teams/team.svg";

function initials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Muestra el logo sin deformarlo (object-contain, sin crop) y degrada en cadena:
 * logo configurado -> escudo genérico -> iniciales del equipo.
 */
export function TeamLogo({ src, name, className = "size-16 sm:size-20 md:size-24" }: { src?: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState<string[]>([]);
  const candidates = [src, TEAM_LOGO_FALLBACK].filter((value): value is string => Boolean(value));
  const current = candidates.find((candidate) => !broken.includes(candidate));

  if (!current) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[.06] font-black text-zinc-300 ${className}`} role="img" aria-label={name}>
        {initials(name)}
      </span>
    );
  }

  return (
    <img
      src={current}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setBroken((previous) => (previous.includes(current) ? previous : [...previous, current]))}
      className={`shrink-0 object-contain drop-shadow-xl ${className}`}
    />
  );
}
