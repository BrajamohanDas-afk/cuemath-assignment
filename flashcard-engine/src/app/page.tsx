import Link from "next/link";
import { HomeTokenPanel } from "@/app/home-token-panel";

const flow = [
  {
    title: "Ingest",
    detail: "Upload source notes and keep structure intact during extraction.",
  },
  {
    title: "Generate",
    detail: "Create concept, definition, cloze, and example cards with coverage.",
  },
  {
    title: "Retain",
    detail: "Review with spaced repetition so hard cards return at the right time.",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero-bleed relative overflow-hidden border-b border-[var(--line)]">
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(1000px 520px at 80% 20%, rgba(181, 72, 34, 0.22), transparent 62%), radial-gradient(680px 400px at 14% 78%, rgba(19, 21, 26, 0.16), transparent 70%), linear-gradient(115deg, #f3efe7 0%, #e8dfcf 100%)",
          }}
        />
        <div className="shell relative grid min-h-[calc(100svh-86px)] content-center py-16">
          <p className="motion-rise text-[0.72rem] font-mono uppercase tracking-[0.24em] text-[var(--accent)]">
            Flashcard Engine
          </p>
          <h2 className="motion-rise delay-1 mt-4 max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
            Turn any PDF into focused flashcards that actually stick.
          </h2>
          <p className="motion-rise delay-2 mt-5 max-w-xl text-base text-[var(--ink-dim)] md:text-lg">
            A study engine built around active recall and spaced repetition,
            designed to improve retention instead of one-time memorization.
          </p>
          <div className="motion-rise delay-3 mt-9 flex flex-wrap gap-3">
            <Link
              href="/upload"
              className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-6 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--ink)]"
            >
              Start with a PDF
            </Link>
            <Link
              href="/review"
              className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-6 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--ink)]"
            >
              Open review queue
            </Link>
          </div>
          <HomeTokenPanel />
        </div>
      </section>

      <section className="shell py-14 md:py-20">
        <div className="grid gap-10 border-t border-[var(--line)] pt-10 md:grid-cols-[0.95fr_1.05fr]">
          <h3 className="text-2xl font-semibold leading-tight md:text-3xl">
            One pipeline. Three moments.
          </h3>
          <ol className="space-y-6">
            {flow.map((step, index) => (
              <li
                key={step.title}
                className="grid grid-cols-[auto_1fr] gap-4 border-b border-[var(--line)] pb-5 last:border-b-0"
              >
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-lg font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm text-[var(--ink-dim)]">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell pb-10">
        <div className="grid gap-10 border-t border-[var(--line)] pt-10 md:grid-cols-[1.15fr_0.85fr] md:items-end">
          <div className="relative overflow-hidden border border-[var(--line)] bg-[var(--panel)] p-8 md:p-10">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
              Built For Learning
            </p>
            <p className="mt-4 max-w-xl text-2xl font-semibold leading-tight">
              Upload once, generate quality cards, and retain knowledge with
              spaced repetition.
            </p>
            <p className="mt-4 text-sm text-[var(--ink-dim)]">
              The workflow stays focused: PDF ingestion, structured flashcards,
              review scheduling, and progress tracking in one place.
            </p>
          </div>
          <div className="border-l border-[var(--line)] pl-6 md:pl-8">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
              What You Get
            </p>
            <p className="mt-3 text-3xl font-semibold leading-tight">Real Study Workflow</p>
            <p className="mt-2 text-sm text-[var(--ink-dim)]">
              Decks, review queue, and progress insights backed by persistent
              data and user-scoped access control.
            </p>
          </div>
        </div>
      </section>

      <section className="shell pb-16 md:pb-20">
        <div className="border-t border-[var(--line)] pt-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
                Ready To Start
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                Build your first deck from a PDF.
              </p>
            </div>
            <Link
              href="/upload"
              className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-6 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--ink)]"
            >
              Go to upload flow
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
