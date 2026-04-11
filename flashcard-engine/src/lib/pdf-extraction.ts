import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  dataBuffer: Buffer,
) => Promise<{ text: string }>;

const LINE_BREAK_NORMALIZER = /\r\n/g;
const MULTI_NEWLINE = /\n{3,}/g;
const MULTI_SPACE = /[ \t]{2,}/g;
const BULLET_CHARS = /[\u2022\u25CF\u25E6\u25AA\u2023\u2219]/g;
const SMART_DOUBLE_QUOTES = /[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g;
const SMART_SINGLE_QUOTES = /[\u2018\u2019\u201A\u201B]/g;
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\uFEFF]/g;
const PARSE_TIMEOUT_MS = 12_000;

export class PdfExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

export async function extractPdfText(pdfBytes: Buffer): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const parsePromise = pdfParse(pdfBytes);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new PdfExtractionError("PDF parsing timed out."));
      }, PARSE_TIMEOUT_MS);
    });

    const parsed = await Promise.race([parsePromise, timeoutPromise]);

    const cleaned = parsed.text
      .replace(LINE_BREAK_NORMALIZER, "\n")
      .replace(SMART_DOUBLE_QUOTES, "\"")
      .replace(SMART_SINGLE_QUOTES, "'")
      .replace(BULLET_CHARS, " ")
      .replace(ZERO_WIDTH_CHARS, "")
      .replace(MULTI_NEWLINE, "\n\n")
      .replace(MULTI_SPACE, " ")
      .trim();

    if (!cleaned) {
      throw new PdfExtractionError("Could not extract readable text from this PDF.");
    }

    return cleaned;
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw error;
    }

    throw new PdfExtractionError("Could not parse this PDF.");
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
