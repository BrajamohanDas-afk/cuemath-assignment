import { CardState, ReviewRating, type Prisma } from "@prisma/client";
import { z } from "zod";
import { explainAnswerFromSource } from "@/lib/answer-explainer";
import { prisma } from "@/lib/prisma";
import { applyReviewRating } from "@/lib/review-scheduler";

const rateReviewSchema = z.object({
  deckId: z.string().min(1),
  cardId: z.string().min(1),
  rating: z.nativeEnum(ReviewRating),
  responseTimeMs: z.number().int().positive().max(120_000).optional(),
  sessionId: z.string().min(1).optional(),
});

const explainAnswerSchema = z.object({
  deckId: z.string().min(1),
  cardId: z.string().min(1),
});

export interface ReviewCardDto {
  id: string;
  deckId: string;
  deckTitle: string;
  type: string;
  front: string;
  back: string;
  difficulty: number;
  tags: string[];
  state: CardState;
  dueAt: Date;
}

export interface ReviewQueueDto {
  card: ReviewCardDto | null;
  dueCount: number;
  totalCardCount: number;
}

export interface SubmitReviewInput {
  deckId: string;
  cardId: string;
  rating: ReviewRating;
  responseTimeMs?: number;
  sessionId?: string;
}

export interface SubmitReviewResult {
  sessionId: string;
  queue: ReviewQueueDto;
}

export interface ExplainAnswerInput {
  deckId: string;
  cardId: string;
}

export interface ExplainAnswerResult {
  explanation: string;
  evidence: string[];
  provider: "openai" | "fallback";
  warning: string | null;
}

export class ReviewServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ReviewServiceError";
    this.statusCode = statusCode;
  }
}

export function parseSubmitReviewInput(raw: unknown): SubmitReviewInput {
  const parsed = rateReviewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ReviewServiceError("Invalid review payload.", 400);
  }

  return parsed.data;
}

export function parseExplainAnswerInput(raw: unknown): ExplainAnswerInput {
  const parsed = explainAnswerSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ReviewServiceError("Invalid explain request payload.", 400);
  }

  return parsed.data;
}

export async function getReviewQueue(
  deckId: string,
  options?: { excludeCardId?: string },
): Promise<ReviewQueueDto> {
  const now = new Date();

  const [totalCardCount, dueCount] = await Promise.all([
    prisma.card.count({
      where: { deckId },
    }),
    prisma.cardSchedule.count({
      where: {
        dueAt: { lte: now },
        card: { deckId },
      },
    }),
  ]);

  let nextCardRecord = await findNextDueCard(deckId, now, options?.excludeCardId);
  if (!nextCardRecord && options?.excludeCardId) {
    nextCardRecord = await findNextDueCard(deckId, now);
  }

  return {
    card: nextCardRecord ? toReviewCardDto(nextCardRecord) : null,
    dueCount,
    totalCardCount,
  };
}

async function findNextDueCard(deckId: string, now: Date, excludeCardId?: string) {
  return prisma.card.findFirst({
    where: {
      deckId,
      ...(excludeCardId ? { id: { not: excludeCardId } } : {}),
      schedule: {
        dueAt: { lte: now },
      },
    },
    include: {
      deck: {
        select: {
          title: true,
        },
      },
      schedule: true,
    },
    orderBy: [
      {
        schedule: {
          dueAt: "asc",
        },
      },
      { createdAt: "asc" },
    ],
  });
}

export async function submitReviewRating(
  input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
  const now = new Date();

  const card = await prisma.card.findUnique({
    where: { id: input.cardId },
    include: { schedule: true },
  });

  if (!card || card.deckId !== input.deckId) {
    throw new ReviewServiceError("Card not found for selected deck.", 404);
  }

  if (!card.schedule) {
    throw new ReviewServiceError("Card schedule is missing.", 409);
  }

  const scheduleUpdate = applyReviewRating(
    {
      state: card.schedule.state,
      intervalDays: card.schedule.intervalDays,
      easeFactor: card.schedule.easeFactor,
      repetition: card.schedule.repetition,
      lapses: card.schedule.lapses,
    },
    input.rating,
    now,
  );

  const sessionId = await prisma.$transaction(async (tx) => {
    const ensuredSessionId = input.sessionId
      ? await ensureSession(tx, input.sessionId, input.deckId)
      : await createSession(tx, input.deckId);

    await tx.cardSchedule.update({
      where: {
        cardId: input.cardId,
      },
      data: {
        state: scheduleUpdate.state,
        dueAt: scheduleUpdate.dueAt,
        intervalDays: scheduleUpdate.intervalDays,
        easeFactor: scheduleUpdate.easeFactor,
        repetition: scheduleUpdate.repetition,
        lapses: scheduleUpdate.lapses,
        lastReviewedAt: scheduleUpdate.lastReviewedAt,
      },
    });

    await tx.review.create({
      data: {
        cardId: input.cardId,
        rating: input.rating,
        responseTimeMs: input.responseTimeMs,
        qualityScore: toQualityScore(input.rating),
        nextDueAt: scheduleUpdate.dueAt,
        resultingState: scheduleUpdate.state,
      },
    });

    await tx.deck.update({
      where: {
        id: input.deckId,
      },
      data: {
        lastReviewAt: now,
      },
    });

    await updateSessionStats(tx, ensuredSessionId, input.rating, input.responseTimeMs);

    return ensuredSessionId;
  });

  const queue = await getReviewQueue(input.deckId);
  return {
    sessionId,
    queue,
  };
}

