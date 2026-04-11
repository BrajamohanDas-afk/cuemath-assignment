import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";

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
  const requestToken =
    request.headers.get("x-api-token")?.trim() ??
    request.cookies.get("app_api_token")?.value?.trim() ??
    "";

  if (env.APP_API_TOKEN) {
    if (!requestToken || !timingSafeEqual(requestToken, env.APP_API_TOKEN)) {
      throw new ApiAuthError(
        "Unauthorized. Provide x-api-token (or save token from the home page).",
        401,
      );
    }
    return ensureUserByExternalKey(`token:${fingerprintToken(requestToken)}`);
  }

  if (requestToken) {
    return ensureUserByExternalKey(`token:${fingerprintToken(requestToken)}`);
  }

  return ensureLocalDefaultUser();
}

export async function resolveServerUserId(): Promise<string> {
  const env = getEnv();
  if (env.APP_API_TOKEN) {
    return ensureUserByExternalKey(`token:${fingerprintToken(env.APP_API_TOKEN)}`);
  }
  return ensureLocalDefaultUser();
}

async function ensureLocalDefaultUser(): Promise<string> {
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

async function ensureUserByExternalKey(externalKey: string): Promise<string> {
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

function fingerprintToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
