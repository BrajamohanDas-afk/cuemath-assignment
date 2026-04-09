import { NextResponse, type NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  return NextResponse.json({
    status: "ok",
    service: "flashcard-engine",
    timestamp: new Date().toISOString(),
  });
}
