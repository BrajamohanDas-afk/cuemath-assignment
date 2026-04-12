# Flashcard Engine (Cuemath Build Challenge)

PDF-to-flashcards app with spaced repetition, user-scoped data, and Google OAuth login.

## Implemented Features

- App routes:
  - `/`
  - `/login`
  - `/account`
  - `/upload`
  - `/decks`
  - `/review`
  - `/progress`
- API routes:
  - `GET /api/health`
  - `GET /api/config`
  - `GET|POST|DELETE /api/decks`
  - `GET|POST /api/review`
  - `GET /api/auth/google/start`
  - `GET /api/auth/google/callback`
  - `POST /api/auth/logout`
  - `POST /api/auth/delete-account`
- Database:
  - `User`, `Deck`, `Card`, `CardSchedule`, `Review`, `Session`, `AuthSession`
- Ownership enforcement:
  - Decks/cards/review operations are scoped to the authenticated user
- Authentication:
  - Google OAuth login
  - HttpOnly app session cookie
  - Account page for sign-out and permanent account deletion
  - Protected pages (`/account`, `/upload`, `/decks`, `/review`, `/progress`) when Google OAuth is enabled
  - Automatic local fallback user mode when Google OAuth is not configured in production

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Apply schema/migrations (PostgreSQL):

```bash
npm run prisma:migrate
```

5. Start app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Google OAuth Configuration

For production isolated user accounts, set:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APP_BASE_URL` (your deployed app URL)

Google OAuth callback URL:

```text
https://<your-domain>/api/auth/google/callback
```

## Environment Variables

See `.env.example` for full template.

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `ALLOW_EXTERNAL_LLM`
- `APP_API_TOKEN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SESSION_TTL_DAYS`
- `APP_BASE_URL`

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run prisma:generate`
- `npm run prisma:push`
- `npm run prisma:migrate`

## Security Notes

- Keep all secrets server-side only.
- Session tokens are stored as SHA-256 hashes in DB.
- Review and deck APIs require authenticated user context (or local fallback mode if OAuth is disabled).

## Verification

Before release:

- `npm run lint`
- `npm run build`
