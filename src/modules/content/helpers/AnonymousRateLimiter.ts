import type express from "express";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

export interface RateBucket { key: string; max: number }

// DB-backed (membership loginAttempts table) so the count survives across Lambda containers.
export class AnonymousRateLimiter {
  static windowSeconds = 60 * 60;

  // API Gateway appends the real source IP last, so the last X-Forwarded-For hop is the unforgeable one.
  static getClientIp(req: express.Request): string {
    const ctx: any = (req as any)?.apiGateway?.event?.requestContext ?? (req as any)?.requestContext;
    const sourceIp = ctx?.identity?.sourceIp || ctx?.http?.sourceIp;
    if (sourceIp) return sourceIp;
    const hops = ((req?.headers?.["x-forwarded-for"] as string) || "").split(",").map((h) => h.trim()).filter((h) => h.length > 0);
    if (hops.length > 0) return hops[hops.length - 1];
    return req?.socket?.remoteAddress || "";
  }

  static isLoopback(ip: string): boolean {
    const host = (ip || "").replace(/^::ffff:/i, "").split("%")[0];
    return !host || host === "127.0.0.1" || host === "::1" || host === "localhost" || host.startsWith("127.");
  }

  static ipBucket(req: express.Request, scope: string, max: number): RateBucket | null {
    const ip = this.getClientIp(req);
    if (this.isLoopback(ip)) return null;
    return { key: `${scope}:ip|${ip.slice(0, 120)}`, max };
  }

  static keyBucket(scope: string, value: string, max: number): RateBucket | null {
    const v = (value || "").trim().toLowerCase();
    if (!v) return null;
    return { key: `${scope}:key|${v.slice(0, 120)}`, max };
  }

  /** Counts this request against every bucket; false when any bucket was already full. Fails open. */
  static async consume(buckets: (RateBucket | null)[], windowSeconds: number = this.windowSeconds): Promise<boolean> {
    const active = buckets.filter((b): b is RateBucket => !!b);
    if (active.length === 0) return true;
    try {
      const repo = (await RepoManager.getRepos<any>("membership")).loginAttempt;
      for (const b of active) {
        if (await repo.loadCount(b.key, windowSeconds) >= b.max) return false;
      }
      for (const b of active) await repo.increment(b.key, windowSeconds);
      return true;
    } catch (e) {
      console.error("AnonymousRateLimiter.consume failed:", e);
      return true;
    }
  }
}
