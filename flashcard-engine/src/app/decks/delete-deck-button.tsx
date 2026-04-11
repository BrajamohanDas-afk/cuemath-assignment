"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-access";

type DeleteDeckButtonProps = {
  deckId: string;
  deckTitle: string;
};

export function DeleteDeckButton({ deckId, deckTitle }: DeleteDeckButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDeleteConfirm() {
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const response = await apiFetch("/api/decks", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deckId }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Failed to delete deck.");
      }

      router.refresh();
      setIsConfirming(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete deck.";
      setErrorMessage(message);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-1">
      {!isConfirming ? (
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsConfirming(true);
          }}
          disabled={isDeleting}
          className="border border-[rgba(170,45,35,0.4)] bg-[rgba(170,45,35,0.08)] px-3 py-1.5 text-xs font-medium text-[rgb(120,32,25)] transition hover:bg-[rgba(170,45,35,0.16)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Delete
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => void handleDeleteConfirm()}
            disabled={isDeleting}
            className="border border-[rgba(170,45,35,0.45)] bg-[rgba(170,45,35,0.14)] px-2 py-1 text-xs font-semibold text-[rgb(120,32,25)] transition hover:bg-[rgba(170,45,35,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
            title={`Delete deck "${deckTitle}"`}
          >
            {isDeleting ? "Deleting..." : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isDeleting) {
                setIsConfirming(false);
              }
            }}
            disabled={isDeleting}
            className="border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-2 py-1 text-xs font-medium text-[var(--ink-dim)] transition hover:border-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      )}
      {errorMessage ? (
        <p className="max-w-[180px] text-[11px] text-[rgb(120,32,25)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
