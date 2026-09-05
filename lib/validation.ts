import { z } from "zod";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_MB } from "@/lib/storage";

export const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PARTICIPATION_AMOUNT = 10_000;

// Se acepta coma o punto decimal y se acota la longitud para que un pegado
// absurdo nunca llegue a Number(). La base guarda numeric(10,2) (8 dígitos
// enteros); el tope de negocio (10 000) es mucho más estricto que eso.
const AMOUNT_PATTERN = /^\d{1,15}(?:[.,]\d{1,2})?$/;
const PERUVIAN_MOBILE_PATTERN = /^9\d{8}$/;
// Separadores puramente visuales. Deliberadamente no incluye "+", letras ni
// dígitos: todo lo demás sobrevive para que la validación pueda rechazarlo.
const PHONE_VISUAL_SEPARATORS = /[\s()-]/g;

const amountLabel = (value: number) =>
  `S/ ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Un único diccionario de mensajes para que cliente y servidor digan lo mismo. */
export const PREDICTION_MESSAGES = {
  summary: "Revisa los campos marcados.",
  team: "Selecciona un equipo para continuar.",
  amountRequired: "Selecciona o ingresa un monto válido.",
  amountFormat: "Ingresa un monto válido, con hasta 2 decimales.",
  amountPositive: "El monto debe ser mayor a cero.",
  amountMax: `El monto máximo permitido es ${amountLabel(MAX_PARTICIPATION_AMOUNT)}.`,
  amountMin: (minimum: number) => `El monto mínimo permitido es ${amountLabel(minimum)}.`,
  nameRequired: "Ingresa tu nombre completo.",
  nameTooLong: "El nombre es demasiado largo.",
  phoneRequired: "Ingresa tu número de WhatsApp.",
  phoneInvalid: "Ingresa un número de WhatsApp válido (9 dígitos, empieza en 9).",
  refundRequired: "Ingresa un número para devolución.",
  refundInvalid: "Ingresa un número válido para devolución (9 dígitos, empieza en 9).",
  acceptedRules: "Debes aceptar las reglas de la dinámica para continuar.",
  receiptRequired: "Sube tu comprobante de pago.",
  receiptType: "El formato del comprobante no es válido. Debe ser JPG, PNG o WEBP.",
  receiptSize: (maxMb: number) => `El comprobante supera el tamaño permitido (${maxMb} MB).`,
  receiptContent: "El contenido del archivo no coincide con una imagen JPG, PNG o WEBP válida.",
} as const;

/** Orden visual de los campos: define a cuál se hace scroll y foco primero. */
export const PREDICTION_FIELD_ORDER = ["teamSelected", "amount", "name", "phone", "refundPhone", "receipt", "acceptedRules"] as const;
export type PredictionFieldName = (typeof PREDICTION_FIELD_ORDER)[number];
export type PredictionFieldErrors = Partial<Record<string, string[]>>;

const asText = (value: unknown) => (typeof value === "string" || typeof value === "number" ? String(value).trim() : "");

/**
 * Convierte el monto a número solo cuando el texto tiene forma de monto.
 * Nunca usa Number() a ciegas: notación científica, signos, espacios y
 * separadores de miles quedan fuera por el patrón, no por el resultado.
 */
export function parseParticipationAmount(value: unknown): number | null {
  const raw = asText(value);
  if (!AMOUNT_PATTERN.test(raw)) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Normaliza lo que se teclea en el campo de monto: solo dígitos y un separador
 * decimal. Así `1e5`, signos, espacios y letras nunca llegan a formar un número.
 * El texto resultante se sigue validando al enviar: esto es ayuda, no defensa.
 */
export function sanitizeAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const [integerPart, ...decimalParts] = cleaned.split(".");
  const integer = integerPart.slice(0, 15);
  if (!decimalParts.length) return integer;
  return `${integer}.${decimalParts.join("").slice(0, 2)}`;
}

export function validateParticipationAmount(value: unknown, minimumAmount?: number): string | null {
  const raw = asText(value);
  if (!raw) return PREDICTION_MESSAGES.amountRequired;
  const parsed = parseParticipationAmount(raw);
  if (parsed === null) return PREDICTION_MESSAGES.amountFormat;
  if (parsed <= 0) return PREDICTION_MESSAGES.amountPositive;
  if (parsed > MAX_PARTICIPATION_AMOUNT) return PREDICTION_MESSAGES.amountMax;
  const minimum = Number(minimumAmount);
  if (Number.isFinite(minimum) && parsed < minimum) return PREDICTION_MESSAGES.amountMin(minimum);
  return null;
}

export function validateParticipantName(value: unknown): string | null {
  const raw = asText(value);
  if (raw.length < 2) return PREDICTION_MESSAGES.nameRequired;
  if (raw.length > 100) return PREDICTION_MESSAGES.nameTooLong;
  return null;
}

/**
 * Quita únicamente los separadores visuales de un teléfono: espacios, guiones y
 * paréntesis. Nunca borra dígitos, letras ni signos, así que no puede convertir
 * un número equivocado en uno aparentemente válido. Se usa solo para validar y
 * para enviar el número limpio; lo que la persona escribió se conserva tal cual.
 */
export function normalizePhoneNumber(value: unknown): string {
  return asText(value).replace(PHONE_VISUAL_SEPARATORS, "");
}

export function validateMobilePhone(value: unknown): string | null {
  if (!asText(value)) return PREDICTION_MESSAGES.phoneRequired;
  return PERUVIAN_MOBILE_PATTERN.test(normalizePhoneNumber(value)) ? null : PREDICTION_MESSAGES.phoneInvalid;
}

export function validateRefundPhone(value: unknown): string | null {
  if (!asText(value)) return PREDICTION_MESSAGES.refundRequired;
  return PERUVIAN_MOBILE_PATTERN.test(normalizePhoneNumber(value)) ? null : PREDICTION_MESSAGES.refundInvalid;
}

export function validateTeamSelection(value: unknown): string | null {
  return value === "TEAM_A" || value === "TEAM_B" ? null : PREDICTION_MESSAGES.team;
}

export function validateAcceptedRules(value: unknown): string | null {
  return value === true || value === "on" ? null : PREDICTION_MESSAGES.acceptedRules;
}

export function validateReceipt(file: File | null, required: boolean, maxMb: number) {
  if (!file || file.size === 0) {
    return required ? PREDICTION_MESSAGES.receiptRequired : null;
  }
  if (!ALLOWED_RECEIPT_TYPES.includes(file.type as (typeof ALLOWED_RECEIPT_TYPES)[number])) {
    return PREDICTION_MESSAGES.receiptType;
  }
  if (file.size > maxMb * 1024 * 1024) return PREDICTION_MESSAGES.receiptSize(maxMb);
  return null;
}

export type PredictionFieldValues = {
  teamSelected: unknown;
  amount: unknown;
  name: unknown;
  phone: unknown;
  refundPhone: unknown;
  acceptedRules: unknown;
};

export type PredictionFieldOptions = {
  minimumAmount?: number;
  receipt?: File | null;
  maxReceiptMb?: number;
  requireReceipt?: boolean;
};

/**
 * Valida todos los campos visibles de una sola pasada y devuelve un error por
 * campo. La usan el cliente (antes de enviar) y el servidor (como fuente de
 * verdad), así el mensaje que ve la persona es idéntico en ambos lados.
 */
export function collectPredictionFieldErrors(values: PredictionFieldValues, options: PredictionFieldOptions = {}): PredictionFieldErrors {
  const errors: PredictionFieldErrors = {};
  const add = (field: PredictionFieldName, message: string | null) => {
    if (message) errors[field] = [message];
  };

  add("teamSelected", validateTeamSelection(values.teamSelected));
  add("amount", validateParticipationAmount(values.amount, options.minimumAmount));
  add("name", validateParticipantName(values.name));
  add("phone", validateMobilePhone(values.phone));
  add("refundPhone", validateRefundPhone(values.refundPhone));
  add("acceptedRules", validateAcceptedRules(values.acceptedRules));
  if (options.requireReceipt !== false) {
    add("receipt", validateReceipt(options.receipt ?? null, true, options.maxReceiptMb ?? 5));
  }
  return errors;
}

export function hasFieldErrors(errors: PredictionFieldErrors): boolean {
  return Object.values(errors).some((messages) => Boolean(messages?.length));
}

const fromValidator = (validator: (value: unknown) => string | null) =>
  z.unknown().superRefine((value, context) => {
    const message = validator(value);
    if (message) context.addIssue({ code: z.ZodIssueCode.custom, message });
  });

const participationAmountSchema = fromValidator((value) => validateParticipationAmount(value))
  .transform((value) => parseParticipationAmount(value) ?? 0);

export const predictionFieldsSchema = z.object({
  eventId: z.string().uuid(),
  name: fromValidator(validateParticipantName).transform(asText),
  // Se guarda el número ya sin separadores: es lo que espera el RPC.
  phone: fromValidator(validateMobilePhone).transform(normalizePhoneNumber),
  refundPhone: fromValidator(validateRefundPhone).transform(normalizePhoneNumber),
  teamSelected: fromValidator(validateTeamSelection).transform((value) => value as "TEAM_A" | "TEAM_B"),
  amount: participationAmountSchema,
  acceptedRules: fromValidator(validateAcceptedRules),
  idempotencyKey: z.string().uuid(),
  website: z.string().max(0, "Solicitud inválida."),
});

export async function validateReceiptSignature(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const valid = file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : file.type === "image/webp" ? webp : false;
  return valid ? null : PREDICTION_MESSAGES.receiptContent;
}

export const verificationSchema = z.object({
  predictionId: z.string().uuid(),
  verifiedAmount: z.coerce.number().positive().max(MAX_PARTICIPATION_AMOUNT),
  adminNote: z.string().trim().max(500).optional(),
});


export function validateLogo(file: File | null, maxMb: number = MAX_LOGO_MB): string | null {
  if (!file || file.size === 0) return "Selecciona el archivo del logo.";
  if (!ALLOWED_LOGO_TYPES.includes(file.type as (typeof ALLOWED_LOGO_TYPES)[number])) {
    return "El logo debe ser PNG, JPG, WEBP o SVG.";
  }
  if (file.size > maxMb * 1024 * 1024) return `El logo no debe superar ${maxMb} MB.`;
  return null;
}

// Un SVG es texto ejecutable: se aloja solo si no trae contenido activo.
const UNSAFE_SVG_PATTERNS = [/<script[\s>]/i, /<foreignobject[\s>]/i, /<!entity/i, /javascript:/i, /\son\w+\s*=/i];

export function validateSvgMarkup(markup: string): string | null {
  if (!/<svg[\s>]/i.test(markup)) return "El archivo no es un SVG válido.";
  if (UNSAFE_SVG_PATTERNS.some((pattern) => pattern.test(markup))) {
    return "El SVG contiene contenido activo (scripts o eventos) y no puede subirse.";
  }
  return null;
}

export async function validateLogoSignature(file: File): Promise<string | null> {
  if (file.type === "image/svg+xml") return validateSvgMarkup(await file.text());
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const valid = file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : file.type === "image/webp" ? webp : false;
  return valid ? null : "El contenido del logo no coincide con su extensión.";
}
