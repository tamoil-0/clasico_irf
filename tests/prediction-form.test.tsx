// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createPrediction = vi.fn();
vi.mock("@/app/actions", () => ({ createPrediction: (...args: unknown[]) => createPrediction(...args) }));

import { PredictionForm } from "@/components/prediction-form";
import { soles } from "@/lib/format";
import { PREDICTION_ERRORS, friendlyRpcState } from "@/lib/prediction-errors";
import { PREDICTION_MESSAGES } from "@/lib/validation";
import type { EventRecord, PublicSettings } from "@/lib/types";
import { oversizedReceipt, pdfReceipt, txtReceipt, validJpgReceipt, validPngReceipt, validWebpReceipt } from "./fixtures/receipts";

const event: EventRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Clásico IRF",
  team_a: "Alianza Lima",
  team_b: "Universitario",
  team_a_logo: null,
  team_b_logo: null,
  match_date: "2026-09-12",
  match_time: "20:00",
  betting_close_at: "2099-09-12T19:45:00-05:00",
  status: "OPEN",
  minimum_amount: 10,
  multiplier: 1.5,
  result: null,
  risk_mode: "OPEN",
  risk_limit_amount: 0,
};

const settings: PublicSettings = {
  payment_qr_url: "https://example.test/qr.png",
  payment_receiver_name: "IRF",
  rules_text: "Reglas",
  maintenance_mode: false,
  max_receipt_mb: 5,
};

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:comprobante-test");
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  createPrediction.mockReset();
  createPrediction.mockResolvedValue({});
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
});
afterEach(() => cleanup());

/** `soles()` separa con espacio duro; Testing Library normaliza a espacio simple. */
const money = (value: number) => soles(value).replace(/ /g, " ");

function setup(options: { applyAccept?: boolean } = {}) {
  const user = userEvent.setup({ delay: null, ...options });
  const { container } = render(
    <PredictionForm
      event={event}
      settings={settings}
      predictions={[]}
      supabaseConfigured
      eventExists
      settingsExists
      dataError={false}
      registrationOpen
    />,
  );
  return { user, container };
}

const fields = () => ({
  amount: screen.getByLabelText("Monto") as HTMLInputElement,
  name: screen.getByLabelText("Nombre completo") as HTMLInputElement,
  phone: screen.getByLabelText("WhatsApp / celular") as HTMLInputElement,
  refundPhone: screen.getByLabelText("Número para devolución o contacto") as HTMLInputElement,
  rules: screen.getByRole("checkbox") as HTMLInputElement,
  submit: screen.getByRole("button", { name: /Registrar participación|Registrando/ }) as HTMLButtonElement,
});

const receiptInput = (container: HTMLElement) => container.querySelector("#receipt") as HTMLInputElement;
const previewVisible = () => Boolean(screen.queryByAltText("Vista previa del comprobante"));

type Overrides = {
  amount?: string;
  name?: string;
  phone?: string;
  refundPhone?: string;
  rules?: boolean;
  receipt?: File | null;
};

/** Rellena el formulario como lo haría una persona; `overrides` altera solo lo indicado. */
async function fillForm(user: ReturnType<typeof userEvent.setup>, container: HTMLElement, overrides: Overrides = {}) {
  await user.click(screen.getByRole("button", { name: /Alianza Lima/ }));
  const f = fields();

  const amount = overrides.amount ?? "10";
  await user.clear(f.amount);
  if (amount) await user.type(f.amount, amount);

  const name = overrides.name ?? "Jose Luis";
  if (name) await user.type(f.name, name);

  const phone = overrides.phone ?? "944999999";
  if (phone) await user.type(f.phone, phone);

  const refundPhone = overrides.refundPhone ?? "944999999";
  if (refundPhone) await user.type(f.refundPhone, refundPhone);

  const receipt = overrides.receipt === undefined ? validPngReceipt() : overrides.receipt;
  if (receipt) await user.upload(receiptInput(container), receipt);

  if (overrides.rules !== false) await user.click(f.rules);
}

const currentValues = () => {
  const f = fields();
  return { amount: f.amount.value, name: f.name.value, phone: f.phone.value, refundPhone: f.refundPhone.value, rules: f.rules.checked, receipt: previewVisible() };
};

const lastPayload = () => createPrediction.mock.calls.at(-1)![1] as FormData;

