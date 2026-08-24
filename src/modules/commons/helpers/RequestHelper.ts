import * as crypto from "crypto";

/** Truncated hash of the caller's IP — the dedupe key for anonymous sing/download counters. */
export function ipHash(req: { headers: Record<string, any>; socket?: { remoteAddress?: string } }): string {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}
