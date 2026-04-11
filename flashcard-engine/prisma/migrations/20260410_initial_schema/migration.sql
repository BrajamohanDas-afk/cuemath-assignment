-- CreateTable
CREATE TABLE IF NOT EXISTS "Deck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceHash" TEXT,
    "sourceText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastReviewAt" DATETIME
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Card" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Card_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CardSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "dueAt" DATETIME NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "repetition" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    CONSTRAINT "CardSchedule_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "responseTimeMs" INTEGER,
    "qualityScore" INTEGER,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDueAt" DATETIME,
    "resultingState" TEXT,
    CONSTRAINT "Review_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deckId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "reviewed" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "avgTimeMs" INTEGER,
    CONSTRAINT "Session_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deck_createdAt_idx" ON "Deck"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Card_deckId_type_idx" ON "Card"("deckId", "type");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CardSchedule_cardId_key" ON "CardSchedule"("cardId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CardSchedule_dueAt_idx" ON "CardSchedule"("dueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Review_cardId_answeredAt_idx" ON "Review"("cardId", "answeredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Session_deckId_startedAt_idx" ON "Session"("deckId", "startedAt");
