export type CurrencyCode = "USD" | "INR" | "EUR" | "GBP" | "JPY" | "AUD" | "CAD" | "AED" | "SGD" | "CNY";

export type CurrencyConfig = {
  code: CurrencyCode;
  symbol: string;
  locale: string;
  name: string;
  country: string;
};

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  USD: { code: "USD", symbol: "$", locale: "en-US", name: "US Dollar", country: "United States" },
  INR: { code: "INR", symbol: "₹", locale: "en-IN", name: "Indian Rupee", country: "India" },
  EUR: { code: "EUR", symbol: "€", locale: "de-DE", name: "Euro", country: "European Union" },
  GBP: { code: "GBP", symbol: "£", locale: "en-GB", name: "British Pound", country: "United Kingdom" },
  JPY: { code: "JPY", symbol: "¥", locale: "ja-JP", name: "Japanese Yen", country: "Japan" },
  AUD: { code: "AUD", symbol: "A$", locale: "en-AU", name: "Australian Dollar", country: "Australia" },
  CAD: { code: "CAD", symbol: "C$", locale: "en-CA", name: "Canadian Dollar", country: "Canada" },
  AED: { code: "AED", symbol: "د.إ", locale: "ar-AE", name: "UAE Dirham", country: "United Arab Emirates" },
  SGD: { code: "SGD", symbol: "S$", locale: "en-SG", name: "Singapore Dollar", country: "Singapore" },
  CNY: { code: "CNY", symbol: "¥", locale: "zh-CN", name: "Chinese Yuan", country: "China" },
};

export const CURRENCY_LIST: CurrencyConfig[] = Object.values(CURRENCIES);

export const DEFAULT_CURRENCY_CODE: CurrencyCode = "INR";

export const isCurrencyCode = (value: string): value is CurrencyCode =>
  Object.prototype.hasOwnProperty.call(CURRENCIES, value);
