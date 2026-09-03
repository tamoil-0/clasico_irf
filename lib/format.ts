export const soles = (value: number | null | undefined) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(value ?? 0);

export function formatMatch(date: string, time: string) {
  const value = new Date(`${date}T${time}:00-05:00`);
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Lima",
  }).format(value);
}
