import { z } from "zod";
import { getEnv } from "@/lib/env";

const explanationSchema = z.object({
  explanation: z.string().min(20).max(4000),
  evidence: z.array(z.string().min(8).max(700)).min(1).max(5),
});

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

export interface ExplainAnswerInput {
  deckTitle: string;
  cardFront: string;
  cardBack: string;
  sourceText: string;
}

export interface ExplainAnswerResult {
  explanation: string;
  evidence: string[];
  provider: "gemini" | "fallback";
  warning: string | null;
  source: "uploaded_pdf";
}

type BaseExplainResult = Pick<
  ExplainAnswerResult,
  "explanation" | "evidence" | "provider" | "warning"
>;

export async function explainAnswerFromSource(
  input: ExplainAnswerInput,
): Promise<ExplainAnswerResult> {
  const normalizedSource = input.sourceText.trim();
  const compactAnswer = compactSnippet(input.cardBack);
  const compactFront = compactSnippet(input.cardFront);
  const relevantPassages = pickRelevantPassages(
    normalizedSource,
    `${compactFront} ${compactAnswer}`,
  );

  const aiResult = await tryGeminiExplanation({
    ...input,
    sourceText: relevantPassages.join("\n"),
  });
  if (aiResult) {
    return {
      ...aiResult,
      source: "uploaded_pdf",
    };
  }

  const fallbackEvidence =
    relevantPassages.length > 0
      ? relevantPassages.slice(0, 3)
      : ["No strong matching excerpt found in the uploaded source text."];

  return {
    explanation:
      relevantPassages.length > 0
        ? `The answer "${compactAnswer}" matches the source material. The excerpts below show the same idea in the uploaded PDF.`
        : `Could not verify the answer "${compactAnswer}" from the uploaded source text with high confidence.`,
    evidence: fallbackEvidence,
    provider: "fallback",
    warning:
      "Used fallback explanation because a Gemini explanation was unavailable.",
    source: "uploaded_pdf",
  };
}

