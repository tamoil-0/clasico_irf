import { describe, expect, it } from "vitest";
import { calculateExposure, calculatedReturn, projectExposure } from "@/lib/risk";
import { validateEligibility } from "@/lib/eligibility";
import { predictionFieldsSchema, validateReceipt, validateReceiptSignature } from "@/lib/validation";
import { maskParticipantName } from "@/lib/privacy";

const closesAt = "2026-09-12T19:45:00-05:00";
const beforeClose = new Date("2026-09-12T18:00:00-05:00");

describe("reglas de registro", () => {
  it("rechaza un monto menor al mínimo", () => {
    expect(validateEligibility({ amount: 9, minimumAmount: 10, status: "OPEN", closesAt, now: beforeClose })).toContain("mínimo");
  });

  it("acepta un monto válido mientras el evento está abierto", () => {
    expect(validateEligibility({ amount: 20, minimumAmount: 10, status: "OPEN", closesAt, now: beforeClose })).toBeNull();
  });

  it("rechaza un evento cerrado manualmente o por hora", () => {
    expect(validateEligibility({ amount: 20, minimumAmount: 10, status: "CLOSED", closesAt, now: beforeClose })).toContain("cerrados");
    expect(validateEligibility({ amount: 20, minimumAmount: 10, status: "OPEN", closesAt, now: new Date("2026-09-12T20:00:00-05:00") })).toContain("cerrados");
  });

  it("rechaza archivos con tipo o tamaño incorrectos", () => {
    expect(validateReceipt(new File(["pdf"], "recibo.pdf", { type: "application/pdf" }), true, 5)).toContain("JPG");
    expect(validateReceipt(new File([new Uint8Array(6 * 1024 * 1024)], "grande.png", { type: "image/png" }), true, 5)).toContain("5 MB");
  });

  it("rechaza una extensión de imagen con contenido falso", async () => {
    const disguised = new File(["no es una imagen"], "falso.png", { type: "image/png" });
    expect(await validateReceiptSignature(disguised)).toContain("no coincide");
  });

  it("valida celular, aceptación e idempotency key", () => {
    const result = predictionFieldsSchema.safeParse({ eventId: crypto.randomUUID(), name: "Persona Prueba", phone: "987654321", refundPhone: "987654321", teamSelected: "TEAM_A", amount: 10, acceptedRules: "on", idempotencyKey: crypto.randomUUID(), website: "" });
    expect(result.success).toBe(true);
  });
});

describe("privacidad pública", () => {
  it("enmascara apellidos y conserva nombres únicos", () => {
    expect(maskParticipantName("Jhon Aracayo Mamani")).toBe("Jhon A.");
    expect(maskParticipantName("María Quispe")).toBe("María Q.");
    expect(maskParticipantName("Jhon")).toBe("Jhon");
  });
});

describe("cálculos", () => {
  it("calcula correctamente un multiplicador de 1.5", () => expect(calculatedReturn(20, 1.5)).toBe(30));

  it("calcula pool, responsabilidades y balances", () => {
    expect(calculateExposure(50, 50, 1.5)).toEqual({ teamA: 50, teamB: 50, pool: 100, liabilityA: 75, liabilityB: 75, balanceA: 25, balanceB: 25 });
  });

  it("proyecta el riesgo del nuevo monto", () => {
    const projected = projectExposure(calculateExposure(50, 50, 1.5), "TEAM_A", 100, 1.5);
    expect(projected.balanceA).toBe(-25);
    expect(projected.balanceB).toBe(125);
  });
});
