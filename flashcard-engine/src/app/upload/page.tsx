"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-access";

type ApiErrorPayload = {
  message?: string;
};

type GeneratedCardPreview = {
  type: "CONCEPT" | "DEFINITION" | "CLOZE" | "EXAMPLE";
  front: string;
  back: string;
};

type DeckResult = {
  id: string;
  title: string;
  sourceFile: string;
  cardCount: number;
  provider: "gemini";
  warning: string | null;
  sampleCards: GeneratedCardPreview[];
};

type ApiSuccessPayload = {
  message: string;
  deck: DeckResult;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [deckTitle, setDeckTitle] = useState("");
  const [cardCountPreset, setCardCountPreset] = useState<
    "few" | "standard" | "more"
  >("standard");
  const [difficultyPreset, setDifficultyPreset] = useState<
    "easy" | "medium" | "hard"
  >("medium");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<DeckResult | null>(null);

  const fileLabel = useMemo(() => {
    if (!file) {
      return "No file selected yet";
    }

    const sizeInMb = (file.size / (1024 * 1024)).toFixed(2);
    return `${file.name} (${sizeInMb} MB)`;
  }, [file]);

  const submitUpload = async () => {
    if (!file) {
      setErrorMessage("Select a PDF before generating a deck.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("deckTitle", deckTitle);
    formData.append("cardCountPreset", cardCountPreset);
    formData.append("difficultyPreset", difficultyPreset);

    setIsSubmitting(true);
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await apiFetch("/api/decks", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorPayload = (await response.json()) as ApiErrorPayload;
        throw new Error(errorPayload.message ?? "Deck generation failed.");
      }

      const payload = (await response.json()) as ApiSuccessPayload;
      setResult(payload.deck);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected upload error.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="shell py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Upload Workspace
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Send one source. Build one focused deck.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          Upload a PDF to extract text, generate flashcards, and save a
          review-ready deck.
        </p>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
        <div className="relative overflow-hidden border border-[var(--line)] bg-[var(--panel)] p-8 md:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-dim)]">
            Drop Zone
          </p>
          <p className="mt-2 text-xl font-semibold">Upload your PDF</p>
          <p className="mt-2 max-w-md text-sm text-[var(--ink-dim)]">
            Supports study notes, textbooks, and lecture handouts. We parse text
            and generate concept, definition, cloze, and example cards.
          </p>

          <label
            htmlFor="pdf-input"
            className="mt-8 block cursor-pointer border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.65)] p-8 text-center transition hover:border-[var(--ink)]"
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-dim)]">
              PDF Input
            </p>
            <p className="mt-2 text-sm text-[var(--ink-dim)]">
              Click to choose a file (max 10 MB).
            </p>
            <p className="mt-3 text-sm font-medium text-[var(--ink)]">
              {fileLabel}
            </p>
          </label>
          <input
            id="pdf-input"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />

          <div className="mt-5 grid gap-3">
            <label htmlFor="deck-title" className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
              Deck title (optional)
            </label>
            <input
              id="deck-title"
              value={deckTitle}
              onChange={(event) => setDeckTitle(event.target.value)}
              placeholder="Leave blank to use filename"
              className="w-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
            />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label
                htmlFor="card-count"
                className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]"
              >
                Card count
              </label>
              <select
                id="card-count"
                value={cardCountPreset}
                onChange={(event) =>
                  setCardCountPreset(
                    event.target.value as "few" | "standard" | "more",
                  )
                }
                className="w-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
              >
                <option value="few">Fewer (~8)</option>
                <option value="standard">Standard (~16)</option>
                <option value="more">More (~24)</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label
                htmlFor="difficulty-target"
                className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]"
              >
                Difficulty
              </label>
              <select
                id="difficulty-target"
                value={difficultyPreset}
                onChange={(event) =>
                  setDifficultyPreset(
                    event.target.value as "easy" | "medium" | "hard",
                  )
                }
                className="w-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submitUpload}
              disabled={isSubmitting}
              className="border border-[var(--ink)] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Generating..." : "Generate deck"}
            </button>
            {result ? (
              <Link
                href="/decks"
                className="border border-[var(--line)] bg-[rgba(255,255,255,0.7)] px-4 py-2 text-sm font-medium transition hover:border-[var(--ink)]"
              >
                View all decks
              </Link>
            ) : null}
          </div>

          {errorMessage ? (
            <p className="mt-4 border border-[rgba(170,45,35,0.4)] bg-[rgba(170,45,35,0.08)] px-3 py-2 text-sm text-[rgb(120,32,25)]">
              {errorMessage}
            </p>
          ) : null}

          {result ? (
            <div className="mt-6 space-y-4 border border-[var(--line)] bg-[rgba(255,255,255,0.76)] p-4">
              <p className="text-sm font-semibold">
                Created &quot;{result.title}&quot; with {result.cardCount} cards.
              </p>
              <p className="text-xs text-[var(--ink-dim)]">
                Generator: Gemini
                {result.warning ? ` - ${result.warning}` : ""}
              </p>
              <div className="space-y-3">
                {result.sampleCards.map((card, index) => (
                  <div key={`${card.front}-${index}`} className="border border-[var(--line)] bg-white/70 p-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                      {card.type}
                    </p>
                    <p className="mt-1 text-sm font-medium">{card.front}</p>
                    <p className="mt-1 text-sm text-[var(--ink-dim)]">{card.back}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="border-l border-[var(--line)] pl-6 md:pl-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Input Rules
          </p>
          <ul className="mt-4 space-y-3 text-sm text-[var(--ink-dim)]">
            <li>PDF only, one file per deck</li>
            <li>Max upload size: 10 MB</li>
            <li>Cards are saved to DB immediately after generation</li>
            <li>Gemini key is required for card generation</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
