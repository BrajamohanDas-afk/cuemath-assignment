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
  front: z.string().min(8).max(180),
  back: z.string().min(16).max(700),
  difficulty: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string().min(1).max(24)).max(6).optional(),
});

const aiResponseSchema = z.object({
  cards: z.array(aiCardSchema).min(1).max(24),
});

const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  required: ["cards"],
  properties: {
    cards: {
      type: "ARRAY",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "OBJECT",
        required: ["type", "front", "back"],
        properties: {
          type: {
            type: "STRING",
            enum: [...SUPPORTED_CARD_TYPES],
          },
          front: { type: "STRING" },
          back: { type: "STRING" },
          difficulty: { type: "INTEGER", minimum: 1, maximum: 5 },
          tags: {
            type: "ARRAY",
            maxItems: 6,
            items: { type: "STRING" },
          },
        },
      },
    },
  },
} as const;
const GEMINI_LOG_PREFIX = "[gemini:flashcard-generation]";

export interface GeneratedFlashcard {
  type: SupportedCardType;
  front: string;
  back: string;
  difficulty: number;
  tags: string[];
  qualityScore: number;
}

export interface GenerationResult {
  cards: GeneratedFlashcard[];
  provider: "gemini";
  warning: string | null;
}

export type GenerationDifficulty = "easy" | "medium" | "hard";

type QuestionFamily =
  | "definition_foundation"
  | "explanation_understanding"
  | "difference_comparison"
  | "identification"
  | "output_based"
  | "application_based"
  | "use_case"
  | "error_debugging"
  | "step_by_step"
  | "concept_linking"
  | "rules_constraints"
  | "advantages_disadvantages"
  | "cause_effect"
  | "scenario_based"
  | "best_practice"
  | "fill_missing"
  | "keyword_based"
  | "real_life_analogy"
  | "quick_fact"
  | "deep_why"
  | "reverse_question"
  | "trick_question"
  | "memory_hook"
  | "build_design";

const QUESTION_FAMILIES: readonly QuestionFamily[] = [
  "definition_foundation",
  "explanation_understanding",
  "difference_comparison",
  "identification",
  "output_based",
  "application_based",
  "use_case",
  "error_debugging",
  "step_by_step",
  "concept_linking",
  "rules_constraints",
  "advantages_disadvantages",
  "cause_effect",
  "scenario_based",
  "best_practice",
  "fill_missing",
  "keyword_based",
  "real_life_analogy",
  "quick_fact",
  "deep_why",
  "reverse_question",
  "trick_question",
  "memory_hook",
  "build_design",
] as const;

const HIGH_QUALITY_FALLBACK_TEMPLATE_IDS = new Set([
  "foundation_what_is",
  "foundation_define_simple",
  "understanding_explain",
  "output_predict",
  "application_use_in_scenario",
  "use_case_when_should",
  "steps_process",
  "rules_constraints",
  "pros_cons",
  "cause_effect",
  "fill_missing",
  "memory_hook",
]);

type DefinitionPair = {
  term: string;
  definition: string;
};

interface GenerationInput {
  deckTitle: string;
  sourceText: string;
  maxCards?: number;
  difficulty?: GenerationDifficulty;
}

interface GeminiResponsePart {
  text?: string;
}

interface GeminiResponseCandidate {
  content?: {
    parts?: GeminiResponsePart[];
  };
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiResponseCandidate[];
}

type QuestionContext = {
  sentence: string;
  answerText: string;
  primaryTerm: string;
  secondaryTerm: string | null;
  acronym: string | null;
  codeHint: string | null;
  tags: string[];
};

type QuestionTemplate = {
  id: string;
  family: QuestionFamily;
  cardType: SupportedCardType;
  difficultyOffset: number;
  requiresSecondary?: boolean;
  requiresAcronym?: boolean;
  build: (ctx: QuestionContext) => string;
  buildBack?: (ctx: QuestionContext) => string;
};

export async function generateFlashcardsFromText(
  input: GenerationInput,
): Promise<GenerationResult> {
  const maxCards = clamp(input.maxCards ?? 16, 6, 24);
  const sourceText = input.sourceText.trim();
  const difficulty = input.difficulty ?? "medium";

  const aiAttempt = await tryGeminiGeneration({
    deckTitle: input.deckTitle,
    sourceText,
    maxCards,
    difficulty,
  });

  return aiAttempt;
}

async function tryGeminiGeneration(input: {
  deckTitle: string;
  sourceText: string;
  maxCards: number;
  difficulty: GenerationDifficulty;
}): Promise<GenerationResult> {
  const modelReadySource = buildModelReadySource(input.sourceText);
  const sourceChunks = splitSourceIntoChunks(modelReadySource, {
    maxChars: 5_500,
    maxChunks: 2,
  });
  const chunkBudgets = distributeCardBudget(input.maxCards + 3, sourceChunks.length);
  const results: GenerationResult[] = [];
  for (let chunkIndex = 0; chunkIndex < sourceChunks.length; chunkIndex += 1) {
    const result = await tryGeminiGenerationForChunk({
      deckTitle: input.deckTitle,
      sourceText: sourceChunks[chunkIndex] ?? "",
      maxCards: chunkBudgets[chunkIndex] ?? input.maxCards,
      difficulty: input.difficulty,
      chunkLabel: `Chunk ${chunkIndex + 1} / ${sourceChunks.length}`,
    });
    results.push(result);
    if (isRateLimitWarning(result.warning)) {
      break;
    }
  }

  const collectedCards = results.flatMap((result) => result.cards);
  const warnings = summarizeWarnings(
    results
    .map((result) => result.warning)
    .filter((warning): warning is string => Boolean(warning)),
  );

  if (collectedCards.length > 0) {
    const normalizedCards = prioritizeCoverageAndQuality(
      collectedCards,
      input.maxCards,
    );
    if (normalizedCards.length > 0) {
      return {
        cards: normalizedCards,
        provider: "gemini",
        warning: warnings || null,
      };
    }

    return {
      cards: [],
      provider: "gemini",
      warning:
        warnings ||
        "Gemini generated content, but no card passed quality validation. Try another PDF or reduce card count.",
    };
  }

  return {
    cards: [],
    provider: "gemini",
    warning:
      warnings ||
      "Gemini generation produced no usable cards.",
  };
}

