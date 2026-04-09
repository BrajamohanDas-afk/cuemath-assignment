const nextQueue = [
  { deck: "Quadratic Equations", count: 13 },
  { deck: "French Revolution", count: 6 },
  { deck: "Cell Biology Basics", count: 18 },
];

export default function ReviewPage() {
  return (
    <section className="shell py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Review Queue
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Today&apos;s active recall session.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          Milestone 3 will bind this surface to SM-2 scheduling and persistent
          answer ratings.
        </p>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
        <aside className="border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Due Today
          </p>
          <ul className="mt-4 space-y-2">
            {nextQueue.map((item) => (
              <li
                key={item.deck}
                className="flex items-center justify-between border-b border-[var(--line)] pb-2 text-sm last:border-b-0"
              >
                <span>{item.deck}</span>
                <span className="font-medium text-[var(--ink-dim)]">
                  {item.count} cards
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <div className="border border-[var(--line)] bg-[var(--panel)] p-6 md:p-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
            Current Card
          </p>
          <h3 className="mt-3 text-2xl font-semibold leading-tight">
            Explain why the discriminant decides how many roots a quadratic has.
          </h3>
          <p className="mt-3 max-w-xl text-sm text-[var(--ink-dim)]">
            Placeholder card surface. Final mode will show front/back states and
            collect response quality.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {["Again", "Hard", "Good", "Easy"].map((rating) => (
              <button
                key={rating}
                type="button"
                className="border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm font-medium transition hover:border-[var(--ink)]"
              >
                {rating}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
