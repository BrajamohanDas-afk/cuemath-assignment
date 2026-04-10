import { CardType } from "@prisma/client";
import { z } from "zod";
import { getEnv } from "@/lib/env";

const SUPPORTED_CARD_TYPES = [
  CardType.CONCEPT,
  CardType.DEFINITION,
  CardType.CLOZE,
  CardType.EXAMPLE,
] as const;

type SupportedCardType = (typeof SUPPORTED_CARD_TYPES)[number];

const aiCardSchema = z.object({
  type: z.enum(SUPPORTED_CARD_TYPES),
  front: z.string().min(8).max(260),
  back: z.string().min(12).max(500),
  difficulty: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().min(1).max(24)).max(6).optional(),
});

const aiResponseSchema = z.object({
  cards: z.array(aiCardSchema).min(1).max(24),
});

export interface GeneratedFlashcard {
  type: SupportedCardType;
  front: string;
  back: string;
  difficulty: number;
  tags: string[];
}

export interface GenerationResult {
  cards: GeneratedFlashcard[];
  provider: "openai" | "fallback";
  warning: string | null;
}

interface GenerationInput {
  deckTitle: string;
  sourceText: string;
  maxCards?: number;
}

interface OpenAiChatChoice {
  message?: {
    content?: string;
  };
}

interface OpenAiChatResponse {
  choices?: OpenAiChatChoice[];
}

export async function generateFlashcardsFromText(
  input: GenerationInput,
): Promise<GenerationResult> {
  const maxCards = clamp(input.maxCards ?? 16, 6, 24);
  const sourceText = input.sourceText.trim();

  const aiAttempt = await tryOpenAiGeneration({
    deckTitle: input.deckTitle,
    sourceText: sourceText.slice(0, 16000),
    maxCards,
  });

  if (aiAttempt.cards.length > 0) {
    return aiAttempt;
  }

  return {
    cards: buildFallbackCards(sourceText, maxCards),
    provider: "fallback",
    warning: aiAttempt.warning,
  };
}

async function tryOpenAiGeneration(input: {
  deckTitle: string;
  sourceText: string;
  maxCards: number;
}): Promise<GenerationResult> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    return {
      cards: [],
      provider: "openai",
      warning: "OPENAI_API_KEY is not set. Used local fallback generation.",
    };
  }

  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You generate high-quality study flashcards. Return only valid JSON.",
          },
          {
            role: "user",
            content: buildPrompt(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        cards: [],
        provider: "openai",
        warning: `OpenAI request failed with status ${response.status}. Used local fallback generation.`,
      };
    }

    const payload = (await response.json()) as OpenAiChatResponse;
    const rawContent = payload.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      return {
        cards: [],
        provider: "openai",
        warning: "OpenAI returned empty content. Used local fallback generation.",
      };
    }

    const parsed = aiResponseSchema.safeParse(parseJsonContent(rawContent));
    if (!parsed.success) {
      return {
        cards: [],
        provider: "openai",
        warning: "OpenAI returned invalid JSON schema. Used local fallback generation.",
      };
    }

    return {
      cards: normalizeCards(parsed.data.cards, input.maxCards),
      provider: "openai",
      warning: null,
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        cards: [],
        provider: "openai",
        warning: `OpenAI request timed out after ${timeoutMs / 1000} seconds. Used local fallback generation.`,
      };
    }

    return {
      cards: [],
      provider: "openai",
      warning: "OpenAI request error. Used local fallback generation.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildPrompt(input: {
  deckTitle: string;
  sourceText: string;
  maxCards: number;
}): string {
  return [
    `Deck title: ${input.deckTitle}`,
    `Generate ${input.maxCards} flashcards from the provided study material.`,
    "Priorities:",
    "- Cover key concepts, definitions, relationships, and examples.",
    "- Keep front concise and test recall.",
    "- Keep back clear and practical.",
    "- Mix card types: CONCEPT, DEFINITION, CLOZE, EXAMPLE.",
    "- difficulty is 1 (easy) to 5 (hard).",
    'Return JSON only in format: {"cards":[{"type":"CONCEPT","front":"...","back":"...","difficulty":3,"tags":["topic"]}]}',
    "Study material:",
    input.sourceText,
  ].join("\n");
}

function buildFallbackCards(sourceText: string, maxCards: number): GeneratedFlashcard[] {
  const sentences = sourceText
    .split(/[\n.!?]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 30);

  const uniqueSentences = Array.from(new Set(sentences)).slice(0, maxCards * 2);
  const cards: GeneratedFlashcard[] = [];

  for (const sentence of uniqueSentences) {
    if (cards.length >= maxCards) {
      break;
    }

    const keyword = extractKeyword(sentence);
    cards.push({
      type: CardType.CONCEPT,
      front: `What is the key idea in: "${trimForCard(sentence, 120)}"?`,
      back: sentence,
      difficulty: 2,
      tags: keyword ? [keyword] : ["core"],
    });

    if (cards.length >= maxCards) {
      break;
    }

    if (keyword) {
      cards.push({
        type: CardType.CLOZE,
        front: sentence.replace(new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i"), "_____"),
        back: keyword,
        difficulty: 3,
        tags: ["cloze", keyword],
      });
    }
  }

  return normalizeCards(cards, maxCards);
}

function normalizeCards(
  cards: Array<{
    type: SupportedCardType;
    front: string;
    back: string;
    difficulty?: number;
    tags?: string[];
  }>,
  maxCards: number,
): GeneratedFlashcard[] {
  const seen = new Set<string>();
  const normalized: GeneratedFlashcard[] = [];

  for (const card of cards) {
    if (normalized.length >= maxCards) {
      break;
    }

    const front = trimForCard(card.front, 260);
    const back = trimForCard(card.back, 500);
    if (front.length < 8 || back.length < 12) {
      continue;
    }

    const dedupeKey = `${front.toLowerCase()}|${back.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    normalized.push({
      type: card.type,
      front,
      back,
      difficulty: clamp(card.difficulty ?? 2, 1, 5),
      tags: sanitizeTags(card.tags ?? []),
    });
  }

  return normalized;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(withoutFence);
  }
  return JSON.parse(trimmed);
}

function sanitizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
        .slice(0, 4),
    ),
  );
}

function extractKeyword(sentence: string): string | null {
  const tokens = sentence
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 5);

  return tokens[0]?.toLowerCase() ?? null;
}

function trimForCard(value: string, maxLen: number): string {
  if (value.length <= maxLen) {
    return value.trim();
  }
  return `${value.slice(0, maxLen - 3).trim()}...`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