describe("2. monto en la interfaz", () => {
  it("no permite teclear letras ni notación científica", async () => {
    const { user, container } = setup();
    await fillForm(user, container);
    const amount = fields().amount;

    await user.clear(amount);
    await user.type(amount, "abc");
    expect(amount.value).toBe("");

    await user.type(amount, "1e5");
    expect(amount.value).toBe("15");

    await user.clear(amount);
    await user.type(amount, "-50");
    expect(amount.value).toBe("50");

    await user.clear(amount);
    await user.type(amount, "10.999");
    expect(amount.value).toBe("10.99");
  });

  it("solo calcula el posible resultado con un monto válido", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { amount: "10" });
    expect(screen.getByText(money(15))).toBeTruthy();

    const amount = fields().amount;
    await user.clear(amount);
    await user.type(amount, "24224424141414");
    expect(screen.getByText("—")).toBeTruthy();
    expect(document.body.textContent).not.toContain("36,336,636,212,121");

    await user.clear(amount);
    await user.type(amount, "9");
    expect(screen.getByText("—")).toBeTruthy();

    await user.clear(amount);
    await user.type(amount, "10000");
    expect(screen.getByText(money(15000))).toBeTruthy();
  });

  it.each([
    ["0", PREDICTION_MESSAGES.amountPositive],
    ["9", PREDICTION_MESSAGES.amountMin(10)],
    ["10001", PREDICTION_MESSAGES.amountMax],
    ["24224424141414", PREDICTION_MESSAGES.amountMax],
    ["", PREDICTION_MESSAGES.amountRequired],
  ])("con monto %j muestra el mensaje correspondiente y no envía", async (amount, expected) => {
    const { user, container } = setup();
    await fillForm(user, container, { amount });
    await user.click(fields().submit);

    await screen.findByText(expected);
    expect(createPrediction).not.toHaveBeenCalled();
    expect(currentValues()).toMatchObject({ name: "Jose Luis", phone: "944999999", refundPhone: "944999999", rules: true, receipt: true });
  });
});

