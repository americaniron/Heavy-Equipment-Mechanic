/**
 * Browser-side API client. Wraps fetch and attaches the Clerk session
 * JWT as a Bearer token. Use the hook below from React components; for
 * non-React (e.g., loaders) call apiFetch directly with a token.
 */
import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import { publicEnv } from "@/lib/env";
import type { ApiError } from "@/lib/types";

export class ApiCallError extends Error {
  readonly status: number;
  readonly code: string;
  readonly hint: string | undefined;
  constructor(status: number, body: ApiError | { error?: undefined }) {
    const e =
      "error" in body && body.error
        ? body.error
        : { code: "INTERNAL_ERROR", message: `HTTP ${status}` };
    super(e.message);
    this.name = "ApiCallError";
    this.status = status;
    this.code = e.code;
    this.hint = "hint" in e ? e.hint : undefined;
  }
}

export async function apiFetch<T>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  const url = path.startsWith("http") ? path : `${publicEnv.apiUrl}${path}`;
  const res = await fetch(url, { ...init, headers });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) throw new ApiCallError(res.status, body as ApiError);
  return body as T;
}

/**
 * React hook returning a stable `call` fn that injects the current
 * Clerk session token. Re-renders only when Clerk's auth state changes.
 */
export function useApi() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const call = useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = isSignedIn ? await getToken() : null;
      return apiFetch<T>(path, token, init);
    },
    [getToken, isSignedIn],
  );
  return { call, ready: isLoaded };
}
