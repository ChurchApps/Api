import type express from "express";
import type { Repos } from "../repositories/Repos.js";

/**
 * Throttles failed credential checks (login / verifyCredentials).
 *
 * Counters live in the `loginAttempts` table, not in process memory: the API is deployed as a
 * Lambda, so an in-memory Map is per-container and an attacker spread across warm containers
 * would barely be counted at all.
 *
 * Two buckets are checked:
 *  - account: the email (or authGuid) being attacked. Not attacker-controlled, so this is the
 *    bucket that actually bounds a brute-force run against one account.
 *  - ip: broad protection against one source spraying many accounts. Only as trustworthy as
 *    `getClientIp` below, hence the much looser limit.
 *
 * A successful login clears the account bucket so a legitimate user who eventually gets their
 * password right is not left throttled. The ip bucket deliberately survives, otherwise anyone
 * holding one valid account could reset it between sprays.
 */
export class LoginRateLimiter {
  static windowSeconds = 15 * 60;
  static maxPerAccount = 10;
  static maxPerIp = 50;

  /**
   * The client IP as observed by infrastructure the caller cannot forge.
   *
   * API Gateway puts the connection's source IP in requestContext, and appends it to any
   * client-supplied X-Forwarded-For — so the *last* hop is the trustworthy one. (AuditLogHelper
   * reads the first hop, which is fine for a log line but would let an attacker reset this
   * counter on every request by sending their own X-Forwarded-For.)
   */
  public static getClientIp(req: express.Request): string {
    const ctx: any = (req as any)?.apiGateway?.event?.requestContext ?? (req as any)?.requestContext;
    const sourceIp = ctx?.identity?.sourceIp || ctx?.http?.sourceIp;
    if (sourceIp) return sourceIp;

    const hops = ((req?.headers?.["x-forwarded-for"] as string) || "")
      .split(",")
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0);
    if (hops.length > 0) return hops[hops.length - 1];

    return req?.socket?.remoteAddress || "";
  }

  /** The buckets that apply to one attempt, each with its own ceiling. */
  private static buckets(ip: string, account: string): { key: string; max: number }[] {
    const result: { key: string; max: number }[] = [];
    if (account) result.push({ key: "account|" + account.slice(0, 150), max: this.maxPerAccount });
    if (ip) result.push({ key: "ip|" + ip.slice(0, 150), max: this.maxPerIp });
    return result;
  }

  /** False when either bucket is over its limit. Fails open — a DB outage must not lock everyone out. */
  public static async allow(repos: Repos, ip: string, account: string): Promise<boolean> {
    try {
      for (const bucket of this.buckets(ip, account)) {
        const count = await repos.loginAttempt.loadCount(bucket.key, this.windowSeconds);
        if (count >= bucket.max) return false;
      }
      return true;
    } catch (e) {
      console.error("LoginRateLimiter.allow failed:", e);
      return true;
    }
  }

  public static async recordFailure(repos: Repos, ip: string, account: string): Promise<void> {
    try {
      for (const bucket of this.buckets(ip, account)) await repos.loginAttempt.increment(bucket.key, this.windowSeconds);
    } catch (e) {
      console.error("LoginRateLimiter.recordFailure failed:", e);
    }
  }

  /** Clears the account bucket only; see the note above on why the ip bucket is left alone. */
  public static async clearFailures(repos: Repos, account: string): Promise<void> {
    try {
      await repos.loginAttempt.clear(this.buckets("", account).map((bucket) => bucket.key));
    } catch (e) {
      console.error("LoginRateLimiter.clearFailures failed:", e);
    }
  }
}