describe("3. teléfonos en la interfaz", () => {
  it("muestra el mensaje propio de cada campo", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "", refundPhone: "" });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.phoneRequired);
    expect(screen.getByText(PREDICTION_MESSAGES.refundRequired)).toBeTruthy();
  });

  it("rechaza un número que no empieza en 9 o queda corto", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "844999999" });
    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.phoneInvalid);
    expect(createPrediction).not.toHaveBeenCalled();

    const phone = fields().phone;
    await user.clear(phone);
    await user.type(phone, "94499999");
    await user.click(fields().submit);
    await waitFor(() => expect(screen.getByText(PREDICTION_MESSAGES.phoneInvalid)).toBeTruthy());
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("acepta exactamente 9 dígitos que empiezan en 9", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "944999999", refundPhone: "987654321" });

    expect(fields().phone.value).toBe("944999999");
    expect(fields().refundPhone.value).toBe("987654321");

    await user.click(fields().submit);
    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    expect(lastPayload().get("phone")).toBe("944999999");
    expect(lastPayload().get("refundPhone")).toBe("987654321");
  });

  it.each([
    ["espacios", "944 999 999"],
    ["guiones", "944-999-999"],
    ["paréntesis", "(944) 999 999"],
    ["paréntesis y guion", "(944)999-999"],
  ])("acepta un WhatsApp con %s y envía el número limpio", async (_caso, typed) => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: typed, refundPhone: typed });

    // El input conserva lo que la persona escribió; la limpieza es solo interna.
    expect(fields().phone.value).toBe(typed);
    expect(screen.queryByText(PREDICTION_MESSAGES.phoneInvalid)).toBeNull();

    await user.click(fields().submit);
    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    expect(lastPayload().get("phone")).toBe("944999999");
    expect(lastPayload().get("refundPhone")).toBe("944999999");
  });

  it.each([
    ["8 dígitos", "94499999"],
    ["10 dígitos", "9449999999"],
    ["10 dígitos con guiones", "944-999-9999"],
    ["no empieza en 9", "844999999"],
    ["letras", "abcdefghi"],
    ["dígitos y letras", "94499999a"],
    ["prefijo internacional", "+51944999999"],
    ["prefijo internacional con espacios", "+51 944 999 999"],
    ["puntos como separador", "944.999.999"],
  ])("WhatsApp con %s se conserva tal cual y recibe el mensaje de formato", async (_caso, typed) => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: typed });

    // Nada se recortó ni se limpió por detrás.
    expect(fields().phone.value).toBe(typed);

    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.phoneInvalid);
    expect(createPrediction).not.toHaveBeenCalled();
    expect(fields().phone.value).toBe(typed);
    expect(container.querySelector("#phone")?.getAttribute("aria-invalid")).toBe("true");
  });

  it.each([
    ["8 dígitos", "94499999"],
    ["10 dígitos", "9449999999"],
    ["10 dígitos con guiones", "944-999-9999"],
    ["no empieza en 9", "844999999"],
    ["letras", "abcdefghi"],
    ["prefijo internacional", "+51944999999"],
  ])("devolución con %s se conserva tal cual y recibe su propio mensaje", async (_caso, typed) => {
    const { user, container } = setup();
    await fillForm(user, container, { refundPhone: typed });

    expect(fields().refundPhone.value).toBe(typed);

    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.refundInvalid);
    expect(createPrediction).not.toHaveBeenCalled();
    expect(fields().refundPhone.value).toBe(typed);
  });

  it("un número de 10 dígitos nunca se convierte en uno válido de 9", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "9449999999" });

    const value = fields().phone.value;
    expect(value).toBe("9449999999");
    expect(value).not.toBe("944999999");
    expect(value.length).toBe(10);

    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.phoneInvalid);
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it.each([
    ["WhatsApp", "#phone"],
    ["devolución", "#refundPhone"],
  ])("pegar un número demasiado largo en %s no lo recorta a uno aparentemente válido", async (_campo, selector) => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "", refundPhone: "" });

    const input = container.querySelector(selector) as HTMLInputElement;
    await user.click(input);
    await user.paste("944999999123456");

    expect(input.value).not.toBe("944999999");
    expect(input.value.length).toBeGreaterThan(9);
    expect(input.value.startsWith("944999999")).toBe(true);

    await user.click(fields().submit);
    await screen.findByText(selector === "#phone" ? PREDICTION_MESSAGES.phoneInvalid : PREDICTION_MESSAGES.refundInvalid);
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("un pegado válido de 9 dígitos sí se acepta", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "" });

    await user.click(fields().phone);
    await user.paste("944999999");
    expect(fields().phone.value).toBe("944999999");

    await user.click(fields().submit);
    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    expect(lastPayload().get("phone")).toBe("944999999");
  });

  it.each([
    ["944 999 999"],
    ["944-999-999"],
    ["(944) 999 999"],
  ])("pegar %s se acepta y viaja limpio en el payload", async (pasted) => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "", refundPhone: "" });

    await user.click(fields().phone);
    await user.paste(pasted);
    await user.click(fields().refundPhone);
    await user.paste(pasted);

    expect(fields().phone.value).toBe(pasted);
    expect(fields().refundPhone.value).toBe(pasted);

    await user.click(fields().submit);
    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    expect(lastPayload().get("phone")).toBe("944999999");
    expect(lastPayload().get("refundPhone")).toBe("944999999");
  });

  it.each([
    ["944-999-9999"],
    ["+51 944 999 999"],
    ["(944) 999 9999"],
  ])("pegar %s sigue siendo inválido pese a los separadores", async (pasted) => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "" });

    await user.click(fields().phone);
    await user.paste(pasted);
    expect(fields().phone.value).toBe(pasted);

    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.phoneInvalid);
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("solo espacios se trata como campo vacío, no como formato inválido", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { phone: "   ", refundPhone: "   " });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.phoneRequired);
    expect(screen.getByText(PREDICTION_MESSAGES.refundRequired)).toBeTruthy();
    expect(createPrediction).not.toHaveBeenCalled();
  });
});

describe("4. nombre", () => {
  it("pide el nombre cuando está vacío sin borrar nada más", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { name: "" });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.nameRequired);
    expect(currentValues()).toMatchObject({ amount: "10", phone: "944999999", refundPhone: "944999999", rules: true, receipt: true });
  });

  it("acepta nombres con tildes y compuestos", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { name: "José Luis Pérez" });
    await user.click(fields().submit);

    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    expect(lastPayload().get("name")).toBe("José Luis Pérez");
  });

  it("trata los espacios en blanco como vacío", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { name: "   " });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.nameRequired);
    expect(createPrediction).not.toHaveBeenCalled();
  });
});

