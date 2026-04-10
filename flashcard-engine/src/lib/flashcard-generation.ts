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
}

export interface GenerationResult {
  cards: GeneratedFlashcard[];
  provider: "openai" | "fallback";
  warning: string | null;
}

export type GenerationDifficulty = "easy" | "medium" | "hard";

type DefinitionPair = {
  term: string;
  definition: string;
  termTag: string;
};

type QuestionMode =
  | "basic_recall"
  | "cloze"
  | "mcq"
  | "true_false"
  | "matching"
  | "typing"
  | "problem_solving"
  | "ordering"
  | "conceptual_why"
  | "scenario"
  | "rapid_fire"
  | "confidence"
  | "case_study"
  | "hint_based"
  | "reverse_thinking";

const ALL_QUESTION_MODES: readonly QuestionMode[] = [
  "basic_recall",
  "cloze",
  "mcq",
  "true_false",
  "matching",
  "typing",
  "problem_solving",
  "ordering",
  "conceptual_why",
  "scenario",
  "rapid_fire",
  "confidence",
  "case_study",
  "hint_based",
  "reverse_thinking",
] as const;

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

export async function generateFlashcardsFromText(
  input: GenerationInput,
): Promise<GenerationResult> {
  const maxCards = clamp(input.maxCards ?? 16, 6, 24);
  const sourceText = input.sourceText.trim();
  const difficulty = input.difficulty ?? "medium";

  const aiAttempt = await tryOpenAiGeneration({
    deckTitle: input.deckTitle,
    sourceText: sourceText.slice(0, 16000),
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
  difficulty: GenerationDifficulty;
}): string {
  return [
    `Deck title: ${input.deckTitle}`,
    `Generate ${input.maxCards} flashcards from the provided study material.`,
    `Target difficulty: ${input.difficulty.toUpperCase()}.`,
    `Allowed question styles: ${ALL_QUESTION_MODES.join(", ")}.`,
    "Priorities:",
    "- Cover key concepts, definitions, relationships, and examples.",
    "- Keep front concise and test recall.",
    "- Keep back clear, practical, and complete (never cut mid-sentence).",
    "- Do not end answers with trailing connectors like and/or/while/because.",
    "- Mix card types: CONCEPT, DEFINITION, CLOZE, EXAMPLE.",
    "- Respect selected styles and keep strong variation.",
    "- difficulty is 1 (easy) to 5 (hard) and should match target difficulty.",
    'Return JSON only in format: {"cards":[{"type":"CONCEPT","front":"...","back":"...","difficulty":3,"tags":["topic"]}]}',
    "Study material:",
    input.sourceText,
  ].join("\n");
}

function buildFallbackCards(
  sourceText: string,
  maxCards: number,
  difficulty: GenerationDifficulty,
): GeneratedFlashcard[] {
  const uniqueSentences = collectFallbackCandidates(sourceText).slice(
    0,
    maxCards * 3,
  );
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

    const backText = template.buildBack ? template.buildBack(context) : context.answerText;
    cards.push({
      type: template.cardType,
      front: template.build(context),
      back: backText,
      difficulty: clamp(targetDifficulty + template.difficultyOffset, 1, 5),
      tags: sanitizeTags([...context.tags, template.id]),
    });
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

    const front = trimForCard(sanitizeCardText(card.front), 260);
    const back = sanitizeCardText(card.back);
    const minBackLength = card.type === CardType.CLOZE ? 4 : 12;
    if (front.length < 8 || back.length < minBackLength) {
      continue;
    }
    if (isIncompleteAnswer(back)) {
      continue;
    }
    if (isLowQualityPair(front, back)) {
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

function trimForCard(value: string, maxLen: number): string {
  if (value.length <= maxLen) {
    return value.trim();
  }
  return `${value.slice(0, maxLen - 3).trim()}...`;
}

function sanitizeCardText(value: string): string {
  return value
    .replace(/[•●◦▪‣∙]/g, " ")
    .replace(/[“”„‟«»]/g, "\"")
    .replace(/[‘’‚‛]/g, "'")
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
    /^([A-Za-z][A-Za-z0-9()\/\- ]{2,80})\s+(is|are|refers to|means|describes)\s+(.+)$/i,
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
    termTag: rawTerm.toLowerCase(),
  };
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

  // Reject near-copy question/answer pairs.
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

type QuestionContext = {
  sentence: string;
  answerText: string;
  primaryTerm: string;
  secondaryTerm: string | null;
  acronym: string | null;
  tags: string[];
};

type QuestionTemplate = {
  id: string;
  mode: QuestionMode;
  cardType: SupportedCardType;
  difficultyOffset: number;
  requiresSecondary?: boolean;
  requiresAcronym?: boolean;
  build: (ctx: QuestionContext) => string;
  buildBack?: (ctx: QuestionContext) => string;
};

function buildQuestionContext(
  sentence: string,
  definitionPair: DefinitionPair | null,
): QuestionContext {
  const keywords = extractKeywords(sentence, 4);
  const primaryTerm = definitionPair?.term ?? keywords[0] ?? "this concept";
  const secondaryTerm = keywords.find((token) => token !== primaryTerm) ?? null;
  const acronym = extractAcronym(sentence);
  const answerText = definitionPair?.definition ?? sentence;

  return {
    sentence,
    answerText,
    primaryTerm,
    secondaryTerm,
    acronym,
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

function q(term: string): string {
  return `"${sanitizeCardText(term)}"`;
}

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    id: "definition_what_is",
    mode: "basic_recall",
    cardType: CardType.DEFINITION,
    difficultyOffset: 0,
    build: (ctx) => `What ${copulaForTerm(ctx.primaryTerm)} ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "definition_define_simple",
    mode: "basic_recall",
    cardType: CardType.DEFINITION,
    difficultyOffset: 0,
    build: (ctx) => `Define ${q(ctx.primaryTerm)} in simple terms.`,
  },
  {
    id: "definition_meaning",
    mode: "basic_recall",
    cardType: CardType.DEFINITION,
    difficultyOffset: 0,
    build: (ctx) => `What does ${q(ctx.primaryTerm)} mean?`,
  },
  {
    id: "cloze_fill",
    mode: "cloze",
    cardType: CardType.CLOZE,
    difficultyOffset: 1,
    build: (ctx) => `Fill in the blank: ${q(ctx.primaryTerm)} is used for _____.`,
    buildBack: (ctx) => `${ctx.primaryTerm}. ${ctx.answerText}`,
  },
  {
    id: "mcq_single",
    mode: "mcq",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) =>
      [
        `MCQ: Which option best matches ${q(ctx.primaryTerm)}?`,
        "A) A completely unrelated concept",
        `B) ${trimForCard(ctx.answerText, 80)}`,
        "C) A contradictory statement",
        "D) None of the above",
      ].join("\n"),
    buildBack: (ctx) =>
      `Correct option: B.\n${ctx.answerText}`,
  },
  {
    id: "true_false_check",
    mode: "true_false",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) =>
      `True or False: ${q(ctx.primaryTerm)} has no practical role in engineering.`,
    buildBack: (ctx) => `False. ${ctx.answerText}`,
  },
  {
    id: "matching_pair",
    mode: "matching",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 1,
    build: (ctx) =>
      `Match the concept with the correct explanation: ${q(ctx.primaryTerm)}`,
    buildBack: (ctx) => `${ctx.primaryTerm} -> ${ctx.answerText}`,
  },
  {
    id: "typing_active_recall",
    mode: "typing",
    cardType: CardType.DEFINITION,
    difficultyOffset: 1,
    build: (ctx) => `Type the best definition for ${q(ctx.primaryTerm)}.`,
  },
  {
    id: "problem_solving_apply",
    mode: "problem_solving",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) => `Explain how ${q(ctx.primaryTerm)} works.`,
  },
  {
    id: "ordering_steps",
    mode: "ordering",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) => `What are the steps involved in ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "conceptual_why",
    mode: "conceptual_why",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) => `Why does ${q(ctx.primaryTerm)} matter?`,
  },
  {
    id: "scenario_choice",
    mode: "scenario",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) =>
      `Scenario: You are designing a system. When would you choose ${q(ctx.primaryTerm)}?`,
  },
  {
    id: "rapid_fire_fact",
    mode: "rapid_fire",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) => `Rapid fire: give one key fact about ${q(ctx.primaryTerm)}.`,
  },
  {
    id: "confidence_probe",
    mode: "confidence",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) => `How confident are you about ${q(ctx.primaryTerm)} and why?`,
  },
  {
    id: "case_study_long",
    mode: "case_study",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 2,
    build: (ctx) => `Case study: explain ${q(ctx.primaryTerm)} in a real-world context.`,
  },
  {
    id: "hint_based_progressive",
    mode: "hint_based",
    cardType: CardType.CLOZE,
    difficultyOffset: 1,
    build: (ctx) =>
      `Hint-based recall:\nHint 1: ${trimForCard(ctx.answerText, 60)}\nHint 2: Focus on ${q(ctx.primaryTerm)}\nFinal answer?`,
    buildBack: (ctx) => `${ctx.primaryTerm}. ${ctx.answerText}`,
  },
  {
    id: "reverse_thinking",
    mode: "reverse_thinking",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    build: (ctx) => `Given this answer, what is the question?\nAnswer: ${trimForCard(ctx.answerText, 120)}`,
  },
  {
    id: "compare_when_to_use",
    mode: "scenario",
    cardType: CardType.EXAMPLE,
    difficultyOffset: 2,
    requiresSecondary: true,
    build: (ctx) =>
      `When should you use ${q(ctx.primaryTerm)} over ${q(ctx.secondaryTerm ?? "alternative approaches")}?`,
  },
  {
    id: "compare_difference",
    mode: "conceptual_why",
    cardType: CardType.CONCEPT,
    difficultyOffset: 2,
    requiresSecondary: true,
    build: (ctx) =>
      `Difference between ${q(ctx.primaryTerm)} and ${q(ctx.secondaryTerm ?? "alternative approaches")}.`,
  },
  {
    id: "identify_from_description",
    mode: "basic_recall",
    cardType: CardType.CONCEPT,
    difficultyOffset: 1,
    build: (ctx) =>
      `Identify the concept from this description: ${trimForCard(ctx.answerText, 120)}`,
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

function copulaForTerm(term: string): "is" | "are" {
  const cleaned = sanitizeCardText(term).toLowerCase();
  const lastWord = cleaned.split(/\s+/).filter(Boolean).pop() ?? cleaned;
  if (!lastWord) {
    return "is";
  }

  if (/s$/.test(lastWord) && !/(ss|us|is)$/.test(lastWord)) {
    return "are";
  }
  return "is";
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
