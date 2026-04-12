import { CardType } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { resolveServerUserId } from "@/lib/auth-user";
import {
  generateFlashcardsFromText,
  type GenerationDifficulty,
  type GeneratedFlashcard,
} from "@/lib/flashcard-generation";
import { extractPdfText, PdfExtractionError } from "@/lib/pdf-extraction";
import { prisma } from "@/lib/prisma";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/acrobat",
]);

const formSchema = z.object({
  deckTitle: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().min(2).max(100).optional(),
  ),
  cardCountPreset: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const normalized = value.trim().toLowerCase();
      return normalized.length === 0 ? undefined : normalized;
    },
    z.enum(["few", "standard", "more"]).optional(),
  ),
  difficultyPreset: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return undefined;
      }
      const normalized = value.trim().toLowerCase();
      return normalized.length === 0 ? undefined : normalized;
    },
    z.enum(["easy", "medium", "hard"]).optional(),
  ),
});

export interface IngestPdfInput {
  file: File;
  userId?: string;
  deckTitle?: string;
  cardCountPreset?: "few" | "standard" | "more";
  difficultyPreset?: "easy" | "medium" | "hard";
}

export interface DeckSummary {
  id: string;
  title: string;
  sourceFile: string;
  createdAt: Date;
  updatedAt: Date;
  lastReviewAt: Date | null;
  oldestOverdueAt: Date | null;
  nextUpcomingDueAt: Date | null;
  cardCount: number;
  dueCount: number;
  status: "Active" | "Steady" | "Calm";
}

export async function listDeckSummaries(options?: {
  includeTiming?: boolean;
  userId?: string;
}): Promise<DeckSummary[]> {
  const includeTiming = options?.includeTiming ?? true;
  const userId = options?.userId ?? (await resolveServerUserId());
  if (!userId) {
    throw new DeckServiceError("Unauthorized. Sign in to continue.", 401);
  }
  const now = new Date();
  const decks = await prisma.deck.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      sourceFile: true,
      createdAt: true,
      updatedAt: true,
      lastReviewAt: true,
      cards: {
        select: {
          schedule: {
            select: {
              dueAt: true,
            },
          },
        },
      },
    },
  });

  return decks.map((deck) => {
    const dueDates = deck.cards
      .map((card) => card.schedule?.dueAt ?? null)
      .filter((dueAt): dueAt is Date => dueAt instanceof Date);

    const overdueDates = dueDates.filter((dueAt) => dueAt <= now);
    const upcomingDates = dueDates.filter((dueAt) => dueAt > now);

    const dueCount = overdueDates.length;
    const oldestOverdueAt =
      includeTiming && overdueDates.length > 0
        ? new Date(Math.min(...overdueDates.map((value) => value.getTime())))
        : null;
    const nextUpcomingDueAt =
      includeTiming && upcomingDates.length > 0
        ? new Date(Math.min(...upcomingDates.map((value) => value.getTime())))
        : null;

    return {
      id: deck.id,
      title: deck.title,
      sourceFile: deck.sourceFile,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
      lastReviewAt: deck.lastReviewAt,
      oldestOverdueAt,
      nextUpcomingDueAt,
      cardCount: deck.cards.length,
      dueCount,
      status: getDeckStatus(dueCount),
    };
  });
}

export async function ingestPdfToDeck(
  input: IngestPdfInput,
): Promise<{
  id: string;
  title: string;
  sourceFile: string;
  cardCount: number;
  provider: "openai";
  warning: string | null;
  sampleCards: GeneratedFlashcard[];
}> {
  validateUploadedFile(input.file);
  const userId = input.userId ?? (await resolveServerUserId());
  if (!userId) {
    throw new DeckServiceError("Unauthorized. Sign in to continue.", 401);
  }

  const parsedForm = formSchema.safeParse({
    deckTitle: input.deckTitle,
    cardCountPreset: input.cardCountPreset,
    difficultyPreset: input.difficultyPreset,
  });
  if (!parsedForm.success) {
    throw new DeckServiceError("Invalid deck title.", 400);
  }

  const fileBytes = Buffer.from(await input.file.arrayBuffer());
  if (!looksLikePdfBytes(fileBytes)) {
    throw new DeckServiceError("Uploaded file is not a valid PDF.", 400);
  }

  let extractedText: string;
  try {
    extractedText = await extractPdfText(fileBytes);
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw new DeckServiceError(error.message, 422);
    }
    throw new DeckServiceError("Could not parse this PDF right now.", 500);
  }
  if (!hasEnoughExtractedText(extractedText)) {
    throw new DeckServiceError(
      "This PDF has too little extractable text to build a useful deck.",
      422,
    );
  }

  const deckTitle = determineDeckTitle({
    providedTitle: parsedForm.data.deckTitle,
    fileName: input.file.name,
    extractedText,
  });

  const generation = await generateFlashcardsFromText({
    deckTitle,
    sourceText: extractedText,
    maxCards: resolveCardCount(parsedForm.data.cardCountPreset),
    difficulty: resolveDifficulty(parsedForm.data.difficultyPreset),
  });

  if (generation.cards.length === 0) {
    throw new DeckServiceError(
      generation.warning ??
        "OpenAI could not generate useful cards from this PDF right now. Please try again.",
      502,
    );
  }

  const sourceHash = createHash("sha256").update(fileBytes).digest("hex");
  const createdDeck = await createDeckWithCards({
    userId,
    title: deckTitle,
    sourceFile: input.file.name,
    sourceHash,
    sourceText: extractedText.slice(0, 120_000),
    cards: generation.cards,
  });

  return {
    id: createdDeck.id,
    title: createdDeck.title,
    sourceFile: createdDeck.sourceFile,
    cardCount: generation.cards.length,
    provider: generation.provider,
    warning: generation.warning,
    sampleCards: generation.cards.slice(0, 3),
  };
}

