import { z } from "zod";
import { ALLOWED_LOGO_TYPES, MAX_LOGO_MB } from "@/lib/storage";

export const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const predictionFieldsSchema = z.object({
  eventId: z.string().uuid(),
  name: z.string().trim().min(2, "Ingresa tu nombre.").max(100),
  phone: z.string().regex(/^9\d{8}$/, "Ingresa un celular peruano de 9 dígitos."),
  refundPhone: z.string().regex(/^9\d{8}$/, "Ingresa un número de devolución válido."),
  teamSelected: z.enum(["TEAM_A", "TEAM_B"]),
  amount: z.coerce.number().finite().positive().max(10000),
  acceptedRules: z.literal("on", { errorMap: () => ({ message: "Debes aceptar las reglas." }) }),
  idempotencyKey: z.string().uuid(),
  website: z.string().max(0, "Solicitud inválida."),
});

export function validateReceipt(file: File | null, required: boolean, maxMb: number) {
  if (!file || file.size === 0) {
    return required ? "Adjunta tu comprobante." : null;
  }
  if (!ALLOWED_RECEIPT_TYPES.includes(file.type as (typeof ALLOWED_RECEIPT_TYPES)[number])) {
    return "El comprobante debe ser JPG, PNG o WEBP.";
  }
  if (file.size > maxMb * 1024 * 1024) return `El comprobante no debe superar ${maxMb} MB.`;
  return null;
}

export async function validateReceiptSignature(file: File): Promise<string | null> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const valid = file.type === "image/jpeg" ? jpeg : file.type === "image/png" ? png : file.type === "image/webp" ? webp : false;
  return valid ? null : "El contenido del comprobante no coincide con una imagen JPG, PNG o WEBP válida.";
}

export const verificationSchema = z.object({
  predictionId: z.string().uuid(),
  verifiedAmount: z.coerce.number().positive().max(10000),
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
