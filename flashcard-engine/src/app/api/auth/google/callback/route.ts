import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_SESSION_COOKIE_NAME,
  createUserSession,
  ensureUserByExternalKey,
} from "@/lib/auth-user";
import {
  GOOGLE_OAUTH_NEXT_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  resolveBaseUrl,
  sanitizeNextPath,
} from "@/lib/auth-google";
import { getEnv } from "@/lib/env";

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfoResponse = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
};

export async function GET(request: NextRequest) {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.url));
  }

  const stateFromQuery = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  const stateFromCookie =
    request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)?.value ?? "";
  const nextPath = sanitizeNextPath(
    request.cookies.get(GOOGLE_OAUTH_NEXT_COOKIE_NAME)?.value,
  );

  if (oauthError) {
    return buildLoginRedirect(request, "google_access_denied");
  }

  if (!code || !stateFromQuery || stateFromQuery !== stateFromCookie) {
    return buildLoginRedirect(request, "invalid_oauth_state");
  }

  const redirectUri = `${resolveBaseUrl(request, env)}/api/auth/google/callback`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenPayload = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return buildLoginRedirect(request, "google_token_exchange_failed");
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
      },
    },
  );

  const userInfo = (await userInfoResponse.json()) as GoogleUserInfoResponse;
  const normalizedEmail = userInfo.email?.trim().toLowerCase() ?? "";
  if (!userInfoResponse.ok || !userInfo.sub || !normalizedEmail) {
    return buildLoginRedirect(request, "google_userinfo_failed");
  }

  const userId = await ensureUserByExternalKey(`google-email:${normalizedEmail}`);
  const session = await createUserSession(userId);
  const response = NextResponse.redirect(new URL(nextPath, request.url));

  response.cookies.set(AUTH_SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  clearOAuthCookies(response, env.NODE_ENV === "production");

  return response;
}

function buildLoginRedirect(request: NextRequest, errorCode: string): NextResponse {
  const env = getEnv();
  const url = new URL("/login", request.url);
  url.searchParams.set("error", errorCode);
  const response = NextResponse.redirect(url);
  clearOAuthCookies(response, env.NODE_ENV === "production");
  return response;
}

function clearOAuthCookies(
  response: NextResponse,
  secure: boolean,
): void {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE_NAME, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
  response.cookies.set(GOOGLE_OAUTH_NEXT_COOKIE_NAME, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
