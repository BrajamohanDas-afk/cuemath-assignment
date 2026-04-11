import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import {
  GOOGLE_OAUTH_NEXT_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  resolveBaseUrl,
  sanitizeNextPath,
} from "@/lib/auth-google";
import { getEnv } from "@/lib/env";

export async function GET(request: NextRequest) {
  const rateLimitResponse = enforceApiRateLimit(request, {
    bucket: "read",
  });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { message: "Google OAuth is not configured." },
      { status: 400 },
    );
  }

  const state = randomBytes(24).toString("hex");
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const redirectUri = `${resolveBaseUrl(request, env)}/api/auth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  response.cookies.set(GOOGLE_OAUTH_NEXT_COOKIE_NAME, nextPath, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
