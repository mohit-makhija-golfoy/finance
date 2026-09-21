import React, { createContext, useContext, useEffect, useState } from "react";
import { CURRENCIES, CurrencyCode, CurrencyConfig, DEFAULT_CURRENCY_CODE, isCurrencyCode } from "@/src/constants/currency";
import { setActiveCurrency } from "@/src/constants/theme";
import { storage } from "@/src/utils/storage";

type Ctx = {
  currencyCode: CurrencyCode;
  currency: CurrencyConfig;
  setCurrencyCode: (next: CurrencyCode) => void;
};

const CurrencyContext = createContext<Ctx | undefined>(undefined);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currencyCode, setCode] = useState<CurrencyCode>(DEFAULT_CURRENCY_CODE);

  const setCurrencyCode = (next: CurrencyCode) => {
    setCode(next);
    setActiveCurrency(next);
    storage.setItem("currency_code", next);
  };

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>("currency_code", DEFAULT_CURRENCY_CODE);
      if (saved && isCurrencyCode(saved)) {
        setCode(saved);
        setActiveCurrency(saved);
      }
    })();
  }, []);

  return (
    <CurrencyContext.Provider value={{ currencyCode, currency: CURRENCIES[currencyCode], setCurrencyCode }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency outside provider");
  return ctx;
};
