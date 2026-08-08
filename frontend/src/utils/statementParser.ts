import type { ParsedStatementResult, StatementEntry, StatementFilterOptions } from "@/src/types/statement";

const DATE_AT_START = /^\s*(\d{1,2}[\/\-. ](\d{1,2}|[A-Za-z]{3,9})[\/\-. ]\d{2,4})/;
// Matches a WHOLE whitespace-delimited word only (anchored start/end), never a
// substring — a reference number like "127223915055" or a UPI handle like
// "paytmqr2" must never look like an amount just because it contains digits.
// Up to 9 integer digits (with or without comma grouping) comfortably covers
// real amounts while still rejecting long reference-number-only words.
const AMOUNT_WORD = /^\d{1,9}(?:,\d{2,3})*(?:\.\d{1,2})?$/;
const DRCR_WORD = /^(dr|cr)\.?$/i;
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function normalizeAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹\s]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  const numeric = trimmed.match(/^(\d{1,2})[\/\-. ](\d{1,2})[\/\-. ](\d{2,4})$/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const withMonthName = trimmed.match(/^(\d{1,2})[\/\-. ]([A-Za-z]{3,9})[\/\-. ](\d{2,4})$/);
  if (withMonthName) {
    const day = Number(withMonthName[1]);
    const monthKey = withMonthName[2].slice(0, 3).toLowerCase();
    const month = MONTHS[monthKey];
    let year = Number(withMonthName[3]);
    if (!month) return null;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

export function isHeaderOrFooterLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return true;
  if (/^page\s+\d+\s+of\s+\d+/i.test(lower)) return true;
  if (/^date\s*:\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/i.test(lower) && lower.includes("page")) return true;
  if (/statement\s+(of|for)\s+account/i.test(lower)) return true;
  if (/opening balance|closing balance|\bb\/f\b|\bc\/f\b/i.test(lower)) return true;
  if (/^[●○•*]/.test(lower)) return true; // disclaimer / bullet-point footer notes
  if (/^\*+.*\*+$/.test(lower)) return true; // "***Generated through ...***" footer banners
  const hasDateWord = lower.includes("date");
  const hasDescWord = lower.includes("narration") || lower.includes("description") || lower.includes("particulars") || lower.includes("remarks");
  const hasDebitWord = lower.includes("debit") || lower.includes("withdrawal") || lower.includes("amount");
  const hasBalanceWord = lower.includes("balance");
  if (hasDateWord && hasDescWord && hasDebitWord && hasBalanceWord) return true;
  return false;
}

type ColumnGuess = { debit: number | null; credit: number | null; balance: number | null };

// Bank statements render their numeric columns either right after the date
// ("Date Amount Type Balance Remarks...", e.g. PNB) or at the end of the line
// ("Date Remarks... Debit Credit Balance", e.g. HDFC/ICICI-style). Try leading
// first since it's unambiguous when it matches; fall back to trailing.
function extractLeadingColumns(words: string[]): { guess: ColumnGuess; consumed: number } | null {
  if (!AMOUNT_WORD.test(words[0] || "")) return null;

  let idx = 1;
  const amount = normalizeAmount(words[0]);
  let drcr: "dr" | "cr" | null = null;
  if (DRCR_WORD.test(words[idx] || "")) {
    drcr = words[idx].toLowerCase().startsWith("cr") ? "cr" : "dr";
    idx += 1;
  }
  let balance: number | null = null;
  if (AMOUNT_WORD.test(words[idx] || "")) {
    balance = normalizeAmount(words[idx]);
    idx += 1;
  }

  // No Dr/Cr marker found: default to debit (documented best-effort assumption).
  const guess: ColumnGuess = drcr === "cr" ? { debit: null, credit: amount, balance } : { debit: amount, credit: null, balance };

  return { guess, consumed: idx };
}

function extractTrailingColumns(words: string[]): { guess: ColumnGuess; trailingCount: number } | null {
  let trailingCount = 0;
  for (let i = words.length - 1; i >= 0 && trailingCount < 3; i--) {
    if (!AMOUNT_WORD.test(words[i])) break;
    trailingCount += 1;
  }
  if (trailingCount === 0) return null;

  const trailingWords = words.slice(words.length - trailingCount);
  if (trailingCount >= 3) {
    const [debitRaw, creditRaw, balanceRaw] = trailingWords.slice(-3);
    return { guess: { debit: normalizeAmount(debitRaw), credit: normalizeAmount(creditRaw), balance: normalizeAmount(balanceRaw) }, trailingCount };
  }
  if (trailingCount === 2) {
    const [amountRaw, balanceRaw] = trailingWords;
    const amount = normalizeAmount(amountRaw);
    const balance = normalizeAmount(balanceRaw);
    const isCredit = words.some((w) => /^cr\.?$/i.test(w));
    const isDebit = words.some((w) => /^dr\.?$/i.test(w));
    if (isCredit) return { guess: { debit: null, credit: amount, balance }, trailingCount };
    return { guess: { debit: amount, credit: null, balance }, trailingCount }; // ambiguous: default to debit
  }
  return null;
}

export function parseRow(line: string, page: number): StatementEntry | { continuation: true } | null {
  const dateMatch = line.match(DATE_AT_START);
  if (!dateMatch) return { continuation: true };

  const rawDate = dateMatch[1];
  const date = normalizeDate(rawDate);
  if (!date) return { continuation: true };

  const rest = line.slice(dateMatch[0].length).trim();
  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { continuation: true };

  const leading = extractLeadingColumns(words);
  let debit: number | null;
  let credit: number | null;
  let balance: number | null;
  let description: string;

  if (leading) {
    ({ debit, credit, balance } = leading.guess);
    description = words.slice(leading.consumed).join(" ");
  } else {
    const trailing = extractTrailingColumns(words);
    // A line with a real leading date but no extractable amount at all is a
    // genuinely unparseable row (not a wrapped continuation) — count it as
    // skipped rather than silently merging it into the previous entry.
    if (!trailing) return null;
    ({ debit, credit, balance } = trailing.guess);
    description = words.slice(0, words.length - trailing.trailingCount).join(" ");
  }

  const hasDebit = typeof debit === "number" && debit > 0;
  const hasCredit = typeof credit === "number" && credit > 0;
  if (!hasDebit && !hasCredit) return null;

  const direction: "debit" | "credit" = hasCredit && !hasDebit ? "credit" : "debit";
  const amount = direction === "credit" ? (credit as number) : (debit as number);

  return {
    id: generateId(),
    date,
    rawDate,
    description: description || "Statement entry",
    debit: hasDebit ? debit : null,
    credit: hasCredit ? credit : null,
    balance,
    direction,
    amount,
    page,
  };
}

export function splitIntoCandidateRows(pageText: string): string[] {
  return pageText.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function parseStatementPages(pages: string[]): ParsedStatementResult {
  const entries: StatementEntry[] = [];
  let unparseableCount = 0;

  pages.forEach((pageText, pageIndex) => {
    const lines = splitIntoCandidateRows(pageText);
    let prevEntry: StatementEntry | null = null;
    // Once a header/footer/disclaimer line is seen, its wrapped continuation
    // lines (which don't themselves match isHeaderOrFooterLine) must not get
    // glued onto the previous transaction's description — swallow them until
    // the next real dated row resets this.
    let inFooterBlock = false;

    for (const line of lines) {
      if (isHeaderOrFooterLine(line)) {
        inFooterBlock = true;
        continue;
      }

      const result = parseRow(line, pageIndex + 1);
      if (result === null) {
        unparseableCount += 1;
        prevEntry = null;
        inFooterBlock = false;
        continue;
      }
      if ("continuation" in result) {
        if (inFooterBlock) continue;
        if (prevEntry) {
          prevEntry.description = `${prevEntry.description} ${line}`.trim();
        }
        continue;
      }
      entries.push(result);
      prevEntry = result;
      inFooterBlock = false;
    }
  });

  const warnings: string[] = [];
  if (unparseableCount > 0) {
    warnings.push(`${unparseableCount} line${unparseableCount === 1 ? "" : "s"} couldn't be parsed and were skipped.`);
  }

  return {
    entries,
    warnings,
    pageCount: pages.length,
    rawTextLength: pages.join("").length,
  };
}

export function filterEntries(entries: StatementEntry[], opts: StatementFilterOptions): StatementEntry[] {
  return entries.filter((e) => {
    if (e.direction === "credit" && !opts.includeCredit) return false;
    if (e.direction === "debit" && !opts.includeDebit) return false;
    if (opts.dateFrom && e.date < opts.dateFrom) return false;
    if (opts.dateTo && e.date > opts.dateTo) return false;
    return true;
  });
}
