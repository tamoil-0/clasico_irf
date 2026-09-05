import { describe, expect, it } from "vitest";
import {
  MAX_PARTICIPATION_AMOUNT,
  PREDICTION_MESSAGES,
  collectPredictionFieldErrors,
  hasFieldErrors,
  parseParticipationAmount,
  predictionFieldsSchema,
  sanitizeAmountInput,
  normalizePhoneNumber,
  validateMobilePhone,
  validateParticipantName,
  validateParticipationAmount,
  validateReceipt,
  validateReceiptSignature,
  validateRefundPhone,
} from "@/lib/validation";
import { PREDICTION_ERRORS, friendlyRpcState, safeErrorDetails } from "@/lib/prediction-errors";
import { validateEligibility } from "@/lib/eligibility";
import {
  disguisedReceipt,
  oversizedReceipt,
  pdfReceipt,
  txtReceipt,
  validJpgReceipt,
  validPngReceipt,
  validWebpReceipt,
} from "./fixtures/receipts";

const MINIMUM = 10;

const validValues = {
  teamSelected: "TEAM_A",
  amount: "20",
  name: "Jose Luis",
  phone: "944999999",
  refundPhone: "944999999",
  acceptedRules: true,
};

// Tabla del punto 2 del plan de pruebas, con el mensaje exacto esperado.
const AMOUNT_CASES: Array<[string, string | null]> = [
  ["", PREDICTION_MESSAGES.amountRequired],
  ["0", PREDICTION_MESSAGES.amountPositive],
  ["0.00", PREDICTION_MESSAGES.amountPositive],
  ["-10", PREDICTION_MESSAGES.amountFormat],
  ["abc", PREDICTION_MESSAGES.amountFormat],
  ["1e5", PREDICTION_MESSAGES.amountFormat],
  ["Infinity", PREDICTION_MESSAGES.amountFormat],
  ["NaN", PREDICTION_MESSAGES.amountFormat],
  ["10.999", PREDICTION_MESSAGES.amountFormat],
  ["9", PREDICTION_MESSAGES.amountMin(MINIMUM)],
  ["9.99", PREDICTION_MESSAGES.amountMin(MINIMUM)],
  ["10", null],
  ["10.00", null],
  ["10.50", null],
  ["20", null],
  ["50", null],
  ["9999.99", null],
  ["10000", null],
  ["10000.01", PREDICTION_MESSAGES.amountMax],
  ["10001", PREDICTION_MESSAGES.amountMax],
  ["24224424141414", PREDICTION_MESSAGES.amountMax],
];

describe("monto: tabla completa", () => {
  it.each(AMOUNT_CASES)("%j devuelve el mensaje esperado", (input, expected) => {
    expect(validateParticipationAmount(input, MINIMUM)).toBe(expected);
  });

  it("solo convierte a número lo que ya pasó el formato", () => {
    expect(parseParticipationAmount("10.50")).toBe(10.5);
    expect(parseParticipationAmount("10,50")).toBe(10.5);
    expect(parseParticipationAmount("1e5")).toBeNull();
    expect(parseParticipationAmount("Infinity")).toBeNull();
    expect(parseParticipationAmount(Infinity)).toBeNull();
    expect(parseParticipationAmount(NaN)).toBeNull();
    expect(parseParticipationAmount("-10")).toBeNull();
    expect(parseParticipationAmount("10.999")).toBeNull();
    expect(parseParticipationAmount(null)).toBeNull();
    expect(parseParticipationAmount(undefined)).toBeNull();
    expect(parseParticipationAmount({})).toBeNull();
  });

  it("el monto absurdo nunca queda habilitado para calcular un resultado", () => {
    // Reproduce la condición que usa el formulario para decidir si calcula.
    const invalid = "24224424141414";
    expect(validateParticipationAmount(invalid, MINIMUM)).toBe(PREDICTION_MESSAGES.amountMax);
    const calculable = validateParticipationAmount(invalid, MINIMUM) ? null : parseParticipationAmount(invalid);
    expect(calculable).toBeNull();
  });

  it("normaliza lo tecleado sin dejar pasar notación científica ni signos", () => {
    expect(sanitizeAmountInput("1e5")).toBe("15");
    expect(sanitizeAmountInput("-10")).toBe("10");
    expect(sanitizeAmountInput("abc")).toBe("");
    expect(sanitizeAmountInput("Infinity")).toBe("");
    expect(sanitizeAmountInput("10,5")).toBe("10.5");
    expect(sanitizeAmountInput("10.999")).toBe("10.99");
    expect(sanitizeAmountInput("10.5.7")).toBe("10.57");
    expect(sanitizeAmountInput("  20  ")).toBe("20");
  });
});

