import Link from "next/link";
import { listDeckSummaries } from "@/lib/deck-service";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const decks = await listDeckSummaries();

  return (
    <section className="shell py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Decks
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          All decks at a glance.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          Scan volume, due load, and freshness before starting a review session.
        </p>
      </header>

      <div className="mt-8 overflow-hidden border border-[var(--line)] bg-[var(--panel)]">
        <div className="grid grid-cols-[1.4fr_0.5fr_0.5fr_0.6fr] gap-4 border-b border-[var(--line)] px-5 py-3 text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
          <span>Deck</span>
          <span>Cards</span>
          <span>Due</span>
          <span>Status</span>
        </div>

        {decks.length === 0 ? (
          <div className="px-5 py-8 text-sm text-[var(--ink-dim)]">
            <p>No decks yet. Upload your first PDF to generate flashcards.</p>
            <Link
              href="/upload"
              className="mt-4 inline-flex border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-4 py-2 font-medium text-[var(--ink)] transition hover:border-[var(--ink)]"
            >
              Go to upload
            </Link>
          </div>
        ) : null}

        {decks.map((deck) => (
          <div
            key={deck.id}
            className="grid grid-cols-[1.4fr_0.5fr_0.5fr_0.6fr] items-center gap-4 border-b border-[var(--line)] px-5 py-4 last:border-b-0"
          >
            <div>
              <p className="text-lg font-semibold">{deck.title}</p>
              <p className="mt-1 text-xs text-[var(--ink-dim)]">
                Source {deck.sourceFile} - Updated {formatRelativeTime(deck.updatedAt)}
              </p>
            </div>
            <p className="text-sm font-medium">{deck.cardCount}</p>
            <p className="text-sm font-medium">{deck.dueCount}</p>
            <p className="text-sm text-[var(--ink-dim)]">{deck.status}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  const diffMs = Math.max(0, now - then);
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
