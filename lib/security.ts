import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";

export async function requestFingerprint() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("Falta RATE_LIMIT_SECRET en el servidor.");
  return createHash("sha256").update(`${ip}:${secret || "local-development-only"}`).digest("hex");
}

export function predictionCode() {
  return `IRF-${randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
