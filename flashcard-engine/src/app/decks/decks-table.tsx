"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DeleteDeckButton } from "@/app/decks/delete-deck-button";

type DeckItem = {
  id: string;
  title: string;
  sourceFile: string;
  updatedAt: string;
  lastReviewAt: string | null;
  oldestOverdueAt: string | null;
  nextUpcomingDueAt: string | null;
  cardCount: number;
  dueCount: number;
  status: "Active" | "Steady" | "Calm";
};

type SortKey =
  | "updated_desc"
  | "updated_asc"
  | "due_desc"
  | "due_asc"
  | "cards_desc"
  | "cards_asc"
  | "title_asc"
  | "title_desc";

type DecksTableProps = {
  decks: DeckItem[];
};

export function DecksTable({ decks }: DecksTableProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc");

  const visibleDecks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery.length
      ? decks.filter((deck) =>
          `${deck.title} ${deck.sourceFile}`.toLowerCase().includes(normalizedQuery),
        )
      : decks;

    return [...filtered].sort((a, b) => compareDecks(a, b, sortKey));
  }, [decks, query, sortKey]);

  return (
    <div className="mt-8 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label
            htmlFor="deck-search"
            className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]"
          >
            Search decks
          </label>
          <input
            id="deck-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by deck or source file"
            className="mt-2 w-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
          />
        </div>

        <div className="min-w-[180px]">
          <label
            htmlFor="deck-sort"
            className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]"
          >
            Sort by
          </label>
          <select
            id="deck-sort"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="mt-2 w-full border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
          >
            <option value="updated_desc">Recently updated</option>
            <option value="updated_asc">Oldest updated</option>
            <option value="due_desc">Most due</option>
            <option value="due_asc">Least due</option>
            <option value="cards_desc">Most cards</option>
            <option value="cards_asc">Least cards</option>
            <option value="title_asc">Title A-Z</option>
            <option value="title_desc">Title Z-A</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-[var(--line)] bg-[var(--panel)]">
        <div className="min-w-[740px]">
          <div className="grid grid-cols-[1.2fr_0.4fr_0.4fr_0.4fr_0.9fr] gap-4 border-b border-[var(--line)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            <span>Deck</span>
            <span>Cards</span>
            <span>Due</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {visibleDecks.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[var(--ink-dim)]">
              No decks match your search.
            </div>
          ) : null}

          {visibleDecks.map((deck) => (
            <div
              key={deck.id}
              className="grid grid-cols-[1.2fr_0.4fr_0.4fr_0.4fr_0.9fr] items-center gap-4 border-b border-[var(--line)] px-5 py-4 last:border-b-0"
            >
              <div>
                <p className="text-lg font-semibold">{deck.title}</p>
                <p className="mt-1 text-xs text-[var(--ink-dim)]">
                  Source {deck.sourceFile} - Updated {formatRelativeTime(deck.updatedAt)}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-dim)]">
                  Last review {formatOptionalTime(deck.lastReviewAt)} - Next upcoming{" "}
                  {formatOptionalTime(deck.nextUpcomingDueAt)}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-dim)]">
                  Oldest overdue {formatOptionalTime(deck.oldestOverdueAt)}
                </p>
              </div>
              <p className="text-sm font-medium">{deck.cardCount}</p>
              <p className="text-sm font-medium">{deck.dueCount}</p>
              <p className="text-sm text-[var(--ink-dim)]">{deck.status}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/review?deckId=${encodeURIComponent(deck.id)}`}
                  className="border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:border-[var(--ink)]"
                >
                  Review
                </Link>
                <DeleteDeckButton deckId={deck.id} deckTitle={deck.title} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function compareDecks(a: DeckItem, b: DeckItem, sortKey: SortKey): number {
  switch (sortKey) {
    case "updated_desc":
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    case "updated_asc":
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    case "due_desc":
      return b.dueCount - a.dueCount;
    case "due_asc":
      return a.dueCount - b.dueCount;
    case "cards_desc":
      return b.cardCount - a.cardCount;
    case "cards_asc":
      return a.cardCount - b.cardCount;
    case "title_asc":
      return a.title.localeCompare(b.title);
    case "title_desc":
      return b.title.localeCompare(a.title);
    default:
      return 0;
  }
}

function formatRelativeTime(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "not set";
  }

  const diffMs = date.getTime() - Date.now();
  const absMinutes = Math.floor(Math.abs(diffMs) / (1000 * 60));
  const isFuture = diffMs > 0;

  if (absMinutes < 1) {
    return "just now";
  }
  if (absMinutes < 60) {
    return isFuture ? `in ${absMinutes}m` : `${absMinutes}m ago`;
  }

  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) {
    return isFuture ? `in ${absHours}h` : `${absHours}h ago`;
  }

  const absDays = Math.floor(absHours / 24);
  return isFuture ? `in ${absDays}d` : `${absDays}d ago`;
}

function formatOptionalTime(value: string | null): string {
  if (!value) {
    return "not set";
  }
  return formatRelativeTime(value);
}