async function tryGeminiExplanation(
  input: ExplainAnswerInput,
): Promise<BaseExplainResult | null> {
  const env = getEnv();
  if (!env.GEMINI_API_KEY || !env.ALLOW_EXTERNAL_LLM) {
    return null;
  }

  const timeoutMs = 15_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
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
                text: buildExplainPrompt(input),
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: "You explain flashcard answers using only the provided source excerpts. Return JSON only.",
            },
          ],
        },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const rawContent = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!rawContent) {
      return null;
    }

    const jsonContent = parseJsonContent(rawContent);
    let parsed = explanationSchema.safeParse(jsonContent);
    if (!parsed.success) {
      const coerced = coerceToExplanationSchema(jsonContent);
      parsed = explanationSchema.safeParse(coerced);
    }
    if (!parsed.success) {
      return null;
    }

    return {
      explanation: sanitizeText(parsed.data.explanation),
      evidence: parsed.data.evidence.map(sanitizeText),
      provider: "gemini",
      warning: null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildExplainPrompt(input: ExplainAnswerInput): string {
  return [
    `Deck title: ${input.deckTitle}`,
    `Card question: ${input.cardFront}`,
    `Card answer: ${input.cardBack}`,
    "Task:",
    "- Explain why the answer is correct using only the source excerpts.",
    "- Keep explanation concise and clear for a student.",
    "- Include 2 to 4 direct supporting excerpts in evidence.",
    'Return JSON only: {"explanation":"...","evidence":["..."]}',
    "Source excerpts:",
    input.sourceText.slice(0, 9000),
  ].join("\n");
}

function pickRelevantPassages(sourceText: string, query: string): string[] {
  const blocks = extractCandidatePassages(sourceText);

  if (blocks.length === 0) {
    return [];
  }

  const queryTokens = tokenize(query);
  const scored = blocks
    .map((block) => ({
      block,
      score: scorePassage(block, queryTokens),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.block);

  if (scored.length > 0) {
    return scored;
  }

  return blocks.slice(0, 4);
}

function scorePassage(passage: string, queryTokens: Set<string>): number {
  if (queryTokens.size === 0) {
    return 0;
  }

  const words = tokenize(passage);
  let matches = 0;
  for (const token of queryTokens) {
    if (words.has(token)) {
      matches += 1;
    }
  }
  return matches;
}

function extractCandidatePassages(sourceText: string): string[] {
  const normalized = sourceText
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/\s{2,}/g, " ");

  const rawLines = normalized
    .split("\n")
    .map((line) => sanitizeText(line))
    .filter(Boolean);

  const passages: string[] = [];

  for (const line of rawLines) {
    const withoutListPrefix = line.replace(/^\d+(\.\d+)*\s*/, "").trim();
    if (!withoutListPrefix) {
      continue;
    }
    if (isNoisyPassage(withoutListPrefix)) {
      continue;
    }

    const sentenceParts = withoutListPrefix
      .split(/(?<=[.!?])\s+/)
      .map((part) => sanitizeText(part))
      .filter((part) => part.length >= 25);

    if (sentenceParts.length === 0 && withoutListPrefix.length >= 25) {
      passages.push(compactSnippet(withoutListPrefix));
      continue;
    }

    for (const part of sentenceParts) {
      passages.push(compactSnippet(part));
    }
  }

  const unique = Array.from(
    new Set(passages.map((item) => item.toLowerCase())),
  ).map((lowered) => passages.find((item) => item.toLowerCase() === lowered) ?? "");

  return unique
    .map((item) => item.trim())
    .filter((item) => item.length >= 25)
    .slice(0, 300);
}

function compactSnippet(value: string): string {
  const cleaned = sanitizeText(value);
  if (cleaned.length <= 180) {
    return cleaned;
  }
  return `${cleaned.slice(0, 177).trim()}...`;
}

function isNoisyPassage(value: string): boolean {
  const lowered = value.toLowerCase();
  const words = value.split(/\s+/).filter(Boolean);
  const punctuationCount = (value.match(/[.,;:!?]/g) ?? []).length;
  const commaCount = (value.match(/,/g) ?? []).length;
  const hasDenseListPattern =
    words.length >= 35 &&
    (commaCount >= 6 || /\b(mean|median|mode|example|testing|design)\b/.test(lowered));

  if (/\blecture\s+\d+\b/.test(lowered) && /\bcontent\b/.test(lowered)) {
    return true;
  }
  if ((lowered.match(/\bengineer as a\b/g) ?? []).length >= 2) {
    return true;
  }
  if (words.length >= 18 && punctuationCount <= 1) {
    return true;
  }
  if (hasDenseListPattern) {
    return true;
  }

  return false;
}

function tokenize(value: string): Set<string> {
  const matches = value
    .toLowerCase()
    .match(/[a-z][a-z0-9-]*/g);

  if (!matches) {
    return new Set<string>();
  }

  return new Set(
    matches.filter(
      (token) => token.length >= 3 && !STOPWORDS.has(token),
    ),
  );
}

function sanitizeText(value: string): string {
  return value.replace(/\s{2,}/g, " ").trim();
}

function coerceToExplanationSchema(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;

  let explanation = typeof obj.explanation === "string" ? obj.explanation.trim() : "";
  if (explanation.length > 4000) explanation = explanation.slice(0, 3997) + "...";

  let evidence: string[] = [];
  if (Array.isArray(obj.evidence)) {
    evidence = obj.evidence
      .filter((e): e is string => typeof e === "string")
      .map((e) => {
        const trimmed = e.trim();
        return trimmed.length > 700 ? trimmed.slice(0, 697) + "..." : trimmed;
      })
      .filter((e) => e.length >= 8)
      .slice(0, 5);
  }

  return { explanation, evidence };
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

const STOPWORDS = new Set([
  "about",
  "again",
  "also",
  "been",
  "being",
  "between",
  "could",
  "from",
  "have",
  "into",
  "material",
  "that",
  "their",
  "there",
  "these",
  "those",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);
