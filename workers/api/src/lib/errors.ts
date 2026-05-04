import type { Context } from "hono";

/**
 * Stable error codes returned to clients.
 * Add new codes here so the client side has a single source of truth.
 */
export const ErrorCode = {
  Unauthenticated: "UNAUTHENTICATED",
  Forbidden: "FORBIDDEN",
  TierRequired: "TIER_REQUIRED",
  NotFound: "NOT_FOUND",
  RateLimited: "RATE_LIMITED",
  BadRequest: "BAD_REQUEST",
  InvalidSignature: "INVALID_SIGNATURE",
  Upstream: "UPSTREAM_ERROR",
  Internal: "INTERNAL_ERROR",
} as const;
export type ErrorCodeT = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorBody {
  error: {
    code: ErrorCodeT;
    message: string;
    hint?: string;
  };
}

export function errorBody(
  code: ErrorCodeT,
  message: string,
  hint?: string,
): ErrorBody {
  const body: ErrorBody = { error: { code, message } };
  if (hint !== undefined) body.error.hint = hint;
  return body;
}

export type StatusCode = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502;

export function jsonError(
  c: Context,
  status: StatusCode,
  code: ErrorCodeT,
  message: string,
  hint?: string,
) {
  return c.json(errorBody(code, message, hint), status);
}
