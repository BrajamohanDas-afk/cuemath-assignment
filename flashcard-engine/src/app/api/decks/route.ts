import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiAuthError, resolveApiUserId } from "@/lib/auth-user";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  DeckServiceError,
  ingestPdfToDeck,
  listDeckSummaries,
} from "@/lib/deck-service";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const MAX_UPLOAD_REQUEST_BYTES = 12 * 1024 * 1024;

const deleteSchema = z.object({
  deckId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request, { bucket: "read" });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let userId: string;
  try {
    userId = await resolveApiUserId(request);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const view = request.nextUrl.searchParams.get("view");
  const includeTiming = view !== "review";
  const decks = await listDeckSummaries({ includeTiming, userId });
  return NextResponse.json({ decks });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request, { bucket: "ingest" });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let userId: string;
  try {
    userId = await resolveApiUserId(request);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_REQUEST_BYTES) {
      return NextResponse.json(
        { message: "Upload request is too large." },
        { status: 413 },
      );
    }
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
      userId,
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
  const rateLimitResponse = enforceApiRateLimit(request, {
    bucket: "mutation",
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let userId: string;
  try {
    userId = await resolveApiUserId(request);
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode },
      );
    }
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
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

    const result = await prisma.deck.deleteMany({
      where: {
        id: parsed.data.deckId,
        userId,
      },
    });
    if (result.count === 0) {
      return NextResponse.json({ message: "Deck not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: "Deck deleted.",
      deckId: parsed.data.deckId,
    });
  } catch {
    return NextResponse.json(
      { message: "Unexpected server error during deck deletion." },
      { status: 500 },
    );
  }
}
