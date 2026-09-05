import type { EventStatus } from "@/lib/types";

export type EligibilityInput = { amount: number; minimumAmount: number; status: EventStatus; closesAt: string; now?: Date };

export function isRegistrationOpen(status: EventStatus, closesAt: string, now: Date = new Date()): boolean {
  return status === "OPEN" && new Date(closesAt).getTime() > now.getTime();
}

export function validateEligibility(input: EligibilityInput): string | null {
  if (input.status === "CANCELLED") return "El evento fue cancelado y no acepta participaciones.";
  if (input.status === "FINISHED") return "El evento ya finalizó y no acepta participaciones.";
  if (input.status === "CLOSED") return "Los registros están cerrados.";
  const closesAt = new Date(input.closesAt).getTime();
  if (!Number.isFinite(closesAt)) return "Los registros aún no están disponibles.";
  if (closesAt <= (input.now ?? new Date()).getTime()) return "El periodo de registro ya finalizó.";
  if (input.amount < input.minimumAmount) return `El monto mínimo permitido es S/ ${Number(input.minimumAmount).toLocaleString("en-US")}.`;
  return null;
}
