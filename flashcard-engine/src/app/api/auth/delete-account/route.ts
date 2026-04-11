import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AUTH_SESSION_COOKIE_NAME,
  ApiAuthError,
  LOCAL_DEFAULT_USER_ID,
  resolveApiUserId,
  revokeUserSessionByToken,
} from "@/lib/auth-user";
import { enforceApiRateLimit } from "@/lib/api-rate-limit";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  confirm: z.literal("DELETE"),
});

export async function POST(request: NextRequest) {
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

  if (userId === LOCAL_DEFAULT_USER_ID) {
    return NextResponse.json(
      {
        message:
          "Default local account cannot be deleted. Enable Google login first.",
      },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Send {"confirm":"DELETE"} to confirm account deletion.' },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ message: "Account not found." }, { status: 404 });
  }

  await prisma.user.delete({
    where: { id: userId },
  });

  const sessionToken =
    request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  if (sessionToken) {
    await revokeUserSessionByToken(sessionToken);
  }

  const env = getEnv();
  const response = NextResponse.json({
    message: "Account deleted permanently.",
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
