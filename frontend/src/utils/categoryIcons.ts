import type { IoniconName } from "@/src/constants/categoryIconOptions";

const RULES: [RegExp, IoniconName][] = [
  [/food|grocery|groceries|restaurant|dining|eat|snack/i, "fast-food-outline"],
  [/salary|income|wage|payroll|bonus/i, "cash-outline"],
  [/rent|house|home|mortgage/i, "home-outline"],
  [/fuel|petrol|diesel|transport|cab|taxi|uber|ola|bus|train|metro|parking/i, "car-outline"],
  [/shopping|clothes|apparel|fashion/i, "bag-handle-outline"],
  [/entertainment|movie|netflix|game|music|streaming/i, "film-outline"],
  [/health|medical|hospital|doctor|pharmacy|medicine/i, "medkit-outline"],
  [/bill|electricity|water|utility|utilities|internet|mobile|recharge|phone/i, "receipt-outline"],
  [/travel|flight|hotel|vacation|trip/i, "airplane-outline"],
  [/education|school|college|course|tuition|fee/i, "school-outline"],
  [/gift|donation|charity/i, "gift-outline"],
  [/invest|mutual fund|stock|sip|fd|deposit/i, "trending-up-outline"],
  [/loan|emi|debt/i, "card-outline"],
  [/insurance/i, "shield-checkmark-outline"],
  [/pet/i, "paw-outline"],
  [/subscription/i, "repeat-outline"],
  [/imported|bank statement/i, "document-text-outline"],
];

export function getCategoryIcon(name: string): IoniconName {
  for (const [re, icon] of RULES) if (re.test(name)) return icon;
  return "pricetag-outline";
}

export function resolveCategoryIcon(category: { name: string; icon?: string | null }): IoniconName {
  return (category.icon as IoniconName) || getCategoryIcon(category.name);
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