async function tryGeminiGenerationForChunk(input: {
  deckTitle: string;
  sourceText: string;
  maxCards: number;
  difficulty: GenerationDifficulty;
  chunkLabel: string;
}): Promise<GenerationResult> {
  const env = getEnv();
  if (!env.GEMINI_API_KEY || !env.ALLOW_EXTERNAL_LLM) {
    return {
      cards: [],
      provider: "gemini",
      warning:
        "Gemini is required for card generation but is not configured (missing GEMINI_API_KEY or ALLOW_EXTERNAL_LLM=false).",
    };
  }

  const timeoutMs = 45_000;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptMaxCards =
      attempt === 1 ? input.maxCards : Math.max(6, Math.floor(input.maxCards * 0.7));
    const attemptSourceText =
      attempt === 1 ? input.sourceText : input.sourceText.slice(0, 3_800);
    const maxOutputTokens = clamp(attemptMaxCards * 260, 2_048, 8_192);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.info(
        `${GEMINI_LOG_PREFIX} request`,
        JSON.stringify({
          chunk: input.chunkLabel,
          attempt,
          maxAttempts,
          model: env.GEMINI_MODEL,
          maxCards: attemptMaxCards,
          difficulty: input.difficulty,
          sourceChars: attemptSourceText.length,
          maxOutputTokens,
        }),
      );
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt({
                    ...input,
                    sourceText: attemptSourceText,
                    maxCards: attemptMaxCards,
                  }),
                },
              ],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text: "You generate high-quality study flashcards. Return only valid JSON.",
              },
            ],
          },
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            maxOutputTokens,
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
        },
      );
      console.info(
        `${GEMINI_LOG_PREFIX} response`,
        JSON.stringify({
          chunk: input.chunkLabel,
          attempt,
          status: response.status,
          requestId:
            response.headers.get("x-request-id") ??
            response.headers.get("x-goog-request-id"),
          retryAfter: response.headers.get("retry-after"),
        }),
      );

      if (response.status === 429 && attempt < maxAttempts) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        await sleep(retryAfterMs ?? getBackoffMs(attempt));
        continue;
      }

      if (response.status >= 500 && attempt < maxAttempts) {
        await sleep(getBackoffMs(attempt));
        continue;
      }

      if (!response.ok) {
        const errorDetails = await extractGeminiErrorDetails(response);
        console.error(
          `${GEMINI_LOG_PREFIX} error`,
          JSON.stringify({
            chunk: input.chunkLabel,
            attempt,
            status: response.status,
            message: errorDetails.message || null,
            body: errorDetails.body || null,
          }),
        );
        if (response.status === 429) {
          const suffix = errorDetails.message ? ` ${errorDetails.message}` : "";
          return {
            cards: [],
            provider: "gemini",
            warning:
              `Gemini rate limit/quota reached (429). Wait 30-60 seconds and retry, or increase your Gemini project limits.${suffix}`.trim(),
          };
        }
        return {
          cards: [],
          provider: "gemini",
          warning: `Gemini request failed with status ${response.status}.${errorDetails.message ? ` ${errorDetails.message}` : ""}`.trim(),
        };
      }

      const payload = (await response.json()) as GeminiGenerateContentResponse;
      const rawContent = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim();
      console.info(
        `${GEMINI_LOG_PREFIX} parsed`,
        JSON.stringify({
          chunk: input.chunkLabel,
          attempt,
          choices: payload.candidates?.length ?? 0,
          contentLength: rawContent?.length ?? 0,
          contentPreview: rawContent ? trimForCard(rawContent, 180) : null,
        }),
      );

      if (!rawContent) {
        return {
          cards: [],
          provider: "gemini",
          warning: "Gemini returned empty content.",
        };
      }

      const parsed = aiResponseSchema.safeParse(parseJsonContentWithRepair(rawContent));
      if (!parsed.success) {
        return {
          cards: [],
          provider: "gemini",
          warning: "Gemini returned invalid JSON schema.",
        };
      }

      const strictCards = normalizeCards(parsed.data.cards, attemptMaxCards, 55);
      if (strictCards.length > 0) {
        return {
          cards: strictCards,
          provider: "gemini",
          warning: null,
        };
      }

      const relaxedCards = normalizeCards(parsed.data.cards, attemptMaxCards, 45);
      if (relaxedCards.length > 0) {
        console.warn(
          `${GEMINI_LOG_PREFIX} quality`,
          JSON.stringify({
            chunk: input.chunkLabel,
            attempt,
            parsedCards: parsed.data.cards.length,
            strictCards: strictCards.length,
            relaxedCards: relaxedCards.length,
          }),
        );
        return {
          cards: relaxedCards,
          provider: "gemini",
          warning:
            "Gemini response required relaxed quality filtering to produce usable cards.",
        };
      }

      const rescuedCards = rescueCardsFromModelOutput(
        parsed.data.cards,
        attemptMaxCards,
      );
      if (rescuedCards.length > 0) {
        console.warn(
          `${GEMINI_LOG_PREFIX} quality`,
          JSON.stringify({
            chunk: input.chunkLabel,
            attempt,
            parsedCards: parsed.data.cards.length,
            strictCards: strictCards.length,
            relaxedCards: relaxedCards.length,
            rescuedCards: rescuedCards.length,
          }),
        );
        return {
          cards: rescuedCards,
          provider: "gemini",
          warning:
            "Gemini response required rescue normalization because strict quality checks filtered all cards.",
        };
      }

      return {
        cards: [],
        provider: "gemini",
        warning: "Gemini returned cards but none passed quality validation.",
      };
    } catch (error) {
      console.error(
        `${GEMINI_LOG_PREFIX} exception`,
        JSON.stringify({
          chunk: input.chunkLabel,
          attempt,
          type: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      if (isAbortError(error) && attempt < maxAttempts) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
      if (!isAbortError(error) && attempt < maxAttempts) {
        await sleep(getBackoffMs(attempt));
        continue;
      }

      if (isAbortError(error)) {
        return {
          cards: [],
          provider: "gemini",
          warning: `Gemini request timed out after ${timeoutMs / 1000} seconds.`,
        };
      }

      return {
        cards: [],
        provider: "gemini",
        warning: "Gemini request error.",
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    cards: [],
    provider: "gemini",
    warning: "Gemini request failed after multiple retries.",
  };
}

function buildPrompt(input: {
  deckTitle: string;
  sourceText: string;
  maxCards: number;
  difficulty: GenerationDifficulty;
  chunkLabel?: string;
}): string {
  return [
    `Deck title: ${input.deckTitle}`,
    input.chunkLabel ? `Source segment: ${input.chunkLabel}` : null,
    `Generate ${input.maxCards} flashcards from the provided study material.`,
    `Target difficulty: ${input.difficulty.toUpperCase()}.`,
    `Question families available: ${QUESTION_FAMILIES.join(", ")}.`,
    "Priorities:",
    "- Cover key concepts and understanding depth.",
    "- Use direct question/answer cards only.",
    "- Keep front concise and test recall (target <= 90 characters).",
    "- Keep back clear and compact (target <= 280 characters).",
    "- Do not include raw data dumps, long numeric tables, or repeated examples.",
    "- Do not end answers with trailing connectors like and/or/while/because.",
    "- Mix card types: CONCEPT, DEFINITION, CLOZE, EXAMPLE.",
    "- Add one family marker in tags like family:definition_foundation.",
    "- difficulty is 1 (easy) to 5 (hard) and should match target difficulty.",
    'Return JSON only in format: {"cards":[{"type":"CONCEPT","front":"...","back":"...","difficulty":3,"tags":["topic","family:definition_foundation"]}]}',
    "Study material:",
    input.sourceText.slice(0, 9_000),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildFallbackCards(
  sourceText: string,
  maxCards: number,
  difficulty: GenerationDifficulty,
): GeneratedFlashcard[] {
  const chunks = splitSourceIntoChunks(sourceText, {
    maxChars: 3_800,
    maxChunks: 8,
  });
  const budgets = distributeCardBudget(maxCards * 2, chunks.length);
  const cards: GeneratedFlashcard[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    cards.push(
      ...buildFallbackCardsForChunk(
        chunks[index] ?? "",
        budgets[index] ?? maxCards,
        difficulty,
      ),
    );
  }

  return normalizeCards(cards, maxCards);
}

const fallbackCardBuilderRetainedForFutureUse = buildFallbackCards;
void fallbackCardBuilderRetainedForFutureUse;

function buildFallbackCardsForChunk(
  sourceText: string,
  maxCards: number,
  difficulty: GenerationDifficulty,
): GeneratedFlashcard[] {
  const uniqueSentences = collectFallbackCandidates(sourceText).slice(0, maxCards * 4);
  const cards: GeneratedFlashcard[] = [];
  const targetDifficulty = getFallbackDifficulty(difficulty);
  let templateCursor = 0;

  for (const sentence of uniqueSentences) {
    if (cards.length >= maxCards) {
      break;
    }

    const cleanedSentence = sanitizeCardText(sentence);
    const definitionPair = extractDefinitionPair(cleanedSentence);
    const context = buildQuestionContext(cleanedSentence, definitionPair);
    const templates = getApplicableTemplates(context);
    if (templates.length === 0) {
      continue;
    }

    const template = templates[templateCursor % templates.length];
    templateCursor += 1;

    const front = template.build(context);
    const back = template.buildBack ? template.buildBack(context) : context.answerText;

    cards.push({
      type: template.cardType,
      front,
      back,
      difficulty: clamp(targetDifficulty + template.difficultyOffset, 1, 5),
      tags: sanitizeTags([...context.tags, `family:${template.family}`, template.id]),
      qualityScore: 0,
    });
  }

  return cards;
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
  minQualityScore = 55,
): GeneratedFlashcard[] {
  const seen = new Set<string>();
  const normalized: GeneratedFlashcard[] = [];

  for (const card of cards) {
    const front = normalizeFrontText(card.front);
    const back = normalizeBackText(card.back);
    const minBackLength = card.type === CardType.CLOZE ? 4 : 12;

    if (front.length < 8 || back.length < minBackLength) {
      continue;
    }
    if (isLowQualityFront(front)) {
      continue;
    }
    if (isIncompleteAnswer(back)) {
      continue;
    }
    if (isLikelyListDump(back)) {
      continue;
    }

    const skipPairCheck = /^Given this answer:/i.test(front);
    if (!skipPairCheck && isLowQualityPair(front, back)) {
      continue;
    }

    const dedupeKey = `${front.toLowerCase()}|${back.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const qualityScore = estimateCardQuality(front, back, card.type);
    if (qualityScore < minQualityScore) {
      continue;
    }

    normalized.push({
      type: card.type,
      front,
      back,
      difficulty: clamp(card.difficulty ?? 2, 1, 5),
      tags: sanitizeTags([...(card.tags ?? []), `quality:${qualityScore}`]),
      qualityScore,
    });
  }

  return prioritizeCoverageAndQuality(normalized, maxCards);
}

function rescueCardsFromModelOutput(
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
  const rescued: GeneratedFlashcard[] = [];

  for (const card of cards) {
    const front = normalizeFrontText(card.front);
    const back = normalizeBackText(card.back);
    const minBackLength = card.type === CardType.CLOZE ? 4 : 10;

    if (front.length < 8 || back.length < minBackLength) {
      continue;
    }
    if (isLowQualityFront(front)) {
      continue;
    }

    const dedupeKey = `${front.toLowerCase()}|${back.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const qualityScore = estimateCardQuality(front, back, card.type);
    rescued.push({
      type: card.type,
      front,
      back,
      difficulty: clamp(card.difficulty ?? 2, 1, 5),
      tags: sanitizeTags([
        ...(card.tags ?? []),
        `quality:${qualityScore}`,
        "quality:rescued",
      ]),
      qualityScore,
    });
  }

  return prioritizeCoverageAndQuality(rescued, maxCards);
}

export function estimateCardQuality(
  front: string,
  back: string,
  type: SupportedCardType,
): number {
  let score = 50;

  const frontWords = front.trim().split(/\s+/).filter(Boolean).length;
  const backWords = back.trim().split(/\s+/).filter(Boolean).length;

  if (frontWords >= 4 && frontWords <= 18) {
    score += 10;
  }
  if (backWords >= 12 && backWords <= 90) {
    score += 16;
  }
  if (/[?]$/.test(front)) {
    score += 8;
  }
  if (/^(what|why|how|when|where|which|define|difference)\b/i.test(front)) {
    score += 8;
  }
  if (type === CardType.EXAMPLE || type === CardType.CLOZE) {
    score += 4;
  }

  if (backWords < 8 || back.length < 40) {
    score -= 20;
  }
  if (front.length > 220) {
    score -= 16;
  }
  if (isLowQualityPair(front, back)) {
    score -= 30;
  }
  if (isIncompleteAnswer(back)) {
    score -= 24;
  }
  if (hasExcessiveNumericNoise(back)) {
    score -= 22;
  }

  return clamp(score, 0, 100);
}

function prioritizeCoverageAndQuality(
  cards: GeneratedFlashcard[],
  maxCards: number,
): GeneratedFlashcard[] {
  const sorted = [...cards].sort((a, b) => b.qualityScore - a.qualityScore);
  const byType = new Map<SupportedCardType, GeneratedFlashcard[]>(
    SUPPORTED_CARD_TYPES.map((type) => [type, []]),
  );

  for (const card of sorted) {
    byType.get(card.type)?.push(card);
  }

  const selected: GeneratedFlashcard[] = [];
  const selectedKeys = new Set<string>();

  for (const type of SUPPORTED_CARD_TYPES) {
    const top = byType.get(type)?.[0];
    if (!top) {
      continue;
    }

    const key = `${top.front.toLowerCase()}|${top.back.toLowerCase()}`;
    if (!selectedKeys.has(key)) {
      selected.push(top);
      selectedKeys.add(key);
    }
  }

  for (const card of sorted) {
    if (selected.length >= maxCards) {
      break;
    }
    const key = `${card.front.toLowerCase()}|${card.back.toLowerCase()}`;
    if (selectedKeys.has(key)) {
      continue;
    }
    selected.push(card);
    selectedKeys.add(key);
  }

  return selected.slice(0, maxCards);
}

function parseJsonContentWithRepair(content: string): unknown {
  const parseAttempt = (value: string): unknown => {
    const trimmed = value.trim();
    if (trimmed.startsWith("```")) {
      const withoutFence = trimmed
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/i, "")
        .trim();
      return JSON.parse(withoutFence);
    }
    return JSON.parse(trimmed);
  };

  try {
    return parseAttempt(content);
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
    const repaired = repairPossiblyTruncatedJson(content);
    return parseAttempt(repaired);
  }
}

function repairPossiblyTruncatedJson(content: string): string {
  const raw = content.trim();
  const stripped = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
    : raw;

  let output = stripped;
  let inString = false;
  let escaped = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (const ch of stripped) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      openBraces += 1;
    } else if (ch === "}" && openBraces > 0) {
      openBraces -= 1;
    } else if (ch === "[") {
      openBrackets += 1;
    } else if (ch === "]" && openBrackets > 0) {
      openBrackets -= 1;
    }
  }

  if (inString) {
    output += "\"";
  }
  if (/:\s*$/.test(output)) {
    output += "\"\"";
  }

  output = output.replace(/,\s*$/g, "");
  output += "]".repeat(openBrackets);
  output += "}".repeat(openBraces);
  output = output.replace(/,\s*([}\]])/g, "$1");

  return output;
}

function sanitizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0)
        .slice(0, 6),
    ),
  );
}

