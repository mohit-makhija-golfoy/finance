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

// Formats a YYYY-MM-DD (or any date-parsable) string as "January 10, 2024".
export function formatLongDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Formats a precise ISO timestamp (e.g. created_at) as "January 10, 2024, 03:45 PM".
export function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
