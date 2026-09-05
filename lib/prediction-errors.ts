import { PREDICTION_MESSAGES, type PredictionFieldErrors } from "@/lib/validation";

export type PredictionActionState = {
  error?: string;
  fieldErrors?: PredictionFieldErrors;
  /** Cambia en cada respuesta para reactivar el scroll y el foco al primer error. */
  focusToken?: string;
};

// Mensajes neutros: nunca exponen SQL, RPC, variables de entorno ni Supabase.
export const PREDICTION_ERRORS = {
  unavailable: "El registro no está disponible en este momento. Inténtalo nuevamente en unos minutos.",
  retry: "No pudimos registrar tu participación. Intenta nuevamente.",
  uploadFailed: "No pudimos subir el comprobante. Intenta nuevamente.",
  staleRequest: "No pudimos procesar tu solicitud. Recarga la página e inténtalo nuevamente.",
  eventGone: "Este evento ya no está disponible.",
  maintenance: "El sitio está temporalmente en mantenimiento.",
  registrationClosed: "Los registros están cerrados.",
  registrationPaused: "Los registros están cerrados por ahora.",
  tooManyAttempts: "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
  duplicate: "Este registro ya fue recibido.",
  riskLimit: "Este equipo alcanzó temporalmente el límite de registros.",
} as const;

/**
 * Traduce el fallo del RPC a lenguaje de usuario. Solo se leen el código y el
 * texto para clasificar; nada del detalle original llega a la interfaz.
 */
export function friendlyRpcState(error: unknown, minimumAmount: number): PredictionActionState {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";

  if (message.includes("RATE_LIMIT")) return { error: PREDICTION_ERRORS.tooManyAttempts };
  if (message.includes("DUPLICATE")) return { error: PREDICTION_ERRORS.duplicate };
  if (message.includes("RISK_LIMIT")) return { error: PREDICTION_ERRORS.riskLimit };
  if (message.includes("EVENT_CLOSED")) return { error: PREDICTION_ERRORS.registrationClosed };
  if (message.includes("BELOW_MINIMUM")) {
    return { error: PREDICTION_MESSAGES.summary, fieldErrors: { amount: [PREDICTION_MESSAGES.amountMin(minimumAmount)] } };
  }
  if (message.includes("RECEIPT_REQUIRED")) {
    return { error: PREDICTION_MESSAGES.summary, fieldErrors: { receipt: [PREDICTION_MESSAGES.receiptRequired] } };
  }
  // 22003 es numeric_value_out_of_range en numeric(10,2); 22P02, entrada mal formada.
  if (code === "22003") {
    return { error: PREDICTION_MESSAGES.summary, fieldErrors: { amount: [PREDICTION_MESSAGES.amountMax] } };
  }
  if (message.includes("INVALID_INPUT") || code === "22P02") return { error: PREDICTION_ERRORS.staleRequest };
  return { error: PREDICTION_ERRORS.retry };
}

/** Log seguro: solo nombre, código y mensaje, nunca el objeto completo. */
export function safeErrorDetails(error: unknown) {
  return error && typeof error === "object"
    ? {
        name: "name" in error ? String(error.name) : undefined,
        code: "code" in error ? String(error.code) : undefined,
        message: "message" in error ? String(error.message) : "Error sin mensaje",
      }
    : { message: String(error) };
}
