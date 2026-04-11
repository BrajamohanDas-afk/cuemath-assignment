"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-access";

type DeckItem = {
  id: string;
  title: string;
  dueCount: number;
  cardCount: number;
};

type ReviewCard = {
  id: string;
  deckId: string;
  deckTitle: string;
  type: string;
  front: string;
  back: string;
  difficulty: number;
  tags: string[];
  state: "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";
  dueAt: string;
};

type QueuePayload = {
  queue: {
    card: ReviewCard | null;
    dueCount: number;
    totalCardCount: number;
  };
};

type RateResponse = {
  sessionId: string;
  queue: {
    card: ReviewCard | null;
    dueCount: number;
    totalCardCount: number;
  };
};

type ExplainResponse = {
  explanation: string;
  evidence: string[];
  provider: "openai" | "fallback";
  warning: string | null;
  source: "uploaded_pdf";
};

type SessionStats = {
  reviewed: number;
  correct: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
};

const INITIAL_SESSION_STATS: SessionStats = {
  reviewed: 0,
  correct: 0,
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
};

const RATINGS = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
type RatingValue = (typeof RATINGS)[number];
const RATING_HINTS: Record<RatingValue, string> = {
  AGAIN: "10m",
  HARD: "soon",
  GOOD: "later",
  EASY: "much later",
};

