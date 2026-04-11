# Regression Checklist (Milestone 4 Security/Correctness Pass)

Run before release:

1. API access token gate:
- Set `APP_API_TOKEN` in `.env`.
- Confirm `/api/decks` returns `401` without `x-api-token`.
- Confirm `/api/decks` and `/api/review` succeed with valid token.

2. User ownership isolation:
- Create a deck with user token A.
- Request `GET /api/review?deckId=<deck-from-A>` using token B and verify `404`.
- Attempt `DELETE /api/decks` for token A deck using token B and verify `404`.

3. Upload hardening:
- Upload a non-PDF file renamed to `.pdf` and verify `400`.
- Upload oversized request and verify `413`.
- Upload malformed PDF and verify generic parse error (no internal stack detail).

4. Review race safety:
- Switch decks quickly while queue is loading and verify active deck queue does not get overwritten.
- Submit a rating and immediately switch deck; verify stale submit result is ignored.

5. Progress windows:
- Verify `Due tomorrow` and `Due in next 7 days` counts match expected card due dates.

6. Date conversion:
- Verify `/decks` loads correctly when SQL returns numeric/bigint date-like values.

7. Explain fallback:
- Use a card with weak/no source overlap and verify fallback message says answer could not be confidently verified.

8. Basic verification:
- `npm run lint`
- `npm run build`
