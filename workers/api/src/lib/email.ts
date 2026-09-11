import type { Context } from "hono";
import type { Env, Variables } from "../env";
import { log } from "./log";

export async function sendTransactionalEmail(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  args: { to: string; subject: string; html: string; text: string },
): Promise<boolean> {
  const from = c.env.RESEND_FROM_EMAIL || "FixMyIron <noreply@mail.fixmyiron.com>";
  if (c.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    if (!response.ok) {
      log.error("resend_email_send_failed", { status: response.status });
      return false;
    }
    return true;
  }
  if (c.env.EMAIL) {
    try {
      await c.env.EMAIL.send({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      });
      return true;
    } catch (err) {
      log.error("cloudflare_email_send_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return false;
}

export function sixDigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
