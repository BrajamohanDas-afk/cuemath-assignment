import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const AUTH_SESSION_COOKIE_NAME = "app_session";
export const LOCAL_DEFAULT_USER_ID = "local-default-user";

export class ApiAuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiAuthError";
    this.statusCode = statusCode;
  }
}

export async function resolveApiUserId(request: NextRequest): Promise<string> {
  const env = getEnv();
  const sessionToken = request.cookies.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim();
  if (sessionToken) {
    const sessionUserId = await findUserIdBySessionToken(sessionToken);
    if (sessionUserId) {
      return sessionUserId;
    }
  }

  const requestToken =
    request.headers.get("x-api-token")?.trim() ??
    request.cookies.get("app_api_token")?.value?.trim() ??
    "";

  if (env.APP_API_TOKEN) {
    if (!requestToken || !timingSafeEqual(requestToken, env.APP_API_TOKEN)) {
      throw new ApiAuthError(
        "Unauthorized. Sign in first, or provide a valid x-api-token.",
        401,
      );
    }
    return ensureUserByExternalKey(`token:${fingerprintToken(requestToken)}`);
  }

  if (requestToken) {
    return ensureUserByExternalKey(`token:${fingerprintToken(requestToken)}`);
  }

  if (!isGoogleAuthEnabled(env)) {
    return ensureLocalDefaultUser();
  }

  throw new ApiAuthError("Unauthorized. Sign in to continue.", 401);
}

export async function resolveServerUserId(): Promise<string | null> {
  const env = getEnv();
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  if (!sessionToken) {
    if (isGoogleAuthEnabled(env)) {
      return null;
    }
    return ensureLocalDefaultUser();
  }

  const sessionUserId = await findUserIdBySessionToken(sessionToken);
  if (sessionUserId) {
    return sessionUserId;
  }

  if (!isGoogleAuthEnabled(env)) {
    return ensureLocalDefaultUser();
  }

  return null;
}

export async function ensureLocalDefaultUser(): Promise<string> {
  await prisma.user.upsert({
    where: { id: LOCAL_DEFAULT_USER_ID },
    update: {
      externalKey: "local-default",
    },
    create: {
      id: LOCAL_DEFAULT_USER_ID,
      externalKey: "local-default",
    },
  });

  return LOCAL_DEFAULT_USER_ID;
}

export async function ensureUserByExternalKey(externalKey: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { externalKey },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const id = toUserId(externalKey);
  const created = await prisma.user.upsert({
    where: { id },
    update: { externalKey },
    create: {
      id,
      externalKey,
    },
    select: { id: true },
  });

  return created.id;
}

export async function createUserSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const env = getEnv();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + env.AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashOpaqueToken(token),
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function revokeUserSessionByToken(token: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: {
      tokenHash: hashOpaqueToken(token),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export function hashOpaqueToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function fingerprintToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function findUserIdBySessionToken(token: string): Promise<string | null> {
  const session = await prisma.authSession.findFirst({
    where: {
      tokenHash: hashOpaqueToken(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      userId: true,
    },
  });

  if (!session) {
    return null;
  }

  return session.userId;
}

function toUserId(externalKey: string): string {
  const digest = createHash("sha256").update(externalKey).digest("hex");
  return `user-${digest.slice(0, 24)}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return mismatch === 0;
}

export function isGoogleAuthEnabled(env: ReturnType<typeof getEnv>): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}
