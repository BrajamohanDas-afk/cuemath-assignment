import { sanitizeNextPath } from "@/lib/auth-google";
import { getSafeRuntimeConfig } from "@/lib/env";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params?.next);
  const googleStartHref = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`;
  const errorMessage = mapErrorToMessage(params?.error);
  const runtimeConfig = getSafeRuntimeConfig();

  return (
    <section className="shell py-10 md:py-14">
      <header className="border-b border-[var(--line)] pb-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">
          Sign In
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
          Continue with Google.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
          Use the same Google account on any device to keep your decks and progress synced.
        </p>
      </header>

      <div className="mt-8 max-w-xl border border-[var(--line)] bg-[var(--panel)] p-6">
        {runtimeConfig.googleAuthEnabled ? (
          <a
            href={googleStartHref}
            className="full border border-[var(--line)] bg-[var(--panel)] px-6 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--ink)]"
          >
            Continue with Google
          </a>
        ) : (
          <p className="text-sm text-[var(--ink-dim)]">
            Google login is not configured. This deployment is running in local
            fallback mode.
          </p>
        )}

        {errorMessage ? (
          <p className="mt-4 border border-[rgba(170,45,35,0.4)] bg-[rgba(170,45,35,0.08)] px-3 py-2 text-sm text-[rgb(120,32,25)]">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function mapErrorToMessage(errorCode: string | undefined): string | null {
  if (!errorCode) {
    return null;
  }

  switch (errorCode) {
    case "google_not_configured":
      return "Google OAuth is not configured on this deployment.";
    case "google_access_denied":
      return "Google sign-in was cancelled.";
    case "invalid_oauth_state":
      return "Sign-in session expired. Please try again.";
    case "google_token_exchange_failed":
      return "Could not complete Google sign-in. Please retry.";
    case "google_userinfo_failed":
      return "Could not fetch Google user profile. Please retry.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