export async function explainCardAnswer(
  input: ExplainAnswerInput,
): Promise<ExplainAnswerResult> {
  const card = await prisma.card.findUnique({
    where: { id: input.cardId },
    select: {
      id: true,
      deckId: true,
      front: true,
      back: true,
      deck: {
        select: {
          title: true,
          sourceText: true,
        },
      },
    },
  });

  if (!card || card.deckId !== input.deckId) {
    throw new ReviewServiceError("Card not found for selected deck.", 404);
  }

  if (!card.deck.sourceText || card.deck.sourceText.trim().length === 0) {
    throw new ReviewServiceError(
      "No source text stored for this deck. Re-upload the PDF to enable explain.",
      422,
    );
  }

  return explainAnswerFromSource({
    deckTitle: card.deck.title,
    cardFront: card.front,
    cardBack: card.back,
    sourceText: card.deck.sourceText,
  });
}

async function createSession(
  tx: Prisma.TransactionClient,
  deckId: string,
): Promise<string> {
  const session = await tx.session.create({
    data: {
      deckId,
    },
    select: {
      id: true,
    },
  });

  return session.id;
}

async function ensureSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  deckId: string,
): Promise<string> {
  const existing = await tx.session.findUnique({
    where: { id: sessionId },
    select: { id: true, deckId: true, endedAt: true },
  });

  if (!existing || existing.deckId !== deckId || existing.endedAt) {
    return createSession(tx, deckId);
  }

  return existing.id;
}

async function updateSessionStats(
  tx: Prisma.TransactionClient,
  sessionId: string,
  rating: ReviewRating,
  responseTimeMs?: number,
) {
  const current = await tx.session.findUnique({
    where: { id: sessionId },
    select: { reviewed: true, correct: true, avgTimeMs: true },
  });

  if (!current) {
    return;
  }

  const reviewed = current.reviewed + 1;
  const correct = current.correct + (isCorrectRating(rating) ? 1 : 0);
  const avgTimeMs = computeNextAverage(
    current.avgTimeMs,
    current.reviewed,
    responseTimeMs,
  );

  await tx.session.update({
    where: { id: sessionId },
    data: {
      reviewed,
      correct,
      avgTimeMs,
    },
  });
}

function computeNextAverage(
  currentAverage: number | null,
  currentCount: number,
  responseTimeMs?: number,
): number | null {
  if (responseTimeMs === undefined) {
    return currentAverage;
  }

  if (currentAverage === null || currentCount <= 0) {
    return responseTimeMs;
  }

  const total = currentAverage * currentCount + responseTimeMs;
  return Math.round(total / (currentCount + 1));
}

function isCorrectRating(rating: ReviewRating): boolean {
  return rating === ReviewRating.GOOD || rating === ReviewRating.EASY;
}

function toQualityScore(rating: ReviewRating): number {
  switch (rating) {
    case ReviewRating.AGAIN:
      return 0;
    case ReviewRating.HARD:
      return 3;
    case ReviewRating.GOOD:
      return 4;
    case ReviewRating.EASY:
      return 5;
    default:
      return 0;
  }
}

function toReviewCardDto(record: {
  id: string;
  deckId: string;
  type: string;
  front: string;
  back: string;
  difficulty: number;
  tags: string | null;
  deck: { title: string };
  schedule: {
    state: CardState;
    dueAt: Date;
  } | null;
}): ReviewCardDto {
  const tags = record.tags
    ? record.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    : [];

  return {
    id: record.id,
    deckId: record.deckId,
    deckTitle: record.deck.title,
    type: record.type,
    front: record.front,
    back: record.back,
    difficulty: record.difficulty,
    tags,
    state: record.schedule?.state ?? CardState.NEW,
    dueAt: record.schedule?.dueAt ?? new Date(),
  };
}
