# Cuemath Assignment - Flashcard Engine

This repository contains my Cuemath AI Builder assignment work for:

- **Problem 1: The Flashcard Engine**

Goal:
- Convert study PDFs into useful flashcards and support long-term retention with active recall and spaced repetition.

## Repository Structure

- `Brain/`
  - Planning and context notes (`plan.md`, `context.md`, PDFs)
- `flashcard-engine/`
  - Main Next.js application code

## Current Status

- Milestone 1 completed:
  - App shell and routes (`/`, `/upload`, `/decks`, `/review`, `/progress`)
  - API routes (`/api/health`, `/api/config`)
  - Prisma schema foundation
  - Typed environment validation
  - Basic API rate limiting

## Quick Start

From the repository root:

```powershell
cd "flashcard-engine"
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Open:
- `http://localhost:3000`

## Important Notes

- Do not commit secrets.
- Keep API keys server-side only.
- Use `.env.example` as the template for required environment variables.

## More Details

- App setup and scripts: `flashcard-engine/README.md`
- Planning and milestone notes: `Brain/plan.md`
- Session/context log: `Brain/context.md`
