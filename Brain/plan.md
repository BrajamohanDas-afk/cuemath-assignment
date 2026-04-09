# Flashcard Engine Plan

## 1) Problem and Goal

Build a flashcard app that converts any study PDF into a high-quality, practice-ready deck and helps students retain content using active recall plus spaced repetition.

Primary goal:
- Improve long-term retention, not just one-time card generation.

## 2) Success Criteria (What "Good" Looks Like)

- A user uploads a PDF and gets a meaningful, structured deck (not shallow cards).
- Daily review queue adapts based on performance (easy cards fade, hard cards return sooner).
- Progress is visible: mastered, shaky, due today.
- Users can manage many decks and resume where they left off.
- Product feels clean, motivating, and fast.

## 3) MVP Scope

### In scope
- PDF upload and extraction.
- AI-generated flashcards with coverage across:
  - concepts
  - definitions
  - relationships
  - edge cases
  - worked examples
- Review mode with spaced repetition (SM-2 based).
- Deck list, search, and per-deck review stats.
- Progress dashboard (mastery + due cards).
- Public deployment.

### Out of scope (for now)
- Multi-user classroom collaboration.
- Native mobile app.
- OCR for scanned/image-only PDFs (phase 2).

## 4) Product Flow

1. User uploads PDF and names the deck.
2. System extracts text and chunks content.
3. LLM generates candidate cards in multiple card types.
4. Quality pass removes duplicates and low-value cards.
5. User starts review session.
6. After each answer, user rates recall (Again/Hard/Good/Easy).
7. Scheduler updates next review date.
8. Dashboard updates mastery and due counts.

## 5) Feature Design

### A) Ingestion Quality
- Pipeline:
  1. extract text
  2. segment by topic
  3. generate cards by category
  4. deduplicate
  5. difficulty label
- Card types in MVP:
  - Q/A concept cards
  - definition cards
  - cloze-style fill cards
  - worked-example cards

### B) Spaced Repetition
- Use SM-2 style scheduling with per-card fields:
  - ease_factor
  - interval_days
  - repetition_count
  - due_at
- User feedback buttons:
  - Again
  - Hard
  - Good
  - Easy

### C) Progress and Mastery
- Deck-level metrics:
  - total cards
  - due today
  - mastered
  - accuracy trend
- Card states:
  - new
  - learning
  - review
  - relearning

### D) Deck Management
- Deck list page with search/sort.
- Per-deck details:
  - source PDF
  - created date
  - review streak
  - next due count
- Resume review from last session.

### E) Delight
- Clear, minimal UI with fast transitions.
- Positive reinforcement microcopy (short, non-distracting).
- Session summary at end: progress + next due.

## 6) Technical Architecture

### Suggested stack
- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: Next.js API routes (or small Node service)
- DB: PostgreSQL (or SQLite for MVP speed)
- PDF extraction: `pypdf` service or Node PDF parser
- AI card generation: server-side LLM API calls

### Core modules
- `ingestion`: PDF parse, clean, chunk.
- `generation`: prompts + structured card output.
- `scheduler`: SM-2 update logic.
- `review`: session orchestration and scoring.
- `analytics`: mastery/progress summaries.

## 7) Data Model (MVP)

- `users` (optional single-user local mode)
- `decks` (id, title, source_file, created_at)
- `cards` (id, deck_id, type, front, back, difficulty, tags)
- `reviews` (id, card_id, rating, answered_at, response_time_ms)
- `card_schedule` (card_id, due_at, interval_days, ease_factor, repetitions, state)
- `sessions` (id, deck_id, started_at, ended_at, stats_json)

## 8) Security and Reliability

- Keep LLM/API keys server-side only.
- Validate file type and size on upload.
- Sanitize parsed text and strip unsafe content.
- Add retry + timeout around LLM generation.
- Log ingestion and generation failures with user-safe messages.

## 9) Build Plan and Milestones

Deadline target: submit before **April 13, 2026**.

### Milestone 1 - April 9, 2026 (Foundation + Deployable Skeleton)
- Set up app shell, routes, DB schema, and env structure.
- Push first deployment with a working home page and upload UI shell.

### Milestone 2 - April 10, 2026 (PDF to High-Quality Deck)
- Implement upload + extraction + chunking.
- Implement AI card generation pipeline with dedup and card typing.
- Deliver first end-to-end "PDF -> deck" working flow.

### Milestone 3 - April 11, 2026 (Review Engine + Progress)
- Implement SM-2 scheduler and review flow (Again/Hard/Good/Easy).
- Add mastery/progress metrics and deck resume behavior.

### Milestone 4 - April 12, 2026 (Polish + Submission Package)
- UI polish, empty states, failure handling, performance pass.
- Final deployment validation on public URL.
- Record 2-5 minute walkthrough video.
- Finalize write-up and clean public GitHub repo.

### Milestone 5 - April 13, 2026 (Buffer Only, Not Build Day)
- Reserved only for emergency fixes.
- Submission should already be ready before this date.

## 10) Evaluation Alignment

This plan explicitly targets what evaluators care about:
- Functional deployed product: end-to-end flow works on public URL.
- Smart choices: SM-2 based scheduler and quality-focused ingestion.
- Delight: smooth, motivating review experience.
- Process thinking: clear tradeoffs and phased delivery.
- Security: no exposed secrets, all AI keys backend-only.

## 11) Risks and Mitigations

- Risk: weak card quality from noisy PDFs.
  - Mitigation: multi-pass generation + dedup + quality scoring.
- Risk: slow generation on large PDFs.
  - Mitigation: chunk limits + async job status + incremental deck readiness.
- Risk: reviewer confusion in UI.
  - Mitigation: guided first-session flow and clear button labels.

## 12) Submission Checklist

- Deadline: **before April 13, 2026**.
- Public live URL.
- 2-5 min walkthrough video.
- Write-up covering decisions, tradeoffs, and future improvements.
- Public GitHub repository.
- Verify no secrets in code, client bundle, or repo history.