function trimForCard(value: string, maxLen: number): string {
  if (value.length <= maxLen) {
    return value.trim();
  }
  return `${value.slice(0, maxLen - 3).trim()}...`;
}

function sanitizeCardText(value: string): string {
  return value
    .replace(/[\u2022\u25CF\u25E6\u25AA\u2023\u2219\u00B7]/g, " ")
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, "\"")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/\u00C2/g, "")
    .replace(/^[\s"'`.,;:!?-]+/, "")
    .replace(/\s+[;:,.-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeFrontText(value: string): string {
  const cleaned = sanitizeCardText(value)
    .replace(/^(q|question)\s*[:\-]\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const normalizedTermQuote = cleaned.replace(
    /^(What is\s+["']?)(.+?)\s+it(["']?\?)$/i,
    "$1$2$3",
  );
  return trimForCard(normalizedTermQuote, 140);
}

function normalizeBackText(value: string): string {
  let cleaned = sanitizeCardText(value);

  const exampleIndex = cleaned.search(/\b(?:Ex|Example)\s*:/i);
  if (exampleIndex > 48) {
    cleaned = cleaned.slice(0, exampleIndex).trim();
  }

  if (cleaned.length > 220 && /(?:\bmean\s*=|\bmedian\s*=|\bmode\s*=)/i.test(cleaned)) {
    cleaned = cleaned.split(/(?:\bmean\s*=|\bmedian\s*=|\bmode\s*=)/i)[0]?.trim() ?? cleaned;
  }

  if (hasExcessiveNumericNoise(cleaned)) {
    const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence && firstSentence.length >= 12) {
      cleaned = firstSentence;
    }
  }

  if (isLikelyListDump(cleaned)) {
    const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence && firstSentence.length >= 20) {
      cleaned = firstSentence;
    } else {
      const compactClause = cleaned.split(/[;,:]/)[0]?.trim();
      if (compactClause && compactClause.length >= 20) {
        cleaned = compactClause;
      }
    }
  }

  return trimForCard(cleaned, 320);
}

function hasExcessiveNumericNoise(value: string): boolean {
  const numberTokens = value.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  const commaCount = (value.match(/,/g) ?? []).length;
  return numberTokens.length >= 8 || (numberTokens.length >= 5 && commaCount >= 6);
}

function isLikelyListDump(value: string): boolean {
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const commaCount = (value.match(/,/g) ?? []).length;
  const semicolonCount = (value.match(/;/g) ?? []).length;
  const colonCount = (value.match(/:/g) ?? []).length;
  const hasManyDelimiters = commaCount + semicolonCount + colonCount >= 7;
  const hasEnumerationPattern =
    /(?:\bexample\b|\bcase\b|\bdesign\b|\btesting\b|\bmean\b|\bmedian\b|\bmode\b)/i.test(
      value,
    ) && commaCount >= 4;
  return (words >= 48 && hasManyDelimiters) || (words >= 42 && hasEnumerationPattern);
}

function buildModelReadySource(sourceText: string): string {
  const candidates = collectFallbackCandidates(sourceText).slice(0, 120);
  if (candidates.length >= 12) {
    return candidates.join("\n");
  }
  return reflowWrappedLines(sourceText);
}

function collectFallbackCandidates(sourceText: string): string[] {
  const reflowedText = reflowWrappedLines(sourceText);
  const chunks = reflowedText.match(/[^.!?]+[.!?]?/g) ?? [];
  const cleaned = chunks
    .map((chunk) => sanitizeCardText(chunk))
    .map(ensureTerminalPunctuation)
    .filter((chunk) => chunk.length >= 40)
    .filter((chunk) => chunk.split(/\s+/).length >= 8)
    .filter((chunk) => !endsWithConnector(chunk))
    .filter((chunk) => !endsWithWeakTerm(chunk))
    .filter((chunk) => !isHeadingLikeChunk(chunk))
    .filter((chunk) => !isSlideHeadingNoise(chunk))
    .filter((chunk) => !hasAuthorByline(chunk))
    .filter((chunk) => !hasPdfNoise(chunk))
    .filter((chunk) => !hasExcessiveNumericNoise(chunk))
    .filter((chunk) => hasStatementVerb(chunk))
    .filter((chunk) => /[A-Za-z]{3,}/.test(chunk));

  return Array.from(new Set(cleaned));
}

function reflowWrappedLines(sourceText: string): string {
  const lines = sourceText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => sanitizeCardText(line))
    .filter(Boolean);

  const merged: string[] = [];
  let buffer = "";

  for (const line of lines) {
    if (!buffer) {
      buffer = line;
      continue;
    }

    if (shouldJoinLines(buffer, line)) {
      buffer = `${buffer} ${line}`.replace(/\s{2,}/g, " ").trim();
      continue;
    }

    merged.push(buffer);
    buffer = line;
  }

  if (buffer) {
    merged.push(buffer);
  }

  return merged.join("\n");
}

function splitSourceIntoChunks(
  sourceText: string,
  options: { maxChars: number; maxChunks: number },
): string[] {
  const normalized = reflowWrappedLines(sourceText);
  const lines = normalized
    .split("\n")
    .map((line) => sanitizeCardText(line))
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [sourceText.slice(0, options.maxChars)];
  }

  const chunks: string[] = [];
  let buffer = "";

  for (const line of lines) {
    const isHeading = isLikelyHeading(line);
    const canSplitOnHeading =
      isHeading && buffer.length >= Math.floor(options.maxChars * 0.55);
    const wouldOverflow = buffer.length + line.length + 1 > options.maxChars;

    if ((canSplitOnHeading || wouldOverflow) && buffer.length > 0) {
      chunks.push(buffer.trim());
      buffer = line;
      continue;
    }

    buffer = buffer ? `${buffer} ${line}` : line;
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim());
  }

  const uniqueChunks = Array.from(new Set(chunks.map((chunk) => chunk.trim()))).filter(
    (chunk) => chunk.length > 0,
  );

  if (uniqueChunks.length === 0) {
    return [sourceText.slice(0, options.maxChars)];
  }

  return uniqueChunks.slice(0, options.maxChunks);
}

function distributeCardBudget(totalCards: number, bucketCount: number): number[] {
  const count = Math.max(1, bucketCount);
  const base = Math.max(1, Math.floor(totalCards / count));
  const remainder = Math.max(0, totalCards - base * count);

  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function shouldJoinLines(current: string, next: string): boolean {
  if (isLikelyHeading(current) || isLikelyHeading(next)) {
    return false;
  }

  if (!/[.!?]$/.test(current)) {
    return true;
  }

  if (/^[a-z]/.test(next)) {
    return true;
  }

  return /^(and|or|but|because|which|that|where|while)\b/i.test(next);
}

function isLikelyHeading(value: string): boolean {
  const words = value.split(/\s+/);
  if (words.length > 8) {
    return false;
  }

  const lettersOnly = value.replace(/[^A-Za-z]/g, "");
  return lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase();
}

function ensureTerminalPunctuation(value: string): string {
  if (!value) {
    return value;
  }
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function endsWithConnector(value: string): boolean {
  const lowered = value.toLowerCase().trim();
  return /\b(and|or|but|with|to|of|for|in|on|at|by|from|into|about|as|while|because|although|though|whereas|since)$/.test(
    lowered,
  );
}

function endsWithWeakTerm(value: string): boolean {
  const lowered = value.toLowerCase().trim();
  return /\b(is|are|was|were|be|been|being|has|have|had|can|could|should|would|will|shall|may|might|must|this|that|these|those|their|its|our|your)\.?$/.test(
    lowered,
  );
}

function extractDefinitionPair(value: string): DefinitionPair | null {
  const cleaned = sanitizeCardText(value);
  const match = cleaned.match(
    /^([A-Za-z][A-Za-z0-9()\/ -]{2,80})\s+(is|are|refers to|means|describes)\s+(.+)$/i,
  );

  if (!match) {
    return null;
  }

  const rawTerm = sanitizeCardText(match[1]).replace(/^(the|a|an)\s+/i, "");
  const normalizedTerm = rawTerm
    .replace(/\b(it|this|that|these|those)\b$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const definition = sanitizeCardText(match[3]);
  if (normalizedTerm.length < 3 || normalizedTerm.split(/\s+/).length > 6) {
    return null;
  }
  if (definition.length < 16 || endsWithWeakTerm(definition)) {
    return null;
  }

  return {
    term: normalizedTerm,
    definition,
  };
}

function extractKeywords(sentence: string, maxCount: number): string[] {
  const rawTokens = sentence.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? [];
  const rankedTokens = Array.from(
    new Set(
      rawTokens
        .map((token) => token.trim())
        .filter((token) => token.length >= 4)
        .filter((token) => !COMMON_STOPWORDS.has(token.toLowerCase())),
    ),
  ).sort((a, b) => b.length - a.length);

  return rankedTokens.slice(0, maxCount);
}

function extractAcronym(sentence: string): string | null {
  const match = sentence.match(/\b[A-Z]{2,8}\b/);
  return match ? match[0] : null;
}

function extractCodeHint(sentence: string): string | null {
  if (!/[{}()[\];=<>+*/]/.test(sentence)) {
    return null;
  }
  return trimForCard(sentence, 120);
}

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isLowQualityPair(front: string, back: string): boolean {
  const nf = normalizeComparable(front);
  const nb = normalizeComparable(back);

  if (!nf || !nb) {
    return true;
  }

  if (nf === nb) {
    return true;
  }

  const shorter = nf.length <= nb.length ? nf : nb;
  const longer = nf.length > nb.length ? nf : nb;
  if (shorter.length >= 20 && longer.includes(shorter)) {
    return true;
  }

  return false;
}

function isIncompleteAnswer(value: string): boolean {
  const normalized = sanitizeCardText(value);
  if (normalized.length < 12) {
    return true;
  }

  if (endsWithConnector(normalized) || endsWithWeakTerm(normalized)) {
    return true;
  }

  if (hasAuthorByline(normalized)) {
    return true;
  }
  if (isSlideHeadingNoise(normalized)) {
    return true;
  }

  const trailing = normalized.toLowerCase();
  if (/(,|;|:)\s*$/.test(trailing)) {
    return true;
  }

  return false;
}

function buildQuestionContext(
  sentence: string,
  definitionPair: DefinitionPair | null,
): QuestionContext {
  const keywords = extractKeywords(sentence, 4);
  const primaryTerm = definitionPair?.term ?? keywords[0] ?? "this concept";
  const secondaryTerm = keywords.find(
    (token) => token !== primaryTerm && !areTermsTooSimilar(primaryTerm, token),
  ) ?? null;
  const acronym = extractAcronym(sentence);
  const codeHint = extractCodeHint(sentence);
  const answerText = definitionPair?.definition ?? sentence;

  return {
    sentence,
    answerText,
    primaryTerm,
    secondaryTerm,
    acronym,
    codeHint,
    tags: [sanitizeCardText(primaryTerm).toLowerCase()],
  };
}

function getApplicableTemplates(ctx: QuestionContext): QuestionTemplate[] {
  return QUESTION_TEMPLATES.filter((template) => {
    if (!HIGH_QUALITY_FALLBACK_TEMPLATE_IDS.has(template.id)) {
      return false;
    }
    if (template.requiresSecondary && !ctx.secondaryTerm) {
      return false;
    }
    if (template.requiresAcronym && !ctx.acronym) {
      return false;
    }
    return true;
  });
}

function q(term: string): string {
  return `"${sanitizeCardText(term)}"`;
}

function isLowQualityFront(value: string): boolean {
  const normalized = sanitizeCardText(value);
  if (!normalized) {
    return true;
  }

  const comparisonMatch = normalized.match(
    /^difference between ["']?(.+?)["']? and ["']?(.+?)["']?[.?]?$/i,
  );
  if (comparisonMatch) {
    const first = comparisonMatch[1] ?? "";
    const second = comparisonMatch[2] ?? "";
    if (areTermsTooSimilar(first, second)) {
      return true;
    }
  }

  if (/^identify the concept from this description:/i.test(normalized)) {
    return true;
  }

  return false;
}

function areTermsTooSimilar(left: string, right: string): boolean {
  const normalize = (value: string) =>
    sanitizeCardText(value)
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) {
    return true;
  }
  if (a === b) {
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length >= 4 && longer.includes(shorter)) {
    return true;
  }
  return false;
}

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    id: "foundation_what_is",
    family: "definition_foundation",
    cardType: CardType.DEFINITION,
    difficultyOffset: 0,
    build: (ctx) => `What is ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "foundation_define_simple",
    family: "definition_foundation",
    cardType: CardType.DEFINITION,
    difficultyOffset: 0,
    build: (ctx) => `Define ${q(ctx.primaryTerm)} in simple terms.`,
  },
  {
    id: "understanding_explain",
    family: "explanation_understanding",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) => `Explain how ${q(ctx.primaryTerm)} works.`,
  },
  {
    id: "comparison_difference",
    family: "difference_comparison",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    requiresSecondary: true,
    build: (ctx) =>
      `Difference between ${q(ctx.primaryTerm)} and ${q(ctx.secondaryTerm ?? "related concepts")}.`,
  },
  {
    id: "identification_description",
    family: "identification",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) =>
      `Identify the concept from this description: ${trimForCard(ctx.answerText, 120)}`,
  },
  {
    id: "output_predict",
    family: "output_based",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 2,
    build: (ctx) =>
      ctx.codeHint
        ? `Predict the output/result of this snippet: ${ctx.codeHint}`
        : `What will be the output or result when applying ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "application_use_in_scenario",
    family: "application_based",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 2,
    build: (ctx) =>
      `How would you use ${q(ctx.primaryTerm)} in a practical scenario?`,
  },
  {
    id: "use_case_when_should",
    family: "use_case",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) => `When should you use ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "debugging_why_failing",
    family: "error_debugging",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `What can go wrong with ${q(ctx.primaryTerm)}, and why would it fail?`,
  },
  {
    id: "steps_process",
    family: "step_by_step",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) => `What are the key steps of ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "linking_relationship",
    family: "concept_linking",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    requiresSecondary: true,
    build: (ctx) =>
      `How is ${q(ctx.primaryTerm)} related to ${q(ctx.secondaryTerm ?? "another concept")}?`,
  },
  {
    id: "rules_constraints",
    family: "rules_constraints",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `What are the main rules or constraints of ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "pros_cons",
    family: "advantages_disadvantages",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `What are the advantages and disadvantages of ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "cause_effect",
    family: "cause_effect",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `What happens if ${q(ctx.primaryTerm)} is ignored or applied incorrectly?`,
  },
  {
    id: "scenario_best_choice",
    family: "scenario_based",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 2,
    build: (ctx) =>
      `Given a real-world situation, what is the best approach using ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "best_practice",
    family: "best_practice",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `What is the best practice for ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "fill_missing",
    family: "fill_missing",
    cardType: CardType.CLOZE,
    difficultyOffset: 1,
    build: (ctx) => `Complete the statement: ${q(ctx.primaryTerm)} is used for _____.`,
    buildBack: (ctx) => `${ctx.primaryTerm} is used for ${ctx.answerText}`,
  },
  {
    id: "keyword_based",
    family: "keyword_based",
    cardType: CardType.DEFINITION,
    difficultyOffset: 1,
    build: (ctx) =>
      `What keyword or core term is associated with ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "analogy",
    family: "real_life_analogy",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 2,
    build: (ctx) =>
      `What real-life analogy helps explain ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "quick_fact",
    family: "quick_fact",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) => `Give one quick fact about ${q(ctx.primaryTerm)}.`,
  },
  {
    id: "deep_why",
    family: "deep_why",
    cardType: CardType.CONCEPT,
    difficultyOffset: 3,
    build: (ctx) =>
      `Why is ${q(ctx.primaryTerm)} designed this way? Why not a simpler alternative?`,
  },
  {
    id: "reverse_question",
    family: "reverse_question",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `Given this answer: ${trimForCard(ctx.answerText, 130)} What is the question?`,
  },
  {
    id: "trick_question",
    family: "trick_question",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `Spot the mistake in this statement about ${q(ctx.primaryTerm)}.`,
  },
  {
    id: "memory_hook",
    family: "memory_hook",
    cardType: CardType.DEFINITION,
    difficultyOffset: 1,
    requiresAcronym: true,
    build: (ctx) => `Expand ${q(ctx.acronym ?? ctx.primaryTerm)} (full form).`,
  },
  {
    id: "build_design",
    family: "build_design",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 3,
    build: (ctx) =>
      `How would you design or architect a solution using ${q(ctx.primaryTerm)}?`,
  },
];

const COMMON_STOPWORDS = new Set([
  "also",
  "about",
  "after",
  "again",
  "against",
  "among",
  "another",
  "being",
  "because",
  "between",
  "cannot",
  "concept",
  "concepts",
  "could",
  "describes",
  "during",
  "every",
  "first",
  "having",
  "material",
  "refers",
  "statement",
  "study",
  "other",
  "should",
  "their",
  "there",
  "these",
  "those",
  "through",
  "where",
  "which",
  "while",
  "would",
]);

function hasAuthorByline(value: string): boolean {
  return /\bby\s*[:\-]\s*(dr|prof|mr|mrs|ms)\b/i.test(value);
}

function hasPdfNoise(value: string): boolean {
  const lowered = value.toLowerCase();
  return (
    /\bassignment\s+\d+\b/.test(lowered) ||
    /\btable of contents\b/.test(lowered) ||
    /\baspectengineering\b/.test(lowered) ||
    /\bcontent assignment\b/.test(lowered)
  );
}

function hasStatementVerb(value: string): boolean {
  return /\b(is|are|was|were|means|refers|involves|requires|ensures|focuses|helps|supports|improves|uses|considers|defines|includes)\b/i.test(
    value,
  );
}

function isHeadingLikeChunk(value: string): boolean {
  const words = value.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
  if (words.length === 0) {
    return true;
  }

  const titleOrUpperWords = words.filter(
    (word) => /^[A-Z][a-z]+$/.test(word) || /^[A-Z]{2,}$/.test(word),
  ).length;
  const ratio = titleOrUpperWords / words.length;

  if (ratio >= 0.75 && words.length <= 16) {
    return true;
  }

  return false;
}

function isSlideHeadingNoise(value: string): boolean {
  const lowered = value.toLowerCase();
  const words = value.split(/\s+/).filter(Boolean);
  const punctuationCount = (value.match(/[.,;:!?]/g) ?? []).length;

  if (/\blecture\s+\d+\b/.test(lowered) && /\bcontent\b/.test(lowered)) {
    return true;
  }

  if ((lowered.match(/\bengineer as a\b/g) ?? []).length >= 2) {
    return true;
  }

  if (words.length >= 18 && punctuationCount <= 1) {
    return true;
  }

  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFallbackDifficulty(difficulty: GenerationDifficulty): number {
  if (difficulty === "easy") {
    return 1;
  }
  if (difficulty === "hard") {
    return 3;
  }
  return 2;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function getBackoffMs(attempt: number): number {
  return Math.min(6_000, 700 * 2 ** (attempt - 1));
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) {
    return null;
  }

  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.min(20_000, asSeconds * 1000);
  }

  const asDateMs = Date.parse(retryAfter);
  if (!Number.isNaN(asDateMs)) {
    const delta = asDateMs - Date.now();
    if (delta > 0) {
      return Math.min(20_000, delta);
    }
  }

  return null;
}

function summarizeWarnings(warnings: string[]): string | null {
  if (warnings.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();
  for (const warning of warnings) {
    counts.set(warning, (counts.get(warning) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([warning, count]) => (count > 1 ? `${warning} (x${count})` : warning))
    .join(" ");
}

function isRateLimitWarning(warning: string | null): boolean {
  if (!warning) {
    return false;
  }
  return /rate limit|quota|429/i.test(warning);
}

async function extractGeminiErrorDetails(response: Response): Promise<{
  message: string;
  body: string;
}> {
  try {
    const rawBody = (await response.text()).trim();
    let parsedMessage = "";
    if (rawBody) {
      try {
        const payload = JSON.parse(rawBody) as {
          error?: { message?: string };
        };
        parsedMessage = payload.error?.message?.trim() ?? "";
      } catch {
        parsedMessage = "";
      }
    }

    return {
      message: parsedMessage ? `Details: ${trimForCard(parsedMessage, 180)}` : "",
      body: rawBody ? trimForCard(rawBody.replace(/\s+/g, " "), 320) : "",
    };
  } catch {
    return {
      message: "",
      body: "",
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