function validateUploadedFile(file: File) {
  if (file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) {
    throw new DeckServiceError(
      "File must be a non-empty PDF smaller than 10 MB for this milestone.",
      400,
    );
  }

  const lowerName = file.name.toLowerCase();
  const isPdfByName = lowerName.endsWith(".pdf");
  const isPdfByType = ACCEPTED_CONTENT_TYPES.has(file.type.toLowerCase());
  if (!isPdfByName && !isPdfByType) {
    throw new DeckServiceError("Only PDF files are accepted.", 400);
  }
}

async function createDeckWithCards(input: {
  userId: string;
  title: string;
  sourceFile: string;
  sourceHash: string;
  sourceText: string;
  cards: GeneratedFlashcard[];
}) {
  return prisma.$transaction(async (tx) => {
    const deck = await tx.deck.create({
      data: {
        userId: input.userId,
        title: input.title,
        sourceFile: input.sourceFile,
        sourceHash: input.sourceHash,
        sourceText: input.sourceText,
      },
    });

    for (const card of input.cards) {
      await tx.card.create({
        data: {
          deckId: deck.id,
          type: card.type as CardType,
          front: card.front,
          back: card.back,
          difficulty: card.difficulty,
          tags: card.tags.join(", "),
          schedule: {
            create: {
              dueAt: new Date(),
            },
          },
        },
      });
    }

    return deck;
  }, {
    maxWait: 5_000,
    timeout: 15_000,
  });
}

function resolveCardCount(preset?: "few" | "standard" | "more"): number {
  if (preset === "few") {
    return 8;
  }
  if (preset === "more") {
    return 24;
  }
  return 16;
}

function resolveDifficulty(
  preset?: "easy" | "medium" | "hard",
): GenerationDifficulty {
  if (preset === "easy" || preset === "hard") {
    return preset;
  }
  return "medium";
}

function deriveDeckTitleFromFilename(fileName: string): string | null {
  const normalized = normalizeTitle(fileName.replace(/\.pdf$/i, ""));
  if (!normalized || isWeakTitle(normalized)) {
    return null;
  }
  return normalized;
}

function deriveDeckTitleFromText(extractedText: string): string | null {
  const lines = extractedText
    .split("\n")
    .map((line) => normalizeTitle(line))
    .filter((line) => line.length >= 4 && line.length <= 80);

  for (const line of lines) {
    if (/[A-Za-z]{3,}/.test(line) && !isGenericHeading(line)) {
      return line;
    }
  }

  return null;
}

function determineDeckTitle(input: {
  providedTitle?: string;
  fileName: string;
  extractedText: string;
}): string {
  if (input.providedTitle) {
    return normalizeTitle(input.providedTitle) || "Untitled Deck";
  }

  return (
    deriveDeckTitleFromFilename(input.fileName) ??
    deriveDeckTitleFromText(input.extractedText) ??
    "Untitled Deck"
  );
}

function normalizeTitle(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/[•●◦▪‣∙]/g, " ")
    .replace(/[“”„‟«»]/g, "\"")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 100);
}

function isWeakTitle(title: string): boolean {
  if (title.length < 3) {
    return true;
  }

  return !/[A-Za-z]{2,}/.test(title);
}

function isGenericHeading(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === "table of contents" ||
    normalized === "contents" ||
    normalized === "introduction"
  );
}

function getDeckStatus(dueCount: number): "Active" | "Steady" | "Calm" {
  if (dueCount >= 20) {
    return "Active";
  }
  if (dueCount >= 8) {
    return "Steady";
  }
  return "Calm";
}


function hasEnoughExtractedText(value: string): boolean {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length < 220) {
    return false;
  }

  const unicodeWordCount = (normalized.match(/\p{L}[\p{L}\p{N}]*/gu) ?? [])
    .length;
  if (unicodeWordCount >= 55) {
    return true;
  }

  const letterCount = (normalized.match(/\p{L}/gu) ?? []).length;
  return letterCount >= 160;
}

function looksLikePdfBytes(bytes: Buffer): boolean {
  if (bytes.length < 5) {
    return false;
  }

  const signature = bytes.subarray(0, 5).toString("ascii");
  return signature === "%PDF-";
}

export class DeckServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DeckServiceError";
    this.statusCode = statusCode;
  }
}
