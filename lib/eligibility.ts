import type { EventStatus } from "@/lib/types";

export type EligibilityInput = { amount: number; minimumAmount: number; status: EventStatus; closesAt: string; now?: Date };

export function isRegistrationOpen(status: EventStatus, closesAt: string, now: Date = new Date()): boolean {
  return status === "OPEN" && new Date(closesAt).getTime() > now.getTime();
}

export function validateEligibility(input: EligibilityInput): string | null {
  if (input.amount < input.minimumAmount) return `El monto mínimo es S/ ${input.minimumAmount}.`;
  if (!isRegistrationOpen(input.status, input.closesAt, input.now ?? new Date())) return "Los registros están cerrados.";
  return null;
}
