import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  explainCardAnswer,
  parseExplainAnswerInput,
  getReviewQueue,
  parseSubmitReviewInput,
  ReviewServiceError,
  submitReviewRating,
} from "@/lib/review-service";

export const runtime = "nodejs";

const querySchema = z.object({
  deckId: z.string().min(1),
  excludeCardId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const parsed = querySchema.safeParse({
    deckId: request.nextUrl.searchParams.get("deckId"),
    excludeCardId: request.nextUrl.searchParams.get("excludeCardId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { message: "deckId query param is required." },
      { status: 400 },
    );
  }

  try {
    const queue = await getReviewQueue(parsed.data.deckId, {
      excludeCardId: parsed.data.excludeCardId,
    });
    return NextResponse.json({ queue });
  } catch (error) {
    if (error instanceof ReviewServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { message: "Unexpected server error while loading review queue." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const payload = await request.json();
    const isExplainRequest =
      typeof payload === "object" &&
      payload !== null &&
      !("rating" in (payload as Record<string, unknown>));

    if (isExplainRequest) {
      const input = parseExplainAnswerInput(payload);
      const explanation = await explainCardAnswer(input);
      return NextResponse.json(explanation);
    }

    const ratingInput = parseSubmitReviewInput(payload);
    const ratingResult = await submitReviewRating(ratingInput);
    return NextResponse.json(ratingResult);
  } catch (error) {
    if (error instanceof ReviewServiceError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { message: "Unexpected server error while rating review card." },
      { status: 500 },
    );
  }
}
