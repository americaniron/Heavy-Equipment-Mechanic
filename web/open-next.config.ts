import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext Cloudflare config. Default cache + ISR settings; we don't
 * need KV-backed incremental cache for the foundation slice. Add an
 * incrementalCache adapter (KV or R2) if/when ISR pages land.
 */
export default defineCloudflareConfig({});
