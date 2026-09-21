function calendarYearsBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const daysInEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  months += (end.getDate() - start.getDate()) / daysInEndMonth;
  return months / 12;
}

export function formatDuration(startDate?: string | null, maturityDate?: string | null): string | null {
  if (!startDate || !maturityDate) return null;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${maturityDate}T00:00:00`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 3600 * 1000));
  if (diffDays <= 0) return null;

  const years = diffDays / 365.25;
  if (Math.abs(years - Math.round(years)) < 0.02 && Math.round(years) > 0) {
    const y = Math.round(years);
    return `${y} year${y === 1 ? "" : "s"}`;
  }

  const months = diffDays / 30.437;
  if (Math.abs(months - Math.round(months)) < 0.05 && Math.round(months) > 0) {
    const m = Math.round(months);
    return `${m} month${m === 1 ? "" : "s"}`;
  }

  return `${diffDays} day${diffDays === 1 ? "" : "s"}`;
}

export function projectedMaturity(inv: {
  total_invested?: number;
  amount?: number;
  start_date?: string;
  maturity_date?: string | null;
  expected_return?: number | null;
  expected_return_type?: "percent" | "amount" | null;
}) {
  const invested = inv.total_invested || inv.amount || 0;
  const startD = inv.start_date ? new Date(`${inv.start_date}T00:00:00`) : null;
  const maturityD = inv.maturity_date ? new Date(`${inv.maturity_date}T00:00:00`) : null;
  let years = 1;
  if (startD && maturityD) years = calendarYearsBetween(startD, maturityD);

  let annualRatePercent = 0;
  let totalInterest = 0;
  let maturityValue = invested;
  if (inv.expected_return) {
    if (inv.expected_return_type === "amount") {
      // "amount" is the total sum received at maturity (principal + interest),
      // not the interest alone.
      maturityValue = inv.expected_return;
      totalInterest = maturityValue - invested;
      annualRatePercent = invested > 0 && years > 0 ? (totalInterest / invested / years) * 100 : 0;
    } else {
      annualRatePercent = inv.expected_return;
      totalInterest = invested * (annualRatePercent / 100) * years;
      maturityValue = invested + totalInterest;
    }
  }
  const hasReturn = !!inv.expected_return && invested > 0;

  return { invested, years, annualRatePercent, totalInterest, maturityValue, hasReturn, maturityD };
}
