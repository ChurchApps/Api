import * as crypto from "crypto";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

/** Truncated hash of the caller's IP — the dedupe key for anonymous sing/download counters. */
export function ipHash(req: { headers: Record<string, any>; socket?: { remoteAddress?: string } }): string {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

// API Gateway appends the real source IP last, so the last X-Forwarded-For hop is the unforgeable one.
export function clientIp(req: any): string {
  const ctx: any = req?.apiGateway?.event?.requestContext ?? req?.requestContext;
  const sourceIp = ctx?.identity?.sourceIp || ctx?.http?.sourceIp;
  if (sourceIp) return sourceIp;
  const hops = String(req?.headers?.["x-forwarded-for"] || "").split(",").map((h) => h.trim()).filter((h) => h.length > 0);
  if (hops.length > 0) return hops[hops.length - 1];
  return req?.socket?.remoteAddress || "";
}

/** DB-backed (membership loginAttempts) so the count holds across Lambda containers. False when any bucket is full; fails open. */
export async function consumeRateLimit(buckets: { key: string; max: number }[], windowSeconds: number): Promise<boolean> {
  const active = buckets.filter((b) => b.key);
  if (active.length === 0) return true;
  try {
    const repo = (await RepoManager.getRepos<any>("membership")).loginAttempt;
    for (const b of active) if (await repo.loadCount(b.key, windowSeconds) >= b.max) return false;
    for (const b of active) await repo.increment(b.key, windowSeconds);
    return true;
  } catch (e) {
    console.error("consumeRateLimit failed:", e);
    return true;
  }
}
