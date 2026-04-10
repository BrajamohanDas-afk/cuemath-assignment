import { NextResponse, type NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  DeckServiceError,
  ingestPdfToDeck,
  listDeckSummaries,
} from "@/lib/deck-service";

export const runtime = "nodejs";

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
