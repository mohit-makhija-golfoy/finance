import type { BankDetectionResult } from "@/src/types/statement";

const KNOWN_BANKS: { name: string; keywords: string[] }[] = [
  { name: "HDFC Bank", keywords: ["hdfc bank", "hdfc"] },
  { name: "ICICI Bank", keywords: ["icici bank", "icici"] },
  { name: "State Bank of India", keywords: ["state bank of india", "sbi"] },
  { name: "Axis Bank", keywords: ["axis bank"] },
  { name: "Kotak Mahindra Bank", keywords: ["kotak mahindra", "kotak bank"] },
  { name: "Punjab National Bank", keywords: ["punjab national bank", "pnb"] },
  { name: "Bank of Baroda", keywords: ["bank of baroda"] },
  { name: "Canara Bank", keywords: ["canara bank"] },
  { name: "Union Bank of India", keywords: ["union bank of india"] },
  { name: "IDFC FIRST Bank", keywords: ["idfc first", "idfc bank"] },
  { name: "Yes Bank", keywords: ["yes bank"] },
  { name: "IndusInd Bank", keywords: ["indusind bank"] },
  { name: "IDBI Bank", keywords: ["idbi bank"] },
  { name: "Federal Bank", keywords: ["federal bank"] },
];

export function detectBankName(firstPageText: string): BankDetectionResult {
  const haystack = (firstPageText || "").slice(0, 2000).toLowerCase();
  for (const bank of KNOWN_BANKS) {
    if (bank.keywords.some((k) => haystack.includes(k))) {
      return { bankName: bank.name, confidence: "high" };
    }
  }
  return { bankName: null, confidence: "low" };
}
