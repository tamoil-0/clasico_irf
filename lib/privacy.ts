export function maskParticipantName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts[0]} ${Array.from(parts[1])[0]?.toUpperCase() ?? ""}.`;
}
