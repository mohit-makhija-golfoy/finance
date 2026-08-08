export type StatementEntryDirection = "credit" | "debit";

export type StatementEntry = {
  id: string;
  date: string; // normalized YYYY-MM-DD
  rawDate: string; // original text as found on the statement
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  direction: StatementEntryDirection;
  amount: number; // = debit or credit, whichever applies
  page: number;
};

export type ParsedStatementResult = {
  entries: StatementEntry[];
  warnings: string[];
  pageCount: number;
  rawTextLength: number;
};

export type BankDetectionResult = {
  bankName: string | null;
  confidence: "high" | "low";
};

export type StatementFilterOptions = {
  dateFrom?: string;
  dateTo?: string;
  includeCredit: boolean;
  includeDebit: boolean;
};
