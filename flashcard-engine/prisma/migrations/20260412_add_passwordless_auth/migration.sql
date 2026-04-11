-- CreateTable
CREATE TABLE IF NOT EXISTS "AuthCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    CONSTRAINT "AuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthCode_email_createdAt_idx" ON "AuthCode"("email", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthCode_userId_createdAt_idx" ON "AuthCode"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthCode_expiresAt_idx" ON "AuthCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthSession_userId_createdAt_idx" ON "AuthSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");
