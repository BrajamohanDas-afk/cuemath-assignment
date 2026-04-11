"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AccountActionsProps = {
  canDelete: boolean;
  isGoogleAuthEnabled: boolean;
};

export function AccountActions({
  canDelete,
  isGoogleAuthEnabled,
}: AccountActionsProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setIsLoggingOut(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to sign out.");
      }

      setMessage(payload.message ?? "Signed out.");
      router.replace("/login");
      router.refresh();
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to sign out.",
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function deleteAccount() {
    if (confirmText !== "DELETE") {
      setError('Type "DELETE" to confirm account deletion.');
      return;
    }

    setIsDeleting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Failed to delete account.");
      }

      setMessage(payload.message ?? "Account deleted.");
      router.replace("/login");
      router.refresh();
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to delete account.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 border border-[var(--line)] bg-[var(--panel)] p-5">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">
        Session Actions
      </p>

      {isGoogleAuthEnabled ? (
        <button
          type="button"
          onClick={() => void logout()}
          disabled={isLoggingOut || isDeleting}
          className="border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm font-medium transition hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoggingOut ? "Signing out..." : "Sign out"}
        </button>
      ) : (
        <p className="text-sm text-[var(--ink-dim)]">
          Google sign-in is currently disabled for this deployment.
        </p>
      )}

      <div className="space-y-2 border-t border-[var(--line)] pt-4">
        <p className="text-sm font-medium">Delete account</p>
        <p className="text-xs text-[var(--ink-dim)]">
          This permanently removes your decks, reviews, progress, and sessions.
          This action cannot be undone.
        </p>
        {canDelete ? (
          <>
            <input
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder='Type "DELETE" to confirm'
              className="w-full max-w-xs border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
            />
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={isDeleting || isLoggingOut}
              className="border border-[rgba(170,45,35,0.45)] bg-[rgba(170,45,35,0.14)] px-4 py-2 text-sm font-semibold text-[rgb(120,32,25)] transition hover:bg-[rgba(170,45,35,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? "Deleting account..." : "Delete account permanently"}
            </button>
          </>
        ) : (
          <p className="text-xs text-[var(--ink-dim)]">
            Account deletion is unavailable for local fallback users.
          </p>
        )}
      </div>

      {message ? (
        <p className="text-sm text-[var(--ink-dim)]">{message}</p>
      ) : null}
      {error ? (
        <p className="border border-[rgba(170,45,35,0.4)] bg-[rgba(170,45,35,0.08)] px-3 py-2 text-sm text-[rgb(120,32,25)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