describe("5. comprobante", () => {
  it("sin comprobante pide subirlo y conserva todo lo demás", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { receipt: null });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.receiptRequired);
    expect(createPrediction).not.toHaveBeenCalled();
    expect(currentValues()).toMatchObject({ amount: "10", name: "Jose Luis", phone: "944999999", refundPhone: "944999999", rules: true });
  });

  it.each([
    ["PNG", validPngReceipt],
    ["JPG", validJpgReceipt],
    ["WEBP", validWebpReceipt],
  ])("acepta un comprobante %s y lo envía en el payload", async (_formato, makeFile) => {
    const { user, container } = setup();
    const file = makeFile();
    await fillForm(user, container, { receipt: file });

    expect(previewVisible()).toBe(true);
    expect(screen.queryByText(PREDICTION_MESSAGES.receiptRequired)).toBeNull();

    await user.click(fields().submit);
    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    const sent = lastPayload().get("receipt") as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.name).toBe(file.name);
    expect(sent.type).toBe(file.type);
    expect(sent.size).toBe(file.size);
  });

  it.each([
    ["PDF", pdfReceipt],
    ["TXT", txtReceipt],
  ])("rechaza un archivo %s con el mensaje de formato", async (_formato, makeFile) => {
    // applyAccept:false simula a quien elige "todos los archivos" en el selector nativo.
    const { user, container } = setup({ applyAccept: false });
    await fillForm(user, container, { receipt: makeFile() });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.receiptType);
    expect(createPrediction).not.toHaveBeenCalled();
    expect(currentValues()).toMatchObject({ name: "Jose Luis", rules: true });
  });

  it("rechaza un archivo por encima del máximo permitido", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { receipt: oversizedReceipt(6) });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.receiptSize(5));
    expect(createPrediction).not.toHaveBeenCalled();
  });

  it("mantiene el archivo real en el segundo intento tras un error de otro campo", async () => {
    const { user, container } = setup();
    const file = validPngReceipt();
    await fillForm(user, container, { name: "", receipt: file });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.nameRequired);
    expect(previewVisible()).toBe(true);
    expect(createPrediction).not.toHaveBeenCalled();

    await user.type(fields().name, "Jose Luis");
    await user.click(fields().submit);

    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    const sent = lastPayload().get("receipt") as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.size).toBe(file.size);
    expect(sent.name).toBe("comprobante-test.png");
  });

  it("permite quitar el comprobante y volver a exigirlo", async () => {
    const { user, container } = setup();
    await fillForm(user, container);
    expect(previewVisible()).toBe(true);

    await user.click(screen.getByRole("button", { name: "Eliminar comprobante" }));
    expect(previewVisible()).toBe(false);

    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.receiptRequired);
  });
});

describe("6. checkbox de reglas", () => {
  it("exige aceptar las reglas y conserva el resto", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { rules: false });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.acceptedRules);
    expect(createPrediction).not.toHaveBeenCalled();
    expect(currentValues()).toMatchObject({ amount: "10", name: "Jose Luis", phone: "944999999", refundPhone: "944999999", receipt: true });
  });

  it("no queda desincronizado entre el estado y lo que se ve", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { rules: false });
    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.acceptedRules);

    await user.click(fields().rules);
    expect(fields().rules.checked).toBe(true);

    await user.click(fields().submit);
    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    expect(lastPayload().get("acceptedRules")).toBe("on");
    // Tras el envío el checkbox debe seguir viéndose marcado.
    expect(fields().rules.checked).toBe(true);
  });
});

describe("7. escenario crítico: falta solo el nombre", () => {
  it("señala el nombre, enfoca, hace scroll y no pierde ningún otro dato", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { amount: "10", name: "", phone: "944999999", refundPhone: "944999999" });

    const before = currentValues();
    await user.click(fields().submit);
    await screen.findByText(PREDICTION_MESSAGES.nameRequired);

    expect(createPrediction).not.toHaveBeenCalled();
    expect(container.querySelector("#name")?.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector("#name")));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    expect(currentValues()).toEqual({ ...before, name: "" });
    expect(screen.getByRole("button", { name: /Alianza Lima/ }).getAttribute("aria-pressed")).toBe("true");
    expect(previewVisible()).toBe(true);

    await user.type(fields().name, "Jose Luis");
    await user.click(fields().submit);

    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    const payload = lastPayload();
    expect(payload.get("name")).toBe("Jose Luis");
    expect(payload.get("amount")).toBe("10");
    expect(payload.get("phone")).toBe("944999999");
    expect(payload.get("refundPhone")).toBe("944999999");
    expect(payload.get("teamSelected")).toBe("TEAM_A");
    expect(payload.get("receipt")).toBeInstanceOf(File);
  });
});

