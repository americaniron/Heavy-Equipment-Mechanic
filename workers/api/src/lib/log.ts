/**
 * Single structured logger. JSON lines so Cloudflare's log explorer can index.
 * No PII in logs. No secret values in logs.
 */
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogFields {
  msg: string;
  requestId?: string;
  userId?: string;
  route?: string;
  status?: number;
  ms?: number;
  err?: string;
  [k: string]: unknown;
}

function emit(level: LogLevel, fields: LogFields): void {
  const entry = { level, t: new Date().toISOString(), ...fields };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields: Omit<LogFields, "msg"> = {}): void =>
    emit("debug", { msg, ...fields }),
  info: (msg: string, fields: Omit<LogFields, "msg"> = {}): void =>
    emit("info", { msg, ...fields }),
  warn: (msg: string, fields: Omit<LogFields, "msg"> = {}): void =>
    emit("warn", { msg, ...fields }),
  error: (msg: string, fields: Omit<LogFields, "msg"> = {}): void =>
    emit("error", { msg, ...fields }),
};

/** Crockford-style request id; collision-resistant enough for tracing. */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
