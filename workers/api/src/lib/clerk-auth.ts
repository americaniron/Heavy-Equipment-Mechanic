import { createClerkClient, verifyToken } from "@clerk/backend";
import type { Env } from "../env";
import { log } from "./log";

/**
 * Verifies a Clerk session JWT from the Authorization header.
 * Returns the userId (Clerk's user_id) on success, null on failure.
 *
 * Used by Hono middleware to attach `userId` to the request context so
 * downstream handlers (and requireTier()) know who the request is from.
 */
export async function verifyClerkJwt(
  authHeader: string | null,
  env: Env,
): Promise<{ userId: string; sessionId?: string } | null> {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m || !m[1]) return null;
  const token = m[1];

  if (!env.CLERK_SECRET_KEY) {
    log.error("clerk_secret_key_unset");
    return null;
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    });
    if (!payload.sub) return null;
    const extended = payload as { sid?: string; session_id?: string };
    const sessionId =
      typeof extended.sid === "string"
        ? extended.sid
        : typeof extended.session_id === "string"
          ? extended.session_id
          : undefined;
    return { userId: payload.sub, sessionId };
  } catch (e) {
    log.warn("clerk_jwt_invalid", {
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Lightweight Clerk REST client. Used to fetch the canonical user record
 * (e.g., primary email) when the JWT only carries the userId. Cached at
 * module scope per Worker isolate; cheap to construct.
 */
let _clerkClient: ReturnType<typeof createClerkClient> | null = null;
export function getClerkClient(env: Env) {
  if (!_clerkClient) {
    _clerkClient = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  }
  return _clerkClient;
}
