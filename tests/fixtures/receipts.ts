import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Los comprobantes de prueba son archivos reales generados a 500x300 px con el
 * texto "COMPROBANTE DE PRUEBA / Monto: S/ 10 / NO VÁLIDO - TEST". No contienen
 * datos personales y nunca se suben a Supabase: los tests mockean la acción.
 */
export const FIXTURE_FILES = {
  png: "comprobante-test.png",
  jpg: "comprobante-test.jpg",
  webp: "comprobante-test.webp",
  pdf: "comprobante-invalido.pdf",
  txt: "comprobante-invalido.txt",
} as const;

function loadFixture(fileName: string, type: string): File {
  const bytes = new Uint8Array(readFileSync(path.join(FIXTURES_DIR, fileName)));
  return new File([bytes], fileName, { type });
}

export const validPngReceipt = () => loadFixture(FIXTURE_FILES.png, "image/png");
export const validJpgReceipt = () => loadFixture(FIXTURE_FILES.jpg, "image/jpeg");
export const validWebpReceipt = () => loadFixture(FIXTURE_FILES.webp, "image/webp");
export const pdfReceipt = () => loadFixture(FIXTURE_FILES.pdf, "application/pdf");
export const txtReceipt = () => loadFixture(FIXTURE_FILES.txt, "text/plain");

/** PNG con extensión y firma correctas pero con contenido inflado sobre el tope. */
export function oversizedReceipt(megabytes = 6): File {
  const header = new Uint8Array(readFileSync(path.join(FIXTURES_DIR, FIXTURE_FILES.png)));
  const padding = new Uint8Array(megabytes * 1024 * 1024);
  return new File([header, padding], "comprobante-grande.png", { type: "image/png" });
}

/** PNG por el nombre y el tipo, pero con bytes que no son una imagen. */
export const disguisedReceipt = () => new File([new TextEncoder().encode("no soy una imagen")], "falso.png", { type: "image/png" });
