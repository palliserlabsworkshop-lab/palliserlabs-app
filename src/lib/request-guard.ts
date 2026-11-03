import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * True only when a state-changing request (POST) comes from this site's own pages. Blocks other
 * websites from making a signed-in visitor's browser post on their behalf (CSRF).
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin";
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  } catch {
    return false;
  }
}

/** Checks "Authorization: Bearer <CRON_SECRET>" in constant time. */
export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Largest JSON body accepted by the portal's API routes (messages are capped at 2,000 characters). */
export const MAX_JSON_BYTES = 32 * 1024;

/**
 * Reads a JSON request body, refusing anything over `maxBytes` without reading it all into memory.
 * Returns undefined for oversized or malformed bodies.
 */
export async function readJson(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return undefined;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Notion page IDs: 32 hex characters, with or without dashes. Anything else is rejected before any lookup. */
export function isNotionPageId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(id.replace(/-/g, "")) && id.length <= 36;
}
