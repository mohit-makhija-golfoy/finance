export type LoanComputeInput = {
  total_amount?: number | null;
  interest_rate?: number | null; // annual %, flat (simple interest on the original principal)
  emi?: number | null;
  tenure_months?: number | null;
  total_payable?: number | null;
  start_date?: string | null;
};

export type LoanComputeResult = {
  total_amount?: number;
  interest_rate?: number;
  emi?: number;
  tenure_months?: number;
  total_payable?: number;
  end_date?: string;
  extra_interest?: number;
};

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setMonth(d.getMonth() + Math.round(months));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const isPositive = (v?: number): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isNonNegative = (v?: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Fills in whatever loan fields are derivable from whichever subset the user
 * has already typed, using a flat (simple-interest) model — the everyday
 * expectation for a personal/family loan tracker, rather than a bank's
 * reducing-balance amortization:
 *   1) total_payable = emi * tenure_months
 *   2) total_payable = principal * (1 + rate% * tenure_months / 1200)
 * Both are linear, so every combo below is exact (no numeric solving).
 * Iterates to a fixed point since deriving one field can unlock another.
 */
export function computeLoanFields(input: LoanComputeInput): LoanComputeResult {
  let p = input.total_amount ?? undefined;
  let rate = input.interest_rate ?? undefined;
  let emi = input.emi ?? undefined;
  let n = input.tenure_months ?? undefined;
  let totalPayable = input.total_payable ?? undefined;

  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    if (!isPositive(totalPayable) && isPositive(emi) && isPositive(n)) {
      totalPayable = emi * n;
      changed = true;
    }
    if (!isPositive(emi) && isPositive(totalPayable) && isPositive(n)) {
      emi = totalPayable / n;
      changed = true;
    }
    if (!isPositive(n) && isPositive(totalPayable) && isPositive(emi)) {
      n = Math.round(totalPayable / emi);
      changed = true;
    }

    if (!isPositive(totalPayable) && isPositive(p) && isNonNegative(rate) && isPositive(n)) {
      totalPayable = p * (1 + (rate * n) / 1200);
      changed = true;
    }
    if (!isPositive(p) && isPositive(totalPayable) && isNonNegative(rate) && isPositive(n)) {
      p = totalPayable / (1 + (rate * n) / 1200);
      changed = true;
    }
    if (!isNonNegative(rate) && isPositive(p) && isPositive(totalPayable) && isPositive(n)) {
      rate = ((totalPayable / p - 1) * 1200) / n;
      if (rate >= 0) changed = true;
      else rate = undefined;
    }
    if (!isPositive(n) && isPositive(p) && isPositive(rate) && isPositive(totalPayable)) {
      const solved = ((totalPayable / p - 1) * 1200) / rate;
      if (solved > 0) {
        n = Math.round(solved);
        changed = true;
      }
    }
    // Principal + rate + EMI, with tenure itself the unknown: totalPayable
    // can't be derived first (it needs tenure too), so solve the combined
    // equation EMI = P/n + P*rate/1200 directly for n.
    if (!isPositive(n) && isPositive(p) && isNonNegative(rate) && isPositive(emi)) {
      const denom = emi - (p * rate) / 1200;
      if (denom > 0) {
        n = Math.round(p / denom);
        changed = true;
      }
    }

    if (!changed) break;
  }

  const result: LoanComputeResult = {};
  if (isPositive(p)) result.total_amount = Math.round(p * 100) / 100;
  if (isNonNegative(rate)) result.interest_rate = Math.round(rate * 100) / 100;
  if (isPositive(emi)) result.emi = Math.round(emi * 100) / 100;
  if (isPositive(n)) result.tenure_months = Math.round(n);
  if (isPositive(totalPayable)) result.total_payable = Math.round(totalPayable * 100) / 100;

  if (result.tenure_months && input.start_date) {
    result.end_date = addMonths(input.start_date, result.tenure_months);
  }

  // If the user typed an explicit total_payable that's higher than what the
  // computed EMI/tenure implies, surface the difference as extra interest
  // (e.g. a manually agreed lump sum on top of the plain schedule).
  if (isPositive(input.total_payable ?? undefined) && result.emi && result.tenure_months) {
    const implied = result.emi * result.tenure_months;
    const extra = (input.total_payable as number) - implied;
    if (extra > 1) result.extra_interest = Math.round(extra);
  }

  return result;
}
