import Link from "next/link";
import { listDeckSummaries } from "@/lib/deck-service";
import { DecksTable } from "@/app/decks/decks-table";

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

      {decks.length === 0 ? (
        <div className="mt-8 border border-[var(--line)] bg-[var(--panel)] px-5 py-8 text-sm text-[var(--ink-dim)]">
          <p>No decks yet. Upload your first PDF to generate flashcards.</p>
          <Link
            href="/upload"
            className="mt-4 inline-flex border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-4 py-2 font-medium text-[var(--ink)] transition hover:border-[var(--ink)]"
          >
            Go to upload
          </Link>
        </div>
      ) : (
        <DecksTable
          decks={decks.map((deck) => ({
            ...deck,
            updatedAt: deck.updatedAt.toISOString(),
          }))}
        />
      )}
    </section>
  );
}
