import { NextResponse, type NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getSafeRuntimeConfig } from "@/lib/env";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request, { bucket: "read" });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  return NextResponse.json({
    config: getSafeRuntimeConfig(),
  });
}
