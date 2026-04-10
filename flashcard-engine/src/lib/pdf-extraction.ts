import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  dataBuffer: Buffer,
) => Promise<{ text: string }>;

const LINE_BREAK_NORMALIZER = /\r\n/g;
const MULTI_NEWLINE = /\n{3,}/g;
const MULTI_SPACE = /[ \t]{2,}/g;

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export async function extractPdfText(pdfBytes: Buffer): Promise<string> {
  try {
    const parsed = await pdfParse(pdfBytes);
    const cleaned = parsed.text
      .replace(LINE_BREAK_NORMALIZER, "\n")
      .replace(MULTI_NEWLINE, "\n\n")
      .replace(MULTI_SPACE, " ")
      .trim();

    if (!cleaned) {
      throw new PdfExtractionError(
        "Could not extract readable text from this PDF.",
      );
    }

    return cleaned;
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown PDF parsing error";
    throw new PdfExtractionError(`Failed to parse PDF: ${message}`);
  }
}
