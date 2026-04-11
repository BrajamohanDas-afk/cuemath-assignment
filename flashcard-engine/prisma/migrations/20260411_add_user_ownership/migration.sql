-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Seed default local user for pre-auth single-user data.
INSERT INTO "User" ("id", "externalKey", "createdAt", "updatedAt")
VALUES ('local-default-user', 'local-default', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Deck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'local-default-user',
    "title" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceHash" TEXT,
    "sourceText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastReviewAt" DATETIME,
    CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Deck" ("createdAt", "id", "lastReviewAt", "sourceFile", "sourceHash", "sourceText", "title", "updatedAt")
SELECT "createdAt", "id", "lastReviewAt", "sourceFile", "sourceHash", "sourceText", "title", "updatedAt" FROM "Deck";
DROP TABLE "Deck";
ALTER TABLE "new_Deck" RENAME TO "Deck";
CREATE INDEX "Deck_createdAt_idx" ON "Deck"("createdAt");
CREATE INDEX "Deck_userId_updatedAt_idx" ON "Deck"("userId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_externalKey_key" ON "User"("externalKey");
