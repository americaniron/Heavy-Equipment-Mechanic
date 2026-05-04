import { Webhook, type WebhookRequiredHeaders } from "svix";
import type { Env } from "../env";
import { log } from "./log";

/**
 * Clerk webhooks are signed with Svix HMAC. Verification MUST happen on the
 * raw request body BEFORE JSON parsing — any pre-parse mutation invalidates
 * the signature.
 *
 * Returns the parsed event payload on success, or null on signature failure
 * / missing headers. Caller decides the HTTP response.
 */
export interface ClerkWebhookEvent {
  type: string;
  data: Record<string, unknown>;
  object: "event";
}

export async function verifyClerkWebhook(
  request: Request,
  env: Env,
): Promise<ClerkWebhookEvent | null> {
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    log.warn("clerk_webhook_missing_headers");
    return null;
  }
  if (!env.CLERK_WEBHOOK_SECRET) {
    log.error("clerk_webhook_secret_unset");
    return null;
  }

  const rawBody = await request.text();
  const headers: WebhookRequiredHeaders = {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  };

  try {
    const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
    return wh.verify(rawBody, headers) as ClerkWebhookEvent;
  } catch (e) {
    log.warn("clerk_webhook_signature_invalid", {
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
