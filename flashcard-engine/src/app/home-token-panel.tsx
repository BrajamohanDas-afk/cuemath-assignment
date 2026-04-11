"use client";

import { useEffect, useState } from "react";
import { apiFetch, getStoredApiToken, setStoredApiToken } from "@/lib/api-access";

type ConfigPayload = {
  config?: {
    apiTokenRequired?: boolean;
  };
};

export function HomeTokenPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRequired, setIsRequired] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadConfig() {
      const savedToken = getStoredApiToken();
      if (isMounted) {
        setTokenInput(savedToken ?? "");
      }

      try {
        const response = await fetch("/api/config");
        const payload = (await response.json()) as ConfigPayload;
        if (!response.ok) {
          throw new Error("Failed to load runtime config.");
        }

        if (isMounted) {
          setIsRequired(Boolean(payload.config?.apiTokenRequired));
        }
      } catch {
        if (isMounted) {
          setIsRequired(false);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  async function saveToken() {
    const normalized = tokenInput.trim();
    if (normalized.length === 0) {
      setStoredApiToken(null);
      setMessage("Cleared saved API token.");
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setStoredApiToken(normalized);

    try {
      const response = await apiFetch("/api/decks?view=review");
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Token validation failed.");
      }
      setMessage("Token saved. Protected API calls are now enabled in the UI.");
    } catch (error) {
      setStoredApiToken(null);
      setMessage(
        error instanceof Error
          ? `Token rejected: ${error.message}`
          : "Token rejected.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !isRequired) {
    return null;
  }

  return (
    <div className="mt-8 max-w-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--accent)]">
        API Token Required
      </p>
      <p className="mt-2 text-sm text-[var(--ink-dim)]">
        This deployment requires a token for decks/review APIs. Save it once to
        enable upload, review, and deck actions in this browser.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={tokenInput}
          onChange={(event) => setTokenInput(event.target.value)}
          placeholder="Enter APP_API_TOKEN"
          className="min-w-[220px] flex-1 border border-[var(--line)] bg-[rgba(255,255,255,0.72)] px-3 py-2 text-sm outline-none transition focus:border-[var(--ink)]"
        />
        <button
          type="button"
          onClick={() => void saveToken()}
          disabled={isSaving}
          className="border border-[var(--ink)] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Saving..." : "Save token"}
        </button>
      </div>
      {message ? (
        <p className="mt-2 text-xs text-[var(--ink-dim)]">{message}</p>
      ) : null}
    </div>
  );
}
