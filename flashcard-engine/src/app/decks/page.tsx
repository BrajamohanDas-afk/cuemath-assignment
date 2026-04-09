const sampleDecks = [
  {
    name: "Quadratic Equations",
    cards: 42,
    dueToday: 13,
    updated: "2h ago",
    state: "Active",
  },
  {
    name: "French Revolution",
    cards: 30,
    dueToday: 6,
    updated: "1d ago",
    state: "Steady",
  },
  {
    name: "Cell Biology Basics",
    cards: 55,
    dueToday: 18,
    updated: "3d ago",
    state: "Needs focus",
  },
];

export default function DecksPage() {
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
        {sampleDecks.map((deck) => (
          <div
            key={deck.name}
            className="grid grid-cols-[1.4fr_0.5fr_0.5fr_0.6fr] items-center gap-4 border-b border-[var(--line)] px-5 py-4 last:border-b-0"
          >
            <div>
              <p className="text-lg font-semibold">{deck.name}</p>
              <p className="mt-1 text-xs text-[var(--ink-dim)]">
                Updated {deck.updated}
              </p>
            </div>
            <p className="text-sm font-medium">{deck.cards}</p>
            <p className="text-sm font-medium">{deck.dueToday}</p>
            <p className="text-sm text-[var(--ink-dim)]">{deck.state}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
