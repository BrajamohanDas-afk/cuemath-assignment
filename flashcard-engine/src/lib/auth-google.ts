import type { NextRequest } from "next/server";
import type { AppEnv } from "@/lib/env";

export const GOOGLE_OAUTH_STATE_COOKIE_NAME = "google_oauth_state";
export const GOOGLE_OAUTH_NEXT_COOKIE_NAME = "google_oauth_next";

export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/upload";
  }
  return value;
}

export function resolveBaseUrl(request: NextRequest, env: AppEnv): string {
  const normalizeBase = (value: string): string => value.replace(/\/+$/, "");

  if (env.NODE_ENV !== "production") {
    return normalizeBase(request.nextUrl.origin);
  }
  return normalizeBase(env.APP_BASE_URL ?? request.nextUrl.origin);
}
