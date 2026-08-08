export type PdfExtractionResult = {
  pages: string[];
  pageCount: number;
};

export type PdfExtractorHandle = {
  extract: (base64: string, password?: string) => Promise<PdfExtractionResult>;
};

// Thrown when pdf.js reports the PDF is password-protected — needsRetry
// distinguishes "no password tried yet" from "wrong password entered".
export class PdfPasswordRequiredError extends Error {
  needsRetry: boolean;

  constructor(needsRetry: boolean) {
    super(needsRetry ? "Incorrect password." : "This PDF is password-protected.");
    this.name = "PdfPasswordRequiredError";
    this.needsRetry = needsRetry;
  }
}