// Tabla del punto 3.
const PHONE_CASES: Array<[string, "required" | "invalid" | "ok"]> = [
  ["944999999", "ok"],
  ["987654321", "ok"],
  ["  944999999  ", "ok"],
  // Separadores visuales: mismo número, solo escrito de otra forma.
  ["944 999 999", "ok"],
  ["944-999-999", "ok"],
  ["(944) 999 999", "ok"],
  ["944 - 999 - 999", "ok"],
  ["(944)999-999", "ok"],
  ["", "required"],
  ["   ", "required"],
  ["123", "invalid"],
  ["94499999", "invalid"], // 8 dígitos
  ["9449999999", "invalid"], // 10 dígitos
  ["944-999-9999", "invalid"], // 10 dígitos con separadores
  ["844999999", "invalid"], // no empieza en 9
  ["abcdefghi", "invalid"],
  ["94499999a", "invalid"],
  ["+51944999999", "invalid"],
  ["+51 944 999 999", "invalid"], // el "+" no se borra
  ["944.999.999", "invalid"], // el punto no es separador aceptado
  ["944999999123456789012", "invalid"], // pegado desmedido
  ["---", "invalid"], // solo separadores no es un número
];

describe("teléfonos: tabla completa", () => {
  it.each(PHONE_CASES)("WhatsApp %j → %s", (input, expected) => {
    const result = validateMobilePhone(input);
    if (expected === "ok") expect(result).toBeNull();
    if (expected === "required") expect(result).toBe(PREDICTION_MESSAGES.phoneRequired);
    if (expected === "invalid") expect(result).toBe(PREDICTION_MESSAGES.phoneInvalid);
  });

  it.each(PHONE_CASES)("devolución %j → %s", (input, expected) => {
    const result = validateRefundPhone(input);
    if (expected === "ok") expect(result).toBeNull();
    if (expected === "required") expect(result).toBe(PREDICTION_MESSAGES.refundRequired);
    if (expected === "invalid") expect(result).toBe(PREDICTION_MESSAGES.refundInvalid);
  });

  it("normaliza solo espacios, guiones y paréntesis", () => {
    expect(normalizePhoneNumber("944 999 999")).toBe("944999999");
    expect(normalizePhoneNumber("944-999-999")).toBe("944999999");
    expect(normalizePhoneNumber("(944) 999 999")).toBe("944999999");
    expect(normalizePhoneNumber("  944999999  ")).toBe("944999999");
  });

  it("no borra ningún otro carácter al normalizar", () => {
    // Cada uno debe sobrevivir para que la validación pueda rechazarlo.
    expect(normalizePhoneNumber("+51944999999")).toBe("+51944999999");
    expect(normalizePhoneNumber("94499999a")).toBe("94499999a");
    expect(normalizePhoneNumber("abcdefghi")).toBe("abcdefghi");
    expect(normalizePhoneNumber("944.999.999")).toBe("944.999.999");
    // Y nunca se pierde un dígito: 10 siguen siendo 10.
    expect(normalizePhoneNumber("944-999-9999")).toBe("9449999999");
    expect(normalizePhoneNumber("9449999999")).toHaveLength(10);
  });

  it("ningún valor fuera de formato se convierte en uno válido al recortarlo", () => {
    // Recortar a 9 caracteres haría pasar por bueno un número equivocado:
    // el validador debe rechazar el valor completo, no una versión recortada.
    for (const typed of ["9449999999", "944999999123456", "944999999abc"]) {
      expect(validateMobilePhone(typed)).toBe(PREDICTION_MESSAGES.phoneInvalid);
      expect(validateMobilePhone(typed.slice(0, 9))).toBeNull();
    }
  });

  it("los dos campos usan mensajes distintos para no confundirlos", () => {
    expect(PREDICTION_MESSAGES.phoneInvalid).toBe("Ingresa un número de WhatsApp válido (9 dígitos, empieza en 9).");
    expect(PREDICTION_MESSAGES.refundInvalid).toBe("Ingresa un número válido para devolución (9 dígitos, empieza en 9).");
  });
});

describe("nombre", () => {
  it.each([
    ["", PREDICTION_MESSAGES.nameRequired],
    ["   ", PREDICTION_MESSAGES.nameRequired],
    ["J", PREDICTION_MESSAGES.nameRequired],
    ["Jose Luis", null],
    ["José Luis Pérez", null],
    ["María de los Ángeles Quispe Ñahui", null],
  ])("%j devuelve el mensaje esperado", (input, expected) => {
    expect(validateParticipantName(input)).toBe(expected);
  });

  it("rechaza un nombre desmedido", () => {
    expect(validateParticipantName("a".repeat(101))).toBe(PREDICTION_MESSAGES.nameTooLong);
  });
});