describe("8. formulario completamente vacío", () => {
  it("muestra los seis errores a la vez más el resumen", async () => {
    const { user, container } = setup();
    await user.click(screen.getByRole("button", { name: /Alianza Lima/ }));
    await user.clear(fields().amount);
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.amountRequired);
    for (const message of [
      PREDICTION_MESSAGES.amountRequired,
      PREDICTION_MESSAGES.nameRequired,
      PREDICTION_MESSAGES.phoneRequired,
      PREDICTION_MESSAGES.refundRequired,
      PREDICTION_MESSAGES.receiptRequired,
      PREDICTION_MESSAGES.acceptedRules,
    ]) {
      expect(screen.getByText(message), `falta el mensaje: ${message}`).toBeTruthy();
    }
    expect(screen.getByText(PREDICTION_MESSAGES.summary)).toBeTruthy();
    expect(createPrediction).not.toHaveBeenCalled();

    for (const id of ["#amount", "#name", "#phone", "#refundPhone"]) {
      expect(container.querySelector(id)?.getAttribute("aria-invalid"), id).toBe("true");
    }
  });
});

describe("9 y 10. errores del backend", () => {
  it.each([
    ["evento cerrado", friendlyRpcState({ message: "EVENT_CLOSED" }, 10), PREDICTION_ERRORS.registrationClosed],
    ["límite de riesgo", friendlyRpcState({ message: "RISK_LIMIT" }, 10), PREDICTION_ERRORS.riskLimit],
    ["demasiados intentos", friendlyRpcState({ message: "RATE_LIMIT" }, 10), PREDICTION_ERRORS.tooManyAttempts],
    ["fallo al subir", { error: PREDICTION_ERRORS.uploadFailed }, PREDICTION_ERRORS.uploadFailed],
    ["error inesperado", friendlyRpcState({ message: "boom" }, 10), PREDICTION_ERRORS.retry],
  ])("con %s muestra el mensaje amigable y conserva todo", async (_caso, response, expected) => {
    createPrediction.mockResolvedValue(response);
    const { user, container } = setup();
    await fillForm(user, container);
    await user.click(fields().submit);

    await screen.findByText(expected);
    expect(currentValues()).toMatchObject({ amount: "10", name: "Jose Luis", phone: "944999999", refundPhone: "944999999", rules: true, receipt: true });
  });

  it("un BELOW_MINIMUM del servidor aterriza en el campo monto", async () => {
    createPrediction.mockResolvedValue(friendlyRpcState({ message: "BELOW_MINIMUM" }, 10));
    const { user, container } = setup();
    await fillForm(user, container);
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.amountMin(10));
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector("#amount")));
  });

  it("no filtra nada técnico de un error con datos internos", async () => {
    const leaky = {
      message: "relation public.predictions does not exist; SUPABASE_SERVICE_ROLE_KEY=secret_test_123",
      code: "42P01",
      details: "at pg_catalog.pg_class",
      hint: "check search_path",
    };
    createPrediction.mockResolvedValue(friendlyRpcState(leaky, 10));
    const { user, container } = setup();
    await fillForm(user, container);
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_ERRORS.retry);
    const visible = document.body.textContent ?? "";
    for (const secret of ["SUPABASE_SERVICE_ROLE_KEY", "secret_test_123", "42P01", "pg_catalog", "search_path", "public.predictions", "relation"]) {
      expect(visible, `se filtró: ${secret}`).not.toContain(secret);
    }
  });
});

