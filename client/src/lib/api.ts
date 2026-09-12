export const AUTH_TOKEN_KEY = "authToken";
export const AUTH_INVALIDATED_EVENT = "fixmyiron:auth-invalidated";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getStoredAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearStoredAuthToken(notify = true) {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (notify) window.dispatchEvent(new Event(AUTH_INVALIDATED_EVENT));
}

export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) return fallback;

  try {
    const payload = JSON.parse(text) as {
      error?: string | { message?: string; detail?: string };
      message?: string;
    };
    if (typeof payload.error === "string") return payload.error;
    if (payload.error?.message) return payload.error.message;
    if (payload.message) return payload.message;
  } catch {
    // Non-JSON API responses are still useful when they contain plain text.
  }

  return text.length <= 300 ? text : fallback;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { authenticated?: boolean; token?: string | null } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = options.token === undefined ? getStoredAuthToken() : options.token;

  if (options.authenticated && token) {
    headers.set("x-auth-token", token);
  }

  const response = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers,
  });

  if (options.authenticated && token && response.status === 401) {
    clearStoredAuthToken();
  }

  return response;
}

export async function expectJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    throw new ApiError(await apiErrorMessage(response, fallback), response.status);
  }
  return response.json() as Promise<T>;
}

export function safeInternalPath(value: string | null | undefined, fallback = "/portal"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\r\n\\]/.test(value)) {
    return fallback;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function trustedExternalUrl(value: unknown, allowedHosts: readonly string[]): string {
  if (typeof value !== "string") throw new Error("The service returned an invalid redirect.");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The service returned an invalid redirect.");
  }

  if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) {
    throw new Error("The service returned an untrusted redirect.");
  }
  return parsed.toString();
}

export async function downloadAuthenticatedFile(url: string, fallbackName: string): Promise<void> {
  const response = await apiFetch(url, {}, { authenticated: true });
  if (!response.ok) {
    throw new ApiError(await apiErrorMessage(response, "Download failed"), response.status);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const disposition = response.headers.get("content-disposition") || "";
  const headerName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = headerName || fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
