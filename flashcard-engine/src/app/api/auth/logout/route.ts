import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_SESSION_COOKIE_NAME,
  revokeUserSessionByToken,
} from "@/lib/auth-user";
import { getEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  if (token) {
    await revokeUserSessionByToken(token);
  }

  const env = getEnv();
  const response = NextResponse.json({
    message: "Signed out.",
  });
  response.cookies.set(AUTH_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });

  return response;
}
