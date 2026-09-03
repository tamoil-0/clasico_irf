export const TEAM_ASSETS_BUCKET = "team-assets";
export const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const MAX_LOGO_MB = 2;

const PUBLIC_OBJECT_PREFIX = "/storage/v1/object/public/";

/**
 * Devuelve la ruta dentro del bucket administrado si la URL pertenece a él.
 * Sirve para no intentar borrar assets locales (/teams/*.svg) ni URLs externas
 * que un admin haya pegado a mano en el formulario del evento.
 */
export function managedTeamAssetPath(value: string | null | undefined): string | null {
  if (!value) return null;
  let pathname: string;
  try {
    pathname = new URL(value).pathname;
  } catch {
    return null;
  }
  const prefix = `${PUBLIC_OBJECT_PREFIX}${TEAM_ASSETS_BUCKET}/`;
  if (!pathname.startsWith(prefix)) return null;
  const path = decodeURIComponent(pathname.slice(prefix.length));
  return path.length > 0 && !path.includes("..") ? path : null;
}
