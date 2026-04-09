# CODEX.md

Project memory and operating rules for this repository.

## Project

- Challenge: Cuemath AI Builder
- Selected problem: Problem 1 - The Flashcard Engine
- Goal: Convert any PDF into high-quality flashcards and drive long-term retention with active recall + spaced repetition.
- Hard deadline: submit before April 13, 2026.

## Current Status

- Milestone 1 completed.
- Implemented:
  - Next.js app shell and core routes: `/`, `/upload`, `/decks`, `/review`, `/progress`
  - API endpoints: `/api/health`, `/api/config`
  - Prisma schema foundation for decks/cards/reviews/schedule/sessions
  - Typed environment validation and env template
  - Build/lint/prisma verification commands passing

## Stack Decisions

- Frontend: Next.js (App Router), TypeScript, Tailwind CSS
- Backend: Next.js route handlers
- DB: Prisma + SQLite for MVP speed
- AI calls: backend-only API integration (no client-side keys)

## Priority Order

1. Ingestion quality
2. Spaced repetition scheduling
3. Progress and mastery UX
4. Deck management polish
5. Delight and refinement

## Milestone Plan (Compressed)

- April 9: Foundation + deployable skeleton (done in code)
- April 10: PDF upload/extraction + first AI deck generation
- April 11: Review engine + SM-2 scheduling
- April 12: Progress, polish, and submission assets
- April 13: Buffer only (emergency fixes)

## Commands

```bash
npm install
npm run dev
npm run lint
npm run build
npm run prisma:generate
npm run prisma:push
```

## Security Rules

- Never expose secrets in client code.
- Keep API keys only in server env variables.
- Do not commit `.env`.
- Validate all runtime config at startup.

## Workflow Rules For This Repo

- Keep all assignment context docs in:
  - `C:\MyFile\Study material\Cuemath assignment\Brain`
- Keep product code in:
  - `C:\MyFile\Study material\Cuemath assignment\flashcard-engine`
- Before claiming completion, run verification commands and report evidence.
- If a requested skill is not available, state it explicitly.

## Next Immediate Task

- Start Milestone 2:
  - Build real PDF upload
  - Parse/extract text
  - Generate first pass of flashcards through backend AI pipeline

