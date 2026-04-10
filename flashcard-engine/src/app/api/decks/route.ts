import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  DeckServiceError,
  ingestPdfToDeck,
  listDeckSummaries,
} from "@/lib/deck-service";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const deleteSchema = z.object({
  deckId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const decks = await listDeckSummaries();
  return NextResponse.json({ decks });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const deckTitle = formData.get("deckTitle");
  const cardCountPreset = formData.get("cardCountPreset");
  const difficultyPreset = formData.get("difficultyPreset");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { message: "A PDF file is required." },
      { status: 400 },
    );
  }

  try {
    const deck = await ingestPdfToDeck({
      file,
      deckTitle: typeof deckTitle === "string" ? deckTitle : undefined,
      cardCountPreset:
        typeof cardCountPreset === "string"
          ? (cardCountPreset as "few" | "standard" | "more")
          : undefined,
      difficultyPreset:
        typeof difficultyPreset === "string"
          ? (difficultyPreset as "easy" | "medium" | "hard")
          : undefined,
    });

    return NextResponse.json({
      message: "Deck generated successfully.",
      deck,
    });
  } catch (error) {
    if (error instanceof DeckServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { message: "Unexpected server error during deck generation." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "deckId is required." },
        { status: 400 },
      );
    }

    await prisma.deck.delete({
      where: {
        id: parsed.data.deckId,
      },
    });

    return NextResponse.json({
      message: "Deck deleted.",
      deckId: parsed.data.deckId,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ message: "Deck not found." }, { status: 404 });
    }

    return NextResponse.json(
      { message: "Unexpected server error during deck deletion." },
      { status: 500 },
    );
  }
}
