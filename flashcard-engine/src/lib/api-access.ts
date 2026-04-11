const TOKEN_STORAGE_KEY = "flashcard_engine_api_token";

export function getStoredApiToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  const token = value?.trim() ?? "";
  return token.length > 0 ? token : null;
}

export function setStoredApiToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = token?.trim() ?? "";
  if (normalized.length === 0) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(TOKEN_STORAGE_KEY, normalized);
}

export function applyApiTokenHeader(headersInit?: HeadersInit): Headers {
  const headers = new Headers(headersInit);
  const token = getStoredApiToken();
  if (token) {
    headers.set("x-api-token", token);
  }
  return headers;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = applyApiTokenHeader(init?.headers);
  return fetch(input, {
    ...init,
    headers,
  });
}
