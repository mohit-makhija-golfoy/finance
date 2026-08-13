import React, { createContext, useContext, useState } from "react";
import { toLocalYMD } from "@/src/utils/date";

// Shared across Home and Transactions so picking a date range on one screen
// keeps it selected when navigating to the other, until explicitly changed.
export type DateRangeKey = "all" | "year" | "3mo" | "month" | "last" | "custom";

export type CustomRange = { start: string; end: string };

function defaultCustomRange(): CustomRange {
  const today = new Date();
  return {
    start: toLocalYMD(new Date(today.getFullYear(), today.getMonth(), 1)),
    end: toLocalYMD(today),
  };
}

type Ctx = {
  range: DateRangeKey;
  setRange: (r: DateRangeKey) => void;
  customRange: CustomRange;
  setCustomRange: (r: CustomRange) => void;
};

const FilterContext = createContext<Ctx | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<DateRangeKey>("month");
  const [customRange, setCustomRange] = useState<CustomRange>(defaultCustomRange());

  return (
    <FilterContext.Provider value={{ range, setRange, customRange, setCustomRange }}>
      {children}
    </FilterContext.Provider>
  );
}

export const useFilters = () => {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters outside provider");
  return ctx;
};
