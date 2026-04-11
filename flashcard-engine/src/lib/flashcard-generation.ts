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
  back: z.string().min(16).max(4000),
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
  qualityScore: number;
}

export interface GenerationResult {
  cards: GeneratedFlashcard[];
  provider: "openai" | "fallback";
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

interface OpenAiChatChoice {
  message?: {
    content?: string;
  };
}

interface OpenAiChatResponse {
  choices?: OpenAiChatChoice[];
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

  const aiAttempt = await tryOpenAiGeneration({
    deckTitle: input.deckTitle,
    sourceText,
    maxCards,
    difficulty,
  });

  if (aiAttempt.cards.length > 0) {
    return aiAttempt;
  }

  return {
    cards: buildFallbackCards(sourceText, maxCards, difficulty),
    provider: "fallback",
    warning: aiAttempt.warning,
  };
}

async function tryOpenAiGeneration(input: {
  deckTitle: string;
  sourceText: string;
  maxCards: number;
  difficulty: GenerationDifficulty;
}): Promise<GenerationResult> {
  const sourceChunks = splitSourceIntoChunks(input.sourceText, {
    maxChars: 5_500,
    maxChunks: 3,
  });
  const chunkBudgets = distributeCardBudget(input.maxCards + 6, sourceChunks.length);
  const results = await mapWithConcurrency(
    sourceChunks.map((sourceText, chunkIndex) => ({
      sourceText,
      chunkIndex,
      maxCards: chunkBudgets[chunkIndex] ?? input.maxCards,
    })),
    2,
    async (item) =>
      tryOpenAiGenerationForChunk({
        deckTitle: input.deckTitle,
        sourceText: item.sourceText ?? "",
        maxCards: item.maxCards,
        difficulty: input.difficulty,
        chunkLabel: `Chunk ${item.chunkIndex + 1} / ${sourceChunks.length}`,
      }),
  );

  const collectedCards = results.flatMap((result) => result.cards);
  const warnings = results
    .map((result) => result.warning)
    .filter((warning): warning is string => Boolean(warning));

  if (collectedCards.length > 0) {
    return {
      cards: normalizeCards(collectedCards, input.maxCards),
      provider: "openai",
      warning: warnings.length > 0 ? warnings.join(" ") : null,
    };
  }

  return {
    cards: [],
    provider: "openai",
    warning:
      warnings.join(" ") ||
      "OpenAI generation produced no usable cards. Used local fallback generation.",
  };
}

async function tryOpenAiGenerationForChunk(input: {
  deckTitle: string;
  sourceText: string;
  maxCards: number;
  difficulty: GenerationDifficulty;
  chunkLabel: string;
}): Promise<GenerationResult> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY || !env.ALLOW_EXTERNAL_LLM) {
    return {
      cards: [],
      provider: "openai",
      warning:
        "External LLM is disabled or OPENAI_API_KEY is not set. Used local fallback generation.",
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
        warning:
          "OpenAI returned invalid JSON schema. Used local fallback generation.",
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
    "- Keep front concise and test recall.",
    "- Keep back clear, practical, and complete (never cut mid-sentence).",
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
): GeneratedFlashcard[] {
  const seen = new Set<string>();
  const normalized: GeneratedFlashcard[] = [];

  for (const card of cards) {
    const front = trimForCard(sanitizeCardText(card.front), 260);
    const back = sanitizeCardText(card.back);
    const minBackLength = card.type === CardType.CLOZE ? 4 : 12;

    if (front.length < 8 || back.length < minBackLength) {
      continue;
    }
    if (isIncompleteAnswer(back)) {
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
    if (qualityScore < 45) {
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
  const definition = sanitizeCardText(match[3]);
  if (rawTerm.length < 3 || rawTerm.split(/\s+/).length > 8) {
    return null;
  }
  if (definition.length < 16 || endsWithWeakTerm(definition)) {
    return null;
  }

  return {
    term: rawTerm,
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
  const secondaryTerm = keywords.find((token) => token !== primaryTerm) ?? null;
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

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TOutput>,
): Promise<TOutput[]> {
  const safeConcurrency = Math.max(1, Math.min(concurrency, items.length || 1));
  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index] as TInput);
    }
  }

  await Promise.all(Array.from({ length: safeConcurrency }, () => worker()));
  return results;
}