export default function ReviewPage() {
  const [decks, setDecks] = useState<DeckItem[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuePayload["queue"] | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardStartTime, setCardStartTime] = useState<number | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainResponse | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats>(
    INITIAL_SESSION_STATS,
  );
  const [sessionDueTotal, setSessionDueTotal] = useState<number | null>(null);
  const selectedDeckRef = useRef<string>("");
  const submitRequestIdRef = useRef(0);
  const loadQueueRequestIdRef = useRef(0);

  const loadDecks = useCallback(async (preferredDeckId?: string) => {
    setLoadingDecks(true);
    setErrorMessage(null);
    try {
      const response = await apiFetch("/api/decks?view=review");
      const payload = (await response.json()) as {
        decks: DeckItem[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to load decks.");
      }

      setDecks(payload.decks);
      const hasPreferredDeck =
        preferredDeckId !== undefined &&
        payload.decks.some((deck) => deck.id === preferredDeckId);

      if (hasPreferredDeck) {
        setSelectedDeckId(preferredDeckId);
      } else {
        const initialDeck =
            payload.decks
              .filter((deck) => deck.dueCount > 0)
              .sort((a, b) => b.dueCount - a.dueCount)[0]?.id ??
            payload.decks[0]?.id ??
            "";

        setSelectedDeckId(initialDeck);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load decks.");
    } finally {
      setLoadingDecks(false);
    }
  }, []);

  useEffect(() => {
    const preferredDeckId =
      new URLSearchParams(window.location.search).get("deckId") ?? undefined;
    void loadDecks(preferredDeckId);
  }, [loadDecks]);

  useEffect(() => {
    selectedDeckRef.current = selectedDeckId;
  }, [selectedDeckId]);

  useEffect(() => {
    if (!selectedDeckId) {
      setQueue(null);
      setSessionStats({ ...INITIAL_SESSION_STATS });
      setSessionDueTotal(null);
      return;
    }

    setSessionId(null);
    setSessionStats({ ...INITIAL_SESSION_STATS });
    setSessionDueTotal(null);
    void loadQueue(selectedDeckId);
  }, [selectedDeckId]);

  async function loadQueue(deckId: string, excludeCardId?: string) {
    const requestId = loadQueueRequestIdRef.current + 1;
    loadQueueRequestIdRef.current = requestId;
    setLoadingQueue(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({ deckId });
      if (excludeCardId) {
        params.set("excludeCardId", excludeCardId);
      }
      const response = await apiFetch(`/api/review?${params.toString()}`);
      const payload = (await response.json()) as QueuePayload & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to load review queue.");
      }

      if (
        loadQueueRequestIdRef.current !== requestId ||
        selectedDeckRef.current !== deckId
      ) {
        return;
      }

      setQueue(payload.queue);
      setSessionDueTotal((current) => {
        if (current !== null) {
          return current;
        }
        return payload.queue.card ? payload.queue.dueCount : 0;
      });
      setShowAnswer(false);
      setCardStartTime(payload.queue.card ? Date.now() : null);
      setExplainError(null);
      setExplainResult(null);
    } catch (error) {
      if (loadQueueRequestIdRef.current !== requestId) {
        return;
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load review queue.",
      );
    } finally {
      if (loadQueueRequestIdRef.current === requestId) {
        setLoadingQueue(false);
      }
    }
  }

  async function submitRating(rating: RatingValue) {
    if (!queue?.card || !selectedDeckId || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    const requestDeckId = selectedDeckId;
    const requestId = submitRequestIdRef.current + 1;
    submitRequestIdRef.current = requestId;

    const responseTimeMs = cardStartTime
      ? Math.max(1, Date.now() - cardStartTime)
      : undefined;

    try {
      const response = await apiFetch("/api/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deckId: requestDeckId,
          cardId: queue.card.id,
          rating,
          responseTimeMs,
          sessionId: sessionId ?? undefined,
        }),
      });

      const payload = (await response.json()) as RateResponse & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to submit card rating.");
      }

      if (
        submitRequestIdRef.current !== requestId ||
        selectedDeckRef.current !== requestDeckId
      ) {
        return;
      }

      setSessionId(payload.sessionId);
      setSessionStats((current) => ({
        reviewed: current.reviewed + 1,
        correct: current.correct + (rating === "GOOD" || rating === "EASY" ? 1 : 0),
        again: current.again + (rating === "AGAIN" ? 1 : 0),
        hard: current.hard + (rating === "HARD" ? 1 : 0),
        good: current.good + (rating === "GOOD" ? 1 : 0),
        easy: current.easy + (rating === "EASY" ? 1 : 0),
      }));
      setQueue(payload.queue);
      setShowAnswer(false);
      setCardStartTime(payload.queue.card ? Date.now() : null);
      setExplainError(null);
      setExplainResult(null);
      setDecks((currentDecks) =>
        currentDecks.map((deck) =>
          deck.id === requestDeckId
            ? {
                ...deck,
                dueCount: Math.max(payload.queue.dueCount, 0),
              }
            : deck,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to submit card rating.",
      );
    } finally {
      if (submitRequestIdRef.current === requestId) {
        setSubmitting(false);
      }
    }
  }

  async function skipCard() {
    if (!queue?.card || !selectedDeckId || loadingQueue || submitting) {
      return;
    }

    setExplainError(null);
    setExplainResult(null);
    setShowAnswer(false);
    await loadQueue(selectedDeckId, queue.card.id);
  }

  async function explainAnswer() {
    if (!queue?.card || !selectedDeckId || !showAnswer || isExplaining) {
      return;
    }

    setIsExplaining(true);
    setExplainError(null);

    try {
      const response = await apiFetch("/api/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deckId: selectedDeckId,
          cardId: queue.card.id,
        }),
      });

      const payload = (await response.json()) as ExplainResponse & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to explain answer.");
      }

      setExplainResult(payload);
    } catch (error) {
      setExplainError(
        error instanceof Error ? error.message : "Failed to explain answer.",
      );
    } finally {
      setIsExplaining(false);
    }
  }

  const nextDeckWithDueId =
    decks.find((deck) => deck.id !== selectedDeckId && deck.dueCount > 0)?.id ??
    null;
  const dueTotal = sessionDueTotal ?? 0;
  const dueRemaining = queue?.dueCount ?? 0;
  const dueCompleted = Math.max(0, dueTotal - dueRemaining);
  const currentCardIndex = queue?.card ? Math.min(dueTotal, dueCompleted + 1) : dueTotal;
  const progressPercent =
    dueTotal > 0 ? Math.round((Math.max(0, currentCardIndex - 1) / dueTotal) * 100) : 0;

  return (
    <section className="shell relative z-10 py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Review Queue
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Today&apos;s active recall session.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          Real review mode with schedule-aware cards and Again/Hard/Good/Easy
          feedback.
        </p>
      </header>

      <div className="mt-8 grid items-stretch gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="min-w-0 h-full border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
              Due By Deck
            </p>
            {loadingDecks ? (
              <span className="text-xs text-[var(--ink-dim)]">Loading...</span>
            ) : null}
          </div>

          <div className="mt-4">
            <label
              htmlFor="deck-select"
              className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]"
            >
              Active deck
            </label>
            <select
              id="deck-select"
              value={selectedDeckId}
              onChange={(event) => setSelectedDeckId(event.target.value)}
              className="mt-2 w-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
              disabled={loadingDecks || submitting || decks.length === 0}
            >
              {decks.length === 0 ? (
                <option value="">No decks available</option>
              ) : null}
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.title} ({deck.dueCount} due)
                </option>
              ))}
            </select>
          </div>

          <ul className="mt-4 space-y-2">
            {decks.map((deck) => (
              <li
                key={deck.id}
                className="flex items-center justify-between border-b border-[var(--line)] pb-2 text-sm last:border-b-0"
              >
                <span>{deck.title}</span>
                <span className="font-medium text-[var(--ink-dim)]">
                  {deck.dueCount} due
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 h-full overflow-hidden border border-[var(--line)] bg-[var(--panel)] p-6 md:p-8">
          {errorMessage ? (
            <p className="mb-4 border border-[rgba(170,45,35,0.4)] bg-[rgba(170,45,35,0.08)] px-3 py-2 text-sm text-[rgb(120,32,25)]">
              {errorMessage}
            </p>
          ) : null}

          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
            Current Card
          </p>

          {loadingQueue ? (
            <p className="mt-3 text-sm text-[var(--ink-dim)]">Loading queue...</p>
          ) : null}

          {!loadingQueue && !queue?.card ? (
            <div className="mt-3 space-y-2">
              <p className="text-2xl font-semibold leading-tight">No due cards right now.</p>
              <p className="text-sm text-[var(--ink-dim)]">
                Pick another deck or come back when cards become due.
              </p>
              {sessionStats.reviewed > 0 ? (
                <div className="mt-4 border border-[var(--line)] bg-[rgba(255,255,255,0.76)] p-4">
                  <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                    Session Summary
                  </p>
                  <p className="mt-2 text-sm">
                    Reviewed {sessionStats.reviewed} cards with{" "}
                    {Math.round((sessionStats.correct / sessionStats.reviewed) * 100)}% correct.
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-dim)]">
                    Again {sessionStats.again} | Hard {sessionStats.hard} | Good{" "}
                    {sessionStats.good} | Easy {sessionStats.easy}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {!loadingQueue && queue?.card ? (
            <>
              <div className="mt-4 min-w-0 border border-[var(--line)] bg-[rgba(255,255,255,0.72)] p-5 md:p-7">
                <div className="mb-5 border border-[var(--line)] bg-[rgba(255,255,255,0.82)] p-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                    Card {currentCardIndex} of {dueTotal} due today
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden bg-[rgba(19,21,26,0.12)]">
                    <div
                      className="h-full bg-[var(--ink)] transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                  {queue.dueCount} / {queue.totalCardCount}
                </p>
                <h3 className="mt-5 break-words text-3xl font-semibold leading-tight md:text-4xl md:leading-tight">
                  {queue.card.front}
                </h3>
                <p className="mt-3 break-words text-xs uppercase tracking-[0.12em] text-[var(--ink-dim)]">
                  {queue.card.type} | {queue.card.state} | Difficulty {queue.card.difficulty}
                </p>

                <div className="mt-5 border border-[var(--line)] bg-[rgba(255,255,255,0.8)] p-4 md:p-5">
                  {showAnswer ? (
                    <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-[var(--ink)]">
                      {queue.card.back}
                    </p>
                  ) : (
                    <p className="text-sm text-[var(--ink-dim)]">
                      Reveal answer when you finish recalling.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAnswer((prev) => !prev);
                      setExplainError(null);
                      setExplainResult(null);
                    }}
                    className="border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-4 py-2 text-sm font-medium transition hover:border-[var(--ink)]"
                  >
                    {showAnswer ? "Hide answer" : "See answer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void explainAnswer()}
                    disabled={!showAnswer || isExplaining}
                    className="border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-4 py-2 text-sm font-medium transition hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isExplaining ? "Explaining..." : "Explain answer"}
                  </button>
                  <p className="text-sm text-[var(--ink-dim)]">
                    Due now: {queue.dueCount} / Total in deck: {queue.totalCardCount}
                  </p>
                </div>

                {explainError ? (
                  <p className="mt-3 border border-[rgba(170,45,35,0.4)] bg-[rgba(170,45,35,0.08)] px-3 py-2 text-sm text-[rgb(120,32,25)]">
                    {explainError}
                  </p>
                ) : null}

                {showAnswer && explainResult ? (
                  <div className="mt-4 space-y-3 border border-[var(--line)] bg-[rgba(255,255,255,0.84)] p-4">
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-[var(--ink-dim)]">
                      Answer Explanation
                    </p>
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--ink)]">
                      {explainResult.explanation}
                    </p>
                    <div className="space-y-2">
                      {explainResult.evidence.map((item, index) => (
                        <p
                          key={`${item}-${index}`}
                          className="border border-[var(--line)] bg-[rgba(255,255,255,0.76)] px-3 py-2 text-sm text-[var(--ink-dim)]"
                        >
                          {item}
                        </p>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--ink-dim)]">
                      Source: Uploaded PDF
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <button
                  type="button"
                  disabled={loadingQueue || submitting}
                  onClick={() => void skipCard()}
                  className="border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm font-medium transition hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Skip
                </button>
                {showAnswer ? (
                  RATINGS.map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      disabled={submitting}
                      onClick={() => void submitRating(rating)}
                      className="border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-left text-sm font-medium transition hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="block">
                        {rating === "AGAIN"
                          ? "Again"
                          : rating === "HARD"
                            ? "Hard"
                            : rating === "GOOD"
                              ? "Good"
                              : "Easy"}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-normal uppercase tracking-[0.1em] text-[var(--ink-dim)]">
                        {RATING_HINTS[rating]}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="col-span-1 border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[var(--ink-dim)] sm:col-span-4">
                    Reveal answer to rate this card
                  </p>
                )}
              </div>
            </>
          ) : null}

          {!loadingQueue && !queue?.card && sessionStats.reviewed > 0 ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (nextDeckWithDueId) {
                    setSelectedDeckId(nextDeckWithDueId);
                  }
                }}
                disabled={!nextDeckWithDueId}
                className="border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-4 py-2 text-sm font-medium transition hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Review another deck
              </button>
              <Link
                href="/progress"
                className="border border-[var(--line)] bg-[rgba(255,255,255,0.78)] px-4 py-2 text-sm font-medium transition hover:border-[var(--ink)]"
              >
                Back tomorrow
              </Link>
            </div>
          ) : null}
        </div>
      </div>

    </section>
  );
}
