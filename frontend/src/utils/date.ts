// Returns YYYY-MM-DD for a Date using LOCAL calendar fields.
// Date.toISOString() converts to UTC first, which shifts the date backward
// for any timezone ahead of UTC (e.g. IST, UTC+5:30) — never use it for
// date-only values.
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
