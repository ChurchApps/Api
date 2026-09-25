import type express from "express";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

// Card-testing brake for the anonymous money endpoints. Counters share the membership loginAttempts table so every
// Lambda container sees them. Limits sit well above a real guest (addcard + charge = 2 attempts per gift).
export class DonationRateLimiter {
  static windowSeconds = 60 * 60;
  static maxPerIp = 60;
  static maxDeclinesPerIp = 15;
  static maxPerChurch = 600;

  // API Gateway appends the real source IP to any client-sent X-Forwarded-For, so only the last hop is trustworthy.
  static getClientIp(req: express.Request): string {
    const ctx: any = (req as any)?.apiGateway?.event?.requestContext ?? (req as any)?.requestContext;
    const sourceIp = ctx?.identity?.sourceIp || ctx?.http?.sourceIp;
    if (sourceIp) return sourceIp;
    const hops = String(req?.headers?.["x-forwarded-for"] || "").split(",").map((hop) => hop.trim()).filter(Boolean);
    return hops.length ? hops[hops.length - 1] : req?.socket?.remoteAddress || "";
  }

  private static ipKey(ip: string): string | null {
    const host = (ip || "").replace(/^::ffff:/i, "");
    if (!host || host === "::1" || host === "localhost" || host.startsWith("127.")) return null;
    return host.slice(0, 100);
  }

  /** Counts this attempt; false when the caller's IP or the church is over its hourly limit. Fails open. */
  static async allow(req: express.Request, churchId: string): Promise<boolean> {
    try {
      const repos = await RepoManager.getRepos<any>("membership");
      const ip = this.ipKey(this.getClientIp(req));
      const counted: { key: string; max: number }[] = [];
      if (ip) counted.push({ key: "give|ip|" + ip, max: this.maxPerIp });
      if (churchId) counted.push({ key: "give|church|" + String(churchId).slice(0, 50), max: this.maxPerChurch });
      const checked = ip ? [...counted, { key: "give|decline|" + ip, max: this.maxDeclinesPerIp }] : counted;
      for (const bucket of checked) {
        if ((await repos.loginAttempt.loadCount(bucket.key, this.windowSeconds)) >= bucket.max) return false;
      }
      for (const bucket of counted) await repos.loginAttempt.increment(bucket.key, this.windowSeconds);
      return true;
    } catch (e) {
      console.error("DonationRateLimiter.allow failed:", e);
      return true;
    }
  }

  static async recordDecline(req: express.Request): Promise<void> {
    try {
      const ip = this.ipKey(this.getClientIp(req));
      if (!ip) return;
      const repos = await RepoManager.getRepos<any>("membership");
      await repos.loginAttempt.increment("give|decline|" + ip, this.windowSeconds);
    } catch (e) {
      console.error("DonationRateLimiter.recordDecline failed:", e);
    }
  }
}
