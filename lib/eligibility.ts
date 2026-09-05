import type { EventStatus } from "@/lib/types";
import { validateParticipationAmount } from "@/lib/validation";

export type EligibilityInput = { amount: number; minimumAmount: number; status: EventStatus; closesAt: string; now?: Date };

export function isRegistrationOpen(status: EventStatus, closesAt: string, now: Date = new Date()): boolean {
  const closesAtTime = new Date(closesAt).getTime();
  return status === "OPEN" && Number.isFinite(closesAtTime) && closesAtTime > now.getTime();
}

/** Motivo por el que el evento no acepta la participación, o null si la acepta. */
export function validateEventAvailability(input: Pick<EligibilityInput, "status" | "closesAt" | "now">): string | null {
  if (input.status === "CANCELLED") return "El evento fue cancelado y no acepta participaciones.";
  if (input.status === "FINISHED") return "El evento ya finalizó y no acepta participaciones.";
  if (input.status === "CLOSED") return "Los registros están cerrados.";
  const closesAt = new Date(input.closesAt).getTime();
  if (!Number.isFinite(closesAt)) return "Los registros no están disponibles por ahora.";
  if (closesAt <= (input.now ?? new Date()).getTime()) return "Los registros están cerrados.";
  return null;
}

export function validateEligibility(input: EligibilityInput): string | null {
  const availability = validateEventAvailability(input);
  if (availability) return availability;
  return validateParticipationAmount(input.amount, input.minimumAmount);
}
