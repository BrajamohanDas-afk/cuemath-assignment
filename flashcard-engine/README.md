# Flashcard Engine (Cuemath Build Challenge)

Milestone 2 implementation for **Problem 1: The Flashcard Engine**.

## What is implemented in Milestone 2

- Next.js app shell with core routes:
  - `/`
  - `/upload`
  - `/decks`
  - `/review`
  - `/progress`
- API routes:
  - `GET /api/health`
  - `GET /api/config` (safe runtime config)
  - `GET /api/decks` (deck summaries with due counts)
  - `POST /api/decks` (PDF upload -> extraction -> flashcard generation -> save deck)
- Database foundation with Prisma schema for:
  - decks
  - cards
  - card schedules (spaced repetition fields)
  - reviews
  - sessions
- Milestone 2 ingestion flow:
  - server-side PDF extraction with `pdf-parse`
  - OpenAI-backed card generation when `OPENAI_API_KEY` is set
  - automatic local fallback generation when key is missing or request fails
  - deck and card persistence in SQLite via Prisma
- Environment variable structure via `.env.example`.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
cp .env.example .env
```

If `cp` is unavailable on Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Push schema to local SQLite DB:

```bash
npm run prisma:push
```

5. Run development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - start production server
- `npm run lint` - lint project
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:push` - apply schema to DB
- `npm run prisma:migrate` - create/apply migration (dev)

## Security note

- Keep `OPENAI_API_KEY` only in server-side env variables.
- Never expose keys in client code or commit secrets to git.
