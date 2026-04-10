import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const LIMIT = 50;
const WINDOW_MS = 60_000;

const globalForRateLimit = globalThis as typeof globalThis & {
  apiRateLimitStore?: Map<string, RateLimitEntry>;
};

const rateLimitStore =
  globalForRateLimit.apiRateLimitStore ?? new Map<string, RateLimitEntry>();

if (!globalForRateLimit.apiRateLimitStore) {
  globalForRateLimit.apiRateLimitStore = rateLimitStore;
}

function getClientKey(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown-client";
}

export function enforceApiRateLimit(request: NextRequest): NextResponse | null {
  const now = Date.now();
  const key = getClientKey(request);
  const current = rateLimitStore.get(key);

  if (!current || now >= current.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return null;
  }

  if (current.count >= LIMIT) {
    return NextResponse.json(
      {
        message: "limit reached",
      },
      { status: 429 },
    );
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return null;
}
