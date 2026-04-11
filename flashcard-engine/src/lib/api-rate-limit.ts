import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const LIMIT = 50;
const MUTATION_LIMIT = 20;
const INGEST_LIMIT = 8;
const WINDOW_MS = 60_000;
const STORE_MAX_ENTRIES = 5_000;
const CLEANUP_INTERVAL_MS = 30_000;

const globalForRateLimit = globalThis as typeof globalThis & {
  apiRateLimitStore?: Map<string, RateLimitEntry>;
  apiRateLimitLastCleanup?: number;
};

const rateLimitStore =
  globalForRateLimit.apiRateLimitStore ?? new Map<string, RateLimitEntry>();

if (!globalForRateLimit.apiRateLimitStore) {
  globalForRateLimit.apiRateLimitStore = rateLimitStore;
}

if (!globalForRateLimit.apiRateLimitLastCleanup) {
  globalForRateLimit.apiRateLimitLastCleanup = 0;
}

function getClientKey(request: NextRequest): string {
  const env = getEnv();
  if (env.APP_API_TOKEN) {
    const token =
      request.headers.get("x-api-token")?.trim() ??
      request.cookies.get("app_api_token")?.value?.trim();
    if (token) {
      return `token:${token}`;
    }
  }

  const vercelIp =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-real-ip");
  if (vercelIp) {
    return vercelIp.trim();
  }

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

function maybeCleanup(now: number) {
  const lastCleanup = globalForRateLimit.apiRateLimitLastCleanup ?? 0;
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  globalForRateLimit.apiRateLimitLastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }

  if (rateLimitStore.size <= STORE_MAX_ENTRIES) {
    return;
  }

  const overflow = rateLimitStore.size - STORE_MAX_ENTRIES;
  const keys = rateLimitStore.keys();
  for (let index = 0; index < overflow; index += 1) {
    const next = keys.next();
    if (next.done) {
      break;
    }
    rateLimitStore.delete(next.value);
  }
}

export function enforceApiRateLimit(
  request: NextRequest,
  options?: { bucket?: "read" | "mutation" | "ingest" },
): NextResponse | null {
  const now = Date.now();
  maybeCleanup(now);
  const key = getClientKey(request);
  const bucket = options?.bucket ?? "read";
  const limit =
    bucket === "ingest"
      ? INGEST_LIMIT
      : bucket === "mutation"
        ? MUTATION_LIMIT
        : LIMIT;
  const namespacedKey = `${bucket}:${key}`;
  const current = rateLimitStore.get(namespacedKey);

  if (!current || now >= current.resetAt) {
    rateLimitStore.set(namespacedKey, {
      count: 1,
      resetAt: now + WINDOW_MS,
    });
    return null;
  }

  if (current.count >= limit) {
    return NextResponse.json(
      {
        message: "limit reached",
      },
      { status: 429 },
    );
  }

  current.count += 1;
  rateLimitStore.set(namespacedKey, current);
  return null;
}
