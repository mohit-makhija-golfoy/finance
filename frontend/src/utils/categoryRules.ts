export type CategoryRuleLike = {
  keyword: string;
  category: string;
  category_type: "income" | "expense";
  tag_ids: string[];
};

// Common noise tokens that show up in bank statement narrations and shouldn't
// ever be guessed as "the merchant" — transaction-type markers, rail names,
// and common bank name fragments. Best-effort, not exhaustive.
const NOISE_WORDS = new Set([
  "upi", "dr", "cr", "ref", "txn", "neft", "imps", "rtgs", "bank", "the",
  "hdfc", "icici", "sbi", "axis", "kotak", "pnb", "yesb", "yes", "indusind",
  "idbi", "federal", "baroda", "canara", "union", "idfc", "first",
]);

/**
 * Best-effort guess at a merchant keyword from a transaction's notes, used to
 * prefill the "apply to all" rule keyword field for the user to confirm/edit —
 * this is not meant to be perfect.
 */
export function guessKeyword(notes: string): string {
  const raw = notes || "";
  const sepIndex = raw.indexOf(" • ");
  const withoutBankPrefix = sepIndex >= 0 ? raw.slice(sepIndex + 3) : raw;

  const words = withoutBankPrefix
    .split(/[^a-zA-Z]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !NOISE_WORDS.has(w.toLowerCase()));

  if (words.length === 0) return "";

  const longest = words.reduce((best, w) => (w.length > best.length ? w : best), words[0]);
  return longest.charAt(0).toUpperCase() + longest.slice(1).toLowerCase();
}

/**
 * A rule's keyword can be a comma-separated list (e.g. "Mohit, 77981"), in
 * which case ALL parts must appear in the notes for it to match — not just
 * one. This splits and normalizes those parts.
 */
export function splitKeywords(raw: string): string[] {
  return (raw || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * True when every comma-separated part of `keyword` is a case-insensitive
 * substring of `notes`. A single-keyword rule (no comma) behaves exactly as
 * a plain substring match.
 */
export function notesMatchKeyword(notes: string, keyword: string): boolean {
  const haystack = (notes || "").toLowerCase();
  const parts = splitKeywords(keyword);
  if (parts.length === 0) return false;
  return parts.every((part) => haystack.includes(part.toLowerCase()));
}

/**
 * Matches each rule's keyword (comma-separated parts all required) against
 * notes, scoped to the transaction's type. When multiple rules match, the
 * one with the longest keyword wins (more specific beats generic).
 */
export function matchCategoryRule<T extends CategoryRuleLike>(
  rules: T[],
  notes: string,
  type: "income" | "expense"
): T | null {
  let best: T | null = null;
  for (const rule of rules) {
    if (rule.category_type !== type) continue;
    if (!rule.keyword) continue;
    if (!notesMatchKeyword(notes, rule.keyword)) continue;
    if (!best || rule.keyword.length > best.keyword.length) best = rule;
  }
  return best;
}