describe("comprobante con archivos reales", () => {
  it("acepta PNG, JPG y WEBP generados como fixtures", async () => {
    for (const receipt of [validPngReceipt(), validJpgReceipt(), validWebpReceipt()]) {
      expect(validateReceipt(receipt, true, 5)).toBeNull();
      expect(await validateReceiptSignature(receipt)).toBeNull();
    }
  });

  it("rechaza PDF y TXT con el mensaje de formato", () => {
    expect(validateReceipt(pdfReceipt(), true, 5)).toBe(PREDICTION_MESSAGES.receiptType);
    expect(validateReceipt(txtReceipt(), true, 5)).toBe(PREDICTION_MESSAGES.receiptType);
  });

  it("rechaza un archivo que supera el máximo", () => {
    expect(validateReceipt(oversizedReceipt(6), true, 5)).toBe(PREDICTION_MESSAGES.receiptSize(5));
  });

  it("rechaza un PNG falso aunque el tipo declarado sea correcto", async () => {
    const disguised = disguisedReceipt();
    expect(validateReceipt(disguised, true, 5)).toBeNull();
    expect(await validateReceiptSignature(disguised)).toBe(PREDICTION_MESSAGES.receiptContent);
  });

  it("exige el comprobante cuando no hay archivo", () => {
    expect(validateReceipt(null, true, 5)).toBe(PREDICTION_MESSAGES.receiptRequired);
  });
});

