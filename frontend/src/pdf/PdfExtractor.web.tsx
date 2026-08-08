import { forwardRef, useImperativeHandle } from "react";
import { PdfPasswordRequiredError, type PdfExtractionResult, type PdfExtractorHandle } from "./types";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let workerSrcPromise: Promise<string> | null = null;

// pdf.js throws ("No GlobalWorkerOptions.workerSrc specified") rather than
// falling back silently, so we must point it at a worker script ourselves.
// Building a Blob URL from the bundled worker source (code-split alongside
// pdfjs-dist itself) keeps this fully offline, no network fetch involved.
function getWorkerSrc(): Promise<string> {
  if (!workerSrcPromise) {
    workerSrcPromise = import("./pdfWorkerSource").then(({ PDF_WORKER_SOURCE }) => {
      const blob = new Blob([PDF_WORKER_SOURCE], { type: "application/javascript" });
      return URL.createObjectURL(blob);
    });
  }
  return workerSrcPromise;
}

async function extractPdfText(base64: string, password?: string): Promise<PdfExtractionResult> {
  const [pdfjsLib, workerSrc] = await Promise.all([import("pdfjs-dist"), getWorkerSrc()]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  const data = base64ToUint8Array(base64);

  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data, ...(password ? { password } : {}) }).promise;
  } catch (err: any) {
    if (err?.name === "PasswordException") {
      throw new PdfPasswordRequiredError(err.code === 2);
    }
    throw err;
  }
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    const bands = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      if (!item.str) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      const key = Math.round(y / 3);
      if (!bands.has(key)) bands.set(key, []);
      bands.get(key)!.push({ x, str: item.str });
    }

    const keys = Array.from(bands.keys()).sort((a, b) => b - a);
    const lines = keys.map((key) =>
      bands
        .get(key)!
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    );
    pages.push(lines.filter(Boolean).join("\n"));
  }

  return { pages, pageCount: pages.length };
}

const PdfExtractor = forwardRef<PdfExtractorHandle>((_props, ref) => {
  useImperativeHandle(ref, () => ({
    extract: (base64: string, password?: string) => extractPdfText(base64, password),
  }));

  return null;
});

PdfExtractor.displayName = "PdfExtractor";

export default PdfExtractor;
