import { CardType } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  generateFlashcardsFromText,
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
});

export interface IngestPdfInput {
  file: File;
  deckTitle?: string;
}

export interface DeckSummary {
  id: string;
  title: string;
  sourceFile: string;
  createdAt: Date;
  updatedAt: Date;
  cardCount: number;
  dueCount: number;
  status: "Active" | "Steady" | "Calm";
}

type DeckSummaryRow = {
  id: string;
  title: string;
  sourceFile: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  cardCount: number | bigint | string;
  dueCount: number | bigint | string;
};

export async function listDeckSummaries(): Promise<DeckSummary[]> {
  const now = new Date();
  const rows = await prisma.$queryRaw<DeckSummaryRow[]>`
    SELECT
      d.id,
      d.title,
      d.sourceFile,
      d.createdAt,
      d.updatedAt,
      COUNT(DISTINCT c.id) AS cardCount,
      COUNT(CASE WHEN cs.dueAt <= ${now} THEN 1 END) AS dueCount
    FROM Deck AS d
    LEFT JOIN Card AS c
      ON c.deckId = d.id
    LEFT JOIN CardSchedule AS cs
      ON cs.cardId = c.id
    GROUP BY d.id, d.title, d.sourceFile, d.createdAt, d.updatedAt
    ORDER BY d.updatedAt DESC
  `;

  return rows.map((row) => {
    const dueCount = toNumber(row.dueCount);
    return {
      id: row.id,
      title: row.title,
      sourceFile: row.sourceFile,
      createdAt: toDate(row.createdAt),
      updatedAt: toDate(row.updatedAt),
      cardCount: toNumber(row.cardCount),
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
  provider: "openai" | "fallback";
  warning: string | null;
  sampleCards: GeneratedFlashcard[];
}> {
  validateUploadedFile(input.file);

  const parsedForm = formSchema.safeParse({
    deckTitle: input.deckTitle,
  });
  if (!parsedForm.success) {
    throw new DeckServiceError("Invalid deck title.", 400);
  }

  const fileBytes = Buffer.from(await input.file.arrayBuffer());

  let extractedText: string;
  try {
    extractedText = await extractPdfText(fileBytes);
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw new DeckServiceError(error.message, 422);
    }
    throw new DeckServiceError("Could not parse this PDF right now.", 500);
  }

  const deckTitle =
    parsedForm.data.deckTitle ??
    deriveDeckTitleFromFilename(input.file.name) ??
    "Untitled Deck";

  const generation = await generateFlashcardsFromText({
    deckTitle,
    sourceText: extractedText,
    maxCards: 16,
  });

  if (generation.cards.length === 0) {
    throw new DeckServiceError(
      "Could not generate useful cards from this PDF.",
      422,
    );
  }

  const sourceHash = createHash("sha256").update(fileBytes).digest("hex");
  const createdDeck = await createDeckWithCards({
    title: deckTitle,
    sourceFile: input.file.name,
    sourceHash,
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
  title: string;
  sourceFile: string;
  sourceHash: string;
  cards: GeneratedFlashcard[];
}) {
  return prisma.$transaction(async (tx) => {
    const deck = await tx.deck.create({
      data: {
        title: input.title,
        sourceFile: input.sourceFile,
        sourceHash: input.sourceHash,
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

function deriveDeckTitleFromFilename(fileName: string): string | null {
  const normalized = fileName.replace(/\.pdf$/i, "").trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 100);
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

function toNumber(value: number | bigint | string): number {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return value;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export class DeckServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DeckServiceError";
    this.statusCode = statusCode;
  }
}