describe("errores por campo", () => {
  it("marca los seis campos de un formulario vacío a la vez", () => {
    const errors = collectPredictionFieldErrors(
      { teamSelected: "", amount: "", name: "", phone: "", refundPhone: "", acceptedRules: false },
      { minimumAmount: MINIMUM, receipt: null, maxReceiptMb: 5 },
    );
    expect(Object.keys(errors).sort()).toEqual(["acceptedRules", "amount", "name", "phone", "receipt", "refundPhone", "teamSelected"]);
  });

  it.each([
    ["nombre", { name: "" }, "name"],
    ["WhatsApp", { phone: "" }, "phone"],
    ["devolución", { refundPhone: "" }, "refundPhone"],
    ["monto", { amount: "0" }, "amount"],
    ["reglas", { acceptedRules: false }, "acceptedRules"],
  ])("solo señala %s cuando es el único inválido", (_campo, override, expectedKey) => {
    const errors = collectPredictionFieldErrors({ ...validValues, ...override }, { minimumAmount: MINIMUM, receipt: validPngReceipt(), maxReceiptMb: 5 });
    expect(Object.keys(errors)).toEqual([expectedKey]);
  });

  it("no reporta nada cuando todo es válido", () => {
    expect(hasFieldErrors(collectPredictionFieldErrors(validValues, { minimumAmount: MINIMUM, receipt: validPngReceipt(), maxReceiptMb: 5 }))).toBe(false);
  });

  it("el esquema del servidor devuelve exactamente los mismos mensajes", () => {
    const result = predictionFieldsSchema.safeParse({
      eventId: crypto.randomUUID(),
      name: "",
      phone: "",
      refundPhone: "",
      teamSelected: "",
      amount: "1e5",
      acceptedRules: null,
      idempotencyKey: crypto.randomUUID(),
      website: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const fieldErrors = result.error.flatten().fieldErrors;
    expect(fieldErrors.name).toEqual([PREDICTION_MESSAGES.nameRequired]);
    expect(fieldErrors.phone).toEqual([PREDICTION_MESSAGES.phoneRequired]);
    expect(fieldErrors.refundPhone).toEqual([PREDICTION_MESSAGES.refundRequired]);
    expect(fieldErrors.teamSelected).toEqual([PREDICTION_MESSAGES.team]);
    expect(fieldErrors.amount).toEqual([PREDICTION_MESSAGES.amountFormat]);
    expect(fieldErrors.acceptedRules).toEqual([PREDICTION_MESSAGES.acceptedRules]);
  });

  it("el esquema del servidor entrega el teléfono ya sin separadores", () => {
    const result = predictionFieldsSchema.safeParse({
      eventId: crypto.randomUUID(),
      ...validValues,
      phone: "(944) 999 999",
      refundPhone: "944-999-999",
      acceptedRules: "on",
      idempotencyKey: crypto.randomUUID(),
      website: "",
    });
    expect(result.success).toBe(true);
    // Es lo que espera el RPC, cuyo regex en SQL es ^9[0-9]{8}$.
    if (result.success) {
      expect(result.data.phone).toBe("944999999");
      expect(result.data.refundPhone).toBe("944999999");
    }
  });

  it("el esquema rechaza un teléfono que solo parece válido tras recortarlo", () => {
    const result = predictionFieldsSchema.safeParse({
      eventId: crypto.randomUUID(),
      ...validValues,
      phone: "944-999-9999",
      acceptedRules: "on",
      idempotencyKey: crypto.randomUUID(),
      website: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.flatten().fieldErrors.phone).toEqual([PREDICTION_MESSAGES.phoneInvalid]);
  });

  it("rechaza el honeypot sin tocar los campos visibles", () => {
    const result = predictionFieldsSchema.safeParse({
      eventId: crypto.randomUUID(),
      ...validValues,
      acceptedRules: "on",
      idempotencyKey: crypto.randomUUID(),
      website: "https://spam.example",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.error.flatten().fieldErrors)).toEqual(["website"]);
  });
});

describe("elegibilidad", () => {
  const closesAt = "2026-09-12T19:45:00-05:00";
  const beforeClose = new Date("2026-09-12T18:00:00-05:00");

  it("rechaza un monto sobre el tope aunque el evento esté abierto", () => {
    expect(validateEligibility({ amount: 10001, minimumAmount: MINIMUM, status: "OPEN", closesAt, now: beforeClose })).toBe(PREDICTION_MESSAGES.amountMax);
  });

  it("prioriza el estado del evento sobre el monto", () => {
    expect(validateEligibility({ amount: 1, minimumAmount: MINIMUM, status: "CLOSED", closesAt, now: beforeClose })).toBe(PREDICTION_ERRORS.registrationClosed);
  });
});

describe("errores del backend", () => {
  it("traduce los fallos conocidos del RPC", () => {
    expect(friendlyRpcState({ message: "RATE_LIMIT" }, MINIMUM).error).toBe(PREDICTION_ERRORS.tooManyAttempts);
    expect(friendlyRpcState({ message: "DUPLICATE" }, MINIMUM).error).toBe(PREDICTION_ERRORS.duplicate);
    expect(friendlyRpcState({ message: "RISK_LIMIT" }, MINIMUM).error).toBe(PREDICTION_ERRORS.riskLimit);
    expect(friendlyRpcState({ message: "EVENT_CLOSED" }, MINIMUM).error).toBe(PREDICTION_ERRORS.registrationClosed);
  });

  it("devuelve BELOW_MINIMUM y RECEIPT_REQUIRED como error del campo", () => {
    expect(friendlyRpcState({ message: "BELOW_MINIMUM" }, MINIMUM).fieldErrors?.amount).toEqual([PREDICTION_MESSAGES.amountMin(MINIMUM)]);
    expect(friendlyRpcState({ message: "RECEIPT_REQUIRED" }, MINIMUM).fieldErrors?.receipt).toEqual([PREDICTION_MESSAGES.receiptRequired]);
  });

  it("convierte el desborde de numeric(10,2) en el mensaje de monto máximo", () => {
    expect(friendlyRpcState({ message: "numeric field overflow", code: "22003" }, MINIMUM).fieldErrors?.amount).toEqual([PREDICTION_MESSAGES.amountMax]);
  });

  it("nunca filtra el detalle técnico de un error desconocido", () => {
    const leaky = {
      message: 'relation public.predictions does not exist; SUPABASE_SERVICE_ROLE_KEY=secret_test_123',
      code: "42P01",
      details: "at pg_catalog.pg_class",
      hint: "check search_path",
    };
    const state = friendlyRpcState(leaky, MINIMUM);
    const rendered = JSON.stringify(state);
    expect(state.error).toBe(PREDICTION_ERRORS.retry);
    for (const secret of ["predictions", "42P01", "SUPABASE", "secret_test_123", "pg_catalog", "search_path", "relation"]) {
      expect(rendered).not.toContain(secret);
    }
  });

  it("el log interno conserva solo nombre, código y mensaje", () => {
    expect(safeErrorDetails({ name: "PostgrestError", code: "22003", message: "overflow", hint: "interno" })).toEqual({
      name: "PostgrestError",
      code: "22003",
      message: "overflow",
    });
  });

  it("ningún mensaje de usuario menciona tecnología interna", () => {
    const everyMessage = [
      ...Object.values(PREDICTION_ERRORS),
      ...Object.values(PREDICTION_MESSAGES).map((value) => (typeof value === "function" ? value(10) : value)),
    ];
    for (const message of everyMessage) {
      expect(message.toLowerCase()).not.toMatch(/supabase|postgres|rpc|sql|rls|storage|env|token|key/);
    }
  });
});

describe("límites conservados", () => {
  it("el tope de la aplicación sigue siendo S/ 10,000", () => {
    expect(MAX_PARTICIPATION_AMOUNT).toBe(10_000);
  });
});