describe("11. envío exitoso mockeado", () => {
  it("manda exactamente los datos esperados una sola vez", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { name: "Jose Luis", amount: "10", phone: "944999999", refundPhone: "944999999" });
    await user.click(fields().submit);

    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(1));
    const payload = lastPayload();
    expect(payload.get("teamSelected")).toBe("TEAM_A");
    expect(payload.get("amount")).toBe("10");
    expect(payload.get("name")).toBe("Jose Luis");
    expect(payload.get("phone")).toBe("944999999");
    expect(payload.get("refundPhone")).toBe("944999999");
    expect(payload.get("acceptedRules")).toBe("on");
    expect(payload.get("eventId")).toBe(event.id);
    expect(payload.get("website")).toBe("");
    expect(String(payload.get("idempotencyKey"))).toMatch(/^[0-9a-f-]{36}$/i);
    const receipt = payload.get("receipt") as File;
    expect(receipt).toBeInstanceOf(File);
    expect(receipt.type).toBe("image/png");
    expect(receipt.size).toBeGreaterThan(0);
  });

  it("un doble clic rápido no dispara dos envíos", async () => {
    let release: (value: unknown) => void = () => {};
    createPrediction.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const { user, container } = setup();
    await fillForm(user, container);
    const submit = fields().submit;

    await user.dblClick(submit);
    expect(createPrediction).toHaveBeenCalledTimes(1);
    expect(fields().submit.disabled).toBe(true);

    release({ error: PREDICTION_ERRORS.retry });
    await screen.findByText(PREDICTION_ERRORS.retry);
    expect(createPrediction).toHaveBeenCalledTimes(1);
  });

  it("tres clics en el mismo tick, sin render intermedio, siguen siendo un envío", async () => {
    let release: (value: unknown) => void = () => {};
    createPrediction.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const { user, container } = setup();
    await fillForm(user, container);
    const submit = fields().submit;

    // fireEvent no espera al re-render: es el peor caso posible para el botón.
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(createPrediction).toHaveBeenCalled());
    expect(createPrediction).toHaveBeenCalledTimes(1);

    release({ error: PREDICTION_ERRORS.retry });
    await screen.findByText(PREDICTION_ERRORS.retry);
    // Los clics sobrantes no quedan encolados esperando a que resuelva el primero.
    expect(createPrediction).toHaveBeenCalledTimes(1);
  });
});

describe("12. reintento tras un error temporal", () => {
  it("conserva todo y reutiliza la misma clave de idempotencia", async () => {
    createPrediction.mockResolvedValue({ error: PREDICTION_ERRORS.retry });
    const { user, container } = setup();
    await fillForm(user, container);

    await user.click(fields().submit);
    await screen.findByText(PREDICTION_ERRORS.retry);
    expect(createPrediction).toHaveBeenCalledTimes(1);
    expect(currentValues()).toMatchObject({ amount: "10", name: "Jose Luis", phone: "944999999", refundPhone: "944999999", rules: true, receipt: true });

    createPrediction.mockResolvedValue({});
    await user.click(fields().submit);
    await waitFor(() => expect(createPrediction).toHaveBeenCalledTimes(2));

    const first = createPrediction.mock.calls[0][1] as FormData;
    const second = createPrediction.mock.calls[1][1] as FormData;
    expect(second.get("idempotencyKey")).toBe(first.get("idempotencyKey"));
    expect(second.get("name")).toBe("Jose Luis");
    expect(second.get("amount")).toBe("10");
    expect((second.get("receipt") as File).size).toBe((first.get("receipt") as File).size);
  });
});

describe("13. foco y scroll", () => {
  it("va al primer campo inválido en orden visual", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { amount: "", name: "", phone: "" });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.amountRequired);
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector("#amount")));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("baja al nombre cuando el monto ya es válido", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { name: "", phone: "" });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.nameRequired);
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector("#name")));
  });

  it("enfoca el grupo del comprobante cuando es lo único que falta", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { receipt: null });
    await user.click(fields().submit);

    await screen.findByText(PREDICTION_MESSAGES.receiptRequired);
    await waitFor(() => expect(document.activeElement).toBe(receiptInput(container).parentElement));
  });

  it("lleva al resumen cuando el error es global", async () => {
    createPrediction.mockResolvedValue({ error: PREDICTION_ERRORS.registrationClosed });
    const { user, container } = setup();
    await fillForm(user, container);
    await user.click(fields().submit);

    const alert = await screen.findByText(PREDICTION_ERRORS.registrationClosed);
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });
});

describe("14. botón registrar", () => {
  it("sigue habilitado con el formulario incompleto", async () => {
    const { user, container } = setup();
    await fillForm(user, container, { name: "", rules: false, receipt: null });
    expect(fields().submit.disabled).toBe(false);
  });

  it("se deshabilita durante el envío y se rehabilita tras el error", async () => {
    let release: (value: unknown) => void = () => {};
    createPrediction.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    const { user, container } = setup();
    await fillForm(user, container);
    expect(fields().submit.disabled).toBe(false);

    await user.click(fields().submit);
    await waitFor(() => expect(fields().submit.disabled).toBe(true));
    expect(fields().submit.textContent).toContain("Registrando");

    release({ error: PREDICTION_ERRORS.retry });
    await screen.findByText(PREDICTION_ERRORS.retry);
    await waitFor(() => expect(fields().submit.disabled).toBe(false));
    expect(fields().submit.textContent).toContain("Registrar participación");
  });
});
