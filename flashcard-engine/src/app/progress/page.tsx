const metrics = [
  { label: "Mastered", value: "61%", detail: "Cards with stable retention" },
  { label: "Shaky", value: "24%", detail: "Need near-term review" },
  { label: "New", value: "15%", detail: "Not yet learned" },
];

export default function ProgressPage() {
  return (
    <section className="shell py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Progress
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Progress and Mastery
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          A quick snapshot of retention quality, weak zones, and current review
          pressure.
        </p>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4 border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Mastery Mix
          </p>
          {metrics.map((metric) => (
            <div key={metric.label} className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{metric.label}</span>
                <span className="font-mono text-xs text-[var(--ink-dim)]">
                  {metric.value}
                </span>
              </div>
              <div className="h-2 overflow-hidden bg-[rgba(19,21,26,0.12)]">
                <div
                  className="h-full bg-[var(--ink)]"
                  style={{ width: metric.value }}
                />
              </div>
              <p className="text-xs text-[var(--ink-dim)]">{metric.detail}</p>
            </div>
          ))}
        </div>

        <div className="border-l border-[var(--line)] pl-6 md:pl-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Session Signals
          </p>
          <dl className="mt-4 grid gap-5 text-sm">
            <div>
              <dt className="text-[var(--ink-dim)]">Cards due today</dt>
              <dd className="mt-1 text-3xl font-semibold">37</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">Current streak</dt>
              <dd className="mt-1 text-3xl font-semibold">8 days</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-dim)]">Average response time</dt>
              <dd className="mt-1 text-3xl font-semibold">4.1s</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-8 border-t border-[var(--line)] pt-6">
        <p className="max-w-2xl text-sm text-[var(--ink-dim)]">
          Placeholder analytics for Milestone 1. Milestone 3 will populate these
          with real session and scheduling data.
        </p>
      </div>
    </section>
  );
}
