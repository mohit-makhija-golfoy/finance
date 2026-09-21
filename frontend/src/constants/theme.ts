import { CURRENCIES, CurrencyCode, CurrencyConfig, DEFAULT_CURRENCY_CODE } from "./currency";

export const palette = {
  dark: {
    background: "#09090B",
    surface: "#18181B",
    surfaceAlt: "#0F0F12",
    border: "#27272A",
    primary: "#FAFAFA",
    primaryText: "#09090B",
    text: "#FAFAFA",
    textMuted: "#A1A1AA",
    positive: "#10B981",
    negative: "#F43F5E",
    chart: "#FAFAFA",
  },
  light: {
    background: "#FDFDFD",
    surface: "#FFFFFF",
    surfaceAlt: "#F4F4F5",
    border: "#E4E4E7",
    primary: "#09090B",
    primaryText: "#FAFAFA",
    text: "#09090B",
    textMuted: "#71717A",
    positive: "#059669",
    negative: "#E11D48",
    chart: "#09090B",
  },
};

export type ThemeMode = "dark" | "light";
export type Theme = typeof palette.dark;

let activeCurrency: CurrencyConfig = CURRENCIES[DEFAULT_CURRENCY_CODE];

export const setActiveCurrency = (code: CurrencyCode) => {
  activeCurrency = CURRENCIES[code] || CURRENCIES[DEFAULT_CURRENCY_CODE];
};

export const getActiveCurrency = () => activeCurrency;

// Compact form: uses Indian lakh/crore units for INR, international K/M/B otherwise.
export const inr = (n: number) => {
  const v = Math.round((n || 0) * 100) / 100;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  let formatted: string;
  if (activeCurrency.code === "INR") {
    if (abs >= 10000000) formatted = `${(abs / 10000000).toFixed(2)}Cr`;
    else if (abs >= 100000) formatted = `${(abs / 100000).toFixed(2)}L`;
    else if (abs >= 1000) formatted = `${(abs / 1000).toFixed(1)}K`;
    else formatted = abs.toFixed(0);
  } else {
    if (abs >= 1000000000) formatted = `${(abs / 1000000000).toFixed(2)}B`;
    else if (abs >= 1000000) formatted = `${(abs / 1000000).toFixed(2)}M`;
    else if (abs >= 1000) formatted = `${(abs / 1000).toFixed(1)}K`;
    else formatted = abs.toFixed(0);
  }
  return `${sign}${activeCurrency.symbol}${formatted}`;
};

export const inrFull = (n: number) => {
  const v = Math.round((n || 0) * 100) / 100;
  return `${activeCurrency.symbol}${v.toLocaleString(activeCurrency.locale)}`;
};
