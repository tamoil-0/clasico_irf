export const soles = (value: number | null | undefined) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(value ?? 0);

export function formatMatch(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);

  const weekdays = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];

  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "setiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  const weekday = weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];

  const [hourRaw, minute = "00"] = time.split(":");
  const hour24 = Number(hourRaw);

  const period = hour24 >= 12 ? "p. m." : "a. m.";
  const hour12 = hour24 % 12 || 12;

  return `${weekday}, ${day} de ${months[month - 1]}, ${hour12}:${minute} ${period}`;
}