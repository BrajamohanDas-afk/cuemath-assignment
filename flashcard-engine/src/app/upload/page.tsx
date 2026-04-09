export default function UploadPage() {
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
          Milestone 2 connects this screen to the ingestion pipeline. The UI is
          already structured for drag-drop upload, parsing, and generation status.
        </p>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[1.2fr_0.8fr]">
        <div className="relative overflow-hidden border border-[var(--line)] bg-[var(--panel)] p-8 md:p-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-dim)]">
            Drop Zone
          </p>
          <p className="mt-2 text-xl font-semibold">Drop your PDF here</p>
          <p className="mt-2 max-w-md text-sm text-[var(--ink-dim)]">
            Supports study notes, textbooks, and lecture handouts. We will split
            content into meaningful chunks before card generation.
          </p>
          <div className="mt-8 border border-dashed border-[var(--line)] bg-[rgba(255,255,255,0.65)] p-10 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-dim)]">
              Placeholder
            </p>
            <p className="mt-2 text-sm text-[var(--ink-dim)]">
              Upload interaction will be wired in Milestone 2.
            </p>
          </div>
        </div>

        <aside className="border-l border-[var(--line)] pl-6 md:pl-8">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
            Input Rules
          </p>
          <ul className="mt-4 space-y-3 text-sm text-[var(--ink-dim)]">
            <li>PDF only, one file per deck</li>
            <li>Large files will be chunked before generation</li>
            <li>API key is read server-side from env</li>
            <li>Deck title can be edited before final save</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
