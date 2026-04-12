-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."CardType" AS ENUM ('CONCEPT', 'DEFINITION', 'CLOZE', 'EXAMPLE');

-- CreateEnum
CREATE TYPE "public"."CardState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "public"."ReviewRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateTable
CREATE TABLE "public"."Deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'local-default-user',
    "title" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceHash" TEXT,
    "sourceText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastReviewAt" TIMESTAMP(3),

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Card" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "type" "public"."CardType" NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardSchedule" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "state" "public"."CardState" NOT NULL DEFAULT 'NEW',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "repetition" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),

    CONSTRAINT "CardSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Review" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "rating" "public"."ReviewRating" NOT NULL,
    "responseTimeMs" INTEGER,
    "qualityScore" INTEGER,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDueAt" TIMESTAMP(3),
    "resultingState" "public"."CardState",

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reviewed" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "avgTimeMs" INTEGER,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deck_createdAt_idx" ON "public"."Deck"("createdAt");

-- CreateIndex
CREATE INDEX "Deck_userId_updatedAt_idx" ON "public"."Deck"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_externalKey_key" ON "public"."User"("externalKey");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "public"."AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_createdAt_idx" ON "public"."AuthSession"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_revokedAt_idx" ON "public"."AuthSession"("expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "Card_deckId_type_idx" ON "public"."Card"("deckId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CardSchedule_cardId_key" ON "public"."CardSchedule"("cardId");

-- CreateIndex
CREATE INDEX "CardSchedule_dueAt_idx" ON "public"."CardSchedule"("dueAt");

-- CreateIndex
CREATE INDEX "Review_cardId_answeredAt_idx" ON "public"."Review"("cardId", "answeredAt");

-- CreateIndex
CREATE INDEX "Session_deckId_startedAt_idx" ON "public"."Session"("deckId", "startedAt");

-- AddForeignKey
ALTER TABLE "public"."Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Card" ADD CONSTRAINT "Card_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "public"."Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardSchedule" ADD CONSTRAINT "CardSchedule_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "public"."Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
